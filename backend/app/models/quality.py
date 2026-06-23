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

    receipt: Mapped["Receipt"] = relationship()


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
