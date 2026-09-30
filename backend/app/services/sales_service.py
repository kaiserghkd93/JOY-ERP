from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.sales import SalesOrder, Shipment, SOStatus, ShipmentStatus
from app.models.master import Item, Partner
from app.models.ledger import LedgerType
from app.services.doc_no import next_doc_no
from app.services.ledger_service import post_ledger, get_stock, get_avg_price
from fastapi import HTTPException

# 외주 생산 SPARE PART — 출하 시 80원으로 자동 입고 처리
OUTSOURCED_SPARE = {
    'GC3-AS-0065','GC3-AS-0066','GC3-AS-0067',
    'GP1-AS-0001','GP1-AS-0002',
    'GP2-AS-0058','GP2-AS-0059',
}
OUTSOURCED_UNIT_PRICE = 80.0


def create_so(
    db: Session,
    partner_id: str,
    part_no: str,
    qty: int,
    order_date: date,
    due_date: date,
    note: str | None = None,
) -> SalesOrder:
    if not db.get(Partner, partner_id):
        raise HTTPException(404, f"거래처 없음: {partner_id}")
    if not db.get(Item, part_no):
        raise HTTPException(404, f"품목 없음: {part_no}")
    so_no = next_doc_no(db, "SO", "sales_order", "so_no")
    so = SalesOrder(
        so_no=so_no, partner_id=partner_id, part_no=part_no,
        qty=qty, order_date=order_date, due_date=due_date, note=note,
    )
    db.add(so)
    db.commit()
    db.refresh(so)
    return so


def create_shipment(
    db: Session,
    so_no: str,
    qty: int,
    ship_date: date,
    unit_price: float,
    note: str | None = None,
) -> Shipment:
    so = db.get(SalesOrder, so_no)
    if not so:
        raise HTTPException(404, f"수주 없음: {so_no}")
    if so.status == SOStatus.cancelled:
        raise HTTPException(400, "취소 수주에는 출하 불가")

    remaining = get_so_remaining(db, so_no)

    current_stock = get_stock(db, so.part_no)
    # 재고 부족 시 경고하지 않고 허용 (마이너스 재고 허용)

    sh_no = next_doc_no(db, "SH", "shipment", "sh_no")
    sh = Shipment(
        sh_no=sh_no, so_no=so_no, part_no=so.part_no,
        qty=qty, ship_date=ship_date, unit_price=unit_price,
        status=ShipmentStatus.confirmed, note=note,
    )
    db.add(sh)
    db.flush()

    # 외주 SPARE PART: 출하 전 80원으로 자동 입고 처리
    if so.part_no in OUTSOURCED_SPARE:
        post_ledger(
            db, so.part_no, ship_date,
            LedgerType.receipt, +qty, OUTSOURCED_UNIT_PRICE,
            ref_type="OUT-IN", ref_no=sh_no, note=f"외주입고(포장비 {OUTSOURCED_UNIT_PRICE:.0f}원)",
        )

    avg = get_avg_price(db, so.part_no)
    post_ledger(
        db, so.part_no, ship_date,
        LedgerType.shipment, -qty, avg,
        ref_type="SH", ref_no=sh_no, note="출하확정",
    )
    _update_so_status(db, so)
    db.commit()
    db.refresh(sh)
    return sh


def cancel_shipment(db: Session, sh_no: str) -> dict:
    """출하 취소 → 취소전표(+) 추가. 원본 삭제 금지."""
    sh = db.get(Shipment, sh_no)
    if not sh:
        raise HTTPException(404, f"출하 없음: {sh_no}")
    if sh.status == ShipmentStatus.cancelled:
        raise HTTPException(400, "이미 취소된 출하")

    sh.status = ShipmentStatus.cancelled
    db.flush()
    avg = get_avg_price(db, sh.part_no)
    post_ledger(
        db, sh.part_no, sh.ship_date,
        LedgerType.cancel, +sh.qty, avg,
        ref_type="CANCEL", ref_no=sh_no, note="출하취소전표",
    )
    # 외주 SPARE PART: 자동 입고분도 함께 취소
    if sh.part_no in OUTSOURCED_SPARE:
        post_ledger(
            db, sh.part_no, sh.ship_date,
            LedgerType.cancel, -sh.qty, OUTSOURCED_UNIT_PRICE,
            ref_type="CANCEL", ref_no=sh_no, note="외주입고취소(출하취소)",
        )
    so = db.get(SalesOrder, sh.so_no)
    if so:
        _update_so_status(db, so)
    db.commit()
    return {"cancelled": sh_no}


def get_so_remaining(db: Session, so_no: str) -> int:
    so = db.get(SalesOrder, so_no)
    if not so:
        raise HTTPException(404)
    shipped = db.query(func.coalesce(func.sum(Shipment.qty), 0)).filter(
        Shipment.so_no == so_no,
        Shipment.status == ShipmentStatus.confirmed,
    ).scalar()
    return so.qty - int(shipped)


def _update_so_status(db: Session, so: SalesOrder):
    if so.status == SOStatus.cancelled:
        return
    confirmed_qty = db.query(func.coalesce(func.sum(Shipment.qty), 0)).filter(
        Shipment.so_no == so.so_no,
        Shipment.status == ShipmentStatus.confirmed,
    ).scalar()
    total = int(confirmed_qty)

    if total == 0:
        so.status = SOStatus.open
    elif total < so.qty:
        so.status = SOStatus.partial
    else:
        so.status = SOStatus.closed
