from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.orm import Session
import io
from datetime import date as date_type

from app.database import get_db
from app.models.purchase import PurchaseOrderGroup, PurchaseOrder, POStatus, POGroupStatus
from app.models.master import Partner, Item
from app.schemas.purchase_group import POGroupCreate, POGroupOut
from app.services.doc_no import next_doc_no
from app.services.purchase_service import create_po

router = APIRouter(prefix="/purchase/groups", tags=["발주서"])


@router.post("", response_model=POGroupOut)
def create_group(body: POGroupCreate, db: Session = Depends(get_db)):
    if not body.lines:
        raise HTTPException(400, "품목을 1개 이상 추가하세요")

    group_no = next_doc_no(db, "PG", "purchase_order_group", "group_no")

    group = PurchaseOrderGroup(
        group_no=group_no,
        partner_id=body.partner_id,
        order_date=body.order_date,
        due_date=body.due_date,
        note=body.note,
        status=POGroupStatus.issued,
    )
    db.add(group)
    db.flush()

    for line in body.lines:
        from app.models.purchase import PurchaseOrder, POStatus
        from app.models.master import Item
        if not db.get(Item, line.part_no):
            raise HTTPException(404, f"품목 없음: {line.part_no}")
        po_no = next_doc_no(db, "PO", "purchase_order", "po_no")
        po = PurchaseOrder(
            po_no=po_no, group_no=group_no,
            partner_id=body.partner_id, part_no=line.part_no,
            qty=line.qty, order_date=body.order_date, due_date=line.due_date or body.due_date,
            unit_price=line.unit_price, note=line.note,
            status=POStatus.open,
        )
        db.add(po)
        db.flush()

    db.commit()
    db.refresh(group)
    return group


def _enrich(g, db):
    """Add partner_name to a group dict."""
    partner = db.get(Partner, g.partner_id)
    data = POGroupOut.model_validate(g).model_dump()
    data["partner_name"] = partner.name if partner else g.partner_id
    return data


@router.get("", response_model=list[POGroupOut])
def list_groups(partner_id: str | None = None, db: Session = Depends(get_db)):
    q = db.query(PurchaseOrderGroup)
    if partner_id:
        q = q.filter(PurchaseOrderGroup.partner_id == partner_id)
    return [_enrich(g, db) for g in q.order_by(PurchaseOrderGroup.created_at.desc()).all()]


@router.get("/{group_no}", response_model=POGroupOut)
def get_group(group_no: str, db: Session = Depends(get_db)):
    g = db.get(PurchaseOrderGroup, group_no)
    if not g:
        raise HTTPException(404)
    return g


@router.patch("/{group_no}/cancel", response_model=POGroupOut)
def cancel_group(group_no: str, db: Session = Depends(get_db)):
    """발주서(그룹) 취소 — 하위 PO 라인도 모두 취소 처리"""
    g = db.get(PurchaseOrderGroup, group_no)
    if not g:
        raise HTTPException(404)
    if g.status == POGroupStatus.cancelled:
        raise HTTPException(400, "이미 취소된 발주서입니다")

    g.status = POGroupStatus.cancelled
    for po in g.lines:
        if po.status not in (POStatus.closed,):
            po.status = POStatus.cancelled
    db.commit()
    db.refresh(g)
    return g


@router.get("/{group_no}/print", response_class=HTMLResponse)
def print_group(group_no: str, db: Session = Depends(get_db)):
    """브라우저 프린트(PDF 저장) 용 발주서 HTML — 페이지마다 헤더 완전 반복"""
    g = db.get(PurchaseOrderGroup, group_no)
    if not g:
        raise HTTPException(404)

    partner = db.get(Partner, g.partner_id)
    partner_name = partner.name if partner else g.partner_id

    # ── 전체 라인 정보 수집 ──
    all_rows = []
    total_amount = 0.0
    for i, po in enumerate(g.lines, 1):
        item = db.get(Item, po.part_no)
        unit_price = float(po.unit_price or (item.std_buy_price if item else 0) or 0)
        amount = po.qty * unit_price
        total_amount += amount
        all_rows.append({
            "no": i,
            "part_no": po.part_no,
            "name": item.name if item else "",
            "unit": item.unit if item else "EA",
            "qty": po.qty,
            "unit_price": unit_price,
            "amount": amount,
            "due_date": str(po.due_date or g.due_date),
            "note": po.note or "",
        })

    vat = total_amount * 0.1
    total_with_vat = total_amount + vat

    # ── 페이지 분할 ──
    # A4 landscape (190mm 높이) 기준:
    #   헤더+메타+품목헤더 ≈ 68mm 고정
    #   품목 1행 ≈ 7.5mm → 비마지막 페이지: 최대 13행 (68+97.5=165.5mm)
    #   마지막 페이지: 합계+안내문 ≈ 58mm 추가 → 최대 8행 (68+60+58=186mm)
    ROWS_MID  = 13   # 중간 페이지(합계 없음) 최대 행수
    ROWS_LAST = 8    # 마지막 페이지(합계+안내문 있음) 최대 행수
    MIN_LAST  = 6    # 마지막 페이지 최소 행수 (이보다 적으면 앞 페이지에서 덜어냄)

    import math

    def split_pages(rows):
        if not rows:
            return [[]]
        if len(rows) <= ROWS_LAST:
            return [rows]
        pages_out = []
        remaining = list(rows)
        while len(remaining) > ROWS_LAST:
            # 마지막 페이지에 MIN_LAST 이상 남도록 take 결정
            take = min(ROWS_MID, len(remaining) - MIN_LAST)
            if take <= 0:
                break
            pages_out.append(remaining[:take])
            remaining = remaining[take:]
        if remaining:
            pages_out.append(remaining)
        return pages_out

    pages = split_pages(all_rows)
    total_pages = len(pages)

    # ── 재사용 HTML 조각 빌더 ──
    def build_header(page_no: int) -> str:
        page_badge = f'<div style="position:absolute;top:0;right:0;background:#111;color:#fff;font-size:7pt;padding:2px 8px;letter-spacing:1px;">{page_no} / {total_pages}</div>' if total_pages > 1 else ''
        return f"""
<div class="doc-header" style="position:relative;">
  {page_badge}
  <div class="doc-title-area">
    <div class="doc-title">발 주 서</div>
    <div class="doc-sub">Purchase Order &nbsp;·&nbsp; Nexgem Co., Ltd.</div>
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
        <div class="doc-no">No.&nbsp;{g.group_no}</div>
      </div>
    </div>
  </div>
</div>"""

    def build_meta() -> str:
        return f"""
<table class="meta-table">
  <tr>
    <td class="lbl">문서번호</td>
    <td class="val" style="font-family:'Courier New',monospace;font-weight:700;letter-spacing:1px">{g.group_no}</td>
    <td class="lbl">담 당 자</td>
    <td class="val">황재현 과장 &nbsp;/&nbsp; 010-3887-9043</td>
    <td class="lbl">발 주 일</td>
    <td class="val">{g.order_date}</td>
  </tr>
  <tr>
    <td class="lbl">발 &nbsp;&nbsp;&nbsp; 신</td>
    <td class="val emph">㈜넥스젬</td>
    <td class="lbl">전 &nbsp;&nbsp;&nbsp; 화</td>
    <td class="val">T. 043-212-3351~2</td>
    <td class="lbl">납 기 일</td>
    <td class="val"><span class="due">{g.due_date}</span></td>
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
    <td colspan="5" style="color:#333">{g.note or '&nbsp;'}</td>
  </tr>
</table>"""

    def build_items(rows: list) -> str:
        rows_html = ""
        for r in rows:
            bg = ' style="background:#f9f9f9;"' if r["no"] % 2 == 0 else ""
            rows_html += f"""
        <tr{bg}>
          <td class="td-center">{r["no"]}</td>
          <td class="td-partno">{r["part_no"]}</td>
          <td>{r["name"]}</td>
          <td class="td-center">{r["unit"]}</td>
          <td class="td-qty">{r["qty"]:,}</td>
          <td class="td-price">{r["unit_price"]:,.0f}</td>
          <td class="td-amt">{r["amount"]:,.0f}</td>
          <td class="td-center" style="white-space:nowrap">{r["due_date"]}</td>
          <td style="font-size:8.5pt;color:#666">{r["note"]}</td>
        </tr>"""
        return f"""
<table class="items-table">
  <thead>
    <tr>
      <th style="width:30px">No</th>
      <th style="width:128px">자재코드 (품번)</th>
      <th>품 &nbsp;&nbsp;&nbsp; 명</th>
      <th style="width:38px">단위</th>
      <th style="width:70px">수 량</th>
      <th style="width:88px">단 가</th>
      <th style="width:98px">공 급 금 액</th>
      <th style="width:84px">납 기 일</th>
      <th style="width:96px">비 고</th>
    </tr>
  </thead>
  <tbody>{rows_html}
  </tbody>
</table>"""

    def build_total_footer() -> str:
        return f"""
<div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
  <table style="border-collapse:collapse;min-width:310px;border:1px solid #bbb;">
    <tr>
      <td style="background:#f4f4f4;padding:5px 16px;font-size:8.5pt;font-weight:600;color:#444;letter-spacing:1px;border:1px solid #ddd;width:120px;text-align:center;">공 급 가 액</td>
      <td style="padding:5px 16px;font-size:9.5pt;text-align:right;border:1px solid #ddd;">&#8361;&nbsp;{total_amount:,.0f}</td>
    </tr>
    <tr>
      <td style="background:#f4f4f4;padding:5px 16px;font-size:8.5pt;font-weight:600;color:#444;letter-spacing:1px;border:1px solid #ddd;text-align:center;">부 가 세 (10%)</td>
      <td style="padding:5px 16px;font-size:9.5pt;text-align:right;border:1px solid #ddd;color:#555;">&#8361;&nbsp;{vat:,.0f}</td>
    </tr>
    <tr style="background:#111;">
      <td style="padding:7px 16px;font-size:9pt;font-weight:700;color:#fff;letter-spacing:2px;border:1px solid #333;text-align:center;">합 계 금 액</td>
      <td style="padding:7px 16px;font-size:12pt;font-weight:800;color:#fff;text-align:right;border:1px solid #333;">&#8361;&nbsp;{total_with_vat:,.0f}</td>
    </tr>
  </table>
</div>
<div style="display:flex;gap:12px;font-size:7.5pt;color:#444;border-top:1.5px solid #111;padding-top:8px;">
  <div style="flex:1;padding-right:12px;border-right:1px solid #ddd;">
    <div style="font-weight:700;color:#111;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #ddd;">Terms &amp; Conditions</div>
    <p style="margin-bottom:3px;line-height:1.55;">1. 본 발주서는 ㈜넥스젬이 발행한 공식 구매 계약 문서로서, 수신 즉시 내용을 확인하시고 이상 여부를 담당자에게 통보하여 주시기 바랍니다.</p>
    <p style="margin-bottom:3px;line-height:1.55;">2. 납기일은 당사 자재 입고 완료 기준이며, 일정 변경이 예상되는 경우 출하 예정일 기준 5영업일 이전에 반드시 사전 통보하여 주시기 바랍니다.</p>
    <p style="margin-bottom:3px;line-height:1.55;">3. 납품 시 본 발주서에 기재된 품번·품명과 일치하는 거래명세표 및 품질성적서를 반드시 동봉하여 주시기 바랍니다.</p>
    <p style="line-height:1.55;">4. 품질 기준에 미달하는 제품은 입고 검사 후 전량 반품 처리되며, 이로 인한 제반 비용은 납품업체가 부담합니다.</p>
  </div>
  <div style="flex:1;padding-left:12px;border-left:2.5px solid #111;">
    <div style="font-weight:700;color:#111;letter-spacing:3px;text-transform:uppercase;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #ddd;">Remarks</div>
    <p style="margin-bottom:3px;line-height:1.55;">1. 본 발주서를 수령하신 후 3영업일 이내에 주문 내용에 대한 수락 여부를 서면으로 회신하여 주시기 바랍니다.</p>
    <p style="margin-bottom:3px;line-height:1.55;">2. 납기 일정 조정이 필요한 경우, 출하 예정일로부터 최소 5영업일 이전에 담당자와 사전 협의하여 주시기 바랍니다.</p>
    <p style="line-height:1.55;">3. 규격·재질·수량 등 발주 내용에 이의가 있으실 경우, 수락 회신 전 구매 담당자에게 즉시 연락하여 주시기 바랍니다.</p>
  </div>
</div>
<div style="height:2.5px;background:#111;margin-top:10px;"></div>"""

    # ── 페이지 HTML 조합 ──
    pages_html = ""
    for page_idx, page_rows in enumerate(pages):
        is_last = (page_idx == total_pages - 1)
        is_not_last = not is_last
        pages_html += f"""
<div class="po-page{' page-break' if is_not_last else ''}">
  {build_header(page_idx + 1)}
  {build_meta()}
  {build_items(page_rows)}
  {'<div style="flex:1;"></div>' + build_total_footer() if is_last else ''}
</div>"""

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>발주서 {g.group_no}</title>
<style>
  @page {{ size: A4 landscape; margin: 10mm 14mm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; font-size: 9.5pt; color: #111; background: #e8e8e8; }}

  .print-btn {{
    position: fixed; top: 14px; right: 16px; z-index: 999;
    padding: 9px 22px; background: #111; color: #fff;
    border: none; cursor: pointer;
    font-size: 9pt; font-family: inherit; font-weight: 600;
    letter-spacing: 1.5px; text-transform: uppercase;
  }}
  .print-btn:hover {{ background: #333; }}

  /* ── 페이지 박스 ── */
  .po-page {{
    background: #fff;
    width: 277mm; min-height: 190mm;
    margin: 16px auto;
    padding: 10mm 14mm;
    display: flex; flex-direction: column;
    box-shadow: 0 2px 12px rgba(0,0,0,.18);
  }}
  .page-break {{ page-break-after: always; margin-bottom: 0; }}

  @media print {{
    .print-btn {{ display: none; }}
    body {{ background: #fff; }}
    .po-page {{ margin: 0; box-shadow: none; padding: 10mm 14mm; width: 100%; min-height: 0; }}
  }}

  /* ── 헤더 ── */
  .doc-header {{
    display: flex; align-items: stretch;
    border-bottom: 2.5px solid #111;
    margin-bottom: 8px; padding-bottom: 8px;
  }}
  .doc-title-area {{ flex: 1; }}
  .doc-title {{ font-size: 24pt; font-weight: 800; letter-spacing: 16px; color: #111; line-height: 1; }}
  .doc-sub {{ font-size: 7pt; letter-spacing: 5px; color: #888; margin-top: 4px; text-transform: uppercase; }}
  .doc-right {{ display: flex; align-items: flex-start; padding-left: 20px; }}
  .doc-company {{ font-size: 10pt; font-weight: 700; color: #111; letter-spacing: 2px; text-align: right; line-height: 1.4; }}
  .doc-company span {{ font-size: 7pt; font-weight: 400; color: #888; letter-spacing: 3px; display: block; }}
  .doc-no {{ font-size: 8pt; color: #888; text-align: right; font-family: 'Courier New', monospace; margin-top: 2px; }}

  /* ── 결재란 ── */
  .approval-wrap {{ display: flex; border: 1px solid #ccc; margin-right: 16px; }}
  .approval-col {{ width: 55px; text-align: center; border-left: 1px solid #ddd; }}
  .approval-col:first-child {{ border-left: none; }}
  .approval-label {{ padding: 3px 0; font-size: 7.5pt; font-weight: 700; background: #111; color: #fff; letter-spacing: 2px; border-bottom: 1px solid #333; }}
  .approval-body {{ height: 40px; }}

  /* ── 기안 정보 테이블 ── */
  .meta-table {{ width: 100%; border-collapse: collapse; border: 1px solid #bbb; margin-bottom: 8px; }}
  .meta-table td {{ padding: 4px 10px; border: 1px solid #ddd; font-size: 9pt; vertical-align: middle; }}
  .meta-table .lbl {{ background: #111; color: #f0f0f0; font-weight: 600; width: 62px; text-align: center; white-space: nowrap; font-size: 8pt; letter-spacing: 1.5px; }}
  .meta-table .val {{ width: 158px; color: #222; }}
  .meta-table .emph {{ font-weight: 700; color: #111; }}
  .meta-table .due {{ font-weight: 700; color: #111; border-bottom: 2px solid #111; }}

  /* ── 품목 테이블 ── */
  .items-table {{ width: 100%; border-collapse: collapse; border: 1px solid #bbb; margin-bottom: 8px; font-size: 9pt; }}
  .items-table th {{ background: #111; color: #f0f0f0; padding: 6px; text-align: center; border-right: 1px solid #333; font-weight: 600; white-space: nowrap; letter-spacing: 1.5px; font-size: 8pt; }}
  .items-table td {{ padding: 5px 8px; border: 1px solid #e8e8e8; vertical-align: middle; }}
  .td-partno {{ font-family: 'Courier New', monospace; font-size: 8.5pt; color: #333; }}
  .td-amt {{ font-weight: 700; color: #111; text-align: right; }}
  .td-qty {{ text-align: right; font-weight: 600; }}
  .td-price {{ text-align: right; color: #444; }}
  .td-center {{ text-align: center; color: #666; }}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">&#128424; PDF 저장 / 인쇄</button>
{pages_html}
</body>
</html>"""
    return HTMLResponse(content=html)


@router.get("/{group_no}/pdf")
def download_pdf(group_no: str, db: Session = Depends(get_db)):
    """발주서 PDF 파일 다운로드"""
    g = db.get(PurchaseOrderGroup, group_no)
    if not g:
        raise HTTPException(404)

    partner = db.get(Partner, g.partner_id)
    partner_name = partner.name if partner else g.partner_id

    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os

    # 한글 폰트 등록 (Windows 맑은 고딕)
    font_path = r"C:\Windows\Fonts\malgun.ttf"
    if os.path.exists(font_path):
        pdfmetrics.registerFont(TTFont('Korean', font_path))
        font = 'Korean'
    else:
        font = 'Helvetica'

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=20*mm, rightMargin=20*mm,
                            topMargin=20*mm, bottomMargin=20*mm)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('title', fontName=font, fontSize=20, alignment=1, spaceAfter=4)
    normal = ParagraphStyle('normal', fontName=font, fontSize=10)
    small = ParagraphStyle('small', fontName=font, fontSize=9, textColor=colors.grey)

    story = []

    # 제목
    story.append(Paragraph('발  주  서', title_style))
    story.append(Paragraph(f'문서번호: {g.group_no}', ParagraphStyle('docno', fontName=font, fontSize=9, alignment=1, textColor=colors.grey, spaceAfter=12)))

    # 발주 정보 테이블
    info_data = [
        ['수  신', f'{partner_name} 귀중', '발주일자', str(g.order_date)],
        ['발  신', '넥스젬',              '납기일자', str(g.due_date)],
        ['비  고', g.note or '',          '',         ''],
    ]
    info_table = Table(info_data, colWidths=[25*mm, 70*mm, 25*mm, 45*mm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,-1), font),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('BACKGROUND', (0,0), (0,-1), colors.HexColor('#f5f5f5')),
        ('BACKGROUND', (2,0), (2,1), colors.HexColor('#f5f5f5')),
        ('FONTNAME', (1,0), (1,0), font), ('FONTSIZE', (1,0), (1,0), 11),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('SPAN', (1,2), (3,2)),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 8*mm))

    # 품목 테이블
    headers = ['No', '품번', '품명', '단위', '수량', '단가', '금액', '비고']
    col_widths = [10*mm, 30*mm, 45*mm, 12*mm, 18*mm, 22*mm, 22*mm, 25*mm]
    rows = [headers]
    total = 0
    for i, po in enumerate(g.lines, 1):
        item = db.get(Item, po.part_no)
        up = float(po.unit_price or (item.std_buy_price if item else 0) or 0)
        amt = po.qty * up
        total += amt
        rows.append([
            str(i), po.part_no,
            item.name if item else '',
            item.unit if item else 'EA',
            f'{po.qty:,}',
            f'₩{up:,.0f}',
            f'₩{amt:,.0f}',
            po.note or '',
        ])
    rows.append(['', '', '', '', '', '합계금액', f'₩{total:,.0f}', ''])

    item_table = Table(rows, colWidths=col_widths, repeatRows=1)
    item_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,-1), font),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1d4ed8')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('ALIGN', (1,1), (2,-1), 'LEFT'),
        ('ALIGN', (4,1), (6,-1), 'RIGHT'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#dddddd')),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, colors.HexColor('#f9f9f9')]),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#eef2ff')),
        ('FONTNAME', (0,-1), (-1,-1), font),
        ('PADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(item_table)
    story.append(Spacer(1, 8*mm))

    # 안내문
    story.append(Paragraph('※ 본 발주서는 넥스젬에서 발행한 공식 구매 문서입니다.', small))
    story.append(Paragraph('※ 납기일 준수 및 품질 기준을 반드시 확인하여 납품해 주시기 바랍니다.', small))

    doc.build(story)
    buf.seek(0)

    from urllib.parse import quote
    filename = f'발주서_{g.group_no}.pdf'
    encoded = quote(filename, safe='')
    return StreamingResponse(
        buf,
        media_type='application/pdf',
        headers={'Content-Disposition': f"attachment; filename*=UTF-8''{encoded}"}
    )
