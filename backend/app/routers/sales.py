from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from app.database import get_db
from app.models.sales import SalesOrder, Shipment, SOStatus, ShipmentStatus
from app.schemas.sales import SOCreate, SOOut, SOSummary, ShipmentCreate, ShipmentOut
from app.services.sales_service import (
    create_so, create_shipment, cancel_shipment, get_so_remaining
)

router = APIRouter(prefix="/sales", tags=["영업·출하"])


@router.post("/orders", response_model=SOOut)
def post_so(body: SOCreate, db: Session = Depends(get_db)):
    return create_so(db, **body.model_dump())


@router.get("/orders", response_model=list[SOOut])
def list_so(
    partner_id: str | None = None,
    status: SOStatus | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(SalesOrder)
    if partner_id:
        q = q.filter(SalesOrder.partner_id == partner_id)
    if status:
        q = q.filter(SalesOrder.status == status)
    return q.order_by(SalesOrder.due_date).all()


@router.get("/orders/{so_no}/summary", response_model=SOSummary)
def so_summary(so_no: str, db: Session = Depends(get_db)):
    so = db.get(SalesOrder, so_no)
    if not so:
        raise HTTPException(404)
    shipped = db.query(func.coalesce(func.sum(Shipment.qty), 0)).filter(
        Shipment.so_no == so_no, Shipment.status == ShipmentStatus.confirmed
    ).scalar()
    shipped = int(shipped)
    return SOSummary(
        so_no=so_no, part_no=so.part_no,
        order_qty=so.qty, shipped_qty=shipped,
        remaining_qty=so.qty - shipped, status=so.status,
    )


@router.get("/orders/remaining", response_model=list[dict])
def all_so_remaining(partner_id: str | None = None, db: Session = Depends(get_db)):
    """고객사별 미납잔량 전체"""
    q = db.query(SalesOrder).filter(
        SalesOrder.status.not_in([SOStatus.closed, SOStatus.cancelled])
    )
    if partner_id:
        q = q.filter(SalesOrder.partner_id == partner_id)
    result = []
    for so in q.all():
        rem = get_so_remaining(db, so.so_no)
        result.append({
            "so_no": so.so_no, "partner_id": so.partner_id,
            "part_no": so.part_no, "order_qty": so.qty,
            "remaining_qty": rem, "due_date": so.due_date,
            "status": so.status,
        })
    return result


@router.post("/shipments", response_model=ShipmentOut)
def post_shipment(body: ShipmentCreate, db: Session = Depends(get_db)):
    return create_shipment(db, **body.model_dump())


@router.post("/shipments/{sh_no}/cancel")
def cancel_sh(sh_no: str, db: Session = Depends(get_db)):
    return cancel_shipment(db, sh_no)


@router.get("/shipments", response_model=list[ShipmentOut])
def list_shipments(partner_id: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Shipment)
    if partner_id:
        q = q.join(SalesOrder).filter(SalesOrder.partner_id == partner_id)
    return q.order_by(Shipment.ship_date.desc()).all()
