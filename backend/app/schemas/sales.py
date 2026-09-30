from datetime import date
from pydantic import BaseModel, ConfigDict
from app.models.sales import SOStatus, ShipmentStatus


class SOCreate(BaseModel):
    partner_id: str
    part_no: str
    qty: int
    order_date: date
    due_date: date
    note: str | None = None


class SOOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    so_no: str
    partner_id: str
    part_no: str
    item_name: str | None = None
    qty: int
    order_date: date
    due_date: date
    status: SOStatus
    note: str | None
    remaining_qty: int | None = None


class SOSummary(BaseModel):
    so_no: str
    part_no: str
    order_qty: int
    shipped_qty: int
    remaining_qty: int
    status: SOStatus


class ShipmentCreate(BaseModel):
    so_no: str
    qty: int
    ship_date: date
    unit_price: float
    note: str | None = None


class ShipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    sh_no: str
    so_no: str
    part_no: str
    qty: int
    ship_date: date
    unit_price: float
    status: ShipmentStatus
    note: str | None
    partner_id: str | None = None
    partner_name: str | None = None
    due_date: date | None = None
    item_name: str | None = None
