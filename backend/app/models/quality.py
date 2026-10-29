from datetime import date, datetime
from sqlalchemy import String, Integer, Text, Date, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class InspectionResult(str, enum.Enum):
    pass_ = "합격"
    fail = "불합격"
    partial = "부분합격"


class DisposalType(str, enum.Enum):
    return_ = "반품"
    scrap = "폐기"
    concession = "특채"
    pending = "보류"


class ClaimStatus(str, enum.Enum):
    received = "접수"
    investigating = "조사중"
    closed = "완료"


class M4Category(str, enum.Enum):
    man = "Man(사람)"
    machine = "Machine(설비)"
    material = "Material(자재)"
    method = "Method(방법)"


class ApprovalStatus(str, enum.Enum):
    draft     = "작성중"
    pending   = "승인대기"
    rejected  = "반려"
    approved  = "승인완료"
    confirmed = "최종확정"


class Inspection(Base):
    __tablename__ = "inspection"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    gr_no: Mapped[str] = mapped_column(ForeignKey("receipt.gr_no"), nullable=False, unique=True)
    inspect_date: Mapped[date] = mapped_column(Date, nullable=False)
    inspect_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    pass_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    fail_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[InspectionResult] = mapped_column(SAEnum(InspectionResult))
    disposal: Mapped[DisposalType] = mapped_column(SAEnum(DisposalType), default=DisposalType.pending)
    defect_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    # 샘플링 정보 (ISO 2859-1)
    standard_id: Mapped[int | None] = mapped_column(ForeignKey("inspection_standard.id"), nullable=True)
    lot_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sample_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ac: Mapped[int | None] = mapped_column(Integer, nullable=True)
    re: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # 승인 워크플로 필드
    approval_status: Mapped[ApprovalStatus] = mapped_column(
        SAEnum(ApprovalStatus), default=ApprovalStatus.draft, nullable=False
    )
    inspector_id: Mapped[str | None] = mapped_column(ForeignKey("user.username"), nullable=True)
    requested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approver_id: Mapped[str | None] = mapped_column(ForeignKey("user.username"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmer_id: Mapped[str | None] = mapped_column(ForeignKey("user.username"), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    receipt: Mapped["Receipt"] = relationship()


class StandardStatus(str, enum.Enum):
    draft    = "작성중"
    approved = "승인완료"
    obsolete = "폐기"


class InspectionStandard(Base):
    """검사기준 마스터 (버전관리 포함)"""
    __tablename__ = "inspection_standard"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    std_no: Mapped[str] = mapped_column(String(30), nullable=False, index=True)  # QS-XXXXXXX
    std_rev: Mapped[str] = mapped_column(String(10), nullable=False, default="00")  # 00,01,02...
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    partner_id: Mapped[str | None] = mapped_column(ForeignKey("partner.partner_id"), nullable=True)
    drawing_no: Mapped[str | None] = mapped_column(String(50))
    drawing_rev: Mapped[str | None] = mapped_column(String(10))
    sampling_level: Mapped[str] = mapped_column(String(5), default="II")   # I / II / III
    aql: Mapped[float] = mapped_column(default=1.0)                         # 0.65 / 1.0 / 1.5 / 2.5 / 4.0
    status: Mapped[StandardStatus] = mapped_column(SAEnum(StandardStatus), default=StandardStatus.draft)
    approver_id: Mapped[str | None] = mapped_column(ForeignKey("user.username"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    effective_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    item: Mapped["Item"] = relationship(foreign_keys=[part_no])
    partner: Mapped["Partner | None"] = relationship(foreign_keys=[partner_id])
    items: Mapped[list["InspectionItem"]] = relationship(back_populates="standard", cascade="all, delete-orphan", order_by="InspectionItem.sort_order")


class InspectionItem(Base):
    """검사기준 항목 (상·하한, 중요특성 등)"""
    __tablename__ = "inspection_item"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    standard_id: Mapped[int] = mapped_column(ForeignKey("inspection_standard.id"), nullable=False)
    item_name: Mapped[str] = mapped_column(String(100), nullable=False)
    measure_position: Mapped[str | None] = mapped_column(String(100))
    spec_nominal: Mapped[float | None] = mapped_column()
    spec_upper: Mapped[float | None] = mapped_column()
    spec_lower: Mapped[float | None] = mapped_column()
    unit: Mapped[str] = mapped_column(String(20), default="mm")
    is_critical: Mapped[bool] = mapped_column(default=False)   # 중요특성
    is_special: Mapped[bool] = mapped_column(default=False)    # 특별특성
    method: Mapped[str | None] = mapped_column(String(100))    # 검사방법
    equipment: Mapped[str | None] = mapped_column(String(100)) # 측정장비
    frequency: Mapped[str] = mapped_column(String(50), default="매회")  # 검사주기
    skip_condition: Mapped[str | None] = mapped_column(Text)   # 검사생략조건
    inspect_condition: Mapped[str | None] = mapped_column(Text)# 검사조건
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    standard: Mapped["InspectionStandard"] = relationship(back_populates="items")


class NcrOccurType(str, enum.Enum):
    receipt    = "입고검사"
    process    = "공정검사"
    shipment   = "출하검사"
    customer   = "고객클레임"


class NcrStatus(str, enum.Enum):
    open       = "접수"
    processing = "처리중"
    closed     = "완료"


class NcrDisposal(str, enum.Enum):
    return_    = "반품"
    scrap      = "폐기"
    concession = "특채"
    repair     = "수리"
    pending    = "미결"


class AppealStatus(str, enum.Enum):
    submitted  = "접수"
    reviewing  = "검토중"
    accepted   = "인정"
    rejected   = "기각"


class NonConformance(Base):
    """부적합품 관리(NCR)"""
    __tablename__ = "non_conformance"

    ncr_no: Mapped[str] = mapped_column(String(30), primary_key=True)
    gr_no: Mapped[str | None] = mapped_column(ForeignKey("receipt.gr_no"), nullable=True)
    inspection_id: Mapped[int | None] = mapped_column(ForeignKey("inspection.id"), nullable=True)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    partner_id: Mapped[str | None] = mapped_column(ForeignKey("partner.partner_id"), nullable=True)
    occur_type: Mapped[NcrOccurType] = mapped_column(SAEnum(NcrOccurType), default=NcrOccurType.receipt)
    defect_type: Mapped[str] = mapped_column(String(200), nullable=False)
    defect_qty: Mapped[int] = mapped_column(Integer, default=0)
    disposal: Mapped[NcrDisposal] = mapped_column(SAEnum(NcrDisposal), default=NcrDisposal.pending)
    status: Mapped[NcrStatus] = mapped_column(SAEnum(NcrStatus), default=NcrStatus.open)
    # 8D 대응
    d1_team: Mapped[str | None] = mapped_column(Text)
    d2_desc: Mapped[str | None] = mapped_column(Text)        # 문제기술
    d3_containment: Mapped[str | None] = mapped_column(Text) # 봉쇄조치
    d4_root_cause: Mapped[str | None] = mapped_column(Text)  # 근본원인
    d5_corrective: Mapped[str | None] = mapped_column(Text)  # 시정조치
    d6_implemented: Mapped[str | None] = mapped_column(Text) # 실행확인
    d7_preventive: Mapped[str | None] = mapped_column(Text)  # 재발방지
    d8_verification: Mapped[str | None] = mapped_column(Text)# 효과검증
    note: Mapped[str | None] = mapped_column(Text)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime)  # 업체 통보일시
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)

    item: Mapped["Item"] = relationship(foreign_keys=[part_no])
    partner: Mapped["Partner | None"] = relationship(foreign_keys=[partner_id])
    appeals: Mapped[list["NcrAppeal"]] = relationship(back_populates="ncr", cascade="all, delete-orphan")


class NcrAppeal(Base):
    """NCR 이의신청"""
    __tablename__ = "ncr_appeal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ncr_no: Mapped[str] = mapped_column(ForeignKey("non_conformance.ncr_no"), nullable=False)
    partner_id: Mapped[str] = mapped_column(ForeignKey("partner.partner_id"), nullable=False)
    appeal_reason: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_text: Mapped[str | None] = mapped_column(Text)
    status: Mapped[AppealStatus] = mapped_column(SAEnum(AppealStatus), default=AppealStatus.submitted)
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("user.username"), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    ncr: Mapped["NonConformance"] = relationship(back_populates="appeals")
    partner: Mapped["Partner"] = relationship(foreign_keys=[partner_id])


class QualityClaim(Base):
    __tablename__ = "quality_claim"

    claim_no: Mapped[str] = mapped_column(String(30), primary_key=True)
    partner_id: Mapped[str] = mapped_column(ForeignKey("partner.partner_id"), nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    occur_date: Mapped[date] = mapped_column(Date, nullable=False)
    defect_type: Mapped[str] = mapped_column(String(100))
    defect_qty: Mapped[int] = mapped_column(Integer, default=0)
    m4_category: Mapped[M4Category | None] = mapped_column(SAEnum(M4Category))
    why1: Mapped[str | None] = mapped_column(Text)
    why2: Mapped[str | None] = mapped_column(Text)
    why3: Mapped[str | None] = mapped_column(Text)
    why4: Mapped[str | None] = mapped_column(Text)
    why5: Mapped[str | None] = mapped_column(Text)
    corrective_action: Mapped[str | None] = mapped_column(Text)
    preventive_action: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ClaimStatus] = mapped_column(SAEnum(ClaimStatus), default=ClaimStatus.received)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    partner: Mapped["Partner"] = relationship()
    item: Mapped["Item"] = relationship()
