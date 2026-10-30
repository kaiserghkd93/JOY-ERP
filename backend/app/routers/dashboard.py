from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, cast, Date
from datetime import date, timedelta
from app.database import get_db
from app.models.purchase import PurchaseOrder, PurchaseOrderGroup, Receipt, ReceiptStatus, POStatus
from app.models.sales import SalesOrder, Shipment, SOStatus, ShipmentStatus, SalesTarget
from app.models.ledger import StockLedger
from app.models.master import Item, Partner
from app.models.quality import Inspection, NonConformance, NcrStatus, ProcessOutgoingDefect, InspectType
from sqlalchemy import text as _text
from app.services.ledger_service import get_stock, get_avg_price, get_stock_bulk, get_avg_price_bulk

router = APIRouter(prefix="/dashboard", tags=["대시보드"])


@router.get("/kpi")
def kpi(year: int | None = None, month: int | None = None, db: Session = Depends(get_db)):
    """납기준수율·불량률·재고회전율·마진 4대 KPI"""
    y = year or date.today().year
    m = month or date.today().month

    # ── 납기준수율: 한 번에 JOIN으로 집계 ──
    closed_po = db.query(PurchaseOrder).filter(
        PurchaseOrder.status == POStatus.closed,
        extract("year", PurchaseOrder.due_date) == y,
        extract("month", PurchaseOrder.due_date) == m,
    ).all()

    if closed_po:
        po_nos = [po.po_no for po in closed_po]
        # 각 PO의 마지막 입고일을 한 번에 조회
        last_receipts = db.query(
            Receipt.po_no,
            func.max(Receipt.receipt_date).label("last_date"),
        ).filter(
            Receipt.po_no.in_(po_nos),
            Receipt.status == ReceiptStatus.confirmed,
        ).group_by(Receipt.po_no).all()
        last_map = {r.po_no: r.last_date for r in last_receipts}
        due_map  = {po.po_no: po.due_date for po in closed_po}
        on_time  = sum(1 for pno, ld in last_map.items() if ld and ld <= due_map.get(pno))
        delivery_rate = round(on_time / len(closed_po) * 100, 1)
    else:
        delivery_rate = 0.0

    # ── 불량률 ──
    insp = db.query(
        func.sum(Inspection.pass_qty + Inspection.fail_qty), func.sum(Inspection.fail_qty)
    ).filter(
        extract("year", Inspection.inspect_date) == y,
        extract("month", Inspection.inspect_date) == m,
    ).first()
    total_insp = int(insp[0] or 0)
    total_fail = int(insp[1] or 0)
    defect_rate = round(total_fail / total_insp * 100, 2) if total_insp > 0 else 0.0

    # ── 재고회전율: DB SUM 집계 ──
    shipped_val = db.query(func.coalesce(func.sum(
        StockLedger.qty * StockLedger.unit_price
    ), 0)).filter(
        StockLedger.ledger_type == "출고",
        extract("year", StockLedger.txn_date) == y,
        extract("month", StockLedger.txn_date) == m,
    ).scalar()
    shipped_val = abs(float(shipped_val))

    items = db.query(Item).filter(Item.active == True).all()
    part_nos = [i.part_no for i in items]
    stocks = get_stock_bulk(db, part_nos)
    avgs = get_avg_price_bulk(db, part_nos)
    stock_value = sum(stocks.get(p, 0) * avgs.get(p, 0.0) for p in part_nos)
    inventory_turnover = round(shipped_val / stock_value, 2) if stock_value > 0 else 0.0

    # ── 마진: DB SUM으로 매출 집계 ──
    rev_row = db.query(
        func.coalesce(func.sum(Shipment.qty * Shipment.unit_price), 0)
    ).filter(
        Shipment.status == ShipmentStatus.confirmed,
        extract("year", Shipment.ship_date) == y,
        extract("month", Shipment.ship_date) == m,
    ).scalar()
    total_revenue = float(rev_row)

    # 출하 품목별 이동평균단가 집계
    ship_parts = db.query(
        Shipment.part_no,
        func.sum(Shipment.qty).label("total_qty"),
    ).filter(
        Shipment.status == ShipmentStatus.confirmed,
        extract("year", Shipment.ship_date) == y,
        extract("month", Shipment.ship_date) == m,
    ).group_by(Shipment.part_no).all()
    ship_part_nos = [r.part_no for r in ship_parts]
    ship_avgs = get_avg_price_bulk(db, ship_part_nos)
    total_cost = sum(int(r.total_qty) * ship_avgs.get(r.part_no, 0.0) for r in ship_parts)

    gross_profit = round(total_revenue - total_cost, 0)
    margin_rate = round((total_revenue - total_cost) / total_revenue * 100, 1) if total_revenue > 0 else 0.0

    # ── 발주 카운트 ──
    today = date.today()
    po_today = db.query(func.count(PurchaseOrder.po_no)).filter(
        func.date(PurchaseOrder.created_at) == today
    ).scalar() or 0
    po_this_month = db.query(func.count(PurchaseOrder.po_no)).filter(
        extract("year", PurchaseOrder.created_at) == y,
        extract("month", PurchaseOrder.created_at) == m,
    ).scalar() or 0
    po_open = db.query(func.count(PurchaseOrder.po_no)).filter(
        PurchaseOrder.status.in_([POStatus.open, POStatus.partial])
    ).scalar() or 0

    return {
        "year": y, "month": m,
        "delivery_rate": delivery_rate,
        "defect_rate": defect_rate,
        "inventory_turnover": inventory_turnover,
        "gross_profit": gross_profit,
        "margin_rate": margin_rate,
        "stock_value": round(stock_value, 0),
        "total_revenue": round(total_revenue, 0),
        "po_today": po_today,
        "po_this_month": po_this_month,
        "po_open": po_open,
    }


@router.get("/customer-scorecard")
def customer_scorecard(
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
):
    """고객사별 납기준수율·출하건수·출고금액 스코어카드"""
    y = year or date.today().year
    m = month or date.today().month
    month_start = date(y, m, 1)
    month_end   = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)

    # 파트너 맵 한 번에 로드
    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}

    # 당월 출하 건수·금액 — 한 번에 집계
    ship_agg = db.query(
        SalesOrder.partner_id,
        func.count(func.distinct(Shipment.so_no)).label("closed_count"),
        func.sum(Shipment.qty * Shipment.unit_price).label("ship_amt"),
    ).join(Shipment, Shipment.so_no == SalesOrder.so_no).filter(
        Shipment.status == ShipmentStatus.confirmed,
        Shipment.ship_date >= month_start,
        Shipment.ship_date < month_end,
    ).group_by(SalesOrder.partner_id).all()

    # 당월 수주 건수
    order_agg = db.query(
        SalesOrder.partner_id,
        func.count(SalesOrder.so_no).label("cnt"),
    ).filter(
        SalesOrder.status != SOStatus.cancelled,
        SalesOrder.order_date >= month_start,
        SalesOrder.order_date < month_end,
    ).group_by(SalesOrder.partner_id).all()
    order_map = {r.partner_id: int(r.cnt) for r in order_agg}

    # 납기준수율: 당월 출하된 SO의 due_date 비교 — 한 번에 조회
    ship_due = db.query(
        SalesOrder.partner_id,
        Shipment.so_no,
        func.max(Shipment.ship_date).label("last_ship"),
        SalesOrder.due_date,
    ).join(Shipment, Shipment.so_no == SalesOrder.so_no).filter(
        Shipment.status == ShipmentStatus.confirmed,
        Shipment.ship_date >= month_start,
        Shipment.ship_date < month_end,
    ).group_by(SalesOrder.partner_id, Shipment.so_no, SalesOrder.due_date).all()

    on_time_map: dict[str, list] = {}
    for r in ship_due:
        # due_date 없으면 납기준수로 처리
        on_time = (r.due_date is None) or (r.last_ship <= r.due_date)
        on_time_map.setdefault(r.partner_id, []).append(on_time)

    result = []
    for r in ship_agg:
        flags = on_time_map.get(r.partner_id, [])
        on_time = sum(flags)
        closed  = int(r.closed_count)
        result.append({
            "partner_id": r.partner_id,
            "name": partner_map.get(r.partner_id, r.partner_id),
            "total_orders": order_map.get(r.partner_id, 0),
            "closed_orders": closed,
            "on_time": on_time,
            "delivery_rate": round(on_time / closed * 100, 1) if closed else None,
            "total_ship_amt": round(float(r.ship_amt), 0),
        })
    return sorted(result, key=lambda x: x["closed_orders"], reverse=True)


@router.get("/supplier-scorecard")
def supplier_scorecard(year: int = None, month: int = None, db: Session = Depends(get_db)):
    """외주처별 납기준수율·불량률·총매입 스코어카드"""
    from datetime import date as _date
    if year is None:
        year = _date.today().year
    if month is None:
        month = _date.today().month

    partners = db.query(Partner).filter(Partner.partner_type.in_(["외주처", "공용"])).all()
    if not partners:
        return []
    pids = [p.partner_id for p in partners]
    pname = {p.partner_id: p.name for p in partners}

    # 발주 건수 — 해당 월
    po_cnt = db.query(
        PurchaseOrder.partner_id,
        func.count(PurchaseOrder.po_no).label("cnt"),
    ).filter(
        PurchaseOrder.partner_id.in_(pids),
        PurchaseOrder.status != POStatus.cancelled,
        extract("year", PurchaseOrder.order_date) == year,
        extract("month", PurchaseOrder.order_date) == month,
    ).group_by(PurchaseOrder.partner_id).all()
    po_cnt_map = {r.partner_id: int(r.cnt) for r in po_cnt}

    # 완료 PO 납기준수율 — 해당 월 발주건만
    closed_po = db.query(PurchaseOrder).filter(
        PurchaseOrder.partner_id.in_(pids),
        PurchaseOrder.status == POStatus.closed,
        extract("year", PurchaseOrder.order_date) == year,
        extract("month", PurchaseOrder.order_date) == month,
    ).all()
    closed_po_nos = [po.po_no for po in closed_po]
    closed_po_map = {po.po_no: po for po in closed_po}

    last_receipts = {}
    if closed_po_nos:
        rows = db.query(
            Receipt.po_no,
            func.max(Receipt.receipt_date).label("last_date"),
        ).filter(
            Receipt.po_no.in_(closed_po_nos),
            Receipt.status == ReceiptStatus.confirmed,
        ).group_by(Receipt.po_no).all()
        last_receipts = {r.po_no: r.last_date for r in rows}

    on_time_by_partner: dict[str, list] = {}
    for po in closed_po:
        ld = last_receipts.get(po.po_no)
        flag = bool(ld and (po.due_date is None or ld <= po.due_date))
        on_time_by_partner.setdefault(po.partner_id, []).append(flag)

    # 불량률 — 해당 월 발주건만
    insp_filter = [PurchaseOrder.partner_id.in_(pids)]
    if closed_po_nos:
        insp_filter.append(PurchaseOrder.po_no.in_(closed_po_nos))
    else:
        # 해당 월 발주건 없으면 빈 결과
        insp_filter.append(extract("year", PurchaseOrder.order_date) == year)
        insp_filter.append(extract("month", PurchaseOrder.order_date) == month)

    insp_agg = db.query(
        PurchaseOrder.partner_id,
        func.sum(Inspection.pass_qty + Inspection.fail_qty).label("total"),
        func.sum(Inspection.fail_qty).label("fail"),
    ).join(Receipt, Receipt.gr_no == Inspection.gr_no)\
     .join(PurchaseOrder, PurchaseOrder.po_no == Receipt.po_no)\
     .filter(*insp_filter)\
     .group_by(PurchaseOrder.partner_id).all()
    insp_map = {r.partner_id: (int(r.total or 0), int(r.fail or 0)) for r in insp_agg}

    # 총 매입금액 — 해당 월 입고분
    buy_agg = db.query(
        PurchaseOrder.partner_id,
        func.sum(Receipt.qty * Receipt.unit_price).label("amt"),
    ).join(Receipt, Receipt.po_no == PurchaseOrder.po_no)\
     .filter(
        PurchaseOrder.partner_id.in_(pids),
        Receipt.status == ReceiptStatus.confirmed,
        extract("year", Receipt.receipt_date) == year,
        extract("month", Receipt.receipt_date) == month,
    ).group_by(PurchaseOrder.partner_id).all()
    buy_map = {r.partner_id: float(r.amt or 0) for r in buy_agg}

    result = []
    for pid in pids:
        flags = on_time_by_partner.get(pid, [])
        closed = len(flags)
        on_time = sum(flags)
        ti, tf = insp_map.get(pid, (0, 0))
        result.append({
            "partner_id": pid,
            "name": pname[pid],
            "total_pos": po_cnt_map.get(pid, 0),
            "delivery_rate": round(on_time / closed * 100, 1) if closed else None,
            "defect_rate": round(tf / ti * 100, 2) if ti > 0 else None,
            "total_buy_amt": round(buy_map.get(pid, 0.0), 0),
        })
    return sorted(result, key=lambda x: (x["defect_rate"] or 0), reverse=True)


@router.get("/monthly-closing")
def monthly_closing(year: int, month: int, db: Session = Depends(get_db)):
    """월마감: 고객사별 매출인식 + 외주처별 매입정산"""
    sales_rows = db.query(
        SalesOrder.partner_id,
        func.sum(Shipment.qty * Shipment.unit_price).label("revenue"),
        func.sum(Shipment.qty).label("qty"),
    ).join(Shipment, Shipment.so_no == SalesOrder.so_no)\
     .filter(
        Shipment.status == ShipmentStatus.confirmed,
        extract("year", Shipment.ship_date) == year,
        extract("month", Shipment.ship_date) == month,
    ).group_by(SalesOrder.partner_id).all()

    buy_rows = db.query(
        PurchaseOrder.partner_id,
        func.sum(Receipt.qty * Receipt.unit_price).label("buy_amt"),
        func.sum(Receipt.qty).label("qty"),
    ).join(Receipt, Receipt.po_no == PurchaseOrder.po_no)\
     .filter(
        Receipt.status == ReceiptStatus.confirmed,
        extract("year", Receipt.receipt_date) == year,
        extract("month", Receipt.receipt_date) == month,
    ).group_by(PurchaseOrder.partner_id).all()

    # 직접 외주입고 — DB SUM으로 집계
    direct_rows = db.query(
        Receipt.partner_id,
        func.sum(
            func.coalesce(Receipt.outsource_price, Receipt.unit_price) * Receipt.qty
        ).label("amt"),
        func.sum(Receipt.qty).label("qty"),
    ).filter(
        Receipt.status == ReceiptStatus.confirmed,
        Receipt.po_no == Receipt.gr_no,
        Receipt.partner_id.isnot(None),
        extract("year", Receipt.receipt_date) == year,
        extract("month", Receipt.receipt_date) == month,
    ).group_by(Receipt.partner_id).all()

    buy_map: dict[str, dict] = {}
    for r in buy_rows:
        buy_map[r.partner_id] = {"partner_id": r.partner_id, "buy_amt": float(r.buy_amt), "qty": int(r.qty)}
    for r in direct_rows:
        if r.partner_id in buy_map:
            buy_map[r.partner_id]["buy_amt"] += float(r.amt)
            buy_map[r.partner_id]["qty"]     += int(r.qty)
        else:
            buy_map[r.partner_id] = {"partner_id": r.partner_id, "buy_amt": float(r.amt), "qty": int(r.qty)}

    return {
        "year": year, "month": month,
        "sales": [{"partner_id": r.partner_id, "revenue": round(float(r.revenue), 0), "qty": int(r.qty)} for r in sales_rows],
        "purchases": [{"partner_id": v["partner_id"], "buy_amt": round(v["buy_amt"], 0), "qty": v["qty"]} for v in buy_map.values()],
    }


@router.get("/monthly-trend")
def monthly_trend(year: int, db: Session = Depends(get_db)):
    """연간 월별 매출/매입 트렌드 — 12개월을 2개 쿼리로 처리"""
    # 매출: 월별 집계 한 번에
    sales_rows = db.query(
        extract("month", Shipment.ship_date).label("m"),
        func.sum(Shipment.qty * Shipment.unit_price).label("amt"),
    ).filter(
        Shipment.status == ShipmentStatus.confirmed,
        extract("year", Shipment.ship_date) == year,
    ).group_by("m").all()
    sales_map = {int(r.m): float(r.amt) for r in sales_rows}

    # 매입(PO기반): 월별 집계 한 번에
    po_rows = db.query(
        extract("month", Receipt.receipt_date).label("m"),
        func.sum(Receipt.qty * Receipt.unit_price).label("amt"),
    ).join(PurchaseOrder, PurchaseOrder.po_no == Receipt.po_no)\
     .filter(
        Receipt.status == ReceiptStatus.confirmed,
        extract("year", Receipt.receipt_date) == year,
    ).group_by("m").all()
    po_map = {int(r.m): float(r.amt) for r in po_rows}

    # 직접 외주입고: 월별 집계 한 번에
    direct_rows = db.query(
        extract("month", Receipt.receipt_date).label("m"),
        func.sum(
            func.coalesce(Receipt.outsource_price, Receipt.unit_price) * Receipt.qty
        ).label("amt"),
    ).filter(
        Receipt.status == ReceiptStatus.confirmed,
        Receipt.po_no == Receipt.gr_no,
        Receipt.partner_id.isnot(None),
        extract("year", Receipt.receipt_date) == year,
    ).group_by("m").all()
    direct_map = {int(r.m): float(r.amt) for r in direct_rows}

    result = []
    for m in range(1, 13):
        s = sales_map.get(m, 0.0)
        p = po_map.get(m, 0.0) + direct_map.get(m, 0.0)
        result.append({
            "month": m,
            "sales": round(s, 0),
            "purchases": round(p, 0),
            "profit": round(s - p, 0),
        })
    return result


@router.get("/sales-by-partner")
def sales_by_partner(year: int, month: int, db: Session = Depends(get_db)):
    """고객사별 월별 출고금액"""
    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}
    rows = db.query(
        SalesOrder.partner_id,
        func.sum(Shipment.qty * Shipment.unit_price).label("amount"),
        func.sum(Shipment.qty).label("qty"),
    ).join(Shipment, Shipment.so_no == SalesOrder.so_no)\
     .filter(
        Shipment.status == ShipmentStatus.confirmed,
        extract("year", Shipment.ship_date) == year,
        extract("month", Shipment.ship_date) == month,
    ).group_by(SalesOrder.partner_id).all()

    return sorted([{
        "partner_id": r.partner_id,
        "partner_name": partner_map.get(r.partner_id, r.partner_id),
        "amount": round(float(r.amount), 0),
        "qty": int(r.qty),
    } for r in rows], key=lambda x: x["amount"], reverse=True)


@router.get("/purchase-by-partner")
def purchase_by_partner(year: int, month: int, db: Session = Depends(get_db)):
    """외주처별 월별 입고금액 (PO기반 + 직접 외주입고 합산)"""
    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}

    po_rows = db.query(
        PurchaseOrder.partner_id,
        func.sum(Receipt.qty * Receipt.unit_price).label("amount"),
        func.sum(Receipt.qty).label("qty"),
    ).join(Receipt, Receipt.po_no == PurchaseOrder.po_no)\
     .filter(
        Receipt.status == ReceiptStatus.confirmed,
        extract("year", Receipt.receipt_date) == year,
        extract("month", Receipt.receipt_date) == month,
    ).group_by(PurchaseOrder.partner_id).all()

    direct_rows = db.query(
        Receipt.partner_id,
        func.sum(
            func.coalesce(Receipt.outsource_price, Receipt.unit_price) * Receipt.qty
        ).label("amount"),
        func.sum(Receipt.qty).label("qty"),
    ).filter(
        Receipt.status == ReceiptStatus.confirmed,
        Receipt.po_no == Receipt.gr_no,
        Receipt.partner_id.isnot(None),
        extract("year", Receipt.receipt_date) == year,
        extract("month", Receipt.receipt_date) == month,
    ).group_by(Receipt.partner_id).all()

    amt_map: dict[str, dict] = {}
    for r in po_rows:
        amt_map[r.partner_id] = {"amount": float(r.amount), "qty": int(r.qty)}
    for r in direct_rows:
        if r.partner_id in amt_map:
            amt_map[r.partner_id]["amount"] += float(r.amount)
            amt_map[r.partner_id]["qty"]    += int(r.qty)
        else:
            amt_map[r.partner_id] = {"amount": float(r.amount), "qty": int(r.qty)}

    return sorted([{
        "partner_id": pid,
        "partner_name": partner_map.get(pid, pid),
        "amount": round(v["amount"], 0),
        "qty": v["qty"],
    } for pid, v in amt_map.items()], key=lambda x: x["amount"], reverse=True)


@router.get("/annual-report")
def annual_report(year: int, db: Session = Depends(get_db)):
    """연간 월별 보고서 — 모든 루프 쿼리를 그룹 집계로 대체"""
    # 월별 합계 — 4개 쿼리 (12개월 루프 × 4 → 4)
    sales_mo = {int(r.m): (float(r.amt), int(r.qty)) for r in db.query(
        extract("month", Shipment.ship_date).label("m"),
        func.sum(Shipment.qty * Shipment.unit_price).label("amt"),
        func.sum(Shipment.qty).label("qty"),
    ).filter(
        Shipment.status == ShipmentStatus.confirmed,
        extract("year", Shipment.ship_date) == year,
    ).group_by("m").all()}

    buy_mo = {int(r.m): (float(r.amt), int(r.qty)) for r in db.query(
        extract("month", Receipt.receipt_date).label("m"),
        func.sum(Receipt.qty * Receipt.unit_price).label("amt"),
        func.sum(Receipt.qty).label("qty"),
    ).filter(
        Receipt.status == ReceiptStatus.confirmed,
        extract("year", Receipt.receipt_date) == year,
    ).group_by("m").all()}

    monthly = []
    for m in range(1, 13):
        s, sq = sales_mo.get(m, (0.0, 0))
        p, pq = buy_mo.get(m, (0.0, 0))
        profit = s - p
        monthly.append({
            "month": m,
            "purchase_qty": pq,
            "purchase_amt": round(p, 0),
            "sales_qty": sq,
            "sales_amt": round(s, 0),
            "profit": round(profit, 0),
            "profit_rate": round(profit / s * 100, 1) if s > 0 else 0.0,
        })

    # 외주처별 연간 매입 — 2쿼리 (파트너 × 12개월 루프 → 2)
    suppliers = db.query(Partner).filter(Partner.partner_type.in_(["외주처", "공용"])).all()
    sids = [p.partner_id for p in suppliers]

    sup_po_rows = db.query(
        PurchaseOrder.partner_id,
        extract("month", Receipt.receipt_date).label("m"),
        func.sum(Receipt.qty * Receipt.unit_price).label("amt"),
    ).join(Receipt, Receipt.po_no == PurchaseOrder.po_no)\
     .filter(
        PurchaseOrder.partner_id.in_(sids),
        Receipt.status == ReceiptStatus.confirmed,
        extract("year", Receipt.receipt_date) == year,
    ).group_by(PurchaseOrder.partner_id, "m").all()

    sup_direct_rows = db.query(
        Receipt.partner_id,
        extract("month", Receipt.receipt_date).label("m"),
        func.sum(
            func.coalesce(Receipt.outsource_price, Receipt.unit_price) * Receipt.qty
        ).label("amt"),
    ).filter(
        Receipt.partner_id.in_(sids),
        Receipt.status == ReceiptStatus.confirmed,
        Receipt.po_no == Receipt.gr_no,
        extract("year", Receipt.receipt_date) == year,
    ).group_by(Receipt.partner_id, "m").all()

    # (partner_id, month) → amt 누적
    sup_grid: dict[str, dict[int, float]] = {sid: {} for sid in sids}
    for r in sup_po_rows:
        sup_grid[r.partner_id][int(r.m)] = sup_grid[r.partner_id].get(int(r.m), 0.0) + float(r.amt)
    for r in sup_direct_rows:
        if r.partner_id in sup_grid:
            sup_grid[r.partner_id][int(r.m)] = sup_grid[r.partner_id].get(int(r.m), 0.0) + float(r.amt)

    supplier_detail = []
    for p in suppliers:
        monthly_vals = [round(sup_grid[p.partner_id].get(m, 0.0), 0) for m in range(1, 13)]
        supplier_detail.append({
            "partner_id": p.partner_id,
            "name": p.name,
            "monthly": monthly_vals,
            "total": round(sum(monthly_vals), 0),
        })
    supplier_detail.sort(key=lambda x: x["total"], reverse=True)

    # 고객사별 연간 매출 — 1쿼리 (고객 × 12개월 루프 → 1)
    customers = db.query(Partner).filter(Partner.partner_type.in_(["고객", "공용"])).all()
    cids = [c.partner_id for c in customers]

    cust_rows = db.query(
        SalesOrder.partner_id,
        extract("month", Shipment.ship_date).label("m"),
        func.sum(Shipment.qty * Shipment.unit_price).label("amt"),
    ).join(Shipment, Shipment.so_no == SalesOrder.so_no)\
     .filter(
        SalesOrder.partner_id.in_(cids),
        Shipment.status == ShipmentStatus.confirmed,
        extract("year", Shipment.ship_date) == year,
    ).group_by(SalesOrder.partner_id, "m").all()

    cust_grid: dict[str, dict[int, float]] = {cid: {} for cid in cids}
    for r in cust_rows:
        cust_grid[r.partner_id][int(r.m)] = float(r.amt)

    customer_detail = []
    for c in customers:
        monthly_vals = [round(cust_grid[c.partner_id].get(m, 0.0), 0) for m in range(1, 13)]
        customer_detail.append({
            "partner_id": c.partner_id,
            "name": c.name,
            "monthly": monthly_vals,
            "total": round(sum(monthly_vals), 0),
        })
    customer_detail.sort(key=lambda x: x["total"], reverse=True)

    return {
        "year": year,
        "monthly": monthly,
        "suppliers": supplier_detail,
        "customers": customer_detail,
    }


@router.get("/supplier-customer-flow")
def supplier_customer_flow(year: int, month: int, db: Session = Depends(get_db)):
    """외주처→고객사 흐름"""
    # 마스터 한 번에 로드
    item_map    = {i.part_no: i.name for i in db.query(Item).all()}
    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}

    receipts = db.query(
        PurchaseOrder.partner_id.label("supplier_id"),
        Receipt.part_no,
        func.sum(Receipt.qty).label("in_qty"),
    ).join(PurchaseOrder, PurchaseOrder.po_no == Receipt.po_no)\
     .filter(
        Receipt.status == ReceiptStatus.confirmed,
        extract("year", Receipt.receipt_date) == year,
        extract("month", Receipt.receipt_date) == month,
    ).group_by(PurchaseOrder.partner_id, Receipt.part_no).all()

    shipments = db.query(
        SalesOrder.partner_id.label("customer_id"),
        Shipment.part_no,
        func.sum(Shipment.qty).label("out_qty"),
        func.sum(Shipment.qty * Shipment.unit_price).label("out_amt"),
    ).join(SalesOrder, SalesOrder.so_no == Shipment.so_no)\
     .filter(
        Shipment.status == ShipmentStatus.confirmed,
        extract("year", Shipment.ship_date) == year,
        extract("month", Shipment.ship_date) == month,
    ).group_by(SalesOrder.partner_id, Shipment.part_no).all()

    sup_map: dict[str, list] = {}
    for r in receipts:
        sup_map.setdefault(r.part_no, []).append((r.supplier_id, int(r.in_qty)))
    cust_map: dict[str, list] = {}
    for s in shipments:
        cust_map.setdefault(s.part_no, []).append((s.customer_id, int(s.out_qty), round(float(s.out_amt), 0)))

    all_parts = set(list(sup_map.keys()) + list(cust_map.keys()))
    return [{
        "part_no": pno,
        "part_name": item_map.get(pno, pno),
        "suppliers": [
            {"partner_id": sid, "name": partner_map.get(sid, sid), "qty": qty}
            for sid, qty in sup_map.get(pno, [])
        ],
        "customers": [
            {"partner_id": cid, "name": partner_map.get(cid, cid), "qty": qty, "amount": amt}
            for cid, qty, amt in cust_map.get(pno, [])
        ],
    } for pno in sorted(all_parts)]


@router.get("/stock-summary")
def stock_summary(db: Session = Depends(get_db)):
    """품목별 현재고·재고금액·이동평균단가"""
    items = db.query(Item).filter(Item.active == True).all()
    part_nos = [i.part_no for i in items]
    stocks = get_stock_bulk(db, part_nos)
    avgs = get_avg_price_bulk(db, part_nos)
    rows = []
    for item in items:
        stock = stocks.get(item.part_no, 0)
        avg   = avgs.get(item.part_no, 0.0)
        margin_per = round((float(item.std_sell_price) - avg) / float(item.std_sell_price) * 100, 1) if item.std_sell_price else 0
        rows.append({
            "part_no": item.part_no,
            "name": item.name,
            "item_type": item.item_type,
            "spec": item.spec,
            "supplier": item.supplier,
            "current_stock": stock,
            "safety_stock": item.safety_stock,
            "avg_price": avg,
            "stock_value": round(stock * avg, 0),
            "std_sell_price": float(item.std_sell_price),
            "margin_pct": margin_per,
        })
    return sorted(rows, key=lambda x: x["stock_value"], reverse=True)


@router.get("/production-status")
def production_status(year: int | None = None, month: int | None = None, db: Session = Depends(get_db)):
    """생산/제조 대시보드 — 진행중 작업지시 + 이달 월 생산계획 vs 실적"""
    from app.models.production import ProductionOrder, POrdStatus, MonthlyPlan, DailyActual
    y = year or date.today().year
    m = month or date.today().month
    first_day = date(y, m, 1)
    last_day  = date(y + 1, 1, 1) - timedelta(days=1) if m == 12 else date(y, m + 1, 1) - timedelta(days=1)

    # ── 품목 맵 ─────────────────────────────────────────────────
    item_map = {i.part_no: i.name for i in db.query(Item).all()}

    # ── 작업지시 현황 (상태별 카운트) ───────────────────────────
    from sqlalchemy import case
    status_counts = db.query(
        ProductionOrder.status,
        func.count(ProductionOrder.pord_no).label("cnt"),
    ).group_by(ProductionOrder.status).all()
    cnt_map = {r.status: int(r.cnt) for r in status_counts}

    # ── 진행중 작업지시 목록 ────────────────────────────────────
    in_progress = db.query(ProductionOrder).filter(
        ProductionOrder.status == POrdStatus.in_progress,
    ).order_by(ProductionOrder.plan_date.asc()).all()

    orders_out = []
    for o in in_progress:
        progress = round(o.actual_qty / o.planned_qty * 100, 1) if o.planned_qty > 0 else 0.0
        orders_out.append({
            "pord_no": o.pord_no,
            "part_no": o.part_no,
            "part_name": item_map.get(o.part_no, o.part_no),
            "mold_no": o.mold_no,
            "planned_qty": o.planned_qty,
            "actual_qty": o.actual_qty,
            "progress": progress,
            "plan_date": o.plan_date.isoformat() if o.plan_date else None,
            "status": o.status,
        })

    # ── 이달 월 생산계획 vs 실적 ────────────────────────────────
    plans = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == y,
        MonthlyPlan.month == m,
    ).all()

    plan_ids = [p.id for p in plans]
    actual_sums = {}
    if plan_ids:
        rows = db.query(
            DailyActual.plan_id,
            func.sum(DailyActual.actual_qty).label("total"),
        ).filter(
            DailyActual.plan_id.in_(plan_ids),
        ).group_by(DailyActual.plan_id).all()
        actual_sums = {r.plan_id: int(r.total or 0) for r in rows}

    monthly_plan_out = []
    for p in plans:
        actual = actual_sums.get(p.id, 0)
        rate = round(actual / p.planned_qty * 100, 1) if p.planned_qty > 0 else 0.0
        monthly_plan_out.append({
            "plan_id": p.id,
            "part_no": p.part_no,
            "part_name": item_map.get(p.part_no, p.part_no),
            "planned_qty": p.planned_qty,
            "actual_qty": actual,
            "achievement_rate": rate,
        })
    monthly_plan_out.sort(key=lambda x: x["achievement_rate"])

    # ── 이달 생산 실적 합계 (completed orders) ──────────────────
    completed_this_month = db.query(
        func.count(ProductionOrder.pord_no).label("cnt"),
        func.sum(ProductionOrder.actual_qty).label("total_actual"),
        func.sum(ProductionOrder.planned_qty).label("total_planned"),
    ).filter(
        ProductionOrder.status == POrdStatus.completed,
        ProductionOrder.complete_date >= first_day,
        ProductionOrder.complete_date <= last_day,
    ).first()

    return {
        "year": y,
        "month": m,
        "counts": {
            "planned": cnt_map.get(POrdStatus.planned, 0),
            "in_progress": cnt_map.get(POrdStatus.in_progress, 0),
            "completed": cnt_map.get(POrdStatus.completed, 0),
            "cancelled": cnt_map.get(POrdStatus.cancelled, 0),
        },
        "in_progress_orders": orders_out,
        "monthly_plan": monthly_plan_out,
        "monthly_completed": {
            "count": int(completed_this_month.cnt or 0),
            "total_actual": int(completed_this_month.total_actual or 0),
            "total_planned": int(completed_this_month.total_planned or 0),
        },
    }


@router.get("/alerts")
def alerts(db: Session = Depends(get_db)):
    """상단 알람바: 납기 초과·임박 발주, 신규 수주 요청"""
    today = date.today()
    soon = today + timedelta(days=7)
    result = []

    # 납기 초과 (open/partial PO where due_date < today)
    overdue_pos = db.query(PurchaseOrder).filter(
        PurchaseOrder.due_date < today,
        PurchaseOrder.status.in_([POStatus.open, POStatus.partial]),
    ).order_by(PurchaseOrder.due_date).limit(10).all()

    partner_ids = list({po.partner_id for po in overdue_pos})
    partner_map = {p.partner_id: p.name for p in db.query(Partner).filter(Partner.partner_id.in_(partner_ids)).all()} if partner_ids else {}

    for po in overdue_pos:
        days_overdue = (today - po.due_date).days
        result.append({
            "type": "overdue",
            "doc_no": po.po_no,
            "part_no": po.part_no,
            "partner": partner_map.get(po.partner_id, po.partner_id),
            "due_date": po.due_date.isoformat(),
            "days": days_overdue,
            "message": f"[발주 납기초과 {days_overdue}일] {po.part_no} ({partner_map.get(po.partner_id, '')})",
        })

    # 납기 임박 (due_date between today and today+7)
    due_soon_pos = db.query(PurchaseOrder).filter(
        PurchaseOrder.due_date >= today,
        PurchaseOrder.due_date <= soon,
        PurchaseOrder.status.in_([POStatus.open, POStatus.partial]),
    ).order_by(PurchaseOrder.due_date).limit(10).all()

    partner_ids2 = list({po.partner_id for po in due_soon_pos} - set(partner_ids))
    if partner_ids2:
        partner_map.update({p.partner_id: p.name for p in db.query(Partner).filter(Partner.partner_id.in_(partner_ids2)).all()})

    for po in due_soon_pos:
        days_left = (po.due_date - today).days
        flag = "warn" if days_left <= 3 else "info"
        result.append({
            "type": flag,
            "doc_no": po.po_no,
            "part_no": po.part_no,
            "partner": partner_map.get(po.partner_id, po.partner_id),
            "due_date": po.due_date.isoformat(),
            "days": days_left,
            "message": f"[납기 D-{days_left}] {po.part_no} ({partner_map.get(po.partner_id, '')})",
        })

    # 신규 수주 (최근 3일 이내 등록된 SalesOrder)
    new_so_cutoff = today - timedelta(days=3)
    new_sos = db.query(SalesOrder).filter(
        cast(SalesOrder.created_at, Date) >= new_so_cutoff,
        SalesOrder.status.in_([SOStatus.open, SOStatus.partial]),
    ).order_by(SalesOrder.created_at.desc()).limit(10).all()

    so_partner_ids = list({so.partner_id for so in new_sos})
    so_partner_map = {p.partner_id: p.name for p in db.query(Partner).filter(Partner.partner_id.in_(so_partner_ids)).all()} if so_partner_ids else {}

    for so in new_sos:
        result.append({
            "type": "new_request",
            "doc_no": so.so_no,
            "part_no": so.part_no,
            "partner": so_partner_map.get(so.partner_id, so.partner_id),
            "due_date": so.due_date.isoformat(),
            "days": (so.due_date - today).days,
            "message": f"[신규수주] {so_partner_map.get(so.partner_id, so.partner_id)} · {so.part_no} 수량 {so.qty:,}",
        })

    return result


@router.get("/sales-vs-target")
def sales_vs_target(year: int | None = None, month: int | None = None, db: Session = Depends(get_db)):
    """거래처별 목표 vs 실적 매출 비교"""
    y = year or date.today().year
    m = month or date.today().month

    # 실제 출하 매출 (Shipment 기준)
    rows = db.query(
        SalesOrder.partner_id,
        func.sum(Shipment.qty * Shipment.unit_price).label("actual"),
    ).join(Shipment, Shipment.so_no == SalesOrder.so_no).filter(
        Shipment.status == ShipmentStatus.confirmed,
        extract("year",  Shipment.ship_date) == y,
        extract("month", Shipment.ship_date) == m,
    ).group_by(SalesOrder.partner_id).all()

    actual_map = {r.partner_id: float(r.actual or 0) for r in rows}

    # 목표
    targets = {
        t.partner_id: float(t.target_amount)
        for t in db.query(SalesTarget).filter(
            SalesTarget.year == y, SalesTarget.month == m
        ).all()
    }

    # 거래처 목록 (목표 or 실적이 있는 모든 파트너)
    all_ids = set(actual_map.keys()) | set(targets.keys())
    partner_map = {
        p.partner_id: p.name
        for p in db.query(Partner).filter(Partner.partner_id.in_(all_ids)).all()
    }

    details = []
    for pid in sorted(all_ids):
        actual = actual_map.get(pid, 0.0)
        target = targets.get(pid, 0.0)
        rate = round(actual / target * 100, 1) if target > 0 else None
        details.append({
            "partner_id": pid,
            "partner_name": partner_map.get(pid, pid),
            "target": target,
            "actual": actual,
            "rate": rate,
        })

    total_target = sum(d["target"] for d in details)
    total_actual = sum(d["actual"] for d in details)
    total_rate = round(total_actual / total_target * 100, 1) if total_target > 0 else None

    return {
        "year": y,
        "month": m,
        "total_target": total_target,
        "total_actual": total_actual,
        "total_rate": total_rate,
        "details": sorted(details, key=lambda x: x["actual"], reverse=True),
    }


@router.get("/quality-summary")
def quality_summary(year: int | None = None, month: int | None = None, db: Session = Depends(get_db)):
    """품질 대시보드 — 불량율·NCR현황·검사통계·공정불량 로스율"""
    from app.models.quality import InspectionResult
    y = year or date.today().year
    m = month or date.today().month
    first_day = date(y, m, 1)
    if m == 12:
        last_day = date(y + 1, 1, 1) - timedelta(days=1)
    else:
        last_day = date(y, m + 1, 1) - timedelta(days=1)

    # ── 검사 통계 (이번 달) ─────────────────────────────────────────
    inspections = db.query(Inspection).filter(
        Inspection.inspect_date >= first_day,
        Inspection.inspect_date <= last_day,
    ).all()
    total_insp = len(inspections)
    pass_count = sum(1 for i in inspections if i.result == InspectionResult.pass_)
    fail_count = sum(1 for i in inspections if i.result == InspectionResult.fail)
    total_fail_qty = sum(i.fail_qty for i in inspections)
    total_insp_qty = sum(i.inspect_qty for i in inspections)
    defect_rate = round(total_fail_qty / total_insp_qty * 100, 2) if total_insp_qty > 0 else 0.0
    pass_rate = round(pass_count / total_insp * 100, 1) if total_insp > 0 else None

    # ── NCR 현황 (누계) ────────────────────────────────────────────
    ncr_counts = {}
    for status in [NcrStatus.open, NcrStatus.processing, NcrStatus.closed]:
        ncr_counts[status.value] = db.query(NonConformance).filter(
            NonConformance.status == status
        ).count()
    ncr_this_month = db.query(NonConformance).filter(
        NonConformance.created_at >= first_day,
        NonConformance.created_at <= last_day,
    ).count()

    # ── 공정불량 로스율 (이번 달, MesDefectDetail) ────────────────
    try:
        loss_row = db.execute(_text("""
            SELECT
                SUM(defect_cost)      AS total_defect_cost,
                SUM(production_cost)  AS total_production_cost
            FROM mes_defect_detail
            WHERE prod_date BETWEEN :s AND :e AND defect_qty > 0
        """), {"s": str(first_day), "e": str(last_day)}).fetchone()
        defect_cost = float(loss_row[0] or 0)
        prod_cost = float(loss_row[1] or 0)
        loss_rate = round(defect_cost / prod_cost * 100, 2) if prod_cost > 0 else None
    except Exception:
        defect_cost, prod_cost, loss_rate = 0.0, 0.0, None

    # ── 공정/출하 불량 현황 (이번 달, ProcessOutgoingDefect) ────────
    pod_rows = db.query(ProcessOutgoingDefect).filter(
        ProcessOutgoingDefect.defect_date >= first_day,
        ProcessOutgoingDefect.defect_date <= last_day,
    ).all()
    pod_total = len(pod_rows)
    pod_process_cnt = sum(1 for r in pod_rows if r.inspect_type == InspectType.process)
    pod_outgoing_cnt = sum(1 for r in pod_rows if r.inspect_type == InspectType.outgoing)
    pod_defect_qty = sum(r.defect_qty for r in pod_rows)
    pod_inspect_qty = sum(r.inspect_qty for r in pod_rows)
    pod_defect_rate = round(pod_defect_qty / pod_inspect_qty * 100, 2) if pod_inspect_qty > 0 else None

    # ── 불량유형별 상위 5 (이번 달) ─────────────────────────────────
    try:
        top_defects = db.execute(_text("""
            SELECT defect_type, SUM(defect_qty) AS qty, SUM(defect_cost) AS cost
            FROM mes_defect_detail
            WHERE prod_date BETWEEN :s AND :e AND defect_qty > 0
            GROUP BY defect_type
            ORDER BY SUM(defect_cost) DESC
            LIMIT 5
        """), {"s": str(first_day), "e": str(last_day)}).fetchall()
        top_defect_list = [{"defect_type": r[0], "qty": int(r[1] or 0), "cost": float(r[2] or 0)} for r in top_defects]
    except Exception:
        top_defect_list = []

    return {
        "year": y,
        "month": m,
        "inspection": {
            "total": total_insp,
            "pass": pass_count,
            "fail": fail_count,
            "pass_rate": pass_rate,
            "defect_rate": defect_rate,
            "total_fail_qty": total_fail_qty,
        },
        "ncr": {
            "open": ncr_counts.get("접수", 0),
            "in_progress": ncr_counts.get("처리중", 0),
            "closed": ncr_counts.get("완료", 0),
            "this_month_new": ncr_this_month,
        },
        "loss": {
            "total_defect_cost": round(defect_cost, 0),
            "total_production_cost": round(prod_cost, 0),
            "loss_rate": loss_rate,
            "top_defects": top_defect_list,
        },
        "process_outgoing": {
            "total_count": pod_total,
            "process_count": pod_process_cnt,
            "outgoing_count": pod_outgoing_cnt,
            "total_defect_qty": pod_defect_qty,
            "total_inspect_qty": pod_inspect_qty,
            "defect_rate": pod_defect_rate,
        },
    }
