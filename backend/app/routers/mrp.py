"""MRP (자재소요량계획) — 수주/생산계획 기반 Make/Buy 자동 발주·생산오더 제안"""
import traceback
from datetime import date as date_type, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from app.database import get_db
from app.models.auth import User
from app.models.sales import SalesOrder, Shipment
from app.models.production import MonthlyPlan, DailyActual, ProductionOrder, POrdStatus
from app.models.master import BomLine, Item, Partner
from app.models.purchase import PurchaseOrder, Receipt
from app.routers.auth import get_current_user
from app.services.ledger_service import get_stock_bulk
from app.services.doc_no import next_doc_no

router = APIRouter(prefix="/mrp", tags=["MRP"])

MRP_ROLES = {"admin", "material", "manager", "executive", "manufacturing"}
MAKE_TYPES = {"semi", "finished"}   # 생산오더 대상
BUY_TYPES  = {"raw", "sub", "outsourced"}  # 구매발주 대상


def _require_mrp(user: User = Depends(get_current_user)) -> User:
    if user.role not in MRP_ROLES:
        raise HTTPException(403, "MRP 권한이 없습니다")
    return user


def _get_open_po_qty(db: Session, part_nos: list[str]) -> dict[str, int]:
    if not part_nos:
        return {}
    pos = db.query(PurchaseOrder).filter(
        PurchaseOrder.part_no.in_(part_nos),
        PurchaseOrder.status.in_(["open", "partial"]),
    ).all()
    po_nos = [po.po_no for po in pos]
    confirmed_map: dict[str, int] = {}
    if po_nos:
        rows = db.query(Receipt.po_no, Receipt.qty).filter(
            Receipt.po_no.in_(po_nos),
            Receipt.status == "confirmed",
        ).all()
        for row in rows:
            confirmed_map[row.po_no] = confirmed_map.get(row.po_no, 0) + row.qty
    result = {p: 0 for p in part_nos}
    for po in pos:
        confirmed = confirmed_map.get(po.po_no, 0)
        result[po.part_no] = result.get(po.part_no, 0) + max(0, po.qty - confirmed)
    return result


def _get_open_prod_qty(db: Session, part_nos: list[str]) -> dict[str, int]:
    """미완료 생산오더 수량 조회"""
    if not part_nos:
        return {}
    rows = db.query(ProductionOrder).filter(
        ProductionOrder.part_no.in_(part_nos),
        ProductionOrder.status.in_(["계획", "진행중"]),
    ).all()
    result = {p: 0 for p in part_nos}
    for po in rows:
        remaining = max(0, po.planned_qty - po.actual_qty)
        result[po.part_no] = result.get(po.part_no, 0) + remaining
    return result


def _explode_bom(
    part_no: str,
    qty: float,
    all_bom_map: dict,
    all_item_map: dict,
    purchase_demand: dict,
    prod_demand: dict,
    demand_source: dict,
    parent_label: str,
    visited: set,
    level: int = 0,
) -> None:
    """재귀 BOM 전개 — Make/Buy 분기"""
    if level > 8:
        return
    bom_lines = all_bom_map.get(part_no, [])
    if not bom_lines:
        # BOM 없는 품목은 구매로 처리
        purchase_demand[part_no] = purchase_demand.get(part_no, 0) + qty
        demand_source.setdefault(part_no, []).append({"parent": parent_label, "qty": qty})
        return

    for bom in bom_lines:
        comp = bom.component_part_no
        required = qty * float(bom.qty_per)
        item = all_item_map.get(comp)
        itype = item.item_type if item else "raw"

        demand_source.setdefault(comp, []).append({
            "parent": parent_label,
            "qty_per": float(bom.qty_per),
            "required": round(required, 4),
        })

        if itype in MAKE_TYPES:
            # 반제품/완제품 → 생산오더 + 재귀 전개
            prod_demand[comp] = prod_demand.get(comp, 0) + required
            if comp not in visited:
                visited.add(comp)
                _explode_bom(comp, required, all_bom_map, all_item_map,
                             purchase_demand, prod_demand, demand_source,
                             comp, visited, level + 1)
        else:
            purchase_demand[comp] = purchase_demand.get(comp, 0) + required


def _build_req_list(
    demand: dict[str, float],
    all_item_map: dict,
    stock_map: dict,
    supply_map: dict,
    demand_source: dict,
    req_type: str,
) -> list[dict]:
    rows = []
    for part_no, gross_req in demand.items():
        item = all_item_map.get(part_no)
        stock = stock_map.get(part_no, 0)
        on_supply = supply_map.get(part_no, 0)
        safety = int(item.safety_stock) if item else 0
        moq = max(1, int(item.moq) if item else 1)
        avg_cost = float(item.avg_cost or 0) if item else 0
        std_price = float(item.std_buy_price or 0) if item else 0
        use_price = avg_cost if avg_cost > 0 else std_price

        net_req = float(gross_req) - float(stock) - float(on_supply)
        net_with_safety = max(0.0, net_req + safety)
        if net_with_safety > 0:
            order_qty = int(((net_with_safety + moq - 1) // moq) * moq)
        else:
            order_qty = 0

        rows.append({
            "part_no": part_no,
            "item_name": item.name if item else part_no,
            "item_type": item.item_type if item else "raw",
            "item_unit": item.unit if item else "EA",
            "supplier": item.supplier if item else None,
            "gross_requirement": round(gross_req, 2),
            "current_stock": stock,
            "on_supply_qty": on_supply,
            "safety_stock": safety,
            "net_requirement": round(max(0, net_req), 2),
            "order_qty": order_qty,
            "moq": moq,
            "std_price": std_price,
            "avg_cost": avg_cost,
            "estimated_amount": round(order_qty * use_price, 0),
            "need_order": order_qty > 0,
            "req_type": req_type,
            "sources": demand_source.get(part_no, []),
        })
    rows.sort(key=lambda x: (-x["order_qty"], x["part_no"]))
    return rows


# ── MRP 실행 ──────────────────────────────────────────────────────
@router.get("/run")
def run_mrp(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mrp),
):
    try:
        month_start = date_type(year, month, 1)
        month_end = (
            date_type(year + 1, 1, 1) - timedelta(days=1)
            if month == 12
            else date_type(year, month + 1, 1) - timedelta(days=1)
        )

        # 1. 수요 수집
        demand: dict[str, float] = {}
        so_list = (
            db.query(SalesOrder)
            .options(joinedload(SalesOrder.shipments))
            .filter(
                SalesOrder.due_date >= month_start,
                SalesOrder.due_date <= month_end,
                SalesOrder.status.in_(["open", "partial"]),
            )
            .all()
        )
        for so in so_list:
            shipped = sum(s.qty for s in so.shipments if s.status == "confirmed")
            remaining = max(0, so.qty - shipped)
            if remaining > 0:
                demand[so.part_no] = demand.get(so.part_no, 0) + remaining

        plans = (
            db.query(MonthlyPlan)
            .options(joinedload(MonthlyPlan.actuals))
            .filter(MonthlyPlan.year == year, MonthlyPlan.month == month)
            .all()
        )
        for plan in plans:
            actual = sum(a.actual_qty for a in plan.actuals)
            remaining = max(0, plan.planned_qty - actual)
            if remaining > 0:
                demand[plan.part_no] = demand.get(plan.part_no, 0) + remaining

        if not demand:
            return {
                "year": year, "month": month,
                "product_demand": [],
                "purchase_requirements": [],
                "production_requirements": [],
                "summary": {
                    "need_purchase_count": 0, "estimated_purchase_amount": 0,
                    "need_production_count": 0,
                },
            }

        # 2. 전체 BOM / 품목 일괄 로드
        all_bom_rows = db.query(BomLine).all()
        all_bom_map: dict[str, list[BomLine]] = {}
        for b in all_bom_rows:
            all_bom_map.setdefault(b.product_part_no, []).append(b)

        all_items = db.query(Item).all()
        all_item_map = {i.part_no: i for i in all_items}

        # 3. 재귀 BOM 전개 (Make/Buy 분기)
        purchase_demand: dict[str, float] = {}
        prod_demand: dict[str, float] = {}
        demand_source: dict[str, list] = {}
        visited: set[str] = set()

        for product_part_no, need_qty in demand.items():
            visited.add(product_part_no)
            _explode_bom(
                product_part_no, float(need_qty),
                all_bom_map, all_item_map,
                purchase_demand, prod_demand, demand_source,
                product_part_no, visited,
            )

        # 4. 현재고 / 오픈 공급 일괄 조회
        all_buy_parts = list(purchase_demand.keys())
        all_prod_parts = list(prod_demand.keys())
        all_parts = list(set(all_buy_parts + all_prod_parts))

        stock_map = get_stock_bulk(db, all_parts)
        open_po_map = _get_open_po_qty(db, all_buy_parts)
        open_pord_map = _get_open_prod_qty(db, all_prod_parts)

        # 5. 순소요량 계산
        purchase_requirements = _build_req_list(
            purchase_demand, all_item_map, stock_map, open_po_map, demand_source, "buy"
        )
        production_requirements = _build_req_list(
            prod_demand, all_item_map, stock_map, open_pord_map, demand_source, "make"
        )

        buy_amt = sum(r["estimated_amount"] for r in purchase_requirements if r["need_order"])
        return {
            "year": year,
            "month": month,
            "product_demand": [{"part_no": k, "qty": v} for k, v in demand.items()],
            "purchase_requirements": purchase_requirements,
            "production_requirements": production_requirements,
            "summary": {
                "need_purchase_count": sum(1 for r in purchase_requirements if r["need_order"]),
                "estimated_purchase_amount": round(buy_amt, 0),
                "need_production_count": sum(1 for r in production_requirements if r["need_order"]),
            },
        }

    except Exception as e:
        raise HTTPException(500, detail=f"MRP 계산 오류: {str(e)} | {traceback.format_exc()[-600:]}")


# ── 자재 구매발주 생성 ─────────────────────────────────────────────
class MRPOrderReq(BaseModel):
    year: int
    month: int
    lines: list[dict]


@router.post("/generate-orders")
def generate_orders_from_mrp(
    body: MRPOrderReq,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mrp),
):
    default_due = (
        date_type(body.year + 1, 1, 15) if body.month == 12
        else date_type(body.year, body.month + 1, 15)
    )
    created = []
    for line in body.lines:
        part_no = line.get("part_no")
        qty = int(line.get("qty", 0))
        partner_id = line.get("partner_id")
        if not qty or not partner_id or not part_no:
            continue
        if not db.get(Item, part_no) or not db.get(Partner, partner_id):
            continue
        due_str = line.get("due_date")
        due_date = date_type.fromisoformat(str(due_str)) if due_str else default_due
        po_no = next_doc_no(db, "MPO", "purchase_order", "po_no")
        from app.models.purchase import PurchaseOrder
        po = PurchaseOrder(
            po_no=po_no, partner_id=partner_id, part_no=part_no, qty=qty,
            unit_price=float(line.get("unit_price") or 0),
            order_date=date_type.today(), due_date=due_date,
            po_type="material",
            note=f"MRP 자동생성 {body.year}-{body.month:02d}",
        )
        db.add(po)
        db.flush()
        created.append({"po_no": po_no, "part_no": part_no, "qty": qty})
    db.commit()
    return {"ok": True, "created": created, "count": len(created)}


# ── 생산오더 생성 ──────────────────────────────────────────────────
class MRPProdOrderReq(BaseModel):
    year: int
    month: int
    lines: list[dict]


@router.post("/generate-production-orders")
def generate_production_orders(
    body: MRPProdOrderReq,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mrp),
):
    plan_date = date_type(body.year, body.month, 1)
    created = []
    for line in body.lines:
        part_no = line.get("part_no")
        qty = int(line.get("qty", 0))
        if not qty or not part_no:
            continue
        if not db.get(Item, part_no):
            continue
        pord_no = next_doc_no(db, "PW", "production_order", "pord_no")
        pord = ProductionOrder(
            pord_no=pord_no,
            part_no=part_no,
            planned_qty=qty,
            plan_date=plan_date,
            status=POrdStatus.planned,
            note=f"MRP 자동생성 {body.year}-{body.month:02d}",
        )
        db.add(pord)
        db.flush()
        created.append({"pord_no": pord_no, "part_no": part_no, "qty": qty})
    db.commit()
    return {"ok": True, "created": created, "count": len(created)}
