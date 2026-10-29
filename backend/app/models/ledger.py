from datetime import date, datetime
from sqlalchemy import String, Integer, Numeric, Date, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class LedgerType(str, enum.Enum):
    receipt = "입고"
    shipment = "출고"
    production = "생산입고"
    consumption = "생산소모"
    adjustment = "재고조정"
    cancel = "취소"
    issue = "issue"           # 외주처 출고 (손익보고서용)
    loss_purge    = "퍼지손실"
    loss_startup  = "시동로스"
    loss_runner   = "러너폐기"
    regrind_in    = "재분쇄재입고"
    regrind_out   = "재분쇄재소모"
    raw_disposal  = "원재료폐기"


class StockLedger(Base):
    __tablename__ = "stock_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    txn_date: Mapped[date] = mapped_column(Date, nullable=False)
    part_no: Mapped[str] = mapped_column(ForeignKey("item.part_no"), nullable=False)
    ledger_type: Mapped[LedgerType] = mapped_column(SAEnum(LedgerType), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)          # 부호 포함 (+/-)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    ref_type: Mapped[str | None] = mapped_column(String(20))           # GR / SH / ADJ / CANCEL
    ref_no: Mapped[str | None] = mapped_column(String(30))
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    item: Mapped["Item"] = relationship()
