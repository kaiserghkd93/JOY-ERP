from datetime import date, datetime
from pydantic import BaseModel, ConfigDict
from app.models.quality import InspectionResult, DisposalType, ClaimStatus, M4Category, ApprovalStatus, StandardStatus


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
    approval_status: ApprovalStatus | None = None
    inspector_id: str | None = None
    requested_at: datetime | None = None
    approver_id: str | None = None
    approved_at: datetime | None = None
    rejection_reason: str | None = None
    confirmer_id: str | None = None
    confirmed_at: datetime | None = None


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


# ── 검사기준 마스터 ─────────────────────────────────────────────────

class InspectionItemCreate(BaseModel):
    item_name: str
    measure_position: str | None = None
    spec_nominal: float | None = None
    spec_upper: float | None = None
    spec_lower: float | None = None
    unit: str = "mm"
    is_critical: bool = False
    is_special: bool = False
    method: str | None = None
    equipment: str | None = None
    frequency: str = "매회"
    skip_condition: str | None = None
    inspect_condition: str | None = None
    sort_order: int = 0


class InspectionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    standard_id: int
    item_name: str
    measure_position: str | None
    spec_nominal: float | None
    spec_upper: float | None
    spec_lower: float | None
    unit: str
    is_critical: bool
    is_special: bool
    method: str | None
    equipment: str | None
    frequency: str
    skip_condition: str | None
    inspect_condition: str | None
    sort_order: int


class StandardCreate(BaseModel):
    part_no: str
    partner_id: str | None = None
    drawing_no: str | None = None
    drawing_rev: str | None = None
    sampling_level: str = "II"
    aql: float = 1.0
    note: str | None = None
    effective_date: date | None = None
    items: list[InspectionItemCreate] = []


class StandardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    std_no: str
    std_rev: str
    part_no: str
    partner_id: str | None
    drawing_no: str | None
    drawing_rev: str | None
    sampling_level: str
    aql: float
    status: StandardStatus
    approver_id: str | None
    approved_at: datetime | None
    effective_date: date | None
    note: str | None
    created_at: datetime
    items: list[InspectionItemOut] = []
