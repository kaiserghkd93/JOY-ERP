"""자재 직접구매 — 원자재/부자재 발주·입고 (외주포털 없이 내부 처리)"""
from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.auth import User
from app.models.purchase import PurchaseOrder, POStatus, Receipt, ReceiptStatus
from app.models.master import Partner, Item
from app.routers.auth import get_current_user
from app.services.doc_no import next_doc_no
from app.services.ledger_service import confirm_receipt as _confirm, get_stock, get_avg_price

router = APIRouter(prefix="/material", tags=["자재구매"])

MAT_ROLES = {"admin", "material", "manager", "executive", "manufacturing"}


def _require_mat(user: User = Depends(get_current_user)) -> User:
    if user.role not in MAT_ROLES:
        raise HTTPException(403, "자재구매 권한이 없습니다")
    return user


# ── 스키마 ────────────────────────────────────────────────────────
class MatPOCreateReq(BaseModel):
    partner_id: str
    lines: list[dict]        # [{part_no, qty, unit_price, due_date}]
    order_date: date_type
    note: str | None = None


class MatReceiptReq(BaseModel):
    po_no: str
    part_no: str
    qty: int
    unit_price: float
    receipt_date: date_type
    note: str | None = None


# ── 발주 목록 ──────────────────────────────────────────────────────
@router.get("/orders")
def list_mat_orders(
    partner_id: str | None = None,
    part_no: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mat),
):
    q = db.query(PurchaseOrder).filter(PurchaseOrder.po_type == "material")
    if partner_id:
        q = q.filter(PurchaseOrder.partner_id == partner_id)
    if part_no:
        q = q.filter(PurchaseOrder.part_no == part_no)
    if status:
        q = q.filter(PurchaseOrder.status == status)
    orders = q.order_by(PurchaseOrder.order_date.desc()).all()
    result = []
    for po in orders:
        item = db.get(Item, po.part_no)
        confirmed_qty = sum(r.qty for r in po.receipts if r.status == ReceiptStatus.confirmed)
        result.append({
            "po_no": po.po_no,
            "partner_id": po.partner_id,
            "partner_name": db.get(Partner, po.partner_id).name if db.get(Partner, po.partner_id) else po.partner_id,
            "part_no": po.part_no,
            "item_name": item.name if item else po.part_no,
            "item_unit": item.unit if item else "EA",
            "qty": po.qty,
            "confirmed_qty": confirmed_qty,
            "remaining_qty": po.qty - confirmed_qty,
            "unit_price": float(po.unit_price or 0),
            "order_date": str(po.order_date),
            "due_date": str(po.due_date),
            "status": po.status,
            "note": po.note,
        })
    return result


# ── 발주 생성 ──────────────────────────────────────────────────────
@router.post("/orders")
def create_mat_order(
    body: MatPOCreateReq,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mat),
):
    if not db.get(Partner, body.partner_id):
        raise HTTPException(404, f"거래처 없음: {body.partner_id}")
    created = []
    for line in body.lines:
        part_no = line.get("part_no")
        if not db.get(Item, part_no):
            raise HTTPException(404, f"품목 없음: {part_no}")
        qty = int(line.get("qty", 0))
        if qty <= 0:
            raise HTTPException(400, "수량은 0보다 커야 합니다")
        due_date = date_type.fromisoformat(str(line.get("due_date", body.order_date)))
        po_no = next_doc_no(db, "MPO", "purchase_order", "po_no")
        po = PurchaseOrder(
            po_no=po_no,
            partner_id=body.partner_id,
            part_no=part_no,
            qty=qty,
            unit_price=float(line.get("unit_price", 0) or 0),
            order_date=body.order_date,
            due_date=due_date,
            po_type="material",
            note=body.note,
        )
        db.add(po)
        db.flush()
        created.append(po_no)
    db.commit()
    return {"ok": True, "po_nos": created}


# ── 자재 입고 목록 ────────────────────────────────────────────────
@router.get("/receipts")
def list_mat_receipts(
    partner_id: str | None = None,
    part_no: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mat),
):
    mat_po_nos = {
        po.po_no for po in db.query(PurchaseOrder).filter(PurchaseOrder.po_type == "material").all()
    }
    q = db.query(Receipt).filter(Receipt.po_no.in_(mat_po_nos))
    if partner_id:
        q = q.filter(Receipt.partner_id == partner_id)
    if part_no:
        q = q.filter(Receipt.part_no == part_no)
    if status:
        q = q.filter(Receipt.status == status)
    receipts = q.order_by(Receipt.receipt_date.desc()).all()
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
            "partner_id": r.partner_id,
            "note": r.note,
        })
    return result


# ── 자재 입고 등록 (직접, pending 없이 바로 confirmed) ──────────────
@router.post("/receive")
def receive_material(
    body: MatReceiptReq,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mat),
):
    po = db.get(PurchaseOrder, body.po_no)
    if not po:
        raise HTTPException(404, f"발주 없음: {body.po_no}")
    if po.po_type != "material":
        raise HTTPException(400, "자재 발주가 아닙니다")
    if po.status not in [POStatus.open, POStatus.partial]:
        raise HTTPException(400, "이미 완료/취소된 발주입니다")
    if body.qty <= 0:
        raise HTTPException(400, "입고수량은 0보다 커야 합니다")

    gr_no = next_doc_no(db, "MGR", "receipt", "gr_no")
    receipt = Receipt(
        gr_no=gr_no,
        po_no=body.po_no,
        part_no=body.part_no,
        qty=body.qty,
        receipt_date=body.receipt_date,
        unit_price=body.unit_price,
        status=ReceiptStatus.pending,  # 품질검사 후 confirm (또는 즉시 confirm)
        partner_id=po.partner_id,
        note=body.note or "자재 직접입고",
    )
    db.add(receipt)
    db.flush()

    # 자재는 수입검사 생략 가능 → 즉시 확정
    _confirm(db, gr_no)
    _update_po_status(db, po)
    db.commit()
    return {"ok": True, "gr_no": gr_no, "status": "confirmed"}


def _update_po_status(db: Session, po: PurchaseOrder) -> None:
    from app.services.purchase_service import _update_po_status as _ups
    _ups(db, po)


# ── 자재 발주 취소 ────────────────────────────────────────────────
@router.delete("/orders/{po_no}")
def cancel_mat_order(
    po_no: str,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mat),
):
    """자재 발주 취소 (입고 이력 없는 발주만 가능)"""
    po = db.get(PurchaseOrder, po_no)
    if not po:
        raise HTTPException(404, f"발주 없음: {po_no}")
    if po.po_type != "material":
        raise HTTPException(400, "자재 발주가 아닙니다")
    if po.status == POStatus.closed:
        raise HTTPException(400, "완료된 발주는 취소할 수 없습니다")

    # 입고 이력 확인 — confirmed 입고가 있으면 취소 불가
    confirmed = [r for r in po.receipts if r.status == ReceiptStatus.confirmed]
    if confirmed:
        raise HTTPException(400, f"입고 이력({len(confirmed)}건)이 있어 취소할 수 없습니다. 재고를 먼저 조정하세요.")

    # 미확정 입고(pending)가 있으면 함께 삭제
    for r in list(po.receipts):
        if r.status == ReceiptStatus.pending:
            db.delete(r)
    db.flush()

    # 발주 자체 삭제
    db.delete(po)
    db.commit()
    return {"ok": True, "deleted": po_no}


# ── 자재 발주서 출력 (HTML — 브라우저 인쇄/PDF) ──────────────────
@router.get("/orders/{po_no}/print", response_class=HTMLResponse)
def print_mat_order(po_no: str, db: Session = Depends(get_db)):
    """자재 발주서 브라우저 프린트 / PDF 저장용 HTML"""
    po = db.get(PurchaseOrder, po_no)
    if not po or po.po_type != "material":
        raise HTTPException(404, f"자재 발주 없음: {po_no}")

    partner = db.get(Partner, po.partner_id)
    partner_name = partner.name if partner else po.partner_id
    item = db.get(Item, po.part_no)
    item_name = item.name if item else po.part_no
    item_unit = item.unit if item else "EA"
    unit_price = float(po.unit_price or 0)
    amount = int(po.qty * unit_price)
    vat = round(amount * 0.1)
    total_with_vat = amount + vat

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>자재발주서 {po_no}</title>
<style>
  @page {{ size: A4 portrait; margin: 12mm 16mm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; font-size: 9.5pt; color: #111; background: #e8e8e8; }}

  .print-btn {{
    position: fixed; top: 14px; right: 16px; z-index: 999;
    padding: 9px 22px; background: #111; color: #fff;
    border: none; cursor: pointer;
    font-size: 9pt; font-family: inherit; font-weight: 600;
    letter-spacing: 1.5px;
  }}
  .print-btn:hover {{ background: #333; }}

  .po-page {{
    background: #fff;
    width: 182mm; min-height: 257mm;
    margin: 16px auto;
    padding: 12mm 16mm;
    display: flex; flex-direction: column;
    box-shadow: 0 2px 12px rgba(0,0,0,.18);
  }}

  @media print {{
    .print-btn {{ display: none; }}
    body {{ background: #fff; }}
    .po-page {{ margin: 0; box-shadow: none; width: 100%; min-height: 0; }}
  }}

  /* 헤더 */
  .doc-header {{
    display: flex; align-items: stretch;
    border-bottom: 2.5px solid #111;
    margin-bottom: 10px; padding-bottom: 10px;
  }}
  .doc-title-area {{ flex: 1; }}
  .doc-title {{ font-size: 26pt; font-weight: 800; letter-spacing: 18px; color: #111; line-height: 1; }}
  .doc-sub {{ font-size: 7pt; letter-spacing: 5px; color: #888; margin-top: 5px; text-transform: uppercase; }}
  .doc-right {{ display: flex; align-items: flex-start; padding-left: 20px; }}
  .doc-company {{ font-size: 10pt; font-weight: 700; color: #111; letter-spacing: 2px; text-align: right; line-height: 1.5; }}
  .doc-company span {{ font-size: 7pt; font-weight: 400; color: #888; letter-spacing: 3px; display: block; }}
  .doc-no {{ font-size: 8pt; color: #888; text-align: right; font-family: 'Courier New', monospace; margin-top: 2px; }}

  /* 결재란 */
  .approval-wrap {{ display: flex; border: 1px solid #ccc; margin-right: 16px; }}
  .approval-col {{ width: 55px; text-align: center; border-left: 1px solid #ddd; }}
  .approval-col:first-child {{ border-left: none; }}
  .approval-label {{ padding: 3px 0; font-size: 7.5pt; font-weight: 700; background: #111; color: #fff; letter-spacing: 2px; border-bottom: 1px solid #333; }}
  .approval-body {{ height: 44px; }}

  /* 발주 정보 */
  .meta-table {{ width: 100%; border-collapse: collapse; border: 1px solid #bbb; margin-bottom: 10px; }}
  .meta-table td {{ padding: 5px 10px; border: 1px solid #ddd; font-size: 9pt; vertical-align: middle; }}
  .meta-table .lbl {{ background: #111; color: #f0f0f0; font-weight: 600; width: 64px; text-align: center; white-space: nowrap; font-size: 8pt; letter-spacing: 1.5px; }}
  .meta-table .val {{ color: #222; }}
  .meta-table .emph {{ font-weight: 700; color: #111; }}
  .meta-table .due {{ font-weight: 700; color: #111; border-bottom: 2px solid #111; }}

  /* 품목 테이블 */
  .items-table {{ width: 100%; border-collapse: collapse; border: 1px solid #bbb; margin-bottom: 10px; font-size: 9pt; }}
  .items-table th {{ background: #111; color: #f0f0f0; padding: 7px 8px; text-align: center; border-right: 1px solid #333; font-weight: 600; white-space: nowrap; letter-spacing: 1px; font-size: 8pt; }}
  .items-table td {{ padding: 7px 8px; border: 1px solid #e8e8e8; vertical-align: middle; }}
  .td-partno {{ font-family: 'Courier New', monospace; font-size: 8.5pt; color: #333; }}
  .td-amt {{ font-weight: 700; color: #111; text-align: right; }}
  .td-qty {{ text-align: right; font-weight: 600; }}
  .td-price {{ text-align: right; color: #444; }}
  .td-center {{ text-align: center; color: #666; }}

  /* 합계 */
  .total-table {{ margin-left: auto; border-collapse: collapse; min-width: 280px; border: 1px solid #bbb; margin-bottom: 12px; }}
  .total-table td {{ padding: 6px 16px; border: 1px solid #ddd; font-size: 9pt; }}
  .total-table .lbl {{ background: #f4f4f4; font-weight: 600; color: #444; letter-spacing: 1px; text-align: center; font-size: 8.5pt; width: 120px; }}
  .total-table .amt {{ text-align: right; }}
  .total-table tr:last-child {{ background: #111; }}
  .total-table tr:last-child td {{ color: #fff; font-size: 11pt; font-weight: 800; border-color: #333; }}

  /* 안내문 */
  .terms {{ display: flex; gap: 12px; font-size: 7.5pt; color: #444; border-top: 1.5px solid #111; padding-top: 8px; }}
  .terms-col {{ flex: 1; }}
  .terms-title {{ font-weight: 700; color: #111; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 5px; padding-bottom: 3px; border-bottom: 1px solid #ddd; }}
  .terms p {{ margin-bottom: 3px; line-height: 1.55; }}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">&#128424; PDF 저장 / 인쇄</button>
<div class="po-page">

  <!-- 헤더 -->
  <div class="doc-header">
    <div class="doc-title-area">
      <div class="doc-title">발 주 서</div>
      <div class="doc-sub">Material Purchase Order &nbsp;·&nbsp; Nexgem Co., Ltd.</div>
    </div>
    <div class="doc-right">
      <div style="display:flex;align-items:flex-start;gap:16px;">
        <div class="approval-wrap">
          <div class="approval-col"><div class="approval-label">담당</div><div class="approval-body"></div></div>
          <div class="approval-col"><div class="approval-label">검토</div><div class="approval-body"></div></div>
          <div class="approval-col"><div class="approval-label">승인</div><div class="approval-body"></div></div>
        </div>
        <div>
          <div class="doc-company">㈜ 넥 스 젬<span>NEXGEM CO., LTD.</span></div>
          <div class="doc-no">No.&nbsp;{po_no}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 발주 정보 -->
  <table class="meta-table">
    <tr>
      <td class="lbl">문서번호</td>
      <td class="val" style="font-family:'Courier New',monospace;font-weight:700;letter-spacing:1px">{po_no}</td>
      <td class="lbl">담 당 자</td>
      <td class="val">황재현 과장 &nbsp;/&nbsp; 010-3887-9043</td>
      <td class="lbl">발 주 일</td>
      <td class="val">{po.order_date}</td>
    </tr>
    <tr>
      <td class="lbl">발 &nbsp;&nbsp;&nbsp; 신</td>
      <td class="val emph">㈜넥스젬</td>
      <td class="lbl">전 &nbsp;&nbsp;&nbsp; 화</td>
      <td class="val">T. 043-212-3351~2</td>
      <td class="lbl">납 기 일</td>
      <td class="val"><span class="due">{po.due_date}</span></td>
    </tr>
    <tr>
      <td class="lbl">수 &nbsp;&nbsp;&nbsp; 신</td>
      <td class="val emph">{partner_name} &nbsp;귀중</td>
      <td class="lbl">이 메 일</td>
      <td class="val">jhhwang@nexgem.co.kr</td>
      <td class="lbl">결제조건</td>
      <td class="val">당사 지급 기준</td>
    </tr>
    <tr>
      <td class="lbl">비 &nbsp;&nbsp;&nbsp; 고</td>
      <td colspan="5" style="color:#333">{po.note or '&nbsp;'}</td>
    </tr>
  </table>

  <!-- 품목 -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:30px">No</th>
        <th style="width:120px">자재코드 (품번)</th>
        <th>품 &nbsp;&nbsp;&nbsp; 명</th>
        <th style="width:40px">단위</th>
        <th style="width:80px">수 량</th>
        <th style="width:100px">단 가</th>
        <th style="width:110px">공 급 금 액</th>
        <th style="width:90px">납 기 일</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-center">1</td>
        <td class="td-partno">{po.part_no}</td>
        <td style="font-weight:500">{item_name}</td>
        <td class="td-center">{item_unit}</td>
        <td class="td-qty">{po.qty:,}</td>
        <td class="td-price">&#8361;&nbsp;{unit_price:,.2f}</td>
        <td class="td-amt">&#8361;&nbsp;{amount:,}</td>
        <td class="td-center" style="white-space:nowrap">{po.due_date}</td>
      </tr>
    </tbody>
  </table>

  <!-- 합계 -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
    <table class="total-table">
      <tr>
        <td class="lbl">공 급 가 액</td>
        <td class="amt">&#8361;&nbsp;{amount:,}</td>
      </tr>
      <tr>
        <td class="lbl">부 가 세 (10%)</td>
        <td class="amt" style="color:#555">&#8361;&nbsp;{vat:,}</td>
      </tr>
      <tr>
        <td class="lbl" style="letter-spacing:2px">합 계 금 액</td>
        <td class="amt">&#8361;&nbsp;{total_with_vat:,}</td>
      </tr>
    </table>
  </div>

  <div style="flex:1;"></div>

  <!-- 안내문 -->
  <div class="terms">
    <div class="terms-col" style="padding-right:12px;border-right:1px solid #ddd;">
      <div class="terms-title">Terms &amp; Conditions</div>
      <p>1. 본 발주서는 ㈜넥스젬이 발행한 공식 구매 계약 문서로서, 수신 즉시 내용을 확인하시고 이상 여부를 담당자에게 통보하여 주시기 바랍니다.</p>
      <p>2. 납기일은 당사 자재 입고 완료 기준이며, 일정 변경이 예상되는 경우 출하 예정일 기준 5영업일 이전에 반드시 사전 통보하여 주시기 바랍니다.</p>
      <p>3. 납품 시 본 발주서에 기재된 품번·품명과 일치하는 거래명세표 및 품질성적서를 반드시 동봉하여 주시기 바랍니다.</p>
      <p>4. 품질 기준에 미달하는 제품은 입고 검사 후 전량 반품 처리되며, 이로 인한 제반 비용은 납품업체가 부담합니다.</p>
    </div>
    <div class="terms-col" style="padding-left:12px;border-left:2.5px solid #111;">
      <div class="terms-title">Remarks</div>
      <p>1. 본 발주서를 수령하신 후 3영업일 이내에 주문 내용에 대한 수락 여부를 서면으로 회신하여 주시기 바랍니다.</p>
      <p>2. 납기 일정 조정이 필요한 경우, 출하 예정일로부터 최소 5영업일 이전에 담당자와 사전 협의하여 주시기 바랍니다.</p>
      <p>3. 규격·재질·수량 등 발주 내용에 이의가 있으실 경우, 수락 회신 전 구매 담당자에게 즉시 연락하여 주시기 바랍니다.</p>
    </div>
  </div>
  <div style="height:2.5px;background:#111;margin-top:10px;"></div>

</div>
</body>
</html>"""
    return HTMLResponse(content=html)


# ── 월별 매입 집계 ────────────────────────────────────────────────
@router.get("/summary")
def mat_summary(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user: User = Depends(_require_mat),
):
    from sqlalchemy import extract
    mat_po_nos = {
        po.po_no for po in db.query(PurchaseOrder).filter(PurchaseOrder.po_type == "material").all()
    }
    receipts = (
        db.query(Receipt)
        .filter(
            Receipt.po_no.in_(mat_po_nos),
            Receipt.status == ReceiptStatus.confirmed,
            extract("year", Receipt.receipt_date) == year,
            extract("month", Receipt.receipt_date) == month,
        )
        .all()
    )
    by_partner: dict = {}
    total_amount = 0.0
    for r in receipts:
        amt = r.qty * float(r.unit_price)
        total_amount += amt
        pid = r.partner_id or "기타"
        if pid not in by_partner:
            partner = db.get(Partner, pid)
            by_partner[pid] = {
                "partner_id": pid,
                "partner_name": partner.name if partner else pid,
                "count": 0, "amount": 0.0,
            }
        by_partner[pid]["count"] += 1
        by_partner[pid]["amount"] += amt

    return {
        "year": year, "month": month,
        "total_receipts": len(receipts),
        "total_amount": total_amount,
        "by_partner": sorted(by_partner.values(), key=lambda x: -x["amount"]),
    }
