"""전사 KPI 목표 설정 — 관리자 설정, 전체 조회"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.kpi import KpiTarget
from app.routers.auth import require_admin
from app.models.auth import User

router = APIRouter(prefix="/kpi-targets", tags=["KPI목표"])

# KPI 마스터 정의 (순서·라벨·단위·방향·기본목표)
KPI_DEFS = [
    {"kpi_key": "delivery_rate",      "kpi_label": "납기준수율",     "unit": "%",  "higher_better": True,  "default_target": 95.0,
     "icon": "📦", "desc": "확정 출하 납기 기준"},
    {"kpi_key": "defect_rate",        "kpi_label": "수입검사 불량률", "unit": "%",  "higher_better": False, "default_target": 1.0,
     "icon": "🔍", "desc": "수입검사 불량수량 기준"},
    {"kpi_key": "cost_down_rate",      "kpi_label": "구매원가절감률",   "unit": "%",  "higher_better": True,  "default_target": 3.0,
     "icon": "💰", "desc": "전월 대비 구매금액 절감률"},
    {"kpi_key": "margin_rate",        "kpi_label": "매출이익률",     "unit": "%",  "higher_better": True,  "default_target": 15.0,
     "icon": "💹", "desc": "(매출 − 원가) / 매출"},
]
KPI_KEY_SET = {d["kpi_key"] for d in KPI_DEFS}


class TargetUpsert(BaseModel):
    target_value: float


@router.get("")
def list_targets(year: int, month: int, db: Session = Depends(get_db)):
    """해당 년월의 전사 KPI 목표 목록 (미설정 시 default 반환)"""
    saved = {
        t.kpi_key: float(t.target_value)
        for t in db.query(KpiTarget).filter(
            KpiTarget.year == year, KpiTarget.month == month
        ).all()
    }
    return [
        {**d, "target_value": saved.get(d["kpi_key"], d["default_target"]), "is_set": d["kpi_key"] in saved}
        for d in KPI_DEFS
    ]


@router.put("/{kpi_key}")
def upsert_target(
    kpi_key: str,
    body: TargetUpsert,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """전사 KPI 목표 등록·수정 (관리자 전용)"""
    existing = db.query(KpiTarget).filter(
        KpiTarget.year == year,
        KpiTarget.month == month,
        KpiTarget.kpi_key == kpi_key,
    ).first()
    if existing:
        existing.target_value = body.target_value
    else:
        db.add(KpiTarget(year=year, month=month, kpi_key=kpi_key, target_value=body.target_value))
    db.commit()
    return {"ok": True}
