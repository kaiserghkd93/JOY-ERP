from pydantic import BaseModel
from datetime import date
from typing import Optional


class POLineIn(BaseModel):
    part_no: str
    qty: int
    unit_price: Optional[float] = None
    due_date: Optional[date] = None  # 개별납기 (없으면 헤더 due_date 사용)
    note: Optional[str] = None


class POGroupCreate(BaseModel):
    partner_id: str
    order_date: date
    due_date: date
    note: Optional[str] = None
    lines: list[POLineIn]


class POLineOut(BaseModel):
    po_no: str
    part_no: str
    qty: int
    unit_price: Optional[float] = None
    status: str
    note: Optional[str] = None

    model_config = {"from_attributes": True}


class POGroupOut(BaseModel):
    group_no: str
    partner_id: str
    partner_name: Optional[str] = None
    order_date: date
    due_date: date
    status: str
    note: Optional[str] = None
    lines: list[POLineOut] = []

    model_config = {"from_attributes": True}
