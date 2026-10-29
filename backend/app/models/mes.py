from datetime import datetime, date
from sqlalchemy import String, Integer, Float, Numeric, Date, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class MesPartMap(Base):
    """MES 품번 → ERP 품번 매핑"""
    __tablename__ = "mes_part_map"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    mes_part_no: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    erp_part_no: Mapped[str] = mapped_column(String(100), nullable=False)
    note: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class MesProductionCost(Base):
    """MES 생산실적 기준 원가·마진 계산 결과"""
    __tablename__ = "mes_production_cost"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    mes_log_id: Mapped[int] = mapped_column(Integer, ForeignKey("mes_production_log.id"), unique=True, nullable=False)
    prod_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    part_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    actual_qty: Mapped[int] = mapped_column(Integer, default=0)
    material_cost: Mapped[float] = mapped_column(Numeric(18, 2), default=0)  # 원자재비
    labor_cost: Mapped[float] = mapped_column(Numeric(18, 2), default=0)     # 공수비
    std_sell_price: Mapped[float] = mapped_column(Numeric(18, 2), default=0) # EA당 판매단가
    revenue: Mapped[float] = mapped_column(Numeric(18, 2), default=0)        # 매출
    margin: Mapped[float] = mapped_column(Numeric(18, 2), default=0)         # 마진
    margin_rate: Mapped[float | None] = mapped_column(Float)                 # 마진율 %
    bom_ok: Mapped[bool] = mapped_column(Boolean, default=False)             # BOM 있음
    labor_ok: Mapped[bool] = mapped_column(Boolean, default=False)           # 공수표준 있음
    stock_deducted: Mapped[bool] = mapped_column(Boolean, default=False)     # 재고 차감 여부
    calc_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class MesSyncLog(Base):
    """MES 동기화 이력"""
    __tablename__ = "mes_sync_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sync_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    rows_fetched: Mapped[int] = mapped_column(Integer, default=0)
    rows_ok: Mapped[int] = mapped_column(Integer, default=0)
    rows_err: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="success")  # success / partial / error
    message: Mapped[str | None] = mapped_column(Text)


class MesDefectDetail(Base):
    """불량유형별 원가·로스율 상세"""
    __tablename__ = "mes_defect_detail"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prod_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    part_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    part_name: Mapped[str | None] = mapped_column(String(200))
    machine_no: Mapped[str | None] = mapped_column(String(50))
    shift: Mapped[str | None] = mapped_column(String(10))
    defect_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)  # 불량유형
    defect_qty: Mapped[int] = mapped_column(Integer, default=0)     # 불량수량
    production_qty: Mapped[int] = mapped_column(Integer, default=0) # 해당 품번 양품수량 (로스율 분모용)
    unit_cost: Mapped[float] = mapped_column(Numeric(18, 4), default=0)   # EA당 BOM+공수 원가
    defect_cost: Mapped[float] = mapped_column(Numeric(18, 2), default=0) # 불량금액 = defect_qty × unit_cost
    production_cost: Mapped[float] = mapped_column(Numeric(18, 2), default=0) # 생산금액 = production_qty × unit_cost
    loss_rate: Mapped[float | None] = mapped_column(Float)          # 로스율 % = defect_cost / production_cost × 100
    mes_log_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("mes_production_log.id"))
    calc_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class MesProductionLog(Base):
    """MES에서 수신한 일일 생산실적 원본"""
    __tablename__ = "mes_production_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prod_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    part_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    part_name: Mapped[str | None] = mapped_column(String(200))
    machine_no: Mapped[str | None] = mapped_column(String(50))     # 설비번호
    shift: Mapped[str | None] = mapped_column(String(10))           # 주간/야간
    plan_qty: Mapped[int] = mapped_column(Integer, default=0)
    actual_qty: Mapped[int] = mapped_column(Integer, default=0)     # 양품수량
    defect_qty: Mapped[int] = mapped_column(Integer, default=0)     # 불량수량
    defect_reason: Mapped[str | None] = mapped_column(String(200))  # 불량원인
    run_time_min: Mapped[float | None] = mapped_column(Float)       # 가동시간(분)
    down_time_min: Mapped[float | None] = mapped_column(Float)      # 비가동시간(분)
    down_reason: Mapped[str | None] = mapped_column(String(200))    # 비가동원인
    worker: Mapped[str | None] = mapped_column(String(50))          # 작업자
    mes_order_no: Mapped[str | None] = mapped_column(String(50))    # MES 작업지시번호
    synced_to_erp: Mapped[bool] = mapped_column(Boolean, default=False)
    erp_pord_no: Mapped[str | None] = mapped_column(String(30))     # ERP 생산지시번호
    sync_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    raw_json: Mapped[str | None] = mapped_column(Text)              # MES 원본 JSON
