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
from app.routers.auth import get_current_user, require_admin, require_admin_or_accounting
from app.models.hr import Employee, Attendance, Payroll, EmployeeKpi, EmployeeHrHistory

router = APIRouter(prefix="/hr", tags=["인사"])

COMPANY_LIST = ["조이산업", "넥스젬", "수아정밀"]

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
    job_grade: Optional[str] = None      # 호봉: CL1~CL6
    company: str = "조이산업"             # 소속 법인
    base_salary: float = 0               # 연봉제: 월 기본급
    hourly_rate: float = 0               # 시급제: 시급
    weekly_hours: int = 40
    std_monthly_hours: int = 209
    fixed_ot_hrs: int = 0                # 월 고정 연장시간 (과장급 이상 50h)
    fixed_holiday_hrs: int = 0           # 월 고정 특근시간 (과장급 이상 16h)
    fixed_income_tax: int = 0            # 소득세 고정 (0이면 자동계산)
    fixed_local_tax: int = 0             # 지방소득세 고정 (0이면 자동계산)
    birth_date: Optional[date] = None    # 생년월일 (만 60세 이상 국민연금 면제)
    foreman_allow_fixed: float = 0        # 반장수당 (과세)
    meal_allow_fixed: float = 0           # 사내식당 운영시 0
    vehicle_allow_fixed: float = 200000
    schedule_type: Optional[str] = None   # null=자동 / fixed / foreman / exempt
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
        "emp_type": e.emp_type, "job_grade": e.job_grade, "company": e.company,
        "base_salary": float(e.base_salary), "hourly_rate": float(e.hourly_rate),
        "weekly_hours": e.weekly_hours, "std_monthly_hours": e.std_monthly_hours,
        "fixed_ot_hrs": e.fixed_ot_hrs or 0,
        "fixed_holiday_hrs": e.fixed_holiday_hrs or 0,
        "fixed_income_tax": e.fixed_income_tax or 0,
        "fixed_local_tax": e.fixed_local_tax or 0,
        "birth_date": str(e.birth_date) if e.birth_date else None,
        "foreman_allow_fixed": float(e.foreman_allow_fixed or 0),
        "meal_allow_fixed": float(e.meal_allow_fixed),
        "vehicle_allow_fixed": float(e.vehicle_allow_fixed),
        "resident_no": e.resident_no, "phone": e.phone,
        "bank": e.bank, "bank_account": e.bank_account,
        "email": e.email, "note": e.note, "is_active": e.is_active,
        "created_at": str(e.created_at) if e.created_at else None,
    }


@router.get("/employees/debug")
def debug_employees(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """HR 테이블 디버그 — 모든 HR 테이블 컬럼 및 NOT NULL 정보 반환"""
    import traceback
    try:
        from sqlalchemy import text as _t
        result = {}
        with db.bind.connect() as conn:
            for tbl in ["hr_employee", "hr_attendance", "hr_payroll"]:
                exists = conn.execute(_t(
                    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name=:t)"
                ), {"t": tbl}).scalar()
                if exists:
                    cols = conn.execute(_t(
                        "SELECT column_name, data_type, is_nullable, column_default "
                        "FROM information_schema.columns "
                        "WHERE table_name=:t ORDER BY ordinal_position"
                    ), {"t": tbl}).fetchall()
                    result[tbl] = [{"name": c[0], "type": c[1], "nullable": c[2], "default": c[3]} for c in cols]
                else:
                    result[tbl] = None
        return result
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


@router.patch("/employees/{emp_id}/tax")
def update_employee_tax(emp_id: str, body: dict, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """직원별 소득세/지방소득세 고정값 설정"""
    e = db.get(Employee, emp_id)
    if not e:
        raise HTTPException(404)
    if "fixed_income_tax" in body:
        e.fixed_income_tax = int(body["fixed_income_tax"] or 0)
    if "fixed_local_tax" in body:
        e.fixed_local_tax = int(body["fixed_local_tax"] or 0)
    db.commit()
    return {"ok": True, "fixed_income_tax": e.fixed_income_tax, "fixed_local_tax": e.fixed_local_tax}


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
    leave_type: Optional[str] = None    # 연차/반차/병가/공가
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
        leave_type=body.leave_type, note=body.note,
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


@router.patch("/attendance/{att_id}/leave")
def set_leave_type(
    att_id: int,
    body: dict,
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    """결근 → 연차/반차/병가/공가 전환 (또는 취소).
    body: {"leave_type": "연차" | "반차" | "병가" | "공가" | null}
    연차: absent=False, work_hrs=8, ot_hrs=0
    반차: absent=False, work_hrs=4
    취소(null): absent=True, work_hrs=0
    """
    a = db.get(Attendance, att_id)
    if not a:
        raise HTTPException(404)

    lt = body.get("leave_type")  # None = 취소
    a.leave_type = lt
    if lt == "연차":
        a.absent = False; a.work_hrs = 8.0; a.ot_hrs = 0; a.ot_min = 0
    elif lt == "반차":
        a.absent = False; a.work_hrs = 4.0; a.ot_hrs = 0; a.ot_min = 0
    elif lt in ("병가", "공가"):
        a.absent = False; a.work_hrs = 8.0; a.ot_hrs = 0; a.ot_min = 0
    else:
        a.leave_type = None; a.absent = True; a.work_hrs = 0.0
    db.commit()
    return {"ok": True, "leave_type": a.leave_type, "absent": a.absent}


@router.delete("/attendance/{att_id}")
def delete_attendance(att_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    a = db.get(Attendance, att_id)
    if not a:
        raise HTTPException(404)
    db.delete(a)
    db.commit()
    return {"ok": True}


# ── 캡스 Excel 업로드 ──────────────────────────────────────────────────

# 근무 유형 판단 상수
_EXEMPT_POSITIONS  = {'대표', '상무이사', '전무이사'}
_MANAGER_POSITIONS = {'과장', '차장', '부장', '실장', '이사'}
_PROD_RULE_DEPTS   = {'생산', '금형', '출하'}
_FIXED_EMP_IDS     = {'N011', 'S001'}   # 주용하, 김영일 (금형 고정직)

# 생산룰: 08:30 출근 고정, 17:50 정규종료, 18:10~잔업 10분 단위
_PROD_IN   = dtime(8, 30)
_PROD_REG_END = dtime(17, 50)
_PROD_OT_START= dtime(18, 10)
_PROD_BREAK_MIN = 80   # 점심60 + 오전10 + 오후10

# 고정룰: 08:30~17:30
_FIX_IN  = dtime(8, 30)
_FIX_OUT = dtime(17, 30)
_FIX_WORK_HRS = 7.0   # (480 - 60점심) / 60

# 야간조: 20:30~08:30 (다음날)
_NIGHT_IN       = dtime(20, 30)
_NIGHT_OUT      = dtime(8, 30)   # 다음날 아침
_NIGHT_TOTAL_MIN = 720            # 20:30~08:30 = 12h
_NIGHT_BREAK_MIN = 80             # 휴게 80분 (주간과 동일)
_NIGHT_WORK_MIN  = _NIGHT_TOTAL_MIN - _NIGHT_BREAK_MIN  # 640분
_NIGHT_STD_MIN   = 480            # 하루 8h 기준
_NIGHT_HRS_STD   = 8              # 22:00~06:00 = 8h (야간수당 대상 구간)
_NIGHT_OT_MIN    = _NIGHT_WORK_MIN - _NIGHT_STD_MIN      # 160분 = 2h40m 연장


def _get_schedule(emp: Employee) -> str:
    """사원 근무 유형 반환: exempt / fixed / foreman / production"""
    if emp.schedule_type:
        return emp.schedule_type
    if emp.position in _EXEMPT_POSITIONS:
        return 'exempt'
    if emp.emp_id in _FIXED_EMP_IDS:
        return 'fixed'
    if emp.dept in _PROD_RULE_DEPTS:
        return 'production'
    return 'fixed'   # 사무직·관리자 모두 고정


def _to_minutes(t: dtime) -> int:
    return t.hour * 60 + t.minute


def _calc_production(caps_in: Optional[dtime], caps_out: Optional[dtime], is_holiday: bool):
    """생산 룰 계산 — 주간조 전용 (야간조는 _calc_night 사용)"""
    result = dict(
        check_in=None, check_out=None,
        work_hrs=0.0, ot_hrs=0, ot_min=0,
        night_hrs=0, night_min=0,
        holiday_hrs=0, holiday_min=0,
        absent=False, late=False,
    )

    # 퇴근 미기록 또는 출근 기록 없음 → 결근
    if caps_in is None or caps_out is None:
        result['absent'] = True
        return result

    # 출근 08:30 고정, 퇴근은 10분 단위 절사
    result['check_in'] = _PROD_IN
    co_min = (_to_minutes(caps_out) // 10) * 10
    co_h, co_m = divmod(co_min, 60)
    result['check_out'] = dtime(co_h, co_m)

    # 지각 체크 (CAPS 실제 출근이 08:30 초과)
    if _to_minutes(caps_in) > _to_minutes(_PROD_IN):
        result['late'] = True

    if is_holiday:
        # 휴일 근무: 전체를 holiday_min으로
        raw = co_min - _to_minutes(_PROD_IN) - _PROD_BREAK_MIN
        total_hol = max(0, (raw // 10) * 10)
        result['holiday_hrs'] = total_hol // 60
        result['holiday_min'] = total_hol % 60
        result['work_hrs'] = 0.0
    else:
        result['work_hrs'] = 8.0  # 정규 480분
        # 잔업: 18:10 이후, 10분 단위
        ot_start_min = _to_minutes(_PROD_OT_START)
        if co_min > ot_start_min:
            raw_ot = ((co_min - ot_start_min) // 10) * 10
            result['ot_hrs'] = raw_ot // 60
            result['ot_min'] = raw_ot % 60

    return result


def _calc_fixed(caps_in: Optional[dtime], caps_out: Optional[dtime], is_holiday: bool):
    """고정·반장 룰 → dict"""
    result = dict(
        check_in=None, check_out=None,
        work_hrs=0.0, ot_hrs=0, ot_min=0,
        night_hrs=0, night_min=0,
        holiday_hrs=0, holiday_min=0,
        absent=False, late=False,
    )
    if caps_in is None:
        result['absent'] = True
        return result

    if is_holiday:
        # 반장·생산직만 휴일수당 (foreman) — fixed는 holiday도 없음
        result['check_in'] = caps_in
        result['check_out'] = caps_out
        if caps_out:
            co_min = (_to_minutes(caps_out) // 10) * 10
            raw = co_min - _to_minutes(caps_in) - 60   # 점심 60분 제외
            total_hol = max(0, (raw // 10) * 10)
            result['holiday_hrs'] = total_hol // 60
            result['holiday_min'] = total_hol % 60
    else:
        result['check_in'] = _FIX_IN
        result['check_out'] = _FIX_OUT
        result['work_hrs'] = _FIX_WORK_HRS

    return result


def _calc_night(caps_in: Optional[dtime], caps_out: Optional[dtime], is_holiday: bool):
    """야간조(20:30~08:30) 계산 — 한국 근로기준법 야간근로 기준.
    야간수당 대상: 22:00~06:00 = 8h (night_hrs)
    연장수당: 총 640분 - 480분 = 160분 = 2h40m (ot_hrs/ot_min)
    야간+연장 중복분 가산은 payroll 모듈에서 처리.
    """
    if caps_in is None or caps_out is None:
        return dict(
            check_in=None, check_out=None,
            work_hrs=0.0, ot_hrs=0, ot_min=0,
            night_hrs=0, night_min=0,
            holiday_hrs=0, holiday_min=0,
            absent=True, late=False,
        )
    return dict(
        check_in=_NIGHT_IN,
        check_out=_NIGHT_OUT,
        work_hrs=round(_NIGHT_WORK_MIN / 60, 2),
        ot_hrs=_NIGHT_OT_MIN // 60,   # 2
        ot_min=_NIGHT_OT_MIN % 60,    # 40
        night_hrs=_NIGHT_HRS_STD,     # 8 (22:00~06:00)
        night_min=0,
        holiday_hrs=_NIGHT_WORK_MIN // 60 if is_holiday else 0,   # 10
        holiday_min=_NIGHT_WORK_MIN % 60  if is_holiday else 0,   # 40
        absent=False,
        late=False,
    )


def _week52_total_ot(emp_id: str, year: int, week: int, db) -> int:
    """해당 주 총 ot_min 합산 (주 52h 체크용, 기준 40h → 연장 최대 12h=720min)"""
    from sqlalchemy import func as sqlfunc
    rows = db.query(Attendance).filter(
        Attendance.emp_id == emp_id,
        sqlfunc.extract('year', Attendance.work_date) == year,
        sqlfunc.extract('week', Attendance.work_date) == week,
    ).all()
    return sum(r.ot_hrs * 60 + r.ot_min for r in rows)


@router.post("/attendance/upload-caps")
async def upload_caps_excel(
    file: UploadFile = File(...),
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    """
    캡스(CAPS) 출퇴근 Excel 업로드 — 가로형(1~31열=일자) 월간 집계표 형식.
    헤더: 부서 | 직급 | 이름 | 사원번호 | 구분 | 1 | 2 | ... | 31 | 총합
    각 직원당 출근행 + 퇴근행 2개 쌍.
    """
    import xlrd as _xlrd

    content = await file.read()

    # 파일 읽기: .xls → xlrd, .xlsx → openpyxl
    rows: list[list] = []
    fname = (file.filename or "").lower()
    if fname.endswith(".xls"):
        try:
            xbook = _xlrd.open_workbook(file_contents=content)
            xsheet = xbook.sheet_by_index(0)
            rows = [list(xsheet.row_values(i)) for i in range(xsheet.nrows)]
        except Exception as e:
            raise HTTPException(400, f"xls 읽기 실패: {e}")
    else:
        try:
            import openpyxl
            wb = openpyxl.load_workbook(BytesIO(content), data_only=True)
            rows = [list(r) for r in wb.active.iter_rows(values_only=True)]
        except Exception as e:
            raise HTTPException(400, f"xlsx 읽기 실패: {e}")

    if len(rows) < 2:
        raise HTTPException(400, "데이터가 없습니다")

    headers = [str(h).strip() if h is not None else "" for h in rows[0]]

    def find_col(candidates: list[str]) -> Optional[int]:
        for c in candidates:
            for i, h in enumerate(headers):
                if c in h:
                    return i
        return None

    col_name  = find_col(['이름', '성명', '직원명'])
    col_gubun = find_col(['구분'])
    # 일(1~31) 컬럼 인덱스 맵
    day_cols: dict[int, int] = {}
    for i, h in enumerate(headers):
        h = h.strip()
        try:
            d = int(float(h))
            if 1 <= d <= 31:
                day_cols[d] = i
        except (ValueError, TypeError):
            pass

    if col_name is None or col_gubun is None or not day_cols:
        raise HTTPException(400, f"필수 컬럼(이름/구분/날짜1~31) 미발견. 헤더: {headers}")

    def parse_time_cell(val) -> Optional[str]:
        """셀값 → 'HH:MM' 문자열 (없으면 None)"""
        if val is None or val == "":
            return None
        if isinstance(val, float) and 0 < val < 1:
            # xlrd 시간 소수
            total_min = round(val * 24 * 60)
            return f"{total_min // 60:02d}:{total_min % 60:02d}"
        s = str(val).strip()
        if not s or s in ("None", "nan"):
            return None
        if ":" in s:
            return s[:5]
        if len(s) == 4 and s.isdigit():
            return f"{s[:2]}:{s[2:]}"
        return None

    # 사원 맵 (이름 → Employee)
    all_emps = {e.name: e for e in db.query(Employee).all()}

    # 행 파싱: 출근행/퇴근행 쌍 수집
    # {이름: {day: {'in': 'HH:MM', 'out': 'HH:MM'}}}
    emp_days: dict[str, dict[int, dict]] = {}
    cur_name: str | None = None

    for row in rows[1:]:
        raw_name = str(row[col_name]).strip() if row[col_name] else ""
        if raw_name and raw_name not in ("None", "nan"):
            cur_name = raw_name
        if cur_name is None:
            continue

        gubun = str(row[col_gubun]).strip() if row[col_gubun] else ""
        if gubun not in ("출근", "퇴근"):
            continue

        if cur_name not in emp_days:
            emp_days[cur_name] = {}

        for day, ci in day_cols.items():
            t = parse_time_cell(row[ci])
            if t:
                if day not in emp_days[cur_name]:
                    emp_days[cur_name][day] = {}
                key = "in" if gubun == "출근" else "out"
                emp_days[cur_name][day][key] = t

    # 출근 기록이 하나도 없는 날(결근)도 Attendance에 기록
    # → 해당 월 전체 평일을 순회하고 기록 없으면 absent
    import calendar
    _, days_in_month = calendar.monthrange(year, month)

    created = updated = skipped = 0
    errors: list = []
    warnings: list = []
    unmatched: set = set()

    for name, day_map in emp_days.items():
        emp = all_emps.get(name)
        if not emp:
            unmatched.add(name)
            continue

        schedule = _get_schedule(emp)
        if schedule == 'exempt':
            skipped += 1
            continue

        # CAPS에 기록 있는 날 처리
        # 야간조 cross-day: 출근 day N (20:30) + 퇴근 day N+1 (08:31) → day N 근무로 묶음
        processed_as_night_end: set[int] = set()

        for day in sorted(day_map.keys()):
            if day > days_in_month:
                continue
            if day in processed_as_night_end:
                continue  # 야간 퇴근행으로 소비된 날 건너뜀

            times = day_map[day]
            ci_str = times.get("in")
            co_str = times.get("out")

            # 출근 없이 퇴근만 있는 날(孤立 퇴근행) → skip
            if ci_str is None:
                continue

            ci = _parse_time(ci_str)
            is_night = ci is not None and _to_minutes(ci) >= 18 * 60

            # 야간조이고 같은 날 퇴근 없으면 → 다음날 열에서 퇴근 찾기
            if is_night and schedule == 'production' and co_str is None:
                next_day = day + 1
                if next_day <= days_in_month and next_day in day_map:
                    nxt = day_map[next_day]
                    if nxt.get("in") is None and nxt.get("out") is not None:
                        co_str = nxt["out"]
                        processed_as_night_end.add(next_day)

            co = _parse_time(co_str)

            try:
                work_date = date(year, month, day)
            except ValueError:
                continue

            is_weekend = work_date.weekday() >= 5

            if schedule == 'production' and is_night:
                calc = _calc_night(ci, co, is_weekend)
            elif schedule == 'production':
                calc = _calc_production(ci, co, is_weekend)
            elif schedule == 'foreman':
                calc = _calc_fixed(ci, co, is_weekend)
            else:  # fixed
                calc = _calc_fixed(ci, co, False)

            fields = dict(
                check_in=calc['check_in'], check_out=calc['check_out'],
                work_hrs=calc['work_hrs'],
                ot_hrs=calc['ot_hrs'], ot_min=calc['ot_min'],
                night_hrs=calc.get('night_hrs', 0), night_min=calc.get('night_min', 0),
                holiday_hrs=calc['holiday_hrs'], holiday_min=calc['holiday_min'],
                holiday=is_weekend and (calc['holiday_hrs'] > 0 or calc['holiday_min'] > 0),
                absent=calc['absent'], late=calc['late'],
                source="caps_excel",
            )

            existing = db.query(Attendance).filter(
                Attendance.emp_id == emp.emp_id,
                Attendance.work_date == work_date,
            ).first()
            if existing:
                for k, v in fields.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(Attendance(emp_id=emp.emp_id, work_date=work_date, **fields))
                created += 1

            # 주 52h 경고 (생산룰 주간조)
            if schedule == 'production' and not is_night and not calc['absent']:
                week_no = work_date.isocalendar()[1]
                week_ot = _week52_total_ot(emp.emp_id, work_date.year, week_no, db)
                week_ot += calc['ot_hrs'] * 60 + calc['ot_min']
                if week_ot > 720:
                    warnings.append({
                        "emp": name,
                        "week": f"{year}-W{week_no:02d}",
                        "ot_min": week_ot,
                        "msg": f"주 52h 초과 ({week_ot//60}h {week_ot%60}m)",
                    })

    db.commit()

    # 출근 데이터 저장 후 전체 직원 급여 재계산 (확정 상태 제외)
    # — CAPS에 없는 관리직·고정직도 fixed_ot_hrs/fixed_holiday_hrs 반영
    payroll_recalc_count = 0
    try:
        pr_results = _do_payroll(year, month, db, emp_ids=None, skip_confirmed=True)
        payroll_recalc_count = len(pr_results)
    except Exception as e:
        errors.append({"row": 0, "msg": f"급여 자동재계산 실패: {e}"})

    return {
        "created": created,
        "updated": updated,
        "skipped_exempt": skipped,
        "payroll_recalculated": payroll_recalc_count,
        "errors": errors,
        "warnings_52h": warnings,
        "unmatched": sorted(unmatched),
    }


# ── 급여 계산 ─────────────────────────────────────────────────────────

def _do_payroll(year: int, month: int, db, emp_ids: Optional[list] = None, skip_confirmed: bool = False):
    """급여 계산 핵심 로직. CAPS 업로드 자동 재계산 및 수동 계산 엔드포인트 공용."""
    import calendar
    start = date(year, month, 1)
    end   = date(year, month, calendar.monthrange(year, month)[1])

    emps = db.query(Employee).filter(Employee.is_active == True)
    if emp_ids:
        emps = emps.filter(Employee.emp_id.in_(emp_ids))
    emps = emps.all()

    results = []
    for emp in emps:
        # 확정 상태 급여는 재계산 건너뜀 (skip_confirmed=True일 때만)
        if skip_confirmed:
            pr_check = db.query(Payroll).filter(
                Payroll.emp_id == emp.emp_id, Payroll.year == year, Payroll.month == month
            ).first()
            if pr_check and pr_check.status == '확정':
                continue

        atts = db.query(Attendance).filter(
            Attendance.emp_id == emp.emp_id,
            Attendance.work_date >= start,
            Attendance.work_date <= end,
        ).all()

        total_ot_hrs  = sum(a.ot_hrs for a in atts)
        total_ot_min  = sum(a.ot_min for a in atts)
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

        # 연차/병가/공가는 결근으로 집계하지 않음
        absents   = sum(1 for a in atts if a.absent and not a.leave_type)
        std_m_hrs = emp.std_monthly_hours or 209

        # 중도입사/퇴사 일할계산 (입사일 or 퇴사일이 해당 월인 경우)
        total_days = calendar.monthrange(year, month)[1]
        prorate = Decimal("1")
        if emp.hire_date and emp.hire_date.year == year and emp.hire_date.month == month:
            worked_days = (end - emp.hire_date).days + 1
            prorate = Decimal(str(worked_days)) / Decimal(str(total_days))
        elif emp.retire_date and emp.retire_date.year == year and emp.retire_date.month == month:
            worked_days = (emp.retire_date - start).days + 1
            prorate = Decimal(str(worked_days)) / Decimal(str(total_days))

        # 고정 연장/특근시간 — 중도입사·퇴사 시 일할 적용
        fixed_ot_min_total = int((emp.fixed_ot_hrs or 0) * 60 * float(prorate))
        total_ot_hrs  += fixed_ot_min_total // 60
        total_ot_min  += fixed_ot_min_total % 60
        total_ot_hrs  += total_ot_min // 60
        total_ot_min   = total_ot_min % 60

        fixed_hol_min_total = int((emp.fixed_holiday_hrs or 0) * 60 * float(prorate))
        total_hol_hrs += fixed_hol_min_total // 60
        total_hol_min += fixed_hol_min_total % 60
        total_hol_hrs += total_hol_min // 60
        total_hol_min  = total_hol_min % 60

        if emp.emp_type == "hourly":
            std_hourly = Decimal(str(emp.hourly_rate))
            base_pay   = _round10(std_hourly * Decimal(str(std_m_hrs)) * prorate)
        else:
            # 연봉제: 통상시급은 풀 기본급 기준, 기본급만 일할 적용
            std_hourly = (Decimal(str(emp.base_salary)) / Decimal(str(std_m_hrs))).quantize(Decimal("0.01"), ROUND_HALF_UP)
            base_pay   = _round10(Decimal(str(emp.base_salary)) * prorate)

        ot_pay = (
            std_hourly * Decimal(total_ot_hrs) * Decimal("1.5")
            + std_hourly * (Decimal(total_ot_min) / 60) * Decimal("1.5")
        ).quantize(Decimal("1"), ROUND_HALF_UP)

        night_pay = (
            std_hourly * Decimal(total_night_hrs) * Decimal("0.5")
            + std_hourly * (Decimal(total_night_min) / 60) * Decimal("0.5")
        ).quantize(Decimal("1"), ROUND_HALF_UP)

        holiday_pay = (
            std_hourly * Decimal(total_hol_hrs) * Decimal("1.5")
            + std_hourly * (Decimal(total_hol_min) / 60) * Decimal("1.5")
        ).quantize(Decimal("1"), ROUND_HALF_UP)

        meal_allow     = Decimal("0")
        vehicle_allow  = _round10(Decimal(str(emp.vehicle_allow_fixed)) * prorate)
        foreman_allow  = Decimal(str(emp.foreman_allow_fixed or 0))

        gross   = base_pay + ot_pay + night_pay + holiday_pay + meal_allow + vehicle_allow + foreman_allow
        taxable = gross - min(meal_allow, NON_TAX_MEAL) - min(vehicle_allow, NON_TAX_VEH)

        age = 0
        if emp.birth_date:
            age = start.year - emp.birth_date.year
            if (start.month, start.day) < (emp.birth_date.month, emp.birth_date.day):
                age -= 1

        # 임원(대표·상무이사·전무이사) 여부
        is_exec = (emp.position or '') in _EXEMPT_POSITIONS or _get_schedule(emp) == 'exempt'

        # 국민연금: 만 60세 이상 면제
        pen  = Decimal(0) if (age >= 60) else _round10(taxable * RATE_PENSION)
        hlt  = _round10(taxable * RATE_HEALTH)
        lc   = _round10(hlt * RATE_LCARE)
        # 고용보험: 임원(대표·상무이사·전무이사) 면제
        emp_ = Decimal(0) if is_exec else _round10(taxable * RATE_EMPLOY)

        it = Decimal(str(emp.fixed_income_tax)) if emp.fixed_income_tax and emp.fixed_income_tax > 0 else _income_tax(taxable)
        lt = Decimal(str(emp.fixed_local_tax))  if emp.fixed_local_tax  and emp.fixed_local_tax  > 0 else _round10(it * Decimal("0.1"))

        total_deduct = pen + hlt + lc + emp_ + it + lt
        net_pay = gross - total_deduct

        pr = db.query(Payroll).filter(
            Payroll.emp_id == emp.emp_id, Payroll.year == year, Payroll.month == month,
        ).first()
        if not pr:
            pr = Payroll(emp_id=emp.emp_id, year=year, month=month)
            db.add(pr)

        pr.std_hrs = std_m_hrs; pr.std_hourly = std_hourly
        pr.pay_ot_hrs = total_ot_hrs; pr.pay_ot_min = total_ot_min
        pr.pay_night_hrs = total_night_hrs
        pr.pay_holiday_hrs = total_hol_hrs; pr.pay_holiday_min = total_hol_min
        pr.base_pay = base_pay; pr.ot_pay = ot_pay
        pr.night_pay = night_pay; pr.holiday_pay = holiday_pay
        pr.foreman_allow = foreman_allow; pr.meal_allow = meal_allow; pr.vehicle_allow = vehicle_allow
        pr.gross_pay = gross
        pr.deduct_pension = pen; pr.deduct_health = hlt; pr.deduct_lcare = lc
        pr.deduct_employ = emp_; pr.deduct_income_tax = it; pr.deduct_local_tax = lt
        pr.total_deduct = total_deduct; pr.net_pay = net_pay
        pr.status = "계산중"; pr.calculated_at = datetime.now()

        results.append({
            "emp_id": emp.emp_id, "name": emp.name,
            "std_hourly": float(std_hourly),
            "ot_hrs": total_ot_hrs, "ot_min": total_ot_min,
            "night_hrs": total_night_hrs,
            "absents": absents,
            "gross_pay": float(gross), "total_deduct": float(total_deduct), "net_pay": float(net_pay),
        })

    db.commit()
    return results


@router.post("/payroll/calculate")
def calculate_payroll(
    year: int = Query(...), month: int = Query(...),
    emp_id: Optional[str] = None,
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    """월 급여 자동계산 (수동 트리거)"""
    import traceback
    try:
        return _do_payroll(year, month, db, emp_ids=[emp_id] if emp_id else None)
    except Exception as ex:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"{type(ex).__name__}: {ex}\n{traceback.format_exc()}")




@router.get("/payroll")
def list_payroll(
    year: int = Query(...), month: Optional[int] = Query(None),
    emp_id: Optional[str] = None,
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    q = db.query(Payroll, Employee).join(Employee, Payroll.emp_id == Employee.emp_id).filter(
        Payroll.year == year
    )
    if month is not None:
        q = q.filter(Payroll.month == month)
    if emp_id:
        q = q.filter(Payroll.emp_id == emp_id)
    rows = q.order_by(Payroll.month).all()
    result = []
    for pr, emp in rows:
        d = {c.name: getattr(pr, c.name) for c in Payroll.__table__.columns}
        d["name"] = emp.name
        d["dept"] = emp.dept
        d["position"] = emp.position
        d["emp_type"] = emp.emp_type
        d["job_grade"] = emp.job_grade
        d["company"] = emp.company or "조이산업"
        d["birth_date"] = str(emp.birth_date) if emp.birth_date else None
        d["resident_no"] = emp.resident_no
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
    pr.gross_pay = pr.base_pay + pr.ot_pay + pr.night_pay + pr.holiday_pay + pr.foreman_allow + pr.meal_allow + pr.vehicle_allow + pr.bonus
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


# ── 급여 엑셀 내보내기 ────────────────────────────────────────────────

@router.get("/payroll/export-excel")
def export_payroll_excel(
    year: int = Query(...), month: int = Query(...),
    company: Optional[str] = Query(None),
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    import calendar, io, traceback as _tb
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        from fastapi.responses import StreamingResponse

        start = date(year, month, 1)
        end   = date(year, month, calendar.monthrange(year, month)[1])
        mm    = str(month).zfill(2)

        q = (
            db.query(Payroll, Employee)
            .join(Employee, Payroll.emp_id == Employee.emp_id)
            .filter(Payroll.year == year, Payroll.month == month)
        )
        if company:
            q = q.filter(Employee.company == company)
        rows = q.order_by(Employee.emp_id).all()
        company_label = company or "전체"

        att_map: dict = {}
        for emp_row in db.query(Employee).filter(Employee.is_active == True).all():
            atts = db.query(Attendance).filter(
                Attendance.emp_id == emp_row.emp_id,
                Attendance.work_date >= start,
                Attendance.work_date <= end,
            ).all()
            att_map[emp_row.emp_id] = sum(1 for a in atts if a.absent)

        def _side(): return Side(style="thin", color="000000")
        def _border(): return Border(left=_side(), right=_side(), top=_side(), bottom=_side())

        HDR = {
            "basic":  PatternFill("solid", fgColor="1F4E79"),
            "attend": PatternFill("solid", fgColor="2E75B6"),
            "pay":    PatternFill("solid", fgColor="375623"),
            "deduct": PatternFill("solid", fgColor="843C0C"),
            "result": PatternFill("solid", fgColor="4A235A"),
        }
        WF  = Font(name="Arial", bold=True, color="FFFFFF", size=9)
        DF  = Font(name="Arial", size=9)
        TF  = Font(name="Arial", bold=True, size=9)
        NF  = "#,##0"
        CA  = Alignment(horizontal="center", vertical="center", wrap_text=True)
        RA  = Alignment(horizontal="right",  vertical="center")
        LA  = Alignment(horizontal="left",   vertical="center")

        def hc(ws, r, c, v, fk, sr=1, sc=1):
            cell = ws.cell(row=r, column=c, value=v)
            cell.fill = HDR[fk]; cell.font = WF; cell.alignment = CA; cell.border = _border()
            if sr > 1 or sc > 1:
                ws.merge_cells(start_row=r, start_column=c, end_row=r+sr-1, end_column=c+sc-1)
            return cell

        def dc(ws, r, c, v, num=False, bold=False):
            cell = ws.cell(row=r, column=c, value=v if v is not None else (0 if num else ""))
            cell.font = TF if bold else DF; cell.border = _border()
            if num: cell.number_format = NF; cell.alignment = RA
            else:   cell.alignment = LA
            return cell

        wb = Workbook()

        # ── Sheet1: 급여정산표 ──
        ws1 = wb.active
        ws1.title = f"{year}.{mm} 급여정산표"
        ws1.freeze_panes = "E4"

        ws1.merge_cells("A1:AD1")
        tc = ws1.cell(row=1, column=1, value=f"{year}년 {month}월 급여정산표  [{company_label}]")
        tc.font = Font(name="Arial", bold=True, size=13)
        tc.alignment = CA
        tc.fill = PatternFill("solid", fgColor="DEEAF1")

        C = dict(no=1,name=2,hire=3,rate=4,
                 ot=5,night=6,hol=7,annual=8,off=9,absent=10,late=11,early=12,week=13,
                 base=14,ot_pay=15,night_pay=16,hol_pay=17,foreman=18,vehicle=19,meal=20,bonus=21,gross=22,
                 pension=23,health=24,employ=25,lcare=26,income_tax=27,local_tax=28,total_deduct=29,
                 net=30)

        hc(ws1,2,C["no"],"기본정보","basic",sc=4)
        hc(ws1,2,C["ot"],"근  태","attend",sc=9)
        hc(ws1,2,C["base"],"지  급  내  역","pay",sc=9)
        hc(ws1,2,C["pension"],"공  제  내  역","deduct",sc=7)
        hc(ws1,2,C["net"],"실수령","result")

        for col,lbl,fk in [
            (C["no"],"순번","basic"),(C["name"],"이름","basic"),(C["hire"],"입사일","basic"),(C["rate"],f"{year}\n시급","basic"),
            (C["ot"],"연장","attend"),(C["night"],"심야","attend"),(C["hol"],"특근","attend"),
            (C["annual"],"연차","attend"),(C["off"],"휴무","attend"),(C["absent"],"결근","attend"),
            (C["late"],"지각","attend"),(C["early"],"조퇴/\n외출","attend"),(C["week"],"주차","attend"),
            (C["base"],"기본급","pay"),(C["ot_pay"],"연장\n수당","pay"),(C["night_pay"],"심야\n수당","pay"),
            (C["hol_pay"],"특근\n수당","pay"),(C["foreman"],"반장\n수당","pay"),(C["vehicle"],"차량\n유지비","pay"),
            (C["meal"],"식대","pay"),(C["bonus"],"상여","pay"),(C["gross"],"총지급","pay"),
            (C["pension"],"국민\n연금","deduct"),(C["health"],"건강\n보험","deduct"),(C["employ"],"고용\n보험","deduct"),
            (C["lcare"],"장기\n요양","deduct"),(C["income_tax"],"소득세","deduct"),(C["local_tax"],"지방\n소득세","deduct"),
            (C["total_deduct"],"총공제","deduct"),(C["net"],"실수령","result"),
        ]:
            hc(ws1,3,col,lbl,fk)

        for i,(pr,emp) in enumerate(rows,1):
            r = i+3
            att_absent = att_map.get(emp.emp_id, 0)
            ot_h = pr.pay_ot_hrs or 0; ot_m = pr.pay_ot_min or 0
            dc(ws1,r,C["no"],i); dc(ws1,r,C["name"],emp.name); dc(ws1,r,C["hire"],str(emp.hire_date) if emp.hire_date else "")
            dc(ws1,r,C["rate"],float(pr.std_hourly or 0),num=True)
            dc(ws1,r,C["ot"],f"{ot_h}h"+(f" {ot_m}m" if ot_m else ""))
            dc(ws1,r,C["night"],f"{pr.pay_night_hrs or 0}h")
            dc(ws1,r,C["hol"],f"{pr.pay_holiday_hrs or 0}h")
            dc(ws1,r,C["annual"],""); dc(ws1,r,C["off"],"")
            dc(ws1,r,C["absent"],att_absent)
            dc(ws1,r,C["late"],""); dc(ws1,r,C["early"],""); dc(ws1,r,C["week"],"")
            dc(ws1,r,C["base"],float(pr.base_pay or 0),num=True)
            dc(ws1,r,C["ot_pay"],float(pr.ot_pay or 0),num=True)
            dc(ws1,r,C["night_pay"],float(pr.night_pay or 0),num=True)
            dc(ws1,r,C["hol_pay"],float(pr.holiday_pay or 0),num=True)
            dc(ws1,r,C["foreman"],float(getattr(pr,"foreman_allow",None) or 0),num=True)
            dc(ws1,r,C["vehicle"],float(pr.vehicle_allow or 0),num=True)
            dc(ws1,r,C["meal"],float(pr.meal_allow or 0),num=True)
            dc(ws1,r,C["bonus"],float(pr.bonus or 0),num=True)
            dc(ws1,r,C["gross"],float(pr.gross_pay or 0),num=True,bold=True)
            dc(ws1,r,C["pension"],float(pr.deduct_pension or 0),num=True)
            dc(ws1,r,C["health"],float(pr.deduct_health or 0),num=True)
            dc(ws1,r,C["employ"],float(pr.deduct_employ or 0),num=True)
            dc(ws1,r,C["lcare"],float(pr.deduct_lcare or 0),num=True)
            dc(ws1,r,C["income_tax"],float(pr.deduct_income_tax or 0),num=True)
            dc(ws1,r,C["local_tax"],float(pr.deduct_local_tax or 0),num=True)
            dc(ws1,r,C["total_deduct"],float(pr.total_deduct or 0),num=True,bold=True)
            dc(ws1,r,C["net"],float(pr.net_pay or 0),num=True,bold=True)

        if rows:
            tr = len(rows)+4
            mc = ws1.cell(row=tr,column=1,value="합 계"); mc.font=TF; mc.alignment=CA
            ws1.merge_cells(start_row=tr,start_column=1,end_row=tr,end_column=4)
            for col in [C["base"],C["ot_pay"],C["night_pay"],C["hol_pay"],
                        C["foreman"],C["vehicle"],C["meal"],C["bonus"],C["gross"],
                        C["pension"],C["health"],C["employ"],C["lcare"],
                        C["income_tax"],C["local_tax"],C["total_deduct"],C["net"]]:
                cl = get_column_letter(col)
                sc2 = ws1.cell(row=tr,column=col,value=f"=SUM({cl}4:{cl}{len(rows)+3})")
                sc2.font=TF; sc2.number_format=NF; sc2.alignment=RA; sc2.border=_border()
                sc2.fill=PatternFill("solid",fgColor="FFF2CC")

        for col,w in {1:5,2:9,3:12,4:11,5:7,6:7,7:7,8:6,9:6,10:6,11:6,12:7,13:6,
                      14:13,15:10,16:10,17:10,18:10,19:10,20:8,21:8,22:13,
                      23:10,24:10,25:10,26:10,27:10,28:10,29:11,30:13}.items():
            ws1.column_dimensions[get_column_letter(col)].width = w
        ws1.row_dimensions[1].height=22; ws1.row_dimensions[2].height=18; ws1.row_dimensions[3].height=32

        # ── Sheet2: 급여명세표 ──
        ws2 = wb.create_sheet(f"{year}.{mm} 급여명세표")
        ws2.freeze_panes = "B1"

        INFO = ["사번","이름","부서","직급","입사일","통상시급","소정근로(h)","연장(h)","심야(h)","특근(h)"]
        PAY  = ["기본급","연장수당","심야수당","특근수당","반장수당","차량유지비","식대","상여","총지급액"]
        DED  = ["국민연금","건강보험","고용보험","장기요양보험","소득세","지방소득세","총공제액"]
        ALL  = INFO + PAY + DED + ["실수령액"]
        PAY_S = set(PAY); DED_S = set(DED)

        for ri,lbl in enumerate(ALL,1):
            fk = "basic" if lbl in INFO else ("pay" if lbl in PAY_S else ("deduct" if lbl in DED_S else "result"))
            cell = ws2.cell(row=ri,column=1,value=lbl)
            cell.fill=HDR[fk]; cell.font=WF; cell.alignment=CA; cell.border=_border()
        ws2.column_dimensions["A"].width=16

        num_start = len(INFO)+1
        for ci,(pr,emp) in enumerate(rows,2):
            vals = [
                emp.emp_id, emp.name, emp.dept or "", emp.position or "",
                str(emp.hire_date) if emp.hire_date else "",
                float(pr.std_hourly or 0), pr.std_hrs or 209,
                pr.pay_ot_hrs or 0, pr.pay_night_hrs or 0, pr.pay_holiday_hrs or 0,
                float(pr.base_pay or 0), float(pr.ot_pay or 0),
                float(pr.night_pay or 0), float(pr.holiday_pay or 0),
                float(getattr(pr,"foreman_allow",None) or 0),
                float(pr.vehicle_allow or 0), float(pr.meal_allow or 0),
                float(pr.bonus or 0), float(pr.gross_pay or 0),
                float(pr.deduct_pension or 0), float(pr.deduct_health or 0),
                float(pr.deduct_employ or 0), float(pr.deduct_lcare or 0),
                float(pr.deduct_income_tax or 0), float(pr.deduct_local_tax or 0),
                float(pr.total_deduct or 0), float(pr.net_pay or 0),
            ]
            for ri2,val in enumerate(vals,1):
                is_num = ri2 >= num_start
                cell = ws2.cell(row=ri2,column=ci,value=val)
                cell.border=_border()
                cell.font = TF if ALL[ri2-1] in ("총지급액","총공제액","실수령액") else DF
                if is_num: cell.number_format=NF; cell.alignment=RA
                else:      cell.alignment=LA
            ws2.column_dimensions[get_column_letter(ci)].width=13

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        import urllib.parse
        co_suffix = f"_{company}" if company else ""
        fname_raw = f"{year}{mm}_급여정산표{co_suffix}.xlsx"
        fname_enc = urllib.parse.quote(fname_raw.encode("utf-8"))
        # ASCII fallback에는 한글 미포함 (latin-1 인코딩 불가)
        fname_ascii = f"{year}{mm}_payroll{'_' + str(COMPANY_LIST.index(company)+1) if company and company in COMPANY_LIST else ''}.xlsx"
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=\"{fname_ascii}\"; filename*=UTF-8''{fname_enc}"},
        )
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"{type(ex).__name__}: {ex}\n{_tb.format_exc()}")


# ── 결근자 목록 (급여 자동계산 전 확인용) ──────────────────────────────

@router.get("/attendance/absents")
def attendance_absents(
    year: int = Query(...), month: int = Query(...),
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    """leave_type 없는 결근 레코드를 직원별로 그룹핑해서 반환"""
    import calendar
    start = date(year, month, 1)
    end   = date(year, month, calendar.monthrange(year, month)[1])

    rows = (
        db.query(Attendance, Employee.name, Employee.dept)
        .join(Employee, Attendance.emp_id == Employee.emp_id)
        .filter(
            Attendance.work_date >= start,
            Attendance.work_date <= end,
            Attendance.absent == True,
            Attendance.leave_type == None,
        )
        .order_by(Attendance.emp_id, Attendance.work_date)
        .all()
    )

    grouped: dict = {}
    for att, name, dept in rows:
        if att.emp_id not in grouped:
            grouped[att.emp_id] = {"emp_id": att.emp_id, "name": name, "dept": dept, "dates": []}
        grouped[att.emp_id]["dates"].append({"id": att.id, "work_date": str(att.work_date)})

    return list(grouped.values())


# ── 결근 → 출근 처리 (주야간 자동 감지) ───────────────────────────────

@router.post("/attendance/{att_id}/mark-present")
def mark_attendance_present(
    att_id: int,
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    """결근 레코드를 출근으로 전환. 같은 주 기록으로 주야간 자동 감지."""
    from datetime import timedelta, time as dtime

    att = db.get(Attendance, att_id)
    if not att:
        raise HTTPException(status_code=404, detail="레코드 없음")

    # 같은 주의 다른 출근 기록으로 야간 여부 판단
    week_start = att.work_date - timedelta(days=att.work_date.weekday())
    week_end   = week_start + timedelta(days=6)

    nearby = db.query(Attendance).filter(
        Attendance.emp_id  == att.emp_id,
        Attendance.work_date >= week_start,
        Attendance.work_date <= week_end,
        Attendance.absent  == False,
        Attendance.check_in != None,
    ).all()

    is_night = False
    if nearby:
        night_cnt = sum(1 for a in nearby if a.check_in and a.check_in.hour >= 18)
        is_night  = night_cnt > len(nearby) / 2

    if is_night:
        att.check_in  = dtime(20, 30)
        att.check_out = dtime(8, 31)
    else:
        att.check_in  = dtime(8, 30)
        att.check_out = dtime(17, 30)

    att.work_hrs   = 8.0
    att.ot_hrs     = 0
    att.ot_min     = 0
    att.night_hrs  = 0
    att.night_min  = 0
    att.absent     = False
    att.leave_type = None
    att.late       = False

    db.commit()
    return {"shift": "night" if is_night else "day"}


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


@router.get("/attendance/year-summary")
def attendance_year_summary(
    year: int = Query(...),
    emp_id: str = Query(...),
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    """사원 1인의 연간 월별 출퇴근 집계"""
    from collections import defaultdict
    start = date(year, 1, 1)
    end   = date(year, 12, 31)
    atts  = db.query(Attendance).filter(
        Attendance.emp_id == emp_id,
        Attendance.work_date >= start,
        Attendance.work_date <= end,
    ).all()
    monthly: dict = defaultdict(list)
    for a in atts:
        monthly[a.work_date.month].append(a)
    return [
        {
            "month": m,
            "days":            len(monthly.get(m, [])),
            "total_ot_hrs":    sum(a.ot_hrs      for a in monthly.get(m, [])),
            "total_ot_min":    sum(a.ot_min      for a in monthly.get(m, [])),
            "total_night_hrs": sum(a.night_hrs   for a in monthly.get(m, [])),
            "total_hol_hrs":   sum(a.holiday_hrs for a in monthly.get(m, [])),
            "absents":         sum(1 for a in monthly.get(m, []) if a.absent),
        }
        for m in range(1, 13)
    ]


# ── KPI 평가 ──────────────────────────────────────────────────────────

GRADE_OPTIONS = ["S", "A", "B", "C", "D"]


class KpiIn(BaseModel):
    emp_id: str
    year: int
    month: int = 0  # 0 = 연간평가
    score_production: Optional[float] = None   # 생산목표 달성률
    score_quality: Optional[float] = None      # 품질
    score_attendance: Optional[float] = None   # 출근율
    score_attitude: Optional[float] = None     # 업무태도
    total_score: Optional[float] = None        # 종합점수 (미입력 시 평균 자동계산)
    grade: Optional[str] = None                # S/A/B/C/D
    note: Optional[str] = None


def _kpi_dict(k: EmployeeKpi, name: str = "") -> dict:
    return {
        "id": k.id,
        "emp_id": k.emp_id,
        "name": name,
        "year": k.year,
        "month": k.month,
        "score_production": k.score_production,
        "score_quality": k.score_quality,
        "score_attendance": k.score_attendance,
        "score_attitude": k.score_attitude,
        "total_score": k.total_score,
        "grade": k.grade,
        "note": k.note,
        "evaluated_by": k.evaluated_by,
        "created_at": str(k.created_at) if k.created_at else None,
        "updated_at": str(k.updated_at) if k.updated_at else None,
    }


def _auto_grade(score: float) -> str:
    if score >= 90: return "S"
    if score >= 80: return "A"
    if score >= 70: return "B"
    if score >= 60: return "C"
    return "D"


@router.get("/kpi")
def list_kpi(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    emp_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(EmployeeKpi, Employee).join(Employee, EmployeeKpi.emp_id == Employee.emp_id)\
        .filter(EmployeeKpi.year == year)
    if month is not None:
        q = q.filter(EmployeeKpi.month == month)
    if emp_id:
        q = q.filter(EmployeeKpi.emp_id == emp_id)
    rows = q.order_by(EmployeeKpi.emp_id, EmployeeKpi.month).all()
    return [_kpi_dict(k, e.name) for k, e in rows]


@router.get("/kpi/latest")
def latest_kpi_per_employee(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """사원별 최근 KPI 한 건씩 반환"""
    from sqlalchemy import text as _t
    rows = db.execute(_t("""
        SELECT DISTINCT ON (emp_id) emp_id, id, year, month, total_score, grade, note
        FROM hr_employee_kpi
        ORDER BY emp_id, year DESC, month DESC
    """)).fetchall()
    return [
        {
            "emp_id": r[0], "id": r[1], "year": r[2], "month": r[3],
            "total_score": r[4], "grade": r[5], "note": r[6],
        }
        for r in rows
    ]


@router.post("/kpi")
def upsert_kpi(
    body: KpiIn,
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    scores = [s for s in [body.score_production, body.score_quality,
                           body.score_attendance, body.score_attitude] if s is not None]
    total = body.total_score if body.total_score is not None else (
        round(sum(scores) / len(scores), 1) if scores else None
    )
    grade = body.grade or (_auto_grade(total) if total is not None else None)

    existing = db.query(EmployeeKpi).filter(
        EmployeeKpi.emp_id == body.emp_id,
        EmployeeKpi.year == body.year,
        EmployeeKpi.month == body.month,
    ).first()

    if existing:
        existing.score_production = body.score_production
        existing.score_quality = body.score_quality
        existing.score_attendance = body.score_attendance
        existing.score_attitude = body.score_attitude
        existing.total_score = total
        existing.grade = grade
        existing.note = body.note
        existing.evaluated_by = user.name or user.id
        existing.updated_at = datetime.now()
        db.commit()
        emp = db.get(Employee, body.emp_id)
        return _kpi_dict(existing, emp.name if emp else "")
    else:
        k = EmployeeKpi(
            emp_id=body.emp_id,
            year=body.year,
            month=body.month,
            score_production=body.score_production,
            score_quality=body.score_quality,
            score_attendance=body.score_attendance,
            score_attitude=body.score_attitude,
            total_score=total,
            grade=grade,
            note=body.note,
            evaluated_by=user.name or user.id,
        )
        db.add(k)
        db.commit()
        db.refresh(k)
        emp = db.get(Employee, body.emp_id)
        return _kpi_dict(k, emp.name if emp else "")


@router.delete("/kpi/{kpi_id}")
def delete_kpi(kpi_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    k = db.get(EmployeeKpi, kpi_id)
    if not k:
        raise HTTPException(404)
    db.delete(k)
    db.commit()
    return {"ok": True}


# ── 인사기록 이력 ─────────────────────────────────────────────────────

class HrHistoryBody(BaseModel):
    event_date: str          # YYYY-MM-DD
    event_type: str
    title: str
    detail: Optional[str] = None


def _hist_dict(h: EmployeeHrHistory) -> dict:
    return {
        "id": h.id,
        "emp_id": h.emp_id,
        "event_date": str(h.event_date),
        "event_type": h.event_type,
        "title": h.title,
        "detail": h.detail,
        "recorded_by": h.recorded_by,
        "created_at": str(h.created_at),
    }


@router.get("/employees/{emp_id}/history")
def list_hr_history(
    emp_id: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    rows = (
        db.query(EmployeeHrHistory)
        .filter(EmployeeHrHistory.emp_id == emp_id)
        .order_by(EmployeeHrHistory.event_date)
        .all()
    )
    return [_hist_dict(r) for r in rows]


@router.post("/employees/{emp_id}/history")
def create_hr_history(
    emp_id: str,
    body: HrHistoryBody,
    db: Session = Depends(get_db),
    user=Depends(require_admin_or_accounting),
):
    emp = db.get(Employee, emp_id)
    if not emp:
        raise HTTPException(404, "사원 없음")
    h = EmployeeHrHistory(
        emp_id=emp_id,
        event_date=date.fromisoformat(body.event_date),
        event_type=body.event_type,
        title=body.title,
        detail=body.detail,
        recorded_by=user.name or user.id,
    )
    db.add(h)
    db.commit()
    db.refresh(h)
    return _hist_dict(h)


@router.put("/employees/history/{history_id}")
def update_hr_history(
    history_id: int,
    body: HrHistoryBody,
    db: Session = Depends(get_db),
    user=Depends(require_admin_or_accounting),
):
    from app.models.auth import UserRole
    h = db.get(EmployeeHrHistory, history_id)
    if not h:
        raise HTTPException(404)
    h.event_date = date.fromisoformat(body.event_date)
    h.event_type = body.event_type
    h.title = body.title
    h.detail = body.detail
    # admin이 수정할 때는 recorded_by 유지 (경리 이름 보존)
    # accounting이 수정할 때만 recorded_by 갱신
    if user.role == UserRole.accounting:
        h.recorded_by = user.name or user.id
    db.commit()
    db.refresh(h)
    return _hist_dict(h)


@router.delete("/employees/history/{history_id}")
def delete_hr_history(
    history_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin_or_accounting),
):
    h = db.get(EmployeeHrHistory, history_id)
    if not h:
        raise HTTPException(404)
    db.delete(h)
    db.commit()
    return {"ok": True}
