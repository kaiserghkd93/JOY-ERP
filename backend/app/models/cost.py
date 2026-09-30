from datetime import datetime
from sqlalchemy import String, Integer, Numeric, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class LaborRate(Base):
    """임률 마스터 — 공정별 시간당 임률"""
    __tablename__ = "labor_rate"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    process_name: Mapped[str] = mapped_column(String(100), nullable=False)  # 공정명
    rate_per_hour: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)  # 원/시간
    note: Mapped[str | None] = mapped_column(String(300))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    product_stds: Mapped[list["ProductCostStd"]] = relationship(back_populates="labor_rate")


class ProductCostStd(Base):
    """제품별 표준원가 기준 — 공정 연결 + 표준공수"""
    __tablename__ = "product_cost_std"
    __table_args__ = (UniqueConstraint("part_no", name="uq_prod_cost_part"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    process_id: Mapped[int] = mapped_column(ForeignKey("labor_rate.id"), nullable=False)
    std_labor_min: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)  # 분/EA
    note: Mapped[str | None] = mapped_column(String(300))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)

    labor_rate: Mapped["LaborRate"] = relationship(back_populates="product_stds")


class OverheadEntry(Base):
    """월별 제조경비 입력"""
    __tablename__ = "overhead_entry"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # 전기세, 감가상각, 소모품, 기타
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
