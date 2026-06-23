from datetime import date
from pydantic import BaseModel, ConfigDict
from app.models.quality import InspectionResult, DisposalType, ClaimStatus, M4Category


class InspectionCreate(BaseModel):
    gr_no: str
    inspect_date: date
    pass_qty: int
    fail_qty: int
    disposal: DisposalType = DisposalType.pending
    defect_note: str | None = None


class InspectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    gr_no: str
    inspect_date: date
    inspect_qty: int
    pass_qty: int
    fail_qty: int
    result: InspectionResult
    disposal: DisposalType
    defect_note: str | None


class ClaimCreate(BaseModel):
    partner_id: str
    part_no: str
    occur_date: date
    defect_type: str
    defect_qty: int = 0
    m4_category: M4Category | None = None
    why1: str | None = None
    why2: str | None = None
    why3: str | None = None
    why4: str | None = None
    why5: str | None = None
    corrective_action: str | None = None
    preventive_action: str | None = None


class ClaimUpdate(BaseModel):
    m4_category: M4Category | None = None
    why1: str | None = None
    why2: str | None = None
    why3: str | None = None
    why4: str | None = None
    why5: str | None = None
    corrective_action: str | None = None
    preventive_action: str | None = None
    status: ClaimStatus | None = None


class ClaimOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    claim_no: str
    partner_id: str
    part_no: str
    occur_date: date
    defect_type: str
    defect_qty: int
    m4_category: M4Category | None
    why1: str | None
    why2: str | None
    why3: str | None
    why4: str | None
    why5: str | None
    corrective_action: str | None
    preventive_action: str | None
    status: ClaimStatus


class DefectRateOut(BaseModel):
    partner_id: str
    total_inspect: int
    total_fail: int
    defect_rate: float
