from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    table_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    record_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(10), nullable=False)   # CREATE / UPDATE / DELETE
    field_name: Mapped[str | None] = mapped_column(String(100))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    changed_by: Mapped[str] = mapped_column(String(50), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    note: Mapped[str | None] = mapped_column(String(200))
