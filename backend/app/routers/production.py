from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, ConfigDict
from datetime import date, timedelta
from calendar import monthrange
from app.database import get_db
from app.models.production import ProductionOrder, Mold, POrdStatus, MoldStatus, MonthlyPlan, DailyActual, WeeklyPlan
from app.models.master import Item, BomLine, Partner
from app.services.production_service import create_pord, post_production_result, create_mold
from app.services.ledger_service import get_stock_bulk

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
    lent_to_partner_id: str | None = None
    lent_date: date | None = None


class MoldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    mold_no: str
    owner: str | None
    part_no: str | None
    location: str | None
    lent_to_partner_id: str | None = None
    lent_date: date | None = None
    lent_partner_name: str | None = None
    total_shots: int
    status: MoldStatus


class MoldLendIn(BaseModel):
    lent_to_partner_id: str | None = None
    lent_date: date | None = None


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


@router.get("/molds")
def list_molds(db: Session = Depends(get_db)):
    molds = db.query(Mold).all()
    result = []
    for m in molds:
        partner_name = None
        if m.lent_to_partner_id:
            p = db.get(Partner, m.lent_to_partner_id)
            partner_name = p.name if p else m.lent_to_partner_id
        effective_location = partner_name or m.location
        result.append({
            "mold_no": m.mold_no,
            "owner": m.owner,
            "part_no": m.part_no,
            "location": effective_location,
            "lent_to_partner_id": m.lent_to_partner_id,
            "lent_date": m.lent_date,
            "lent_partner_name": partner_name,
            "total_shots": m.total_shots,
            "status": m.status,
        })
    return result


@router.post("/molds/import-outsourced")
def import_outsourced_molds(db: Session = Depends(get_db)):
    """외주품 목록에서 금형 일괄 자동 등록"""
    from app.models.master import ItemType
    items = db.query(Item).filter(Item.item_type == ItemType.outsourced).all()
    created = 0
    skipped = 0
    for item in items:
        existing = db.get(Mold, item.part_no)
        if existing:
            skipped += 1
            continue
        mold = Mold(
            mold_no=item.part_no,
            owner=item.supplier or "미지정",
            part_no=item.part_no,
            location=item.supplier or "",
        )
        db.add(mold)
        created += 1
    db.commit()
    return {"created": created, "skipped": skipped, "total": len(items)}


@router.get("/molds/by-partner")
def molds_by_partner(db: Session = Depends(get_db)):
    """금형을 소유자(업체)별로 그룹화하여 반환"""
    from collections import defaultdict
    molds = db.query(Mold).order_by(Mold.owner, Mold.mold_no).all()
    item_map = {i.part_no: i for i in db.query(Item).all()}
    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}

    groups: dict[str, list] = defaultdict(list)
    for m in molds:
        item = item_map.get(m.part_no) if m.part_no else None
        item_name = item.name if item else ""
        lent_partner_name = None
        if m.lent_to_partner_id:
            p = db.get(Partner, m.lent_to_partner_id)
            lent_partner_name = p.name if p else m.lent_to_partner_id
        groups[m.owner or "미지정"].append({
            "mold_no": m.mold_no,
            "owner": m.owner,
            "part_no": m.part_no,
            "part_name": item_name,
            "location": lent_partner_name or m.location or "",
            "lent_to_partner_id": m.lent_to_partner_id,
            "lent_partner_name": lent_partner_name,
            "total_shots": m.total_shots,
            "status": m.status,
        })

    return [{"partner": k, "count": len(v), "molds": v} for k, v in sorted(groups.items())]


@router.patch("/molds/{mold_no}")
def patch_mold(mold_no: str, body: dict, db: Session = Depends(get_db)):
    mold = db.get(Mold, mold_no)
    if not mold:
        raise HTTPException(404)
    if "status" in body and body["status"]:
        mold.status = body["status"]
    if "repair_note" in body and body["repair_note"]:
        mold.repair_history = (mold.repair_history or "") + f"\n{body['repair_note']}"
    if "owner" in body:
        mold.owner = body["owner"]
    if "location" in body:
        mold.location = body["location"]
    db.commit()
    db.refresh(mold)
    return {"ok": True}


@router.delete("/molds/{mold_no}")
def delete_mold(mold_no: str, db: Session = Depends(get_db)):
    mold = db.get(Mold, mold_no)
    if not mold:
        raise HTTPException(404)
    db.delete(mold)
    db.commit()
    return {"ok": True}


@router.patch("/molds/{mold_no}/lend")
def lend_mold(mold_no: str, body: MoldLendIn, db: Session = Depends(get_db)):
    mold = db.get(Mold, mold_no)
    if not mold:
        raise HTTPException(404)
    mold.lent_to_partner_id = body.lent_to_partner_id
    mold.lent_date = body.lent_date
    db.commit()
    partner_name = None
    if mold.lent_to_partner_id:
        p = db.get(Partner, mold.lent_to_partner_id)
        partner_name = p.name if p else mold.lent_to_partner_id
    return {"ok": True, "lent_partner_name": partner_name}


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
    worker: str | None = None
    machine_no: str | None = None
    note: str | None = None


@router.get("/monthly-plans")
def list_monthly_plans(year: int, month: int, db: Session = Depends(get_db)):
    plans = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == year, MonthlyPlan.month == month
    ).all()

    # MES WorkerSession 실적 — part_no 별 집계
    try:
        from app.models.mes_floor import MesWorkOrder as MWO, WorkerSession as WS
        from sqlalchemy import extract
        mes_rows = db.query(
            MWO.part_no,
            func.coalesce(func.sum(WS.good_qty), 0).label("good"),
            func.coalesce(func.sum(WS.defect_qty), 0).label("defect"),
        ).join(WS, WS.wo_no == MWO.wo_no).filter(
            extract("year",  MWO.plan_date) == year,
            extract("month", MWO.plan_date) == month,
        ).group_by(MWO.part_no).all()
        mes_map = {r.part_no: {"good": int(r.good), "defect": int(r.defect)} for r in mes_rows}
    except Exception:
        mes_map = {}

    result = []
    for p in plans:
        daily_actual = sum(a.actual_qty for a in p.actuals)
        m = mes_map.pop(p.part_no, {"good": 0, "defect": 0})
        total_actual = daily_actual or m["good"]          # DailyActual 우선, 없으면 MES
        rate = round(total_actual / p.planned_qty * 100, 1) if p.planned_qty else 0.0
        item = db.get(Item, p.part_no)
        result.append({
            "id": p.id, "year": p.year, "month": p.month,
            "part_no": p.part_no, "part_name": item.name if item else p.part_no,
            "planned_qty": p.planned_qty,
            "total_actual": total_actual,     # Production.jsx KPI 사용
            "actual_qty": daily_actual,       # DailyActual (수기 입력)
            "mes_actual": m["good"],          # MES 실적
            "mes_defect": m["defect"],
            "achieve_rate": rate,
        })

    # MonthlyPlan 없는 품번도 MES 데이터가 있으면 추가
    for part_no, m in mes_map.items():
        if m["good"] > 0:
            item = db.get(Item, part_no)
            result.append({
                "id": None, "year": year, "month": month,
                "part_no": part_no, "part_name": item.name if item else part_no,
                "planned_qty": 0,
                "total_actual": m["good"],
                "actual_qty": 0,
                "mes_actual": m["good"],
                "mes_defect": m["defect"],
                "achieve_rate": None,
            })
    return result


@router.get("/mes-downtime")
def mes_downtime(year: int, month: int, db: Session = Depends(get_db)):
    """MES DowntimeLog 기반 비가동 원인별 집계 — 월간"""
    from app.models.mes_floor import DowntimeLog, WorkerSession
    from sqlalchemy import extract, case
    REASON_MAP = {
        "설비고장": ("breakdown",   "설비고장"),
        "금형교체": ("mold_change", "금형교체"),
        "재료교체": ("material",    "재료교체"),
        "품질이슈": ("defect",      "품질이슈"),
        "휴식":    ("rest",        "휴식"),
        "미팅":    ("meeting",     "미팅"),
        "초기세팅": ("startup",     "초기세팅"),
        "기타":    ("other",       "기타"),
    }
    rows = db.query(
        DowntimeLog.reason,
        func.count(DowntimeLog.id).label("cnt"),
        func.sum(
            func.extract("epoch",
                func.coalesce(DowntimeLog.end_time, func.now()) - DowntimeLog.start_time
            ) / 60
        ).label("total_min"),
    ).join(WorkerSession, WorkerSession.id == DowntimeLog.session_id).filter(
        extract("year",  DowntimeLog.start_time) == year,
        extract("month", DowntimeLog.start_time) == month,
    ).group_by(DowntimeLog.reason).all()

    total_min = sum(float(r.total_min or 0) for r in rows)
    summary = []
    for r in sorted(rows, key=lambda x: -(float(x.total_min or 0))):
        reason_str = r.reason.value if hasattr(r.reason, "value") else str(r.reason)
        code, label = REASON_MAP.get(reason_str, ("other", reason_str))
        mins = round(float(r.total_min or 0))
        summary.append({
            "loss_code":  code,
            "label":      label,
            "count":      int(r.cnt),
            "total_min":  mins,
            "share_pct":  round(mins / total_min * 100, 1) if total_min > 0 else 0,
        })
    return {"summary": summary, "total_stop_min": round(float(total_min))}


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
        act.worker = body.worker
        act.machine_no = body.machine_no
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
                          actual_qty=body.actual_qty, worker=body.worker,
                          machine_no=body.machine_no, note=body.note)
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
def delete_daily_actual(actual_id: int, db: Session = Depends(get_db)):  # noqa: F811 (after weekly routes)
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


# ── 주단위 생산계획 ──────────────────────────────────────────────

def _week_dates(year: int, month: int, week_no: int):
    last_day = monthrange(year, month)[1]
    day_start = (week_no - 1) * 7 + 1
    day_end = min(week_no * 7, last_day)
    return date(year, month, day_start), date(year, month, day_end)


def _month_weeks(year: int, month: int) -> list[dict]:
    last_day = monthrange(year, month)[1]
    weeks = []
    for w in range(1, 6):
        s, e = _week_dates(year, month, w)
        if s.day > last_day:
            break
        weeks.append({"week_no": w, "start": str(s), "end": str(e)})
    return weeks


class WeeklyPlanIn(BaseModel):
    part_no: str
    planned_qty: int


@router.get("/weekly-plans")
def list_weekly_plans(year: int, month: int, db: Session = Depends(get_db)):
    plans = db.query(WeeklyPlan).filter(
        WeeklyPlan.year == year, WeeklyPlan.month == month,
    ).order_by(WeeklyPlan.week_no, WeeklyPlan.part_no).all()

    result = []
    for p in plans:
        ws, we = _week_dates(year, month, p.week_no)
        actual_qty = db.query(func.sum(DailyActual.actual_qty)).join(
            MonthlyPlan, DailyActual.plan_id == MonthlyPlan.id
        ).filter(
            MonthlyPlan.year == year, MonthlyPlan.month == month,
            MonthlyPlan.part_no == p.part_no,
            DailyActual.prod_date >= ws,
            DailyActual.prod_date <= we,
        ).scalar() or 0

        item = db.get(Item, p.part_no)
        result.append({
            "id": p.id, "year": p.year, "month": p.month, "week_no": p.week_no,
            "part_no": p.part_no, "part_name": item.name if item else p.part_no,
            "planned_qty": p.planned_qty, "actual_qty": int(actual_qty),
            "achieve_rate": round(int(actual_qty) / p.planned_qty * 100, 1) if p.planned_qty > 0 else 0.0,
            "week_start": str(ws), "week_end": str(we),
        })
    return result


@router.post("/weekly-plans")
def upsert_weekly_plan(year: int, month: int, week_no: int, body: WeeklyPlanIn, db: Session = Depends(get_db)):
    plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.year == year, WeeklyPlan.month == month,
        WeeklyPlan.week_no == week_no, WeeklyPlan.part_no == body.part_no,
    ).first()
    if plan:
        plan.planned_qty = body.planned_qty
    else:
        plan = WeeklyPlan(year=year, month=month, week_no=week_no,
                          part_no=body.part_no, planned_qty=body.planned_qty)
        db.add(plan)
    db.commit()
    return {"id": plan.id, "week_no": week_no, "part_no": plan.part_no, "planned_qty": plan.planned_qty}


@router.delete("/weekly-plans/{plan_id}")
def delete_weekly_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.get(WeeklyPlan, plan_id)
    if not plan:
        raise HTTPException(404)
    db.delete(plan)
    db.commit()
    return {"ok": True}


@router.get("/weekly-plans/weeks")
def get_weeks(year: int, month: int):
    return _month_weeks(year, month)


# ── 주단위 실적 (수기 입력) ───────────────────────────────────────

class WeeklyActualIn(BaseModel):
    part_no: str
    year: int
    month: int
    prod_date: date
    actual_qty: int
    worker_id: str | None = None   # hr_employee.emp_id
    machine_no: str | None = None
    note: str | None = None


class WeeklyActualPatch(BaseModel):
    actual_qty: int
    worker_id: str | None = None
    machine_no: str | None = None
    note: str | None = None


def _calc_labor_cost(db: Session, worker_id: str | None, prod_date: date, actual_qty: int) -> tuple[str | None, float]:
    """사원ID + 날짜 → (사원이름, 직접노무비 원)"""
    if not worker_id or actual_qty <= 0:
        return None, 0.0
    from app.models.hr import Employee, Attendance
    emp = db.get(Employee, worker_id)
    if not emp:
        return None, 0.0
    # 통상시급 계산
    if emp.emp_type == "hourly":
        hourly = float(emp.hourly_rate or 0)
    else:
        std_hrs = float(emp.std_monthly_hours or 209)
        hourly = float(emp.base_salary or 0) / std_hrs if std_hrs > 0 else 0.0
    # 당일 근무시간 (근태 우선, 없으면 8h)
    att = db.query(Attendance).filter(
        Attendance.emp_id == worker_id, Attendance.work_date == prod_date
    ).first()
    work_hrs = float(att.work_hrs or 8.0) if att else 8.0
    labor_cost = round(hourly * work_hrs, 2)
    return emp.name, labor_cost


@router.get("/weekly-plans/actual")
def list_weekly_actual(year: int, month: int, part_no: str, week_start: date, week_end: date, db: Session = Depends(get_db)):
    """주차 내 특정 품번의 DailyActual 목록"""
    plan = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == year, MonthlyPlan.month == month,
        MonthlyPlan.part_no == part_no,
    ).first()
    if not plan:
        return []
    rows = db.query(DailyActual).filter(
        DailyActual.plan_id == plan.id,
        DailyActual.prod_date >= week_start,
        DailyActual.prod_date <= week_end,
    ).order_by(DailyActual.prod_date).all()
    return [
        {
            "id": r.id, "prod_date": str(r.prod_date), "actual_qty": r.actual_qty,
            "worker": r.worker, "worker_id": r.worker_id,
            "machine_no": r.machine_no, "note": r.note,
            "labor_cost_won": float(r.labor_cost_won or 0),
        }
        for r in rows
    ]


@router.post("/weekly-plans/actual")
def upsert_weekly_actual(body: WeeklyActualIn, db: Session = Depends(get_db)):
    """주단위 실적 등록/수정 — MonthlyPlan 없으면 자동 생성"""
    from app.models.ledger import LedgerType
    from app.services.ledger_service import post_ledger, get_avg_price

    # MonthlyPlan 자동 생성
    plan = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == body.year, MonthlyPlan.month == body.month,
        MonthlyPlan.part_no == body.part_no,
    ).first()
    if not plan:
        plan = MonthlyPlan(year=body.year, month=body.month,
                           part_no=body.part_no, planned_qty=0)
        db.add(plan)
        db.flush()

    act = db.query(DailyActual).filter(
        DailyActual.plan_id == plan.id,
        DailyActual.prod_date == body.prod_date,
    ).first()

    worker_name, labor_cost = _calc_labor_cost(db, body.worker_id, body.prod_date, body.actual_qty)

    if act:
        diff = body.actual_qty - act.actual_qty
        act.actual_qty = body.actual_qty
        act.worker_id = body.worker_id
        act.worker = worker_name
        act.machine_no = body.machine_no
        act.labor_cost_won = labor_cost
        act.note = body.note
        if diff != 0:
            avg = get_avg_price(db, body.part_no)
            post_ledger(db, body.part_no, body.prod_date,
                        LedgerType.production, diff, avg,
                        ref_type="PROD",
                        ref_no=f"PROD-{body.year}{body.month:02d}-{plan.id}-{body.prod_date}",
                        note=f"주단위실적수정({body.prod_date})")
    else:
        act = DailyActual(plan_id=plan.id, prod_date=body.prod_date,
                          actual_qty=body.actual_qty, worker_id=body.worker_id,
                          worker=worker_name, machine_no=body.machine_no,
                          labor_cost_won=labor_cost, note=body.note)
        db.add(act)
        avg = get_avg_price(db, body.part_no)
        post_ledger(db, body.part_no, body.prod_date,
                    LedgerType.production, body.actual_qty, avg,
                    ref_type="PROD",
                    ref_no=f"PROD-{body.year}{body.month:02d}-{plan.id}-{body.prod_date}",
                    note=f"주단위실적등록({body.prod_date})")

    db.commit()
    return {"ok": True, "actual_id": act.id, "worker": worker_name, "labor_cost_won": labor_cost}


@router.put("/weekly-plans/actual/{actual_id}")
def update_weekly_actual(actual_id: int, body: WeeklyActualPatch, db: Session = Depends(get_db)):
    """기존 DailyActual 수정 (날짜 변경 없이 수량·작업자·설비 수정)"""
    from app.models.ledger import LedgerType
    from app.services.ledger_service import post_ledger, get_avg_price

    act = db.get(DailyActual, actual_id)
    if not act:
        raise HTTPException(404, "실적 없음")

    plan = db.get(MonthlyPlan, act.plan_id)
    worker_name, labor_cost = _calc_labor_cost(db, body.worker_id, act.prod_date, body.actual_qty)
    diff = body.actual_qty - act.actual_qty
    act.actual_qty = body.actual_qty
    act.worker_id = body.worker_id
    act.worker = worker_name
    act.machine_no = body.machine_no
    act.labor_cost_won = labor_cost
    act.note = body.note

    if diff != 0 and plan:
        avg = get_avg_price(db, plan.part_no)
        post_ledger(db, plan.part_no, act.prod_date,
                    LedgerType.production, diff, avg,
                    ref_type="PROD", ref_no=None,
                    note=f"주단위실적수정({act.prod_date})")

    db.commit()
    return {"ok": True, "worker": worker_name, "labor_cost_won": labor_cost}


@router.get("/weekly-plans/availability")
def weekly_availability(year: int, month: int, week_no: int, db: Session = Depends(get_db)):
    """주차 계획 대비 BOM 가용성 검사"""
    week_plans = db.query(WeeklyPlan).filter(
        WeeklyPlan.year == year, WeeklyPlan.month == month,
        WeeklyPlan.week_no == week_no,
    ).all()

    if not week_plans:
        return {"week_no": week_no, "items": [], "components": []}

    all_bom = db.query(BomLine).all()
    bom_map: dict[str, list] = {}
    for b in all_bom:
        bom_map.setdefault(b.product_part_no, []).append(b)

    all_items_map = {i.part_no: i for i in db.query(Item).all()}

    # 필요 자재 집계
    demand: dict[str, float] = {}
    plan_summary = []
    for wp in week_plans:
        item = all_items_map.get(wp.part_no)
        bom_lines = bom_map.get(wp.part_no, [])
        plan_summary.append({
            "part_no": wp.part_no,
            "part_name": item.name if item else wp.part_no,
            "planned_qty": wp.planned_qty,
            "bom_exists": len(bom_lines) > 0,
        })
        for bom in bom_lines:
            demand[bom.component_part_no] = demand.get(bom.component_part_no, 0) + wp.planned_qty * float(bom.qty_per)

    stock_map = get_stock_bulk(db, list(demand.keys())) if demand else {}

    components = []
    for comp_part, required in sorted(demand.items(), key=lambda x: -x[1]):
        stock = stock_map.get(comp_part, 0)
        shortage = max(0.0, required - stock)
        comp_item = all_items_map.get(comp_part)
        components.append({
            "part_no": comp_part,
            "part_name": comp_item.name if comp_item else comp_part,
            "required_qty": round(required, 4),
            "stock_qty": round(stock, 4),
            "shortage_qty": round(shortage, 4),
            "ok": shortage == 0,
        })

    return {
        "week_no": week_no,
        "items": plan_summary,
        "components": components,
        "has_shortage": any(c["shortage_qty"] > 0 for c in components),
    }


# ── 생산오더 가용성 검사 ──────────────────────────────────────────
@router.get("/orders/feasibility")
def feasibility_check(db: Session = Depends(get_db)):
    """
    진행중·계획 생산오더별 BOM 전개 → 자재 부족 여부 분석
    - available: True = 즉시 생산 가능
    - shortage_items: 부족 자재 목록
    """
    open_orders = db.query(ProductionOrder).filter(
        ProductionOrder.status.in_(["계획", "진행중"])
    ).order_by(ProductionOrder.plan_date).all()

    if not open_orders:
        return []

    # BOM / 품목 / 재고 일괄 로드
    all_bom_rows = db.query(BomLine).all()
    bom_map: dict[str, list[BomLine]] = {}
    for b in all_bom_rows:
        bom_map.setdefault(b.product_part_no, []).append(b)

    all_items = {i.part_no: i for i in db.query(Item).all()}

    # 오더 전체 자재 수요 먼저 집계 (같은 자재 여러 오더에서 공유)
    all_comp_parts: set[str] = set()
    for order in open_orders:
        remaining = max(0, order.planned_qty - order.actual_qty)
        for bom in bom_map.get(order.part_no, []):
            all_comp_parts.add(bom.component_part_no)

    stock_map = get_stock_bulk(db, list(all_comp_parts)) if all_comp_parts else {}

    results = []
    for order in open_orders:
        remaining_qty = max(0, order.planned_qty - order.actual_qty)
        item = all_items.get(order.part_no)
        bom_lines = bom_map.get(order.part_no, [])

        components = []
        has_shortage = False

        if not bom_lines:
            # BOM 없음 → 가용성 확인 불가
            results.append({
                "pord_no": order.pord_no,
                "part_no": order.part_no,
                "item_name": item.name if item else order.part_no,
                "planned_qty": order.planned_qty,
                "actual_qty": order.actual_qty,
                "remaining_qty": remaining_qty,
                "plan_date": str(order.plan_date),
                "status": order.status,
                "available": None,
                "bom_exists": False,
                "shortage_items": [],
                "components": [],
            })
            continue

        for bom in bom_lines:
            comp_part = bom.component_part_no
            required = remaining_qty * float(bom.qty_per)
            stock = stock_map.get(comp_part, 0)
            shortage = max(0.0, required - stock)
            comp_item = all_items.get(comp_part)

            components.append({
                "part_no": comp_part,
                "item_name": comp_item.name if comp_item else comp_part,
                "item_type": comp_item.item_type if comp_item else "raw",
                "unit": comp_item.unit if comp_item else "EA",
                "qty_per": float(bom.qty_per),
                "required_qty": round(required, 2),
                "current_stock": stock,
                "shortage_qty": round(shortage, 2),
                "ok": shortage <= 0,
            })
            if shortage > 0:
                has_shortage = True

        shortage_items = [c for c in components if not c["ok"]]

        results.append({
            "pord_no": order.pord_no,
            "part_no": order.part_no,
            "item_name": item.name if item else order.part_no,
            "planned_qty": order.planned_qty,
            "actual_qty": order.actual_qty,
            "remaining_qty": remaining_qty,
            "plan_date": str(order.plan_date),
            "status": order.status,
            "available": not has_shortage,
            "bom_exists": True,
            "shortage_items": shortage_items,
            "components": components,
        })

    return results


# ── 생산 간트 데이터 ────────────────────────────────────────────────
@router.get("/gantt")
def gantt_data(year: int, month: int, db: Session = Depends(get_db)):
    """호기별 작업지시 타임라인 — 간트 차트용"""
    days_in = monthrange(year, month)[1]
    first = date(year, month, 1)
    last  = date(year, month, days_in)

    from sqlalchemy import or_
    orders = db.query(ProductionOrder).filter(
        ProductionOrder.status != POrdStatus.cancelled,
        or_(
            (ProductionOrder.plan_date >= first) & (ProductionOrder.plan_date <= last),
            (ProductionOrder.complete_date >= first) & (ProductionOrder.complete_date <= last),
            (ProductionOrder.plan_date < first) & (
                (ProductionOrder.complete_date >= first) | ProductionOrder.complete_date.is_(None)
            ),
        ),
    ).order_by(ProductionOrder.mold_no, ProductionOrder.plan_date).all()

    items = {i.part_no: i for i in db.query(Item).all()}

    return {
        "year": year,
        "month": month,
        "days": days_in,
        "orders": [{
            "pord_no": o.pord_no,
            "part_no": o.part_no,
            "part_name": items[o.part_no].name if o.part_no in items else o.part_no,
            "mold_no": o.mold_no or "미지정",
            "plan_date": o.plan_date.isoformat() if o.plan_date else None,
            "complete_date": o.complete_date.isoformat() if o.complete_date else None,
            "planned_qty": o.planned_qty,
            "actual_qty": o.actual_qty,
            "status": o.status.value if o.status else None,
            "progress": round(o.actual_qty / o.planned_qty * 100, 1) if o.planned_qty and o.planned_qty > 0 else 0,
            "lead_days": int(items[o.part_no].lead_time_days) if o.part_no in items and items[o.part_no].lead_time_days else 7,
        } for o in orders],
    }
