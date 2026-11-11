"""인사(HR) 모델 — 사원, 출퇴근, 급여"""
from datetime import date, datetime, time
from decimal import Decimal
from sqlalchemy import String, Integer, Float, Text, Date, DateTime, Time, Boolean, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Employee(Base):
    """사원 마스터"""
    __tablename__ = "hr_employee"

    emp_id: Mapped[str] = mapped_column(String(20), primary_key=True)   # EMP-001
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    dept: Mapped[str | None] = mapped_column(String(50))                 # 부서
    position: Mapped[str | None] = mapped_column(String(50))             # 직급
    hire_date: Mapped[date | None] = mapped_column(Date)
    retire_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    emp_type: Mapped[str] = mapped_column(String(20), default="annual")  # annual / hourly
    job_grade: Mapped[str | None] = mapped_column(String(10))             # 호봉: CL1~CL6
    company: Mapped[str] = mapped_column(String(50), default="조이산업")  # 소속 법인
    # 급여 기준
    base_salary: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)   # 연봉제: 월 기본급 / 시급제: 사용안함
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)   # 시급제: 시급 (연봉제: 통상시급=base_salary/209 자동계산)
    weekly_hours: Mapped[int] = mapped_column(Integer, default=40)             # 소정근로시간/주 (보통 40h)
    std_monthly_hours: Mapped[int] = mapped_column(Integer, default=209)       # 월 소정근로시간 (주40h = 209h)
    # 고정 OT (직급별)
    fixed_ot_hrs: Mapped[int] = mapped_column(Integer, default=0)       # 월 고정 연장시간 (과장급 이상 50h)
    fixed_holiday_hrs: Mapped[int] = mapped_column(Integer, default=0)  # 월 고정 특근시간 (과장급 이상 16h)
    # 직원별 고정 소득세 (0이면 자동계산)
    fixed_income_tax: Mapped[int] = mapped_column(Integer, default=0)   # 소득세 고정 (0=자동계산)
    fixed_local_tax: Mapped[int] = mapped_column(Integer, default=0)    # 지방소득세 고정 (0=자동계산)
    # 고정 수당
    foreman_allow_fixed: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)       # 반장수당 (과세)
    meal_allow_fixed: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)          # 식대 비과세 (사내식당 운영시 0)
    vehicle_allow_fixed: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=200000) # 차량유지비 (200,000 비과세)
    # 개인정보
    birth_date: Mapped[date | None] = mapped_column(Date)                # 생년월일 (만 60세 이상 국민연금 면제 계산용)
    resident_no: Mapped[str | None] = mapped_column(String(14))          # 주민등록번호 (평문: 실운영시 암호화 필요)
    phone: Mapped[str | None] = mapped_column(String(20))
    bank: Mapped[str | None] = mapped_column(String(30))
    bank_account: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    attendances: Mapped[list["Attendance"]] = relationship(back_populates="employee", cascade="all, delete-orphan")
    payrolls: Mapped[list["Payroll"]] = relationship(back_populates="employee", cascade="all, delete-orphan")
    kpis: Mapped[list["EmployeeKpi"]] = relationship(back_populates="employee", cascade="all, delete-orphan")


class Attendance(Base):
    """일별 출퇴근 기록"""
    __tablename__ = "hr_attendance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    emp_id: Mapped[str] = mapped_column(ForeignKey("hr_employee.emp_id"), nullable=False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    check_in: Mapped[time | None] = mapped_column(Time)
    check_out: Mapped[time | None] = mapped_column(Time)
    work_hrs: Mapped[float] = mapped_column(Float, default=0.0)    # 총 근무시간(h)
    ot_hrs: Mapped[int] = mapped_column(Integer, default=0)         # 연장근무 시간(h)
    ot_min: Mapped[int] = mapped_column(Integer, default=0)         # 연장근무 분(m, 0~59)
    night_hrs: Mapped[int] = mapped_column(Integer, default=0)      # 야간근무 시간(h)
    night_min: Mapped[int] = mapped_column(Integer, default=0)      # 야간근무 분(m)
    holiday_hrs: Mapped[int] = mapped_column(Integer, default=0)    # 휴일근무 시간(h)
    holiday_min: Mapped[int] = mapped_column(Integer, default=0)    # 휴일근무 분(m)
    holiday: Mapped[bool] = mapped_column(Boolean, default=False)   # 휴일근무 여부
    absent: Mapped[bool] = mapped_column(Boolean, default=False)    # 결근
    half_day: Mapped[bool] = mapped_column(Boolean, default=False)  # 반차
    note: Mapped[str | None] = mapped_column(String(200))
    source: Mapped[str | None] = mapped_column(String(20), default="manual")  # manual / caps_excel

    employee: Mapped["Employee"] = relationship(back_populates="attendances")

    __table_args__ = (
        __import__('sqlalchemy').UniqueConstraint('emp_id', 'work_date', name='uq_attendance_emp_date'),
    )


class EmployeeKpi(Base):
    """직원 KPI 평가"""
    __tablename__ = "hr_employee_kpi"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    emp_id: Mapped[str] = mapped_column(ForeignKey("hr_employee.emp_id"), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)   # 0 = 연간평가
    score_production: Mapped[float | None] = mapped_column(Float)   # 생산목표 달성률 (0-100)
    score_quality: Mapped[float | None] = mapped_column(Float)       # 품질 (0-100)
    score_attendance: Mapped[float | None] = mapped_column(Float)    # 출근율 (0-100)
    score_attitude: Mapped[float | None] = mapped_column(Float)      # 업무태도 (0-100)
    total_score: Mapped[float | None] = mapped_column(Float)         # 종합점수 (0-100)
    grade: Mapped[str | None] = mapped_column(String(5))             # S/A/B/C/D
    note: Mapped[str | None] = mapped_column(Text)
    evaluated_by: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, onupdate=datetime.now)

    employee: Mapped["Employee"] = relationship(back_populates="kpis")

    __table_args__ = (
        __import__('sqlalchemy').UniqueConstraint('emp_id', 'year', 'month', name='uq_kpi_emp_ym'),
    )


class Payroll(Base):
    """월 급여 명세"""
    __tablename__ = "hr_payroll"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    emp_id: Mapped[str] = mapped_column(ForeignKey("hr_employee.emp_id"), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    # 근무 집계 (명세서 표시용)
    std_hrs: Mapped[int] = mapped_column(Integer, default=209)       # 소정근로(h)
    pay_ot_hrs: Mapped[int] = mapped_column(Integer, default=0)      # 연장(h)
    pay_ot_min: Mapped[int] = mapped_column(Integer, default=0)      # 연장(m)
    pay_night_hrs: Mapped[int] = mapped_column(Integer, default=0)   # 야간(h)
    pay_holiday_hrs: Mapped[int] = mapped_column(Integer, default=0) # 휴일(h)
    pay_holiday_min: Mapped[int] = mapped_column(Integer, default=0) # 휴일(m)
    std_hourly: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)   # 통상시급
    # 지급
    base_pay: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)     # 기본급 (시급×209)
    ot_pay: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)       # 연장수당
    night_pay: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)    # 심야수당
    holiday_pay: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)  # 휴일수당
    foreman_allow: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0) # 반장수당 (과세)
    meal_allow: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)   # 식대 (비과세)
    vehicle_allow: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0) # 차량유지비 (비과세)
    bonus: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)        # 성과/상여
    gross_pay: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)    # 총지급액
    # 공제
    deduct_pension: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)   # 국민연금 (4.5%)
    deduct_health: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)    # 건강보험 (3.545%)
    deduct_lcare: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)     # 장기요양 (12.95%×건강)
    deduct_employ: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)    # 고용보험 (0.9%)
    deduct_income_tax: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0) # 소득세
    deduct_local_tax: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)  # 지방소득세
    total_deduct: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)
    net_pay: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)      # 실수령액
    status: Mapped[str] = mapped_column(String(20), default="계산중")         # 계산중 / 확정 / 지급완료
    note: Mapped[str | None] = mapped_column(Text)
    calculated_at: Mapped[datetime | None] = mapped_column(DateTime)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)

    employee: Mapped["Employee"] = relationship(back_populates="payrolls")

    __table_args__ = (
        __import__('sqlalchemy').UniqueConstraint('emp_id', 'year', 'month', name='uq_payroll_emp_ym'),
    )
