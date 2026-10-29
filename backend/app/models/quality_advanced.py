"""IATF 16949 / VDA 6.3 고도화 품질 모델"""
from datetime import date, datetime
from sqlalchemy import String, Integer, Numeric, Date, DateTime, Text, JSON, ForeignKey
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
import enum


# ── SPC ────────────────────────────────────────────────────────────

class SpcChart(Base):
    """관리도 설정 (X-bar R / Individuals)"""
    __tablename__ = "spc_chart"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    part_no: Mapped[str] = mapped_column(String(50), nullable=False)
    characteristic: Mapped[str] = mapped_column(String(100), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(20))
    usl: Mapped[float | None] = mapped_column(Numeric(15, 6))   # Upper Spec Limit
    lsl: Mapped[float | None] = mapped_column(Numeric(15, 6))   # Lower Spec Limit
    ucl: Mapped[float | None] = mapped_column(Numeric(15, 6))   # Upper Control Limit
    lcl: Mapped[float | None] = mapped_column(Numeric(15, 6))   # Lower Control Limit
    cl: Mapped[float | None] = mapped_column(Numeric(15, 6))    # Center Line
    subgroup_size: Mapped[int] = mapped_column(Integer, default=5)
    is_active: Mapped[bool] = mapped_column(default=True)
    note: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class SpcMeasurement(Base):
    """관리도 측정값 (소그룹 단위)"""
    __tablename__ = "spc_measurement"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chart_id: Mapped[int] = mapped_column(ForeignKey("spc_chart.id"), nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    measured_by: Mapped[str | None] = mapped_column(String(50))
    values: Mapped[list] = mapped_column(JSON, nullable=False)  # [v1, v2, v3, ...]
    xbar: Mapped[float | None] = mapped_column(Numeric(15, 6))
    r_val: Mapped[float | None] = mapped_column(Numeric(15, 6))  # range
    note: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


# ── 관리계획서 (Control Plan) ────────────────────────────────────────

class CpStatus(str, enum.Enum):
    draft    = "작성중"
    approved = "승인완료"
    obsolete = "폐기"


class ControlPlan(Base):
    __tablename__ = "control_plan"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cp_no: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    customer: Mapped[str | None] = mapped_column(String(100))
    revision: Mapped[str] = mapped_column(String(10), default="A")
    plan_type: Mapped[str] = mapped_column(String(20), default="양산")  # 시작/양산/시제
    status: Mapped[CpStatus] = mapped_column(SAEnum(CpStatus), default=CpStatus.draft)
    approved_by: Mapped[str | None] = mapped_column(String(50))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime)
    effective_date: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class CharType(str, enum.Enum):
    kpc     = "KPC"      # Key Product Characteristic
    kcc     = "KCC"      # Key Control Characteristic
    special = "특별특성"
    general = "일반"


class ControlPlanItem(Base):
    __tablename__ = "control_plan_item"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cp_id: Mapped[int] = mapped_column(ForeignKey("control_plan.id"), nullable=False)
    process_no: Mapped[str | None] = mapped_column(String(10))
    process_name: Mapped[str] = mapped_column(String(100), nullable=False)
    operation: Mapped[str | None] = mapped_column(String(100))
    machine: Mapped[str | None] = mapped_column(String(100))
    characteristic_name: Mapped[str] = mapped_column(String(100), nullable=False)
    char_type: Mapped[CharType] = mapped_column(SAEnum(CharType), default=CharType.general)
    spec_nominal: Mapped[float | None] = mapped_column(Numeric(15, 6))
    spec_upper: Mapped[float | None] = mapped_column(Numeric(15, 6))
    spec_lower: Mapped[float | None] = mapped_column(Numeric(15, 6))
    unit: Mapped[str | None] = mapped_column(String(20))
    sample_size: Mapped[str | None] = mapped_column(String(30))     # "5ea", "100%"
    sample_freq: Mapped[str | None] = mapped_column(String(50))     # "2시간마다", "로트당"
    control_method: Mapped[str | None] = mapped_column(String(100))  # SPC, 버니어, 육안
    reaction_plan: Mapped[str | None] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


# ── PFMEA ──────────────────────────────────────────────────────────

class PfmeaStatus(str, enum.Enum):
    draft    = "작성중"
    reviewed = "검토완료"
    approved = "승인완료"


class Pfmea(Base):
    __tablename__ = "pfmea"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pfmea_no: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    revision: Mapped[str] = mapped_column(String(10), default="A")
    status: Mapped[PfmeaStatus] = mapped_column(SAEnum(PfmeaStatus), default=PfmeaStatus.draft)
    created_by: Mapped[str] = mapped_column(String(50), nullable=False)
    approved_by: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class PfmeaItem(Base):
    __tablename__ = "pfmea_item"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pfmea_id: Mapped[int] = mapped_column(ForeignKey("pfmea.id"), nullable=False)
    process_step: Mapped[str] = mapped_column(String(100), nullable=False)
    function: Mapped[str | None] = mapped_column(String(200))
    failure_mode: Mapped[str] = mapped_column(String(200), nullable=False)
    failure_effect: Mapped[str | None] = mapped_column(String(200))
    severity: Mapped[int] = mapped_column(Integer, default=5)       # S 1-10
    failure_cause: Mapped[str | None] = mapped_column(String(200))
    occurrence: Mapped[int] = mapped_column(Integer, default=5)     # O 1-10
    current_control: Mapped[str | None] = mapped_column(String(200))
    detection: Mapped[int] = mapped_column(Integer, default=5)      # D 1-10
    rpn: Mapped[int] = mapped_column(Integer, default=125)          # S×O×D
    action_required: Mapped[str | None] = mapped_column(String(200))
    responsible: Mapped[str | None] = mapped_column(String(50))
    target_date: Mapped[date | None] = mapped_column(Date)
    action_taken: Mapped[str | None] = mapped_column(String(200))
    new_severity: Mapped[int | None] = mapped_column(Integer)
    new_occurrence: Mapped[int | None] = mapped_column(Integer)
    new_detection: Mapped[int | None] = mapped_column(Integer)
    new_rpn: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


# ── 교정 관리 (Calibration) ────────────────────────────────────────

class InstrumentStatus(str, enum.Enum):
    active   = "사용중"
    due_soon = "교정임박"
    overdue  = "교정초과"
    in_cal   = "교정중"
    obsolete = "폐기"


class Instrument(Base):
    __tablename__ = "instrument"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    instrument_no: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    instrument_type: Mapped[str | None] = mapped_column(String(50))  # 버니어캘리퍼스, 마이크로미터...
    manufacturer: Mapped[str | None] = mapped_column(String(100))
    model_no: Mapped[str | None] = mapped_column(String(50))
    serial_no: Mapped[str | None] = mapped_column(String(50))
    location: Mapped[str | None] = mapped_column(String(100))
    calibration_interval: Mapped[int] = mapped_column(Integer, default=365)  # days
    last_calibrated: Mapped[date | None] = mapped_column(Date)
    next_due: Mapped[date | None] = mapped_column(Date)
    status: Mapped[InstrumentStatus] = mapped_column(SAEnum(InstrumentStatus), default=InstrumentStatus.active)
    accuracy_spec: Mapped[str | None] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class CalibrationRecord(Base):
    __tablename__ = "calibration_record"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instrument.id"), nullable=False)
    calibrated_at: Mapped[date] = mapped_column(Date, nullable=False)
    calibrated_by: Mapped[str | None] = mapped_column(String(50))
    agency: Mapped[str | None] = mapped_column(String(100))          # 교정기관
    result: Mapped[str] = mapped_column(String(20), default="합격")  # 합격/불합격
    certificate_no: Mapped[str | None] = mapped_column(String(50))
    next_due: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


# ── 내부감사 (Internal Audit) ─────────────────────────────────────

class AuditStatus(str, enum.Enum):
    planned   = "계획"
    ongoing   = "진행중"
    completed = "완료"
    closed    = "종결"


class FindingType(str, enum.Enum):
    major       = "중대부적합"
    minor       = "경미부적합"
    observation = "관찰사항"
    strong_point = "강점"


class FindingStatus(str, enum.Enum):
    open        = "열림"
    in_progress = "시정중"
    completed   = "완료"
    verified    = "효과확인"


class AuditPlan(Base):
    __tablename__ = "audit_plan"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    audit_no: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    audit_type: Mapped[str] = mapped_column(String(20), default="내부감사")  # 내부감사/VDA6.3/공정감사
    standard: Mapped[str] = mapped_column(String(30), default="IATF16949")
    scope: Mapped[str | None] = mapped_column(String(200))
    audit_date: Mapped[date] = mapped_column(Date, nullable=False)
    auditor: Mapped[str] = mapped_column(String(100), nullable=False)
    auditee_dept: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[AuditStatus] = mapped_column(SAEnum(AuditStatus), default=AuditStatus.planned)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class AuditFinding(Base):
    __tablename__ = "audit_finding"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    audit_id: Mapped[int] = mapped_column(ForeignKey("audit_plan.id"), nullable=False)
    clause_no: Mapped[str | None] = mapped_column(String(20))      # 예: 8.5.1
    clause_title: Mapped[str | None] = mapped_column(String(100))
    finding_type: Mapped[FindingType] = mapped_column(SAEnum(FindingType), default=FindingType.minor)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[str | None] = mapped_column(Text)
    status: Mapped[FindingStatus] = mapped_column(SAEnum(FindingStatus), default=FindingStatus.open)
    due_date: Mapped[date | None] = mapped_column(Date)
    root_cause: Mapped[str | None] = mapped_column(Text)
    corrective_action: Mapped[str | None] = mapped_column(Text)
    responsible: Mapped[str | None] = mapped_column(String(50))
    completion_date: Mapped[date | None] = mapped_column(Date)
    effectiveness_result: Mapped[str | None] = mapped_column(Text)
    verified_by: Mapped[str | None] = mapped_column(String(50))
    verified_at: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


# ── PPAP ───────────────────────────────────────────────────────────

class PpapStatus(str, enum.Enum):
    preparing = "준비중"
    submitted = "제출"
    approved  = "승인"
    rejected  = "거절"
    interim   = "조건부승인"


PPAP_ELEMENTS = [
    (1,  "설계도기록 (Design Records)"),
    (2,  "엔지니어링 변경문서"),
    (3,  "엔지니어링 승인"),
    (4,  "설계 FMEA (DFMEA)"),
    (5,  "공정 흐름도 (Process Flow)"),
    (6,  "공정 FMEA (PFMEA)"),
    (7,  "관리계획서 (Control Plan)"),
    (8,  "측정시스템 분석 (MSA)"),
    (9,  "치수결과 (Dimensional Results)"),
    (10, "재료/성능 시험성적서"),
    (11, "초기공정연구 (SPC/Cpk)"),
    (12, "공인시험기관 문서"),
    (13, "외관승인보고서 (AAR)"),
    (14, "샘플 양산부품"),
    (15, "마스터 샘플"),
    (16, "검사 보조기구"),
    (17, "고객별 요구사항"),
    (18, "부품제출확인서 (PSW)"),
]


class Ppap(Base):
    __tablename__ = "ppap"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ppap_no: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    partner_id: Mapped[str | None] = mapped_column(String(50))
    customer: Mapped[str | None] = mapped_column(String(100))
    submission_level: Mapped[int] = mapped_column(Integer, default=3)  # 1-5
    submission_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[PpapStatus] = mapped_column(SAEnum(PpapStatus), default=PpapStatus.preparing)
    approved_by: Mapped[str | None] = mapped_column(String(50))
    approved_at: Mapped[date | None] = mapped_column(Date)
    reason: Mapped[str | None] = mapped_column(String(200))   # 변경사유
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class ElementStatus(str, enum.Enum):
    na          = "해당없음"
    pending     = "준비중"
    completed   = "완료"
    rejected    = "거절"


class PpapElement(Base):
    __tablename__ = "ppap_element"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ppap_id: Mapped[int] = mapped_column(ForeignKey("ppap.id"), nullable=False)
    element_no: Mapped[int] = mapped_column(Integer, nullable=False)
    element_name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[ElementStatus] = mapped_column(SAEnum(ElementStatus), default=ElementStatus.pending)
    document_ref: Mapped[str | None] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(String(300))


# ── MSA ────────────────────────────────────────────────────────────

class MsaType(str, enum.Enum):
    grr        = "Gage R&R"
    bias       = "편의분석"
    linearity  = "선형성분석"


class MsaStudy(Base):
    __tablename__ = "msa_study"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_no: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    part_no: Mapped[str | None] = mapped_column(ForeignKey("item.part_no"))
    characteristic: Mapped[str] = mapped_column(String(100), nullable=False)
    instrument_id: Mapped[int | None] = mapped_column(ForeignKey("instrument.id"))
    study_type: Mapped[MsaType] = mapped_column(SAEnum(MsaType), default=MsaType.grr)
    appraiser_count: Mapped[int] = mapped_column(Integer, default=3)
    part_count: Mapped[int] = mapped_column(Integer, default=10)
    trial_count: Mapped[int] = mapped_column(Integer, default=2)
    tolerance: Mapped[float | None] = mapped_column(Numeric(15, 6))  # USL - LSL
    grr_pct: Mapped[float | None] = mapped_column(Numeric(8, 4))    # % R&R
    ndc: Mapped[int | None] = mapped_column(Integer)                 # Number of Distinct Categories
    bias: Mapped[float | None] = mapped_column(Numeric(15, 6))
    result: Mapped[str | None] = mapped_column(String(20))           # 합격/주의/불합격
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class MsaMeasurement(Base):
    __tablename__ = "msa_measurement"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("msa_study.id"), nullable=False)
    appraiser: Mapped[str] = mapped_column(String(30), nullable=False)  # A, B, C
    part_seq: Mapped[int] = mapped_column(Integer, nullable=False)       # 1-10
    trial: Mapped[int] = mapped_column(Integer, nullable=False)          # 1-3
    value: Mapped[float] = mapped_column(Numeric(15, 6), nullable=False)
