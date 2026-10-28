from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.sales import SalesTarget
from app.models.master import Partner

router = APIRouter(prefix="/sales-targets", tags=["매출목표"])


class TargetUpsert(BaseModel):
    target_amount: float


@router.get("")
def list_targets(year: int, month: int, db: Session = Depends(get_db)):
    """해당 년월의 전체 거래처 목표 목록"""
    partners = db.query(Partner).filter(Partner.active == True, Partner.partner_type == "customer").all()
    targets = {
        t.partner_id: t.target_amount
        for t in db.query(SalesTarget).filter(
            SalesTarget.year == year, SalesTarget.month == month
        ).all()
    }
    return [
        {
            "partner_id": p.partner_id,
            "partner_name": p.name,
            "target_amount": float(targets.get(p.partner_id, 0)),
        }
        for p in partners
    ]


@router.put("/{partner_id}")
def upsert_target(
    partner_id: str,
    body: TargetUpsert,
    year: int,
    month: int,
    db: Session = Depends(get_db),
):
    """거래처 월 목표 매출 등록/수정"""
    existing = db.query(SalesTarget).filter(
        SalesTarget.partner_id == partner_id,
        SalesTarget.year == year,
        SalesTarget.month == month,
    ).first()
    if existing:
        existing.target_amount = body.target_amount
    else:
        db.add(SalesTarget(
            partner_id=partner_id,
            year=year,
            month=month,
            target_amount=body.target_amount,
        ))
    db.commit()
    return {"ok": True}
