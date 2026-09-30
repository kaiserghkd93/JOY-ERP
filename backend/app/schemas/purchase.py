from datetime import date
from pydantic import BaseModel, ConfigDict
from app.models.purchase import POStatus, ReceiptStatus


class POCreate(BaseModel):
    partner_id: str
    part_no: str
    qty: int
    order_date: date
    due_date: date
    note: str | None = None


class POOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    po_no: str
    partner_id: str
    part_no: str
    qty: int
    order_date: date
    due_date: date
    status: POStatus
    note: str | None


class POSummary(BaseModel):
    po_no: str
    part_no: str
    order_qty: int
    received_qty: int
    remaining_qty: int
    status: POStatus


class ReceiptCreate(BaseModel):
    po_no: str
    qty: int
    receipt_date: date
    unit_price: float
    note: str | None = None


class ReceiptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    gr_no: str
    po_no: str
    part_no: str
    qty: int
    receipt_date: date
    unit_price: float
    status: ReceiptStatus
    note: str | None
    partner_id: str | None = None
    outsource_price: float | None = None
