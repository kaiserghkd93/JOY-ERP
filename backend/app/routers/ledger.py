from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.ledger import StockLedger
from app.models.master import Item
from app.schemas.ledger import LedgerOut, StockSnapshot, AdjustRequest
from app.services.ledger_service import (
    confirm_receipt, cancel_receipt, adjust_stock,
    get_stock, get_avg_price,
)

router = APIRouter(prefix="/stock", tags=["재고"])


@router.post("/receipts/{gr_no}/confirm", response_model=LedgerOut)
def confirm(gr_no: str, db: Session = Depends(get_db)):
    entry = confirm_receipt(db, gr_no)
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/receipts/{gr_no}/cancel", response_model=LedgerOut)
def cancel(gr_no: str, db: Session = Depends(get_db)):
    entry = cancel_receipt(db, gr_no)
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/adjust", response_model=LedgerOut)
def adjust(body: AdjustRequest, db: Session = Depends(get_db)):
    entry = adjust_stock(db, body.part_no, body.delta, body.txn_date, body.note)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/snapshot", response_model=list[StockSnapshot])
def snapshot(db: Session = Depends(get_db)):
    """전 품목 현재고 스냅샷"""
    items = db.query(Item).filter(Item.active == True).all()
    result = []
    for item in items:
        stock = get_stock(db, item.part_no)
        avg = get_avg_price(db, item.part_no)
        result.append(StockSnapshot(
            part_no=item.part_no,
            name=item.name,
            current_stock=stock,
            avg_price=avg,
            stock_value=round(stock * avg, 2),
        ))
    return result


@router.get("/snapshot/{part_no}", response_model=StockSnapshot)
def snapshot_item(part_no: str, db: Session = Depends(get_db)):
    item = db.get(Item, part_no)
    if not item:
        raise HTTPException(404)
    stock = get_stock(db, part_no)
    avg = get_avg_price(db, part_no)
    return StockSnapshot(
        part_no=part_no, name=item.name,
        current_stock=stock, avg_price=avg,
        stock_value=round(stock * avg, 2),
    )


@router.get("/ledger/{part_no}", response_model=list[LedgerOut])
def ledger_history(part_no: str, db: Session = Depends(get_db)):
    return db.query(StockLedger).filter(
        StockLedger.part_no == part_no
    ).order_by(StockLedger.id).all()
