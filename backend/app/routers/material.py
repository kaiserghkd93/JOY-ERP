"""자재 직접구매 — 원자재/부자재 발주·입고 (외주포털 없이 내부 처리)"""
from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.auth import User
from app.models.purchase import PurchaseOrder, POStatus, Receipt, ReceiptStatus
from app.models.master import Partner, Item
from app.routers.auth import get_current_user
from app.services.doc_no import next_doc_no
from app.services.ledger_service import confirm_receipt as _confirm, get_stock, get_avg_price

router = APIRouter(prefix="/material", tags=["자재구매"])

MAT_ROLES = {"admin", "material", "manager", "executive", "manufacturing"}


def _require_mat(user: User = Depends(get_current_user)) -> User:
    if user.role not in MAT_ROLES:
        raise HTTPException(403, "자재구매 권한이 없습니다")
    return user


# ── 스키마 ────────────────────────────────────────────────────────
class MatPOCreateReq(BaseModel):
    partner_id: str
    lines: list[dict]        # [{part_no, qty, unit_price, due_date}]
    order_date: date_type
    note: str | None = None


class MatReceiptReq(BaseModel):
    po_no: str
    part_no: str
    qty: int
    unit_price: float
    receipt_date: date_type
    note: str | None = None


# ── 발주 목록 ──────────────────────────────────────────────────────
@router.get("/orders")
def list_mat_orders(
    partner_id: str | None = None,
    part_no: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mat),
):
    q = db.query(PurchaseOrder).filter(PurchaseOrder.po_type == "material")
    if partner_id:
        q = q.filter(PurchaseOrder.partner_id == partner_id)
    if part_no:
        q = q.filter(PurchaseOrder.part_no == part_no)
    if status:
        q = q.filter(PurchaseOrder.status == status)
    orders = q.order_by(PurchaseOrder.order_date.desc()).all()
    result = []
    for po in orders:
        item = db.get(Item, po.part_no)
        confirmed_qty = sum(r.qty for r in po.receipts if r.status == ReceiptStatus.confirmed)
        result.append({
            "po_no": po.po_no,
            "partner_id": po.partner_id,
            "partner_name": db.get(Partner, po.partner_id).name if db.get(Partner, po.partner_id) else po.partner_id,
            "part_no": po.part_no,
            "item_name": item.name if item else po.part_no,
            "item_unit": item.unit if item else "EA",
            "qty": po.qty,
            "confirmed_qty": confirmed_qty,
            "remaining_qty": po.qty - confirmed_qty,
            "unit_price": float(po.unit_price or 0),
            "order_date": str(po.order_date),
            "due_date": str(po.due_date),
            "status": po.status,
            "note": po.note,
        })
    return result


# ── 발주 생성 ──────────────────────────────────────────────────────
@router.post("/orders")
def create_mat_order(
    body: MatPOCreateReq,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mat),
):
    if not db.get(Partner, body.partner_id):
        raise HTTPException(404, f"거래처 없음: {body.partner_id}")
    created = []
    for line in body.lines:
        part_no = line.get("part_no")
        if not db.get(Item, part_no):
            raise HTTPException(404, f"품목 없음: {part_no}")
        qty = int(line.get("qty", 0))
        if qty <= 0:
            raise HTTPException(400, "수량은 0보다 커야 합니다")
        due_date = date_type.fromisoformat(str(line.get("due_date", body.order_date)))
        po_no = next_doc_no(db, "MPO", "purchase_order", "po_no")
        po = PurchaseOrder(
            po_no=po_no,
            partner_id=body.partner_id,
            part_no=part_no,
            qty=qty,
            unit_price=float(line.get("unit_price", 0) or 0),
            order_date=body.order_date,
            due_date=due_date,
            po_type="material",
            note=body.note,
        )
        db.add(po)
        db.flush()
        created.append(po_no)
    db.commit()
    return {"ok": True, "po_nos": created}


# ── 자재 입고 목록 ────────────────────────────────────────────────
@router.get("/receipts")
def list_mat_receipts(
    partner_id: str | None = None,
    part_no: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mat),
):
    mat_po_nos = {
        po.po_no for po in db.query(PurchaseOrder).filter(PurchaseOrder.po_type == "material").all()
    }
    q = db.query(Receipt).filter(Receipt.po_no.in_(mat_po_nos))
    if partner_id:
        q = q.filter(Receipt.partner_id == partner_id)
    if part_no:
        q = q.filter(Receipt.part_no == part_no)
    if status:
        q = q.filter(Receipt.status == status)
    receipts = q.order_by(Receipt.receipt_date.desc()).all()
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
            "partner_id": r.partner_id,
            "note": r.note,
        })
    return result


# ── 자재 입고 등록 (직접, pending 없이 바로 confirmed) ──────────────
@router.post("/receive")
def receive_material(
    body: MatReceiptReq,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mat),
):
    po = db.get(PurchaseOrder, body.po_no)
    if not po:
        raise HTTPException(404, f"발주 없음: {body.po_no}")
    if po.po_type != "material":
        raise HTTPException(400, "자재 발주가 아닙니다")
    if po.status not in [POStatus.open, POStatus.partial]:
        raise HTTPException(400, "이미 완료/취소된 발주입니다")
    if body.qty <= 0:
        raise HTTPException(400, "입고수량은 0보다 커야 합니다")

    gr_no = next_doc_no(db, "MGR", "receipt", "gr_no")
    receipt = Receipt(
        gr_no=gr_no,
        po_no=body.po_no,
        part_no=body.part_no,
        qty=body.qty,
        receipt_date=body.receipt_date,
        unit_price=body.unit_price,
        status=ReceiptStatus.pending,  # 품질검사 후 confirm (또는 즉시 confirm)
        partner_id=po.partner_id,
        note=body.note or "자재 직접입고",
    )
    db.add(receipt)
    db.flush()

    # 자재는 수입검사 생략 가능 → 즉시 확정
    _confirm(db, gr_no)
    _update_po_status(db, po)
    db.commit()
    return {"ok": True, "gr_no": gr_no, "status": "confirmed"}


def _update_po_status(db: Session, po: PurchaseOrder) -> None:
    from app.services.purchase_service import _update_po_status as _ups
    _ups(db, po)


# ── 월별 매입 집계 ────────────────────────────────────────────────
@router.get("/summary")
def mat_summary(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mat),
):
    from sqlalchemy import extract
    mat_po_nos = {
        po.po_no for po in db.query(PurchaseOrder).filter(PurchaseOrder.po_type == "material").all()
    }
    receipts = (
        db.query(Receipt)
        .filter(
            Receipt.po_no.in_(mat_po_nos),
            Receipt.status == ReceiptStatus.confirmed,
            extract("year", Receipt.receipt_date) == year,
            extract("month", Receipt.receipt_date) == month,
        )
        .all()
    )
    by_partner: dict = {}
    total_amount = 0.0
    for r in receipts:
        amt = r.qty * float(r.unit_price)
        total_amount += amt
        pid = r.partner_id or "기타"
        if pid not in by_partner:
            partner = db.get(Partner, pid)
            by_partner[pid] = {
                "partner_id": pid,
                "partner_name": partner.name if partner else pid,
                "count": 0, "amount": 0.0,
            }
        by_partner[pid]["count"] += 1
        by_partner[pid]["amount"] += amt

    return {
        "year": year, "month": month,
        "total_receipts": len(receipts),
        "total_amount": total_amount,
        "by_partner": sorted(by_partner.values(), key=lambda x: -x["amount"]),
    }
