from datetime import datetime
from sqlalchemy import String, Integer, Numeric, Boolean, DateTime, Enum as SAEnum, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class ItemType(str, enum.Enum):
    raw = "raw"
    sub = "sub"
    outsourced = "outsourced"
    semi = "semi"
    finished = "finished"


class PartnerType(str, enum.Enum):
    customer = "고객"
    supplier = "외주처"
    both = "공용"


class Item(Base):
    __tablename__ = "item"

    part_no: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    spec: Mapped[str | None] = mapped_column(String(200))
    supplier: Mapped[str | None] = mapped_column(String(200))  # 외주처 (spec과 분리)
    unit: Mapped[str] = mapped_column(String(20), default="EA")
    item_type: Mapped[ItemType] = mapped_column(
        SAEnum(ItemType), default=ItemType.outsourced
    )
    std_buy_price: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    std_sell_price: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    safety_stock: Mapped[int] = mapped_column(Integer, default=0)
    moq: Mapped[int] = mapped_column(Integer, default=1)
    location: Mapped[str | None] = mapped_column(String(20), default=None)
    weight_g: Mapped[float | None] = mapped_column(Float)          # 제품 중량 (g)
    raw_material: Mapped[str | None] = mapped_column(String(200))  # 사용 원재료명
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(back_populates="item")
    receipts: Mapped[list["Receipt"]] = relationship(back_populates="item")


class BomLine(Base):
    """제품 BOM — 원재료/인서트 1줄씩"""
    __tablename__ = "bom_line"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_part_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    component_part_no: Mapped[str] = mapped_column(String(50), nullable=False)
    qty_per: Mapped[float] = mapped_column(Numeric(15, 4), default=1)  # 제품 1EA당 소요량
    unit: Mapped[str] = mapped_column(String(20), default="g")
    note: Mapped[str | None] = mapped_column(String(200))


class Partner(Base):
    __tablename__ = "partner"

    partner_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    partner_type: Mapped[PartnerType] = mapped_column(
        SAEnum(PartnerType), default=PartnerType.supplier
    )
    business_no: Mapped[str | None] = mapped_column(String(20))
    payment_terms: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(300))
    contact: Mapped[str | None] = mapped_column(String(100))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(back_populates="partner")
