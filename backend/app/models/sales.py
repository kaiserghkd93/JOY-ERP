from datetime import date, datetime
from sqlalchemy import String, Integer, Numeric, Date, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class SOStatus(str, enum.Enum):
    open = "수주"
    partial = "일부출하"
    closed = "출하완료"
    cancelled = "취소"


class ShipmentStatus(str, enum.Enum):
    confirmed = "확정"
    cancelled = "취소"


class SalesOrder(Base):
    __tablename__ = "sales_order"

    so_no: Mapped[str] = mapped_column(String(30), primary_key=True)
    partner_id: Mapped[str] = mapped_column(ForeignKey("partner.partner_id"), nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[SOStatus] = mapped_column(SAEnum(SOStatus), default=SOStatus.open)
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    partner: Mapped["Partner"] = relationship()
    item: Mapped["Item"] = relationship()
    shipments: Mapped[list["Shipment"]] = relationship(back_populates="sales_order")


class Shipment(Base):
    __tablename__ = "shipment"

    sh_no: Mapped[str] = mapped_column(String(30), primary_key=True)
    so_no: Mapped[str] = mapped_column(ForeignKey("sales_order.so_no"), nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    ship_date: Mapped[date] = mapped_column(Date, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    status: Mapped[ShipmentStatus] = mapped_column(SAEnum(ShipmentStatus), default=ShipmentStatus.confirmed)
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    sales_order: Mapped["SalesOrder"] = relationship(back_populates="shipments")
    item: Mapped["Item"] = relationship()
