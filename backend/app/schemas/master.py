from pydantic import BaseModel, ConfigDict
from app.models.master import ItemType, PartnerType


WAREHOUSES = ["A동", "B동", "C동", "1F-1", "1F-2"]


class ItemCreate(BaseModel):
    part_no: str
    name: str
    spec: str | None = None
    supplier: str | None = None
    unit: str = "EA"
    item_type: ItemType = ItemType.outsourced
    std_buy_price: float = 0
    std_sell_price: float = 0
    safety_stock: int = 0
    moq: int = 1
    location: str | None = None


class ItemUpdate(BaseModel):
    name: str | None = None
    spec: str | None = None
    supplier: str | None = None
    unit: str | None = None
    item_type: ItemType | None = None
    std_buy_price: float | None = None
    std_sell_price: float | None = None
    safety_stock: int | None = None
    moq: int | None = None
    location: str | None = None
    active: bool | None = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    part_no: str
    name: str
    spec: str | None
    supplier: str | None
    unit: str
    item_type: ItemType
    std_buy_price: float
    std_sell_price: float
    safety_stock: int
    moq: int
    location: str | None
    active: bool


class PartnerCreate(BaseModel):
    partner_id: str
    name: str
    partner_type: PartnerType = PartnerType.supplier
    business_no: str | None = None
    payment_terms: str | None = None
    email: str | None = None
    address: str | None = None
    contact: str | None = None


class PartnerUpdate(BaseModel):
    name: str | None = None
    partner_type: PartnerType | None = None
    business_no: str | None = None
    payment_terms: str | None = None
    email: str | None = None
    address: str | None = None
    contact: str | None = None
    active: bool | None = None


class PartnerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    partner_id: str
    name: str
    partner_type: PartnerType
    business_no: str | None
    payment_terms: str | None
    email: str | None
    address: str | None
    contact: str | None
    active: bool
