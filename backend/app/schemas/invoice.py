from datetime import date
from pydantic import BaseModel, ConfigDict
from app.models.sales import InvoiceStatus


class InvoiceLineIn(BaseModel):
    part_no: str
    qty: int
    unit_price: float


class InvoiceCreate(BaseModel):
    partner_id: str
    issue_date: date
    note: str | None = None
    lines: list[InvoiceLineIn]


class InvoiceLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    part_no: str
    qty: int
    unit_price: float
    item_name: str | None = None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    inv_no: str
    partner_id: str
    partner_name: str | None = None
    issue_date: date
    status: InvoiceStatus
    note: str | None
    lines: list[InvoiceLineOut] = []
    total_amount: float | None = None
