from datetime import date, datetime
from sqlalchemy import String, Integer, Float, Text, Date, DateTime, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class AndonType(str, enum.Enum):
    quality  = "품질이상"
    machine  = "설비고장"
    material = "재료부족"
    safety   = "안전"
    help     = "도움요청"


class MachineStatus(str, enum.Enum):
    idle    = "대기"
    running = "가동"
    down    = "비가동"
    off     = "미사용"


class WOStatus(str, enum.Enum):
    pending   = "대기"
    running   = "진행"
    completed = "완료"
    cancelled = "취소"


class SessionStatus(str, enum.Enum):
    running   = "진행"
    completed = "완료"
    stopped   = "중단"


class DowntimeReason(str, enum.Enum):
    equipment  = "설비고장"
    mold_change = "금형교체"
    material   = "재료교체"
    quality    = "품질이슈"
    rest       = "휴식"
    meeting    = "미팅"
    setup      = "초기세팅"
    other      = "기타"


class Machine(Base):
    """호기(사출기) 마스터"""
    __tablename__ = "machine"

    machine_id: Mapped[str] = mapped_column(String(20), primary_key=True)  # M01~M20
    name: Mapped[str] = mapped_column(String(50), nullable=False)           # 1호기
    std_cycle_sec: Mapped[float] = mapped_column(Float, default=30.0)      # 표준 사이클타임(초)
    cavity_count: Mapped[int] = mapped_column(Integer, default=1)           # 캐비티 수
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    note: Mapped[str | None] = mapped_column(Text)


class MesWorkOrder(Base):
    """작업지시서"""
    __tablename__ = "mes_work_order"

    wo_no: Mapped[str] = mapped_column(String(30), primary_key=True)       # WO-YYYYMMDD-NNN
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    machine_id: Mapped[str] = mapped_column(ForeignKey("machine.machine_id"), nullable=False)
    mold_no: Mapped[str | None] = mapped_column(ForeignKey("mold.mold_no"), nullable=True)
    target_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    plan_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[WOStatus] = mapped_column(SAEnum(WOStatus, native_enum=False), default=WOStatus.pending)
    note: Mapped[str | None] = mapped_column(Text)
    assigned_worker_id: Mapped[str | None] = mapped_column(ForeignKey("user.username"), nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("user.username"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    item: Mapped["Item"] = relationship(foreign_keys=[part_no])
    machine: Mapped["Machine"] = relationship(foreign_keys=[machine_id])
    sessions: Mapped[list["WorkerSession"]] = relationship(back_populates="work_order", cascade="all, delete-orphan")


class WorkerSession(Base):
    """작업자 세션 — 작업자가 호기에서 작업지시서 하나를 작업하는 단위"""
    __tablename__ = "worker_session"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    wo_no: Mapped[str] = mapped_column(ForeignKey("mes_work_order.wo_no"), nullable=False)
    machine_id: Mapped[str] = mapped_column(ForeignKey("machine.machine_id"), nullable=False)
    worker_id: Mapped[str] = mapped_column(ForeignKey("user.username"), nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    end_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    good_qty: Mapped[int] = mapped_column(Integer, default=0)
    defect_qty: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[SessionStatus] = mapped_column(SAEnum(SessionStatus, native_enum=False), default=SessionStatus.running)

    work_order: Mapped["MesWorkOrder"] = relationship(back_populates="sessions")
    machine: Mapped["Machine"] = relationship(foreign_keys=[machine_id])
    prod_logs: Mapped[list["ProdLog"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    downtime_logs: Mapped[list["DowntimeLog"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class ProdLog(Base):
    """실적 입력 로그 — 수량 입력할 때마다 기록"""
    __tablename__ = "mes_prod_entry"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("worker_session.id"), nullable=False)
    logged_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    good_qty: Mapped[int] = mapped_column(Integer, default=0)
    defect_qty: Mapped[int] = mapped_column(Integer, default=0)
    defect_type: Mapped[str | None] = mapped_column(String(100))

    session: Mapped["WorkerSession"] = relationship(back_populates="prod_logs")


class DowntimeLog(Base):
    """비가동 로그"""
    __tablename__ = "mes_downtime_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("worker_session.id"), nullable=False)
    reason: Mapped[DowntimeReason] = mapped_column(SAEnum(DowntimeReason, native_enum=False), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    start_time: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    end_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    session: Mapped["WorkerSession"] = relationship(back_populates="downtime_logs")


class AndonCall(Base):
    """Toyota 안돈 호출 기록"""
    __tablename__ = "mes_andon_call"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    machine_id: Mapped[str] = mapped_column(ForeignKey("machine.machine_id"), nullable=False)
    caller_id: Mapped[str] = mapped_column(String(50), nullable=False)
    andon_type: Mapped[str] = mapped_column(String(50), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    called_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)

    machine: Mapped["Machine"] = relationship(foreign_keys=[machine_id])
