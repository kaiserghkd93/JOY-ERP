"""TPS 라우터 — 택트타임·OEE·헤이준카·안돈·SMED (자체생산 기준)"""
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from app.database import get_db
from app.models.master import Item
from app.models.mes import MesProductionLog
from app.models.production import MonthlyPlan, DailyActual
from app.models.tps import OeeDaily, MoldChangeLog, AndonAlert, KaizenTask

router = APIRouter(prefix="/tps", tags=["TPS"])

# ── 상수 ────────────────────────────────────────────────────────────
OEE_RED = 0.60      # 60% 이하 → RED
OEE_YELLOW = 0.80   # 80% 이하 → YELLOW
DEFECT_THRESHOLD = 3.0   # 불량률 3% 초과 → 알림
SPEED_THRESHOLD = 1.20   # 실제C/T > 설비C/T × 1.2 → 속도저하
TARGET_THRESHOLD = 0.80  # 일실적 < 계획 80% → 목표미달


# ════════════════════════════════════════════════════════════════════
# PATCH 1+2 — C/T 조회 & 택트타임 계산
# ════════════════════════════════════════════════════════════════════

@router.get("/takt-time")
def get_takt_time(
    year: int = Query(...),
    month: int = Query(...),
    part_no: str = Query(...),
    work_time_min: float = Query(default=480, description="일 가동시간(분)"),
    db: Session = Depends(get_db),
):
    """택트타임 자동 계산 — 월 계획수량 ÷ 가동시간"""
    plan = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == year,
        MonthlyPlan.month == month,
        MonthlyPlan.part_no == part_no,
    ).first()
    if not plan:
        raise HTTPException(404, "월간계획 없음")

    item = db.query(Item).filter(Item.part_no == part_no).first()

    # 해당 월 영업일 계산 (토·일 제외, 간단 버전)
    import calendar
    _, days_in_month = calendar.monthrange(year, month)
    working_days = sum(
        1 for d in range(1, days_in_month + 1)
        if date(year, month, d).weekday() < 5
    )

    daily_qty = plan.planned_qty / working_days if working_days else 0
    takt_sec = (work_time_min * 60) / daily_qty if daily_qty else 0

    machine_ct = getattr(item, "machine_ct_sec", None) if item else None
    manual_ct = getattr(item, "manual_ct_sec", None) if item else None
    bottleneck_ct = max(filter(None, [machine_ct, manual_ct]), default=None)

    # 다대수 담당 가능 여부 (공수C/T < 기계C/T)
    multi_machine = None
    if machine_ct and manual_ct and machine_ct > 0:
        multi_machine = round(machine_ct / manual_ct, 1) if manual_ct > 0 else None

    return {
        "year": year,
        "month": month,
        "part_no": part_no,
        "planned_qty": plan.planned_qty,
        "working_days": working_days,
        "daily_qty": round(daily_qty, 1),
        "work_time_min": work_time_min,
        "takt_time_sec": round(takt_sec, 1),
        "machine_ct_sec": machine_ct,
        "manual_ct_sec": manual_ct,
        "bottleneck": "공수" if (machine_ct and manual_ct and manual_ct > machine_ct)
                      else "설비" if (machine_ct and manual_ct and machine_ct >= manual_ct)
                      else "미설정",
        "multi_machine_possible": multi_machine,
        "status": "초과" if bottleneck_ct and bottleneck_ct > takt_sec else "정상",
    }


@router.get("/ct-status")
def get_ct_status(db: Session = Depends(get_db)):
    """C/T 3분할 현황 — 설비·공수·실제 비교"""
    items = db.query(Item).filter(Item.active == True).all()
    result = []
    for it in items:
        mct = getattr(it, "machine_ct_sec", None)
        act = getattr(it, "manual_ct_sec", None)
        if not mct and not act:
            continue
        result.append({
            "part_no": it.part_no,
            "name": it.name,
            "machine_ct_sec": mct,
            "manual_ct_sec": act,
            "bottleneck": "공수" if (mct and act and act > mct)
                          else "설비" if (mct and act and mct >= act)
                          else "미설정",
            "multi_machine_ratio": round(mct / act, 1) if (mct and act and act > 0) else None,
        })
    return result


# ════════════════════════════════════════════════════════════════════
# PATCH 3 — OEE 계산 (MES 데이터 기반)
# ════════════════════════════════════════════════════════════════════

@router.post("/oee/calculate")
def calculate_oee(
    prod_date: str = Query(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """MES 실적 → OEE 계산 & 저장, 임계값 초과 시 안돈 자동 발행"""
    try:
        d = date.fromisoformat(prod_date)
    except ValueError:
        raise HTTPException(400, "날짜 형식 오류")

    logs = db.query(MesProductionLog).filter(
        MesProductionLog.prod_date == d
    ).all()

    if not logs:
        return {"message": "해당 날짜 MES 데이터 없음", "count": 0}

    created = []
    alerts_fired = []

    # 설비별·품번별 집계
    groups: dict[tuple, list] = {}
    for log in logs:
        key = (log.machine_no or "unknown", log.part_no)
        groups.setdefault(key, []).append(log)

    for (machine_no, part_no), group_logs in groups.items():
        plan_qty = sum(g.plan_qty for g in group_logs)
        actual_qty = sum(g.actual_qty for g in group_logs)
        defect_qty = sum(g.defect_qty for g in group_logs)
        run_time = sum(g.run_time_min or 0 for g in group_logs)
        down_time = sum(g.down_time_min or 0 for g in group_logs)
        planned_time = run_time + down_time or 480

        item = db.query(Item).filter(Item.part_no == part_no).first()
        machine_ct = getattr(item, "machine_ct_sec", None) if item else None

        # actual_ct: 실제 가동시간 / 양품수량
        actual_ct = (run_time * 60 / actual_qty) if actual_qty > 0 else None

        # OEE 3요소
        availability = run_time / planned_time if planned_time > 0 else 0
        performance = (machine_ct * actual_qty / (run_time * 60)) \
                      if (machine_ct and run_time > 0 and actual_qty > 0) else None
        quality_rate = actual_qty / (actual_qty + defect_qty) \
                       if (actual_qty + defect_qty) > 0 else 1.0

        oee = availability * (performance or 1.0) * quality_rate

        # 기존 레코드 갱신 or 신규 생성
        existing = db.query(OeeDaily).filter(
            OeeDaily.prod_date == d,
            OeeDaily.machine_no == machine_no,
            OeeDaily.part_no == part_no,
        ).first()

        rec = existing or OeeDaily(prod_date=d, machine_no=machine_no, part_no=part_no)
        rec.planned_time_min = planned_time
        rec.run_time_min = run_time
        rec.stop_time_min = down_time
        rec.machine_ct_sec = machine_ct
        rec.actual_ct_sec = round(actual_ct, 1) if actual_ct else None
        rec.plan_qty = plan_qty
        rec.actual_qty = actual_qty
        rec.defect_qty = defect_qty
        rec.availability = round(availability, 4)
        rec.performance = round(performance, 4) if performance else None
        rec.quality_rate = round(quality_rate, 4)
        rec.oee = round(oee, 4)
        rec.calc_at = datetime.now()

        if not existing:
            db.add(rec)
        db.flush()

        created.append({
            "machine_no": machine_no,
            "part_no": part_no,
            "oee": round(oee * 100, 1),
            "availability": round(availability * 100, 1),
            "performance": round((performance or 0) * 100, 1),
            "quality_rate": round(quality_rate * 100, 1),
        })

        # 안돈 자동 발행
        alerts_fired += _check_andon(db, rec, item, d)

    db.commit()
    return {"date": prod_date, "calculated": len(created), "alerts": len(alerts_fired), "detail": created}


def _check_andon(db: Session, oee: OeeDaily, item, d: date) -> list:
    fired = []

    def _fire(alert_type, severity, title, detail, threshold, actual):
        # 당일 동일 타입 중복 방지
        exists = db.query(AndonAlert).filter(
            func.date(AndonAlert.alert_at) == d,
            AndonAlert.alert_type == alert_type,
            AndonAlert.machine_no == oee.machine_no,
            AndonAlert.part_no == oee.part_no,
            AndonAlert.is_resolved == False,
        ).first()
        if exists:
            return
        a = AndonAlert(
            alert_type=alert_type, severity=severity,
            machine_no=oee.machine_no, part_no=oee.part_no,
            title=title, detail=detail,
            threshold=threshold, actual_val=actual,
        )
        db.add(a)
        db.flush()
        # 카이젠 자동 등록
        kt = KaizenTask(
            title=f"[자동] {title}",
            category="생산성",
            source="안돈자동",
            machine_no=oee.machine_no,
            part_no=oee.part_no,
            before_value=f"{actual:.1f}",
            target_value=f"{threshold:.1f}",
            andon_alert_id=a.id,
            oee_daily_id=oee.id,
        )
        db.add(kt)
        fired.append(alert_type)

    if oee.oee is not None:
        if oee.oee < OEE_RED:
            _fire("oee_low", "red",
                  f"OEE 위험 — {oee.machine_no}/{oee.part_no}",
                  f"OEE {oee.oee*100:.1f}% (기준 {OEE_RED*100:.0f}%)",
                  OEE_RED * 100, oee.oee * 100)
        elif oee.oee < OEE_YELLOW:
            _fire("oee_low", "yellow",
                  f"OEE 주의 — {oee.machine_no}/{oee.part_no}",
                  f"OEE {oee.oee*100:.1f}% (기준 {OEE_YELLOW*100:.0f}%)",
                  OEE_YELLOW * 100, oee.oee * 100)

    total = (oee.actual_qty or 0) + (oee.defect_qty or 0)
    if total > 0:
        defect_rate = (oee.defect_qty or 0) / total * 100
        if defect_rate > DEFECT_THRESHOLD:
            _fire("defect_high", "red",
                  f"불량률 초과 — {oee.machine_no}/{oee.part_no}",
                  f"불량률 {defect_rate:.1f}% (기준 {DEFECT_THRESHOLD}%)",
                  DEFECT_THRESHOLD, defect_rate)

    if (oee.machine_ct_sec and oee.actual_ct_sec and
            oee.actual_ct_sec > oee.machine_ct_sec * SPEED_THRESHOLD):
        _fire("speed_loss", "yellow",
              f"속도 저하 — {oee.machine_no}/{oee.part_no}",
              f"실제C/T {oee.actual_ct_sec:.1f}초 > 설비C/T {oee.machine_ct_sec:.1f}초 × {SPEED_THRESHOLD}",
              oee.machine_ct_sec * SPEED_THRESHOLD, oee.actual_ct_sec)

    if oee.plan_qty and oee.actual_qty is not None:
        ratio = oee.actual_qty / oee.plan_qty if oee.plan_qty > 0 else 1
        if ratio < TARGET_THRESHOLD:
            _fire("target_miss", "red",
                  f"목표 미달 — {oee.machine_no}/{oee.part_no}",
                  f"계획 {oee.plan_qty}개 대비 실적 {oee.actual_qty}개 ({ratio*100:.0f}%)",
                  TARGET_THRESHOLD * 100, ratio * 100)

    return fired


@router.get("/oee")
def get_oee(
    start: str = Query(...),
    end: str = Query(...),
    machine_no: Optional[str] = None,
    part_no: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """OEE 조회"""
    try:
        s = date.fromisoformat(start)
        e = date.fromisoformat(end)
    except ValueError:
        raise HTTPException(400, "날짜 형식 오류")

    q = db.query(OeeDaily).filter(OeeDaily.prod_date.between(s, e))
    if machine_no:
        q = q.filter(OeeDaily.machine_no == machine_no)
    if part_no:
        q = q.filter(OeeDaily.part_no == part_no)

    rows = q.order_by(OeeDaily.prod_date.desc(), OeeDaily.machine_no).all()

    return [{
        "id": r.id,
        "prod_date": str(r.prod_date),
        "machine_no": r.machine_no,
        "part_no": r.part_no,
        "planned_time_min": r.planned_time_min,
        "run_time_min": r.run_time_min,
        "stop_time_min": r.stop_time_min,
        "plan_qty": r.plan_qty,
        "actual_qty": r.actual_qty,
        "defect_qty": r.defect_qty,
        "defect_rate": round(r.defect_qty / (r.actual_qty + r.defect_qty) * 100, 1)
                       if (r.actual_qty + r.defect_qty) > 0 else 0,
        "machine_ct_sec": r.machine_ct_sec,
        "actual_ct_sec": r.actual_ct_sec,
        "availability": round((r.availability or 0) * 100, 1),
        "performance": round((r.performance or 0) * 100, 1),
        "quality_rate": round((r.quality_rate or 0) * 100, 1),
        "oee": round((r.oee or 0) * 100, 1),
        "oee_grade": "A" if (r.oee or 0) >= 0.85 else
                     "B" if (r.oee or 0) >= 0.80 else
                     "C" if (r.oee or 0) >= 0.60 else "D",
    } for r in rows]


@router.get("/oee/summary")
def get_oee_summary(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    """월별 OEE 요약 — 설비별 평균"""
    import calendar
    _, days = calendar.monthrange(year, month)
    s = date(year, month, 1)
    e = date(year, month, days)

    rows = db.query(OeeDaily).filter(OeeDaily.prod_date.between(s, e)).all()

    machines: dict[str, dict] = {}
    for r in rows:
        m = machines.setdefault(r.machine_no, {
            "machine_no": r.machine_no,
            "days": 0,
            "total_plan": 0, "total_actual": 0, "total_defect": 0,
            "oee_sum": 0, "avail_sum": 0, "perf_sum": 0, "qual_sum": 0,
        })
        m["days"] += 1
        m["total_plan"] += r.plan_qty
        m["total_actual"] += r.actual_qty
        m["total_defect"] += r.defect_qty
        m["oee_sum"] += r.oee or 0
        m["avail_sum"] += r.availability or 0
        m["perf_sum"] += r.performance or 0
        m["qual_sum"] += r.quality_rate or 0

    result = []
    for m in machines.values():
        n = m["days"] or 1
        result.append({
            "machine_no": m["machine_no"],
            "days_recorded": m["days"],
            "total_plan": m["total_plan"],
            "total_actual": m["total_actual"],
            "total_defect": m["total_defect"],
            "avg_oee": round(m["oee_sum"] / n * 100, 1),
            "avg_availability": round(m["avail_sum"] / n * 100, 1),
            "avg_performance": round(m["perf_sum"] / n * 100, 1),
            "avg_quality": round(m["qual_sum"] / n * 100, 1),
        })

    return sorted(result, key=lambda x: x["avg_oee"])


@router.get("/machine-analysis")
def machine_analysis(year: int = Query(...), month: int = Query(...), db: Session = Depends(get_db)):
    """
    호기별 월간 생산실적 종합 분석
    - 계획수량 / 실적수량 / 이론최대수량 (가동시간 ÷ 표준C/T)
    - 표준C/T vs 실제C/T 비교 → C/T효율%
    - 금액환산: 실적금액 / 이론최대금액 / 기회손실금액
    """
    import calendar as cal
    first_day = date(year, month, 1)
    last_day  = date(year, month, cal.monthrange(year, month)[1])

    oee_rows = db.query(OeeDaily).filter(
        OeeDaily.prod_date >= first_day,
        OeeDaily.prod_date <= last_day,
    ).all()

    # OeeDaily 없으면 MesProductionLog로 대체
    if not oee_rows:
        mes = db.query(MesProductionLog).filter(
            MesProductionLog.prod_date >= first_day,
            MesProductionLog.prod_date <= last_day,
        ).all()
        # MesProductionLog → OeeDaily-호환 임시 객체로 변환
        from types import SimpleNamespace
        oee_rows = [SimpleNamespace(
            prod_date=r.prod_date,
            machine_no=r.machine_no,
            part_no=r.part_no,
            plan_qty=r.plan_qty,
            actual_qty=r.actual_qty,
            defect_qty=r.defect_qty,
            run_time_min=r.run_time_min or 0,
            planned_time_min=(r.run_time_min or 0) + (r.down_time_min or 0) or 480,
            machine_ct_sec=None,
            actual_ct_sec=r.actual_ct_sec,
            oee=None,
            availability=None,
            performance=None,
            quality_rate=None,
        ) for r in mes]

    # ── 호기 × 품번 집계 ──────────────────────────────────────────
    grp: dict[tuple, dict] = {}
    for r in oee_rows:
        key = (r.machine_no or '미지정', r.part_no)
        if key not in grp:
            grp[key] = {
                "machine_no": r.machine_no or '미지정',
                "part_no": r.part_no,
                "days": 0,
                "plan_qty": 0, "actual_qty": 0, "defect_qty": 0,
                "run_time_min": 0.0, "planned_time_min": 0.0,
                "machine_ct_sec": r.machine_ct_sec,
                "act_ct_sum": 0.0, "act_ct_cnt": 0,
                "oee_sum": 0.0, "oee_cnt": 0,
                "avail_sum": 0.0, "perf_sum": 0.0,
            }
        g = grp[key]
        g["days"] += 1
        g["plan_qty"] += r.plan_qty or 0
        g["actual_qty"] += r.actual_qty or 0
        g["defect_qty"] += r.defect_qty or 0
        g["run_time_min"] += r.run_time_min or 0
        g["planned_time_min"] += r.planned_time_min or 0
        if r.machine_ct_sec and not g["machine_ct_sec"]:
            g["machine_ct_sec"] = r.machine_ct_sec
        if r.actual_ct_sec:
            g["act_ct_sum"] += r.actual_ct_sec
            g["act_ct_cnt"] += 1
        if r.oee is not None:
            g["oee_sum"] += r.oee
            g["oee_cnt"] += 1
        if r.availability is not None:
            g["avail_sum"] += r.availability
        if r.performance is not None:
            g["perf_sum"] += r.performance

    result = []
    tot_actual_rev = 0
    tot_ideal_rev  = 0

    for (mn, pn), g in grp.items():
        item = db.query(Item).filter(Item.part_no == pn).first()
        item_name  = item.name if item else None
        std_ct     = g["machine_ct_sec"] or (float(item.machine_ct_sec) if item and item.machine_ct_sec else None)
        sell_price = float(item.std_sell_price or 0) if item else 0.0

        avg_act_ct = round(g["act_ct_sum"] / g["act_ct_cnt"], 2) if g["act_ct_cnt"] > 0 else None

        # 이론최대수량: 순가동시간(분) × 60초 ÷ 표준C/T(초)
        ideal_qty  = int(g["run_time_min"] * 60 / std_ct) if (std_ct and g["run_time_min"] > 0) else None

        actual_rev = round(g["actual_qty"] * sell_price)
        ideal_rev  = round(ideal_qty * sell_price)  if ideal_qty is not None else None
        opp_loss   = round((ideal_qty - g["actual_qty"]) * sell_price) if ideal_qty is not None else None

        n = g["days"] or 1
        avg_oee    = round(g["oee_sum"]   / n * 100, 1) if g["oee_cnt"] > 0 else None
        avg_avail  = round(g["avail_sum"] / n * 100, 1) if n > 0 else None
        avg_perf   = round(g["perf_sum"]  / n * 100, 1) if n > 0 else None

        ct_eff = round(std_ct / avg_act_ct * 100, 1) if (std_ct and avg_act_ct and avg_act_ct > 0) else None
        achieve = round(g["actual_qty"] / g["plan_qty"] * 100, 1) if g["plan_qty"] > 0 else None

        tot_actual_rev += actual_rev
        tot_ideal_rev  += ideal_rev or actual_rev

        result.append({
            "machine_no": mn,
            "part_no": pn,
            "part_name": item_name,
            "working_days": g["days"],
            "plan_qty": g["plan_qty"],
            "actual_qty": g["actual_qty"],
            "defect_qty": g["defect_qty"],
            "total_run_time_min": round(g["run_time_min"], 1),
            "std_ct_sec": std_ct,
            "avg_actual_ct_sec": avg_act_ct,
            "ct_efficiency_pct": ct_eff,       # 표준/실제 × 100 — 100 이상이면 표준보다 빠름
            "ideal_qty": ideal_qty,
            "achieve_rate_pct": achieve,
            "std_sell_price": sell_price,
            "actual_revenue": actual_rev,
            "ideal_revenue": ideal_rev,
            "opportunity_loss": opp_loss,
            "avg_oee_pct": avg_oee,
            "avg_availability_pct": avg_avail,
            "avg_performance_pct": avg_perf,
        })

    result.sort(key=lambda x: x["actual_revenue"], reverse=True)

    return {
        "year": year,
        "month": month,
        "machines": result,
        "totals": {
            "actual_revenue": tot_actual_rev,
            "ideal_revenue": tot_ideal_rev,
            "opportunity_loss": tot_ideal_rev - tot_actual_rev,
        },
    }


# ════════════════════════════════════════════════════════════════════
# PATCH 4 — SMED (금형 교체 시간 추적)
# ════════════════════════════════════════════════════════════════════

class MoldChangeStart(BaseModel):
    machine_no: str
    mold_no_from: Optional[str] = None
    mold_no_to: str
    part_no: Optional[str] = None
    worker: Optional[str] = None
    target_min: float = 30
    note: Optional[str] = None


class MoldChangeEnd(BaseModel):
    note: Optional[str] = None


@router.post("/smed/start")
def smed_start(body: MoldChangeStart, db: Session = Depends(get_db)):
    """금형 교체 시작"""
    log = MoldChangeLog(
        change_date=date.today(),
        machine_no=body.machine_no,
        mold_no_from=body.mold_no_from,
        mold_no_to=body.mold_no_to,
        part_no=body.part_no,
        start_at=datetime.now(),
        target_min=body.target_min,
        worker=body.worker,
        note=body.note,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"id": log.id, "start_at": log.start_at.isoformat(), "message": "금형 교체 시작 기록됨"}


@router.patch("/smed/{log_id}/end")
def smed_end(log_id: int, body: MoldChangeEnd, db: Session = Depends(get_db)):
    """금형 교체 완료"""
    log = db.query(MoldChangeLog).filter(MoldChangeLog.id == log_id).first()
    if not log:
        raise HTTPException(404, "교체 기록 없음")
    if log.end_at:
        raise HTTPException(400, "이미 완료된 교체")

    log.end_at = datetime.now()
    log.duration_min = round((log.end_at - log.start_at).total_seconds() / 60, 1)
    if body.note:
        log.note = body.note

    # 목표 초과 시 안돈 발행
    if log.duration_min > log.target_min * 1.5:
        alert = AndonAlert(
            alert_type="smed_over",
            severity="yellow",
            machine_no=log.machine_no,
            part_no=log.part_no,
            title=f"금형교체 초과 — {log.machine_no}",
            detail=f"교체시간 {log.duration_min:.0f}분 (목표 {log.target_min:.0f}분)",
            threshold=log.target_min,
            actual_val=log.duration_min,
        )
        db.add(alert)

    db.commit()
    return {
        "id": log.id,
        "duration_min": log.duration_min,
        "target_min": log.target_min,
        "result": "목표달성" if log.duration_min <= log.target_min else "목표초과",
    }


@router.get("/loss-analysis")
def loss_analysis(year: int = Query(...), month: int = Query(...), db: Session = Depends(get_db)):
    """호기별·원인별 비가동 시간 집계 (OeeDaily loss_* 필드 활용)"""
    import calendar as cal
    first_day = date(year, month, 1)
    last_day  = date(year, month, cal.monthrange(year, month)[1])

    rows = db.query(OeeDaily).filter(
        OeeDaily.prod_date >= first_day,
        OeeDaily.prod_date <= last_day,
    ).all()

    LOSS_LABELS = {
        "breakdown":        "설비고장",
        "planned_change":   "금형교체(계획)",
        "unplanned_change": "금형교체(비계획)",
        "material":         "원료교체",
        "minor_stop":       "순간정지",
        "speed":            "속도저하",
        "defect":           "불량",
        "startup":          "초기유동",
        "other":            "기타",
    }

    totals: dict[str, float] = {k: 0.0 for k in LOSS_LABELS}
    by_machine: dict[str, dict] = {}

    for r in rows:
        mn = r.machine_no
        if mn not in by_machine:
            by_machine[mn] = {k: 0.0 for k in LOSS_LABELS}
            by_machine[mn]["total_stop"] = 0.0
            by_machine[mn]["planned_time"] = 0.0

        vals = {
            "breakdown":        r.loss_breakdown_min,
            "planned_change":   r.loss_planned_change_min,
            "unplanned_change": r.loss_unplanned_change_min,
            "material":         r.loss_material_min,
            "minor_stop":       r.loss_minor_stop_min,
            "speed":            r.loss_speed_min,
            "defect":           r.loss_defect_min,
            "startup":          r.loss_startup_min,
            "other":            r.loss_other_min,
        }
        for k, v in vals.items():
            v = v or 0.0
            totals[k]           += v
            by_machine[mn][k]   += v
        by_machine[mn]["total_stop"]    += (r.stop_time_min or 0.0)
        by_machine[mn]["planned_time"]  += (r.planned_time_min or 480)

    total_stop = sum(totals.values())
    summary = []
    for k, label in LOSS_LABELS.items():
        mins = round(totals[k], 1)
        summary.append({
            "loss_code":  k,
            "label":      label,
            "total_min":  mins,
            "share_pct":  round(mins / total_stop * 100, 1) if total_stop > 0 else 0,
        })
    summary.sort(key=lambda x: -x["total_min"])

    machine_list = []
    for mn, d in sorted(by_machine.items()):
        m_total = sum(d.get(k, 0) for k in LOSS_LABELS)
        pt = d["planned_time"] or 480
        machine_list.append({
            "machine_no": mn,
            "planned_time_min": round(d["planned_time"], 0),
            "total_stop_min":   round(d["total_stop"], 1),
            "stop_rate_pct":    round(d["total_stop"] / pt * 100, 1) if pt > 0 else 0,
            "breakdown": round(d["breakdown"], 1),
            "planned_change": round(d["planned_change"], 1),
            "unplanned_change": round(d["unplanned_change"], 1),
            "material": round(d["material"], 1),
            "minor_stop": round(d["minor_stop"], 1),
            "speed": round(d["speed"], 1),
            "defect": round(d["defect"], 1),
            "startup": round(d["startup"], 1),
            "other": round(d["other"], 1),
            "top_loss": max(LOSS_LABELS, key=lambda k: d.get(k, 0)) if m_total > 0 else None,
        })

    return {
        "year": year, "month": month,
        "total_stop_min": round(total_stop, 1),
        "summary": summary,
        "by_machine": machine_list,
    }


@router.get("/smed/analysis")
def smed_analysis(
    start: str = Query(...),
    end: str = Query(...),
    machine_no: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """SMED 분석 — 교체시간 추이·평균"""
    try:
        s = date.fromisoformat(start)
        e = date.fromisoformat(end)
    except ValueError:
        raise HTTPException(400, "날짜 형식 오류")

    q = db.query(MoldChangeLog).filter(
        MoldChangeLog.change_date.between(s, e),
        MoldChangeLog.duration_min.isnot(None),
    )
    if machine_no:
        q = q.filter(MoldChangeLog.machine_no == machine_no)

    logs = q.order_by(MoldChangeLog.change_date, MoldChangeLog.start_at).all()

    machines: dict[str, dict] = {}
    for lg in logs:
        m = machines.setdefault(lg.machine_no, {
            "machine_no": lg.machine_no, "count": 0,
            "total_min": 0, "over_count": 0,
        })
        m["count"] += 1
        m["total_min"] += lg.duration_min or 0
        if (lg.duration_min or 0) > lg.target_min:
            m["over_count"] += 1

    summary = [{
        "machine_no": m["machine_no"],
        "change_count": m["count"],
        "avg_min": round(m["total_min"] / m["count"], 1) if m["count"] else 0,
        "over_target_count": m["over_count"],
        "over_rate": round(m["over_count"] / m["count"] * 100, 1) if m["count"] else 0,
    } for m in machines.values()]

    detail = [{
        "id": lg.id,
        "change_date": str(lg.change_date),
        "machine_no": lg.machine_no,
        "mold_no_from": lg.mold_no_from,
        "mold_no_to": lg.mold_no_to,
        "part_no": lg.part_no,
        "duration_min": lg.duration_min,
        "target_min": lg.target_min,
        "result": "달성" if (lg.duration_min or 999) <= lg.target_min else "초과",
        "worker": lg.worker,
    } for lg in logs]

    return {"summary": summary, "detail": detail}


# ════════════════════════════════════════════════════════════════════
# PATCH 5 — 안돈 알림 조회·해제
# ════════════════════════════════════════════════════════════════════

@router.get("/andon/alerts")
def get_andon_alerts(
    resolved: bool = Query(default=False),
    severity: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """안돈 알림 목록"""
    q = db.query(AndonAlert).filter(AndonAlert.is_resolved == resolved)
    if severity:
        q = q.filter(AndonAlert.severity == severity)
    alerts = q.order_by(AndonAlert.alert_at.desc()).limit(limit).all()

    return [{
        "id": a.id,
        "alert_at": a.alert_at.isoformat(),
        "alert_type": a.alert_type,
        "severity": a.severity,
        "machine_no": a.machine_no,
        "part_no": a.part_no,
        "title": a.title,
        "detail": a.detail,
        "threshold": a.threshold,
        "actual_val": a.actual_val,
        "is_resolved": a.is_resolved,
    } for a in alerts]


@router.patch("/andon/alerts/{alert_id}/resolve")
def resolve_andon(
    alert_id: int,
    resolved_by: str = Query(...),
    db: Session = Depends(get_db),
):
    """안돈 알림 해제"""
    a = db.query(AndonAlert).filter(AndonAlert.id == alert_id).first()
    if not a:
        raise HTTPException(404, "알림 없음")
    a.is_resolved = True
    a.resolved_at = datetime.now()
    a.resolved_by = resolved_by
    db.commit()
    return {"ok": True, "resolved_at": a.resolved_at.isoformat()}


@router.get("/andon/summary")
def andon_summary(db: Session = Depends(get_db)):
    """안돈 현황 요약"""
    unresolved = db.query(AndonAlert).filter(AndonAlert.is_resolved == False).all()
    red = [a for a in unresolved if a.severity == "red"]
    yellow = [a for a in unresolved if a.severity == "yellow"]
    return {
        "total_unresolved": len(unresolved),
        "red": len(red),
        "yellow": len(yellow),
        "latest": {
            "id": unresolved[0].id if unresolved else None,
            "title": unresolved[0].title if unresolved else None,
            "alert_at": unresolved[0].alert_at.isoformat() if unresolved else None,
        }
    }


# ════════════════════════════════════════════════════════════════════
# PATCH 6 — 헤이준카 (월간계획 → 일별 평준화)
# ════════════════════════════════════════════════════════════════════

@router.get("/heijunka")
def get_heijunka(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    """헤이준카 박스 — 월 계획을 영업일별 균등 배분"""
    import calendar
    _, days_in_month = calendar.monthrange(year, month)

    working_days = [
        date(year, month, d)
        for d in range(1, days_in_month + 1)
        if date(year, month, d).weekday() < 5
    ]

    plans = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == year,
        MonthlyPlan.month == month,
    ).all()

    if not plans:
        return {"working_days": len(working_days), "items": []}

    # 실적 조회
    s = date(year, month, 1)
    e = date(year, month, days_in_month)
    actuals_raw = db.query(DailyActual).join(MonthlyPlan).filter(
        MonthlyPlan.year == year,
        MonthlyPlan.month == month,
        DailyActual.prod_date.between(s, e),
    ).all()

    actuals_map: dict[tuple, int] = {}
    for a in actuals_raw:
        actuals_map[(a.plan_id, str(a.prod_date))] = a.actual_qty

    n_days = len(working_days) or 1
    items = []
    for plan in plans:
        daily_plan = round(plan.planned_qty / n_days)
        item = db.query(Item).filter(Item.part_no == plan.part_no).first()

        daily_rows = []
        total_actual = 0
        for wd in working_days:
            act = actuals_map.get((plan.id, str(wd)), None)
            total_actual += act or 0
            daily_rows.append({
                "date": str(wd),
                "plan": daily_plan,
                "actual": act,
                "gap": (act - daily_plan) if act is not None else None,
                "status": "달성" if (act is not None and act >= daily_plan) else
                          "미달" if act is not None else "미입력",
            })

        items.append({
            "part_no": plan.part_no,
            "part_name": item.name if item else "",
            "monthly_plan": plan.planned_qty,
            "daily_plan": daily_plan,
            "total_actual": total_actual,
            "achievement_rate": round(total_actual / plan.planned_qty * 100, 1)
                                if plan.planned_qty else 0,
            "daily": daily_rows,
        })

    return {
        "year": year,
        "month": month,
        "working_days": n_days,
        "items": items,
    }
