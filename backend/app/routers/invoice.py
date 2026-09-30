from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from datetime import date as date_type

from app.database import get_db
from app.models.sales import Invoice, InvoiceLine, InvoiceStatus, SalesOrder, SOStatus, Shipment, ShipmentStatus
from app.models.master import Partner, Item
from app.schemas.invoice import InvoiceCreate, InvoiceOut, InvoiceLineOut
from app.services.doc_no import next_doc_no
from app.services.ledger_service import post_ledger, get_avg_price
from app.models.ledger import LedgerType

router = APIRouter(prefix="/invoices", tags=["거래명세서"])


def _enrich(inv: Invoice, db: Session) -> dict:
    partner = db.get(Partner, inv.partner_id)
    lines = []
    total = 0.0
    for ln in inv.lines:
        item = db.get(Item, ln.part_no)
        lines.append(InvoiceLineOut(
            id=ln.id,
            part_no=ln.part_no,
            qty=ln.qty,
            unit_price=float(ln.unit_price),
            item_name=item.name if item else ln.part_no,
        ))
        total += ln.qty * float(ln.unit_price)

    return InvoiceOut(
        inv_no=inv.inv_no,
        partner_id=inv.partner_id,
        partner_name=partner.name if partner else inv.partner_id,
        issue_date=inv.issue_date,
        status=inv.status,
        note=inv.note,
        lines=lines,
        total_amount=round(total, 0),
    )


@router.get("", response_model=list[InvoiceOut])
def list_invoices(db: Session = Depends(get_db)):
    invs = db.query(Invoice).order_by(Invoice.issue_date.desc(), Invoice.inv_no.desc()).all()
    return [_enrich(inv, db) for inv in invs]


@router.get("/{inv_no}", response_model=InvoiceOut)
def get_invoice(inv_no: str, db: Session = Depends(get_db)):
    inv = db.get(Invoice, inv_no)
    if not inv:
        raise HTTPException(404)
    return _enrich(inv, db)


@router.post("", response_model=InvoiceOut)
def create_invoice(body: InvoiceCreate, db: Session = Depends(get_db)):
    if not body.lines:
        raise HTTPException(400, "품목을 최소 1개 이상 추가해주세요")
    inv_no = next_doc_no(db, "INV", "invoice", "inv_no")
    inv = Invoice(
        inv_no=inv_no,
        partner_id=body.partner_id,
        issue_date=body.issue_date,
        note=body.note,
        status=InvoiceStatus.draft,
    )
    db.add(inv)
    for ln in body.lines:
        db.add(InvoiceLine(inv_no=inv_no, part_no=ln.part_no, qty=ln.qty, unit_price=ln.unit_price))
    db.commit()
    db.refresh(inv)
    return _enrich(inv, db)


@router.patch("/{inv_no}", response_model=InvoiceOut)
def update_invoice(inv_no: str, body: InvoiceCreate, db: Session = Depends(get_db)):
    """draft 상태에서만 수정 가능"""
    inv = db.get(Invoice, inv_no)
    if not inv:
        raise HTTPException(404)
    if inv.status != InvoiceStatus.draft:
        raise HTTPException(400, "발행된 거래명세서는 수정할 수 없습니다")
    inv.partner_id = body.partner_id
    inv.issue_date = body.issue_date
    inv.note = body.note
    # replace lines
    for ln in list(inv.lines):
        db.delete(ln)
    db.flush()
    for ln in body.lines:
        db.add(InvoiceLine(inv_no=inv_no, part_no=ln.part_no, qty=ln.qty, unit_price=ln.unit_price))
    db.commit()
    db.refresh(inv)
    return _enrich(inv, db)


@router.post("/{inv_no}/issue", response_model=InvoiceOut)
def issue_invoice(inv_no: str, db: Session = Depends(get_db)):
    """발행 — SO + Shipment 자동 생성"""
    inv = db.get(Invoice, inv_no)
    if not inv:
        raise HTTPException(404)
    if inv.status == InvoiceStatus.issued:
        raise HTTPException(400, "이미 발행된 거래명세서입니다")
    if inv.status == InvoiceStatus.cancelled:
        raise HTTPException(400, "취소된 거래명세서입니다")
    if not inv.lines:
        raise HTTPException(400, "품목이 없습니다")

    for ln in inv.lines:
        so_no = next_doc_no(db, "SO", "sales_order", "so_no")
        so = SalesOrder(
            so_no=so_no,
            partner_id=inv.partner_id,
            part_no=ln.part_no,
            qty=ln.qty,
            order_date=inv.issue_date,
            due_date=inv.issue_date,
            status=SOStatus.closed,
            note=f"거래명세서 {inv_no} 자동생성",
        )
        db.add(so)
        db.flush()

        sh_no = next_doc_no(db, "SH", "shipment", "sh_no")
        sh = Shipment(
            sh_no=sh_no,
            so_no=so_no,
            part_no=ln.part_no,
            qty=ln.qty,
            ship_date=inv.issue_date,
            unit_price=float(ln.unit_price),
            status=ShipmentStatus.confirmed,
            note=f"거래명세서 {inv_no}",
        )
        db.add(sh)
        db.flush()
        avg = get_avg_price(db, ln.part_no)
        post_ledger(db, ln.part_no, inv.issue_date, LedgerType.shipment, -ln.qty, avg,
                    ref_type="SH", ref_no=sh_no, note=f"거래명세서 {inv_no}")

    inv.status = InvoiceStatus.issued
    db.commit()
    db.refresh(inv)
    return _enrich(inv, db)


@router.post("/{inv_no}/cancel", response_model=InvoiceOut)
def cancel_invoice(inv_no: str, db: Session = Depends(get_db)):
    inv = db.get(Invoice, inv_no)
    if not inv:
        raise HTTPException(404)
    if inv.status == InvoiceStatus.cancelled:
        raise HTTPException(400, "이미 취소된 거래명세서입니다")

    if inv.status == InvoiceStatus.issued:
        # 발행완료 취소: 연결된 Shipment/SO 취소 + stock_ledger 역분개
        shipments = db.query(Shipment).filter(
            Shipment.note == f"거래명세서 {inv_no}",
            Shipment.status == ShipmentStatus.confirmed,
        ).all()
        for sh in shipments:
            sh.status = ShipmentStatus.cancelled
            avg = get_avg_price(db, sh.part_no)
            post_ledger(db, sh.part_no, sh.ship_date, LedgerType.shipment,
                        sh.qty, avg,
                        ref_type="SH", ref_no=sh.sh_no,
                        note=f"거래명세서 {inv_no} 취소 역분개")
            so = db.get(SalesOrder, sh.so_no)
            if so:
                so.status = SOStatus.cancelled

    inv.status = InvoiceStatus.cancelled
    db.commit()
    db.refresh(inv)
    return _enrich(inv, db)


@router.get("/{inv_no}/print", response_class=HTMLResponse)
def print_invoice(inv_no: str, db: Session = Depends(get_db)):
    inv = db.get(Invoice, inv_no)
    if not inv:
        raise HTTPException(404)

    partner = db.get(Partner, inv.partner_id)

    SUPPLIER = {
        "name":    "㈜넥스젬",
        "biz_no":  "301-81-62024",
        "ceo":     "이광규",
        "address": "충청북도 청주시 청원군 북이면 796-60",
        "tel":     "043-212-3351,2",
        "fax":     "043-212-3353",
    }

    p_name    = partner.name    if partner else inv.partner_id
    p_biz_no  = getattr(partner, 'biz_no',  '') or ''
    p_ceo     = getattr(partner, 'ceo',     '') or ''
    p_address = getattr(partner, 'address', '') or ''
    p_tel     = getattr(partner, 'contact', '') or ''

    rows_html = ""
    total_supply = 0.0
    total_vat    = 0.0
    for i, ln in enumerate(inv.lines, 1):
        item = db.get(Item, ln.part_no)
        name = item.name if item else ln.part_no
        unit = item.unit if item else "EA"
        amt  = ln.qty * float(ln.unit_price)
        sup  = round(amt / 1.1, 0)
        vat  = round(amt - sup, 0)
        total_supply += sup
        total_vat    += vat
        rows_html += f"""
        <tr>
          <td class="c">{i}</td>
          <td>{ln.part_no}</td>
          <td>{name}</td>
          <td class="c">{unit}</td>
          <td class="r">{ln.qty:,}</td>
          <td class="r">&#8361;{float(ln.unit_price):,.0f}</td>
          <td class="r">&#8361;{sup:,.0f}</td>
          <td class="r">&#8361;{vat:,.0f}</td>
        </tr>"""
    for _ in range(max(0, 5 - len(inv.lines))):
        rows_html += "<tr>" + "<td>&nbsp;</td>" * 8 + "</tr>"

    total_amount = total_supply + total_vat

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>거래명세서 {inv_no}</title>
<style>
  @page {{ size: A4 portrait; margin: 8mm 10mm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: '맑은 고딕','Malgun Gothic',sans-serif; font-size: 9pt; color: #000; }}
  .doc-header {{ display:flex; border:1.5px solid #000; margin-bottom:5px; }}
  .doc-header .logo-area {{ width:160px; min-height:90px; border-right:1.5px solid #000; display:flex; align-items:center; justify-content:center; padding:4px 6px; }}
  .doc-header .title-area {{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; border-right:1.5px solid #000; padding:6px; }}
  .doc-header .title-area .main-title {{ font-size:20pt; font-weight:900; letter-spacing:10px; }}
  .doc-header .title-area .doc-code {{ font-size:7.5pt; color:#555; margin-top:3px; }}
  .doc-header .meta-area {{ width:155px; font-size:8.5pt; }}
  .doc-header .meta-area table {{ width:100%; border-collapse:collapse; height:100%; }}
  .doc-header .meta-area td {{ border-bottom:1px solid #999; padding:4px 6px; vertical-align:middle; }}
  .doc-header .meta-area tr:last-child td {{ border-bottom:none; }}
  .doc-header .meta-area td:first-child {{ background:#f5f5f5; font-weight:600; width:58px; border-right:1px solid #999; white-space:nowrap; }}
  .party-wrap {{ display:flex; gap:0; border:1.5px solid #000; margin-bottom:5px; }}
  .party-box {{ flex:1; }}
  .party-box + .party-box {{ border-left:1.5px solid #000; }}
  .party-head {{ background:#000; color:#fff; font-weight:700; font-size:8.5pt; padding:3px 8px; text-align:center; letter-spacing:3px; }}
  .party-grid {{ display:grid; grid-template-columns:58px 1fr; font-size:8.5pt; }}
  .party-grid .lbl {{ background:#f5f5f5; border-right:1px solid #999; border-bottom:1px solid #999; padding:3px 6px; font-weight:600; }}
  .party-grid .val {{ border-bottom:1px solid #999; padding:3px 6px; }}
  .party-grid .lbl:nth-last-child(2), .party-grid .val:last-child {{ border-bottom:none; }}
  .party-grid .val.big {{ font-size:10pt; font-weight:700; }}
  .items {{ width:100%; border-collapse:collapse; margin-bottom:5px; font-size:8.5pt; }}
  .items th {{ background:#000; color:#fff; padding:4px 3px; text-align:center; border:1px solid #000; font-weight:600; letter-spacing:1px; }}
  .items td {{ padding:3px 5px; border:1px solid #999; height:20px; }}
  .items td.c {{ text-align:center; }}
  .items td.r {{ text-align:right; }}
  .total-wrap {{ border:1.5px solid #000; margin-bottom:5px; display:flex; }}
  .total-label {{ background:#000; color:#fff; font-weight:700; font-size:9pt; writing-mode:vertical-rl; text-align:center; padding:6px 4px; letter-spacing:4px; border-right:1.5px solid #000; }}
  .total-body {{ flex:1; display:flex; align-items:center; padding:6px 14px; gap:30px; }}
  .total-amt {{ font-size:15pt; font-weight:900; }}
  .total-sub {{ font-size:8.5pt; color:#333; display:flex; gap:18px; }}
  .total-sub span b {{ font-weight:700; }}
  .confirm-wrap {{ border:1.5px solid #000; display:flex; }}
  .confirm-label {{ background:#000; color:#fff; font-weight:700; font-size:9pt; writing-mode:vertical-rl; text-align:center; padding:6px 4px; letter-spacing:4px; border-right:1.5px solid #000; }}
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

<div class="doc-header">
  <div class="logo-area">
    <svg viewBox="0 0 250 220" width="148" height="100" xmlns="http://www.w3.org/2000/svg">
      <path d="M 72,18 C 66,22 58,35 52,55 C 44,80 36,108 30,135 C 26,152 24,165 26,172 C 28,178 34,176 40,170 C 48,162 58,145 72,120 L 148,22 C 155,14 162,10 168,12 C 174,14 176,22 175,38 C 173,58 166,85 158,112 C 150,138 142,158 138,172 C 135,180 135,186 139,186 C 146,186 162,174 182,155 C 200,138 218,116 228,102 C 232,96 232,92 228,92 C 224,92 218,96 212,102"
        fill="none" stroke="#5ecb42" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="2" y="60" font-family="Arial Black,Helvetica Neue,sans-serif" font-size="52" font-weight="900" fill="#267a1a" letter-spacing="-2">NEX</text>
      <text x="2" y="113" font-family="Arial Black,Helvetica Neue,sans-serif" font-size="52" font-weight="900" fill="#267a1a" letter-spacing="-2">GE</text>
      <text x="2" y="166" font-family="Arial Black,Helvetica Neue,sans-serif" font-size="52" font-weight="900" fill="#267a1a" letter-spacing="-2">M</text>
      <text x="2" y="210" font-family="Arial,Helvetica Neue,sans-serif" font-size="18" font-weight="400" fill="#267a1a" letter-spacing="1">NEXGEM Co., Ltd.</text>
    </svg>
  </div>
  <div class="title-area">
    <div class="main-title">거 래 명 세 서</div>
    <div class="doc-code">FORM NO. NX-SA-001</div>
  </div>
  <div class="meta-area">
    <table>
      <tr><td>문서번호</td><td>{inv_no}</td></tr>
      <tr><td>발행일자</td><td>{inv.issue_date}</td></tr>
      <tr><td>PAGE</td><td>1 / 1</td></tr>
    </table>
  </div>
</div>

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
      <td colspan="6" class="r" style="border:1px solid #999; padding:4px 6px;">합&nbsp;&nbsp;&nbsp;&nbsp;계</td>
      <td class="r" style="border:1px solid #999; padding:4px 6px;">&#8361;{total_supply:,.0f}</td>
      <td class="r" style="border:1px solid #999; padding:4px 6px;">&#8361;{total_vat:,.0f}</td>
    </tr>
  </tbody>
</table>

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
