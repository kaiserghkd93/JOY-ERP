"""외주처 포털 — 업체가 접속해서 발주 확인 + 납품명세서 발행"""
from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.auth import User
from app.models.purchase import PurchaseOrder, POStatus, Receipt, ReceiptStatus
from app.models.master import Partner, Item
from app.models.ledger import LedgerType
from app.models.quality import NonConformance, NcrAppeal, AppealStatus
from app.models.production import Mold
from app.routers.auth import get_current_user, require_admin
from app.services.doc_no import next_doc_no
from app.services.ledger_service import post_ledger

router = APIRouter(prefix="/portal", tags=["외주처 포털"])


def _supplier_partner(user: User, allow_admin: bool = False) -> str:
    """로그인한 업체 계정의 partner_id 반환. allow_admin=True면 admin에게도 허용."""
    if not user.partner_id:
        if allow_admin:
            return ""
        raise HTTPException(403, "연결된 협력사가 없습니다. 관리자에게 문의하세요.")
    return user.partner_id


# ── 내 발주 목록 (잔량 > 0인 미납 건) ──────────────────────────
@router.get("/orders")
def my_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.partner_id:
        return []  # admin/owner는 빈 목록 반환 (관리자 포탈 사용)
    partner_id = user.partner_id
    from datetime import date as date_cls
    cutoff = date_cls(2026, 10, 1)
    orders = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.partner_id == partner_id,
            PurchaseOrder.status.in_([POStatus.open, POStatus.partial]),
            PurchaseOrder.due_date >= cutoff,
            PurchaseOrder.po_type == "outsource",
        )
        .order_by(PurchaseOrder.due_date)
        .all()
    )
    result = []
    for po in orders:
        item = db.get(Item, po.part_no)
        delivered = sum(
            r.qty for r in po.receipts
            if r.status == ReceiptStatus.confirmed
        )
        remaining = po.qty - delivered
        if remaining <= 0:  # 실납품 완료 → 납품완료 탭으로
            continue
        result.append({
            "po_no": po.po_no,
            "part_no": po.part_no,
            "item_name": item.name if item else po.part_no,
            "item_unit": item.unit if item else "EA",
            "qty": po.qty,
            "delivered_qty": delivered,
            "remaining_qty": remaining,
            "unit_price": float(po.unit_price or 0),
            "order_date": str(po.order_date),
            "due_date": str(po.due_date),
            "status": po.status,
            "note": po.note,
        })
    return result


# ── 납품 완료 발주 목록 (잔량 = 0 or closed) + 직접입고 ─────────
@router.get("/orders/completed")
def my_completed_orders(
    year: int | None = None,
    month: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from sqlalchemy import extract as sa_extract
    if not user.partner_id:
        return []
    partner_id = user.partner_id
    result = []

    # 1) PO 기반 완료 건
    q_po = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.partner_id == partner_id,
            PurchaseOrder.po_type == "outsource",
        )
    )
    if year:
        q_po = q_po.filter(sa_extract("year", PurchaseOrder.due_date) == year)
    if month:
        q_po = q_po.filter(sa_extract("month", PurchaseOrder.due_date) == month)
    for po in q_po.order_by(PurchaseOrder.due_date.desc()).all():
        item = db.get(Item, po.part_no)
        delivered = sum(r.qty for r in po.receipts if r.status == ReceiptStatus.confirmed)
        remaining = po.qty - delivered
        if po.status != POStatus.closed and remaining > 0:
            continue
        result.append({
            "po_no": po.po_no,
            "part_no": po.part_no,
            "item_name": item.name if item else po.part_no,
            "item_unit": item.unit if item else "EA",
            "qty": po.qty,
            "delivered_qty": delivered,
            "remaining_qty": remaining,
            "unit_price": float(po.unit_price or 0),
            "order_date": str(po.order_date),
            "due_date": str(po.due_date),
            "status": po.status,
            "is_direct": False,
        })

    # 2) 직접입고 (po_no 없는 confirmed 입고) — part_no별 net qty 집계, 역분개 상쇄
    from sqlalchemy import func as sa_func
    dr_q = (
        db.query(
            Receipt.part_no,
            sa_func.sum(Receipt.qty).label("net_qty"),
            sa_func.max(Receipt.receipt_date).label("last_date"),
        )
        .filter(
            Receipt.partner_id == partner_id,
            Receipt.po_no.is_(None),
            Receipt.status == ReceiptStatus.confirmed,
        )
    )
    if year:
        dr_q = dr_q.filter(sa_extract("year", Receipt.receipt_date) == year)
    if month:
        dr_q = dr_q.filter(sa_extract("month", Receipt.receipt_date) == month)
    dr_rows = dr_q.group_by(Receipt.part_no).having(sa_func.sum(Receipt.qty) > 0).all()
    for row in dr_rows:
        item = db.get(Item, row.part_no)
        net_qty = int(row.net_qty)
        # 대표 단가: 양수 입고 중 가장 최근 단가
        last_r = (
            db.query(Receipt)
            .filter(
                Receipt.partner_id == partner_id,
                Receipt.po_no.is_(None),
                Receipt.part_no == row.part_no,
                Receipt.qty > 0,
                Receipt.status == ReceiptStatus.confirmed,
            )
            .order_by(Receipt.receipt_date.desc())
            .first()
        )
        unit_price = float(last_r.unit_price or 0) if last_r else 0
        result.append({
            "po_no": None,
            "gr_no": last_r.gr_no if last_r else f"DR-{row.part_no}",
            "part_no": row.part_no,
            "item_name": item.name if item else row.part_no,
            "item_unit": item.unit if item else "EA",
            "qty": net_qty,
            "delivered_qty": net_qty,
            "remaining_qty": 0,
            "unit_price": unit_price,
            "order_date": str(row.last_date),
            "due_date": str(row.last_date),
            "status": "confirmed",
            "is_direct": True,
            "note": "직접입고",
        })

    result.sort(key=lambda x: x["due_date"], reverse=True)
    return result


# ── 내 업체 품목 목록 (발주 기준, 발주목록 자동완성용) ───────────
@router.get("/my-items")
def my_items(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.partner_id:
        return []
    partner_id = user.partner_id
    pos = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.partner_id == partner_id)
        .all()
    )
    seen = {}
    for po in pos:
        if po.part_no not in seen:
            item = db.get(Item, po.part_no)
            seen[po.part_no] = {
                "part_no": po.part_no,
                "item_name": item.name if item else po.part_no,
                "item_unit": item.unit if item else "EA",
                "unit_price": float(po.unit_price or 0),
            }
        else:
            if po.unit_price:
                seen[po.part_no]["unit_price"] = float(po.unit_price)
    return sorted(seen.values(), key=lambda x: x["item_name"])


# ── 전체 기준정보 품목 목록 (수동 추가 자동완성용) ───────────────
@router.get("/all-items")
def all_items(
    partner_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 관리자는 partner_id 쿼리 파라미터로 특정 업체 단가 기준 조회 가능
    effective_partner = partner_id if (not user.partner_id) else user.partner_id
    items = db.query(Item).order_by(Item.name).all()
    price_map: dict = {}
    if effective_partner:
        pos = db.query(PurchaseOrder).filter(PurchaseOrder.partner_id == effective_partner).all()
        for po in pos:
            if po.unit_price:
                price_map[po.part_no] = float(po.unit_price)
    partner_parts = set(price_map.keys())
    return sorted(
        [
            {
                "part_no": it.part_no,
                "item_name": it.name,
                "item_unit": it.unit or "EA",
                "unit_price": price_map.get(it.part_no) or float(it.std_buy_price or 0),
            }
            for it in items
        ],
        key=lambda x: (0 if x["part_no"] in partner_parts else 1, x["item_name"])
    )


# ── 납품명세서 발행 ──────────────────────────────────────────────
class DeliveryLineReq(BaseModel):
    po_no: str | None = None       # 발주 연결 납품
    item_name: str | None = None   # 발주 없는 직접 추가 품목명
    part_no: str | None = None
    item_unit: str | None = "EA"
    qty: int
    unit_price: float | None = None

class DeliveryReq(BaseModel):
    delivery_date: date_type
    lines: list[DeliveryLineReq]
    note: str | None = None


@router.post("/deliver")
def deliver(body: DeliveryReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    partner_id = _supplier_partner(user)
    if not body.lines:
        raise HTTPException(400, "납품 품목을 입력해주세요")

    created = []
    for line in body.lines:
        if line.qty <= 0:
            raise HTTPException(400, "납품 수량은 0보다 커야 합니다")

        if line.po_no:
            # 발주 연결 납품
            po = db.get(PurchaseOrder, line.po_no)
            if not po:
                raise HTTPException(404, f"발주번호 {line.po_no}를 찾을 수 없습니다")
            if po.partner_id != partner_id:
                raise HTTPException(403, f"접근 권한이 없는 발주번호입니다: {line.po_no}")
            if po.status not in [POStatus.open, POStatus.partial]:
                raise HTTPException(400, f"{line.po_no}는 이미 완료되었거나 취소된 발주입니다")
            actual_part_no = po.part_no
            unit_price = line.unit_price if line.unit_price else float(po.unit_price or 0)
        else:
            # 발주 없는 직접 추가 품목
            if not line.item_name:
                raise HTTPException(400, "발주 없는 품목은 품목명을 입력해주세요")
            actual_part_no = line.part_no or "MANUAL"
            unit_price = line.unit_price or 0
            po = None

        gr_no = next_doc_no(db, "GR", "receipt", "gr_no")
        lot_no = gr_no.replace("GR-", "LOT-")  # LOT-YYYYMMDD-NNN 자동채번
        note_text = f"업체포털 납품{' [직접추가]' if not line.po_no else ''} {body.note or ''}".strip()
        # 포털 납품 → pending(검사대기) 상태로 생성, 품질팀 컨펌 후 confirmed + 재고 반영
        receipt = Receipt(
            gr_no=gr_no,
            po_no=line.po_no,
            part_no=actual_part_no,
            qty=line.qty,
            delivered_qty=line.qty,   # 거래명세표 기준 납품수량 자동 기록
            receipt_date=body.delivery_date,
            unit_price=unit_price,
            lot_no=lot_no,
            status=ReceiptStatus.pending,
            partner_id=partner_id,
            note=note_text,
        )
        db.add(receipt)
        db.flush()

        # ── 수입검사 레코드 자동 생성 (검사대기 상태) ──────────────────
        from app.models.quality import Inspection, InspectionResult, DisposalType, ApprovalStatus
        existing_insp = db.query(Inspection).filter(Inspection.gr_no == gr_no).first()
        if not existing_insp:
            auto_insp = Inspection(
                gr_no=gr_no,
                inspect_date=body.delivery_date,
                inspect_qty=line.qty,
                pass_qty=0,
                fail_qty=0,
                result=InspectionResult.pending_insp,
                disposal=DisposalType.pending,
                defect_note="포털 납품 자동 생성 — 수입검사 결과 입력 필요",
                approval_status=ApprovalStatus.draft,
            )
            db.add(auto_insp)

        item_obj = db.get(Item, actual_part_no)
        created.append({
            "gr_no": gr_no,
            "lot_no": lot_no,
            "po_no": line.po_no,
            "part_no": actual_part_no,
            "item_name": item_obj.name if item_obj else (line.item_name or actual_part_no),
            "item_unit": item_obj.unit if item_obj else "EA",
            "qty": line.qty,
            "unit_price": unit_price,
            "amount": line.qty * unit_price,
            "receipt_date": str(body.delivery_date),
        })

    db.commit()
    return {"ok": True, "receipts": created}


# ── QR 스캔용 명세서 공개 조회 (인증 불필요) ───────────────────────
@router.get("/receipt/{gr_no}")
def get_receipt_public(gr_no: str, db: Session = Depends(get_db)):
    """QR 코드 스캔 후 명세서 JSON 조회 — 로그인 없이 접근 가능"""
    receipt = db.get(Receipt, gr_no)
    if not receipt:
        raise HTTPException(404, f"입고 기록 없음: {gr_no}")
    item = db.get(Item, receipt.part_no)
    partner = db.get(Partner, receipt.partner_id) if receipt.partner_id else None
    status_label = {
        "pending": "검사대기", "confirmed": "입고확정", "cancelled": "취소"
    }.get(str(receipt.status).replace("ReceiptStatus.", ""), str(receipt.status))
    return {
        "gr_no": receipt.gr_no,
        "lot_no": receipt.lot_no,
        "po_no": receipt.po_no,
        "part_no": receipt.part_no,
        "part_name": item.name if item else receipt.part_no,
        "item_unit": item.unit if item else "EA",
        "qty": receipt.qty,
        "unit_price": float(receipt.unit_price or 0),
        "amount": receipt.qty * float(receipt.unit_price or 0),
        "receipt_date": str(receipt.receipt_date),
        "status": status_label,
        "partner": partner.name if partner else "—",
        "note": receipt.note,
    }


@router.get("/receipt/{gr_no}/view", response_class=None)
def view_receipt_mobile(gr_no: str, db: Session = Depends(get_db)):
    """QR 스캔 → 폰 브라우저에서 열리는 모바일 명세서 페이지 (로그인 불필요)"""
    from fastapi.responses import HTMLResponse
    receipt = db.get(Receipt, gr_no)
    if not receipt:
        html = f"""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>조회 오류</title>
        <style>body{{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc}}
        .box{{text-align:center;padding:32px;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08)}}
        h2{{color:#dc2626;margin:0 0 8px}}p{{color:#64748b;margin:0}}</style></head>
        <body><div class="box"><h2>❌ 조회 실패</h2><p>{gr_no} 입고 기록을 찾을 수 없습니다</p></div></body></html>"""
        return HTMLResponse(content=html, status_code=404)

    item = db.get(Item, receipt.part_no)
    partner = db.get(Partner, receipt.partner_id) if receipt.partner_id else None
    part_name = item.name if item else receipt.part_no
    item_unit = item.unit if item else "EA"
    partner_name = partner.name if partner else "—"
    amount = receipt.qty * float(receipt.unit_price or 0)
    status_map = {"pending": ("검사대기", "#f59e0b", "#fef3c7"),
                  "confirmed": ("입고확정", "#16a34a", "#dcfce7"),
                  "cancelled": ("취소", "#dc2626", "#fee2e2")}
    raw_status = str(receipt.status).replace("ReceiptStatus.", "")
    s_label, s_color, s_bg = status_map.get(raw_status, (raw_status, "#64748b", "#f1f5f9"))

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>납품명세서 {gr_no}</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:'Malgun Gothic',Apple SD Gothic Neo,sans-serif;background:#f0f4f8;min-height:100vh;padding:0 0 32px}}
    .header{{background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;padding:20px 16px 16px;text-align:center}}
    .header h1{{font-size:17px;font-weight:800;margin-bottom:4px}}
    .header p{{font-size:12px;opacity:.8}}
    .card{{background:#fff;margin:12px;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}}
    .card-title{{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;padding:12px 14px 6px;border-bottom:1px solid #f1f5f9}}
    .row{{display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid #f8fafc}}
    .row:last-child{{border-bottom:none}}
    .row label{{font-size:12px;color:#64748b}}
    .row value,.row-val{{font-size:13px;font-weight:600;color:#1e293b;text-align:right}}
    .badge{{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:{s_bg};color:{s_color}}}
    .gr-box{{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin:12px;padding:12px 14px}}
    .gr-label{{font-size:11px;color:#3b82f6;font-weight:600;margin-bottom:2px}}
    .gr-no{{font-size:19px;font-weight:800;font-family:monospace;color:#1d4ed8;letter-spacing:1px}}
    .lot-box{{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin:0 12px 12px;padding:10px 14px}}
    .lot-label{{font-size:11px;color:#d97706;font-weight:600;margin-bottom:2px}}
    .lot-no{{font-size:15px;font-weight:700;font-family:monospace;color:#92400e}}
    .amount{{font-size:18px;font-weight:800;color:#1d4ed8}}
    .footer{{text-align:center;padding:16px;font-size:11px;color:#94a3b8;line-height:1.6}}
  </style>
</head>
<body>
  <div class="header">
    <h1>📄 납품 명세서</h1>
    <p>조이산업 — QR 스캔 조회</p>
  </div>

  <div class="gr-box">
    <div class="gr-label">입고번호</div>
    <div class="gr-no">{receipt.gr_no}</div>
  </div>
  <div class="lot-box">
    <div class="lot-label">LOT 번호 (역추적 코드)</div>
    <div class="lot-no">{receipt.lot_no or '—'}</div>
  </div>

  <div class="card">
    <div class="card-title">납품 정보</div>
    <div class="row"><label>협력사</label><span class="row-val">{partner_name}</span></div>
    <div class="row"><label>납품일</label><span class="row-val">{receipt.receipt_date}</span></div>
    <div class="row"><label>발주번호</label><span class="row-val">{receipt.po_no or '—'}</span></div>
    <div class="row"><label>상태</label><span class="badge">{s_label}</span></div>
  </div>

  <div class="card">
    <div class="card-title">품목 정보</div>
    <div class="row"><label>품번</label><span class="row-val" style="font-family:monospace;font-size:12px">{receipt.part_no}</span></div>
    <div class="row"><label>품명</label><span class="row-val">{part_name}</span></div>
    <div class="row"><label>납품 수량</label><span class="row-val">{receipt.qty:,} {item_unit}</span></div>
    <div class="row"><label>단가</label><span class="row-val">₩{float(receipt.unit_price or 0):,.0f}</span></div>
    <div class="row"><label>금액</label><span class="amount">₩{amount:,.0f}</span></div>
  </div>

  {"" if not receipt.note else f'<div class="card"><div class="card-title">비고</div><div class="row"><span style="font-size:12px;color:#475569">{receipt.note}</span></div></div>'}

  <div class="footer">
    본 명세서는 조이산업 ERP 시스템에서 자동 발행되었습니다.<br>
    수입검사 완료 후 입고 처리됩니다.
  </div>
</body>
</html>"""
    return HTMLResponse(content=html)


# ── 월별 납품 집계 ───────────────────────────────────────────────
@router.get("/monthly-summary")
def monthly_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from sqlalchemy import func, extract
    if not user.partner_id:
        return []
    partner_id = user.partner_id
    receipts = (
        db.query(Receipt)
        .filter(Receipt.partner_id == partner_id, Receipt.status == ReceiptStatus.confirmed)
        .order_by(Receipt.receipt_date)
        .all()
    )
    # 월별 집계
    monthly: dict = {}
    for r in receipts:
        ym = str(r.receipt_date)[:7]  # YYYY-MM
        if ym not in monthly:
            monthly[ym] = {"month": ym, "count": 0, "total_qty": 0, "total_amount": 0, "items": {}}
        m = monthly[ym]
        m["count"] += 1
        m["total_qty"] += r.qty
        m["total_amount"] += r.qty * float(r.unit_price)
        item = db.get(Item, r.part_no)
        iname = item.name if item else (r.note or r.part_no)
        if iname not in m["items"]:
            m["items"][iname] = {"qty": 0, "amount": 0}
        m["items"][iname]["qty"] += r.qty
        m["items"][iname]["amount"] += r.qty * float(r.unit_price)

    result = []
    for ym in sorted((k for k in monthly.keys() if k >= "2026-10"), reverse=True):
        m = monthly[ym]
        result.append({
            "month": ym,
            "count": m["count"],
            "total_qty": m["total_qty"],
            "total_amount": m["total_amount"],
            "items": [
                {"item_name": k, "qty": v["qty"], "amount": v["amount"]}
                for k, v in sorted(m["items"].items())
            ],
        })
    return result


# ── 내 납품 이력 ────────────────────────────────────────────────
@router.get("/history")
def my_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.partner_id:
        return []
    partner_id = user.partner_id
    receipts = (
        db.query(Receipt)
        .filter(Receipt.partner_id == partner_id)
        .order_by(Receipt.receipt_date.desc(), Receipt.gr_no.desc())
        .limit(200)
        .all()
    )
    result = []
    for r in receipts:
        item = db.get(Item, r.part_no)
        result.append({
            "gr_no": r.gr_no,
            "po_no": r.po_no,
            "part_no": r.part_no,
            "item_name": item.name if item else r.part_no,
            "qty": r.qty,
            "unit_price": float(r.unit_price),
            "amount": r.qty * float(r.unit_price),
            "receipt_date": str(r.receipt_date),
            "status": r.status,
            "note": r.note,
        })
    return result


# ── 부적합 통보 (포털용) ────────────────────────────────────────────

@router.get("/ncr")
def my_ncr(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """내 업체에 발송된 부적합 통보 목록"""
    if not user.partner_id:
        return []
    partner_id = user.partner_id
    ncrs = (
        db.query(NonConformance)
        .filter(NonConformance.partner_id == partner_id)
        .order_by(NonConformance.created_at.desc())
        .limit(100)
        .all()
    )
    result = []
    for n in ncrs:
        item = db.get(Item, n.part_no)
        result.append({
            "ncr_no": n.ncr_no,
            "part_no": n.part_no,
            "item_name": item.name if item else n.part_no,
            "occur_type": n.occur_type,
            "defect_type": n.defect_type,
            "defect_qty": n.defect_qty,
            "disposal": n.disposal,
            "status": n.status,
            "notified_at": str(n.notified_at)[:16] if n.notified_at else None,
            "created_at": str(n.created_at)[:10],
            "appeal_count": len(n.appeals),
            "latest_appeal_status": n.appeals[-1].status if n.appeals else None,
        })
    return result


class PortalAppealBody(BaseModel):
    appeal_reason: str
    evidence_text: str | None = None


@router.post("/ncr/{ncr_no}/appeal")
def portal_appeal(ncr_no: str, body: PortalAppealBody,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """포털에서 이의신청 등록"""
    partner_id = _supplier_partner(user)
    ncr = db.get(NonConformance, ncr_no)
    if not ncr:
        raise HTTPException(404, "부적합통보를 찾을 수 없습니다")
    if ncr.partner_id != partner_id:
        raise HTTPException(403, "본인 업체의 부적합통보에만 이의신청 가능합니다")
    appeal = NcrAppeal(
        ncr_no=ncr_no,
        partner_id=partner_id,
        appeal_reason=body.appeal_reason,
        evidence_text=body.evidence_text,
        status=AppealStatus.submitted,
    )
    db.add(appeal)
    db.commit()
    db.refresh(appeal)
    return {"ok": True, "appeal_id": appeal.id, "status": appeal.status}


# ── 대여 금형 목록 ───────────────────────────────────────────────
@router.get("/my-molds")
def my_molds(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.partner_id:
        return []
    partner_id = user.partner_id
    molds = (
        db.query(Mold)
        .filter(Mold.lent_to_partner_id == partner_id)
        .all()
    )
    result = []
    for m in molds:
        item = db.get(Item, m.part_no) if m.part_no else None
        result.append({
            "mold_no": m.mold_no,
            "owner": m.owner,
            "part_no": m.part_no,
            "part_name": item.name if item else m.part_no,
            "lent_date": str(m.lent_date) if m.lent_date else None,
            "total_shots": m.total_shots,
            "status": m.status,
        })
    return result


class MoldRegisterReq(BaseModel):
    mold_no: str
    lent_date: date_type


@router.post("/my-molds/register")
def register_mold(body: MoldRegisterReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """협력사가 직접 대여 금형을 등록 — 해당 금형번호가 시스템에 없으면 자동 생성"""
    partner_id = _supplier_partner(user)
    mold = db.get(Mold, body.mold_no)
    if mold is None:
        mold = Mold(mold_no=body.mold_no, owner="JOY INDUSTRY")
        db.add(mold)
    elif mold.lent_to_partner_id and mold.lent_to_partner_id != partner_id:
        raise HTTPException(400, "이미 다른 협력사에 대여 중인 금형번호입니다.")
    mold.lent_to_partner_id = partner_id
    mold.lent_date = body.lent_date
    db.commit()
    return {"ok": True, "mold_no": mold.mold_no}


class DeliveryAckBody(BaseModel):
    ack_status: str           # 'possible' | 'impossible' | 'partial'
    ack_date: date_type | None = None
    ack_note: str | None = None


@router.post("/orders/{po_no}/ack")
def ack_order(po_no: str, body: DeliveryAckBody,
              user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """협력사 납기 회신 (발주번호별)"""
    partner_id = _supplier_partner(user)
    po = db.get(PurchaseOrder, po_no)
    if not po:
        raise HTTPException(404, f"발주번호 없음: {po_no}")
    if po.partner_id != partner_id:
        raise HTTPException(403, "본인 업체 발주만 회신 가능합니다")
    label = {'possible': '납기가능', 'impossible': '납기불가', 'partial': '부분납기'}.get(body.ack_status, body.ack_status)
    ack_text = f"[협력사회신] {label}"
    if body.ack_date:
        ack_text += f" / 예정일:{body.ack_date}"
    if body.ack_note:
        ack_text += f" / {body.ack_note}"
    # 기존 회신 덮어쓰기 — note 필드에 태그 방식으로 보존
    existing = po.note or ""
    # 이전 [협력사회신] 태그 제거
    import re
    existing = re.sub(r'\[협력사회신\][^\n]*', '', existing).strip()
    po.note = f"{ack_text}\n{existing}".strip() if existing else ack_text
    db.commit()
    return {
        "ok": True, "po_no": po_no,
        "ack_status": body.ack_status, "ack_date": str(body.ack_date) if body.ack_date else None,
        "note": po.note,
    }


@router.delete("/my-molds/{mold_no}")
def return_mold(mold_no: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """협력사가 금형 반납 처리"""
    partner_id = _supplier_partner(user)
    mold = db.get(Mold, mold_no)
    if not mold or mold.lent_to_partner_id != partner_id:
        raise HTTPException(404, "해당 금형을 찾을 수 없습니다.")
    mold.lent_to_partner_id = None
    mold.lent_date = None
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════
# 관리자 전용 — 모든 협력사 통합 관리
# ══════════════════════════════════════════════════════════════════

@router.get("/admin/partners")
def admin_partners(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """모든 외주 협력사 현황 요약 (관리자 전용)"""
    from sqlalchemy import func
    partners = db.query(Partner).filter(
        Partner.partner_type.in_(["supplier", "both"])
    ).all()
    item_map = {i.part_no: i for i in db.query(Item).all()}

    result = []
    for p in partners:
        # 미납 발주
        open_pos = db.query(PurchaseOrder).filter(
            PurchaseOrder.partner_id == p.partner_id,
            PurchaseOrder.status.in_([POStatus.open, POStatus.partial]),
            PurchaseOrder.po_type == "outsource",
        ).all()
        pending_po_count = len(open_pos)
        pending_po_qty = sum(
            po.qty - sum(r.qty for r in po.receipts if r.status == ReceiptStatus.confirmed)
            for po in open_pos
        )

        # 최근 30일 납품
        from datetime import date as date_cls, timedelta
        cutoff = date_cls.today() - timedelta(days=30)
        recent_receipts = db.query(Receipt).filter(
            Receipt.partner_id == p.partner_id,
            Receipt.receipt_date >= cutoff,
        ).all()
        pending_receipts = [r for r in recent_receipts if str(r.status).endswith("pending")]
        confirmed_receipts = [r for r in recent_receipts if str(r.status).endswith("confirmed")]

        result.append({
            "partner_id": p.partner_id,
            "partner_name": p.name,
            "pending_po_count": pending_po_count,
            "pending_po_qty": pending_po_qty,
            "recent_receipt_count": len(recent_receipts),
            "pending_receipt_count": len(pending_receipts),
            "confirmed_receipt_count": len(confirmed_receipts),
        })

    result.sort(key=lambda x: (-x["pending_po_count"], x["partner_name"]))
    return result


@router.get("/admin/orders")
def admin_all_orders(
    partner_id: str | None = None,
    status: str | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """모든 협력사 발주 목록 (관리자 전용)"""
    from datetime import date as date_cls
    cutoff = date_cls(2026, 10, 1)
    q = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_type == "outsource",
        PurchaseOrder.due_date >= cutoff,
    )
    if partner_id:
        q = q.filter(PurchaseOrder.partner_id == partner_id)
    if status:
        q = q.filter(PurchaseOrder.status == status)
    orders = q.order_by(PurchaseOrder.due_date).limit(500).all()

    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}
    item_map = {i.part_no: i for i in db.query(Item).all()}

    result = []
    for po in orders:
        item = item_map.get(po.part_no)
        confirmed_qty = sum(r.qty for r in po.receipts if str(r.status).endswith("confirmed"))
        remaining = po.qty - confirmed_qty
        result.append({
            "po_no": po.po_no,
            "partner_id": po.partner_id,
            "partner_name": partner_map.get(po.partner_id, po.partner_id or "—"),
            "part_no": po.part_no,
            "item_name": item.name if item else po.part_no,
            "item_unit": item.unit if item else "EA",
            "qty": po.qty,
            "confirmed_qty": confirmed_qty,
            "remaining_qty": remaining,
            "unit_price": float(po.unit_price or 0),
            "order_date": str(po.order_date),
            "due_date": str(po.due_date),
            "status": str(po.status),
            "note": po.note,
        })
    return result


@router.get("/admin/receipts")
def admin_all_receipts(
    partner_id: str | None = None,
    status: str | None = None,
    limit: int = 200,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """모든 협력사 납품 이력 (관리자 전용)"""
    q = db.query(Receipt).filter(Receipt.partner_id.isnot(None))
    if partner_id:
        q = q.filter(Receipt.partner_id == partner_id)
    if status:
        q = q.filter(Receipt.status == status)
    receipts = q.order_by(Receipt.receipt_date.desc(), Receipt.gr_no.desc()).limit(limit).all()

    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}
    item_map = {i.part_no: i for i in db.query(Item).all()}

    result = []
    for r in receipts:
        item = item_map.get(r.part_no)
        result.append({
            "gr_no": r.gr_no,
            "lot_no": r.lot_no,
            "po_no": r.po_no,
            "partner_id": r.partner_id,
            "partner_name": partner_map.get(r.partner_id, r.partner_id or "—"),
            "part_no": r.part_no,
            "item_name": item.name if item else r.part_no,
            "item_unit": item.unit if item else "EA",
            "qty": r.qty,
            "unit_price": float(r.unit_price or 0),
            "amount": r.qty * float(r.unit_price or 0),
            "receipt_date": str(r.receipt_date),
            "status": str(r.status).replace("ReceiptStatus.", ""),
            "note": r.note,
        })
    return result


class AdminDeliveryReq(BaseModel):
    partner_id: str
    delivery_date: date_type
    lines: list[DeliveryLineReq]
    note: str | None = None


@router.post("/admin/deliver")
def admin_deliver(body: AdminDeliveryReq, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """관리자가 협력사 대신 납품명세서 발행 (관리자 전용)"""
    partner = db.get(Partner, body.partner_id)
    if not partner:
        raise HTTPException(404, f"협력사 없음: {body.partner_id}")
    if not body.lines:
        raise HTTPException(400, "납품 품목을 입력해주세요")

    created = []
    for line in body.lines:
        if line.qty <= 0:
            raise HTTPException(400, "납품 수량은 0보다 커야 합니다")

        if line.po_no:
            po = db.get(PurchaseOrder, line.po_no)
            if not po:
                raise HTTPException(404, f"발주번호 {line.po_no}를 찾을 수 없습니다")
            if po.partner_id != body.partner_id:
                raise HTTPException(403, f"{line.po_no}는 해당 협력사의 발주가 아닙니다")
            actual_part_no = po.part_no
            unit_price = line.unit_price if line.unit_price else float(po.unit_price or 0)
        else:
            if not line.item_name:
                raise HTTPException(400, "발주 없는 품목은 품목명을 입력해주세요")
            actual_part_no = line.part_no or "MANUAL"
            unit_price = line.unit_price or 0
            po = None

        gr_no = next_doc_no(db, "GR", "receipt", "gr_no")
        lot_no = gr_no.replace("GR-", "LOT-")
        note_text = f"[관리자등록] {user.username} {body.note or ''}".strip()
        receipt = Receipt(
            gr_no=gr_no,
            po_no=line.po_no,
            part_no=actual_part_no,
            qty=line.qty,
            delivered_qty=line.qty,
            receipt_date=body.delivery_date,
            unit_price=unit_price,
            lot_no=lot_no,
            status=ReceiptStatus.pending,
            partner_id=body.partner_id,
            note=note_text,
        )
        db.add(receipt)
        db.flush()

        from app.models.quality import Inspection, InspectionResult, DisposalType, ApprovalStatus
        existing_insp = db.query(Inspection).filter(Inspection.gr_no == gr_no).first()
        if not existing_insp:
            auto_insp = Inspection(
                gr_no=gr_no,
                inspect_date=body.delivery_date,
                inspect_qty=line.qty,
                pass_qty=0, fail_qty=0,
                result=InspectionResult.pending_insp,
                disposal=DisposalType.pending,
                defect_note="관리자 등록 — 수입검사 결과 입력 필요",
                approval_status=ApprovalStatus.draft,
            )
            db.add(auto_insp)

        item_obj = db.get(Item, actual_part_no)
        created.append({
            "gr_no": gr_no,
            "lot_no": lot_no,
            "po_no": line.po_no,
            "part_no": actual_part_no,
            "item_name": item_obj.name if item_obj else (line.item_name or actual_part_no),
            "item_unit": item_obj.unit if item_obj else "EA",
            "qty": line.qty,
            "unit_price": unit_price,
            "amount": line.qty * unit_price,
            "receipt_date": str(body.delivery_date),
        })

    db.commit()
    return {"ok": True, "receipts": created}
