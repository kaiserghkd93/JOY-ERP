"""외주처 포털 — 업체가 접속해서 발주 확인 + 납품명세서 발행"""
from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.auth import User
from app.models.purchase import PurchaseOrder, POStatus, Receipt, ReceiptStatus
from app.models.master import Partner, Item
from app.models.ledger import LedgerType
from app.models.quality import NonConformance, NcrAppeal, AppealStatus
from app.models.production import Mold
from app.routers.auth import get_current_user
from app.services.doc_no import next_doc_no
from app.services.ledger_service import post_ledger

router = APIRouter(prefix="/portal", tags=["외주처 포털"])


def _supplier_partner(user: User) -> str:
    """로그인한 업체 계정의 partner_id 반환"""
    if not user.partner_id:
        raise HTTPException(403, "연결된 협력사가 없습니다. 관리자에게 문의하세요.")
    return user.partner_id


# ── 내 발주 목록 ────────────────────────────────────────────────
@router.get("/orders")
def my_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    partner_id = _supplier_partner(user)
    from datetime import date as date_cls
    cutoff = date_cls(2026, 10, 1)
    orders = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.partner_id == partner_id,
            PurchaseOrder.status.in_([POStatus.open, POStatus.partial]),
            PurchaseOrder.due_date >= cutoff,
            PurchaseOrder.po_type == "outsource",
        )
        .order_by(PurchaseOrder.due_date)
        .all()
    )
    result = []
    for po in orders:
        item = db.get(Item, po.part_no)
        delivered = sum(
            r.qty for r in po.receipts
            if r.status == ReceiptStatus.confirmed
        )
        result.append({
            "po_no": po.po_no,
            "part_no": po.part_no,
            "item_name": item.name if item else po.part_no,
            "item_unit": item.unit if item else "EA",
            "qty": po.qty,
            "delivered_qty": delivered,
            "remaining_qty": po.qty - delivered,
            "unit_price": float(po.unit_price or 0),
            "order_date": str(po.order_date),
            "due_date": str(po.due_date),
            "status": po.status,
            "note": po.note,
        })
    return result


# ── 내 업체 품목 목록 (자동완성용) ──────────────────────────────
@router.get("/my-items")
def my_items(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    partner_id = _supplier_partner(user)
    pos = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.partner_id == partner_id)
        .all()
    )
    seen = {}
    for po in pos:
        if po.part_no not in seen:
            item = db.get(Item, po.part_no)
            seen[po.part_no] = {
                "part_no": po.part_no,
                "item_name": item.name if item else po.part_no,
                "item_unit": item.unit if item else "EA",
                "unit_price": float(po.unit_price or 0),
            }
        else:
            # 최신 단가로 갱신
            if po.unit_price:
                seen[po.part_no]["unit_price"] = float(po.unit_price)
    return sorted(seen.values(), key=lambda x: x["item_name"])


# ── 납품명세서 발행 ──────────────────────────────────────────────
class DeliveryLineReq(BaseModel):
    po_no: str | None = None       # 발주 연결 납품
    item_name: str | None = None   # 발주 없는 직접 추가 품목명
    part_no: str | None = None
    item_unit: str | None = "EA"
    qty: int
    unit_price: float | None = None

class DeliveryReq(BaseModel):
    delivery_date: date_type
    lines: list[DeliveryLineReq]
    note: str | None = None


@router.post("/deliver")
def deliver(body: DeliveryReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    partner_id = _supplier_partner(user)
    if not body.lines:
        raise HTTPException(400, "납품 품목을 입력해주세요")

    created = []
    for line in body.lines:
        if line.qty <= 0:
            raise HTTPException(400, "납품 수량은 0보다 커야 합니다")

        if line.po_no:
            # 발주 연결 납품
            po = db.get(PurchaseOrder, line.po_no)
            if not po:
                raise HTTPException(404, f"발주번호 {line.po_no}를 찾을 수 없습니다")
            if po.partner_id != partner_id:
                raise HTTPException(403, f"접근 권한이 없는 발주번호입니다: {line.po_no}")
            if po.status not in [POStatus.open, POStatus.partial]:
                raise HTTPException(400, f"{line.po_no}는 이미 완료되었거나 취소된 발주입니다")
            actual_part_no = po.part_no
            unit_price = line.unit_price if line.unit_price else float(po.unit_price or 0)
        else:
            # 발주 없는 직접 추가 품목
            if not line.item_name:
                raise HTTPException(400, "발주 없는 품목은 품목명을 입력해주세요")
            actual_part_no = line.part_no or "MANUAL"
            unit_price = line.unit_price or 0
            po = None

        gr_no = next_doc_no(db, "GR", "receipt", "gr_no")
        note_text = f"업체포털 납품{' [직접추가]' if not line.po_no else ''} {body.note or ''}".strip()
        # 포털 납품 → pending(검사대기) 상태로 생성, 품질팀 컨펌 후 confirmed + 재고 반영
        receipt = Receipt(
            gr_no=gr_no,
            po_no=line.po_no,
            part_no=actual_part_no,
            qty=line.qty,
            receipt_date=body.delivery_date,
            unit_price=unit_price,
            status=ReceiptStatus.pending,
            partner_id=partner_id,
            note=note_text,
        )
        db.add(receipt)
        db.flush()

        created.append({
            "gr_no": gr_no,
            "po_no": line.po_no,
            "item_name": line.item_name if not line.po_no else None,
            "qty": line.qty,
        })

    db.commit()
    return {"ok": True, "receipts": created}


# ── 월별 납품 집계 ───────────────────────────────────────────────
@router.get("/monthly-summary")
def monthly_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from sqlalchemy import func, extract
    partner_id = _supplier_partner(user)
    receipts = (
        db.query(Receipt)
        .filter(Receipt.partner_id == partner_id, Receipt.status == ReceiptStatus.confirmed)
        .order_by(Receipt.receipt_date)
        .all()
    )
    # 월별 집계
    monthly: dict = {}
    for r in receipts:
        ym = str(r.receipt_date)[:7]  # YYYY-MM
        if ym not in monthly:
            monthly[ym] = {"month": ym, "count": 0, "total_qty": 0, "total_amount": 0, "items": {}}
        m = monthly[ym]
        m["count"] += 1
        m["total_qty"] += r.qty
        m["total_amount"] += r.qty * float(r.unit_price)
        item = db.get(Item, r.part_no)
        iname = item.name if item else (r.note or r.part_no)
        if iname not in m["items"]:
            m["items"][iname] = {"qty": 0, "amount": 0}
        m["items"][iname]["qty"] += r.qty
        m["items"][iname]["amount"] += r.qty * float(r.unit_price)

    result = []
    for ym in sorted((k for k in monthly.keys() if k >= "2026-10"), reverse=True):
        m = monthly[ym]
        result.append({
            "month": ym,
            "count": m["count"],
            "total_qty": m["total_qty"],
            "total_amount": m["total_amount"],
            "items": [
                {"item_name": k, "qty": v["qty"], "amount": v["amount"]}
                for k, v in sorted(m["items"].items())
            ],
        })
    return result


# ── 내 납품 이력 ────────────────────────────────────────────────
@router.get("/history")
def my_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    partner_id = _supplier_partner(user)
    receipts = (
        db.query(Receipt)
        .filter(Receipt.partner_id == partner_id)
        .order_by(Receipt.receipt_date.desc(), Receipt.gr_no.desc())
        .limit(200)
        .all()
    )
    result = []
    for r in receipts:
        item = db.get(Item, r.part_no)
        result.append({
            "gr_no": r.gr_no,
            "po_no": r.po_no,
            "part_no": r.part_no,
            "item_name": item.name if item else r.part_no,
            "qty": r.qty,
            "unit_price": float(r.unit_price),
            "amount": r.qty * float(r.unit_price),
            "receipt_date": str(r.receipt_date),
            "status": r.status,
            "note": r.note,
        })
    return result


# ── 부적합 통보 (포털용) ────────────────────────────────────────────

@router.get("/ncr")
def my_ncr(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """내 업체에 발송된 부적합 통보 목록"""
    partner_id = _supplier_partner(user)
    ncrs = (
        db.query(NonConformance)
        .filter(NonConformance.partner_id == partner_id)
        .order_by(NonConformance.created_at.desc())
        .limit(100)
        .all()
    )
    result = []
    for n in ncrs:
        item = db.get(Item, n.part_no)
        result.append({
            "ncr_no": n.ncr_no,
            "part_no": n.part_no,
            "item_name": item.name if item else n.part_no,
            "occur_type": n.occur_type,
            "defect_type": n.defect_type,
            "defect_qty": n.defect_qty,
            "disposal": n.disposal,
            "status": n.status,
            "notified_at": str(n.notified_at)[:16] if n.notified_at else None,
            "created_at": str(n.created_at)[:10],
            "appeal_count": len(n.appeals),
            "latest_appeal_status": n.appeals[-1].status if n.appeals else None,
        })
    return result


class PortalAppealBody(BaseModel):
    appeal_reason: str
    evidence_text: str | None = None


@router.post("/ncr/{ncr_no}/appeal")
def portal_appeal(ncr_no: str, body: PortalAppealBody,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """포털에서 이의신청 등록"""
    partner_id = _supplier_partner(user)
    ncr = db.get(NonConformance, ncr_no)
    if not ncr:
        raise HTTPException(404, "부적합통보를 찾을 수 없습니다")
    if ncr.partner_id != partner_id:
        raise HTTPException(403, "본인 업체의 부적합통보에만 이의신청 가능합니다")
    appeal = NcrAppeal(
        ncr_no=ncr_no,
        partner_id=partner_id,
        appeal_reason=body.appeal_reason,
        evidence_text=body.evidence_text,
        status=AppealStatus.submitted,
    )
    db.add(appeal)
    db.commit()
    db.refresh(appeal)
    return {"ok": True, "appeal_id": appeal.id, "status": appeal.status}


# ── 대여 금형 목록 ───────────────────────────────────────────────
@router.get("/my-molds")
def my_molds(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    partner_id = _supplier_partner(user)
    molds = (
        db.query(Mold)
        .filter(Mold.lent_to_partner_id == partner_id)
        .all()
    )
    result = []
    for m in molds:
        item = db.get(Item, m.part_no) if m.part_no else None
        result.append({
            "mold_no": m.mold_no,
            "owner": m.owner,
            "part_no": m.part_no,
            "part_name": item.name if item else m.part_no,
            "lent_date": str(m.lent_date) if m.lent_date else None,
            "total_shots": m.total_shots,
            "status": m.status,
        })
    return result


class MoldRegisterReq(BaseModel):
    mold_no: str
    lent_date: date_type


@router.post("/my-molds/register")
def register_mold(body: MoldRegisterReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """협력사가 직접 대여 금형을 등록 — 해당 금형번호가 시스템에 없으면 자동 생성"""
    partner_id = _supplier_partner(user)
    mold = db.get(Mold, body.mold_no)
    if mold is None:
        mold = Mold(mold_no=body.mold_no, owner="JOY INDUSTRY")
        db.add(mold)
    elif mold.lent_to_partner_id and mold.lent_to_partner_id != partner_id:
        raise HTTPException(400, "이미 다른 협력사에 대여 중인 금형번호입니다.")
    mold.lent_to_partner_id = partner_id
    mold.lent_date = body.lent_date
    db.commit()
    return {"ok": True, "mold_no": mold.mold_no}


@router.delete("/my-molds/{mold_no}")
def return_mold(mold_no: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """협력사가 금형 반납 처리"""
    partner_id = _supplier_partner(user)
    mold = db.get(Mold, mold_no)
    if not mold or mold.lent_to_partner_id != partner_id:
        raise HTTPException(404, "해당 금형을 찾을 수 없습니다.")
    mold.lent_to_partner_id = None
    mold.lent_date = None
    db.commit()
    return {"ok": True}
