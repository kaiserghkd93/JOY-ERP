from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from datetime import date
from app.database import get_db
from app.models.sales import SalesOrder, Shipment, SOStatus, ShipmentStatus
from app.models.master import Partner, Item
from app.schemas.sales import SOCreate, SOOut, SOSummary, ShipmentCreate, ShipmentOut
from app.services.sales_service import (
    create_so, create_shipment, cancel_shipment, get_so_remaining
)

router = APIRouter(prefix="/sales", tags=["영업·출하"])


@router.post("/orders", response_model=SOOut)
def post_so(body: SOCreate, db: Session = Depends(get_db)):
    return create_so(db, **body.model_dump())


@router.patch("/orders/{so_no}")
def update_so(so_no: str, body: dict, db: Session = Depends(get_db)):
    so = db.get(SalesOrder, so_no)
    if not so:
        raise HTTPException(404, f"수주 없음: {so_no}")
    if so.status == SOStatus.cancelled:
        raise HTTPException(400, "취소된 수주는 수정할 수 없습니다")
    if "qty" in body:
        new_qty = int(body["qty"])
        if new_qty <= 0:
            raise HTTPException(400, "수량은 1 이상이어야 합니다")
        shipped = db.query(func.coalesce(func.sum(Shipment.qty), 0)).filter(
            Shipment.so_no == so_no,
            Shipment.status == ShipmentStatus.confirmed,
        ).scalar()
        if new_qty < int(shipped):
            raise HTTPException(400, f"이미 출하된 수량({int(shipped)}개)보다 작게 수정할 수 없습니다")
        so.qty = new_qty
    if "due_date" in body and body["due_date"]:
        so.due_date = date.fromisoformat(body["due_date"])
    if "note" in body:
        so.note = body["note"]
    db.commit()
    db.refresh(so)
    return so


@router.get("/orders", response_model=list[SOOut])
def list_so(
    partner_id: str | None = None,
    status: SOStatus | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(SalesOrder)
    if partner_id:
        q = q.filter(SalesOrder.partner_id == partner_id)
    if status:
        q = q.filter(SalesOrder.status == status)
    status_order = case(
        (SalesOrder.status == SOStatus.open, 0),
        (SalesOrder.status == SOStatus.partial, 1),
        (SalesOrder.status == SOStatus.closed, 2),
        (SalesOrder.status == SOStatus.cancelled, 3),
        else_=9,
    )
    rows = q.order_by(status_order, SalesOrder.due_date).all()
    result = []
    for so in rows:
        item = db.get(Item, so.part_no)
        d = SOOut.model_validate(so).model_dump()
        d["item_name"] = item.name if item else None
        d["remaining_qty"] = get_so_remaining(db, so.so_no)
        result.append(d)
    return result


@router.get("/orders/{so_no}/summary", response_model=SOSummary)
def so_summary(so_no: str, db: Session = Depends(get_db)):
    so = db.get(SalesOrder, so_no)
    if not so:
        raise HTTPException(404)
    shipped = db.query(func.coalesce(func.sum(Shipment.qty), 0)).filter(
        Shipment.so_no == so_no, Shipment.status == ShipmentStatus.confirmed
    ).scalar()
    shipped = int(shipped)
    return SOSummary(
        so_no=so_no, part_no=so.part_no,
        order_qty=so.qty, shipped_qty=shipped,
        remaining_qty=so.qty - shipped, status=so.status,
    )


@router.get("/orders/remaining", response_model=list[dict])
def all_so_remaining(partner_id: str | None = None, db: Session = Depends(get_db)):
    """고객사별 미납잔량 전체"""
    q = db.query(SalesOrder).filter(
        SalesOrder.status.not_in([SOStatus.closed, SOStatus.cancelled])
    )
    if partner_id:
        q = q.filter(SalesOrder.partner_id == partner_id)
    result = []
    for so in q.all():
        rem = get_so_remaining(db, so.so_no)
        item = db.get(Item, so.part_no)
        result.append({
            "so_no": so.so_no, "partner_id": so.partner_id,
            "part_no": so.part_no, "item_name": item.name if item else None,
            "order_qty": so.qty, "shipped_qty": so.qty - rem, "remaining_qty": rem,
            "due_date": so.due_date, "status": so.status,
        })
    return result


@router.post("/orders/{so_no}/cancel")
def cancel_so(so_no: str, db: Session = Depends(get_db)):
    so = db.get(SalesOrder, so_no)
    if not so:
        raise HTTPException(404, f"수주 없음: {so_no}")
    if so.status == SOStatus.cancelled:
        raise HTTPException(400, "이미 취소된 수주입니다")
    # 일부 출하된 경우 잔량만 취소(강제 클로즈) — 출하 이력은 유지
    so.status = SOStatus.cancelled
    db.commit()
    return {"so_no": so_no, "status": "취소"}


@router.post("/shipments/direct")
def post_direct_shipment(body: dict, db: Session = Depends(get_db)):
    """수주 없이 바로 출하 등록 — SO 자동 생성 후 즉시 출하확정"""
    from app.services.doc_no import next_doc_no
    from app.models.sales import SOStatus, ShipmentStatus
    from app.services.ledger_service import get_avg_price, post_ledger
    from app.models.ledger import LedgerType
    from datetime import date

    partner_id = body.get("partner_id")
    part_no    = body.get("part_no")
    qty        = int(body.get("qty", 0))
    unit_price = float(body.get("unit_price", 0))
    ship_date  = date.fromisoformat(body.get("ship_date"))
    note       = body.get("note") or "직접출하"

    if not db.get(Partner, partner_id):
        raise HTTPException(404, f"거래처 없음: {partner_id}")
    if not db.get(Item, part_no):
        raise HTTPException(404, f"품목 없음: {part_no}")

    # SO 자동 생성 (즉시 closed)
    so_no = next_doc_no(db, "SO", "sales_order", "so_no")
    so = SalesOrder(
        so_no=so_no, partner_id=partner_id, part_no=part_no,
        qty=qty, order_date=ship_date, due_date=ship_date,
        status=SOStatus.closed, note=note,
    )
    db.add(so)
    db.flush()

    # 출하 등록
    sh_no = next_doc_no(db, "SH", "shipment", "sh_no")
    sh = Shipment(
        sh_no=sh_no, so_no=so_no, part_no=part_no,
        qty=qty, ship_date=ship_date, unit_price=unit_price,
        status=ShipmentStatus.confirmed, note=note,
    )
    db.add(sh)
    db.flush()

    avg = get_avg_price(db, part_no)
    post_ledger(db, part_no, ship_date, LedgerType.shipment, -qty, avg,
                ref_type="SH", ref_no=sh_no, note="직접출하")
    db.commit()
    return {"so_no": so_no, "sh_no": sh_no}


@router.post("/shipments", response_model=ShipmentOut)
def post_shipment(body: ShipmentCreate, db: Session = Depends(get_db)):
    return create_shipment(db, **body.model_dump())


@router.post("/shipments/{sh_no}/cancel")
def cancel_sh(sh_no: str, db: Session = Depends(get_db)):
    return cancel_shipment(db, sh_no)


@router.get("/shipments", response_model=list[ShipmentOut])
def list_shipments(
    partner_id: str | None = None,
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Shipment)
    if partner_id:
        q = q.join(SalesOrder).filter(SalesOrder.partner_id == partner_id)
    if year:
        q = q.filter(func.strftime('%Y', Shipment.ship_date) == str(year))
    if month:
        q = q.filter(func.strftime('%m', Shipment.ship_date) == str(month).zfill(2))
    shipments = q.order_by(Shipment.ship_date.desc(), Shipment.sh_no).all()
    result = []
    for sh in shipments:
        so = db.get(SalesOrder, sh.so_no)
        p = db.get(Partner, so.partner_id) if so else None
        d = ShipmentOut.model_validate(sh).model_dump()
        d["partner_id"] = so.partner_id if so else None
        d["partner_name"] = p.name if p else (so.partner_id if so else None)
        d["due_date"] = so.due_date if so else None
        item = db.get(Item, sh.part_no)
        d["item_name"] = item.name if item else None
        result.append(d)
    return result


@router.get("/shipments/{sh_no}/print", response_class=HTMLResponse)
def print_shipment(sh_no: str, db: Session = Depends(get_db)):
    """거래명세서 — 브라우저 인쇄/PDF 저장용 HTML"""
    sh = db.query(Shipment).filter(Shipment.sh_no == sh_no).first()
    if not sh:
        raise HTTPException(404)

    so = db.get(SalesOrder, sh.so_no)
    partner = db.get(Partner, so.partner_id) if so else None
    item = db.get(Item, sh.part_no)

    qty = sh.qty
    unit_price = float(sh.unit_price)
    supply_amt = round(qty * unit_price, 0)   # unit_price는 공급가액 단가 (VAT 제외)
    unit_price_str = f"{unit_price:,.2f}".rstrip('0').rstrip('.')
    vat = round(supply_amt * 0.1, 0)
    amount = supply_amt + vat

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>거래명세서 {sh.sh_no}</title>
<style>
  @page {{ size: A4; margin: 15mm 20mm; }}
  body {{ font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; font-size: 11pt; color: #111; }}
  h1 {{ text-align: center; font-size: 22pt; letter-spacing: 8px; margin-bottom: 4px; }}
  .doc-no {{ text-align: center; color: #555; font-size: 10pt; margin-bottom: 16px; }}
  .info-wrap {{ display: flex; gap: 20px; margin-bottom: 16px; }}
  .info-box {{ flex: 1; border: 1px solid #999; padding: 8px 12px; font-size: 10pt; }}
  .info-box .title {{ font-weight: bold; font-size: 11pt; border-bottom: 1px solid #ccc; margin-bottom: 6px; padding-bottom: 4px; }}
  .info-box td {{ padding: 3px 6px; }}
  .info-box .lbl {{ color: #555; width: 80px; }}
  .items {{ width: 100%; border-collapse: collapse; margin-bottom: 12px; }}
  .items th {{ background: #1d4ed8; color: #fff; padding: 7px 6px; text-align: center; font-size: 10pt; border: 1px solid #1d4ed8; }}
  .items td {{ padding: 6px 8px; border: 1px solid #ddd; font-size: 10pt; }}
  .items tr:nth-child(even) td {{ background: #f9f9f9; }}
  .total-box {{ border: 2px solid #1d4ed8; padding: 10px 16px; margin-bottom: 16px; font-size: 11pt; }}
  .total-box table {{ width: 100%; }}
  .total-box td {{ padding: 3px 8px; }}
  .footer {{ font-size: 9pt; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }}
  .stamp-area {{ display: flex; justify-content: flex-end; margin-bottom: 14px; }}
  .stamp-box {{ border: 1px solid #ccc; padding: 10px 24px; text-align: center; font-size: 9pt; min-width: 120px; }}
  .stamp-box div.space {{ height: 38px; }}
  @media print {{ button {{ display: none; }} }}
</style>
</head>
<body>
<button onclick="window.print()" style="position:fixed;top:12px;right:12px;padding:8px 20px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12pt">PDF / 인쇄</button>

<h1>거 래 명 세 서</h1>
<div class="doc-no">문서번호: {sh.sh_no} &nbsp;|&nbsp; 출하일: {sh.ship_date}</div>

<div class="stamp-area">
  <div class="stamp-box">
    <div style="font-weight:bold; font-size:10pt">넥스젬</div>
    <div class="space"></div>
    <div style="border-top:1px solid #ccc; font-size:9pt; color:#888">결재</div>
  </div>
</div>

<div class="info-wrap">
  <div class="info-box">
    <div class="title">공급받는자</div>
    <table>
      <tr><td class="lbl">상호</td><td><strong>{partner.name if partner else so.partner_id if so else ''}</strong></td></tr>
      <tr><td class="lbl">사업자번호</td><td>{partner.business_no if partner and partner.business_no else '—'}</td></tr>
    </table>
  </div>
  <div class="info-box">
    <div class="title">공급자 (넥스젬)</div>
    <table>
      <tr><td class="lbl">상호</td><td><strong>넥스젬</strong></td></tr>
      <tr><td class="lbl">수주번호</td><td>{sh.so_no}</td></tr>
    </table>
  </div>
</div>

<table class="items">
  <thead>
    <tr>
      <th style="width:40px">No</th>
      <th style="width:130px">품번</th>
      <th>품명</th>
      <th style="width:50px">단위</th>
      <th style="width:80px">수량</th>
      <th style="width:110px">단가</th>
      <th style="width:110px">공급가액</th>
      <th style="width:90px">세액</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="text-align:center">1</td>
      <td>{sh.part_no}</td>
      <td>{item.name if item else ''}</td>
      <td style="text-align:center">{item.unit if item else 'EA'}</td>
      <td style="text-align:right">{qty:,}</td>
      <td style="text-align:right">&#8361;{unit_price_str}</td>
      <td style="text-align:right">&#8361;{supply_amt:,.0f}</td>
      <td style="text-align:right">&#8361;{vat:,.0f}</td>
    </tr>
    <tr style="font-weight:bold; background:#eef2ff;">
      <td colspan="6" style="text-align:right; border:1px solid #ddd; padding:6px 8px;">합계</td>
      <td style="text-align:right; border:1px solid #ddd; padding:6px 8px;">&#8361;{supply_amt:,.0f}</td>
      <td style="text-align:right; border:1px solid #ddd; padding:6px 8px;">&#8361;{vat:,.0f}</td>
    </tr>
  </tbody>
</table>

<div class="total-box">
  <table>
    <tr>
      <td style="font-weight:bold; font-size:13pt;">합계금액</td>
      <td style="font-size:15pt; font-weight:800; color:#1d4ed8; text-align:right;">&#8361;{amount:,.0f}</td>
      <td style="color:#555; font-size:10pt; padding-left:16px;">(공급가 &#8361;{supply_amt:,.0f} + 부가세 &#8361;{vat:,.0f})</td>
    </tr>
  </table>
</div>

<div class="footer">
  ※ 본 거래명세서는 넥스젬에서 발행한 공식 출하 문서입니다.<br>
  ※ 위 금액을 청구합니다. 문의: 넥스젬 영업팀
</div>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.get("/shipments/print-bundle", response_class=HTMLResponse)
def print_bundle(partner_id: str, ship_date: str, db: Session = Depends(get_db)):
    """같은 고객사·같은 출하일의 모든 출하를 한 장 거래명세서로"""
    from datetime import date as date_type
    shipments = (
        db.query(Shipment)
        .join(SalesOrder, SalesOrder.so_no == Shipment.so_no)
        .filter(
            SalesOrder.partner_id == partner_id,
            Shipment.ship_date == date_type.fromisoformat(ship_date),
            Shipment.status == "confirmed",
        )
        .order_by(Shipment.sh_no)
        .all()
    )
    if not shipments:
        raise HTTPException(404, "해당 출하 내역 없음")

    partner = db.get(Partner, partner_id)

    SUPPLIER = {
        "name":    "㈜넥스젬",
        "biz_no":  "301-81-62024",
        "ceo":     "이광규",
        "address": "충청북도 청주시 청원군 북이면 796-60",
        "tel":     "043-212-3351,2",
        "fax":     "043-212-3353",
    }

    p_name    = partner.name    if partner else partner_id
    p_biz_no  = getattr(partner, 'biz_no',  '') or ''
    p_ceo     = getattr(partner, 'ceo',     '') or ''
    p_address = getattr(partner, 'address', '') or ''
    p_tel     = getattr(partner, 'contact', '') or ''

    rows_html = ""
    total_supply = 0.0
    total_vat = 0.0
    for i, sh in enumerate(shipments, 1):
        item = db.get(Item, sh.part_no)
        qty = sh.qty
        up = float(sh.unit_price)
        up_str = f"{up:,.2f}".rstrip('0').rstrip('.')
        sup = round(qty * up, 0)   # unit_price는 공급가액 단가 (VAT 제외)
        vat = round(sup * 0.1, 0)
        total_supply += sup
        total_vat += vat
        rows_html += f"""
        <tr>
          <td class="c">{i}</td>
          <td>{sh.part_no}</td>
          <td>{item.name if item else ''}</td>
          <td class="c">{item.unit if item else 'EA'}</td>
          <td class="r">{qty:,}</td>
          <td class="r">&#8361;{up_str}</td>
          <td class="r">&#8361;{sup:,.0f}</td>
          <td class="r">&#8361;{vat:,.0f}</td>
        </tr>"""

    for _ in range(max(0, 5 - len(shipments))):
        rows_html += "<tr>" + "<td>&nbsp;</td>" * 8 + "</tr>"

    total_amount = total_supply + total_vat
    sh_list = [sh.sh_no for sh in shipments]
    if len(sh_list) > 2:
        sh_nos = f"{sh_list[0]}, {sh_list[1]} 외 {len(sh_list)-2}건"
    else:
        sh_nos = ", ".join(sh_list)
    doc_no = f"SH-{ship_date.replace('-','')}-{partner_id}"

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>거래명세서 {p_name} {ship_date}</title>
<style>
  @page {{ size: A4 portrait; margin: 8mm 10mm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: '맑은 고딕','Malgun Gothic',sans-serif; font-size: 9pt; color: #000; }}

  /* ── 공통 테두리 변수: 외곽 #000, 내부 굵은 #555, 내부 얇은 #999 ── */

  /* ── 문서 헤더 ── */
  .doc-header {{ display:flex; border:1.5px solid #000; margin-bottom:5px; }}
  .doc-header .logo-area {{ width:160px; min-height:90px; border-right:1.5px solid #000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:4px 6px; }}
  .doc-header .title-area {{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; border-right:1.5px solid #000; padding:6px; }}
  .doc-header .title-area .main-title {{ font-size:20pt; font-weight:900; letter-spacing:10px; }}
  .doc-header .title-area .doc-code {{ font-size:7.5pt; color:#555; margin-top:3px; }}
  .doc-header .meta-area {{ width:155px; font-size:8.5pt; }}
  .doc-header .meta-area table {{ width:100%; border-collapse:collapse; height:100%; }}
  .doc-header .meta-area td {{ border-bottom:1px solid #999; padding:4px 6px; vertical-align:middle; }}
  .doc-header .meta-area tr:last-child td {{ border-bottom:none; }}
  .doc-header .meta-area td:first-child {{ background:#f5f5f5; font-weight:600; width:58px; border-right:1px solid #999; white-space:nowrap; }}

  /* ── 거래처/공급자 ── */
  .party-wrap {{ display:flex; gap:0; border:1.5px solid #000; margin-bottom:5px; }}
  .party-box {{ flex:1; }}
  .party-box + .party-box {{ border-left:1.5px solid #000; }}
  .party-head {{ background:#000; color:#fff; font-weight:700; font-size:8.5pt;
                 padding:3px 8px; text-align:center; letter-spacing:3px; }}
  .party-grid {{ display:grid; grid-template-columns:58px 1fr; font-size:8.5pt; }}
  .party-grid .lbl {{ background:#f5f5f5; border-right:1px solid #999; border-bottom:1px solid #999;
                      padding:3px 6px; font-weight:600; }}
  .party-grid .val {{ border-bottom:1px solid #999; padding:3px 6px; }}
  .party-grid .lbl:nth-last-child(2),
  .party-grid .val:last-child {{ border-bottom:none; }}
  .party-grid .val.big {{ font-size:10pt; font-weight:700; }}

  /* ── 품목표 ── */
  .items {{ width:100%; border-collapse:collapse; margin-bottom:5px; font-size:8.5pt; }}
  .items th {{ background:#000; color:#fff; padding:4px 3px; text-align:center;
               border:1px solid #000; font-weight:600; letter-spacing:1px; }}
  .items td {{ padding:3px 5px; border:1px solid #999; height:20px; }}
  .items td.c {{ text-align:center; }}
  .items td.r {{ text-align:right; }}

  /* ── 합계 ── */
  .total-wrap {{ border:1.5px solid #000; margin-bottom:5px; display:flex; }}
  .total-label {{ background:#000; color:#fff; font-weight:700; font-size:9pt;
                  writing-mode:vertical-rl; text-align:center; padding:6px 4px;
                  letter-spacing:4px; border-right:1.5px solid #000; }}
  .total-body {{ flex:1; display:flex; align-items:center; padding:6px 14px; gap:30px; }}
  .total-amt {{ font-size:15pt; font-weight:900; }}
  .total-sub {{ font-size:8.5pt; color:#333; display:flex; gap:18px; }}
  .total-sub span b {{ font-weight:700; }}

  /* ── 인수확인 ── */
  .confirm-wrap {{ border:1.5px solid #000; display:flex; }}
  .confirm-label {{ background:#000; color:#fff; font-weight:700; font-size:9pt;
                    writing-mode:vertical-rl; text-align:center; padding:6px 4px;
                    letter-spacing:4px; border-right:1.5px solid #000; }}
  .confirm-inner {{ flex:1; display:flex; }}
  .confirm-col {{ flex:1; border-right:1px solid #999; padding:8px 12px; }}
  .confirm-col:last-child {{ border-right:none; }}
  .confirm-col .clbl {{ font-size:7.5pt; color:#555; font-weight:600; margin-bottom:6px; }}
  .confirm-col .sign-line {{ border-bottom:1.5px solid #000; height:36px; }}
  .confirm-col .fixed-val {{ font-size:9.5pt; font-weight:700; padding-top:10px; }}

  @media print {{ .no-print {{ display:none !important; }} }}
</style>
</head>
<body>

<button class="no-print" onclick="window.print()"
  style="position:fixed;top:12px;right:12px;padding:7px 20px;background:#000;color:#fff;
         border:none;border-radius:4px;cursor:pointer;font-size:10pt;font-weight:700;z-index:999">
  PDF / 인쇄
</button>

<!-- 문서 헤더 -->
<div class="doc-header">
  <div class="logo-area">
    <svg viewBox="0 0 250 220" width="148" height="100" xmlns="http://www.w3.org/2000/svg">
      <!-- 캘리그래피 N — 밝은 연두 -->
      <path d="M 72,18 C 66,22 58,35 52,55 C 44,80 36,108 30,135 C 26,152 24,165 26,172 C 28,178 34,176 40,170 C 48,162 58,145 72,120 L 148,22 C 155,14 162,10 168,12 C 174,14 176,22 175,38 C 173,58 166,85 158,112 C 150,138 142,158 138,172 C 135,180 135,186 139,186 C 146,186 162,174 182,155 C 200,138 218,116 228,102 C 232,96 232,92 228,92 C 224,92 218,96 212,102"
        fill="none" stroke="#5ecb42" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- NEX GE M 텍스트 — 진한 녹색 -->
      <text x="2" y="60" font-family="Arial Black,Helvetica Neue,sans-serif" font-size="52" font-weight="900" fill="#267a1a" letter-spacing="-2">NEX</text>
      <text x="2" y="113" font-family="Arial Black,Helvetica Neue,sans-serif" font-size="52" font-weight="900" fill="#267a1a" letter-spacing="-2">GE</text>
      <text x="2" y="166" font-family="Arial Black,Helvetica Neue,sans-serif" font-size="52" font-weight="900" fill="#267a1a" letter-spacing="-2">M</text>
      <!-- 하단 회사명 -->
      <text x="2" y="210" font-family="Arial,Helvetica Neue,sans-serif" font-size="18" font-weight="400" fill="#267a1a" letter-spacing="1">NEXGEM Co., Ltd.</text>
    </svg>
  </div>
  <div class="title-area">
    <div class="main-title">거 래 명 세 서</div>
    <div class="doc-code">FORM NO. NX-SA-001</div>
  </div>
  <div class="meta-area">
    <table>
      <tr><td>문서번호</td><td>{doc_no}</td></tr>
      <tr><td>출하일자</td><td>{ship_date}</td></tr>
      <tr><td>출하번호</td><td style="font-size:7.5pt">{sh_nos}</td></tr>
      <tr><td>PAGE</td><td>1 / 1</td></tr>
    </table>
  </div>
</div>

<!-- 거래처 / 공급자 -->
<div class="party-wrap">
  <div class="party-box">
    <div class="party-head">공 급 받 는 자</div>
    <div class="party-grid">
      <div class="lbl">상&nbsp;&nbsp;&nbsp;&nbsp;호</div><div class="val big">{p_name}</div>
      <div class="lbl">사업자번호</div><div class="val">{p_biz_no}</div>
      <div class="lbl">대&nbsp;표&nbsp;자</div><div class="val">{p_ceo}</div>
      <div class="lbl">주&nbsp;&nbsp;&nbsp;&nbsp;소</div><div class="val">{p_address}</div>
      <div class="lbl">연&nbsp;락&nbsp;처</div><div class="val">{p_tel}</div>
      <div class="lbl">담&nbsp;당&nbsp;자</div><div class="val">&nbsp;</div>
    </div>
  </div>
  <div class="party-box">
    <div class="party-head">공 급 자</div>
    <div class="party-grid">
      <div class="lbl">상&nbsp;&nbsp;&nbsp;&nbsp;호</div><div class="val big">{SUPPLIER["name"]}</div>
      <div class="lbl">사업자번호</div><div class="val">{SUPPLIER["biz_no"]}</div>
      <div class="lbl">대&nbsp;표&nbsp;자</div><div class="val">{SUPPLIER["ceo"]}</div>
      <div class="lbl">주&nbsp;&nbsp;&nbsp;&nbsp;소</div><div class="val">{SUPPLIER["address"]}</div>
      <div class="lbl">TEL / FAX</div><div class="val">{SUPPLIER["tel"]} / {SUPPLIER["fax"]}</div>
      <div class="lbl">담&nbsp;당&nbsp;자</div><div class="val">황재현 과장 / 010-3887-9043</div>
    </div>
  </div>
</div>

<!-- 품목 -->
<table class="items">
  <thead>
    <tr>
      <th style="width:4%">No</th>
      <th style="width:16%">품&nbsp;번</th>
      <th>품&nbsp;&nbsp;&nbsp;명</th>
      <th style="width:5%">단위</th>
      <th style="width:9%">수&nbsp;량</th>
      <th style="width:11%">단&nbsp;가</th>
      <th style="width:13%">공급가액</th>
      <th style="width:10%">세액(10%)</th>
    </tr>
  </thead>
  <tbody>
    {rows_html}
    <tr style="font-weight:700; background:#f0f0f0;">
      <td colspan="6" class="r" style="border:1px solid #aaa; padding:4px 6px;">합&nbsp;&nbsp;&nbsp;&nbsp;계</td>
      <td class="r" style="border:1px solid #aaa; padding:4px 6px;">&#8361;{total_supply:,.0f}</td>
      <td class="r" style="border:1px solid #aaa; padding:4px 6px;">&#8361;{total_vat:,.0f}</td>
    </tr>
  </tbody>
</table>

<!-- 합계금액 -->
<div class="total-wrap">
  <div class="total-label">합계금액</div>
  <div class="total-body">
    <div class="total-amt">&#8361; {total_amount:,.0f}</div>
    <div class="total-sub">
      <span>공급가액 <b>&#8361;{total_supply:,.0f}</b></span>
      <span>부가세(10%) <b>&#8361;{total_vat:,.0f}</b></span>
      <span>합&nbsp;&nbsp;&nbsp;계 <b>&#8361;{total_amount:,.0f}</b></span>
    </div>
  </div>
</div>

<!-- 인수확인 -->
<div class="confirm-wrap">
  <div class="confirm-label">인수확인</div>
  <div class="confirm-inner">
    <div class="confirm-col" style="flex:2">
      <div class="clbl">인수자 서명</div>
      <div class="sign-line"></div>
    </div>
    <div class="confirm-col" style="flex:1; background:#fafafa;">
      <div class="clbl">출하담당자</div>
      <div class="fixed-val">백수영 과장</div>
      <div style="font-size:8pt; color:#555; margin-top:3px;">010-5270-4264</div>
    </div>
  </div>
</div>

</body>
</html>"""
    return HTMLResponse(content=html)
