from datetime import date
from pydantic import BaseModel, ConfigDict
from app.models.ledger import LedgerType


class LedgerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    txn_date: date
    part_no: str
    ledger_type: LedgerType
    qty: int
    unit_price: float
    ref_type: str | None
    ref_no: str | None
    note: str | None


class StockSnapshot(BaseModel):
    part_no: str
    name: str
    current_stock: int
    avg_price: float
    stock_value: float


class AdjustRequest(BaseModel):
    part_no: str
    delta: int
    txn_date: date
    note: str
