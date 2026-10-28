"""MRP (자재소요량계획) — 수주/생산계획 기반 자동 발주제안"""
from datetime import date as date_type, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.auth import User
from app.models.sales import SalesOrder, SOStatus
from app.models.production import MonthlyPlan
from app.models.master import BomLine, Item, Partner
from app.models.purchase import PurchaseOrder, POStatus
from app.routers.auth import get_current_user
from app.services.ledger_service import get_stock_bulk
from app.services.doc_no import next_doc_no

router = APIRouter(prefix="/mrp", tags=["MRP"])

MRP_ROLES = {"admin", "material", "manager", "executive", "manufacturing"}


def _require_mrp(user: User = Depends(get_current_user)) -> User:
    if user.role not in MRP_ROLES:
        raise HTTPException(403, "MRP 권한이 없습니다")
    return user


def _get_open_po_qty(db: Session, part_no: str) -> int:
    """미입고 발주수량 (open/partial 발주의 잔여량)"""
    pos = db.query(PurchaseOrder).filter(
        PurchaseOrder.part_no == part_no,
        PurchaseOrder.status.in_([POStatus.open, POStatus.partial]),
    ).all()
    total = 0
    for po in pos:
        from app.models.purchase import ReceiptStatus
        confirmed = sum(r.qty for r in po.receipts if r.status == ReceiptStatus.confirmed)
        total += max(0, po.qty - confirmed)
    return total


# ── MRP 실행 ──────────────────────────────────────────────────────
@router.get("/run")
def run_mrp(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mrp),
):
    """
    MRP 계산:
    1. 수요 = 해당월 미완료 수주 + 생산계획 잔량
    2. BOM 전개 → 부품별 소요량
    3. 현재고 + 미입고PO 차감 → 순소요량
    4. 안전재고 미만 시 추가 제안
    """
    from datetime import date as dt
    month_start = dt(year, month, 1)
    if month == 12:
        month_end = dt(year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = dt(year, month + 1, 1) - timedelta(days=1)

    # 1. 수요 수집: 수주 (due_date가 해당월)
    demand: dict[str, int] = {}
    so_list = db.query(SalesOrder).filter(
        SalesOrder.due_date >= month_start,
        SalesOrder.due_date <= month_end,
        SalesOrder.status.in_([SOStatus.open, SOStatus.partial]),
    ).all()
    for so in so_list:
        shipped = sum(s.qty for s in so.shipments)
        remaining = max(0, so.qty - shipped)
        if remaining > 0:
            demand[so.part_no] = demand.get(so.part_no, 0) + remaining

    # 생산계획 (MonthlyPlan)
    plans = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == year,
        MonthlyPlan.month == month,
    ).all()
    for plan in plans:
        actual = sum(a.actual_qty for a in plan.actuals)
        remaining = max(0, plan.planned_qty - actual)
        if remaining > 0:
            demand[plan.part_no] = demand.get(plan.part_no, 0) + remaining

    if not demand:
        return {"year": year, "month": month, "requirements": [], "summary": "수요 없음"}

    # 2. BOM 전개 → 자재 소요량
    mat_demand: dict[str, float] = {}
    demand_source: dict[str, list] = {}  # 추적용

    for product_part_no, need_qty in demand.items():
        bom_lines = db.query(BomLine).filter(BomLine.product_part_no == product_part_no).all()
        for bom in bom_lines:
            comp = bom.component_part_no
            required = need_qty * float(bom.qty_per)
            mat_demand[comp] = mat_demand.get(comp, 0) + required
            if comp not in demand_source:
                demand_source[comp] = []
            demand_source[comp].append({
                "product": product_part_no,
                "demand_qty": need_qty,
                "qty_per": float(bom.qty_per),
                "required": required,
            })
        # BOM 없는 제품은 완제품 자체를 수요로 (직접구매 품목)
        if not bom_lines:
            mat_demand[product_part_no] = mat_demand.get(product_part_no, 0) + need_qty

    # 3. 현재고 + 오픈PO 조회
    all_parts = list(mat_demand.keys())
    stock_map = get_stock_bulk(db, all_parts)
    open_po_map = {p: _get_open_po_qty(db, p) for p in all_parts}

    # 4. 순소요량 계산
    requirements = []
    for part_no, gross_req in mat_demand.items():
        item = db.get(Item, part_no)
        stock = stock_map.get(part_no, 0)
        on_order = open_po_map.get(part_no, 0)
        safety = item.safety_stock if item else 0
        moq = max(1, item.moq if item else 1)
        avg_cost = float(item.avg_cost or item.std_buy_price or 0) if item else 0

        net_req = gross_req - stock - on_order
        # 안전재고 포함
        net_with_safety = max(0, net_req + safety)

        # MOQ 반올림
        if net_with_safety > 0:
            order_qty = int(((net_with_safety + moq - 1) // moq) * moq)
        else:
            order_qty = 0

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
            "order_qty": order_qty,          # 발주제안량 (MOQ 적용)
            "moq": moq,
            "std_price": float(item.std_buy_price or 0) if item else 0,
            "avg_cost": avg_cost,
            "estimated_amount": order_qty * avg_cost if avg_cost else order_qty * float(item.std_buy_price or 0) if item else 0,
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


# ── MRP 결과로 자재발주 생성 ──────────────────────────────────────
class MRPOrderReq(BaseModel):
    year: int
    month: int
    lines: list[dict]   # [{part_no, qty, partner_id, unit_price, due_date}]


@router.post("/generate-orders")
def generate_orders_from_mrp(
    body: MRPOrderReq,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mrp),
):
    """MRP 발주제안 → 자재 PO 생성"""
    if body.month == 12:
        default_due = date_type(body.year + 1, 1, 15)
    else:
        default_due = date_type(body.year, body.month + 1, 15)

    created = []
    for line in body.lines:
        part_no = line.get("part_no")
        qty = int(line.get("qty", 0))
        partner_id = line.get("partner_id")
        if not qty or not partner_id:
            continue
        if not db.get(Item, part_no):
            continue
        if not db.get(Partner, partner_id):
            continue
        unit_price = float(line.get("unit_price") or 0)
        due = line.get("due_date")
        due_date = date_type.fromisoformat(str(due)) if due else default_due

        po_no = next_doc_no(db, "MPO", "purchase_order", "po_no")
        po = PurchaseOrder(
            po_no=po_no,
            partner_id=partner_id,
            part_no=part_no,
            qty=qty,
            unit_price=unit_price,
            order_date=date_type.today(),
            due_date=due_date,
            po_type="material",
            note=f"MRP 자동생성 {body.year}-{body.month:02d}",
        )
        db.add(po)
        db.flush()
        created.append({"po_no": po_no, "part_no": part_no, "qty": qty})

    db.commit()
    return {"ok": True, "created": created, "count": len(created)}
