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
