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
from app.routers import inventory_adj
from app.routers import quality_advanced
from app.models import quality_advanced as _qa_models  # noqa: ensure tables
from app.models import inventory_adj as _inv_adj_models  # noqa: ensure tables registered

Base.metadata.create_all(bind=engine)

from sqlalchemy import text as _text
with engine.connect() as _conn:
    for _sql in [
        "ALTER TABLE invoice ADD COLUMN IF NOT EXISTS closing_type VARCHAR(10)",
        "ALTER TABLE purchase_order ADD COLUMN IF NOT EXISTS po_type VARCHAR(20) DEFAULT 'outsource'",
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
        # NCR / 이의신청 (Base.metadata.create_all로 테이블 자동 생성)
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
import hashlib as _hl
_JWT_SECRET = os.environ.get("JWT_SECRET", "joy-erp-secret-2026")
def _pw(raw: str) -> str:
    return _hl.sha256((raw + _JWT_SECRET).encode()).hexdigest()

with SessionLocal() as _s:
    from app.models.auth import User as _User
    _ou = os.environ.get("INIT_OWNER_USER", "")
    _op = os.environ.get("INIT_OWNER_PASS", "")
    _ap = os.environ.get("INIT_ADMIN_PASS", "")
    if _ou and _op:
        if not _s.query(_User).filter(_User.username == _ou).first():
            _s.add(_User(username=_ou, password_hash=_pw(_op), name="오너", role="owner"))
    if _ap:
        _adm = _s.query(_User).filter(_User.username == "admin").first()
        if _adm:
            _adm.password_hash = _pw(_ap)
    _s.commit()

app = FastAPI(title="넥스젬 ERP", version="0.2.0")

FRONTEND_ORIGIN = os.environ.get("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(portal.router)
app.include_router(admin_import.router)
app.include_router(monthly_sales.router)
app.include_router(monthly_purchase.router)
app.include_router(master.router)
app.include_router(purchase.router)
app.include_router(ledger.router)
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
app.include_router(cost_actual.router)


@app.on_event("startup")
def _init_admin():
    """최초 실행 시 admin 계정 없으면 자동 생성"""
    from app.models.auth import User, UserRole
    SECRET = os.environ.get("JWT_SECRET", "joy-erp-secret-2026")
    ADMIN_PW = os.environ.get("ADMIN_PASSWORD", "admin1234")
    pw_hash = hashlib.sha256((ADMIN_PW + SECRET).encode()).hexdigest()
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.role == UserRole.admin).first():
            db.add(User(username="admin", password_hash=pw_hash,
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
