from datetime import date, datetime
from sqlalchemy import String, Integer, Numeric, Date, DateTime, ForeignKey, Enum as SAEnum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class POStatus(str, enum.Enum):
    open = "open"
    partial = "partial"
    closed = "closed"
    cancelled = "cancelled"


class ReceiptStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"


class POGroupStatus(str, enum.Enum):
    draft = "작성중"
    issued = "발행"
    closed = "완료"
    cancelled = "취소"


class PurchaseOrderGroup(Base):
    """발주서 헤더 — 외주처 1개에 품목 여러 줄을 묶는 발주서 단위"""
    __tablename__ = "purchase_order_group"

    group_no: Mapped[str] = mapped_column(String(30), primary_key=True)
    partner_id: Mapped[str] = mapped_column(ForeignKey("partner.partner_id"), nullable=False)
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[POGroupStatus] = mapped_column(SAEnum(POGroupStatus), default=POGroupStatus.issued)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    partner: Mapped["Partner"] = relationship()
    lines: Mapped[list["PurchaseOrder"]] = relationship(back_populates="group", cascade="all, delete-orphan")


class PurchaseOrder(Base):
    __tablename__ = "purchase_order"

    po_no: Mapped[str] = mapped_column(String(30), primary_key=True)
    group_no: Mapped[str | None] = mapped_column(ForeignKey("purchase_order_group.group_no"), nullable=True)
    partner_id: Mapped[str] = mapped_column(ForeignKey("partner.partner_id"), nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[POStatus] = mapped_column(SAEnum(POStatus), default=POStatus.open)
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    group: Mapped["PurchaseOrderGroup | None"] = relationship(back_populates="lines")
    partner: Mapped["Partner"] = relationship(back_populates="purchase_orders")
    item: Mapped["Item"] = relationship(back_populates="purchase_orders")
    receipts: Mapped[list["Receipt"]] = relationship(back_populates="purchase_order")


class Receipt(Base):
    __tablename__ = "receipt"

    gr_no: Mapped[str] = mapped_column(String(30), primary_key=True)
    po_no: Mapped[str] = mapped_column(ForeignKey("purchase_order.po_no"), nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    receipt_date: Mapped[date] = mapped_column(Date, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    status: Mapped[ReceiptStatus] = mapped_column(SAEnum(ReceiptStatus), default=ReceiptStatus.pending)
    note: Mapped[str | None] = mapped_column(String(500))
    partner_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    outsource_price: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    is_carryover: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    carryover_qty: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    carryover_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    carryover_to_month: Mapped[str | None] = mapped_column(String(7), nullable=True)
    return_qty: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    return_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    purchase_order: Mapped["PurchaseOrder"] = relationship(back_populates="receipts")
    item: Mapped["Item"] = relationship(back_populates="receipts")


class Carryover(Base):
    __tablename__ = "carryover"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    partner_id: Mapped[str] = mapped_column(String(30), nullable=False)
    part_no: Mapped[str] = mapped_column(String(30), nullable=False)
    po_no: Mapped[str] = mapped_column(String(30), nullable=False)
    source_ym: Mapped[str] = mapped_column(String(7), nullable=False)
    over_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    remaining_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
