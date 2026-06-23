from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from app.database import get_db
from app.models.purchase import PurchaseOrder, Receipt, POStatus, ReceiptStatus
from app.schemas.purchase import POCreate, POOut, POSummary, ReceiptCreate, ReceiptOut
from app.services.purchase_service import (
    create_po, create_receipt, get_remaining_qty, get_po_summary
)

router = APIRouter(prefix="/purchase", tags=["구매·외주"])


@router.post("/orders", response_model=POOut)
def post_order(body: POCreate, db: Session = Depends(get_db)):
    return create_po(db, **body.model_dump())


@router.get("/orders", response_model=list[POOut])
def list_orders(
    partner_id: str | None = None,
    status: POStatus | None = None,
    due_from: date | None = None,
    due_to: date | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(PurchaseOrder)
    if partner_id:
        q = q.filter(PurchaseOrder.partner_id == partner_id)
    if status:
        q = q.filter(PurchaseOrder.status == status)
    if due_from:
        q = q.filter(PurchaseOrder.due_date >= due_from)
    if due_to:
        q = q.filter(PurchaseOrder.due_date <= due_to)
    return q.order_by(PurchaseOrder.due_date).all()


@router.get("/orders/{po_no}/summary", response_model=POSummary)
def po_summary(po_no: str, db: Session = Depends(get_db)):
    return get_po_summary(db, po_no)


@router.get("/orders/remaining", response_model=list[dict])
def all_remaining(partner_id: str | None = None, db: Session = Depends(get_db)):
    """외주처별 미입고잔량 전체 조회"""
    q = db.query(PurchaseOrder).filter(PurchaseOrder.status != POStatus.closed, PurchaseOrder.status != POStatus.cancelled)
    if partner_id:
        q = q.filter(PurchaseOrder.partner_id == partner_id)
    result = []
    for po in q.all():
        rem = get_remaining_qty(db, po.po_no)
        result.append({
            "po_no": po.po_no,
            "partner_id": po.partner_id,
            "part_no": po.part_no,
            "order_qty": po.qty,
            "remaining_qty": rem,
            "due_date": po.due_date,
            "status": po.status,
        })
    return result


@router.post("/receipts", response_model=ReceiptOut)
def post_receipt(body: ReceiptCreate, db: Session = Depends(get_db)):
    return create_receipt(db, **body.model_dump())


@router.get("/receipts", response_model=list[ReceiptOut])
def list_receipts(
    partner_id: str | None = None,
    part_no: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Receipt)
    if partner_id:
        q = q.join(PurchaseOrder).filter(PurchaseOrder.partner_id == partner_id)
    if part_no:
        q = q.filter(Receipt.part_no == part_no)
    return q.order_by(Receipt.receipt_date.desc()).all()


@router.get("/receipts/{gr_no}", response_model=ReceiptOut)
def get_receipt(gr_no: str, db: Session = Depends(get_db)):
    from fastapi import HTTPException
    r = db.get(Receipt, gr_no)
    if not r:
        raise HTTPException(404)
    return r
