"""MRP (자재소요량계획) — 수주/생산계획 기반 자동 발주제안"""
import traceback
from datetime import date as date_type, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from app.database import get_db
from app.models.auth import User
from app.models.sales import SalesOrder, SOStatus, Shipment
from app.models.production import MonthlyPlan, DailyActual
from app.models.master import BomLine, Item, Partner
from app.models.purchase import PurchaseOrder, POStatus, Receipt, ReceiptStatus
from app.routers.auth import get_current_user
from app.services.ledger_service import get_stock_bulk
from app.services.doc_no import next_doc_no

router = APIRouter(prefix="/mrp", tags=["MRP"])

MRP_ROLES = {"admin", "material", "manager", "executive", "manufacturing"}


def _require_mrp(user: User = Depends(get_current_user)) -> User:
    if user.role not in MRP_ROLES:
        raise HTTPException(403, "MRP 권한이 없습니다")
    return user


def _get_open_po_qty(db: Session, part_nos: list[str]) -> dict[str, int]:
    """품목 리스트에 대한 미입고 발주수량 일괄 조회"""
    if not part_nos:
        return {}
    pos = db.query(PurchaseOrder).filter(
        PurchaseOrder.part_no.in_(part_nos),
        PurchaseOrder.status.in_(["open", "partial"]),
    ).all()
    po_nos = [po.po_no for po in pos]

    # 확정 입고량
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


# ── MRP 실행 ──────────────────────────────────────────────────────
@router.get("/run")
def run_mrp(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mrp),
):
    try:
        from datetime import date as dt
        month_start = dt(year, month, 1)
        if month == 12:
            month_end = dt(year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = dt(year, month + 1, 1) - timedelta(days=1)

        # 1. 수요 수집: 수주 (due_date가 해당월) — joinedload로 lazy loading 방지
        demand: dict[str, int] = {}
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

        # 생산계획 (MonthlyPlan) — joinedload
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
                "requirements": [],
                "summary": {"total_parts": 0, "need_order_count": 0, "estimated_total_amount": 0},
            }

        # 2. BOM 전개 → 자재 소요량
        mat_demand: dict[str, float] = {}
        demand_source: dict[str, list] = {}

        all_product_parts = list(demand.keys())
        bom_rows = db.query(BomLine).filter(BomLine.product_part_no.in_(all_product_parts)).all()
        bom_map: dict[str, list[BomLine]] = {}
        for bom in bom_rows:
            bom_map.setdefault(bom.product_part_no, []).append(bom)

        for product_part_no, need_qty in demand.items():
            bom_lines = bom_map.get(product_part_no, [])
            for bom in bom_lines:
                comp = bom.component_part_no
                required = need_qty * float(bom.qty_per)
                mat_demand[comp] = mat_demand.get(comp, 0) + required
                demand_source.setdefault(comp, []).append({
                    "product": product_part_no,
                    "demand_qty": need_qty,
                    "qty_per": float(bom.qty_per),
                    "required": required,
                })
            if not bom_lines:
                # BOM 없는 품목 → 직접구매 품목으로 수요 반영
                mat_demand[product_part_no] = mat_demand.get(product_part_no, 0) + need_qty

        # 3. 현재고 + 오픈PO 일괄 조회
        all_parts = list(mat_demand.keys())
        stock_map = get_stock_bulk(db, all_parts)
        open_po_map = _get_open_po_qty(db, all_parts)

        # 품목 마스터 일괄 조회
        item_map = {i.part_no: i for i in db.query(Item).filter(Item.part_no.in_(all_parts)).all()}

        # 4. 순소요량 계산
        requirements = []
        for part_no, gross_req in mat_demand.items():
            item = item_map.get(part_no)
            stock = stock_map.get(part_no, 0)
            on_order = open_po_map.get(part_no, 0)
            safety = int(item.safety_stock) if item else 0
            moq = max(1, int(item.moq) if item else 1)
            avg_cost = float(item.avg_cost or 0) if item else 0
            std_price = float(item.std_buy_price or 0) if item else 0
            use_price = avg_cost if avg_cost > 0 else std_price

            net_req = float(gross_req) - float(stock) - float(on_order)
            net_with_safety = max(0.0, net_req + safety)
            order_qty = int(((net_with_safety + moq - 1) // moq) * moq) if net_with_safety > 0 else 0

            requirements.append({
                "part_no": part_no,
                "item_name": item.name if item else part_no,
                "item_unit": item.unit if item else "EA",
                "supplier": item.supplier if item else None,
                "gross_requirement": round(gross_req, 2),
                "current_stock": stock,
                "on_order_qty": on_order,
                "safety_stock": safety,
                "net_requirement": round(max(0, net_req), 2),
                "order_qty": order_qty,
                "moq": moq,
                "std_price": std_price,
                "avg_cost": avg_cost,
                "estimated_amount": round(order_qty * use_price, 0),
                "need_order": order_qty > 0,
                "sources": demand_source.get(part_no, []),
            })

        requirements.sort(key=lambda x: (-x["order_qty"], x["part_no"]))
        total_amount = sum(r["estimated_amount"] for r in requirements if r["need_order"])

        return {
            "year": year,
            "month": month,
            "product_demand": [{"part_no": k, "qty": v} for k, v in demand.items()],
            "requirements": requirements,
            "summary": {
                "total_parts": len(requirements),
                "need_order_count": sum(1 for r in requirements if r["need_order"]),
                "estimated_total_amount": round(total_amount, 0),
            },
        }

    except Exception as e:
        raise HTTPException(500, detail=f"MRP 계산 오류: {str(e)} | {traceback.format_exc()[-500:]}")


# ── MRP 결과로 자재발주 생성 ──────────────────────────────────────
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
    """MRP 발주제안 → 자재 PO 생성"""
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
        po = PurchaseOrder(
            po_no=po_no, partner_id=partner_id, part_no=part_no, qty=qty,
            unit_price=float(line.get("unit_price") or 0),
            order_date=date_type.today(), due_date=due_date,
            po_type="material",
            note=f"MRP 자동생성 {body.year}-{body.month:02d}",
        )
        db.add(po); db.flush()
        created.append({"po_no": po_no, "part_no": part_no, "qty": qty})
    db.commit()
    return {"ok": True, "created": created, "count": len(created)}
