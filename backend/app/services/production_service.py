from datetime import date
from sqlalchemy.orm import Session
from app.models.production import ProductionOrder, Mold, POrdStatus
from app.models.master import Item
from app.models.ledger import LedgerType
from app.services.doc_no import next_doc_no
from app.services.ledger_service import post_ledger
from fastapi import HTTPException


def create_pord(
    db: Session, part_no: str, planned_qty: int,
    plan_date: date, mold_no: str | None = None, note: str | None = None,
) -> ProductionOrder:
    if not db.get(Item, part_no):
        raise HTTPException(404, f"품목 없음: {part_no}")
    if mold_no and not db.get(Mold, mold_no):
        raise HTTPException(404, f"금형 없음: {mold_no}")
    pord_no = next_doc_no(db, "WO", "production_order", "pord_no")
    pord = ProductionOrder(
        pord_no=pord_no, part_no=part_no, planned_qty=planned_qty,
        plan_date=plan_date, mold_no=mold_no, note=note,
    )
    db.add(pord)
    db.commit()
    db.refresh(pord)
    return pord


def post_production_result(
    db: Session, pord_no: str, actual_qty: int, complete_date: date,
) -> ProductionOrder:
    pord = db.get(ProductionOrder, pord_no)
    if not pord:
        raise HTTPException(404, f"생산오더 없음: {pord_no}")
    if pord.status == POrdStatus.cancelled:
        raise HTTPException(400, "취소된 생산오더")

    pord.actual_qty += actual_qty
    pord.complete_date = complete_date
    pord.status = POrdStatus.completed

    # 생산입고 → 재고원장 (외주입고와 같은 풀)
    post_ledger(
        db, pord.part_no, complete_date,
        LedgerType.production, +actual_qty, 0.0,
        ref_type="WO", ref_no=pord_no, note=f"생산실적 {actual_qty}",
    )
    # 금형 누적타수 가산
    if pord.mold_no:
        mold = db.get(Mold, pord.mold_no)
        if mold:
            mold.total_shots += actual_qty

    db.commit()
    db.refresh(pord)
    return pord


def create_mold(db: Session, mold_no: str, owner: str | None = None,
                part_no: str | None = None, location: str | None = None) -> Mold:
    if db.get(Mold, mold_no):
        raise HTTPException(409, f"금형 중복: {mold_no}")
    mold = Mold(mold_no=mold_no, owner=owner, part_no=part_no, location=location)
    db.add(mold)
    db.commit()
    db.refresh(mold)
    return mold
