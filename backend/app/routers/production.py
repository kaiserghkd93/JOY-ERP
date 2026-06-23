from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from datetime import date
from app.database import get_db
from app.models.production import ProductionOrder, Mold, POrdStatus, MoldStatus
from app.services.production_service import create_pord, post_production_result, create_mold

router = APIRouter(prefix="/production", tags=["생산"])


class POrdCreate(BaseModel):
    part_no: str
    planned_qty: int
    plan_date: date
    mold_no: str | None = None
    note: str | None = None


class POrdOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    pord_no: str
    part_no: str
    planned_qty: int
    actual_qty: int
    mold_no: str | None
    plan_date: date
    status: POrdStatus


class ResultIn(BaseModel):
    actual_qty: int
    complete_date: date


class MoldCreate(BaseModel):
    mold_no: str
    owner: str | None = None
    part_no: str | None = None
    location: str | None = None


class MoldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    mold_no: str
    owner: str | None
    part_no: str | None
    location: str | None
    total_shots: int
    status: MoldStatus


@router.post("/orders", response_model=POrdOut)
def post_order(body: POrdCreate, db: Session = Depends(get_db)):
    return create_pord(db, **body.model_dump())


@router.get("/orders", response_model=list[POrdOut])
def list_orders(db: Session = Depends(get_db)):
    return db.query(ProductionOrder).order_by(ProductionOrder.plan_date.desc()).all()


@router.post("/orders/{pord_no}/result", response_model=POrdOut)
def post_result(pord_no: str, body: ResultIn, db: Session = Depends(get_db)):
    return post_production_result(db, pord_no, body.actual_qty, body.complete_date)


@router.post("/molds", response_model=MoldOut)
def post_mold(body: MoldCreate, db: Session = Depends(get_db)):
    return create_mold(db, **body.model_dump())


@router.get("/molds", response_model=list[MoldOut])
def list_molds(db: Session = Depends(get_db)):
    return db.query(Mold).all()


@router.patch("/molds/{mold_no}")
def patch_mold(mold_no: str, repair_note: str | None = None, status: MoldStatus | None = None, db: Session = Depends(get_db)):
    mold = db.get(Mold, mold_no)
    if not mold:
        raise HTTPException(404)
    if status:
        mold.status = status
    if repair_note:
        mold.repair_history = (mold.repair_history or "") + f"\n{repair_note}"
    db.commit()
    db.refresh(mold)
    return mold
