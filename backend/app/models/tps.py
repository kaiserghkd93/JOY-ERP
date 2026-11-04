"""TPS 관련 모델 — OEE, SMED, 안돈, 카이젠"""
from datetime import date, datetime
from sqlalchemy import String, Integer, Float, Date, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class OeeDaily(Base):
    """일별 OEE 계산 결과"""
    __tablename__ = "oee_daily"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prod_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    machine_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    part_no: Mapped[str] = mapped_column(String(50), nullable=False)

    # 시간 (분)
    planned_time_min: Mapped[float] = mapped_column(Float, default=480)
    run_time_min: Mapped[float] = mapped_column(Float, default=0)
    stop_time_min: Mapped[float] = mapped_column(Float, default=0)

    # C/T (초)
    machine_ct_sec: Mapped[float | None] = mapped_column(Float)
    actual_ct_sec: Mapped[float | None] = mapped_column(Float)
    takt_time_sec: Mapped[float | None] = mapped_column(Float)

    # 수량
    plan_qty: Mapped[int] = mapped_column(Integer, default=0)
    actual_qty: Mapped[int] = mapped_column(Integer, default=0)
    defect_qty: Mapped[int] = mapped_column(Integer, default=0)

    # OEE 3요소 (0~1)
    availability: Mapped[float | None] = mapped_column(Float)
    performance: Mapped[float | None] = mapped_column(Float)
    quality_rate: Mapped[float | None] = mapped_column(Float)
    oee: Mapped[float | None] = mapped_column(Float)

    # 로스 원인별 시간 (분)
    loss_breakdown_min: Mapped[float] = mapped_column(Float, default=0)       # 01 설비고장
    loss_planned_change_min: Mapped[float] = mapped_column(Float, default=0)  # 02 금형교체(계획)
    loss_unplanned_change_min: Mapped[float] = mapped_column(Float, default=0)# 03 금형교체(비계획)
    loss_material_min: Mapped[float] = mapped_column(Float, default=0)        # 04 원료교체
    loss_minor_stop_min: Mapped[float] = mapped_column(Float, default=0)      # 05 순간정지
    loss_speed_min: Mapped[float] = mapped_column(Float, default=0)           # 06 속도저하
    loss_defect_min: Mapped[float] = mapped_column(Float, default=0)          # 07 불량
    loss_startup_min: Mapped[float] = mapped_column(Float, default=0)         # 08 초기유동
    loss_other_min: Mapped[float] = mapped_column(Float, default=0)           # 09 기타

    calc_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class MoldChangeLog(Base):
    """SMED — 금형 교체 이력"""
    __tablename__ = "mold_change_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    change_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    machine_no: Mapped[str] = mapped_column(String(50), nullable=False)
    mold_no_from: Mapped[str | None] = mapped_column(String(50))
    mold_no_to: Mapped[str] = mapped_column(String(50), nullable=False)
    part_no: Mapped[str | None] = mapped_column(String(50))

    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_at: Mapped[datetime | None] = mapped_column(DateTime)
    duration_min: Mapped[float | None] = mapped_column(Float)
    target_min: Mapped[float] = mapped_column(Float, default=30)

    worker: Mapped[str | None] = mapped_column(String(50))
    note: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class AndonAlert(Base):
    """안돈 알림"""
    __tablename__ = "andon_alert"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)

    # speed_loss / oee_low / defect_high / stop_long / target_miss / delivery_risk
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), default="yellow")  # yellow / red

    machine_no: Mapped[str | None] = mapped_column(String(50))
    part_no: Mapped[str | None] = mapped_column(String(50))

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text)
    threshold: Mapped[float | None] = mapped_column(Float)
    actual_val: Mapped[float | None] = mapped_column(Float)

    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    resolved_by: Mapped[str | None] = mapped_column(String(50))


class KaizenTask(Base):
    """카이젠 과제"""
    __tablename__ = "kaizen_task"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # 품질 / 안전 / 생산성 / 원가 / 납기
    category: Mapped[str] = mapped_column(String(50), default="생산성")
    # 수동 / OEE자동 / 불량자동 / 안돈자동
    source: Mapped[str] = mapped_column(String(50), default="수동")

    machine_no: Mapped[str | None] = mapped_column(String(50))
    part_no: Mapped[str | None] = mapped_column(String(50))

    before_value: Mapped[str | None] = mapped_column(String(200))
    target_value: Mapped[str | None] = mapped_column(String(200))
    after_value: Mapped[str | None] = mapped_column(String(200))

    assignee: Mapped[str | None] = mapped_column(String(50))
    due_date: Mapped[date | None] = mapped_column(Date)

    # 등록 / 진행중 / 완료 / 보류
    status: Mapped[str] = mapped_column(String(20), default="등록")

    oee_daily_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("oee_daily.id"))
    andon_alert_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("andon_alert.id"))

    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
