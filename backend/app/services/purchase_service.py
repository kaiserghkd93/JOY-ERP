from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.purchase import PurchaseOrder, Receipt, POStatus, ReceiptStatus
from app.models.master import Item, Partner
from app.services.doc_no import next_doc_no
from fastapi import HTTPException


def create_po(
    db: Session,
    partner_id: str,
    part_no: str,
    qty: int,
    order_date: date,
    due_date: date,
    note: str | None = None,
) -> PurchaseOrder:
    if not db.get(Partner, partner_id):
        raise HTTPException(404, f"거래처 없음: {partner_id}")
    if not db.get(Item, part_no):
        raise HTTPException(404, f"품목 없음: {part_no}")
    po_no = next_doc_no(db, "PO", "purchase_order", "po_no")
    po = PurchaseOrder(
        po_no=po_no, partner_id=partner_id, part_no=part_no,
        qty=qty, order_date=order_date, due_date=due_date, note=note,
    )
    db.add(po)
    db.commit()
    db.refresh(po)
    return po


def create_receipt(
    db: Session,
    po_no: str,
    qty: int,
    receipt_date: date,
    unit_price: float,
    note: str | None = None,
) -> Receipt:
    po = db.get(PurchaseOrder, po_no)
    if not po:
        raise HTTPException(404, f"발주 없음: {po_no}")
    if po.status == POStatus.cancelled:
        raise HTTPException(400, "취소된 발주에는 입고 불가")

    remaining = get_remaining_qty(db, po_no)

    gr_no = next_doc_no(db, "GR", "receipt", "gr_no")
    receipt = Receipt(
        gr_no=gr_no, po_no=po_no, part_no=po.part_no,
        qty=qty, receipt_date=receipt_date, unit_price=unit_price,
        status=ReceiptStatus.pending, note=note,
    )
    db.add(receipt)
    db.flush()  # receipt가 DB에 반영된 후 상태 계산
    _update_po_status(db, po)
    db.commit()
    db.refresh(receipt)
    return receipt


def get_remaining_qty(db: Session, po_no: str) -> int:
    po = db.get(PurchaseOrder, po_no)
    if not po:
        raise HTTPException(404, f"발주 없음: {po_no}")
    received = db.query(func.coalesce(func.sum(Receipt.qty), 0)).filter(
        Receipt.po_no == po_no,
        Receipt.status != ReceiptStatus.cancelled,
    ).scalar()
    return po.qty - int(received)


def update_po_status(db: Session, po: PurchaseOrder):
    return _update_po_status(db, po)


def _update_po_status(db: Session, po: PurchaseOrder):
    received = db.query(func.coalesce(func.sum(Receipt.qty), 0)).filter(
        Receipt.po_no == po.po_no,
        Receipt.status != ReceiptStatus.cancelled,
    ).scalar()
    total = int(received)
    if total == 0:
        po.status = POStatus.open
    elif total < po.qty:
        po.status = POStatus.partial
    else:
        po.status = POStatus.closed


def get_po_summary(db: Session, po_no: str) -> dict:
    po = db.get(PurchaseOrder, po_no)
    if not po:
        raise HTTPException(404, f"발주 없음: {po_no}")
    received = db.query(func.coalesce(func.sum(Receipt.qty), 0)).filter(
        Receipt.po_no == po_no,
        Receipt.status != ReceiptStatus.cancelled,
    ).scalar()
    received = int(received)
    return {
        "po_no": po_no,
        "part_no": po.part_no,
        "order_qty": po.qty,
        "received_qty": received,
        "remaining_qty": po.qty - received,
        "status": po.status,
    }
