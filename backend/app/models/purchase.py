from datetime import date, datetime
from sqlalchemy import String, Integer, Numeric, Date, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class POStatus(str, enum.Enum):
    open = "발주중"
    partial = "일부입고"
    closed = "입고완료"
    cancelled = "취소"


class ReceiptStatus(str, enum.Enum):
    pending = "대기"
    confirmed = "확정"
    cancelled = "취소"


class PurchaseOrder(Base):
    __tablename__ = "purchase_order"

    po_no: Mapped[str] = mapped_column(String(30), primary_key=True)
    partner_id: Mapped[str] = mapped_column(ForeignKey("partner.partner_id"), nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[POStatus] = mapped_column(SAEnum(POStatus), default=POStatus.open)
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    purchase_order: Mapped["PurchaseOrder"] = relationship(back_populates="receipts")
    item: Mapped["Item"] = relationship(back_populates="receipts")
