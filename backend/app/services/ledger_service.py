from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.ledger import StockLedger, LedgerType
from app.models.purchase import Receipt, ReceiptStatus
from fastapi import HTTPException


def post_ledger(
    db: Session,
    part_no: str,
    txn_date: date,
    ledger_type: LedgerType,
    qty: int,           # 부호 포함
    unit_price: float,
    ref_type: str | None = None,
    ref_no: str | None = None,
    note: str | None = None,
) -> StockLedger:
    entry = StockLedger(
        txn_date=txn_date,
        part_no=part_no,
        ledger_type=ledger_type,
        qty=qty,
        unit_price=unit_price,
        ref_type=ref_type,
        ref_no=ref_no,
        note=note,
    )
    db.add(entry)
    return entry


def get_stock(db: Session, part_no: str) -> int:
    result = db.query(func.coalesce(func.sum(StockLedger.qty), 0)).filter(
        StockLedger.part_no == part_no
    ).scalar()
    return int(result)


def get_avg_price(db: Session, part_no: str) -> float:
    """이동평균 단가 — 현재고 기준"""
    rows = db.query(StockLedger).filter(StockLedger.part_no == part_no).order_by(StockLedger.id).all()
    stock, total_cost = 0, 0.0
    for r in rows:
        if r.qty > 0:
            total_cost += r.qty * float(r.unit_price)
            stock += r.qty
        else:
            # 출고: 이동평균 단가로 차감
            avg = total_cost / stock if stock > 0 else 0
            total_cost += r.qty * avg   # qty가 음수이므로 차감됨
            stock += r.qty
            if stock < 0:
                stock, total_cost = 0, 0.0
    return round(total_cost / stock, 2) if stock > 0 else 0.0


def confirm_receipt(db: Session, gr_no: str) -> StockLedger:
    """입고 확정 → 재고원장에 입고(+) 기록"""
    from app.models.purchase import Receipt, ReceiptStatus
    receipt = db.get(Receipt, gr_no)
    if not receipt:
        raise HTTPException(404, f"입고 없음: {gr_no}")
    if receipt.status == ReceiptStatus.confirmed:
        raise HTTPException(400, "이미 확정된 입고")
    if receipt.status == ReceiptStatus.cancelled:
        raise HTTPException(400, "취소된 입고는 확정 불가")

    receipt.status = ReceiptStatus.confirmed
    entry = post_ledger(
        db, receipt.part_no, receipt.receipt_date,
        LedgerType.receipt, +receipt.qty, float(receipt.unit_price),
        ref_type="GR", ref_no=gr_no, note="입고확정",
    )
    db.flush()
    return entry


def cancel_receipt(db: Session, gr_no: str) -> StockLedger:
    """입고 취소 → 취소전표(마이너스) 추가. 원본은 삭제하지 않음."""
    from app.models.purchase import Receipt, ReceiptStatus
    receipt = db.get(Receipt, gr_no)
    if not receipt:
        raise HTTPException(404, f"입고 없음: {gr_no}")
    if receipt.status != ReceiptStatus.confirmed:
        raise HTTPException(400, "확정된 입고만 취소 가능")

    stock_after = get_stock(db, receipt.part_no) - receipt.qty
    if stock_after < 0:
        raise HTTPException(400, f"취소 시 재고 음수 ({stock_after}) — 불가")

    receipt.status = ReceiptStatus.cancelled
    avg = get_avg_price(db, receipt.part_no)
    entry = post_ledger(
        db, receipt.part_no, receipt.receipt_date,
        LedgerType.cancel, -receipt.qty, avg,
        ref_type="CANCEL", ref_no=gr_no, note="입고취소전표",
    )
    db.flush()
    return entry


def adjust_stock(db: Session, part_no: str, delta: int, txn_date: date, note: str) -> StockLedger:
    """재고조정 — 부호(±)로 전달"""
    from app.models.master import Item
    if not db.get(Item, part_no):
        raise HTTPException(404, f"품목 없음: {part_no}")
    after = get_stock(db, part_no) + delta
    if after < 0:
        raise HTTPException(400, f"조정 후 재고 음수 ({after})")
    avg = get_avg_price(db, part_no)
    entry = post_ledger(
        db, part_no, txn_date,
        LedgerType.adjustment, delta, avg,
        ref_type="ADJ", note=note,
    )
    db.flush()
    return entry
