from datetime import date, datetime
from sqlalchemy import String, Integer, Numeric, Date, DateTime, ForeignKey, Enum as SAEnum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class MoldOrderStatus(str, enum.Enum):
    in_progress = "진행중"
    completed   = "완료"
    cancelled   = "취소"
    delayed     = "지연"


class MoldPartStatus(str, enum.Enum):
    waiting     = "대기"
    in_progress = "진행중"
    completed   = "완료"


class MoldProcessStatus(str, enum.Enum):
    waiting     = "대기"
    in_progress = "진행중"
    completed   = "완료"
    outsourced  = "외주중"


class MoldProcessType(str, enum.Enum):
    internal  = "자체"
    outsource = "외주"


class MoldTrialResult(str, enum.Enum):
    ok         = "OK"
    ng         = "NG"
    conditional = "조건부OK"


class MoldOrder(Base):
    """금형 수주"""
    __tablename__ = "mold_order"

    mold_no:      Mapped[str]           = mapped_column(String(30), primary_key=True)
    customer_id:  Mapped[str]           = mapped_column(ForeignKey("partner.partner_id"), nullable=False)
    mold_name:    Mapped[str]           = mapped_column(String(100), nullable=False)
    cavity:       Mapped[int]           = mapped_column(Integer, default=1)        # 캐비티 수
    material:     Mapped[str | None]    = mapped_column(String(50))                # 금형강 (NAK80 등)
    order_date:   Mapped[date]          = mapped_column(Date, nullable=False)
    due_date:     Mapped[date]          = mapped_column(Date, nullable=False)
    mold_fee:     Mapped[float | None]  = mapped_column(Numeric(15, 2))            # 금형비
    status:       Mapped[MoldOrderStatus] = mapped_column(SAEnum(MoldOrderStatus), default=MoldOrderStatus.in_progress)
    note:         Mapped[str | None]    = mapped_column(Text)
    created_at:   Mapped[datetime]      = mapped_column(DateTime, default=datetime.now)

    customer: Mapped["Partner"]         = relationship()
    parts:    Mapped[list["MoldPart"]]  = relationship(back_populates="order", cascade="all, delete-orphan")
    trials:   Mapped[list["MoldTrial"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class MoldPart(Base):
    """금형 부품 (상형/하형/슬라이드 등)"""
    __tablename__ = "mold_part"

    id:          Mapped[int]            = mapped_column(Integer, primary_key=True, autoincrement=True)
    mold_no:     Mapped[str]            = mapped_column(ForeignKey("mold_order.mold_no"), nullable=False)
    part_name:   Mapped[str]            = mapped_column(String(50), nullable=False)  # 상형/하형/슬라이드
    seq:         Mapped[int]            = mapped_column(Integer, default=1)           # 표시 순서
    status:      Mapped[MoldPartStatus] = mapped_column(SAEnum(MoldPartStatus), default=MoldPartStatus.waiting)
    note:        Mapped[str | None]     = mapped_column(String(200))

    order:     Mapped["MoldOrder"]           = relationship(back_populates="parts")
    processes: Mapped[list["MoldProcess"]]   = relationship(back_populates="part", cascade="all, delete-orphan", order_by="MoldProcess.seq")


class MoldProcess(Base):
    """부품별 공정 (CNC/방전/연마 등)"""
    __tablename__ = "mold_process"

    id:            Mapped[int]               = mapped_column(Integer, primary_key=True, autoincrement=True)
    part_id:       Mapped[int]               = mapped_column(ForeignKey("mold_part.id"), nullable=False)
    seq:           Mapped[int]               = mapped_column(Integer, nullable=False)
    process_name:  Mapped[str]               = mapped_column(String(50), nullable=False)
    process_type:  Mapped[MoldProcessType]   = mapped_column(SAEnum(MoldProcessType), default=MoldProcessType.internal)
    assignee:      Mapped[str | None]        = mapped_column(String(50))             # 자체 담당자
    partner_id:    Mapped[str | None]        = mapped_column(String(30))             # 외주처
    po_no:         Mapped[str | None]        = mapped_column(String(30))             # 외주 발주번호 연결
    plan_start:    Mapped[date | None]       = mapped_column(Date)
    plan_end:      Mapped[date | None]       = mapped_column(Date)
    actual_start:  Mapped[date | None]       = mapped_column(Date)
    actual_end:    Mapped[date | None]       = mapped_column(Date)
    actual_start_time: Mapped[str | None]   = mapped_column(String(5))   # HH:MM
    actual_end_time:   Mapped[str | None]   = mapped_column(String(5))   # HH:MM
    status:        Mapped[MoldProcessStatus] = mapped_column(SAEnum(MoldProcessStatus), default=MoldProcessStatus.waiting)
    note:          Mapped[str | None]        = mapped_column(String(200))

    part: Mapped["MoldPart"] = relationship(back_populates="processes")


class MoldTrial(Base):
    """시사출 이력 (T0/T1/T2)"""
    __tablename__ = "mold_trial"

    id:          Mapped[int]              = mapped_column(Integer, primary_key=True, autoincrement=True)
    mold_no:     Mapped[str]              = mapped_column(ForeignKey("mold_order.mold_no"), nullable=False)
    trial_no:    Mapped[str]              = mapped_column(String(10), nullable=False)  # T0/T1/T2
    trial_date:  Mapped[date]             = mapped_column(Date, nullable=False)
    result:      Mapped[MoldTrialResult]  = mapped_column(SAEnum(MoldTrialResult))
    sample_qty:  Mapped[int]              = mapped_column(Integer, default=0)
    customer_attended: Mapped[bool]       = mapped_column(default=False)             # 고객 입회 여부
    issues:      Mapped[str | None]       = mapped_column(Text)                      # 지적사항
    note:        Mapped[str | None]       = mapped_column(String(300))

    order: Mapped["MoldOrder"] = relationship(back_populates="trials")
