from datetime import datetime
from sqlalchemy import String, Numeric, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class ItemType(str, enum.Enum):
    raw = "원자재"
    outsourced = "외주품"
    semi = "반제품"
    finished = "완제품"


class PartnerType(str, enum.Enum):
    customer = "고객"
    supplier = "외주처"
    both = "공용"


class Item(Base):
    __tablename__ = "item"

    part_no: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    spec: Mapped[str | None] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(String(20), default="EA")
    item_type: Mapped[ItemType] = mapped_column(
        SAEnum(ItemType), default=ItemType.outsourced
    )
    std_buy_price: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    std_sell_price: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(back_populates="item")
    receipts: Mapped[list["Receipt"]] = relationship(back_populates="item")


class Partner(Base):
    __tablename__ = "partner"

    partner_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    partner_type: Mapped[PartnerType] = mapped_column(
        SAEnum(PartnerType), default=PartnerType.supplier
    )
    business_no: Mapped[str | None] = mapped_column(String(20))
    payment_terms: Mapped[str | None] = mapped_column(String(100))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(back_populates="partner")
