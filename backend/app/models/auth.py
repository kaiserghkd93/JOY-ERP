from datetime import datetime
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
import enum


class UserRole(str, enum.Enum):
    admin      = "admin"       # ERP담당자 — 전체 (외주구매 포함)
    executive  = "executive"   # 대표/전무 — 경영지표·보고서 조회
    manager    = "manager"     # 상무 — 매출목표 조회만
    accounting = "accounting"  # 경리 — 재무·정산
    sales      = "sales"       # 영업관리 — 수주·출하·거래명세
    purchase   = "purchase"    # 외주구매 — 입고·BOM (발주는 admin 전용)
    shipping   = "shipping"    # 출하관리 — 출하·재고
    quality         = "quality"          # 품질검사 담당자 — 검사결과 입력·승인요청
    quality_manager = "quality_manager"  # 품질책임자 — 승인·반려·최종확정
    production = "production"  # 생산관리팀 — 생산오더·계획·금형·원가
    material      = "material"      # 자재구매 — 자재 발주·입고
    manufacturing = "manufacturing" # 제조관리 총괄 — 생산+영업 조회
    owner         = "owner"         # 시크릿 오너 — 구매·계정관리 제외 전체
    supplier      = "supplier"      # 외주처 포털 (외부)


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default=UserRole.supplier)
    partner_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
