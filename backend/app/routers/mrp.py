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
from app.models.purchase import PurchaseOrder, Receipt, PurchaseRequest, PRStatus
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
        item = all_item_map.get(part_no)
        itype = item.item_type if item else "raw"
        # 완제품/반제품은 BOM 없어도 구매로 처리하지 않음 (prod_demand는 호출부에서 처리)
        if itype not in MAKE_TYPES:
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
    need_date: date_type,
) -> list[dict]:
    today = date_type.today()
    rows = []
    for part_no, gross_req in demand.items():
        item = all_item_map.get(part_no)
        stock = stock_map.get(part_no, 0)
        on_supply = supply_map.get(part_no, 0)
        safety = int(item.safety_stock) if item else 0
        moq = max(1, int(item.moq) if item else 1)
        lead_time = int(item.lead_time_days) if item and item.lead_time_days else 7
        avg_cost = float(item.avg_cost or 0) if item else 0
        std_price = float(item.std_buy_price or 0) if item else 0
        use_price = avg_cost if avg_cost > 0 else std_price

        net_req = float(gross_req) - float(stock) - float(on_supply)
        net_with_safety = max(0.0, net_req + safety)
        if net_with_safety > 0:
            order_qty = int(((net_with_safety + moq - 1) // moq) * moq)
        else:
            order_qty = 0

        order_by_date = need_date - timedelta(days=lead_time)
        days_to_order = (order_by_date - today).days

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
            "lead_time_days": lead_time,
            "need_date": str(need_date),
            "order_by_date": str(order_by_date),
            "days_to_order": days_to_order,
            "is_overdue": days_to_order < 0,
            "is_urgent": 0 <= days_to_order <= 3,
            "std_price": std_price,
            "avg_cost": avg_cost,
            "estimated_amount": round(order_qty * use_price, 0),
            "need_order": order_qty > 0,
            "req_type": req_type,
            "sources": demand_source.get(part_no, []),
        })
    rows.sort(key=lambda x: (x["days_to_order"], -x["order_qty"], x["part_no"]))
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

        # 오픈 생산오더 (계획·진행중) — 해당 월 납기 기준
        open_pords = (
            db.query(ProductionOrder)
            .filter(
                ProductionOrder.plan_date >= month_start,
                ProductionOrder.plan_date <= month_end,
                ProductionOrder.status.in_(["계획", "진행중"]),
            )
            .all()
        )
        for pord in open_pords:
            remaining = max(0, pord.planned_qty - pord.actual_qty)
            if remaining > 0:
                demand[pord.part_no] = demand.get(pord.part_no, 0) + remaining

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

        for product_part_no, need_qty in demand.items():
            item = all_item_map.get(product_part_no)
            itype = item.item_type if item else "raw"
            # 완제품/반제품 수요는 생산오더 대상으로 직접 추가
            if itype in MAKE_TYPES:
                prod_demand[product_part_no] = prod_demand.get(product_part_no, 0) + float(need_qty)
            # visited를 제품별로 새로 생성 — 공유 시 반제품 하위 BOM이 첫 제품만 전개되는 버그 방지
            _explode_bom(
                product_part_no, float(need_qty),
                all_bom_map, all_item_map,
                purchase_demand, prod_demand, demand_source,
                product_part_no, {product_part_no},
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
            purchase_demand, all_item_map, stock_map, open_po_map, demand_source, "buy", month_end
        )
        production_requirements = _build_req_list(
            prod_demand, all_item_map, stock_map, open_pord_map, demand_source, "make", month_end
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


# ── MRP → 구매요청(PR) 생성 ───────────────────────────────────────
class MRPPrReq(BaseModel):
    year: int
    month: int
    lines: list[dict]


@router.post("/generate-purchase-requests")
def generate_purchase_requests(
    body: MRPPrReq,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mrp),
):
    from app.models.purchase import PurchaseRequest, PRStatus
    import calendar as _cal
    need_date = date_type(body.year, body.month,
                          _cal.monthrange(body.year, body.month)[1])
    source_ref = f"{body.year}-{body.month:02d}"
    created = []
    for line in body.lines:
        part_no = line.get("part_no")
        qty = int(line.get("qty", 0))
        if not qty or not part_no:
            continue
        if not db.get(Item, part_no):
            continue
        item = db.get(Item, part_no)
        lead_time = int(item.lead_time_days) if item and item.lead_time_days else 7
        order_by = need_date - timedelta(days=lead_time)
        pr_no = next_doc_no(db, "PR", "purchase_request", "pr_no")
        pr = PurchaseRequest(
            pr_no=pr_no,
            part_no=part_no,
            partner_id=line.get("partner_id") or None,
            qty=qty,
            unit_price=float(line.get("unit_price") or 0) or None,
            need_date=need_date,
            order_by_date=order_by,
            status=PRStatus.pending,
            source="MRP",
            source_ref=source_ref,
            note=f"MRP 자동생성 {source_ref}",
            requested_by=user.name,
        )
        db.add(pr)
        db.flush()
        created.append({"pr_no": pr_no, "part_no": part_no, "qty": qty,
                        "order_by_date": str(order_by)})
    db.commit()
    return {"ok": True, "created": created, "count": len(created)}


# ── 예외사항 모니터링 ─────────────────────────────────────────────
@router.get("/exceptions")
def mrp_exceptions(db: Session = Depends(get_db), user: User = Depends(_require_mrp)):
    today = date_type.today()

    # 1. 납기 지연 PO (오픈 상태인데 due_date 경과)
    late_pos = db.query(PurchaseOrder).filter(
        PurchaseOrder.status.in_(["open", "partial"]),
        PurchaseOrder.due_date < today,
    ).order_by(PurchaseOrder.due_date.asc()).all()
    late_po_list = []
    for po in late_pos:
        item = db.get(Item, po.part_no)
        from app.models.master import Partner as _P
        partner = db.get(_P, po.partner_id)
        delay_days = (today - po.due_date).days
        late_po_list.append({
            "po_no": po.po_no,
            "part_no": po.part_no,
            "item_name": item.name if item else po.part_no,
            "partner_name": partner.name if partner else po.partner_id,
            "qty": po.qty,
            "due_date": str(po.due_date),
            "delay_days": delay_days,
            "status": po.status.value if hasattr(po.status, 'value') else po.status,
        })

    # 2. 안전재고 미달 품목
    from app.services.ledger_service import get_stock_bulk
    all_items = db.query(Item).filter(Item.active == True, Item.safety_stock > 0).all()
    part_nos = [i.part_no for i in all_items]
    stock_map = get_stock_bulk(db, part_nos)
    safety_alerts = []
    for item in all_items:
        stock = stock_map.get(item.part_no, 0)
        if stock < item.safety_stock:
            safety_alerts.append({
                "part_no": item.part_no,
                "item_name": item.name,
                "item_type": item.item_type,
                "current_stock": stock,
                "safety_stock": int(item.safety_stock),
                "shortage": int(item.safety_stock) - stock,
                "lead_time_days": int(item.lead_time_days) if item.lead_time_days else 7,
                "supplier": item.supplier,
            })
    safety_alerts.sort(key=lambda x: -x["shortage"])

    # 3. 미처리 구매요청 (승인대기 + 발주해야 할 날짜 임박/초과)
    urgent_prs = db.query(PurchaseRequest).filter(
        PurchaseRequest.status.in_([PRStatus.pending, PRStatus.approved]),
    ).order_by(PurchaseRequest.order_by_date.asc()).all()
    urgent_pr_list = []
    for pr in urgent_prs:
        item = db.get(Item, pr.part_no)
        days = (pr.order_by_date - today).days if pr.order_by_date else None
        if days is None or days > 7:
            continue  # 7일 이상 여유있으면 제외
        urgent_pr_list.append({
            "pr_no": pr.pr_no,
            "part_no": pr.part_no,
            "item_name": item.name if item else pr.part_no,
            "qty": pr.qty,
            "need_date": str(pr.need_date),
            "order_by_date": str(pr.order_by_date) if pr.order_by_date else None,
            "days_to_order": days,
            "status": pr.status.value,
            "source": pr.source,
        })

    # 4. 미완료 생산오더 중 납기 지연
    late_pords = db.query(ProductionOrder).filter(
        ProductionOrder.status.in_(["계획", "진행중"]),
        ProductionOrder.plan_date < today,
    ).order_by(ProductionOrder.plan_date.asc()).all()
    late_pord_list = []
    for pord in late_pords:
        item = db.get(Item, pord.part_no)
        delay = (today - pord.plan_date).days
        late_pord_list.append({
            "pord_no": pord.pord_no,
            "part_no": pord.part_no,
            "item_name": item.name if item else pord.part_no,
            "planned_qty": pord.planned_qty,
            "actual_qty": pord.actual_qty,
            "remaining": max(0, pord.planned_qty - pord.actual_qty),
            "plan_date": str(pord.plan_date),
            "delay_days": delay,
            "status": pord.status.value if hasattr(pord.status, 'value') else pord.status,
        })

    return {
        "as_of": str(today),
        "late_po": late_po_list,
        "late_po_count": len(late_po_list),
        "safety_stock_alerts": safety_alerts,
        "safety_stock_alert_count": len(safety_alerts),
        "urgent_pr": urgent_pr_list,
        "urgent_pr_count": len(urgent_pr_list),
        "late_production_order": late_pord_list,
        "late_pord_count": len(late_pord_list),
    }


# ── 주간 용량계획 ─────────────────────────────────────────────────────
import calendar as _cal

def _week_range(year: int, month: int, week_no: int):
    """주차 → (시작일, 종료일) — Week5는 29일~말일"""
    last_day = _cal.monthrange(year, month)[1]
    starts = {1: 1, 2: 8, 3: 15, 4: 22, 5: 29}
    ends   = {1: 7, 2: 14, 3: 21, 4: 28, 5: last_day}
    s = starts.get(week_no, 1)
    e = ends.get(week_no, last_day)
    return date_type(year, month, s), date_type(year, month, min(e, last_day))


def _week_no_of(d: date_type) -> int:
    day = d.day
    if day <= 7:  return 1
    if day <= 14: return 2
    if day <= 21: return 3
    if day <= 28: return 4
    return 5


@router.get("/weekly")
def get_weekly_capacity(
    year: int,
    month: int,
    machines: float = 1.0,
    workers: float = 1.0,
    daily_hours: float = 8.0,
    work_days: int = 5,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mrp),
):
    """주차별 계획 + 실적 + 사출/조립 부하율 반환"""
    from app.models.production import WeeklyPlan

    # 주차별 WeeklyPlan 조회
    plans = db.query(WeeklyPlan).filter(
        WeeklyPlan.year == year, WeeklyPlan.month == month
    ).all()
    plan_map: dict[tuple, int] = {}  # (week_no, part_no) → qty
    for p in plans:
        plan_map[(p.week_no, p.part_no)] = p.planned_qty

    # 이달 DailyActual 조회 (MonthlyPlan 조인)
    actuals = (
        db.query(DailyActual, MonthlyPlan)
        .join(MonthlyPlan, DailyActual.plan_id == MonthlyPlan.id)
        .filter(MonthlyPlan.year == year, MonthlyPlan.month == month)
        .all()
    )
    actual_map: dict[tuple, int] = {}  # (week_no, part_no) → qty
    for da, mp in actuals:
        wk = _week_no_of(da.prod_date)
        key = (wk, mp.part_no)
        actual_map[key] = actual_map.get(key, 0) + da.actual_qty

    # 품목 CT 조회
    all_part_nos = list({k[1] for k in list(plan_map.keys()) + list(actual_map.keys())})
    items_map: dict[str, Item] = {}
    if all_part_nos:
        rows = db.query(Item).filter(Item.part_no.in_(all_part_nos)).all()
        items_map = {i.part_no: i for i in rows}

    # 주차별 집계
    weekly_data = []
    last_day = _cal.monthrange(year, month)[1]
    for wk in range(1, 6):
        s_day, e_day = _week_range(year, month, wk)
        if s_day.day > last_day:
            continue

        # 이 주에 계획·실적이 있는 품목 합산
        part_nos_in_week = {pn for (w, pn) in list(plan_map.keys()) + list(actual_map.keys()) if w == wk}
        rows_out = []
        inj_load = 0.0   # 사출 부하시간(h)
        asm_load = 0.0   # 조립 부하시간(h)
        for pn in sorted(part_nos_in_week):
            planned  = plan_map.get((wk, pn), 0)
            achieved = actual_map.get((wk, pn), 0)
            item = items_map.get(pn)
            mct = float(item.machine_ct_sec or 0) if item else 0.0
            act = float(item.manual_ct_sec  or 0) if item else 0.0
            qty = planned if planned > 0 else achieved
            inj_load += mct * qty / 3600.0
            asm_load += act * qty / 3600.0
            rows_out.append({
                "part_no": pn,
                "item_name": item.name if item else pn,
                "planned_qty": planned,
                "actual_qty": achieved,
                "machine_ct_sec": mct,
                "manual_ct_sec": act,
            })

        avail_h = daily_hours * work_days
        inj_rate = round(inj_load / (avail_h * machines) * 100, 1) if avail_h * machines > 0 else 0
        asm_rate = round(asm_load / (avail_h * workers)  * 100, 1) if avail_h * workers  > 0 else 0

        weekly_data.append({
            "week_no": wk,
            "date_range": f"{s_day.strftime('%m/%d')}~{e_day.strftime('%m/%d')}",
            "items": rows_out,
            "injection_load_h": round(inj_load, 2),
            "assembly_load_h":  round(asm_load, 2),
            "injection_rate":   inj_rate,
            "assembly_rate":    asm_rate,
        })

    return {
        "year": year, "month": month,
        "params": {"machines": machines, "workers": workers,
                   "daily_hours": daily_hours, "work_days": work_days},
        "weeks": weekly_data,
    }


class WeeklyPlanBody(BaseModel):
    year: int
    month: int
    week_no: int
    part_no: str
    planned_qty: int


@router.post("/weekly-plan")
def upsert_weekly_plan(
    body: WeeklyPlanBody,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mrp),
):
    from app.models.production import WeeklyPlan
    existing = db.query(WeeklyPlan).filter(
        WeeklyPlan.year == body.year,
        WeeklyPlan.month == body.month,
        WeeklyPlan.week_no == body.week_no,
        WeeklyPlan.part_no == body.part_no,
    ).first()
    if existing:
        existing.planned_qty = body.planned_qty
    else:
        db.add(WeeklyPlan(
            year=body.year, month=body.month, week_no=body.week_no,
            part_no=body.part_no, planned_qty=body.planned_qty,
        ))
    db.commit()
    return {"ok": True}
