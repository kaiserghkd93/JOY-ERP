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


# ── 생산원가 차이 분석 ────────────────────────────────────────────
@router.get("/production-variance")
def production_variance(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user: User = Depends(_require_cost),
):
    """이달 완료 작업지시 기준 표준 vs 실원가 차이 분석"""
    from app.models.production import ProductionOrder, POrdStatus
    from app.models.cost import ProductCostStd, LaborRate
    from sqlalchemy import extract as _ex

    completed = db.query(ProductionOrder).filter(
        ProductionOrder.status == POrdStatus.completed,
        _ex("year",  ProductionOrder.complete_date) == year,
        _ex("month", ProductionOrder.complete_date) == month,
    ).all()

    if not completed:
        return {"year": year, "month": month, "items": [], "total": {"std_cost": 0, "actual_cost": 0, "variance": 0, "variance_pct": None}}

    part_nos = list({o.part_no for o in completed})
    item_map = {i.part_no: i for i in db.query(Item).filter(Item.part_no.in_(part_nos)).all()}

    bom_map: dict[str, list] = {}
    from app.models.master import BomLine
    for bl in db.query(BomLine).filter(BomLine.product_part_no.in_(part_nos)).all():
        bom_map.setdefault(bl.product_part_no, []).append(bl)

    comp_parts = list({bl.component_part_no for bls in bom_map.values() for bl in bls})
    comp_items = {i.part_no: i for i in db.query(Item).filter(Item.part_no.in_(comp_parts)).all()} if comp_parts else {}

    cost_stds = {cs.part_no: cs for cs in db.query(ProductCostStd).filter(ProductCostStd.part_no.in_(part_nos)).all()}
    labor_rates = {lr.id: lr for lr in db.query(LaborRate).all()}

    pord_nos = [o.pord_no for o in completed]
    consumption_rows = db.query(
        StockLedger.ref_no,
        StockLedger.part_no,
        func.sum(func.abs(StockLedger.qty)).label("qty"),
        func.avg(StockLedger.unit_price).label("avg_price"),
    ).filter(
        StockLedger.ledger_type == LedgerType.consumption,
        StockLedger.ref_no.in_(pord_nos),
    ).group_by(StockLedger.ref_no, StockLedger.part_no).all()
    consumption_map: dict[str, dict] = {}
    for r in consumption_rows:
        consumption_map.setdefault(r.ref_no, {})[r.part_no] = (float(r.qty or 0), float(r.avg_price or 0))

    result_items = []
    for order in completed:
        pno = order.part_no
        actual_qty = order.actual_qty or 0
        if actual_qty == 0:
            continue
        item = item_map.get(pno)

        # 표준 재료비
        std_material = sum(
            float(bl.qty_per) * float(comp_items[bl.component_part_no].std_buy_price or 0)
            for bl in bom_map.get(pno, [])
            if bl.component_part_no in comp_items
        )

        # 표준 노무비
        std_labor = 0.0
        cs = cost_stds.get(pno)
        if cs:
            lr = labor_rates.get(cs.process_id)
            if lr:
                std_labor = float(cs.std_labor_min) / 60.0 * float(lr.rate_per_hour)

        std_total = std_material + std_labor

        # 실 재료비 (소모원장 기준)
        consumed = consumption_map.get(order.pord_no, {})
        actual_material_total = sum(qty * price for qty, price in consumed.values())
        actual_material_per = actual_material_total / actual_qty if actual_qty > 0 else 0.0

        variance = actual_material_per - std_total
        variance_pct = round(variance / std_total * 100, 1) if std_total > 0 else None

        result_items.append({
            "pord_no": order.pord_no,
            "part_no": pno,
            "part_name": item.name if item else pno,
            "actual_qty": actual_qty,
            "std_material": round(std_material, 2),
            "std_labor": round(std_labor, 2),
            "std_total": round(std_total, 2),
            "actual_material_per": round(actual_material_per, 2),
            "variance": round(variance, 2),
            "variance_pct": variance_pct,
            "total_variance": round(variance * actual_qty, 0),
        })

    result_items.sort(key=lambda x: abs(x["total_variance"]), reverse=True)

    total_std = sum(r["std_total"] * r["actual_qty"] for r in result_items)
    total_actual = sum(r["actual_material_per"] * r["actual_qty"] for r in result_items)
    variance_total = total_actual - total_std

    return {
        "year": year,
        "month": month,
        "items": result_items,
        "total": {
            "std_cost": round(total_std, 0),
            "actual_cost": round(total_actual, 0),
            "variance": round(variance_total, 0),
            "variance_pct": round(variance_total / total_std * 100, 1) if total_std > 0 else None,
        },
    }
