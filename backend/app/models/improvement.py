from __future__ import annotations
from datetime import date, datetime
from sqlalchemy import Integer, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ImprovementRequest(Base):
    """부서별 개선과제 / 요청사항 등록"""
    __tablename__ = "improvement_request"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # 출처 구분
    source_module: Mapped[str] = mapped_column(String(30), nullable=False)   # quality / production / sales / purchase
    source_category: Mapped[str] = mapped_column(String(50), nullable=False) # 공정불량 / 입고검사 / 클레임 / OEE / 매출 / ...

    # 과제 내용
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    root_cause: Mapped[str | None] = mapped_column(Text)      # 원인 분석
    action_plan: Mapped[str | None] = mapped_column(Text)     # 개선 계획
    target_dept: Mapped[str | None] = mapped_column(String(50))  # 담당 부서
    target_date: Mapped[date | None] = mapped_column(Date)

    # 진행 상태
    status: Mapped[str] = mapped_column(String(20), default='등록')  # 등록 / 진행중 / 완료 / 보류
    result: Mapped[str | None] = mapped_column(Text)         # 완료 결과

    # 연계 (선택)
    ref_no: Mapped[str | None] = mapped_column(String(50))   # 클레임번호 / NCR번호 등

    created_by: Mapped[str | None] = mapped_column(ForeignKey("user.username"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
