"""AR 수금관리 — 고객 미수금 집계 / 수금 등록 / 에이징 분석"""
from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth import User, UserRole
from app.models.master import Partner, PartnerType
from app.models.sales import Invoice, InvoiceLine, InvoiceStatus, Payment, PaymentStatus, PaymentMethod
from app.routers.auth import get_current_user
from app.services.doc_no import next_doc_no

router = APIRouter(prefix="/receivable", tags=["수금관리"])


# ── 접근 권한: admin, accounting, purchase ──────────────────────────
def _require_ar(user: User = Depends(get_current_user)) -> User:
    if user.role not in (UserRole.admin, UserRole.accounting, UserRole.purchase):
        if hasattr(UserRole, 'owner') and user.role == UserRole.owner:
            return user
        raise HTTPException(403, "수금관리 권한이 없습니다 (경리·구매 전용)")
    return user


# ── 결제조건 → 만기일 계산 ──────────────────────────────────────────
def _calc_due_date(issue_date: date, payment_terms: str | None) -> date:
    if not payment_terms:
        return issue_date
    pt = payment_terms.strip()
    if pt == "즉시":
        return issue_date
    if pt == "당월말":
        return date(issue_date.year, issue_date.month,
                    monthrange(issue_date.year, issue_date.month)[1])
    if pt == "익월말":
        m, y = issue_date.month + 1, issue_date.year
        if m > 12: m, y = 1, y + 1
        return date(y, m, monthrange(y, m)[1])
    if pt == "익익월말":
        m, y = issue_date.month + 2, issue_date.year
        while m > 12: m, y = m - 12, y + 1
        return date(y, m, monthrange(y, m)[1])
    if "일" in pt:
        try:
            days = int("".join(c for c in pt if c.isdigit()))
            return issue_date + timedelta(days=days)
        except Exception:
            pass
    return issue_date


def _aging_bucket(due_date: date, today: date) -> str:
    diff = (today - due_date).days
    if diff < 0:
        return "미도래"
    if diff <= 30:
        return "0-30일"
    if diff <= 60:
        return "31-60일"
    if diff <= 90:
        return "61-90일"
    return "90일 초과"


def _inv_total(inv: Invoice) -> float:
    return sum(float(l.unit_price or 0) * (l.qty or 0) for l in inv.lines)


# ── 미수금 현황 (거래처별 에이징) ───────────────────────────────────
@router.get("/summary")
def get_summary(db: Session = Depends(get_db), _: User = Depends(_require_ar)):
    today = date.today()
    partners = db.query(Partner).filter(Partner.partner_type == PartnerType.customer).all()

    # 계산서 목록 (취소 제외)
    invoices = (
        db.query(Invoice)
        .filter(Invoice.status != InvoiceStatus.cancelled)
        .all()
    )
    inv_by_partner: dict[str, list[Invoice]] = {}
    for inv in invoices:
        inv_by_partner.setdefault(inv.partner_id, []).append(inv)

    # 수금 합계 (파트너별)
    pay_rows = (
        db.query(Payment.partner_id, func.sum(Payment.amount))
        .filter(Payment.status == PaymentStatus.normal)
        .group_by(Payment.partner_id)
        .all()
    )
    paid_by_partner: dict[str, float] = {r[0]: float(r[1] or 0) for r in pay_rows}

    result = []
    for p in partners:
        pid = p.partner_id
        invs = inv_by_partner.get(pid, [])
        total_invoiced = sum(_inv_total(i) for i in invs)
        total_paid     = paid_by_partner.get(pid, 0.0)
        outstanding    = total_invoiced - total_paid
        if total_invoiced == 0 and total_paid == 0:
            continue

        # 에이징 — 미결 계산서 기준
        buckets: dict[str, float] = {"미도래": 0, "0-30일": 0, "31-60일": 0, "61-90일": 0, "90일 초과": 0}
        remaining_to_allocate = outstanding
        for inv in sorted(invs, key=lambda i: i.issue_date):
            amt = _inv_total(inv)
            if amt <= 0 or remaining_to_allocate <= 0:
                continue
            due = inv.due_date or _calc_due_date(inv.issue_date, p.payment_terms)
            bucket = _aging_bucket(due, today)
            alloc = min(amt, remaining_to_allocate)
            buckets[bucket] = buckets.get(bucket, 0) + alloc
            remaining_to_allocate -= alloc

        result.append({
            "partner_id":      pid,
            "partner_name":    p.name,
            "payment_terms":   p.payment_terms,
            "total_invoiced":  total_invoiced,
            "total_paid":      total_paid,
            "outstanding":     outstanding,
            "aging":           buckets,
        })

    result.sort(key=lambda x: x["outstanding"], reverse=True)
    return result


# ── 계산서 목록 (거래처별) ─────────────────────────────────────────
@router.get("/invoices")
def get_invoices(
    partner_id: Optional[str] = None,
    unpaid_only: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(_require_ar),
):
    today = date.today()
    q = db.query(Invoice).filter(Invoice.status != InvoiceStatus.cancelled)
    if partner_id:
        q = q.filter(Invoice.partner_id == partner_id)
    invs = q.order_by(Invoice.issue_date.desc()).all()

    # 파트너 맵
    partners = {p.partner_id: p for p in db.query(Partner).all()}

    # 수금액 (계산서별)
    pay_rows = (
        db.query(Payment.inv_no, func.sum(Payment.amount))
        .filter(Payment.status == PaymentStatus.normal, Payment.inv_no.isnot(None))
        .group_by(Payment.inv_no)
        .all()
    )
    paid_by_inv: dict[str, float] = {r[0]: float(r[1] or 0) for r in pay_rows}

    rows = []
    for inv in invs:
        amt = _inv_total(inv)
        paid = paid_by_inv.get(inv.inv_no, 0.0)
        outstanding = amt - paid
        if unpaid_only and outstanding <= 0:
            continue
        p = partners.get(inv.partner_id)
        due = inv.due_date or (
            _calc_due_date(inv.issue_date, p.payment_terms if p else None)
        )
        rows.append({
            "inv_no":        inv.inv_no,
            "partner_id":    inv.partner_id,
            "partner_name":  p.name if p else inv.partner_id,
            "issue_date":    str(inv.issue_date),
            "due_date":      str(due),
            "amount":        amt,
            "paid":          paid,
            "outstanding":   outstanding,
            "status":        inv.status,
            "overdue_days":  max(0, (today - due).days) if outstanding > 0 else 0,
            "aging_bucket":  _aging_bucket(due, today) if outstanding > 0 else "완납",
        })
    return rows


# ── 수금 목록 ──────────────────────────────────────────────────────
@router.get("/payments")
def get_payments(
    partner_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(_require_ar),
):
    q = db.query(Payment)
    if partner_id:
        q = q.filter(Payment.partner_id == partner_id)
    pays = q.order_by(Payment.pay_date.desc()).all()
    partners = {p.partner_id: p.name for p in db.query(Partner).all()}
    return [{
        "pay_no":       p.pay_no,
        "partner_id":   p.partner_id,
        "partner_name": partners.get(p.partner_id, p.partner_id),
        "pay_date":     str(p.pay_date),
        "amount":       float(p.amount),
        "method":       p.method,
        "inv_no":       p.inv_no,
        "note":         p.note,
        "status":       p.status,
        "created_by":   p.created_by,
        "created_at":   str(p.created_at)[:16],
    } for p in pays]


# ── 수금 등록 ──────────────────────────────────────────────────────
class PaymentCreate(BaseModel):
    partner_id: str
    pay_date:   date
    amount:     float
    method:     PaymentMethod = PaymentMethod.transfer
    inv_no:     Optional[str] = None
    note:       Optional[str] = None


@router.post("/payments", status_code=201)
def create_payment(
    body: PaymentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(_require_ar),
):
    if body.amount <= 0:
        raise HTTPException(400, "수금액은 0보다 커야 합니다")
    if not db.get(Partner, body.partner_id):
        raise HTTPException(404, "거래처를 찾을 수 없습니다")
    if body.inv_no and not db.get(Invoice, body.inv_no):
        raise HTTPException(404, "계산서 번호를 찾을 수 없습니다")

    pay_no = next_doc_no(db, "PAY", body.pay_date)
    pay = Payment(
        pay_no=pay_no,
        partner_id=body.partner_id,
        pay_date=body.pay_date,
        amount=body.amount,
        method=body.method,
        inv_no=body.inv_no,
        note=body.note,
        status=PaymentStatus.normal,
        created_by=user.username,
    )
    db.add(pay)
    db.commit()
    return {"pay_no": pay_no, "ok": True}


# ── 수금 취소 (삭제 아닌 취소전표 원칙) ───────────────────────────
@router.patch("/payments/{pay_no}/cancel")
def cancel_payment(
    pay_no: str,
    db: Session = Depends(get_db),
    _: User = Depends(_require_ar),
):
    pay = db.get(Payment, pay_no)
    if not pay:
        raise HTTPException(404, "수금 전표 없음")
    if pay.status == PaymentStatus.cancelled:
        raise HTTPException(400, "이미 취소된 전표입니다")
    pay.status = PaymentStatus.cancelled
    db.commit()
    return {"ok": True, "pay_no": pay_no}
