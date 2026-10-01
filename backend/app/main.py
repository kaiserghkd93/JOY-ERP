import os, hashlib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.database import engine, Base, SessionLocal
from app.routers import master, purchase, ledger, sales, quality, production, dashboard
from app.routers import purchase_group, invoice, auto_order, import_ls, bom, reports, cost, mold, mes_sync
from app.routers import auth, portal, admin_import

Base.metadata.create_all(bind=engine)

app = FastAPI(title="조이산업 ERP", version="0.2.0")

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
app.include_router(reports.router)
app.include_router(cost.router)
app.include_router(mold.router)
app.include_router(mes_sync.router)


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
        index = os.path.join(_dist, "index.html")
        if os.path.isfile(index):
            return FileResponse(index)
        return {"error": "frontend not built"}


@app.get("/health")
def health():
    return {"status": "ok", "version": "0.2.0"}
