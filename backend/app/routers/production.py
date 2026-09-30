from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, ConfigDict
from datetime import date, timedelta
from calendar import monthrange
from app.database import get_db
from app.models.production import ProductionOrder, Mold, POrdStatus, MoldStatus, MonthlyPlan, DailyActual
from app.models.master import Item
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


# ── 월 생산계획 ──────────────────────────────────────────────────

def _korean_holidays(year: int) -> set[date]:
    """한국 법정공휴일 + 대체공휴일 (토·일 겹침 시 다음 평일로 대체)"""
    from datetime import date as _d

    def _solar(m, d): return _d(year, m, d)

    base: set[date] = set()

    # ── 양력 고정 공휴일 ──
    for m, d in [(1,1),(3,1),(5,5),(6,6),(8,15),(10,3),(10,9),(12,25)]:
        base.add(_solar(m, d))

    # ── 설날 연휴 (음력 1/1 전후 3일) ──
    seollal_table = {
        2024: _d(2024, 2, 10), 2025: _d(2025, 1, 29), 2026: _d(2026, 1, 17),
        2027: _d(2027, 2, 6),  2028: _d(2028, 1, 26), 2029: _d(2029, 2, 13),
    }
    if year in seollal_table:
        s = seollal_table[year]
        for delta in (-1, 0, 1):
            base.add(s + timedelta(days=delta))

    # ── 추석 연휴 (음력 8/15 전후 3일) ──
    chuseok_table = {
        2024: _d(2024, 9, 17), 2025: _d(2025, 10, 7), 2026: _d(2026, 9, 25),
        2027: _d(2027, 9, 15), 2028: _d(2028, 10, 3), 2029: _d(2029, 9, 22),
    }
    if year in chuseok_table:
        c = chuseok_table[year]
        for delta in (-1, 0, 1):
            base.add(c + timedelta(days=delta))

    # ── 석가탄신일 ──
    buddha_table = {
        2024: _d(2024, 5, 15), 2025: _d(2025, 5, 5), 2026: _d(2026, 5, 24),
        2027: _d(2027, 5, 13), 2028: _d(2028, 5, 2), 2029: _d(2029, 5, 22),
    }
    if year in buddha_table:
        base.add(buddha_table[year])

    # ── 대체공휴일: 공휴일이 일요일이면 다음 첫 번째 비공휴일 평일 ──
    # (어린이날·설날·추석은 토요일 포함, 나머지는 일요일만)
    holidays = set(base)
    saturday_substitute = {_solar(5, 5)}  # 어린이날은 토요일도 대체
    if year in seollal_table:
        s = seollal_table[year]
        for delta in (-1, 0, 1):
            saturday_substitute.add(s + timedelta(days=delta))
    if year in chuseok_table:
        c = chuseok_table[year]
        for delta in (-1, 0, 1):
            saturday_substitute.add(c + timedelta(days=delta))

    for h in sorted(base):
        if h.weekday() == 6 or (h.weekday() == 5 and h in saturday_substitute):
            rep = h + timedelta(days=1)
            while rep.weekday() >= 5 or rep in holidays:
                rep += timedelta(days=1)
            holidays.add(rep)

    return holidays


def _working_days(year: int, month: int) -> list[date]:
    """해당 월 영업일 목록 (토·일·공휴일 제외)"""
    holidays = _korean_holidays(year)
    days = []
    total = monthrange(year, month)[1]
    for d in range(1, total + 1):
        dt = date(year, month, d)
        if dt.weekday() < 5 and dt not in holidays:  # 월~금, 공휴일 제외
            days.append(dt)
    return days


class MonthlyPlanIn(BaseModel):
    part_no: str
    planned_qty: int


class MonthlyPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    year: int
    month: int
    part_no: str
    part_name: str | None = None
    planned_qty: int
    actual_qty: int = 0
    achieve_rate: float = 0.0


class DailyActualIn(BaseModel):
    prod_date: date
    actual_qty: int
    note: str | None = None


@router.get("/monthly-plans")
def list_monthly_plans(year: int, month: int, db: Session = Depends(get_db)):
    plans = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == year, MonthlyPlan.month == month
    ).all()
    result = []
    for p in plans:
        actual = sum(a.actual_qty for a in p.actuals)
        rate = round(actual / p.planned_qty * 100, 1) if p.planned_qty else 0.0
        item = db.get(Item, p.part_no)
        result.append({
            "id": p.id, "year": p.year, "month": p.month,
            "part_no": p.part_no, "part_name": item.name if item else p.part_no,
            "planned_qty": p.planned_qty, "actual_qty": actual, "achieve_rate": rate,
        })
    return result


@router.post("/monthly-plans")
def upsert_monthly_plan(year: int, month: int, body: MonthlyPlanIn, db: Session = Depends(get_db)):
    plan = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == year, MonthlyPlan.month == month,
        MonthlyPlan.part_no == body.part_no
    ).first()
    if plan:
        plan.planned_qty = body.planned_qty
    else:
        plan = MonthlyPlan(year=year, month=month, part_no=body.part_no, planned_qty=body.planned_qty)
        db.add(plan)
    db.commit()
    db.refresh(plan)
    return {"id": plan.id, "part_no": plan.part_no, "planned_qty": plan.planned_qty}


@router.delete("/monthly-plans/{plan_id}")
def delete_monthly_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.get(MonthlyPlan, plan_id)
    if not plan:
        raise HTTPException(404)
    db.delete(plan)
    db.commit()
    return {"ok": True}


@router.get("/monthly-plans/{plan_id}/daily")
def get_daily_breakdown(plan_id: int, db: Session = Depends(get_db)):
    plan = db.get(MonthlyPlan, plan_id)
    if not plan:
        raise HTTPException(404)

    work_days = _working_days(plan.year, plan.month)
    n = len(work_days)
    base_qty = plan.planned_qty // n if n else 0
    remainder = plan.planned_qty % n if n else 0

    actuals_map = {a.prod_date: a for a in plan.actuals}
    cumul_plan = 0
    cumul_actual = 0
    rows = []
    for i, d in enumerate(work_days):
        day_plan = base_qty + (1 if i < remainder else 0)
        cumul_plan += day_plan
        act = actuals_map.get(d)
        day_actual = act.actual_qty if act else None
        if day_actual is not None:
            cumul_actual += day_actual
        rows.append({
            "date": d.isoformat(),
            "day_plan": day_plan,
            "day_actual": day_actual,
            "actual_id": act.id if act else None,
            "note": act.note if act else None,
            "cumul_plan": cumul_plan,
            "cumul_actual": cumul_actual if day_actual is not None else None,
        })

    item = db.get(Item, plan.part_no)
    return {
        "plan_id": plan_id,
        "part_no": plan.part_no,
        "part_name": item.name if item else plan.part_no,
        "year": plan.year, "month": plan.month,
        "planned_qty": plan.planned_qty,
        "total_actual": sum(a.actual_qty for a in plan.actuals),
        "work_days": n,
        "rows": rows,
    }


@router.post("/monthly-plans/{plan_id}/actual")
def upsert_daily_actual(plan_id: int, body: DailyActualIn, db: Session = Depends(get_db)):
    from app.models.ledger import LedgerType
    from app.services.ledger_service import post_ledger, get_avg_price

    plan = db.get(MonthlyPlan, plan_id)
    if not plan:
        raise HTTPException(404)

    act = db.query(DailyActual).filter(
        DailyActual.plan_id == plan_id, DailyActual.prod_date == body.prod_date
    ).first()

    if act:
        # 기존 실적이 있으면 ledger 차이분만 조정
        diff = body.actual_qty - act.actual_qty
        act.actual_qty = body.actual_qty
        act.note = body.note
        if diff != 0:
            avg = get_avg_price(db, plan.part_no)
            ref_no = f"PROD-{plan.year}{plan.month:02d}-{plan.id}-{body.prod_date}"
            post_ledger(db, plan.part_no, body.prod_date,
                        LedgerType.production, diff, avg,
                        ref_type="PROD", ref_no=ref_no,
                        note=f"생산실적수정({body.prod_date})")
    else:
        act = DailyActual(plan_id=plan_id, prod_date=body.prod_date,
                          actual_qty=body.actual_qty, note=body.note)
        db.add(act)
        avg = get_avg_price(db, plan.part_no)
        ref_no = f"PROD-{plan.year}{plan.month:02d}-{plan.id}-{body.prod_date}"
        post_ledger(db, plan.part_no, body.prod_date,
                    LedgerType.production, body.actual_qty, avg,
                    ref_type="PROD", ref_no=ref_no,
                    note=f"생산입고({body.prod_date})")

    db.commit()
    return {"ok": True}


@router.delete("/monthly-plans/actual/{actual_id}")
def delete_daily_actual(actual_id: int, db: Session = Depends(get_db)):
    from app.models.ledger import LedgerType
    from app.services.ledger_service import post_ledger, get_avg_price

    act = db.get(DailyActual, actual_id)
    if not act:
        raise HTTPException(404)

    plan = db.get(MonthlyPlan, act.plan_id)
    if plan and act.actual_qty > 0:
        avg = get_avg_price(db, plan.part_no)
        post_ledger(db, plan.part_no, act.prod_date,
                    LedgerType.production, -act.actual_qty, avg,
                    ref_type="PROD", ref_no=None,
                    note=f"생산실적삭제({act.prod_date})")

    db.delete(act)
    db.commit()
    return {"ok": True}
