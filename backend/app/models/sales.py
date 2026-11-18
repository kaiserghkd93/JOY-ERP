from datetime import date, datetime
from sqlalchemy import String, Integer, Numeric, Date, DateTime, ForeignKey, Enum as SAEnum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class InvoiceStatus(str, enum.Enum):
    draft = "작성중"
    issued = "발행완료"
    cancelled = "취소"


class SOStatus(str, enum.Enum):
    open = "open"
    partial = "partial"
    closed = "closed"
    cancelled = "cancelled"


class ShipmentStatus(str, enum.Enum):
    confirmed = "confirmed"
    cancelled = "cancelled"


class SalesOrder(Base):
    __tablename__ = "sales_order"

    so_no: Mapped[str] = mapped_column(String(30), primary_key=True)
    partner_id: Mapped[str] = mapped_column(ForeignKey("partner.partner_id"), nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[SOStatus] = mapped_column(SAEnum(SOStatus, native_enum=False), default=SOStatus.open)
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
    status: Mapped[ShipmentStatus] = mapped_column(SAEnum(ShipmentStatus, native_enum=False), default=ShipmentStatus.confirmed)
    lot_no: Mapped[str | None] = mapped_column(String(50), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    sales_order: Mapped["SalesOrder"] = relationship(back_populates="shipments")
    item: Mapped["Item"] = relationship()


class Invoice(Base):
    __tablename__ = "invoice"

    inv_no: Mapped[str] = mapped_column(String(30), primary_key=True)
    partner_id: Mapped[str] = mapped_column(ForeignKey("partner.partner_id"), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)       # 결제 만기일 (결제조건 기반)
    status: Mapped[InvoiceStatus] = mapped_column(SAEnum(InvoiceStatus, native_enum=False), default=InvoiceStatus.draft)
    note: Mapped[str | None] = mapped_column(String(500))
    closing_type: Mapped[str | None] = mapped_column(String(10), nullable=True, default=None)  # null=미설정, "금월"=금월마감, "이월"=이월
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    partner: Mapped["Partner"] = relationship()
    lines: Mapped[list["InvoiceLine"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")


class InvoiceLine(Base):
    __tablename__ = "invoice_line"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    inv_no: Mapped[str] = mapped_column(ForeignKey("invoice.inv_no"), nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)

    invoice: Mapped["Invoice"] = relationship(back_populates="lines")
    item: Mapped["Item"] = relationship()


class PaymentMethod(str, enum.Enum):
    transfer = "계좌이체"
    cash     = "현금"
    bill     = "어음"
    card     = "카드"
    offset   = "상계"


class PaymentStatus(str, enum.Enum):
    normal    = "정상"
    cancelled = "취소"


class Payment(Base):
    """수금 전표 — ERP 원칙상 삭제 없이 취소전표 사용"""
    __tablename__ = "payment"

    pay_no:     Mapped[str]   = mapped_column(String(30), primary_key=True)
    partner_id: Mapped[str]   = mapped_column(ForeignKey("partner.partner_id"), nullable=False)
    pay_date:   Mapped[date]  = mapped_column(Date, nullable=False)
    amount:     Mapped[float] = mapped_column(Numeric(18, 0), nullable=False)
    method:     Mapped[PaymentMethod] = mapped_column(SAEnum(PaymentMethod, native_enum=False), default=PaymentMethod.transfer)
    inv_no:     Mapped[str | None] = mapped_column(ForeignKey("invoice.inv_no"), nullable=True)
    note:       Mapped[str | None] = mapped_column(String(500))
    status:     Mapped[PaymentStatus] = mapped_column(SAEnum(PaymentStatus, native_enum=False), default=PaymentStatus.normal)
    created_by: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    partner: Mapped["Partner"] = relationship()


class SalesTarget(Base):
    """거래처별 월 목표 매출"""
    __tablename__ = "sales_target"
    __table_args__ = (UniqueConstraint("partner_id", "year", "month", name="uq_sales_target"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    partner_id: Mapped[str] = mapped_column(ForeignKey("partner.partner_id"), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    target_amount: Mapped[float] = mapped_column(Numeric(18, 0), nullable=False, default=0)

    partner: Mapped["Partner"] = relationship()
