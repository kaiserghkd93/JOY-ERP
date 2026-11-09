"""
인사(HR) 라우터
- 사원 마스터 CRUD
- 출퇴근 일별 관리 + 캡스 Excel 업로드
- 월 급여 자동계산 + 명세서
"""
from datetime import date, datetime, time as dtime
from decimal import Decimal
from typing import Optional, List
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, Integer, cast
from pydantic import BaseModel

from app.database import get_db
from app.routers.auth import get_current_user
from app.models.auth import User
from app.models.hr import Employee, Attendance, Payroll

router = APIRouter(prefix="/hr", tags=["인사"])


# ── 사원 마스터 ────────────────────────────────────────────────────────

class EmployeeIn(BaseModel):
    emp_id: str
    name: str
    dept: Optional[str] = None
    position: Optional[str] = None
    hire_date: Optional[date] = None
    retire_date: Optional[date] = None
    emp_type: str = "annual"           # annual / hourly
    base_salary: float = 0
    hourly_rate: float = 0
    weekly_hours: int = 40
    ot_rate: float = 1.5
    resident_no: Optional[str] = None
    phone: Optional[str] = None
    bank: Optional[str] = None
    bank_account: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None


@router.get("/employees")
def list_employees(active_only: bool = True, db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(Employee)
    if active_only:
        q = q.filter(Employee.is_active == True)
    return q.order_by(Employee.emp_id).all()


@router.post("/employees")
def create_employee(body: EmployeeIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    if db.get(Employee, body.emp_id):
        raise HTTPException(400, f"이미 존재하는 사번: {body.emp_id}")
    e = Employee(**body.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@router.patch("/employees/{emp_id}")
def update_employee(emp_id: str, body: EmployeeIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    e = db.get(Employee, emp_id)
    if not e:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude={"emp_id"}).items():
        setattr(e, k, v)
    db.commit()
    return e


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
    check_in: Optional[str] = None    # "08:30"
    check_out: Optional[str] = None   # "17:30"
    holiday: bool = False
    absent: bool = False
    half_day: bool = False
    note: Optional[str] = None


def _parse_time(s: Optional[str]) -> Optional[dtime]:
    if not s:
        return None
    try:
        parts = s.replace(":", "").strip()
        if len(parts) == 4:
            return dtime(int(parts[:2]), int(parts[2:]))
        return None
    except Exception:
        return None


def _calc_hours(check_in: Optional[dtime], check_out: Optional[dtime],
                std_start: dtime = dtime(8, 30), std_end: dtime = dtime(17, 30),
                break_hrs: float = 1.0) -> dict:
    """실근무·연장·야간 시간 계산"""
    if not check_in or not check_out:
        return {"work_hrs": 0.0, "ot_hrs": 0.0, "night_hrs": 0.0}

    def to_min(t: dtime) -> int:
        return t.hour * 60 + t.minute

    total_min = max(0, to_min(check_out) - to_min(check_in)) - int(break_hrs * 60)
    work_min = max(0, total_min)

    std_min = max(0, to_min(std_end) - to_min(std_in := std_start)) - int(break_hrs * 60)
    ot_min = max(0, work_min - std_min)

    # 야간: 22:00 ~ 06:00
    night_start = 22 * 60
    night_end_next = 6 * 60 + 24 * 60
    out_min = to_min(check_out)
    in_min = to_min(check_in)
    night_min = 0
    if out_min > night_start:
        night_min = out_min - night_start
    if in_min < 6 * 60:
        night_min += 6 * 60 - in_min

    return {
        "work_hrs": round(work_min / 60, 2),
        "ot_hrs": round(ot_min / 60, 2),
        "night_hrs": round(min(night_min, work_min) / 60, 2),
    }


@router.get("/attendance")
def list_attendance(
    year: int = Query(...), month: int = Query(...),
    emp_id: Optional[str] = None,
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    start = date(year, month, 1)
    import calendar
    end = date(year, month, calendar.monthrange(year, month)[1])
    q = db.query(Attendance).filter(
        Attendance.work_date >= start, Attendance.work_date <= end
    )
    if emp_id:
        q = q.filter(Attendance.emp_id == emp_id)
    rows = q.order_by(Attendance.work_date, Attendance.emp_id).all()
    return rows


@router.post("/attendance")
def upsert_attendance(body: AttendanceIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    ci = _parse_time(body.check_in)
    co = _parse_time(body.check_out)
    hrs = _calc_hours(ci, co)

    existing = db.query(Attendance).filter(
        Attendance.emp_id == body.emp_id,
        Attendance.work_date == body.work_date,
    ).first()

    if existing:
        existing.check_in = ci
        existing.check_out = co
        existing.work_hrs = hrs["work_hrs"]
        existing.ot_hrs = hrs["ot_hrs"]
        existing.night_hrs = hrs["night_hrs"]
        existing.holiday = body.holiday
        existing.absent = body.absent
        existing.half_day = body.half_day
        existing.note = body.note
        db.commit()
        return existing
    else:
        a = Attendance(
            emp_id=body.emp_id,
            work_date=body.work_date,
            check_in=ci,
            check_out=co,
            work_hrs=hrs["work_hrs"],
            ot_hrs=hrs["ot_hrs"],
            night_hrs=hrs["night_hrs"],
            holiday=body.holiday,
            absent=body.absent,
            half_day=body.half_day,
            note=body.note,
            source="manual",
        )
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
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    캡스(CAPS) 출퇴근 Excel 업로드.
    컬럼 자동 감지: 사번/이름, 날짜, 출근시간, 퇴근시간
    컬럼명 후보: ['사번','직원번호','emp_id'], ['이름','성명','name'],
                 ['날짜','일자','date'], ['출근','출근시간','check_in'],
                 ['퇴근','퇴근시간','check_out']
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

    col_emp_id  = find_col(['사번', '직원번호', 'emp_id', 'EMP'])
    col_name    = find_col(['이름', '성명', '직원명', 'name'])
    col_date    = find_col(['날짜', '일자', '근무일', 'date'])
    col_in      = find_col(['출근', '출근시간', 'check_in', '입실'])
    col_out     = find_col(['퇴근', '퇴근시간', 'check_out', '퇴실'])

    if col_date is None:
        raise HTTPException(400, f"날짜 컬럼을 찾을 수 없습니다. 헤더: {headers}")

    created = 0
    updated = 0
    errors = []

    # 사원이름 → emp_id 매핑 (이름 기반 업로드 대응)
    name_map = {e.name: e.emp_id for e in db.query(Employee).all()}

    for row_idx, row in enumerate(rows[1:], start=2):
        try:
            # 사번 결정
            raw_emp = str(row[col_emp_id]).strip() if col_emp_id is not None and row[col_emp_id] is not None else ""
            if not raw_emp or raw_emp == "None":
                # 이름으로 매핑
                raw_name = str(row[col_name]).strip() if col_name is not None and row[col_name] is not None else ""
                emp_id = name_map.get(raw_name)
                if not emp_id:
                    errors.append({"row": row_idx, "msg": f"사원 미매칭: {raw_name}"})
                    continue
            else:
                emp_id = raw_emp

            # 날짜 파싱
            raw_date = row[col_date]
            if raw_date is None:
                continue
            if isinstance(raw_date, (date, datetime)):
                work_date = raw_date.date() if isinstance(raw_date, datetime) else raw_date
            else:
                s = str(raw_date).strip().replace("/", "-").replace(".", "-")
                work_date = date.fromisoformat(s[:10])

            # 시간 파싱
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

            check_in_str  = parse_cell_time(row[col_in])  if col_in  is not None else None
            check_out_str = parse_cell_time(row[col_out]) if col_out is not None else None

            ci = _parse_time(check_in_str)
            co = _parse_time(check_out_str)
            hrs = _calc_hours(ci, co)

            existing = db.query(Attendance).filter(
                Attendance.emp_id == emp_id,
                Attendance.work_date == work_date,
            ).first()

            if existing:
                existing.check_in  = ci
                existing.check_out = co
                existing.work_hrs  = hrs["work_hrs"]
                existing.ot_hrs    = hrs["ot_hrs"]
                existing.night_hrs = hrs["night_hrs"]
                existing.source    = "caps_excel"
                updated += 1
            else:
                db.add(Attendance(
                    emp_id=emp_id, work_date=work_date,
                    check_in=ci, check_out=co,
                    work_hrs=hrs["work_hrs"], ot_hrs=hrs["ot_hrs"], night_hrs=hrs["night_hrs"],
                    source="caps_excel",
                ))
                created += 1

        except Exception as ex:
            errors.append({"row": row_idx, "msg": str(ex)})

    db.commit()
    return {"created": created, "updated": updated, "errors": errors}


# ── 급여 계산 ─────────────────────────────────────────────────────────

# 2024년 기준 4대보험 요율 (근로자 부담)
INS_PENSION  = Decimal("0.045")     # 국민연금
INS_HEALTH   = Decimal("0.03545")   # 건강보험
INS_LCARE    = Decimal("0.1295")    # 장기요양 (건강보험료 × 12.95%)
INS_EMPLOY   = Decimal("0.009")     # 고용보험

# 소득세 간이세액표 (월급 구간별, 간략화 — 1인 기준)
def _income_tax(gross: Decimal) -> Decimal:
    g = int(gross)
    if g <= 1_060_000: return Decimal(0)
    if g <= 1_500_000: return Decimal(round(g * 0.0106))
    if g <= 3_000_000: return Decimal(round((g - 1_500_000) * 0.15 + 15900))
    if g <= 4_500_000: return Decimal(round((g - 3_000_000) * 0.24 + 240900))
    if g <= 8_000_000: return Decimal(round((g - 4_500_000) * 0.35 + 600900))
    return Decimal(round((g - 8_000_000) * 0.38 + 1825900))


@router.post("/payroll/calculate")
def calculate_payroll(
    year: int = Query(...), month: int = Query(...),
    emp_id: Optional[str] = None,
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    """월 급여 자동계산 — 사원별 출퇴근 집계 → 급여 항목 계산 → upsert"""
    import calendar
    start = date(year, month, 1)
    end   = date(year, month, calendar.monthrange(year, month)[1])

    emps = db.query(Employee).filter(Employee.is_active == True)
    if emp_id:
        emps = emps.filter(Employee.emp_id == emp_id)
    emps = emps.all()

    results = []
    for emp in emps:
        # 출퇴근 집계
        atts = db.query(Attendance).filter(
            Attendance.emp_id == emp.emp_id,
            Attendance.work_date >= start,
            Attendance.work_date <= end,
        ).all()

        total_work = sum(a.work_hrs for a in atts)
        total_ot   = sum(a.ot_hrs for a in atts)
        total_night= sum(a.night_hrs for a in atts)
        holidays   = sum(1 for a in atts if a.holiday)
        absents    = sum(1 for a in atts if a.absent)

        if emp.emp_type == "hourly":
            hr = Decimal(str(emp.hourly_rate))
            base_pay    = hr * Decimal(str(total_work - total_ot))
            ot_pay      = hr * Decimal(str(emp.ot_rate)) * Decimal(str(total_ot))
            night_pay   = hr * Decimal("0.5") * Decimal(str(total_night))
            holiday_pay = hr * Decimal("1.5") * Decimal(str(holidays * 8))
        else:
            # 연봉제: 월 기본급 고정, 연장·야간은 통상임금 기준 추가 계산
            base_pay   = Decimal(str(emp.base_salary))
            hourly_std = base_pay / Decimal("209")  # 월 소정근로시간 209h
            ot_pay     = hourly_std * Decimal("0.5") * Decimal(str(total_ot))  # 연장 추가 50%
            night_pay  = hourly_std * Decimal("0.5") * Decimal(str(total_night))
            holiday_pay= Decimal(0)

        meal_allow  = Decimal("200000")   # 식대 20만원 비과세 고정
        trans_allow = Decimal("200000")   # 교통비 20만원 비과세 고정 (실운영 시 개인별 설정 필요)

        gross = base_pay + ot_pay + night_pay + holiday_pay + meal_allow + trans_allow
        taxable = gross - meal_allow - trans_allow  # 비과세 제외 과세표준

        pen  = (taxable * INS_PENSION).quantize(Decimal("1"))
        hlt  = (taxable * INS_HEALTH).quantize(Decimal("1"))
        lc   = (hlt * INS_LCARE).quantize(Decimal("1"))
        emp_ = (taxable * INS_EMPLOY).quantize(Decimal("1"))
        it   = _income_tax(taxable)
        lt   = (it * Decimal("0.1")).quantize(Decimal("1"))

        total_deduct = pen + hlt + lc + emp_ + it + lt
        net_pay = gross - total_deduct

        # upsert
        pr = db.query(Payroll).filter(
            Payroll.emp_id == emp.emp_id,
            Payroll.year == year,
            Payroll.month == month,
        ).first()
        if not pr:
            pr = Payroll(emp_id=emp.emp_id, year=year, month=month)
            db.add(pr)

        pr.base_pay = base_pay
        pr.ot_pay = ot_pay
        pr.night_pay = night_pay
        pr.holiday_pay = holiday_pay
        pr.meal_allow = meal_allow
        pr.trans_allow = trans_allow
        pr.gross_pay = gross
        pr.deduct_pension = pen
        pr.deduct_health = hlt
        pr.deduct_lcare = lc
        pr.deduct_employ = emp_
        pr.deduct_income_tax = it
        pr.deduct_local_tax = lt
        pr.total_deduct = total_deduct
        pr.net_pay = net_pay
        pr.status = "계산중"
        pr.calculated_at = datetime.now()

        results.append({
            "emp_id": emp.emp_id,
            "name": emp.name,
            "work_hrs": total_work,
            "ot_hrs": total_ot,
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
        result.append(d)
    return result


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
    """사원별 월간 근무 집계"""
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
            func.sum(Attendance.ot_hrs).label("total_ot"),
            func.sum(Attendance.night_hrs).label("total_night"),
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
            "total_ot": round(float(r.total_ot or 0), 1),
            "total_night": round(float(r.total_night or 0), 1),
            "absents": r.absents or 0,
            "holidays": r.holidays or 0,
        }
        for r in rows
    ]
