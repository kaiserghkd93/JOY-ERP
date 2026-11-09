import os, hashlib  # noqa
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.database import engine, Base, SessionLocal
from app.routers import master, purchase, ledger, sales, quality, production, dashboard
from app.routers import purchase_group, invoice, auto_order, import_ls, bom, reports, cost, mold, mes_sync
from app.routers import auth, portal, admin_import, monthly_sales, monthly_purchase, sales_target
from app.routers import material, mrp, cost_actual
from app.routers import kpi_target
from app.models import kpi as _kpi_models  # noqa: ensure kpi_target table
from app.routers import inventory_adj
from app.routers import quality_advanced
from app.routers import lot
from app.routers import supplier_score, audit as audit_router
from app.routers import tps as tps_router, kaizen as kaizen_router
from app.routers import improvement as improvement_router
from app.routers import purchase_request as pr_router
from app.routers import general_purchase as gpr_router
from app.routers import admin_maintenance
from app.routers import mes_floor as mes_floor_router
from app.routers import mes_monitor as mes_monitor_router
from app.models import mes_floor as _mes_floor_models  # noqa: ensure MES tables
from app.routers import hr as hr_router
from app.models import hr as _hr_models  # noqa: ensure HR tables
from app.models.production import WeeklyPlan as _weekly_plan_model  # noqa: ensure weekly_plan table
from app.models import improvement as _improvement_models  # noqa: ensure table
from app.models import quality_advanced as _qa_models  # noqa: ensure tables
from app.models import inventory_adj as _inv_adj_models  # noqa: ensure tables registered
from app.models import audit as _audit_models  # noqa: ensure audit_log table
from app.models import tps as _tps_models  # noqa: ensure TPS tables

Base.metadata.create_all(bind=engine)

from sqlalchemy import text as _text
with engine.connect() as _conn:
    for _sql in [
        "ALTER TABLE invoice ADD COLUMN IF NOT EXISTS closing_type VARCHAR(10)",
        "ALTER TABLE purchase_order ADD COLUMN IF NOT EXISTS po_type VARCHAR(20) DEFAULT 'outsource'",
        "ALTER TABLE purchase_order ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT '작성중'",
        "ALTER TABLE purchase_order ADD COLUMN IF NOT EXISTS approval_comment TEXT",
        "ALTER TABLE item ADD COLUMN IF NOT EXISTS avg_cost NUMERIC(15,4) DEFAULT 0",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT '작성중'",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS inspector_id VARCHAR(50)",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS approver_id VARCHAR(50)",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS rejection_reason TEXT",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS confirmer_id VARCHAR(50)",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS standard_id INTEGER",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS lot_size INTEGER",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS sample_size INTEGER",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS ac INTEGER",
        "ALTER TABLE inspection ADD COLUMN IF NOT EXISTS re INTEGER",
        "ALTER TABLE mold ADD COLUMN IF NOT EXISTS lent_to_partner_id VARCHAR(50)",
        "ALTER TABLE mold ADD COLUMN IF NOT EXISTS lent_date DATE",
        # BOM 사출 특화 확장
        "ALTER TABLE bom_line ADD COLUMN IF NOT EXISTS net_weight_g NUMERIC(12,4) DEFAULT 0",
        "ALTER TABLE bom_line ADD COLUMN IF NOT EXISTS runner_weight_g NUMERIC(12,4) DEFAULT 0",
        "ALTER TABLE bom_line ADD COLUMN IF NOT EXISTS std_defect_rate NUMERIC(6,3) DEFAULT 0",
        "ALTER TABLE bom_line ADD COLUMN IF NOT EXISTS std_purge_loss_kg NUMERIC(10,4) DEFAULT 0",
        "ALTER TABLE bom_line ADD COLUMN IF NOT EXISTS std_startup_loss_kg NUMERIC(10,4) DEFAULT 0",
        "ALTER TABLE bom_line ADD COLUMN IF NOT EXISTS regrind_ratio NUMERIC(6,3) DEFAULT 0",
        "ALTER TABLE bom_line ADD COLUMN IF NOT EXISTS plan_std_qty NUMERIC(15,4)",
        "ALTER TABLE bom_line ADD COLUMN IF NOT EXISTS actual_deduct_base NUMERIC(15,4)",
        # 외주 납품수량 추적 (거래명세표 기준)
        "ALTER TABLE receipt ADD COLUMN IF NOT EXISTS delivered_qty INTEGER DEFAULT 0",
        # 포털 수동 납품(발주 없는 품목)을 위해 po_no nullable 허용
        "ALTER TABLE receipt ALTER COLUMN po_no DROP NOT NULL",
        # 공정/출하 불량 — 발생경로 구분 (자체생산/외주)
        "ALTER TABLE process_outgoing_defect ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT '자체생산'",
        "ALTER TABLE process_outgoing_defect ADD COLUMN IF NOT EXISTS partner_id VARCHAR(50)",
        # 수입검사 결과 Enum에 검사대기 추가는 DDL AUTOCOMMIT 블록에서 처리
        # NCR / 이의신청 (Base.metadata.create_all로 테이블 자동 생성)
        # LOT 번호 관리
        "ALTER TABLE receipt ADD COLUMN IF NOT EXISTS lot_no VARCHAR(50)",
        "ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS lot_no VARCHAR(50)",
        "ALTER TABLE shipment ADD COLUMN IF NOT EXISTS lot_no VARCHAR(50)",
        # 클레임 8D 필드
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d1_team TEXT",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d2_desc TEXT",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d3_containment TEXT",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d4_root_cause TEXT",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d5_corrective TEXT",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d6_implemented TEXT",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d7_preventive TEXT",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d8_verification TEXT",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d1_date DATE",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d2_date DATE",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d3_date DATE",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d4_date DATE",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d5_date DATE",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d6_date DATE",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d7_date DATE",
        "ALTER TABLE quality_claim ADD COLUMN IF NOT EXISTS d8_date DATE",
        # 공정/출하 불량 단가 (로스 금액 계산용)
        "ALTER TABLE process_outgoing_defect ADD COLUMN IF NOT EXISTS unit_price INTEGER DEFAULT 0",
        # 공수 로스 (분) = 불량수량 × 품목 manual_ct_sec / 60
        "ALTER TABLE process_outgoing_defect ADD COLUMN IF NOT EXISTS labor_loss_min FLOAT DEFAULT 0",
        # MES 불량 공수 로스 (분) = defect_qty × std_labor_min / 60
        "ALTER TABLE mes_defect_detail ADD COLUMN IF NOT EXISTS labor_loss_min FLOAT DEFAULT 0",
        # 불량 개선 워크플로우
        "ALTER TABLE process_outgoing_defect ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT '등록'",
        "ALTER TABLE process_outgoing_defect ADD COLUMN IF NOT EXISTS improvement_note TEXT",
        "ALTER TABLE process_outgoing_defect ADD COLUMN IF NOT EXISTS reviewer VARCHAR(50)",
        "ALTER TABLE process_outgoing_defect ADD COLUMN IF NOT EXISTS reviewed_at DATE",
        # TPS — C/T 필드 (자체생산 기준)
        "ALTER TABLE item ADD COLUMN IF NOT EXISTS machine_ct_sec FLOAT",
        "ALTER TABLE item ADD COLUMN IF NOT EXISTS manual_ct_sec FLOAT",
        # TPS — MES 실제 C/T & 로스코드
        "ALTER TABLE mes_production_log ADD COLUMN IF NOT EXISTS actual_ct_sec FLOAT",
        "ALTER TABLE mes_production_log ADD COLUMN IF NOT EXISTS loss_code VARCHAR(2)",
        # TPS — 월간계획 가동시간, 일실적 비가동/로스
        "ALTER TABLE monthly_plan ADD COLUMN IF NOT EXISTS work_time_min FLOAT DEFAULT 480",
        "ALTER TABLE daily_actual ADD COLUMN IF NOT EXISTS stop_time_min FLOAT",
        "ALTER TABLE daily_actual ADD COLUMN IF NOT EXISTS loss_code VARCHAR(2)",
        # 성능 최적화 인덱스
        "CREATE INDEX IF NOT EXISTS ix_stock_ledger_part_no ON stock_ledger(part_no)",
        "CREATE INDEX IF NOT EXISTS ix_stock_ledger_txn_date ON stock_ledger(txn_date)",
        "CREATE INDEX IF NOT EXISTS ix_stock_ledger_type ON stock_ledger(ledger_type)",
        "CREATE INDEX IF NOT EXISTS ix_receipt_partner ON receipt(partner_id)",
        "CREATE INDEX IF NOT EXISTS ix_receipt_date ON receipt(receipt_date)",
        "CREATE INDEX IF NOT EXISTS ix_shipment_date ON shipment(ship_date)",
        "CREATE INDEX IF NOT EXISTS ix_process_defect_date ON process_outgoing_defect(defect_date)",
        "CREATE INDEX IF NOT EXISTS ix_process_defect_status ON process_outgoing_defect(status)",
        # MRP 개선 — 리드타임, 구매요청(PR)
        "ALTER TABLE item ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 7",
        "CREATE INDEX IF NOT EXISTS ix_purchase_request_part_no ON purchase_request(part_no)",
        "CREATE INDEX IF NOT EXISTS ix_purchase_request_status ON purchase_request(status)",
        "CREATE INDEX IF NOT EXISTS ix_purchase_request_need_date ON purchase_request(need_date)",
        # HR — 소속 법인 컬럼
        "ALTER TABLE hr_employee ADD COLUMN IF NOT EXISTS company VARCHAR(50) DEFAULT '조이산업'",
        # 품목 — 캐비티 수 (BOM/MES 이론생산량 계산)
        "ALTER TABLE item ADD COLUMN IF NOT EXISTS cavity_count INTEGER DEFAULT 1",
        # 작업지시 — 담당 작업자 지정
        "ALTER TABLE mes_work_order ADD COLUMN IF NOT EXISTS assigned_worker_id VARCHAR(50)",
    ]:
        try:
            _conn.execute(_text(_sql))
            _conn.commit()
        except Exception:
            pass

# DDL must run outside transactions for PostgreSQL enum operations
with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as _ddl:
    for _role in ['executive','manager','accounting','sales','purchase',
                  'shipping','quality','quality_manager','production','material','manufacturing','supplier','owner']:
        try:
            _ddl.execute(_text(f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{_role}'"))
        except Exception:
            pass
    for _dst in ['자체생산','외주']:
        try:
            _ddl.execute(_text(f"ALTER TYPE defectsourcetype ADD VALUE IF NOT EXISTS '{_dst}'"))
        except Exception:
            pass
    # inspectionresult: SQLAlchemy가 str enum name(키)으로 저장 → 키 이름으로 ADD VALUE
    for _ir in ['pending_insp', 'pass_', 'fail', 'partial', '검사대기', '합격', '불합격', '부분합격']:
        try:
            _ddl.execute(_text(f"ALTER TYPE inspectionresult ADD VALUE IF NOT EXISTS '{_ir}'"))
        except Exception:
            pass
    for _dt in ['반품','폐기','특채','보류','합격']:
        try:
            _ddl.execute(_text(f"ALTER TYPE disposaltype ADD VALUE IF NOT EXISTS '{_dt}'"))
        except Exception:
            pass
    for _lt in ['퍼지손실','시동로스','러너폐기','재분쇄재입고','재분쇄재소모','원재료폐기']:
        try:
            _ddl.execute(_text(f"ALTER TYPE ledgertype ADD VALUE IF NOT EXISTS '{_lt}'"))
        except Exception:
            pass
    try:
        _ddl.execute(_text('ALTER TABLE "user" ALTER COLUMN role TYPE VARCHAR(20) USING role::VARCHAR(20)'))
    except Exception:
        pass

# ── 환경변수 기반 계정 초기화 ─────────────────────────────────────────
with SessionLocal() as _s:
    from app.models.auth import User as _User
    from app.routers.auth import _hash as _pw_hash
    _ou = os.environ.get("INIT_OWNER_USER", "")
    _op = os.environ.get("INIT_OWNER_PASS", "")
    _ap = os.environ.get("INIT_ADMIN_PASS", "")
    if _ou and _op:
        if not _s.query(_User).filter(_User.username == _ou).first():
            _s.add(_User(username=_ou, password_hash=_pw_hash(_op), name="오너", role="owner"))
    if _ap:
        _adm = _s.query(_User).filter(_User.username == "admin").first()
        if _adm:
            _adm.password_hash = _pw_hash(_ap)
    _s.commit()

app = FastAPI(title="넥스젬 ERP", version="0.2.0")

_ALLOWED_ORIGINS = [
    "https://joy-erp-production.up.railway.app",
    "http://localhost:5173",
    "http://localhost:8000",
]
_extra = os.environ.get("EXTRA_ORIGINS", "")
if _extra:
    _ALLOWED_ORIGINS += [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    allow_headers=["Authorization","Content-Type","Accept"],
)

app.include_router(auth.router)
app.include_router(portal.router)
app.include_router(admin_import.router)
app.include_router(monthly_sales.router)
app.include_router(monthly_purchase.router)
app.include_router(master.router)
app.include_router(purchase.router)
app.include_router(ledger.router)
app.include_router(kpi_target.router)
app.include_router(sales.router)
app.include_router(quality.router)
app.include_router(production.router)
app.include_router(dashboard.router)
app.include_router(purchase_group.router)
app.include_router(invoice.router)
app.include_router(auto_order.router)
app.include_router(import_ls.router)
app.include_router(bom.router)
app.include_router(inventory_adj.router)
app.include_router(quality_advanced.router)
app.include_router(reports.router)
app.include_router(cost.router)
app.include_router(mold.router)
app.include_router(mes_sync.router)
app.include_router(sales_target.router)
app.include_router(material.router)
app.include_router(mrp.router)
app.include_router(pr_router.router)
app.include_router(gpr_router.router)
app.include_router(cost_actual.router)
app.include_router(lot.router)
app.include_router(supplier_score.router)
app.include_router(audit_router.router)
app.include_router(tps_router.router)
app.include_router(kaizen_router.router)
app.include_router(improvement_router.router)
app.include_router(admin_maintenance.router)
app.include_router(mes_floor_router.router)
app.include_router(mes_monitor_router.router)
app.include_router(hr_router.router)


@app.on_event("startup")
def _init_admin():
    """최초 실행 시 admin 계정 없으면 자동 생성 (bcrypt)"""
    from app.models.auth import User, UserRole
    from app.routers.auth import _hash as _bcrypt_hash
    ADMIN_PW = os.environ.get("ADMIN_PASSWORD", "admin1234")
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.role == UserRole.admin).first():
            db.add(User(username="admin", password_hash=_bcrypt_hash(ADMIN_PW),
                        name="관리자", role=UserRole.admin))
            db.commit()
    finally:
        db.close()


# ── 협력사 포털 정적 파일 서빙 ────────────────────────────────────
_portal = os.path.join(os.path.dirname(__file__), "..", "portal_static")
if os.path.isdir(_portal):
    app.mount("/portal-app", StaticFiles(directory=_portal, html=True), name="portal")

# ── 프론트엔드 정적 파일 서빙 (배포 시) ──────────────────────────
_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str = ""):
        if full_path.startswith("portal-app"):
            portal_index = os.path.join(_portal, "index.html")
            if os.path.isfile(portal_index):
                return FileResponse(portal_index)
        index = os.path.join(_dist, "index.html")
        if os.path.isfile(index):
            return FileResponse(index)
        return {"error": "frontend not built"}


@app.get("/health")
def health():
    return {"status": "ok", "version": "0.2.0"}
