"""실원가 분석 — 이동평균단가 기반 제품별 실제 원가"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract

from app.database import get_db
from app.models.auth import User
from app.models.master import Item, BomLine
from app.models.production import ProductionOrder, POrdStatus
from app.models.ledger import StockLedger, LedgerType
from app.routers.auth import get_current_user
from app.services.ledger_service import get_stock, get_avg_price_bulk

router = APIRouter(prefix="/cost/actual", tags=["실원가"])

COST_ROLES = {"admin", "accounting", "manager", "executive"}


def _require_cost(user: User = Depends(get_current_user)) -> User:
    if user.role not in COST_ROLES:
        raise HTTPException(403, "원가 조회 권한이 없습니다")
    return user


# ── 품목별 이동평균단가 현황 ──────────────────────────────────────
@router.get("/avg-cost")
def avg_cost_list(
    item_type: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(_require_cost),
):
    q = db.query(Item).filter(Item.active == True)
    if item_type:
        q = q.filter(Item.item_type == item_type)
    items = q.all()
    part_nos = [i.part_no for i in items]
    stocks = {p: get_stock(db, p) for p in part_nos}

    result = []
    for item in items:
        stock = stocks.get(item.part_no, 0)
        avg = float(item.avg_cost or 0)
        std = float(item.std_buy_price or 0)
        variance_pct = round((avg - std) / std * 100, 1) if std > 0 else None
        result.append({
            "part_no": item.part_no,
            "item_name": item.name,
            "item_type": item.item_type,
            "unit": item.unit,
            "current_stock": stock,
            "avg_cost": avg,
            "std_buy_price": std,
            "variance_pct": variance_pct,
            "stock_value": round(stock * avg, 0),
        })
    result.sort(key=lambda x: -x["stock_value"])
    total_value = sum(r["stock_value"] for r in result)
    return {"items": result, "total_stock_value": round(total_value, 0)}


# ── 제품별 BOM 실원가 롤업 ──────────────────────────────────────
@router.get("/product-cost/{part_no}")
def product_cost_rollup(
    part_no: str,
    db: Session = Depends(get_db),
    user: User = Depends(_require_cost),
):
    """제품 1EA 기준 실원가 = BOM 구성품 이동평균단가 합산"""
    item = db.get(Item, part_no)
    if not item:
        raise HTTPException(404, f"품목 없음: {part_no}")

    bom_lines = db.query(BomLine).filter(BomLine.product_part_no == part_no).all()
    if not bom_lines:
        return {"part_no": part_no, "item_name": item.name, "bom_lines": [], "total_material_cost": 0}

    comp_parts = [b.component_part_no for b in bom_lines]
    comp_items = {i.part_no: i for i in db.query(Item).filter(Item.part_no.in_(comp_parts)).all()}

    lines = []
    total_mat_cost = 0.0
    for bom in bom_lines:
        comp = comp_items.get(bom.component_part_no)
        avg = float(comp.avg_cost or comp.std_buy_price or 0) if comp else 0
        std = float(comp.std_buy_price or 0) if comp else 0
        qty_per = float(bom.qty_per)
        cost_per = avg * qty_per
        total_mat_cost += cost_per
        lines.append({
            "component_part_no": bom.component_part_no,
            "component_name": comp.name if comp else bom.component_part_no,
            "unit": bom.unit,
            "qty_per": qty_per,
            "avg_cost": avg,
            "std_price": std,
            "cost_per_unit": round(cost_per, 4),
            "variance_pct": round((avg - std) / std * 100, 1) if std > 0 else None,
        })

    std_sell = float(item.std_sell_price or 0)
    return {
        "part_no": part_no,
        "item_name": item.name,
        "std_sell_price": std_sell,
        "total_material_cost": round(total_mat_cost, 2),
        "gross_margin": round(std_sell - total_mat_cost, 2) if std_sell else None,
        "gross_margin_pct": round((std_sell - total_mat_cost) / std_sell * 100, 1) if std_sell > 0 else None,
        "bom_lines": sorted(lines, key=lambda x: -x["cost_per_unit"]),
    }


# ── 월별 실원가 집계 ──────────────────────────────────────────────
@router.get("/monthly")
def monthly_cost_summary(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user: User = Depends(_require_cost),
):
    """해당월 입고 기준 자재 매입금액 + 재고평가액"""
    from app.models.purchase import Receipt, ReceiptStatus
    receipts = (
        db.query(Receipt)
        .filter(
            Receipt.status == ReceiptStatus.confirmed,
            extract("year", Receipt.receipt_date) == year,
            extract("month", Receipt.receipt_date) == month,
        )
        .all()
    )
    purchase_total = sum(r.qty * float(r.unit_price) for r in receipts)

    # 출고(소모) 집계
    consumptions = (
        db.query(StockLedger)
        .filter(
            StockLedger.ledger_type == LedgerType.consumption,
            extract("year", StockLedger.txn_date) == year,
            extract("month", StockLedger.txn_date) == month,
        )
        .all()
    )
    consumption_total = sum(abs(e.qty) * float(e.unit_price) for e in consumptions)

    # 완성품 입고 집계
    prod_inputs = (
        db.query(StockLedger)
        .filter(
            StockLedger.ledger_type == LedgerType.production,
            extract("year", StockLedger.txn_date) == year,
            extract("month", StockLedger.txn_date) == month,
        )
        .all()
    )
    prod_total = sum(e.qty * float(e.unit_price) for e in prod_inputs)

    return {
        "year": year,
        "month": month,
        "purchase_amount": round(purchase_total, 0),
        "consumption_amount": round(consumption_total, 0),
        "production_amount": round(prod_total, 0),
        "receipt_count": len(receipts),
    }
