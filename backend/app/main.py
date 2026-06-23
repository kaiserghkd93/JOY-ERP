from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import master, purchase, ledger, sales, quality, production, dashboard

Base.metadata.create_all(bind=engine)

app = FastAPI(title="조이산업 ERP", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(master.router)
app.include_router(purchase.router)
app.include_router(ledger.router)
app.include_router(sales.router)
app.include_router(quality.router)
app.include_router(production.router)
app.include_router(dashboard.router)


@app.get("/health")
def health():
    return {"status": "ok", "phase": "4 — 전 모듈 완료"}
