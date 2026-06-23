from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import master, purchase

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


@app.get("/health")
def health():
    return {"status": "ok", "phase": "0 — 마스터/트랜잭션 분리"}
