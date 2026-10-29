from datetime import date, datetime
from sqlalchemy import String, Integer, Numeric, Date, DateTime, ForeignKey, Enum as SAEnum, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
import enum


class AdjStatus(str, enum.Enum):
    draft     = "작성중"
    pending   = "승인대기"
    approved  = "승인완료"
    rejected  = "반려"
    confirmed = "확정"


class InventoryAdjustment(Base):
    """재고 실사 조정 — 담당자 등록 → 책임자 승인 → 확정 후 ledger 반영"""
    __tablename__ = "inventory_adjustment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    adj_no: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    adj_date: Mapped[date] = mapped_column(Date, nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    location: Mapped[str | None] = mapped_column(String(100))
    book_qty: Mapped[int] = mapped_column(Integer, nullable=False)    # ERP 장부재고
    actual_qty: Mapped[int] = mapped_column(Integer, nullable=False)  # 실사수량
    diff_qty: Mapped[int] = mapped_column(Integer, nullable=False)    # actual - book
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    related_pord: Mapped[str | None] = mapped_column(String(30))
    status: Mapped[AdjStatus] = mapped_column(SAEnum(AdjStatus), default=AdjStatus.draft)
    created_by: Mapped[str] = mapped_column(String(50), nullable=False)
    approved_by: Mapped[str | None] = mapped_column(String(50))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime)
    rejection_reason: Mapped[str | None] = mapped_column(String(500))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)
    ledger_id: Mapped[int | None] = mapped_column(Integer)  # 확정 시 생성된 ledger 행 ID
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class LossType(str, enum.Enum):
    purge         = "퍼지·짜내기"
    startup       = "시동로스"
    runner_scrap  = "러너폐기"
    runner_recover = "러너회수"
    regrind_in    = "재분쇄재회수"
    regrind_out   = "재분쇄재재투입"
    raw_disposal  = "원재료폐기"
    product_defect = "제품불량(kg)"
    other         = "기타"


class LossStatus(str, enum.Enum):
    draft     = "작성중"
    confirmed = "확정"


class ProductionLoss(Base):
    """생산 로스 — 퍼지/러너/시동로스/재분쇄재 kg단위 등록"""
    __tablename__ = "production_loss"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    loss_date: Mapped[date] = mapped_column(Date, nullable=False)
    part_no: Mapped[str | None] = mapped_column(String(50))       # 제품 품번 (선택)
    raw_part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)  # 원재료
    machine_no: Mapped[str | None] = mapped_column(String(30))    # 사출기 번호
    pord_no: Mapped[str | None] = mapped_column(String(30))       # 작업지시 연결
    loss_type: Mapped[LossType] = mapped_column(SAEnum(LossType), nullable=False)
    qty_kg: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)  # kg 단위
    reason_code: Mapped[str | None] = mapped_column(String(50))
    note: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[LossStatus] = mapped_column(SAEnum(LossStatus), default=LossStatus.draft)
    created_by: Mapped[str] = mapped_column(String(50), nullable=False)
    confirmed_by: Mapped[str | None] = mapped_column(String(50))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)
    ledger_id: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
