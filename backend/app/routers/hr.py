"""
인사(HR) 라우터
- 사원 마스터 CRUD
- 출퇴근 일별 관리 + 캡스 Excel 업로드 (시간 + 분 단위 추적)
- 월 급여 자동계산

[급여 계산 기준]
 연봉제: 통상시급 = 월기본급 / 월소정근로시간(기본209h)
 시급제: 통상시급 = 직접 등록한 시급
 기본급  = 통상시급 × 209h
 연장수당 = 통상시급 × 연장h × 1.5 + 통상시급 × 연장분/60 × 1.5
 심야수당 = 통상시급 × 야간h × 0.5  (기본급에 포함된 부분 제외, 추가분만)
 휴일수당 = 통상시급 × 휴일h × 1.5 + 통상시급 × 휴일분/60 × 1.5
 차량유지비/식대 = 사원별 고정 비과세 수당
 과세표준 = 총지급 - min(식대,200000) - min(차량,200000)
 4대보험 = 과세표준 × 법정요율 (10원 단위 반올림)
"""
from datetime import date, datetime, time as dtime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, Integer, cast
from pydantic import BaseModel

from app.database import get_db
from app.routers.auth import get_current_user
from app.models.hr import Employee, Attendance, Payroll

router = APIRouter(prefix="/hr", tags=["인사"])

# ── 2026 법정 보험요율 (근로자 부담) ──────────────────────────────────
RATE_PENSION  = Decimal("0.045")     # 국민연금 4.5%
RATE_HEALTH   = Decimal("0.03545")   # 건강보험 3.545%
RATE_LCARE    = Decimal("0.1295")    # 장기요양 (건강보험료의 12.95%)
RATE_EMPLOY   = Decimal("0.009")     # 고용보험 0.9%
NON_TAX_MEAL  = Decimal("200000")    # 식대 비과세 한도
NON_TAX_VEH   = Decimal("200000")    # 차량유지비 비과세 한도


def _round10(v: Decimal) -> Decimal:
    """10원 단위 반올림"""
    return (v / 10).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 10


def _income_tax(taxable: Decimal) -> Decimal:
    """소득세 간이세액표 (1인 기준, 2024 기준)"""
    g = int(taxable)
    if g <= 1_060_000: return Decimal(0)
    if g <= 1_500_000: return _round10(Decimal(round(g * 0.0106)))
    if g <= 3_000_000: return _round10(Decimal(round((g - 1_500_000) * 0.15 + 15900)))
    if g <= 4_500_000: return _round10(Decimal(round((g - 3_000_000) * 0.24 + 240900)))
    if g <= 8_000_000: return _round10(Decimal(round((g - 4_500_000) * 0.35 + 600900)))
    return _round10(Decimal(round((g - 8_000_000) * 0.38 + 1_825_900)))


# ── 사원 마스터 ────────────────────────────────────────────────────────

class EmployeeIn(BaseModel):
    emp_id: str
    name: str
    dept: Optional[str] = None
    position: Optional[str] = None
    hire_date: Optional[date] = None
    retire_date: Optional[date] = None
    emp_type: str = "annual"              # annual / hourly
    company: str = "조이산업"             # 소속 법인
    base_salary: float = 0               # 연봉제: 월 기본급
    hourly_rate: float = 0               # 시급제: 시급
    weekly_hours: int = 40
    std_monthly_hours: int = 209
    meal_allow_fixed: float = 0           # 사내식당 운영시 0
    vehicle_allow_fixed: float = 200000
    resident_no: Optional[str] = None
    phone: Optional[str] = None
    bank: Optional[str] = None
    bank_account: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None


def _emp_dict(e: Employee) -> dict:
    return {
        "emp_id": e.emp_id, "name": e.name, "dept": e.dept,
        "position": e.position, "hire_date": str(e.hire_date) if e.hire_date else None,
        "retire_date": str(e.retire_date) if e.retire_date else None,
        "emp_type": e.emp_type, "company": e.company,
        "base_salary": float(e.base_salary), "hourly_rate": float(e.hourly_rate),
        "weekly_hours": e.weekly_hours, "std_monthly_hours": e.std_monthly_hours,
        "meal_allow_fixed": float(e.meal_allow_fixed),
        "vehicle_allow_fixed": float(e.vehicle_allow_fixed),
        "resident_no": e.resident_no, "phone": e.phone,
        "bank": e.bank, "bank_account": e.bank_account,
        "email": e.email, "note": e.note, "is_active": e.is_active,
        "created_at": str(e.created_at) if e.created_at else None,
    }


@router.get("/employees/debug")
def debug_employees(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """HR 테이블 디버그 — 오류 상세 반환"""
    import traceback
    try:
        from sqlalchemy import text as _t
        with db.bind.connect() as conn:
            exists = conn.execute(_t(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='hr_employee')"
            )).scalar()
            if exists:
                cols = conn.execute(_t(
                    "SELECT column_name, data_type FROM information_schema.columns "
                    "WHERE table_name='hr_employee' ORDER BY ordinal_position"
                )).fetchall()
                return {"table_exists": True, "columns": [{"name": c[0], "type": c[1]} for c in cols]}
            return {"table_exists": False}
    except Exception as e:
        return {"error": str(e), "traceback": traceback.format_exc()}


@router.get("/employees")
def list_employees(active_only: bool = True, db: Session = Depends(get_db), _=Depends(get_current_user)):
    import traceback
    try:
        q = db.query(Employee)
        if active_only:
            q = q.filter(Employee.is_active == True)
        return [_emp_dict(e) for e in q.order_by(Employee.emp_id).all()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}\n{traceback.format_exc()}")


@router.post("/employees")
def create_employee(body: EmployeeIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    import traceback
    try:
        if db.get(Employee, body.emp_id):
            raise HTTPException(400, f"이미 존재하는 사번: {body.emp_id}")
        e = Employee(**body.model_dump())
        db.add(e)
        db.commit()
        db.refresh(e)
        return _emp_dict(e)
    except HTTPException:
        raise
    except Exception as ex:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"{type(ex).__name__}: {ex}\n{traceback.format_exc()}")


@router.patch("/employees/{emp_id}")
def update_employee(emp_id: str, body: EmployeeIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    e = db.get(Employee, emp_id)
    if not e:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude={"emp_id"}).items():
        setattr(e, k, v)
    db.commit()
    return _emp_dict(e)


@router.delete("/employees/{emp_id}")
def deactivate_employee(emp_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    e = db.get(Employee, emp_id)
    if not e:
        raise HTTPException(404)
    e.is_active = False
    db.commit()
    return {"ok": True}


# ── 출퇴근 ────────────────────────────────────────────────────────────

class AttendanceIn(BaseModel):
    emp_id: str
    work_date: date
    check_in: Optional[str] = None      # "08:30"
    check_out: Optional[str] = None     # "17:30"
    ot_hrs: int = 0                     # 연장 시간(h) — 수기 입력
    ot_min: int = 0                     # 연장 분(m)
    night_hrs: int = 0                  # 야간 시간(h)
    night_min: int = 0
    holiday_hrs: int = 0                # 휴일 시간(h)
    holiday_min: int = 0
    holiday: bool = False
    absent: bool = False
    half_day: bool = False
    note: Optional[str] = None


def _parse_time(s: Optional[str]) -> Optional[dtime]:
    if not s:
        return None
    try:
        s = s.strip().replace(".", ":")
        parts = s.split(":")
        return dtime(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
    except Exception:
        return None


def _total_work_hrs(check_in: Optional[dtime], check_out: Optional[dtime],
                    break_hrs: float = 1.0) -> float:
    if not check_in or not check_out:
        return 0.0
    total_min = (check_out.hour * 60 + check_out.minute) - (check_in.hour * 60 + check_in.minute)
    work_min = max(0, total_min - int(break_hrs * 60))
    return round(work_min / 60, 2)


@router.get("/attendance")
def list_attendance(
    year: int = Query(...), month: int = Query(...),
    emp_id: Optional[str] = None,
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    import calendar
    start = date(year, month, 1)
    end = date(year, month, calendar.monthrange(year, month)[1])
    q = db.query(Attendance).filter(
        Attendance.work_date >= start, Attendance.work_date <= end
    )
    if emp_id:
        q = q.filter(Attendance.emp_id == emp_id)
    return q.order_by(Attendance.work_date, Attendance.emp_id).all()


@router.post("/attendance")
def upsert_attendance(body: AttendanceIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    ci = _parse_time(body.check_in)
    co = _parse_time(body.check_out)
    work_hrs = _total_work_hrs(ci, co)

    data = dict(
        check_in=ci, check_out=co, work_hrs=work_hrs,
        ot_hrs=body.ot_hrs, ot_min=body.ot_min,
        night_hrs=body.night_hrs, night_min=body.night_min,
        holiday_hrs=body.holiday_hrs, holiday_min=body.holiday_min,
        holiday=body.holiday, absent=body.absent, half_day=body.half_day,
        note=body.note,
    )

    existing = db.query(Attendance).filter(
        Attendance.emp_id == body.emp_id,
        Attendance.work_date == body.work_date,
    ).first()

    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        db.commit()
        return existing
    else:
        a = Attendance(emp_id=body.emp_id, work_date=body.work_date, source="manual", **data)
        db.add(a)
        db.commit()
        db.refresh(a)
        return a


@router.delete("/attendance/{att_id}")
def delete_attendance(att_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    a = db.get(Attendance, att_id)
    if not a:
        raise HTTPException(404)
    db.delete(a)
    db.commit()
    return {"ok": True}


# ── 캡스 Excel 업로드 ──────────────────────────────────────────────────

@router.post("/attendance/upload-caps")
async def upload_caps_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    """
    캡스(CAPS) 출퇴근 Excel 업로드.
    컬럼 자동감지: 사번(사번/직원번호), 이름(이름/성명), 날짜(날짜/일자),
                   출근(출근시간/입실), 퇴근(퇴근시간/퇴실)
    """
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(500, "openpyxl 미설치")

    content = await file.read()
    wb = openpyxl.load_workbook(BytesIO(content), data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        raise HTTPException(400, "데이터가 없습니다")

    headers = [str(h).strip() if h is not None else "" for h in rows[0]]

    def find_col(candidates):
        for c in candidates:
            for i, h in enumerate(headers):
                if c in h:
                    return i
        return None

    col_emp_id = find_col(['사번', '직원번호', 'emp_id', 'EMP'])
    col_name   = find_col(['이름', '성명', '직원명', 'name'])
    col_date   = find_col(['날짜', '일자', '근무일', 'date'])
    col_in     = find_col(['출근', '출근시간', 'check_in', '입실'])
    col_out    = find_col(['퇴근', '퇴근시간', 'check_out', '퇴실'])

    if col_date is None:
        raise HTTPException(400, f"날짜 컬럼을 찾을 수 없습니다. 헤더: {headers}")

    name_map = {e.name: e.emp_id for e in db.query(Employee).all()}
    created = updated = 0
    errors = []

    for row_idx, row in enumerate(rows[1:], start=2):
        try:
            raw_emp = str(row[col_emp_id]).strip() if col_emp_id is not None and row[col_emp_id] is not None else ""
            if not raw_emp or raw_emp in ("None", "nan"):
                raw_name = str(row[col_name]).strip() if col_name is not None and row[col_name] is not None else ""
                emp_id = name_map.get(raw_name)
                if not emp_id:
                    errors.append({"row": row_idx, "msg": f"사원 미매칭: {raw_name}"})
                    continue
            else:
                emp_id = raw_emp

            raw_date = row[col_date]
            if raw_date is None:
                continue
            if isinstance(raw_date, (date, datetime)):
                work_date = raw_date.date() if isinstance(raw_date, datetime) else raw_date
            else:
                s = str(raw_date).strip().replace("/", "-").replace(".", "-")
                work_date = date.fromisoformat(s[:10])

            def parse_cell_time(val) -> Optional[str]:
                if val is None:
                    return None
                if isinstance(val, dtime):
                    return f"{val.hour:02d}:{val.minute:02d}"
                s = str(val).strip()
                if ":" in s:
                    return s[:5]
                if len(s) == 4 and s.isdigit():
                    return f"{s[:2]}:{s[2:]}"
                return s or None

            ci_str = parse_cell_time(row[col_in])  if col_in  is not None else None
            co_str = parse_cell_time(row[col_out]) if col_out is not None else None
            ci = _parse_time(ci_str)
            co = _parse_time(co_str)
            work_hrs = _total_work_hrs(ci, co)

            existing = db.query(Attendance).filter(
                Attendance.emp_id == emp_id, Attendance.work_date == work_date,
            ).first()

            if existing:
                existing.check_in = ci
                existing.check_out = co
                existing.work_hrs = work_hrs
                existing.source = "caps_excel"
                updated += 1
            else:
                db.add(Attendance(
                    emp_id=emp_id, work_date=work_date,
                    check_in=ci, check_out=co, work_hrs=work_hrs,
                    source="caps_excel",
                ))
                created += 1
        except Exception as ex:
            errors.append({"row": row_idx, "msg": str(ex)})

    db.commit()
    return {"created": created, "updated": updated, "errors": errors}


# ── 급여 계산 ─────────────────────────────────────────────────────────

@router.post("/payroll/calculate")
def calculate_payroll(
    year: int = Query(...), month: int = Query(...),
    emp_id: Optional[str] = None,
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    """
    월 급여 자동계산

    연봉제:
      통상시급 = 월기본급 / 월소정근로시간(기본 209h)
      기본급   = 통상시급 × 209h (= 월기본급 그대로)
    시급제:
      통상시급 = 등록된 시급
      기본급   = 통상시급 × 209h

    연장수당 = 통상시급 × 연장h × 1.5 + 통상시급 × 연장분/60 × 1.5
    심야수당 = 통상시급 × 야간h × 0.5  ← 추가 50%만 (기본은 기본급에 포함)
    휴일수당 = 통상시급 × 휴일h × 1.5 + 통상시급 × 휴일분/60 × 1.5

    과세표준 = 총지급 - min(식대, 200,000) - min(차량, 200,000)
    4대보험  = 과세표준 × 요율 (10원 반올림)
    """
    import calendar
    start = date(year, month, 1)
    end   = date(year, month, calendar.monthrange(year, month)[1])

    emps = db.query(Employee).filter(Employee.is_active == True)
    if emp_id:
        emps = emps.filter(Employee.emp_id == emp_id)
    emps = emps.all()

    results = []
    for emp in emps:
        # ── 출퇴근 집계 ─────────────────────────────────────────────
        atts = db.query(Attendance).filter(
            Attendance.emp_id == emp.emp_id,
            Attendance.work_date >= start,
            Attendance.work_date <= end,
        ).all()

        total_ot_hrs  = sum(a.ot_hrs for a in atts)
        total_ot_min  = sum(a.ot_min for a in atts)
        # 분이 60 이상이면 시간으로 올림
        total_ot_hrs  += total_ot_min // 60
        total_ot_min   = total_ot_min % 60

        total_night_hrs = sum(a.night_hrs for a in atts)
        total_night_min = sum(a.night_min for a in atts)
        total_night_hrs += total_night_min // 60
        total_night_min  = total_night_min % 60

        total_hol_hrs = sum(a.holiday_hrs for a in atts)
        total_hol_min = sum(a.holiday_min for a in atts)
        total_hol_hrs += total_hol_min // 60
        total_hol_min  = total_hol_min % 60

        absents = sum(1 for a in atts if a.absent)

        std_m_hrs = emp.std_monthly_hours or 209

        # ── 통상시급 ───────────────────────────────────────────────
        if emp.emp_type == "hourly":
            std_hourly = Decimal(str(emp.hourly_rate))
            base_pay   = (std_hourly * std_m_hrs).quantize(Decimal("1"), ROUND_HALF_UP)
        else:
            # 연봉제: 월기본급 등록 → 통상시급 역산
            base_pay   = Decimal(str(emp.base_salary)).quantize(Decimal("1"), ROUND_HALF_UP)
            std_hourly = (base_pay / Decimal(std_m_hrs)).quantize(Decimal("0.01"), ROUND_HALF_UP)

        # ── 연장수당: 시급 × h × 1.5 + 시급 × 분/60 × 1.5 ─────────
        ot_pay = (
            std_hourly * Decimal(total_ot_hrs) * Decimal("1.5")
            + std_hourly * (Decimal(total_ot_min) / 60) * Decimal("1.5")
        ).quantize(Decimal("1"), ROUND_HALF_UP)

        # ── 심야수당: 시급 × h × 0.5 (추가분만) ───────────────────
        night_pay = (
            std_hourly * Decimal(total_night_hrs) * Decimal("0.5")
            + std_hourly * (Decimal(total_night_min) / 60) * Decimal("0.5")
        ).quantize(Decimal("1"), ROUND_HALF_UP)

        # ── 휴일수당: 시급 × h × 1.5 + 시급 × 분/60 × 1.5 ─────────
        holiday_pay = (
            std_hourly * Decimal(total_hol_hrs) * Decimal("1.5")
            + std_hourly * (Decimal(total_hol_min) / 60) * Decimal("1.5")
        ).quantize(Decimal("1"), ROUND_HALF_UP)

        # ── 고정 비과세 수당 ───────────────────────────────────────
        meal_allow    = Decimal(str(emp.meal_allow_fixed))
        vehicle_allow = Decimal(str(emp.vehicle_allow_fixed))

        gross = base_pay + ot_pay + night_pay + holiday_pay + meal_allow + vehicle_allow

        # ── 과세표준 (비과세 제외) ──────────────────────────────────
        taxable = gross - min(meal_allow, NON_TAX_MEAL) - min(vehicle_allow, NON_TAX_VEH)

        # ── 4대보험 ────────────────────────────────────────────────
        pen  = _round10(taxable * RATE_PENSION)
        hlt  = _round10(taxable * RATE_HEALTH)
        lc   = _round10(hlt * RATE_LCARE)
        emp_ = _round10(taxable * RATE_EMPLOY)
        it   = _income_tax(taxable)
        lt   = _round10(it * Decimal("0.1"))

        total_deduct = pen + hlt + lc + emp_ + it + lt
        net_pay = gross - total_deduct

        # ── upsert ─────────────────────────────────────────────────
        pr = db.query(Payroll).filter(
            Payroll.emp_id == emp.emp_id,
            Payroll.year == year,
            Payroll.month == month,
        ).first()
        if not pr:
            pr = Payroll(emp_id=emp.emp_id, year=year, month=month)
            db.add(pr)

        pr.std_hrs       = std_m_hrs
        pr.std_hourly    = std_hourly
        pr.pay_ot_hrs    = total_ot_hrs
        pr.pay_ot_min    = total_ot_min
        pr.pay_night_hrs = total_night_hrs
        pr.pay_holiday_hrs = total_hol_hrs
        pr.pay_holiday_min = total_hol_min
        pr.base_pay      = base_pay
        pr.ot_pay        = ot_pay
        pr.night_pay     = night_pay
        pr.holiday_pay   = holiday_pay
        pr.meal_allow    = meal_allow
        pr.vehicle_allow = vehicle_allow
        pr.gross_pay     = gross
        pr.deduct_pension     = pen
        pr.deduct_health      = hlt
        pr.deduct_lcare       = lc
        pr.deduct_employ      = emp_
        pr.deduct_income_tax  = it
        pr.deduct_local_tax   = lt
        pr.total_deduct  = total_deduct
        pr.net_pay       = net_pay
        pr.status        = "계산중"
        pr.calculated_at = datetime.now()

        results.append({
            "emp_id": emp.emp_id, "name": emp.name,
            "std_hourly": float(std_hourly),
            "ot_hrs": total_ot_hrs, "ot_min": total_ot_min,
            "absents": absents,
            "gross_pay": float(gross),
            "total_deduct": float(total_deduct),
            "net_pay": float(net_pay),
        })

    db.commit()
    return results


@router.get("/payroll")
def list_payroll(
    year: int = Query(...), month: int = Query(...),
    emp_id: Optional[str] = None,
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    q = db.query(Payroll, Employee).join(Employee, Payroll.emp_id == Employee.emp_id).filter(
        Payroll.year == year, Payroll.month == month
    )
    if emp_id:
        q = q.filter(Payroll.emp_id == emp_id)
    rows = q.all()
    result = []
    for pr, emp in rows:
        d = {c.name: getattr(pr, c.name) for c in Payroll.__table__.columns}
        d["name"] = emp.name
        d["dept"] = emp.dept
        d["position"] = emp.position
        d["emp_type"] = emp.emp_type
        d["company"] = emp.company or "조이산업"
        # Decimal → float 변환
        for k, v in d.items():
            if isinstance(v, Decimal):
                d[k] = float(v)
        result.append(d)
    return result


@router.patch("/payroll/{payroll_id}/update")
def update_payroll_deductions(
    payroll_id: int,
    body: dict,
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    """4대보험 금액 수동 수정"""
    pr = db.get(Payroll, payroll_id)
    if not pr:
        raise HTTPException(404)
    allowed = {
        "deduct_pension", "deduct_health", "deduct_lcare", "deduct_employ",
        "deduct_income_tax", "deduct_local_tax", "bonus", "note",
    }
    for k, v in body.items():
        if k in allowed:
            setattr(pr, k, Decimal(str(v)) if v is not None else Decimal(0))
    # 합계 재계산
    pr.total_deduct = (
        pr.deduct_pension + pr.deduct_health + pr.deduct_lcare + pr.deduct_employ
        + pr.deduct_income_tax + pr.deduct_local_tax
    )
    pr.gross_pay = pr.base_pay + pr.ot_pay + pr.night_pay + pr.holiday_pay + pr.meal_allow + pr.vehicle_allow + pr.bonus
    pr.net_pay   = pr.gross_pay - pr.total_deduct
    db.commit()
    return {"ok": True, "net_pay": float(pr.net_pay)}


@router.patch("/payroll/{payroll_id}/confirm")
def confirm_payroll(payroll_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    pr = db.get(Payroll, payroll_id)
    if not pr:
        raise HTTPException(404)
    pr.status = "확정"
    pr.confirmed_at = datetime.now()
    db.commit()
    return {"ok": True}


@router.patch("/payroll/{payroll_id}/paid")
def mark_paid(payroll_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    pr = db.get(Payroll, payroll_id)
    if not pr:
        raise HTTPException(404)
    pr.status = "지급완료"
    db.commit()
    return {"ok": True}


# ── 월간 근무 요약 ─────────────────────────────────────────────────────

@router.get("/attendance/summary")
def attendance_summary(
    year: int = Query(...), month: int = Query(...),
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    import calendar
    start = date(year, month, 1)
    end   = date(year, month, calendar.monthrange(year, month)[1])

    rows = (
        db.query(
            Attendance.emp_id,
            Employee.name,
            Employee.dept,
            Employee.emp_type,
            func.count(Attendance.id).label("days"),
            func.sum(Attendance.work_hrs).label("total_work"),
            func.sum(Attendance.ot_hrs).label("total_ot_hrs"),
            func.sum(Attendance.ot_min).label("total_ot_min"),
            func.sum(Attendance.night_hrs).label("total_night_hrs"),
            func.sum(Attendance.holiday_hrs).label("total_hol_hrs"),
            func.sum(cast(Attendance.absent, Integer)).label("absents"),
            func.sum(cast(Attendance.holiday, Integer)).label("holidays"),
        )
        .join(Employee, Attendance.emp_id == Employee.emp_id)
        .filter(Attendance.work_date >= start, Attendance.work_date <= end)
        .group_by(Attendance.emp_id, Employee.name, Employee.dept, Employee.emp_type)
        .all()
    )

    return [
        {
            "emp_id": r.emp_id, "name": r.name, "dept": r.dept, "emp_type": r.emp_type,
            "days": r.days or 0,
            "total_work": round(float(r.total_work or 0), 1),
            "total_ot_hrs": int(r.total_ot_hrs or 0),
            "total_ot_min": int(r.total_ot_min or 0),
            "total_night_hrs": int(r.total_night_hrs or 0),
            "total_hol_hrs": int(r.total_hol_hrs or 0),
            "absents": int(r.absents or 0),
            "holidays": int(r.holidays or 0),
        }
        for r in rows
    ]
