from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from io import BytesIO
from calendar import monthrange
from urllib.parse import quote
from app.database import get_db
from app.models.purchase import PurchaseOrder, Receipt, POStatus, ReceiptStatus, Carryover
from app.schemas.purchase import POCreate, POOut, POSummary, ReceiptCreate, ReceiptOut
from app.services.purchase_service import (
    create_po, create_receipt, get_remaining_qty, get_po_summary
)
from app.models.ledger import LedgerType
from app.services.ledger_service import post_ledger, get_avg_price
from app.models.master import Partner, Item

router = APIRouter(prefix="/purchase", tags=["구매·외주"])


@router.post("/orders", response_model=POOut)
def post_order(body: POCreate, db: Session = Depends(get_db)):
    return create_po(db, **body.model_dump())


@router.get("/orders", response_model=list[POOut])
def list_orders(
    partner_id: str | None = None,
    status: POStatus | None = None,
    due_from: date | None = None,
    due_to: date | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(PurchaseOrder)
    if partner_id:
        q = q.filter(PurchaseOrder.partner_id == partner_id)
    if status:
        q = q.filter(PurchaseOrder.status == status)
    if due_from:
        q = q.filter(PurchaseOrder.due_date >= due_from)
    if due_to:
        q = q.filter(PurchaseOrder.due_date <= due_to)
    return q.order_by(PurchaseOrder.due_date).all()


@router.get("/orders/{po_no}/summary", response_model=POSummary)
def po_summary(po_no: str, db: Session = Depends(get_db)):
    return get_po_summary(db, po_no)


@router.get("/orders/remaining", response_model=list[dict])
def all_remaining(partner_id: str | None = None, db: Session = Depends(get_db)):
    """외주처별 미입고잔량 전체 조회"""
    q = db.query(PurchaseOrder).filter(
        PurchaseOrder.status != POStatus.closed,
        PurchaseOrder.status != POStatus.cancelled,
    )
    if partner_id:
        q = q.filter(PurchaseOrder.partner_id == partner_id)
    pos = q.all()
    if not pos:
        return []

    # 입고량 한 번에 집계
    po_nos = [po.po_no for po in pos]
    received_rows = db.query(
        Receipt.po_no,
        func.coalesce(func.sum(Receipt.qty), 0).label("received"),
    ).filter(
        Receipt.po_no.in_(po_nos),
        Receipt.status != ReceiptStatus.cancelled,
    ).group_by(Receipt.po_no).all()
    received_map = {r.po_no: int(r.received) for r in received_rows}

    item_map = {i.part_no: i.name for i in db.query(Item).filter(
        Item.part_no.in_([po.part_no for po in pos])
    ).all()}

    return [{
        "po_no": po.po_no,
        "partner_id": po.partner_id,
        "part_no": po.part_no,
        "part_name": item_map.get(po.part_no, ""),
        "order_qty": po.qty,
        "remaining_qty": po.qty - received_map.get(po.po_no, 0),
        "due_date": po.due_date,
        "status": po.status,
    } for po in pos]


@router.get("/partners/delivery-rate", response_model=list[dict])
def partner_delivery_rate(db: Session = Depends(get_db)):
    """업체별 납기준수율: 완료된 발주 중 due_date 내 입고 완료 비율"""
    closed_pos = db.query(PurchaseOrder).filter(
        PurchaseOrder.status == POStatus.closed
    ).all()

    partner_stats: dict[str, dict] = {}
    for po in closed_pos:
        pid = po.partner_id
        if pid not in partner_stats:
            partner = db.get(Partner, pid)
            partner_stats[pid] = {
                "partner_id": pid,
                "partner_name": partner.name if partner else pid,
                "total": 0,
                "on_time": 0,
            }
        partner_stats[pid]["total"] += 1

        # 마지막 입고일이 due_date 이하면 납기 준수
        receipts = db.query(Receipt).filter(
            Receipt.po_no == po.po_no,
            Receipt.status == ReceiptStatus.confirmed,
        ).all()
        if receipts:
            last_receipt_date = max(r.receipt_date for r in receipts)
            if last_receipt_date <= po.due_date:
                partner_stats[pid]["on_time"] += 1

    result = []
    for stat in partner_stats.values():
        total = stat["total"]
        on_time = stat["on_time"]
        result.append({
            "partner_id": stat["partner_id"],
            "partner_name": stat["partner_name"],
            "total": total,
            "on_time": on_time,
            "late": total - on_time,
            "rate": round(on_time / total * 100, 1) if total else 0,
        })
    result.sort(key=lambda x: -x["rate"])
    return result


@router.post("/receipts", response_model=ReceiptOut)
def post_receipt(body: ReceiptCreate, db: Session = Depends(get_db)):
    return create_receipt(db, **body.model_dump())


@router.get("/receipts", response_model=list[ReceiptOut])
def list_receipts(
    partner_id: str | None = None,
    part_no: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Receipt)
    if partner_id:
        q = q.join(PurchaseOrder).filter(PurchaseOrder.partner_id == partner_id)
    if part_no:
        q = q.filter(Receipt.part_no == part_no)
    return q.order_by(Receipt.receipt_date.desc()).all()


@router.post("/receipts/direct")
def post_direct_receipt(body: dict, db: Session = Depends(get_db)):
    """발주 없이 자체생산품 창고 직접입고 — GR 자동 생성 후 즉시 확정"""
    from app.services.doc_no import next_doc_no
    from app.models.master import Item

    from datetime import date as date_type
    part_no      = body.get("part_no")
    qty          = int(body.get("qty", 0))
    unit_price   = float(body.get("unit_price", 0))
    receipt_date = date_type.fromisoformat(body.get("receipt_date"))
    note         = body.get("note") or "직접입고"
    partner_id      = body.get("partner_id") or None
    outsource_price = body.get("outsource_price")
    outsource_price = float(outsource_price) if outsource_price is not None else None

    if not db.get(Item, part_no):
        raise HTTPException(404, f"품목 없음: {part_no}")
    if qty <= 0:
        raise HTTPException(400, "수량은 1 이상이어야 합니다")

    gr_no = next_doc_no(db, "GR", "receipt", "gr_no")
    receipt = Receipt(
        gr_no=gr_no, po_no=gr_no, part_no=part_no,
        qty=qty, receipt_date=receipt_date, unit_price=unit_price,
        status=ReceiptStatus.confirmed, note=note, partner_id=partner_id,
        outsource_price=outsource_price,
    )
    db.add(receipt)
    db.flush()

    post_ledger(db, part_no, receipt_date, LedgerType.receipt, +qty, unit_price,
                ref_type="GR", ref_no=gr_no, note=note)
    db.commit()
    db.refresh(receipt)
    return receipt


@router.get("/closing/monthly")
def monthly_closing(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    """월별 마감 — 외주처별 발주량 vs 입고량 vs 초과량 vs 반품량 (품목별 상세 포함)"""
    from calendar import monthrange
    from app.models.quality import Inspection, DisposalType

    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])

    pos = db.query(PurchaseOrder).filter(
        PurchaseOrder.due_date >= first_day,
        PurchaseOrder.due_date <= last_day,
        PurchaseOrder.status != POStatus.cancelled,
    ).all()

    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}
    item_map    = {i.part_no: i.name for i in db.query(Item).all()}

    po_nos = [po.po_no for po in pos]

    # 입고량 — 한 번에
    receipt_rows = db.query(Receipt).filter(
        Receipt.po_no.in_(po_nos),
        Receipt.status == ReceiptStatus.confirmed,
    ).all()
    receipt_by_po: dict[str, list] = {}
    for r in receipt_rows:
        receipt_by_po.setdefault(r.po_no, []).append(r)

    gr_nos = [r.gr_no for r in receipt_rows]

    # 검사 — 한 번에
    insp_map: dict[str, object] = {}
    if gr_nos:
        for insp in db.query(Inspection).filter(Inspection.gr_no.in_(gr_nos)).all():
            insp_map[insp.gr_no] = insp

    result = {}
    for po in pos:
        pid = po.partner_id
        if pid not in result:
            result[pid] = {
                "partner_id": pid,
                "partner_name": partner_map.get(pid, pid),
                "order_qty": 0, "received_qty": 0, "over_qty": 0,
                "return_qty": 0, "scrap_qty": 0,
                "carryover_qty": 0, "carryover_amt": 0.0,
                "receipt_return_qty": 0, "receipt_return_amt": 0.0,
                "order_amt": 0.0, "received_amt": 0.0, "net_received_amt": 0.0,
                "over_amt": 0.0, "return_amt": 0.0, "scrap_amt": 0.0,
                "lines": [],
            }

        receipts = receipt_by_po.get(po.po_no, [])
        received = sum(r.qty for r in receipts)
        over = max(0, received - po.qty)
        up = float(po.unit_price or 0)
        recv_amt = sum(r.qty * float(r.unit_price or 0) for r in receipts)
        over_amt = sum(max(0, r.qty) * float(r.unit_price or 0) for r in receipts) - po.qty * up if received > po.qty else 0.0

        return_qty = scrap_qty = 0
        for r in receipts:
            insp = insp_map.get(r.gr_no)
            if insp and insp.fail_qty > 0:
                if insp.disposal == DisposalType.return_:
                    return_qty += insp.fail_qty
                elif insp.disposal == DisposalType.scrap:
                    scrap_qty += insp.fail_qty

        # 이월/반품 처리 (receipt 컬럼) — carryover_qty 우선, 없으면 전체 qty
        carryover_qty = sum(
            (getattr(r, 'carryover_qty', 0) or r.qty)
            for r in receipts if getattr(r, 'is_carryover', 0)
        )
        carryover_amt = sum(
            (getattr(r, 'carryover_qty', 0) or r.qty) * float(r.unit_price or 0)
            for r in receipts if getattr(r, 'is_carryover', 0)
        )
        receipt_return_qty = sum(getattr(r, 'return_qty', 0) or 0 for r in receipts)
        receipt_return_amt = sum((getattr(r, 'return_qty', 0) or 0) * float(r.unit_price or 0) for r in receipts)
        net_received_amt = recv_amt - carryover_amt - receipt_return_amt

        if pid not in result:
            result[pid] = {
                "partner_id": pid,
                "partner_name": partner_map.get(pid, pid),
                "order_qty": 0, "received_qty": 0, "over_qty": 0,
                "return_qty": 0, "scrap_qty": 0,
                "carryover_qty": 0, "carryover_amt": 0.0,
                "receipt_return_qty": 0, "receipt_return_amt": 0.0,
                "order_amt": 0.0, "received_amt": 0.0, "net_received_amt": 0.0,
                "over_amt": 0.0, "return_amt": 0.0, "scrap_amt": 0.0,
                "lines": [],
            }

        result[pid]["order_qty"]           += po.qty
        result[pid]["received_qty"]        += received
        result[pid]["over_qty"]            += over
        result[pid]["return_qty"]          += return_qty
        result[pid]["scrap_qty"]           += scrap_qty
        result[pid]["carryover_qty"]       += carryover_qty
        result[pid]["carryover_amt"]       += carryover_amt
        result[pid]["receipt_return_qty"]  += receipt_return_qty
        result[pid]["receipt_return_amt"]  += receipt_return_amt
        result[pid]["order_amt"]           += po.qty * up
        result[pid]["received_amt"]        += recv_amt
        result[pid]["net_received_amt"]    += net_received_amt
        result[pid]["over_amt"]            += max(0.0, over_amt)
        result[pid]["return_amt"]          += return_qty * up
        result[pid]["scrap_amt"]           += scrap_qty * up
        result[pid]["lines"].append({
            "po_no": po.po_no,
            "part_no": po.part_no,
            "part_name": item_map.get(po.part_no, ""),
            "order_qty": po.qty,
            "received_qty": received,
            "over_qty": over,
            "return_qty": return_qty,
            "scrap_qty": scrap_qty,
            "carryover_qty": carryover_qty,
            "carryover_amt": carryover_amt,
            "receipt_return_qty": receipt_return_qty,
            "receipt_return_amt": receipt_return_amt,
            "unit_price": up,
            "order_amt": po.qty * up,
            "received_amt": recv_amt,
            "net_received_amt": net_received_amt,
            "over_amt": max(0.0, over_amt),
            "return_amt": return_qty * up,
            "scrap_amt": scrap_qty * up,
            "due_date": str(po.due_date) if po.due_date else "",
            "status": po.status,
            "receipts": [
                {
                    "gr_no": r.gr_no,
                    "qty": r.qty,
                    "unit_price": float(r.unit_price or 0),
                    "receipt_date": str(r.receipt_date),
                    "is_carryover": getattr(r, 'is_carryover', 0) or 0,
                    "carryover_qty": getattr(r, 'carryover_qty', 0) or 0,
                    "carryover_reason": getattr(r, 'carryover_reason', None),
                    "carryover_to_month": getattr(r, 'carryover_to_month', None),
                    "return_qty": getattr(r, 'return_qty', 0) or 0,
                    "return_reason": getattr(r, 'return_reason', None),
                }
                for r in receipts
            ],
        })

    # ── 외주입고 (발주 없는 직접입고 — partner_id 있는 것만) ──
    outsource_receipts = db.query(Receipt).filter(
        Receipt.receipt_date >= first_day,
        Receipt.receipt_date <= last_day,
        Receipt.status == ReceiptStatus.confirmed,
        Receipt.po_no == Receipt.gr_no,  # 직접입고 식별
        Receipt.partner_id.isnot(None),  # 자체생산 제외
    ).all()

    outsource = {}
    for r in outsource_receipts:
        pid = r.partner_id
        if pid not in outsource:
            outsource[pid] = {
                "partner_id": pid,
                "partner_name": partner_map.get(pid, pid),
                "received_qty": 0,
                "received_amt": 0.0,
                "net_received_amt": 0.0,
                "carryover_qty": 0,
                "carryover_amt": 0.0,
                "return_qty": 0,
                "return_amt": 0.0,
                "lines": [],
            }
        pay_price = float(r.outsource_price) if r.outsource_price is not None else float(r.unit_price or 0)
        is_carryover = getattr(r, 'is_carryover', 0) or 0
        ret_qty = getattr(r, 'return_qty', 0) or 0
        amt = r.qty * pay_price if not is_carryover else 0.0
        carryover_amt = r.qty * pay_price if is_carryover else 0.0
        ret_amt = ret_qty * pay_price
        net_amt = amt - ret_amt
        outsource[pid]["received_qty"] += r.qty
        outsource[pid]["received_amt"] += amt
        outsource[pid]["carryover_qty"] = outsource[pid].get("carryover_qty", 0) + (r.qty if is_carryover else 0)
        outsource[pid]["carryover_amt"] = outsource[pid].get("carryover_amt", 0.0) + carryover_amt
        outsource[pid]["return_qty"] = outsource[pid].get("return_qty", 0) + ret_qty
        outsource[pid]["return_amt"] = outsource[pid].get("return_amt", 0.0) + ret_amt
        outsource[pid]["net_received_amt"] = outsource[pid].get("net_received_amt", 0.0) + net_amt
        outsource[pid]["lines"].append({
            "gr_no": r.gr_no,
            "part_no": r.part_no,
            "part_name": item_map.get(r.part_no, ""),
            "receipt_date": str(r.receipt_date),
            "qty": r.qty,
            "unit_price": float(r.unit_price or 0),
            "outsource_price": float(r.outsource_price) if r.outsource_price is not None else None,
            "pay_price": pay_price,
            "amt": amt,
            "net_amt": net_amt,
            "is_carryover": is_carryover,
            "carryover_reason": getattr(r, 'carryover_reason', None),
            "carryover_to_month": getattr(r, 'carryover_to_month', None),
            "return_qty": ret_qty,
            "return_reason": getattr(r, 'return_reason', None),
            "return_amt": ret_amt,
            "note": r.note or "",
            "partner_id": r.partner_id,
        })

    # ── 이월 수취분: 이전 달에서 이번 달로 이월된 입고 건 집계 ──
    target_ym = f"{year}-{month:02d}"
    carryover_in_rows = db.query(Receipt).filter(
        Receipt.carryover_to_month == target_ym,
        Receipt.status == ReceiptStatus.confirmed,
        Receipt.is_carryover == 1,
    ).all()

    carryover_in: dict[str, dict] = {}
    for r in carryover_in_rows:
        pid = r.partner_id or "unknown"
        co_qty = getattr(r, 'carryover_qty', 0) or r.qty
        co_amt = co_qty * float(r.unit_price or 0)
        if pid not in carryover_in:
            carryover_in[pid] = {
                "partner_id": pid,
                "partner_name": partner_map.get(pid, pid),
                "carryover_in_qty": 0,
                "carryover_in_amt": 0.0,
                "lines": [],
            }
        carryover_in[pid]["carryover_in_qty"] += co_qty
        carryover_in[pid]["carryover_in_amt"] += co_amt
        carryover_in[pid]["lines"].append({
            "gr_no": r.gr_no,
            "part_no": r.part_no,
            "part_name": item_map.get(r.part_no, ""),
            "receipt_date": str(r.receipt_date),
            "qty": r.qty,
            "carryover_qty": co_qty,
            "unit_price": float(r.unit_price or 0),
            "carryover_amt": co_amt,
            "carryover_reason": getattr(r, 'carryover_reason', None),
            "po_no": r.po_no,
        })

    return {
        "po_based": sorted(result.values(), key=lambda x: x["partner_id"]),
        "outsource": sorted(outsource.values(), key=lambda x: x["partner_id"]),
        "carryover_in": sorted(carryover_in.values(), key=lambda x: x["partner_id"]),
    }


@router.patch("/orders/{po_no}/due-date")
def update_po_due_date(po_no: str, body: dict, db: Session = Depends(get_db)):
    """발주 라인 납기일 수정"""
    po = db.get(PurchaseOrder, po_no)
    if not po:
        raise HTTPException(404, "발주 없음")
    due = body.get("due_date")
    if not due:
        raise HTTPException(400, "due_date 필요")
    po.due_date = date.fromisoformat(str(due))
    db.commit()
    return {"po_no": po_no, "due_date": str(po.due_date)}


@router.patch("/receipts/{gr_no}/partner")
def set_receipt_partner(gr_no: str, body: dict, db: Session = Depends(get_db)):
    """직접입고 건에 외주처 지정/변경"""
    r = db.get(Receipt, gr_no)
    if not r:
        raise HTTPException(404, "입고 없음")
    if r.po_no != r.gr_no:
        raise HTTPException(400, "발주서 기반 입고는 외주처 변경 불가")
    partner_id = body.get("partner_id") or None
    r.partner_id = partner_id
    if "outsource_price" in body:
        op = body.get("outsource_price")
        r.outsource_price = float(op) if op is not None else None
    db.commit()
    db.refresh(r)
    return {"gr_no": gr_no, "partner_id": r.partner_id, "outsource_price": r.outsource_price}


@router.post("/carryover")
def register_carryover(body: dict, db: Session = Depends(get_db)):
    """PO 초과 수량을 이월 처리 — 해당 PO 입고 건들에 is_carryover 자동 설정"""
    partner_id = body.get("partner_id")
    part_no    = body.get("part_no")
    po_no      = body.get("po_no")
    source_ym  = body.get("source_ym")
    over_qty   = int(body.get("over_qty", 0))
    note       = body.get("note") or "발주수량 초과 이월"

    if not all([partner_id, part_no, po_no, source_ym, over_qty]):
        raise HTTPException(400, "필수 항목 누락")

    # PO 입고 건들을 날짜 역순으로 조회 (최근 건부터 이월 처리)
    receipts = db.query(Receipt).filter(
        Receipt.po_no == po_no,
        Receipt.status == ReceiptStatus.confirmed,
    ).order_by(Receipt.receipt_date.desc()).all()

    # 이미 이월된 수량 계산
    already_co = sum((r.carryover_qty or r.qty) for r in receipts if r.is_carryover)

    # 요청 수량 - 이미 이월된 수량 = 추가 이월할 수량
    remaining = over_qty - already_co
    applied = 0

    if remaining > 0:
        for r in receipts:
            if remaining <= 0:
                break
            if r.is_carryover:
                continue  # 이미 이월된 건 건너뜀
            co_qty = min(remaining, r.qty)
            r.is_carryover = 1
            r.carryover_qty = co_qty
            r.carryover_reason = note
            remaining -= co_qty
            applied += co_qty

    # carryover 테이블에도 기록 (이월 이력 보관)
    existing = db.query(Carryover).filter(Carryover.po_no == po_no).first()
    if existing:
        existing.over_qty = over_qty
        existing.remaining_qty = over_qty
        existing.source_ym = source_ym
        existing.note = note
    else:
        db.add(Carryover(
            partner_id=partner_id, part_no=part_no, po_no=po_no,
            source_ym=source_ym, over_qty=over_qty, remaining_qty=over_qty, note=note,
        ))

    db.commit()
    return {"ok": True, "applied_qty": already_co + applied, "total_carryover": over_qty}


@router.get("/carryover")
def list_carryover(partner_id: str | None = None, db: Session = Depends(get_db)):
    """잔여 이월 목록 (remaining_qty > 0)"""
    q = db.query(Carryover).filter(Carryover.remaining_qty > 0)
    if partner_id:
        q = q.filter(Carryover.partner_id == partner_id)
    rows = q.order_by(Carryover.created_at.desc()).all()
    item_map = {i.part_no: i.name for i in db.query(Item).all()}
    return [
        {
            "id": r.id,
            "partner_id": r.partner_id,
            "part_no": r.part_no,
            "part_name": item_map.get(r.part_no, ""),
            "po_no": r.po_no,
            "source_ym": r.source_ym,
            "over_qty": r.over_qty,
            "remaining_qty": r.remaining_qty,
            "note": r.note,
        }
        for r in rows
    ]


@router.patch("/carryover/{carryover_id}/apply")
def apply_carryover(carryover_id: int, body: dict, db: Session = Depends(get_db)):
    """이월 적용 — 발주서 생성 시 이월량만큼 차감"""
    apply_qty = int(body.get("apply_qty", 0))
    r = db.get(Carryover, carryover_id)
    if not r:
        raise HTTPException(404, "이월 없음")
    if apply_qty > r.remaining_qty:
        raise HTTPException(400, f"적용 수량({apply_qty})이 잔여 이월({r.remaining_qty})을 초과합니다")
    r.remaining_qty -= apply_qty
    db.commit()
    return {"id": r.id, "remaining_qty": r.remaining_qty}


@router.patch("/receipts/{gr_no}/carryover")
def set_receipt_carryover(gr_no: str, body: dict, db: Session = Depends(get_db)):
    """입고 건 이월 처리 (is_carryover 토글)"""
    r = db.get(Receipt, gr_no)
    if not r:
        raise HTTPException(404, "입고 없음")
    is_co = 1 if body.get("is_carryover", True) else 0
    r.is_carryover = is_co
    r.carryover_reason = body.get("reason") or None
    if is_co:
        req_qty = int(body.get("carryover_qty") or r.qty)
        r.carryover_qty = min(req_qty, r.qty)
        r.carryover_to_month = body.get("carryover_to_month") or None
    else:
        r.carryover_qty = 0
        r.carryover_reason = None
        r.carryover_to_month = None
    db.commit()
    return {
        "gr_no": gr_no,
        "is_carryover": r.is_carryover,
        "carryover_qty": r.carryover_qty,
        "carryover_reason": r.carryover_reason,
        "carryover_to_month": r.carryover_to_month,
    }


@router.patch("/receipts/{gr_no}/return")
def set_receipt_return(gr_no: str, body: dict, db: Session = Depends(get_db)):
    """입고 건 반품 처리 — return_qty, return_reason 설정"""
    r = db.get(Receipt, gr_no)
    if not r:
        raise HTTPException(404, "입고 없음")
    qty = int(body.get("return_qty", 0))
    if qty < 0 or qty > r.qty:
        raise HTTPException(400, f"반품수량은 0~{r.qty} 사이여야 합니다")
    r.return_qty = qty
    r.return_reason = body.get("reason") or None
    db.commit()
    return {"gr_no": gr_no, "return_qty": r.return_qty, "return_reason": r.return_reason}


@router.get("/receipts/{gr_no}", response_model=ReceiptOut)
def get_receipt(gr_no: str, db: Session = Depends(get_db)):
    r = db.get(Receipt, gr_no)
    if not r:
        raise HTTPException(404)
    return r


@router.post("/receipts/{gr_no}/confirm", response_model=ReceiptOut)
def confirm_receipt(gr_no: str, db: Session = Depends(get_db)):
    """검사 합격 → 입고 확정 + 재고 반영"""
    r = db.get(Receipt, gr_no)
    if not r:
        raise HTTPException(404, f"입고 없음: {gr_no}")
    if r.status == ReceiptStatus.confirmed:
        raise HTTPException(400, "이미 확정된 입고입니다")
    if r.status == ReceiptStatus.cancelled:
        raise HTTPException(400, "취소된 입고는 확정할 수 없습니다")

    r.status = ReceiptStatus.confirmed
    post_ledger(
        db, r.part_no, r.receipt_date,
        LedgerType.receipt, +r.qty, float(r.unit_price),
        ref_type="GR", ref_no=gr_no, note="입고확정",
    )
    db.commit()
    db.refresh(r)
    return r


@router.post("/receipts/{gr_no}/reverse")
def reverse_receipt(gr_no: str, body: dict = {}, db: Session = Depends(get_db)):
    """확정 입고 역분개 — SAP 방식: 원전표 유지 + 마이너스 취소전표 신규 생성"""
    from app.services.doc_no import next_doc_no
    from app.services.purchase_service import _update_po_status

    orig = db.get(Receipt, gr_no)
    if not orig:
        raise HTTPException(404, f"입고 없음: {gr_no}")
    if orig.status != ReceiptStatus.confirmed:
        raise HTTPException(400, "확정된 입고만 역분개할 수 있습니다")

    # 이미 역분개된 건인지 확인 (note에 "역분개" 포함된 GR이 있으면 중복 방지)
    already = db.query(Receipt).filter(
        Receipt.po_no == orig.po_no,
        Receipt.part_no == orig.part_no,
        Receipt.qty == -orig.qty,
        Receipt.note.ilike(f"%{gr_no}%"),
    ).first()
    if already:
        raise HTTPException(400, f"이미 역분개된 입고입니다 ({already.gr_no})")

    reason = (body.get("reason") or "수량오류 역분개") if body else "수량오류 역분개"
    rev_no = next_doc_no(db, "GR", "receipt", "gr_no")

    # 역분개 전표 생성 (-수량, confirmed 상태)
    rev = Receipt(
        gr_no=rev_no,
        po_no=orig.po_no,
        part_no=orig.part_no,
        qty=-orig.qty,                          # 음수 수량
        receipt_date=date.today(),
        unit_price=orig.unit_price,
        status=ReceiptStatus.confirmed,
        partner_id=orig.partner_id,
        outsource_price=orig.outsource_price,
        note=f"{reason} ← {gr_no}",            # 원전표 링크
    )
    db.add(rev)
    db.flush()

    # 재고원장 역분개
    post_ledger(
        db, orig.part_no, date.today(),
        LedgerType.receipt, -orig.qty, float(orig.unit_price),
        ref_type="GR", ref_no=rev_no,
        note=f"역분개({gr_no}): {reason}",
    )

    # PO 상태 재계산 (직접입고가 아닌 경우만)
    if orig.po_no != orig.gr_no:
        po = db.get(PurchaseOrder, orig.po_no)
        if po:
            _update_po_status(db, po)

    db.commit()
    db.refresh(rev)
    return {
        "original_gr": gr_no,
        "reversal_gr": rev_no,
        "qty": -orig.qty,
        "note": rev.note,
    }


@router.post("/receipts/{gr_no}/cancel", response_model=ReceiptOut)
def cancel_receipt(gr_no: str, db: Session = Depends(get_db)):
    """입고 취소 (확정 전만 가능)"""
    r = db.get(Receipt, gr_no)
    if not r:
        raise HTTPException(404, f"입고 없음: {gr_no}")
    if r.status == ReceiptStatus.cancelled:
        raise HTTPException(400, "이미 취소된 입고입니다")
    if r.status == ReceiptStatus.confirmed:
        raise HTTPException(400, "확정된 입고는 역분개를 사용하세요: POST /receipts/{gr_no}/reverse")

    r.status = ReceiptStatus.cancelled
    # PO 상태 재계산
    po = db.get(PurchaseOrder, r.po_no)
    if po:
        from app.services.purchase_service import _update_po_status
        _update_po_status(db, po)
    db.commit()
    db.refresh(r)
    return r


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  외주 월마감 Excel 보고서 — Sony Dark Theme
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

_C_BLACK  = '0D0D0D'
_C_DKGRAY = '1C1C1E'
_C_MGRAY  = '3A3A3C'
_C_LGRAY  = '8E8E93'
_C_SILVER = 'E5E5EA'
_C_SNOW   = 'F9F9FB'
_C_WHITE  = 'FFFFFF'
_C_RED    = 'FF3B30'
_C_BLUE   = '0A84FF'
_C_GREEN  = '30D158'
_C_AMBER  = 'FF9F0A'
_C_TEAL   = '5AC8FA'
_MF = '#,##0'
_PF = '0.0%'


def _xf(h): return PatternFill('solid', fgColor=h)
def _xfont(bold=False, size=9, color=_C_BLACK, name='Arial'):
    return Font(name=name, bold=bold, size=size, color=color)
def _xal(h='left', v='center', wrap=False):
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)
def _xside(c=_C_SILVER): return Side(style='thin', color=c)
def _xborder():
    return Border(left=_xside(), right=_xside(), top=_xside(), bottom=_xside())


def _closing_page_title(ws, ncols, year, month, subtitle):
    cl = get_column_letter(ncols)
    ws.sheet_view.showGridLines = False

    ws.merge_cells(f'A1:{cl}1')
    c = ws['A1']
    c.value = 'NEXGEM CO., LTD.'
    c.font  = _xfont(bold=True, size=8, color=_C_LGRAY)
    c.fill  = _xf(_C_BLACK)
    c.alignment = _xal('left')
    c.border = Border()
    ws.row_dimensions[1].height = 14

    ws.merge_cells(f'A2:{cl}2')
    c = ws['A2']
    c.value = f'외주 월마감 보고서  —  {year}.{month:02d}'
    c.font  = _xfont(bold=True, size=16, color=_C_WHITE, name='Arial')
    c.fill  = _xf(_C_BLACK)
    c.alignment = _xal('left')
    c.border = Border()
    ws.row_dimensions[2].height = 36

    ws.merge_cells(f'A3:{cl}3')
    c = ws['A3']
    c.value = subtitle
    c.font  = _xfont(bold=False, size=9, color=_C_LGRAY)
    c.fill  = _xf(_C_DKGRAY)
    c.alignment = _xal('left')
    c.border = Border()
    ws.row_dimensions[3].height = 18


def _closing_col_header(ws, row, headers, bg=_C_DKGRAY, fg=_C_WHITE, height=28):
    ws.row_dimensions[row].height = height
    for ci, h in enumerate(headers, 1):
        c = ws.cell(row, ci, h)
        c.font      = _xfont(bold=True, size=8, color=fg)
        c.fill      = _xf(bg)
        c.alignment = _xal('center', wrap=True)
        c.border    = Border(
            bottom=Side(style='medium', color=_C_WHITE),
            right=Side(style='thin', color='2C2C2E'),
        )


def _closing_data_cell(c, val, fmt=None, bold=False, color=_C_BLACK, align='right', bg=_C_WHITE):
    c.value     = val
    c.font      = _xfont(bold=bold, size=9, color=color)
    c.fill      = _xf(bg)
    c.alignment = _xal(align, wrap=False)
    c.border    = Border(
        bottom=Side(style='thin', color=_C_SILVER),
        right=Side(style='thin', color=_C_SILVER),
    )
    if fmt:
        c.number_format = fmt


def _closing_section_bar(ws, row, ncols, label, bg=_C_MGRAY):
    cl = get_column_letter(ncols)
    ws.merge_cells(f'A{row}:{cl}{row}')
    c = ws[f'A{row}']
    c.value     = label
    c.font      = _xfont(bold=True, size=9, color=_C_WHITE)
    c.fill      = _xf(bg)
    c.alignment = _xal('left')
    c.border    = Border()
    ws.row_dimensions[row].height = 20


@router.get("/closing/excel")
def closing_excel(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    """외주 월마감 Excel 보고서 (Sony Dark Theme, 4시트)"""
    from app.models.quality import Inspection, DisposalType

    first_day = date(year, month, 1)
    last_day  = date(year, month, monthrange(year, month)[1])

    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}
    item_map    = {i.part_no: i.name for i in db.query(Item).all()}

    # ── 발주기반 데이터 수집 ──
    pos = db.query(PurchaseOrder).filter(
        PurchaseOrder.due_date >= first_day,
        PurchaseOrder.due_date <= last_day,
        PurchaseOrder.status != POStatus.cancelled,
    ).all()

    po_partners: dict[str, dict] = {}
    po_lines: list[dict] = []

    if pos:
        ex_po_nos = [po.po_no for po in pos]
        ex_receipts = db.query(Receipt).filter(
            Receipt.po_no.in_(ex_po_nos),
            Receipt.status == ReceiptStatus.confirmed,
        ).all()
        ex_recv_by_po: dict[str, list] = {}
        for r in ex_receipts:
            ex_recv_by_po.setdefault(r.po_no, []).append(r)

        ex_gr_nos = [r.gr_no for r in ex_receipts]
        ex_insp_map: dict[str, object] = {}
        if ex_gr_nos:
            for insp in db.query(Inspection).filter(Inspection.gr_no.in_(ex_gr_nos)).all():
                ex_insp_map[insp.gr_no] = insp

    for po in pos:
        pid = po.partner_id
        if pid not in po_partners:
            po_partners[pid] = {
                "partner_id": pid,
                "partner_name": partner_map.get(pid, pid),
                "order_qty": 0, "received_qty": 0, "over_qty": 0,
                "return_qty": 0, "scrap_qty": 0,
                "carryover_qty": 0, "carryover_amt": 0.0,
                "receipt_return_qty": 0, "receipt_return_amt": 0.0,
                "order_amt": 0.0, "received_amt": 0.0, "net_received_amt": 0.0,
                "over_amt": 0.0, "return_amt": 0.0,
            }

        receipts = ex_recv_by_po.get(po.po_no, [])
        received = sum(r.qty for r in receipts)
        over = max(0, received - po.qty)
        up   = float(po.unit_price or 0)
        recv_amt = sum(r.qty * float(r.unit_price or 0) for r in receipts)
        over_amt_ex = max(0.0, recv_amt - po.qty * up) if received > po.qty else 0.0

        return_qty = scrap_qty = 0
        for r in receipts:
            insp = ex_insp_map.get(r.gr_no)
            if insp and insp.fail_qty > 0:
                if insp.disposal == DisposalType.return_:
                    return_qty += insp.fail_qty
                elif insp.disposal == DisposalType.scrap:
                    scrap_qty  += insp.fail_qty

        # 이월/반품 (receipt 컬럼 기반)
        co_qty  = sum((getattr(r, 'carryover_qty', 0) or r.qty) for r in receipts if getattr(r, 'is_carryover', 0))
        co_amt  = sum((getattr(r, 'carryover_qty', 0) or r.qty) * float(r.unit_price or 0) for r in receipts if getattr(r, 'is_carryover', 0))
        rtn_qty = sum(getattr(r, 'return_qty', 0) or 0 for r in receipts)
        rtn_amt = sum((getattr(r, 'return_qty', 0) or 0) * float(r.unit_price or 0) for r in receipts)
        net_amt = recv_amt - co_amt - rtn_amt

        po_partners[pid]["order_qty"]          += po.qty
        po_partners[pid]["received_qty"]        += received
        po_partners[pid]["over_qty"]            += over
        po_partners[pid]["return_qty"]          += return_qty
        po_partners[pid]["scrap_qty"]           += scrap_qty
        po_partners[pid]["carryover_qty"]       += co_qty
        po_partners[pid]["carryover_amt"]       += co_amt
        po_partners[pid]["receipt_return_qty"]  += rtn_qty
        po_partners[pid]["receipt_return_amt"]  += rtn_amt
        po_partners[pid]["order_amt"]           += po.qty * up
        po_partners[pid]["received_amt"]        += recv_amt
        po_partners[pid]["net_received_amt"]    += net_amt
        po_partners[pid]["over_amt"]            += over_amt_ex
        po_partners[pid]["return_amt"]          += return_qty * up

        achieve = received / po.qty if po.qty else 0
        po_lines.append({
            "partner_name": partner_map.get(pid, pid),
            "po_no": po.po_no,
            "part_no": po.part_no,
            "part_name": item_map.get(po.part_no, ""),
            "due_date": str(po.due_date) if po.due_date else "",
            "status": po.status.value if hasattr(po.status, 'value') else str(po.status),
            "order_qty": po.qty,
            "received_qty": received,
            "over_qty": over,
            "return_qty": return_qty,
            "scrap_qty": scrap_qty,
            "carryover_qty": co_qty,
            "carryover_amt": co_amt,
            "receipt_return_qty": rtn_qty,
            "receipt_return_amt": rtn_amt,
            "unit_price": up,
            "order_amt": po.qty * up,
            "received_amt": recv_amt,
            "net_received_amt": net_amt,
            "over_amt": over_amt_ex,
            "return_amt": return_qty * up,
            "achieve": achieve,
        })

    # ── 외주입고 (발주 없는 직접입고) ──
    out_receipts = db.query(Receipt).filter(
        Receipt.receipt_date >= first_day,
        Receipt.receipt_date <= last_day,
        Receipt.status == ReceiptStatus.confirmed,
        Receipt.po_no == Receipt.gr_no,
        Receipt.partner_id.isnot(None),
    ).all()

    out_partners: dict[str, dict] = {}
    out_lines: list[dict] = []
    for r in out_receipts:
        pid = r.partner_id
        if pid not in out_partners:
            out_partners[pid] = {
                "partner_id": pid,
                "partner_name": partner_map.get(pid, pid),
                "received_qty": 0,
                "received_amt": 0.0,
            }
        pay = float(r.outsource_price) if r.outsource_price is not None else float(r.unit_price or 0)
        amt = r.qty * pay
        out_partners[pid]["received_qty"] += r.qty
        out_partners[pid]["received_amt"] += amt
        out_lines.append({
            "partner_name": partner_map.get(pid, pid),
            "gr_no": r.gr_no,
            "receipt_date": str(r.receipt_date),
            "part_no": r.part_no,
            "part_name": item_map.get(r.part_no, ""),
            "qty": r.qty,
            "unit_price": float(r.unit_price or 0),
            "outsource_price": float(r.outsource_price) if r.outsource_price is not None else None,
            "pay_price": pay,
            "amt": amt,
            "note": r.note or "",
        })

    # ── 이월 현황 ──
    carryovers = db.query(Carryover).filter(Carryover.remaining_qty > 0).all()

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    #  Excel 생성
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    wb = openpyxl.Workbook()

    # ── Sheet 1: 종합요약 ──
    ws1 = wb.active
    ws1.title = "종합요약"
    NC1 = 11
    _closing_page_title(ws1, NC1, year, month, f"  발주기반 {len(po_lines)}건 · 외주직접입고 {len(out_lines)}건  |  기준일 {year}.{month:02d}.{last_day.day:02d}")

    # 발주기반 요약 섹션
    _closing_section_bar(ws1, 5, NC1, "  ▌ 발주기반 외주처별 요약", _C_MGRAY)
    h1 = ["외주처", "발주수량", "입고수량", "달성률", "초과수량", "발주금액", "입고금액", "이월금액", "반품금액", "실입고금액", "초과금액"]
    _closing_col_header(ws1, 6, h1)

    row = 7
    tot_oq = tot_rq = tot_oamt = tot_ramt = tot_co_amt = tot_rtn_amt = tot_net_amt = tot_ov_amt = 0
    po_sorted = sorted(po_partners.values(), key=lambda x: x["partner_id"])
    for i, p in enumerate(po_sorted):
        bg = _C_SNOW if i % 2 == 0 else _C_WHITE
        ach = p["received_qty"] / p["order_qty"] if p["order_qty"] else 0
        ach_color = _C_GREEN if ach >= 1.0 else (_C_AMBER if ach >= 0.8 else _C_RED)
        ws1.row_dimensions[row].height = 18

        _closing_data_cell(ws1.cell(row,  1), p["partner_name"],        bold=True, color=_C_BLACK, align='left', bg=bg)
        _closing_data_cell(ws1.cell(row,  2), p["order_qty"],           fmt=_MF, bg=bg)
        _closing_data_cell(ws1.cell(row,  3), p["received_qty"],        fmt=_MF, bg=bg)
        _closing_data_cell(ws1.cell(row,  4), ach, fmt=_PF, bold=True, color=ach_color, bg=bg)
        _closing_data_cell(ws1.cell(row,  5), p["over_qty"],            fmt=_MF,
                           color=_C_RED if p["over_qty"] > 0 else _C_BLACK, bg=bg)
        _closing_data_cell(ws1.cell(row,  6), p["order_amt"],           fmt=_MF, bg=bg)
        _closing_data_cell(ws1.cell(row,  7), p["received_amt"],        fmt=_MF, bg=bg)
        _closing_data_cell(ws1.cell(row,  8), p.get("carryover_amt", 0),    fmt=_MF,
                           color=_C_AMBER if p.get("carryover_amt", 0) > 0 else _C_BLACK, bg=bg)
        _closing_data_cell(ws1.cell(row,  9), p.get("receipt_return_amt", 0), fmt=_MF,
                           color=_C_RED if p.get("receipt_return_amt", 0) > 0 else _C_BLACK, bg=bg)
        _closing_data_cell(ws1.cell(row, 10), p.get("net_received_amt", p["received_amt"]), fmt=_MF,
                           bold=True, color=_C_BLUE, bg=bg)
        _closing_data_cell(ws1.cell(row, 11), p["over_amt"],            fmt=_MF,
                           color=_C_RED if p["over_amt"] > 0 else _C_BLACK, bg=bg)
        tot_oq      += p["order_qty"]
        tot_rq      += p["received_qty"]
        tot_oamt    += p["order_amt"]
        tot_ramt    += p["received_amt"]
        tot_co_amt  += p.get("carryover_amt", 0)
        tot_rtn_amt += p.get("receipt_return_amt", 0)
        tot_net_amt += p.get("net_received_amt", p["received_amt"])
        tot_ov_amt  += p["over_amt"]
        row += 1

    # 발주기반 합계
    ws1.row_dimensions[row].height = 22
    tot_ach = tot_rq / tot_oq if tot_oq else 0
    for ci, (val, fmt, bold, color) in enumerate([
        ("합  계", None, True, _C_WHITE),
        (tot_oq,  _MF,  True, _C_WHITE),
        (tot_rq,  _MF,  True, _C_WHITE),
        (tot_ach, _PF,  True, _C_AMBER),
        (0,       _MF,  True, _C_WHITE),
        (tot_oamt,    _MF, True, _C_WHITE),
        (tot_ramt,    _MF, True, _C_WHITE),
        (tot_co_amt,  _MF, True, _C_AMBER if tot_co_amt > 0 else _C_WHITE),
        (tot_rtn_amt, _MF, True, _C_RED   if tot_rtn_amt > 0 else _C_WHITE),
        (tot_net_amt, _MF, True, _C_BLUE),
        (tot_ov_amt,  _MF, True, _C_RED   if tot_ov_amt > 0 else _C_WHITE),
    ], 1):
        c = ws1.cell(row, ci)
        _closing_data_cell(c, val, fmt=fmt, bold=bold, color=color, align='right' if ci > 1 else 'center', bg=_C_DKGRAY)
    row += 2

    # 외주직접입고 요약 섹션
    _closing_section_bar(ws1, row, NC1, "  ▌ 외주직접입고 (발주 없음) 외주처별 요약", _C_MGRAY)
    row += 1
    h2 = ["외주처", "입고건수", "입고수량", "지급금액", "", "", "", ""]
    _closing_col_header(ws1, row, h2)
    row += 1

    tot_out_qty = tot_out_amt = 0
    out_sorted = sorted(out_partners.values(), key=lambda x: x["partner_id"])
    for i, p in enumerate(out_sorted):
        bg = _C_SNOW if i % 2 == 0 else _C_WHITE
        cnt = sum(1 for ln in out_lines if ln["partner_name"] == p["partner_name"])
        ws1.row_dimensions[row].height = 18
        _closing_data_cell(ws1.cell(row, 1), p["partner_name"], bold=True, color=_C_BLACK, align='left', bg=bg)
        _closing_data_cell(ws1.cell(row, 2), cnt,              fmt=_MF, bg=bg)
        _closing_data_cell(ws1.cell(row, 3), p["received_qty"], fmt=_MF, bg=bg)
        _closing_data_cell(ws1.cell(row, 4), p["received_amt"], fmt=_MF, bold=True, color=_C_BLUE, bg=bg)
        for ci in range(5, NC1 + 1):
            _closing_data_cell(ws1.cell(row, ci), None, bg=bg)
        tot_out_qty += p["received_qty"]
        tot_out_amt += p["received_amt"]
        row += 1

    ws1.row_dimensions[row].height = 22
    for ci, (val, fmt, bold, color) in enumerate([
        ("합  계", None, True, _C_WHITE),
        (len(out_lines), _MF, True, _C_WHITE),
        (tot_out_qty, _MF, True, _C_WHITE),
        (tot_out_amt, _MF, True, _C_AMBER),
        (None, None, False, _C_WHITE),
        (None, None, False, _C_WHITE),
        (None, None, False, _C_WHITE),
        (None, None, False, _C_WHITE),
    ], 1):
        c = ws1.cell(row, ci)
        _closing_data_cell(c, val, fmt=fmt, bold=bold, color=color, align='right' if ci > 1 else 'center', bg=_C_DKGRAY)
    row += 2

    # 당월 합산 총계 (실입고금액 기준 = 입고금액 - 이월금액 - 반품금액)
    _closing_section_bar(ws1, row, NC1, "  ▌ 당월 외주매입 총계", _C_BLACK)
    row += 1
    total_buy = tot_net_amt + tot_out_amt   # 실입고(이월·반품 제외) + 직접입고
    ws1.row_dimensions[row].height = 28
    ws1.merge_cells(f'A{row}:D{row}')
    c = ws1[f'A{row}']
    c.value = "당월 외주 총매입금액  (실입고 + 직접입고)"
    c.font  = _xfont(bold=True, size=11, color=_C_WHITE)
    c.fill  = _xf(_C_DKGRAY)
    c.alignment = _xal('left')
    c.border = Border()
    ws1.merge_cells(f'E{row}:{get_column_letter(NC1)}{row}')
    c2 = ws1[f'E{row}']
    c2.value = total_buy
    c2.number_format = _MF
    c2.font  = _xfont(bold=True, size=14, color=_C_BLUE, name='Arial')
    c2.fill  = _xf(_C_DKGRAY)
    c2.alignment = _xal('right')
    c2.border = Border()

    ws1.column_dimensions['A'].width = 18
    for ci in range(2, NC1 + 1):
        ws1.column_dimensions[get_column_letter(ci)].width = 14
    ws1.freeze_panes = 'A7'

    # ── Sheet 2: 발주기반 상세 ──
    ws2 = wb.create_sheet("발주기반_상세")
    NC2 = 15
    _closing_page_title(ws2, NC2, year, month, "  발주서 라인별 상세 현황  —  이월(AMBER) · 반품/초과(RED) 강조")
    h3 = ["외주처", "발주번호", "품번", "품명", "납기일", "상태",
          "발주수량", "입고수량", "달성률", "초과수량",
          "이월수량", "이월금액", "반품수량", "반품금액", "실입고금액"]
    _closing_col_header(ws2, 5, h3)

    po_lines.sort(key=lambda x: (x["partner_name"], x["po_no"]))
    for i, ln in enumerate(po_lines):
        row2 = i + 6
        bg = _C_SNOW if i % 2 == 0 else _C_WHITE
        is_over   = ln["over_qty"] > 0
        is_co     = ln.get("carryover_qty", 0) > 0
        is_return = ln["return_qty"] > 0 or ln["scrap_qty"] > 0 or ln.get("receipt_return_qty", 0) > 0
        if is_over:   row_color = _C_RED
        elif is_co:   row_color = _C_AMBER
        elif is_return: row_color = _C_RED
        else:           row_color = _C_BLACK
        ws2.row_dimensions[row2].height = 17
        ach = ln["achieve"]
        ach_color = _C_GREEN if ach >= 1.0 else (_C_AMBER if ach >= 0.8 else _C_RED)
        status_color = _C_GREEN if '완료' in ln["status"] else (_C_AMBER if '일부' in ln["status"] else _C_BLACK)

        _closing_data_cell(ws2.cell(row2,  1), ln["partner_name"], bold=True, color=_C_BLACK, align='left', bg=bg)
        _closing_data_cell(ws2.cell(row2,  2), ln["po_no"],        color=_C_LGRAY, align='left', bg=bg)
        _closing_data_cell(ws2.cell(row2,  3), ln["part_no"],      color=_C_LGRAY, align='left', bg=bg)
        _closing_data_cell(ws2.cell(row2,  4), ln["part_name"],    color=_C_BLACK, align='left', bg=bg)
        _closing_data_cell(ws2.cell(row2,  5), ln["due_date"],     color=_C_LGRAY, align='center', bg=bg)
        _closing_data_cell(ws2.cell(row2,  6), ln["status"],       bold=True, color=status_color, align='center', bg=bg)
        _closing_data_cell(ws2.cell(row2,  7), ln["order_qty"],    fmt=_MF, bg=bg)
        _closing_data_cell(ws2.cell(row2,  8), ln["received_qty"], fmt=_MF, bg=bg)
        _closing_data_cell(ws2.cell(row2,  9), ach, fmt=_PF, bold=True, color=ach_color, bg=bg)
        _closing_data_cell(ws2.cell(row2, 10), ln["over_qty"],
                           fmt=_MF, bold=is_over, color=_C_RED if is_over else _C_BLACK, bg=bg)
        _closing_data_cell(ws2.cell(row2, 11), ln.get("carryover_qty", 0),
                           fmt=_MF, bold=is_co, color=_C_AMBER if is_co else _C_BLACK, bg=bg)
        _closing_data_cell(ws2.cell(row2, 12), ln.get("carryover_amt", 0),
                           fmt=_MF, bold=is_co, color=_C_AMBER if is_co else _C_BLACK, bg=bg)
        _closing_data_cell(ws2.cell(row2, 13), ln.get("receipt_return_qty", 0),
                           fmt=_MF, bold=is_return, color=_C_RED if is_return else _C_BLACK, bg=bg)
        _closing_data_cell(ws2.cell(row2, 14), ln.get("receipt_return_amt", 0),
                           fmt=_MF, bold=is_return, color=_C_RED if is_return else _C_BLACK, bg=bg)
        _closing_data_cell(ws2.cell(row2, 15), ln.get("net_received_amt", ln["received_amt"]),
                           fmt=_MF, bold=True, color=_C_BLUE, bg=bg)

    ws2.column_dimensions['A'].width = 16
    ws2.column_dimensions['B'].width = 18
    ws2.column_dimensions['C'].width = 14
    ws2.column_dimensions['D'].width = 22
    ws2.column_dimensions['E'].width = 11
    ws2.column_dimensions['F'].width = 9
    for ci in range(7, NC2 + 1):
        ws2.column_dimensions[get_column_letter(ci)].width = 13
    ws2.freeze_panes = 'A6'
    ws2.sheet_view.tabSelected = False

    # ── Sheet 3: 외주입고 정산 ──
    ws3 = wb.create_sheet("외주입고_정산")
    NC3 = 9
    _closing_page_title(ws3, NC3, year, month, "  발주 없는 직접입고 — 외주단가(지급) vs 재고단가(평가) 비교")
    h4 = ["외주처", "입고번호", "입고일", "품번", "품명", "수량",
          "재고단가", "외주단가(지급)", "지급금액"]
    _closing_col_header(ws3, 5, h4)

    out_lines.sort(key=lambda x: (x["partner_name"], x["receipt_date"]))
    for i, ln in enumerate(out_lines):
        row3 = i + 6
        bg = _C_SNOW if i % 2 == 0 else _C_WHITE
        has_diff = ln["outsource_price"] is not None and abs(ln["outsource_price"] - ln["unit_price"]) > 1
        ws3.row_dimensions[row3].height = 17

        _closing_data_cell(ws3.cell(row3, 1), ln["partner_name"],  bold=True, color=_C_BLACK, align='left', bg=bg)
        _closing_data_cell(ws3.cell(row3, 2), ln["gr_no"],         color=_C_LGRAY, align='left', bg=bg)
        _closing_data_cell(ws3.cell(row3, 3), ln["receipt_date"],  color=_C_LGRAY, align='center', bg=bg)
        _closing_data_cell(ws3.cell(row3, 4), ln["part_no"],       color=_C_LGRAY, align='left', bg=bg)
        _closing_data_cell(ws3.cell(row3, 5), ln["part_name"],     color=_C_BLACK, align='left', bg=bg)
        _closing_data_cell(ws3.cell(row3, 6), ln["qty"],           fmt=_MF, bg=bg)
        _closing_data_cell(ws3.cell(row3, 7), ln["unit_price"],    fmt=_MF, color=_C_LGRAY, bg=bg)
        _closing_data_cell(ws3.cell(row3, 8), ln["pay_price"],
                           fmt=_MF, bold=has_diff, color=_C_AMBER if has_diff else _C_BLACK, bg=bg)
        _closing_data_cell(ws3.cell(row3, 9), ln["amt"],           fmt=_MF, bold=True, color=_C_BLUE, bg=bg)

    # 합계행
    if out_lines:
        row3 = len(out_lines) + 6
        ws3.row_dimensions[row3].height = 22
        for ci in range(1, NC3 + 1):
            bg = _C_DKGRAY
            if ci == 1:
                _closing_data_cell(ws3.cell(row3, ci), "합  계", bold=True, color=_C_WHITE, align='center', bg=bg)
            elif ci == 6:
                _closing_data_cell(ws3.cell(row3, ci), tot_out_qty, fmt=_MF, bold=True, color=_C_WHITE, bg=bg)
            elif ci == 9:
                _closing_data_cell(ws3.cell(row3, ci), tot_out_amt, fmt=_MF, bold=True, color=_C_AMBER, bg=bg)
            else:
                _closing_data_cell(ws3.cell(row3, ci), None, bg=bg)

    ws3.column_dimensions['A'].width = 16
    ws3.column_dimensions['B'].width = 18
    ws3.column_dimensions['C'].width = 11
    ws3.column_dimensions['D'].width = 14
    ws3.column_dimensions['E'].width = 22
    for ci in range(6, NC3 + 1):
        ws3.column_dimensions[get_column_letter(ci)].width = 14
    ws3.freeze_panes = 'A6'

    # ── Sheet 4: 경영분석 ──
    ws4 = wb.create_sheet("경영분석")
    NC4 = 6
    _closing_page_title(ws4, NC4, year, month, "  초과입고 이월현황 · 외주처별 비중 분석")

    # 이월현황
    _closing_section_bar(ws4, 5, NC4, "  ▌ 잔여 이월현황 (전월 이월 포함)", _C_MGRAY)
    h5 = ["외주처", "품번", "발주번호", "발생월", "초과수량", "잔여수량"]
    _closing_col_header(ws4, 6, h5)

    if carryovers:
        for i, cv in enumerate(carryovers):
            row4 = i + 7
            bg = _C_SNOW if i % 2 == 0 else _C_WHITE
            ws4.row_dimensions[row4].height = 17
            _closing_data_cell(ws4.cell(row4, 1), partner_map.get(cv.partner_id, cv.partner_id),
                               bold=True, color=_C_BLACK, align='left', bg=bg)
            _closing_data_cell(ws4.cell(row4, 2), cv.part_no,       color=_C_LGRAY, align='left', bg=bg)
            _closing_data_cell(ws4.cell(row4, 3), cv.po_no,         color=_C_LGRAY, align='left', bg=bg)
            _closing_data_cell(ws4.cell(row4, 4), cv.source_ym,     color=_C_LGRAY, align='center', bg=bg)
            _closing_data_cell(ws4.cell(row4, 5), cv.over_qty,      fmt=_MF, color=_C_RED, bg=bg)
            _closing_data_cell(ws4.cell(row4, 6), cv.remaining_qty, fmt=_MF, bold=True, color=_C_AMBER, bg=bg)
        cv_end_row = len(carryovers) + 8
    else:
        row4 = 7
        ws4.merge_cells(f'A{row4}:{get_column_letter(NC4)}{row4}')
        c = ws4[f'A{row4}']
        c.value = "이월 없음"
        c.font  = _xfont(size=9, color=_C_LGRAY)
        c.fill  = _xf(_C_SNOW)
        c.alignment = _xal('center')
        c.border = Border()
        ws4.row_dimensions[row4].height = 20
        cv_end_row = 9

    # 외주처별 비중
    _closing_section_bar(ws4, cv_end_row, NC4, "  ▌ 당월 외주처별 매입 비중 (발주기반 + 직접입고 합산)", _C_MGRAY)
    h6 = ["외주처", "발주기반 금액", "직접입고 금액", "합  계", "비중", ""]
    _closing_col_header(ws4, cv_end_row + 1, h6)

    # 외주처별 합산 (발주기반은 실입고금액 기준 = 이월·반품 제외)
    all_pids = set(list(po_partners.keys()) + list(out_partners.keys()))
    share_rows = []
    grand_total = 0.0
    for pid in sorted(all_pids):
        po_amt  = po_partners.get(pid, {}).get("net_received_amt", po_partners.get(pid, {}).get("received_amt", 0.0))
        out_amt = out_partners.get(pid, {}).get("received_amt", 0.0)
        total   = po_amt + out_amt
        grand_total += total
        share_rows.append({
            "name": partner_map.get(pid, pid),
            "po_amt": po_amt,
            "out_amt": out_amt,
            "total": total,
        })

    for i, sr in enumerate(share_rows):
        row4 = cv_end_row + 2 + i
        bg = _C_SNOW if i % 2 == 0 else _C_WHITE
        share = sr["total"] / grand_total if grand_total else 0
        ws4.row_dimensions[row4].height = 18
        _closing_data_cell(ws4.cell(row4, 1), sr["name"],    bold=True, color=_C_BLACK, align='left', bg=bg)
        _closing_data_cell(ws4.cell(row4, 2), sr["po_amt"],  fmt=_MF, bg=bg)
        _closing_data_cell(ws4.cell(row4, 3), sr["out_amt"], fmt=_MF, color=_C_TEAL, bg=bg)
        _closing_data_cell(ws4.cell(row4, 4), sr["total"],   fmt=_MF, bold=True, color=_C_BLUE, bg=bg)
        _closing_data_cell(ws4.cell(row4, 5), share,         fmt=_PF, bold=True, color=_C_AMBER, bg=bg)
        _closing_data_cell(ws4.cell(row4, 6), None, bg=bg)

    # 비중 합계
    gt_row = cv_end_row + 2 + len(share_rows)
    ws4.row_dimensions[gt_row].height = 22
    for ci, (val, fmt, bold, color) in enumerate([
        ("합  계", None, True, _C_WHITE),
        (sum(s["po_amt"] for s in share_rows),  _MF, True, _C_WHITE),
        (sum(s["out_amt"] for s in share_rows), _MF, True, _C_WHITE),
        (grand_total, _MF, True, _C_AMBER),
        (1.0, _PF, True, _C_GREEN),
        (None, None, False, _C_WHITE),
    ], 1):
        c = ws4.cell(gt_row, ci)
        _closing_data_cell(c, val, fmt=fmt, bold=bold, color=color, align='right' if ci > 1 else 'center', bg=_C_DKGRAY)

    ws4.column_dimensions['A'].width = 18
    for ci in range(2, NC4 + 1):
        ws4.column_dimensions[get_column_letter(ci)].width = 16
    ws4.freeze_panes = 'A7'

    # ── 업체별 상세 시트 (발주기반 외주처 각각) ──
    NCP = 13  # 컬럼 수
    # 업체별 po_lines 그룹
    from itertools import groupby
    po_lines_sorted = sorted(po_lines, key=lambda x: (x["partner_name"], x["po_no"], x["part_no"]))
    partner_line_map: dict[str, list] = {}
    for ln in po_lines_sorted:
        partner_line_map.setdefault(ln["partner_name"], []).append(ln)

    for pname, lines in partner_line_map.items():
        safe_name = pname[:28]  # 시트 이름 31자 제한
        wsp = wb.create_sheet(safe_name)

        _closing_page_title(wsp, NCP, year, month,
            f"  {pname}  발주 상세 현황  |  {len(lines)}건  |  기준일 {year}.{month:02d}.{last_day.day:02d}")

        hp = ["발주번호", "품번", "품명", "납기일", "상태",
              "발주수량", "입고수량", "달성률", "이월수량", "이월금액",
              "반품수량", "반품금액", "실입고금액"]
        _closing_col_header(wsp, 5, hp)

        tot_oq = tot_rq = tot_co_q = tot_co_a = tot_rtn_q = tot_rtn_a = tot_net = 0
        for i, ln in enumerate(lines):
            r = i + 6
            bg = _C_SNOW if i % 2 == 0 else _C_WHITE
            is_co  = ln.get("carryover_qty", 0) > 0
            is_rtn = ln.get("receipt_return_qty", 0) > 0
            is_over = ln.get("over_qty", 0) > 0
            if is_over:   row_clr = _C_RED
            elif is_co:   row_clr = _C_AMBER
            elif is_rtn:  row_clr = _C_RED
            else:          row_clr = _C_BLACK
            ach = ln["achieve"]
            ach_color = _C_GREEN if ach >= 1.0 else (_C_AMBER if ach >= 0.8 else _C_RED)
            wsp.row_dimensions[r].height = 17

            _closing_data_cell(wsp.cell(r,  1), ln["po_no"],                 color=_C_LGRAY, align='left', bg=bg)
            _closing_data_cell(wsp.cell(r,  2), ln["part_no"],               color=_C_LGRAY, align='left', bg=bg)
            _closing_data_cell(wsp.cell(r,  3), ln["part_name"],             color=_C_BLACK, align='left', bg=bg)
            _closing_data_cell(wsp.cell(r,  4), ln["due_date"],              color=_C_LGRAY, align='center', bg=bg)
            status_c = _C_GREEN if '완료' in ln["status"] else (_C_AMBER if '일부' in ln["status"] else _C_BLACK)
            _closing_data_cell(wsp.cell(r,  5), ln["status"],                bold=True, color=status_c, align='center', bg=bg)
            _closing_data_cell(wsp.cell(r,  6), ln["order_qty"],             fmt=_MF, bg=bg)
            _closing_data_cell(wsp.cell(r,  7), ln["received_qty"],          fmt=_MF, bg=bg)
            _closing_data_cell(wsp.cell(r,  8), ach, fmt=_PF, bold=True, color=ach_color, bg=bg)
            _closing_data_cell(wsp.cell(r,  9), ln.get("carryover_qty", 0), fmt=_MF,
                               bold=is_co, color=_C_AMBER if is_co else _C_BLACK, bg=bg)
            _closing_data_cell(wsp.cell(r, 10), ln.get("carryover_amt", 0), fmt=_MF,
                               bold=is_co, color=_C_AMBER if is_co else _C_BLACK, bg=bg)
            _closing_data_cell(wsp.cell(r, 11), ln.get("receipt_return_qty", 0), fmt=_MF,
                               bold=is_rtn, color=_C_RED if is_rtn else _C_BLACK, bg=bg)
            _closing_data_cell(wsp.cell(r, 12), ln.get("receipt_return_amt", 0), fmt=_MF,
                               bold=is_rtn, color=_C_RED if is_rtn else _C_BLACK, bg=bg)
            _closing_data_cell(wsp.cell(r, 13), ln.get("net_received_amt", ln["received_amt"]), fmt=_MF,
                               bold=True, color=_C_BLUE, bg=bg)

            tot_oq    += ln["order_qty"]
            tot_rq    += ln["received_qty"]
            tot_co_q  += ln.get("carryover_qty", 0)
            tot_co_a  += ln.get("carryover_amt", 0)
            tot_rtn_q += ln.get("receipt_return_qty", 0)
            tot_rtn_a += ln.get("receipt_return_amt", 0)
            tot_net   += ln.get("net_received_amt", ln["received_amt"])

        # 합계행
        tot_r = len(lines) + 6
        wsp.row_dimensions[tot_r].height = 22
        tot_ach = tot_rq / tot_oq if tot_oq else 0
        for ci, (val, fmt, bold, color) in enumerate([
            ("합  계",  None, True, _C_WHITE),
            ("",        None, True, _C_WHITE),
            ("",        None, True, _C_WHITE),
            ("",        None, True, _C_WHITE),
            ("",        None, True, _C_WHITE),
            (tot_oq,   _MF,  True, _C_WHITE),
            (tot_rq,   _MF,  True, _C_WHITE),
            (tot_ach,  _PF,  True, _C_AMBER),
            (tot_co_q, _MF,  True, _C_AMBER if tot_co_q > 0 else _C_WHITE),
            (tot_co_a, _MF,  True, _C_AMBER if tot_co_a > 0 else _C_WHITE),
            (tot_rtn_q,_MF,  True, _C_RED   if tot_rtn_q > 0 else _C_WHITE),
            (tot_rtn_a,_MF,  True, _C_RED   if tot_rtn_a > 0 else _C_WHITE),
            (tot_net,  _MF,  True, _C_BLUE),
        ], 1):
            _closing_data_cell(wsp.cell(tot_r, ci), val, fmt=fmt, bold=bold, color=color,
                               align='right' if ci > 1 else 'center', bg=_C_DKGRAY)

        wsp.column_dimensions['A'].width = 20
        wsp.column_dimensions['B'].width = 15
        wsp.column_dimensions['C'].width = 24
        wsp.column_dimensions['D'].width = 11
        wsp.column_dimensions['E'].width = 9
        for ci in range(6, NCP + 1):
            wsp.column_dimensions[get_column_letter(ci)].width = 13
        wsp.freeze_panes = 'A6'

    # ── 출력 ──
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"외주월마감_{year}{month:02d}.xlsx"
    headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}",
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    return StreamingResponse(buf, headers=headers)
