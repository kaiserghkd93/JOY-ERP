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
    orders = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.partner_id == partner_id,
            PurchaseOrder.status.in_([POStatus.open, POStatus.partial]),
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


# ── 납품명세서 발행 ──────────────────────────────────────────────
class DeliveryLineReq(BaseModel):
    po_no: str
    qty: int
    unit_price: float | None = None  # 없으면 PO 단가 사용

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
        po = db.get(PurchaseOrder, line.po_no)
        if not po:
            raise HTTPException(404, f"발주번호 {line.po_no}를 찾을 수 없습니다")
        if po.partner_id != partner_id:
            raise HTTPException(403, f"접근 권한이 없는 발주번호입니다: {line.po_no}")
        if po.status not in [POStatus.open, POStatus.partial]:
            raise HTTPException(400, f"{line.po_no}는 이미 완료되었거나 취소된 발주입니다")
        if line.qty <= 0:
            raise HTTPException(400, "납품 수량은 0보다 커야 합니다")

        unit_price = line.unit_price if line.unit_price else float(po.unit_price or 0)

        gr_no = next_doc_no(db, "GR", "receipt", "gr_no")
        receipt = Receipt(
            gr_no=gr_no,
            po_no=line.po_no,
            part_no=po.part_no,
            qty=line.qty,
            receipt_date=body.delivery_date,
            unit_price=unit_price,
            status=ReceiptStatus.confirmed,
            partner_id=partner_id,
            note=f"업체포털 납품 {body.note or ''}".strip(),
        )
        db.add(receipt)
        db.flush()

        # 재고 입고 처리
        post_ledger(db, po.part_no, body.delivery_date, LedgerType.receipt,
                    line.qty, unit_price,
                    ref_type="GR", ref_no=gr_no,
                    note=f"업체납품 {partner_id}")

        # PO 상태 업데이트
        total_delivered = sum(
            r.qty for r in po.receipts if r.status == ReceiptStatus.confirmed
        ) + line.qty
        if total_delivered >= po.qty:
            po.status = POStatus.closed
        else:
            po.status = POStatus.partial

        created.append({"gr_no": gr_no, "po_no": line.po_no, "qty": line.qty})

    db.commit()
    return {"ok": True, "receipts": created}


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
