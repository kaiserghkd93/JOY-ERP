from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import date
from app.database import get_db
from app.models.purchase import PurchaseOrder, Receipt, ReceiptStatus, POStatus
from app.models.sales import SalesOrder, Shipment, SOStatus, ShipmentStatus
from app.models.ledger import StockLedger
from app.models.master import Item, Partner
from app.models.quality import Inspection
from app.services.ledger_service import get_stock, get_avg_price

router = APIRouter(prefix="/dashboard", tags=["대시보드"])


@router.get("/kpi")
def kpi(year: int | None = None, month: int | None = None, db: Session = Depends(get_db)):
    """납기준수율·불량률·재고회전율·마진 4대 KPI"""
    y = year or date.today().year
    m = month or date.today().month

    # ── 납기준수율: 납기일 내 입고완료된 PO / 전체 마감 PO ──
    closed_po = db.query(PurchaseOrder).filter(
        PurchaseOrder.status == POStatus.closed,
        extract("year", PurchaseOrder.due_date) == y,
        extract("month", PurchaseOrder.due_date) == m,
    ).all()
    on_time = 0
    for po in closed_po:
        last_receipt = db.query(Receipt).filter(
            Receipt.po_no == po.po_no,
            Receipt.status == ReceiptStatus.confirmed,
        ).order_by(Receipt.receipt_date.desc()).first()
        if last_receipt and last_receipt.receipt_date <= po.due_date:
            on_time += 1
    delivery_rate = round(on_time / len(closed_po) * 100, 1) if closed_po else 0.0

    # ── 불량률: 당월 검사 기준 ──
    insp = db.query(
        func.sum(Inspection.inspect_qty), func.sum(Inspection.fail_qty)
    ).filter(
        extract("year", Inspection.inspect_date) == y,
        extract("month", Inspection.inspect_date) == m,
    ).first()
    total_insp = int(insp[0] or 0)
    total_fail = int(insp[1] or 0)
    defect_rate = round(total_fail / total_insp * 100, 2) if total_insp > 0 else 0.0

    # ── 재고회전율: 당월 출고액 / 평균 재고자산가 ──
    shipped_val = db.query(func.coalesce(func.sum(
        StockLedger.qty * StockLedger.unit_price
    ), 0)).filter(
        StockLedger.ledger_type == "출고",
        extract("year", StockLedger.txn_date) == y,
        extract("month", StockLedger.txn_date) == m,
    ).scalar()
    shipped_val = abs(float(shipped_val))

    items = db.query(Item).filter(Item.active == True).all()
    stock_value = sum(get_stock(db, i.part_no) * get_avg_price(db, i.part_no) for i in items)
    inventory_turnover = round(shipped_val / stock_value, 2) if stock_value > 0 else 0.0

    # ── 마진: 당월 출하 기준 (판매가 - 이동평균단가) × 수량 ──
    shipments = db.query(Shipment).filter(
        Shipment.status == ShipmentStatus.confirmed,
        extract("year", Shipment.ship_date) == y,
        extract("month", Shipment.ship_date) == m,
    ).all()
    total_revenue, total_cost = 0.0, 0.0
    for sh in shipments:
        total_revenue += sh.qty * float(sh.unit_price)
        avg = get_avg_price(db, sh.part_no)
        total_cost += sh.qty * avg
    gross_profit = round(total_revenue - total_cost, 0)
    margin_rate = round((total_revenue - total_cost) / total_revenue * 100, 1) if total_revenue > 0 else 0.0

    return {
        "year": y, "month": m,
        "delivery_rate": delivery_rate,
        "defect_rate": defect_rate,
        "inventory_turnover": inventory_turnover,
        "gross_profit": gross_profit,
        "margin_rate": margin_rate,
        "stock_value": round(stock_value, 0),
        "total_revenue": round(total_revenue, 0),
    }


@router.get("/supplier-scorecard")
def supplier_scorecard(db: Session = Depends(get_db)):
    """외주처별 납기준수율·불량률·마진·월마감 종합 스코어카드"""
    partners = db.query(Partner).filter(Partner.partner_type.in_(["외주처", "공용"])).all()
    result = []
    for p in partners:
        # 납기준수율
        pos = db.query(PurchaseOrder).filter(
            PurchaseOrder.partner_id == p.partner_id,
            PurchaseOrder.status == POStatus.closed,
        ).all()
        on_time = sum(
            1 for po in pos
            if (lambda r: r and r.receipt_date <= po.due_date)(
                db.query(Receipt).filter(Receipt.po_no == po.po_no, Receipt.status == ReceiptStatus.confirmed)
                .order_by(Receipt.receipt_date.desc()).first()
            )
        )
        delivery_rate = round(on_time / len(pos) * 100, 1) if pos else None

        # 불량률
        insp = db.query(func.sum(Inspection.inspect_qty), func.sum(Inspection.fail_qty))\
            .join(Receipt, Receipt.gr_no == Inspection.gr_no)\
            .join(PurchaseOrder, PurchaseOrder.po_no == Receipt.po_no)\
            .filter(PurchaseOrder.partner_id == p.partner_id).first()
        total_i, total_f = int(insp[0] or 0), int(insp[1] or 0)
        defect_rate = round(total_f / total_i * 100, 2) if total_i > 0 else None

        # 월 매입금액
        buy_amt = db.query(func.coalesce(func.sum(Receipt.qty * Receipt.unit_price), 0))\
            .join(PurchaseOrder, PurchaseOrder.po_no == Receipt.po_no)\
            .filter(PurchaseOrder.partner_id == p.partner_id, Receipt.status == ReceiptStatus.confirmed).scalar()

        result.append({
            "partner_id": p.partner_id,
            "name": p.name,
            "total_pos": len(pos),
            "delivery_rate": delivery_rate,
            "defect_rate": defect_rate,
            "total_buy_amt": round(float(buy_amt), 0),
        })
    return sorted(result, key=lambda x: (x["defect_rate"] or 0), reverse=True)


@router.get("/monthly-closing")
def monthly_closing(year: int, month: int, db: Session = Depends(get_db)):
    """월마감: 고객사별 매출인식 + 외주처별 매입정산"""
    # 매출인식: 당월 확정 출하 기준
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

    # 매입정산: 당월 확정 입고 기준
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

    return {
        "year": year, "month": month,
        "sales": [{"partner_id": r.partner_id, "revenue": round(float(r.revenue), 0), "qty": int(r.qty)} for r in sales_rows],
        "purchases": [{"partner_id": r.partner_id, "buy_amt": round(float(r.buy_amt), 0), "qty": int(r.qty)} for r in buy_rows],
    }


@router.get("/stock-summary")
def stock_summary(db: Session = Depends(get_db)):
    """품목별 현재고·재고금액·이동평균단가 전체 조회"""
    items = db.query(Item).filter(Item.active == True).all()
    rows = []
    for item in items:
        stock = get_stock(db, item.part_no)
        avg = get_avg_price(db, item.part_no)
        margin_per = round((float(item.std_sell_price) - avg) / float(item.std_sell_price) * 100, 1) if item.std_sell_price else 0
        rows.append({
            "part_no": item.part_no,
            "name": item.name,
            "item_type": item.item_type,
            "current_stock": stock,
            "avg_price": avg,
            "stock_value": round(stock * avg, 0),
            "std_sell_price": float(item.std_sell_price),
            "margin_pct": margin_per,
        })
    return sorted(rows, key=lambda x: x["stock_value"], reverse=True)
