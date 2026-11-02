"""협력사 평가 점수 — 납기준수율 + 불량PPM 기반 월별 종합점수"""
from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from app.database import get_db
from app.models.master import Partner
from app.models.purchase import PurchaseOrder, Receipt, ReceiptStatus
from app.models.quality import Inspection, InspectionResult

router = APIRouter(prefix="/supplier-score", tags=["협력사평가"])


def _compute_score(db: Session, partner_id: str, year: int, month: int) -> dict:
    # ── 납기준수율 ──────────────────────────────────────────────────────
    # 해당 월 확정입고 중 po.due_date >= receipt_date 인 비율
    base_q = (
        db.query(Receipt, PurchaseOrder)
        .join(PurchaseOrder, Receipt.po_no == PurchaseOrder.po_no)
        .filter(
            Receipt.partner_id == partner_id,
            Receipt.status == ReceiptStatus.confirmed,
            extract("year", Receipt.receipt_date) == year,
            extract("month", Receipt.receipt_date) == month,
        )
    )
    rows = base_q.all()
    total_receipts = len(rows)
    on_time = sum(1 for r, po in rows if r.receipt_date <= po.due_date) if rows else 0
    delivery_rate = round(on_time / total_receipts * 100, 1) if total_receipts > 0 else None

    # ── 불량 PPM ────────────────────────────────────────────────────────
    # 해당 월 수입검사 대상 입고의 검사결과 집계
    insp_q = (
        db.query(
            func.coalesce(func.sum(Inspection.inspect_qty), 0).label("total_inspect"),
            func.coalesce(func.sum(Inspection.fail_qty), 0).label("total_fail"),
        )
        .join(Receipt, Inspection.gr_no == Receipt.gr_no)
        .filter(
            Receipt.partner_id == partner_id,
            extract("year", Receipt.receipt_date) == year,
            extract("month", Receipt.receipt_date) == month,
        )
    ).first()
    total_inspect = int(insp_q.total_inspect) if insp_q else 0
    total_fail = int(insp_q.total_fail) if insp_q else 0
    defect_ppm = round(total_fail / total_inspect * 1_000_000, 0) if total_inspect > 0 else None

    # ── 종합점수 (100점 만점) ────────────────────────────────────────────
    # 납기준수율 60% + 품질(PPM 기반 환산) 40%
    # PPM → 품질점수: 0 PPM = 100점, 10000 PPM = 0점 (선형)
    score = None
    delivery_score = delivery_rate  # 0~100
    quality_score = None
    if defect_ppm is not None:
        quality_score = max(0.0, round(100 - defect_ppm / 100, 1))
    if delivery_score is not None and quality_score is not None:
        score = round(delivery_score * 0.6 + quality_score * 0.4, 1)

    return {
        "partner_id": partner_id,
        "year": year,
        "month": month,
        "total_receipts": total_receipts,
        "on_time_receipts": on_time,
        "delivery_rate": delivery_rate,
        "total_inspect_qty": total_inspect,
        "total_fail_qty": total_fail,
        "defect_ppm": defect_ppm,
        "quality_score": quality_score,
        "score": score,
        "grade": _grade(score),
    }


def _grade(score: float | None) -> str:
    if score is None:
        return "-"
    if score >= 90:
        return "A"
    if score >= 75:
        return "B"
    if score >= 60:
        return "C"
    return "D"


@router.get("/{partner_id}")
def get_score(
    partner_id: str,
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
):
    today = date.today()
    y = year or today.year
    m = month or today.month
    return _compute_score(db, partner_id, y, m)


@router.get("/")
def list_scores(
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
):
    """전체 협력사 월별 평가 목록"""
    today = date.today()
    y = year or today.year
    m = month or today.month
    partners = db.query(Partner).filter(
        Partner.partner_type.in_(["외주처", "공용"])
    ).all()
    results = []
    for p in partners:
        row = _compute_score(db, p.partner_id, y, m)
        row["partner_name"] = p.name
        if row["total_receipts"] > 0 or row["total_inspect_qty"] > 0:
            results.append(row)
    results.sort(key=lambda x: (x["score"] or -1), reverse=True)
    return {"year": y, "month": m, "items": results}
