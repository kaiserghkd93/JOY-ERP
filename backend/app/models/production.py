from datetime import date, datetime
from sqlalchemy import String, Integer, Text, Date, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class POrdStatus(str, enum.Enum):
    planned = "계획"
    in_progress = "진행중"
    completed = "완료"
    cancelled = "취소"


class MoldStatus(str, enum.Enum):
    active = "정상"
    repair = "수리중"
    retired = "폐기"


class ProductionOrder(Base):
    __tablename__ = "production_order"

    pord_no: Mapped[str] = mapped_column(String(30), primary_key=True)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    planned_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_qty: Mapped[int] = mapped_column(Integer, default=0)
    mold_no: Mapped[str | None] = mapped_column(ForeignKey("mold.mold_no"))
    plan_date: Mapped[date] = mapped_column(Date, nullable=False)
    complete_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[POrdStatus] = mapped_column(SAEnum(POrdStatus), default=POrdStatus.planned)
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    item: Mapped["Item"] = relationship()
    mold: Mapped["Mold | None"] = relationship(back_populates="production_orders")


class Mold(Base):
    __tablename__ = "mold"

    mold_no: Mapped[str] = mapped_column(String(50), primary_key=True)
    owner: Mapped[str | None] = mapped_column(String(100))       # 자산귀속 (예: HD현대일렉트릭)
    part_no: Mapped[str | None] = mapped_column(ForeignKey("item.part_no"))
    location: Mapped[str | None] = mapped_column(String(100))
    total_shots: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[MoldStatus] = mapped_column(SAEnum(MoldStatus), default=MoldStatus.active)
    repair_history: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    production_orders: Mapped[list["ProductionOrder"]] = relationship(back_populates="mold")
