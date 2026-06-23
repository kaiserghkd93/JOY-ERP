from pydantic import BaseModel, ConfigDict
from app.models.master import ItemType, PartnerType


class ItemCreate(BaseModel):
    part_no: str
    name: str
    spec: str | None = None
    unit: str = "EA"
    item_type: ItemType = ItemType.outsourced
    std_buy_price: float = 0
    std_sell_price: float = 0


class ItemUpdate(BaseModel):
    name: str | None = None
    spec: str | None = None
    unit: str | None = None
    item_type: ItemType | None = None
    std_buy_price: float | None = None
    std_sell_price: float | None = None
    active: bool | None = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    part_no: str
    name: str
    spec: str | None
    unit: str
    item_type: ItemType
    std_buy_price: float
    std_sell_price: float
    active: bool


class PartnerCreate(BaseModel):
    partner_id: str
    name: str
    partner_type: PartnerType = PartnerType.supplier
    business_no: str | None = None
    payment_terms: str | None = None


class PartnerUpdate(BaseModel):
    name: str | None = None
    partner_type: PartnerType | None = None
    business_no: str | None = None
    payment_terms: str | None = None
    active: bool | None = None


class PartnerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    partner_id: str
    name: str
    partner_type: PartnerType
    business_no: str | None
    payment_terms: str | None
    active: bool
