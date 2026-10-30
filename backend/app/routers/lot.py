"""LOT / 배치 역추적 — 입고 LOT → 소모 → 생산 → 출하"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.master import Item, Partner
from app.models.ledger import StockLedger, LedgerType
from app.models.purchase import Receipt, ReceiptStatus

router = APIRouter(prefix="/lot", tags=["LOT추적"])


@router.get("/search")
def search_lots(part_no: str | None = None, gr_no: str | None = None, db: Session = Depends(get_db)):
    """입고 LOT 목록 검색"""
    q = db.query(Receipt).filter(Receipt.status == ReceiptStatus.confirmed)
    if part_no:
        q = q.filter(Receipt.part_no == part_no)
    if gr_no:
        q = q.filter(Receipt.gr_no.ilike(f"%{gr_no}%"))
    receipts = q.order_by(Receipt.receipt_date.desc()).limit(100).all()

    item_map = {i.part_no: i.name for i in db.query(Item).all()}
    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}

    return [{
        "gr_no": r.gr_no,
        "part_no": r.part_no,
        "part_name": item_map.get(r.part_no, r.part_no),
        "receipt_date": r.receipt_date.isoformat() if r.receipt_date else None,
        "qty": r.qty,
        "unit_price": float(r.unit_price or 0),
        "partner": partner_map.get(r.partner_id, r.partner_id or "-"),
    } for r in receipts]


@router.get("/trace/{gr_no}")
def lot_trace(gr_no: str, db: Session = Depends(get_db)):
    """LOT 역추적: 입고 → 소모 → 생산 → 출하"""
    from app.models.production import ProductionOrder
    from app.models.sales import SalesOrder, Shipment, ShipmentStatus

    receipt = db.query(Receipt).filter(Receipt.gr_no == gr_no).first()
    if not receipt:
        raise HTTPException(404, f"입고 LOT 없음: {gr_no}")

    item_map = {i.part_no: i.name for i in db.query(Item).all()}
    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}

    # 소모 이력 (해당 품목, 입고일 이후)
    consumptions = db.query(StockLedger).filter(
        StockLedger.part_no == receipt.part_no,
        StockLedger.ledger_type == LedgerType.consumption,
        StockLedger.txn_date >= receipt.receipt_date,
    ).order_by(StockLedger.txn_date).limit(200).all()

    # 관련 작업지시 (소모 ref_no 기준)
    pord_nos = list({c.ref_no for c in consumptions if c.ref_no})
    orders = db.query(ProductionOrder).filter(ProductionOrder.pord_no.in_(pord_nos)).all() if pord_nos else []

    # 완제품 출하 이력 (작업지시에서 생산된 품목 출하)
    prod_part_nos = list({o.part_no for o in orders})
    shipments = []
    if prod_part_nos:
        ship_q = db.query(Shipment, SalesOrder.partner_id).join(
            SalesOrder, Shipment.so_no == SalesOrder.so_no
        ).filter(
            Shipment.part_no.in_(prod_part_nos),
            Shipment.status == ShipmentStatus.confirmed,
        ).order_by(Shipment.ship_date).all()
        for ship, pid in ship_q:
            shipments.append({
                "so_no": ship.so_no,
                "part_no": ship.part_no,
                "part_name": item_map.get(ship.part_no, ship.part_no),
                "ship_date": ship.ship_date.isoformat() if ship.ship_date else None,
                "qty": ship.qty,
                "customer": partner_map.get(pid, pid or "-"),
            })

    item = db.get(Item, receipt.part_no)
    return {
        "lot_no": gr_no,
        "receipt": {
            "gr_no": receipt.gr_no,
            "part_no": receipt.part_no,
            "part_name": item.name if item else receipt.part_no,
            "receipt_date": receipt.receipt_date.isoformat() if receipt.receipt_date else None,
            "qty": receipt.qty,
            "unit_price": float(receipt.unit_price or 0),
            "partner": partner_map.get(receipt.partner_id, receipt.partner_id or "-"),
        },
        "consumption": [{
            "txn_date": c.txn_date.isoformat(),
            "qty": c.qty,
            "ref_no": c.ref_no,
            "note": c.note or "",
        } for c in consumptions],
        "production": [{
            "pord_no": o.pord_no,
            "part_no": o.part_no,
            "part_name": item_map.get(o.part_no, o.part_no),
            "planned_qty": o.planned_qty,
            "actual_qty": o.actual_qty,
            "status": o.status.value if o.status else None,
            "plan_date": o.plan_date.isoformat() if o.plan_date else None,
            "complete_date": o.complete_date.isoformat() if o.complete_date else None,
        } for o in orders],
        "shipments": shipments,
    }
