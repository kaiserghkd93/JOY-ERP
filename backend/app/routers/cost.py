from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models.cost import LaborRate, ProductCostStd, OverheadEntry
from app.models.master import Item, BomLine
from app.models.production import MonthlyPlan
from app.services.ledger_service import get_stock

router = APIRouter(prefix="/cost", tags=["원가관리"])


# ── 스키마 ────────────────────────────────────────────────────────

class LaborRateIn(BaseModel):
    process_name: str
    rate_per_hour: float
    note: Optional[str] = None
    active: bool = True

class LaborRateOut(BaseModel):
    id: int
    process_name: str
    rate_per_hour: float
    note: Optional[str]
    active: bool
    class Config: from_attributes = True

class ProductCostStdIn(BaseModel):
    part_no: str
    process_id: int
    std_labor_min: float
    note: Optional[str] = None

class ProductCostStdOut(BaseModel):
    id: int
    part_no: str
    process_id: int
    std_labor_min: float
    note: Optional[str]
    process_name: Optional[str] = None
    rate_per_hour: Optional[float] = None
    item_name: Optional[str] = None
    class Config: from_attributes = True

class OverheadEntryIn(BaseModel):
    year: int
    month: int
    category: str
    amount: float
    note: Optional[str] = None

class OverheadEntryOut(BaseModel):
    id: int
    year: int
    month: int
    category: str
    amount: float
    note: Optional[str]
    class Config: from_attributes = True


# ── 임률 마스터 ────────────────────────────────────────────────────

@router.get("/labor-rates", response_model=list[LaborRateOut])
def list_labor_rates(db: Session = Depends(get_db)):
    return db.query(LaborRate).order_by(LaborRate.id).all()

@router.post("/labor-rates", response_model=LaborRateOut)
def create_labor_rate(body: LaborRateIn, db: Session = Depends(get_db)):
    lr = LaborRate(**body.model_dump())
    db.add(lr); db.commit(); db.refresh(lr)
    return lr

@router.put("/labor-rates/{id}", response_model=LaborRateOut)
def update_labor_rate(id: int, body: LaborRateIn, db: Session = Depends(get_db)):
    lr = db.get(LaborRate, id)
    if not lr: raise HTTPException(404, "임률 없음")
    for k, v in body.model_dump().items(): setattr(lr, k, v)
    db.commit(); db.refresh(lr)
    return lr

@router.delete("/labor-rates/{id}")
def delete_labor_rate(id: int, db: Session = Depends(get_db)):
    lr = db.get(LaborRate, id)
    if not lr: raise HTTPException(404, "임률 없음")
    db.delete(lr); db.commit()
    return {"ok": True}


# ── 표준공수 (제품별) ──────────────────────────────────────────────

@router.get("/product-cost-std", response_model=list[ProductCostStdOut])
def list_product_cost_std(db: Session = Depends(get_db)):
    rows = db.query(ProductCostStd).order_by(ProductCostStd.part_no).all()
    result = []
    for r in rows:
        d = ProductCostStdOut.model_validate(r)
        if r.labor_rate:
            d.process_name = r.labor_rate.process_name
            d.rate_per_hour = float(r.labor_rate.rate_per_hour)
        item = db.get(Item, r.part_no)
        if item:
            d.item_name = item.name
        result.append(d)
    return result

@router.post("/product-cost-std", response_model=ProductCostStdOut)
def upsert_product_cost_std(body: ProductCostStdIn, db: Session = Depends(get_db)):
    existing = db.query(ProductCostStd).filter(ProductCostStd.part_no == body.part_no).first()
    if existing:
        for k, v in body.model_dump().items(): setattr(existing, k, v)
        existing.updated_at = datetime.now()
        db.commit(); db.refresh(existing)
        return existing
    row = ProductCostStd(**body.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return row

@router.delete("/product-cost-std/{id}")
def delete_product_cost_std(id: int, db: Session = Depends(get_db)):
    row = db.get(ProductCostStd, id)
    if not row: raise HTTPException(404, "없음")
    db.delete(row); db.commit()
    return {"ok": True}


# ── 월별 경비 ──────────────────────────────────────────────────────

@router.get("/overhead", response_model=list[OverheadEntryOut])
def list_overhead(year: int = Query(...), month: int = Query(...), db: Session = Depends(get_db)):
    return db.query(OverheadEntry).filter(
        OverheadEntry.year == year, OverheadEntry.month == month
    ).order_by(OverheadEntry.category).all()

@router.post("/overhead", response_model=OverheadEntryOut)
def create_overhead(body: OverheadEntryIn, db: Session = Depends(get_db)):
    row = OverheadEntry(**body.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return row

@router.put("/overhead/{id}", response_model=OverheadEntryOut)
def update_overhead(id: int, body: OverheadEntryIn, db: Session = Depends(get_db)):
    row = db.get(OverheadEntry, id)
    if not row: raise HTTPException(404, "없음")
    for k, v in body.model_dump().items(): setattr(row, k, v)
    db.commit(); db.refresh(row)
    return row

@router.delete("/overhead/{id}")
def delete_overhead(id: int, db: Session = Depends(get_db)):
    row = db.get(OverheadEntry, id)
    if not row: raise HTTPException(404, "없음")
    db.delete(row); db.commit()
    return {"ok": True}


# ── 원가 계산 조회 ─────────────────────────────────────────────────

def _bom_mat_cost(db, part_no):
    lines = db.query(BomLine).filter(BomLine.product_part_no == part_no).all()
    return sum(
        float(l.qty_per) * float(getattr(db.get(Item, l.component_part_no), 'std_buy_price', 0) or 0)
        for l in lines
    )

def _labor_cost_per_unit(db, part_no):
    std = db.query(ProductCostStd).filter(ProductCostStd.part_no == part_no).first()
    if not std or not std.labor_rate: return 0.0
    return float(std.std_labor_min) / 60.0 * float(std.labor_rate.rate_per_hour)

@router.get("/calculate")
def calculate_cost(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    # 월별 총 경비
    overhead_rows = db.query(OverheadEntry).filter(
        OverheadEntry.year == year, OverheadEntry.month == month
    ).all()
    total_overhead = sum(float(r.amount) for r in overhead_rows)
    overhead_by_cat = {}
    for r in overhead_rows:
        overhead_by_cat[r.category] = overhead_by_cat.get(r.category, 0) + float(r.amount)

    # 월별 전체 생산 실적 (경비 배부 기준)
    plans = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == year, MonthlyPlan.month == month
    ).all()
    total_actual_qty = sum(sum(a.actual_qty for a in p.actuals) for p in plans)

    # 품목별 계산
    items = db.query(Item).filter(Item.active == True).all()
    result = []
    for it in items:
        mat_cost = _bom_mat_cost(db, it.part_no)
        labor_cost = _labor_cost_per_unit(db, it.part_no)

        # 이 품목의 월 생산실적
        plan = next((p for p in plans if p.part_no == it.part_no), None)
        actual_qty = sum(a.actual_qty for a in plan.actuals) if plan else 0

        # 경비 배부 (생산수량 비율)
        overhead_per_unit = (total_overhead * actual_qty / total_actual_qty / actual_qty) if (total_actual_qty > 0 and actual_qty > 0) else 0

        total_cost = mat_cost + labor_cost + overhead_per_unit
        std_cost = db.query(ProductCostStd).filter(ProductCostStd.part_no == it.part_no).first()

        if mat_cost == 0 and labor_cost == 0 and actual_qty == 0:
            continue  # 활동 없는 품목 제외

        result.append({
            "part_no": it.part_no,
            "item_name": it.name,
            "actual_qty": actual_qty,
            "mat_cost": round(mat_cost, 2),
            "labor_cost": round(labor_cost, 2),
            "overhead_per_unit": round(overhead_per_unit, 2),
            "total_cost": round(total_cost, 2),
            "std_labor_min": float(std_cost.std_labor_min) if std_cost else None,
            "process_name": std_cost.labor_rate.process_name if std_cost and std_cost.labor_rate else None,
        })

    return {
        "year": year,
        "month": month,
        "total_overhead": total_overhead,
        "overhead_by_category": overhead_by_cat,
        "total_actual_qty": total_actual_qty,
        "items": result,
    }
