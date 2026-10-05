from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import date
from io import BytesIO
from calendar import monthrange
from urllib.parse import quote

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from app.database import get_db
from app.models.master import Item, BomLine, Partner
from app.models.purchase import PurchaseOrder, Receipt, ReceiptStatus, POStatus
from app.models.sales import SalesOrder, Shipment, ShipmentStatus, SOStatus
from app.models.quality import Inspection
from app.models.production import MonthlyPlan
from app.models.ledger import StockLedger
from app.services.ledger_service import get_stock
from sqlalchemy import func, extract

router = APIRouter(prefix="/reports", tags=["보고서"])

INHOUSE_PARTS = [
    ('GC1-AS-0096', '2P HGM100 (15~50A)'),
    ('GC1-AS-0097', '3P HGM100 (15~50A)'),
    ('GC1-AS-0098', '4P HGM100 (15~50A)'),
    ('GC1-AS-0099', '2P HGM100'),
    ('GC1-AS-0100', '3P HGM100'),
    ('GC1-AS-0101', '4P HGM100'),
    ('GC1-AS-0117', '3P IN HEX HGM100'),
    ('GC1-AS-0303', '3P MBOLT HGM100 (15~50A)'),
    ('GC1-AS-0305', '3P MBOLT HGM100'),
    ('GC1-AS-0306', '4P MBOLT HGM100'),
    ('GC3-AS-0065', '2P HGM250'),
    ('GC3-AS-0092', '3P MBOLT HGM250'),
    ('GC3-AS-0094', '4P MBOLT HGM250'),
]
OUTSOURCED_PARTS = [
    ('GC3-AS-0065', '2P HGM250'),
    ('GC3-AS-0066', '3P HGM250'),
    ('GC3-AS-0067', '4P HGM250'),
    ('GP1-AS-0001', '3P HGP160'),
    ('GP1-AS-0002', '4P HGP160'),
    ('GP2-AS-0058', '3P HGP250-G'),
    ('GP2-AS-0059', '4P HGP250-G'),
]
PACK_FEE = 80.0

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SONY 스타일 팔레트
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
C_BLACK   = '0D0D0D'   # 소니 블랙
C_DKGRAY  = '1C1C1E'   # 섹션 헤더
C_MGRAY   = '3A3A3C'   # 서브 헤더
C_LGRAY   = '8E8E93'   # 보조 텍스트
C_SILVER  = 'E5E5EA'   # 구분선
C_SNOW    = 'F9F9FB'   # 홀수행 배경
C_WHITE   = 'FFFFFF'
C_RED     = 'FF3B30'   # 소니 레드 (마이너스)
C_BLUE    = '0A84FF'   # 강조 숫자
C_GREEN   = '30D158'   # 플러스 이익
C_AMBER   = 'FF9F0A'   # 주의

MF  = '#,##0'
MF0 = '#,##0.0'
PF  = '0.0%'
AF  = '@'

def _f(h): return PatternFill('solid', fgColor=h)

def _side(w='thin', c=C_SILVER):
    return Side(style=w, color=c)

def _border(l=C_SILVER, r=C_SILVER, t=C_SILVER, b=C_SILVER):
    return Border(left=_side(c=l), right=_side(c=r),
                  top=_side(c=t), bottom=_side(c=b))

def _border_bottom(color=C_SILVER, style='thin'):
    n = Side(style=None)
    return Border(bottom=Side(style=style, color=color))

def _font(bold=False, size=9, color=C_BLACK, name='Arial'):
    return Font(name=name, bold=bold, size=size, color=color)

def _al(h='left', v='center', wrap=False):
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)

def _set(c, val=None, fmt=None, font=None, fill=None, align=None, border=None, height=None):
    if val is not None: c.value = val
    if fmt:    c.number_format = fmt
    if font:   c.font   = font
    if fill:   c.fill   = fill
    if align:  c.alignment = align
    if border: c.border = border


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  데이터 수집 헬퍼
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _bom_cost(db, part_no):
    lines = db.query(BomLine).filter(BomLine.product_part_no == part_no).all()
    return sum(
        float(l.qty_per) * float(getattr(db.get(Item, l.component_part_no), 'std_buy_price', 0) or 0)
        for l in lines
    )

def _ship_data(db, part_no, month_start, month_end):
    # 내부 품번으로 직접 조회
    part_nos = [part_no]
    # 품명에 내부 코드가 포함된 연결 품번 추가 (예: GP1-AS-0001 → GP1_AS_0001 포함 품목)
    alt_code = part_no.replace('-', '_')
    linked = db.query(Item).filter(Item.name.ilike(f'%{alt_code}%'), Item.part_no != part_no).all()
    part_nos += [i.part_no for i in linked]

    ships = db.query(Shipment).filter(
        Shipment.part_no.in_(part_nos),
        Shipment.status == ShipmentStatus.confirmed,
        Shipment.ship_date >= month_start,
        Shipment.ship_date <= month_end,
    ).all()
    return sum(s.qty for s in ships), sum(s.qty * float(s.unit_price) for s in ships)

def _plan_data(db, part_no, year, month):
    plan = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == year,
        MonthlyPlan.month == month,
        MonthlyPlan.part_no == part_no,
    ).first()
    if not plan:
        return 0, 0
    planned = plan.planned_qty
    actual  = sum(a.actual_qty for a in plan.actuals)
    return planned, actual


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  공통 레이아웃 유틸
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _col_widths(ws, widths):
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

def _freeze(ws, cell='B4'):
    ws.freeze_panes = cell

def _page_title(ws, ncols, year, month, subtitle):
    cl = get_column_letter(ncols)
    ws.sheet_view.showGridLines = False

    # 회사명 라인
    ws.merge_cells(f'A1:{cl}1')
    c = ws['A1']
    c.value = 'NEXGEM CO., LTD.'
    c.font  = _font(bold=True, size=8, color=C_LGRAY)
    c.fill  = _f(C_BLACK)
    c.alignment = _al('left')
    c.border = Border()
    ws.row_dimensions[1].height = 14

    # 메인 타이틀
    ws.merge_cells(f'A2:{cl}2')
    c = ws['A2']
    c.value = f'스페어파트 손익보고서  —  {year}.{month:02d}'
    c.font  = _font(bold=True, size=16, color=C_WHITE, name='Arial')
    c.fill  = _f(C_BLACK)
    c.alignment = _al('left')
    c.border = Border()
    ws.row_dimensions[2].height = 36

    # 서브타이틀
    ws.merge_cells(f'A3:{cl}3')
    c = ws['A3']
    c.value = subtitle
    c.font  = _font(bold=False, size=9, color=C_LGRAY)
    c.fill  = _f(C_DKGRAY)
    c.alignment = _al('left')
    c.border = Border()
    ws.row_dimensions[3].height = 18

def _col_header(ws, row, headers, bg=C_DKGRAY, fg=C_WHITE, height=32):
    ws.row_dimensions[row].height = height
    for ci, h in enumerate(headers, 1):
        c = ws.cell(row, ci, h)
        c.font      = _font(bold=True, size=8, color=fg)
        c.fill      = _f(bg)
        c.alignment = _al('center', wrap=True)
        c.border    = Border(
            bottom=Side(style='medium', color=C_WHITE),
            right=Side(style='thin', color='2C2C2E'),
        )

def _data_row(ws, row, cells_data, bg=C_WHITE):
    ws.row_dimensions[row].height = 17
    for col, val, fmt, bold, color, align in cells_data:
        c = ws.cell(row, col, val)
        c.font      = _font(bold=bold, size=9, color=color)
        c.fill      = _f(bg)
        c.alignment = _al(align)
        c.border    = Border(bottom=Side(style='thin', color=C_SILVER))
        if fmt: c.number_format = fmt

def _total_bar(ws, row, ncols, merge_to, formula_map, label='합  계'):
    ws.row_dimensions[row].height = 20
    ws.merge_cells(f'A{row}:{get_column_letter(merge_to)}{row}')
    c = ws[f'A{row}']
    c.value     = label
    c.font      = _font(bold=True, size=9, color=C_WHITE)
    c.fill      = _f(C_MGRAY)
    c.alignment = _al('center')
    c.border    = Border()
    for ci, formula in formula_map.items():
        c = ws.cell(row, ci, formula)
        c.font      = _font(bold=True, size=9, color=C_WHITE)
        c.fill      = _f(C_MGRAY)
        c.number_format = MF
        c.alignment = _al('right')
        c.border    = Border()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  시트 1 : 자체생산
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _sheet_inhouse(ws, rows, year, month):
    _col_widths(ws, [15, 22, 11, 10, 11, 12, 14, 12, 14, 14, 14, 11, 14])
    _page_title(ws, 13, year, month, '자체생산  ·  BOM 단위원가 기준')

    hdrs = ['품번', '품명',
            'BOM\n단위원가', '판매\n단가',
            '계획\n수량', '실적\n수량', '달성률',
            '출하\n수량', '매출액\n(₩)', '매출원가\n(₩)', '매출총이익\n(₩)',
            '월말\n재고', '월말재고\n금액(₩)']
    _col_header(ws, 4, hdrs)

    for ri, r in enumerate(rows, 5):
        bg = C_SNOW if ri % 2 == 0 else C_WHITE
        rate = r['actual_qty'] / r['planned_qty'] if r['planned_qty'] else None
        rate_str = f"{rate*100:.1f}%" if rate is not None else '—'
        rate_color = (C_GREEN if rate and rate >= 1.0
                      else C_AMBER if rate and rate >= 0.8
                      else C_RED if rate is not None else C_LGRAY)
        p = r['profit']
        _data_row(ws, ri, [
            (1,  r['part_no'],   AF,  False, C_MGRAY,  'left'),
            (2,  r['label'],     AF,  False, C_BLACK,  'left'),
            (3,  r['unit_cost'], MF,  False, C_BLACK,  'right'),
            (4,  r['sell_price'],MF,  False, C_BLACK,  'right'),
            (5,  r['planned_qty'],MF, False, C_LGRAY,  'right'),
            (6,  r['actual_qty'], MF, True,  C_BLACK,  'right'),
            (7,  rate_str,       AF,  True,  rate_color,'center'),
            (8,  r['ship_qty'],  MF,  False, C_BLACK,  'right'),
            (9,  r['ship_amt'],  MF,  False, C_BLACK,  'right'),
            (10, r['cogs'],      MF,  False, C_BLACK,  'right'),
            (11, p,              MF,  True,  C_GREEN if p >= 0 else C_RED, 'right'),
            (12, r['stk_qty'],   MF,  False, C_BLACK,  'right'),
            (13, r['stk_amt'],   MF,  False, C_BLACK,  'right'),
        ], bg)

    tr = 5 + len(rows)
    _total_bar(ws, tr, 13, 4, {
        5:  f'=SUM(E5:E{tr-1})',
        6:  f'=SUM(F5:F{tr-1})',
        8:  f'=SUM(H5:H{tr-1})',
        9:  f'=SUM(I5:I{tr-1})',
        10: f'=SUM(J5:J{tr-1})',
        11: f'=SUM(K5:K{tr-1})',
        12: f'=SUM(L5:L{tr-1})',
        13: f'=SUM(M5:M{tr-1})',
    })

    nr = tr + 1
    ws.merge_cells(f'A{nr}:M{nr}')
    ws[f'A{nr}'] = '* BOM 단위원가: BOM 구성부품 매입단가 합산  |  매출원가 = 출하수량 × BOM 단위원가'
    ws[f'A{nr}'].font = _font(size=7, color=C_LGRAY)
    ws[f'A{nr}'].alignment = _al('left')
    ws.row_dimensions[nr].height = 13


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  시트 2 : 외주처
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _sheet_outsourced(ws, rows, year, month):
    _col_widths(ws, [15, 22, 11, 10, 11, 11, 12, 14, 14, 14, 11, 14])
    _page_title(ws, 12, year, month,
                f'외주생산  ·  BOM 재료비 + 포장비 {int(PACK_FEE)}원/개')

    hdrs = ['품번', '품명',
            'BOM\n재료비', '포장비', '합계\n원가',
            '판매\n단가',
            '출하\n수량', '매출액\n(₩)', '매출원가\n(₩)', '매출총이익\n(₩)',
            '월말\n재고', '월말재고\n금액(₩)']
    _col_header(ws, 4, hdrs)

    for ri, r in enumerate(rows, 5):
        bg = C_SNOW if ri % 2 == 0 else C_WHITE
        p  = r['profit']
        _data_row(ws, ri, [
            (1,  r['part_no'],   AF, False, C_MGRAY, 'left'),
            (2,  r['label'],     AF, False, C_BLACK, 'left'),
            (3,  r['bom_cost'],  MF, False, C_BLACK, 'right'),
            (4,  r['pack_fee'],  MF, False, C_LGRAY, 'right'),
            (5,  r['unit_cost'], MF, True,  C_BLUE,  'right'),
            (6,  r['sell_price'],MF, False, C_BLACK, 'right'),
            (7,  r['ship_qty'],  MF, False, C_BLACK, 'right'),
            (8,  r['ship_amt'],  MF, False, C_BLACK, 'right'),
            (9,  r['cogs'],      MF, False, C_BLACK, 'right'),
            (10, p,              MF, True,  C_GREEN if p >= 0 else C_RED, 'right'),
            (11, r['stk_qty'],   MF, False, C_BLACK, 'right'),
            (12, r['stk_amt'],   MF, False, C_BLACK, 'right'),
        ], bg)

    tr = 5 + len(rows)
    _total_bar(ws, tr, 12, 6, {
        7:  f'=SUM(G5:G{tr-1})',
        8:  f'=SUM(H5:H{tr-1})',
        9:  f'=SUM(I5:I{tr-1})',
        10: f'=SUM(J5:J{tr-1})',
        11: f'=SUM(K5:K{tr-1})',
        12: f'=SUM(L5:L{tr-1})',
    })

    nr = tr + 1
    ws.merge_cells(f'A{nr}:L{nr}')
    ws[f'A{nr}'] = f'* 합계원가 = BOM 재료비 + 포장비({int(PACK_FEE)}원/개)  |  외주품: 출하 시 포장비 기준으로 입고 자동 반영'
    ws[f'A{nr}'].font = _font(size=7, color=C_LGRAY)
    ws[f'A{nr}'].alignment = _al('left')
    ws.row_dimensions[nr].height = 13


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  시트 3 : 종합요약
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _sheet_summary(ws, rows_in, rows_out, year, month):
    _col_widths(ws, [26, 17, 17, 17, 13])
    _page_title(ws, 5, year, month, '손익 종합요약  ·  자체생산 + 외주')

    def blk_hdr(row, label):
        ws.row_dimensions[row].height = 14
        ws.merge_cells(f'A{row}:E{row}')
        c = ws[f'A{row}']; c.value = label
        c.font = _font(bold=True, size=7, color=C_LGRAY)
        c.fill = _f(C_DKGRAY)
        c.alignment = _al('left')
        c.border = Border()

    def tbl_hdr(row, hdrs):
        ws.row_dimensions[row].height = 22
        for ci, h in enumerate(hdrs, 1):
            c = ws.cell(row, ci, h)
            c.font = _font(bold=True, size=8, color=C_WHITE)
            c.fill = _f(C_MGRAY)
            c.alignment = _al('center')
            c.border = Border(bottom=Side(style='medium', color=C_WHITE),
                              right=Side(style='thin', color=C_DKGRAY))

    def tbl_row(row, vals, bg=C_WHITE):
        ws.row_dimensions[row].height = 17
        for ci, (val, fmt, bold, color, align) in enumerate(vals, 1):
            c = ws.cell(row, ci, val)
            c.font = _font(bold=bold, size=9, color=color)
            c.fill = _f(bg)
            c.number_format = fmt
            c.alignment = _al(align)
            c.border = Border(bottom=Side(style='thin', color=C_SILVER))

    def sub_total(row, data_s, data_e, bg=C_MGRAY):
        ws.row_dimensions[row].height = 19
        ws[f'A{row}'] = '소  계'
        ws[f'A{row}'].font = _font(bold=True, size=9, color=C_WHITE)
        ws[f'A{row}'].fill = _f(bg)
        ws[f'A{row}'].alignment = _al('center')
        ws[f'A{row}'].border = Border()
        for col in ['B','C','D']:
            ws[f'{col}{row}'] = f'=SUM({col}{data_s}:{col}{data_e})'
            ws[f'{col}{row}'].font = _font(bold=True, size=9, color=C_WHITE)
            ws[f'{col}{row}'].fill = _f(bg)
            ws[f'{col}{row}'].number_format = MF
            ws[f'{col}{row}'].alignment = _al('right')
            ws[f'{col}{row}'].border = Border()
        ws[f'E{row}'] = f'=IFERROR(D{row}/B{row},0)'
        ws[f'E{row}'].font = _font(bold=True, size=9, color=C_WHITE)
        ws[f'E{row}'].fill = _f(bg)
        ws[f'E{row}'].number_format = PF
        ws[f'E{row}'].alignment = _al('center')
        ws[f'E{row}'].border = Border()

    COLS = [('품명','left'),('매출액 (₩)','right'),
            ('매출원가 (₩)','right'),('매출총이익 (₩)','right'),('이익률','center')]

    # ── 자체생산 ──
    blk_hdr(4, '  자체생산')
    tbl_hdr(5, [c[0] for c in COLS])
    r = 6
    for row in rows_in:
        m = row['profit'] / row['ship_amt'] if row['ship_amt'] else 0
        tbl_row(r, [
            (row['label'],   AF, False, C_BLACK,  'left'),
            (row['ship_amt'],MF, False, C_BLACK,  'right'),
            (row['cogs'],    MF, False, C_BLACK,  'right'),
            (row['profit'],  MF, True,  C_GREEN if row['profit'] >= 0 else C_RED, 'right'),
            (m,              PF, True,  C_GREEN if m >= 0 else C_RED, 'center'),
        ], C_SNOW if r % 2 == 0 else C_WHITE)
        r += 1
    in_end = r - 1
    sub_total(r, 6, in_end, C_MGRAY)
    in_total = r; r += 2

    # ── 외주생산 ──
    blk_hdr(r, '  외주생산'); r += 1
    tbl_hdr(r, [c[0] for c in COLS]); r += 1
    out_start = r
    for row in rows_out:
        m = row['profit'] / row['ship_amt'] if row['ship_amt'] else 0
        tbl_row(r, [
            (row['label'],   AF, False, C_BLACK,  'left'),
            (row['ship_amt'],MF, False, C_BLACK,  'right'),
            (row['cogs'],    MF, False, C_BLACK,  'right'),
            (row['profit'],  MF, True,  C_GREEN if row['profit'] >= 0 else C_RED, 'right'),
            (m,              PF, True,  C_GREEN if m >= 0 else C_RED, 'center'),
        ], C_SNOW if r % 2 == 0 else C_WHITE)
        r += 1
    out_end = r - 1
    sub_total(r, out_start, out_end, C_MGRAY)
    out_total = r; r += 2

    # ── 종합 ──
    blk_hdr(r, '  종합'); r += 1
    tbl_hdr(r, [c[0] for c in COLS]); r += 1
    t_sales  = sum(x['ship_amt'] for x in rows_in + rows_out)
    t_cogs   = sum(x['cogs']     for x in rows_in + rows_out)
    t_profit = sum(x['profit']   for x in rows_in + rows_out)
    t_margin = t_profit / t_sales if t_sales else 0
    ws.row_dimensions[r].height = 22
    for ci, (val, fmt, bold, color, align) in enumerate([
        ('합  계',  AF, True, C_WHITE, 'center'),
        (t_sales,   MF, True, C_WHITE, 'right'),
        (t_cogs,    MF, True, C_WHITE, 'right'),
        (t_profit,  MF, True, C_WHITE, 'right'),
        (t_margin,  PF, True, C_WHITE, 'center'),
    ], 1):
        c = ws.cell(r, ci, val)
        c.font = _font(bold=bold, size=10, color=color)
        c.fill = _f(C_BLACK)
        c.number_format = fmt
        c.alignment = _al(align)
        c.border = Border()
    r += 2

    # ── 월말 재고 ──
    blk_hdr(r, '  월말 재고현황'); r += 1
    tbl_hdr(r, ['구분', '수량 (EA)', '금액 (₩)', '산출기준', '']); r += 1
    stk_rows = [
        ('자체생산', sum(x['stk_qty'] for x in rows_in),  sum(x['stk_amt'] for x in rows_in),  'BOM 단위원가'),
        ('외주생산', sum(x['stk_qty'] for x in rows_out), sum(x['stk_amt'] for x in rows_out), 'BOM재료비+포장비'),
    ]
    for ri2, (cat, qty, amt, basis) in enumerate(stk_rows, r):
        bg = C_SNOW if ri2 % 2 == 0 else C_WHITE
        tbl_row(ri2, [
            (cat,   AF, False, C_BLACK, 'left'),
            (qty,   MF, True,  C_BLUE,  'right'),
            (amt,   MF, True,  C_BLUE,  'right'),
            (basis, AF, False, C_LGRAY, 'left'),
            ('',    AF, False, C_BLACK, 'left'),
        ], bg)
    r = ri2 + 1
    # 합계
    tot_qty = sum(x['stk_qty'] for x in rows_in + rows_out)
    tot_amt = sum(x['stk_amt'] for x in rows_in + rows_out)
    ws.row_dimensions[r].height = 19
    for ci, (val, fmt, bold, color, align) in enumerate([
        ('합  계', AF, True, C_WHITE, 'center'),
        (tot_qty, MF, True, C_WHITE, 'right'),
        (tot_amt, MF, True, C_WHITE, 'right'),
        ('',      AF, False,C_WHITE, 'left'),
        ('',      AF, False,C_WHITE, 'left'),
    ], 1):
        c = ws.cell(r, ci, val)
        c.font = _font(bold=bold, size=9, color=color)
        c.fill = _f(C_MGRAY)
        c.number_format = fmt
        c.alignment = _al(align)
        c.border = Border()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  시트 4 : 경영분석 (자동 생성)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _sheet_analysis(ws, rows_in, rows_out, year, month):
    _col_widths(ws, [22, 60, 14])
    ws.sheet_view.showGridLines = False

    # ── 타이틀 ──
    for row in [1, 2, 3]:
        ws.merge_cells(f'A{row}:C{row}')
    ws['A1'].value = 'NEXGEM CO., LTD.'
    ws['A1'].font  = _font(bold=True, size=8, color=C_LGRAY)
    ws['A1'].fill  = _f(C_BLACK); ws['A1'].alignment = _al('left')
    ws.row_dimensions[1].height = 14

    ws['A2'].value = f'경영 분석보고서  —  {year}.{month:02d}'
    ws['A2'].font  = _font(bold=True, size=16, color=C_WHITE)
    ws['A2'].fill  = _f(C_BLACK); ws['A2'].alignment = _al('left')
    ws.row_dimensions[2].height = 36

    ws['A3'].value = '자동 생성 · 데이터 출처: ERP 재고원장 및 생산실적'
    ws['A3'].font  = _font(size=9, color=C_LGRAY)
    ws['A3'].fill  = _f(C_DKGRAY); ws['A3'].alignment = _al('left')
    ws.row_dimensions[3].height = 18

    def section(row, title):
        ws.merge_cells(f'A{row}:C{row}')
        c = ws[f'A{row}']; c.value = title
        c.font = _font(bold=True, size=9, color=C_WHITE)
        c.fill = _f(C_MGRAY); c.alignment = _al('left')
        c.border = Border()
        ws.row_dimensions[row].height = 20
        return row + 1

    def kv(ws, row, key, val, val_color=C_BLACK, val_bold=False):
        ws.row_dimensions[row].height = 17
        c = ws['A' + str(row)]; c.value = key
        c.font = _font(size=9, color=C_LGRAY)
        c.fill = _f(C_SNOW); c.alignment = _al('left')
        c.border = Border(bottom=Side(style='thin', color=C_SILVER))
        ws.merge_cells(f'B{row}:C{row}')
        c2 = ws['B' + str(row)]; c2.value = val
        c2.font = _font(bold=val_bold, size=9, color=val_color)
        c2.fill = _f(C_SNOW); c2.alignment = _al('left')
        c2.border = Border(bottom=Side(style='thin', color=C_SILVER))
        return row + 1

    def text_block(ws, row, lines, bg=C_WHITE):
        for line in lines:
            ws.merge_cells(f'A{row}:C{row}')
            c = ws[f'A{row}']; c.value = line
            indent = line.startswith('  ') or line.startswith('▶') or line.startswith('•')
            c.font = _font(size=9,
                           color=C_BLACK if line.startswith('▶') else
                                 C_RED   if '미달' in line or '손실' in line or '부족' in line else
                                 C_GREEN if '달성' in line and '100' in line else
                                 C_BLUE  if line.startswith('  →') else C_BLACK)
            c.fill = _f(bg); c.alignment = _al('left')
            c.border = Border(bottom=Side(style='thin', color=C_SILVER))
            ws.row_dimensions[row].height = 16 if line.strip() else 8
            row += 1
        return row

    # ── 분석 데이터 계산 ──
    t_sales   = sum(x['ship_amt'] for x in rows_in + rows_out)
    t_cogs    = sum(x['cogs']     for x in rows_in + rows_out)
    t_profit  = t_sales - t_cogs
    t_margin  = t_profit / t_sales * 100 if t_sales else 0

    # 자체생산 달성률 분석
    in_planned = sum(r['planned_qty'] for r in rows_in)
    in_actual  = sum(r['actual_qty']  for r in rows_in)
    in_rate    = in_actual / in_planned * 100 if in_planned else 0

    # 100% 달성 시 가상 매출/순익 (출하 기반)
    # 자체생산: 100% 달성했으면 출하도 동일하다는 가정 — 재고 여유는 있으나
    # 여기서는 보수적으로 "추가 생산했어도 추가 출하가 있었을 것"으로 봄
    # 순익 손실 = (계획 - 실적) × BOM단위원가 (생산 안 한 만큼 원가 투입 기회 손실)
    lost_prod_cost = sum(
        max(0, r['planned_qty'] - r['actual_qty']) * r['unit_cost']
        for r in rows_in
    )
    # 출하 기반 순익 손실 — 100% 생산했으면 팔 수 있었던 잠재 매출 추정
    # 단순 비례: 현 매출 / 실적비율 = 100%시 예상 매출
    potential_sales = sum(
        (r['ship_amt'] / (r['actual_qty'] / r['planned_qty'])
         if r['planned_qty'] and r['actual_qty'] else r['ship_amt'])
        for r in rows_in
    )
    potential_profit_in = sum(
        (r['ship_amt'] / (r['actual_qty'] / r['planned_qty']) * (1 - r['unit_cost'] / r['sell_price'])
         if r['planned_qty'] and r['actual_qty'] and r['sell_price']
         else r['profit'])
        for r in rows_in
    )
    lost_profit_in = potential_profit_in - sum(r['profit'] for r in rows_in)

    # 미달 품목
    underperform = [r for r in rows_in
                    if r['planned_qty'] and r['actual_qty'] < r['planned_qty']]
    overperform  = [r for r in rows_in
                    if r['planned_qty'] and r['actual_qty'] >= r['planned_qty']]

    # 외주처 상위 기여 품목
    out_sorted = sorted(rows_out, key=lambda x: x['profit'], reverse=True)
    top_out    = [r for r in out_sorted if r['profit'] > 0]
    zero_out   = [r for r in rows_out if r['ship_qty'] == 0]

    # ── 시트 작성 ──
    r = 4
    r = section(r, '  01  월간 손익 요약')
    r = kv(ws, r, '매출 합계', f"₩{t_sales:,.0f}", C_BLUE, True)
    r = kv(ws, r, '매출원가 합계', f"₩{t_cogs:,.0f}", C_BLACK)
    r = kv(ws, r, '매출총이익', f"₩{t_profit:,.0f}",
           C_GREEN if t_profit >= 0 else C_RED, True)
    r = kv(ws, r, '매출총이익률', f"{t_margin:.1f}%",
           C_GREEN if t_margin >= 30 else C_AMBER if t_margin >= 10 else C_RED, True)
    r += 1

    r = section(r, '  02  자체생산 달성 현황')
    r = kv(ws, r, '월 생산계획 합계', f"{in_planned:,} EA")
    r = kv(ws, r, '월 생산실적 합계', f"{in_actual:,} EA",
           C_GREEN if in_rate >= 100 else C_AMBER if in_rate >= 80 else C_RED, True)
    r = kv(ws, r, '달성률', f"{in_rate:.1f}%",
           C_GREEN if in_rate >= 100 else C_AMBER if in_rate >= 80 else C_RED, True)

    if in_rate >= 100:
        r = text_block(ws, r, [
            '▶ 이번 달 자체생산은 계획 대비 100% 이상 달성하였습니다.',
            '  → 전 품목 정상 생산 완료. 재고 확보 및 납기 대응에 문제 없습니다.',
        ], C_SNOW)
    else:
        r = text_block(ws, r, [
            f'▶ 이번 달 자체생산 달성률은 {in_rate:.1f}% 로 계획 대비 미달입니다.',
        ], C_SNOW)
        if underperform:
            lines = ['  미달 품목:']
            for u in underperform:
                gap = u['planned_qty'] - u['actual_qty']
                rate_u = u['actual_qty'] / u['planned_qty'] * 100
                lines.append(f"  • {u['label']} ({u['part_no']})  "
                             f"계획 {u['planned_qty']:,} → 실적 {u['actual_qty']:,}  "
                             f"미달 {gap:,} EA  ({rate_u:.0f}%)")
            r = text_block(ws, r, lines, C_SNOW)
    r += 1

    r = section(r, '  03  기회손실 분석  (100% 달성 가정)')
    if in_rate < 100 and in_rate > 0:
        r = text_block(ws, r, [
            f'▶ 생산 달성률이 {in_rate:.1f}% 에 그쳐 아래와 같은 기회손실이 발생했습니다.',
            '',
            f'  계획 대비 미달 생산량 기준 예상 추가 순익:',
            f'  → 약 ₩{lost_profit_in:,.0f} 의 이익 기회가 손실되었습니다.',
            '',
            f'  100% 달성 시 예상 자체생산 순익: ₩{potential_profit_in:,.0f}',
            f'  실제 자체생산 순익:             ₩{sum(r["profit"] for r in rows_in):,.0f}',
            f'  차이 (기회손실):                ₩{lost_profit_in:,.0f}',
        ], C_SNOW)
    elif in_rate >= 100:
        r = text_block(ws, r, [
            '▶ 100% 이상 달성으로 기회손실 없음. 우수한 생산 실행력입니다.',
        ], C_SNOW)
    else:
        r = text_block(ws, r, [
            '▶ 생산 실적 데이터가 없습니다. 생산계획 등록 후 실적 입력이 필요합니다.',
        ], C_SNOW)
    r += 1

    r = section(r, '  04  외주 품목 실적')
    if top_out:
        lines = ['▶ 이번 달 외주 출하 실적:']
        for o in top_out:
            m = o['profit'] / o['ship_amt'] * 100 if o['ship_amt'] else 0
            lines.append(f"  • {o['label']}  출하 {o['ship_qty']:,} EA  "
                         f"매출 ₩{o['ship_amt']:,.0f}  순익 ₩{o['profit']:,.0f}  (마진 {m:.1f}%)")
        r = text_block(ws, r, lines, C_SNOW)
    if zero_out:
        lines = ['▶ 이번 달 출하 없는 외주 품목:']
        for o in zero_out:
            lines.append(f"  • {o['label']} ({o['part_no']})  재고 {o['stk_qty']:,} EA")
        r = text_block(ws, r, lines, C_SNOW)
    r += 1

    r = section(r, '  05  개선 권고사항')
    recs = []

    if in_rate < 100:
        recs.append(('생산 달성률 개선',
                     f"자체생산 달성률 {in_rate:.1f}% → 목표 100%. "
                     f"미달 품목 {[u['part_no'] for u in underperform]} 의 병목 원인을 파악하고 "
                     f"일별 실적 모니터링 강화 및 작업 우선순위 재배분을 권장합니다."))

    if in_rate < 80:
        recs.append(('긴급 재고 점검',
                     f"달성률 {in_rate:.1f}% 는 위험 수준입니다. "
                     "미달 품목의 현재고를 즉시 점검하고 고객 납기 영향 여부를 확인하십시오."))

    if zero_out:
        zero_names = [o['label'] for o in zero_out]
        recs.append(('외주 품목 수주 확인',
                     f"{', '.join(zero_names)} 이번 달 출하 0건. "
                     "고객사 수주 현황 및 외주처 생산 준비 상태를 확인하여 "
                     "다음 달 물량 확보 계획을 수립하십시오."))

    if t_margin < 30:
        recs.append(('이익률 개선',
                     f"매출총이익률 {t_margin:.1f}% — 목표 30% 이상. "
                     "BOM 구성품 단가 재협상 또는 판매단가 조정 검토가 필요합니다."))

    if not recs:
        recs.append(('전반적 양호',
                     '이번 달 생산 및 판매 지표가 모두 정상 범위입니다. 현 운영 방식을 유지하십시오.'))

    for i, (title_r, body_r) in enumerate(recs, 1):
        r = text_block(ws, r, [
            f'  {i}.  {title_r}',
            f'     {body_r}',
            '',
        ], C_WHITE if i % 2 == 0 else C_SNOW)

    # 생성일시 푸터
    from datetime import datetime
    r += 1
    ws.merge_cells(f'A{r}:C{r}')
    ws[f'A{r}'].value = f'생성일시: {datetime.now().strftime("%Y-%m-%d %H:%M")}  |  NEXGEM ERP 시스템'
    ws[f'A{r}'].font  = _font(size=7, color=C_LGRAY)
    ws[f'A{r}'].fill  = _f(C_BLACK)
    ws[f'A{r}'].alignment = _al('right')
    ws.row_dimensions[r].height = 14


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  엔드포인트
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@router.get("/spare-part-pl")
def spare_part_pl(
    year:  int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    month_start = date(year, month, 1)
    month_end   = date(year, month, monthrange(year, month)[1])

    rows_in = []
    for pno, label in INHOUSE_PARTS:
        it  = db.get(Item, pno)
        uc  = _bom_cost(db, pno)
        sp  = float(it.std_sell_price) if it else 0.0
        sq, sa = _ship_data(db, pno, month_start, month_end)
        planned, actual = _plan_data(db, pno, year, month)
        stk = get_stock(db, pno)
        cogs = sq * uc
        rows_in.append({
            'part_no': pno, 'label': label,
            'unit_cost': uc, 'sell_price': sp,
            'planned_qty': planned, 'actual_qty': actual,
            'ship_qty': sq, 'ship_amt': sa,
            'cogs': cogs, 'profit': sa - cogs,
            'stk_qty': stk, 'stk_amt': stk * uc,
        })

    rows_out = []
    for pno, label in OUTSOURCED_PARTS:
        it  = db.get(Item, pno)
        bom = _bom_cost(db, pno)
        uc  = bom + PACK_FEE
        sp  = float(it.std_sell_price) if it else 0.0
        sq, sa = _ship_data(db, pno, month_start, month_end)
        stk = get_stock(db, pno)
        cogs = sq * uc
        rows_out.append({
            'part_no': pno, 'label': label,
            'bom_cost': bom, 'pack_fee': PACK_FEE,
            'unit_cost': uc, 'sell_price': sp,
            'ship_qty': sq, 'ship_amt': sa,
            'cogs': cogs, 'profit': sa - cogs,
            'stk_qty': stk, 'stk_amt': stk * uc,
        })

    wb = openpyxl.Workbook()

    ws1 = wb.active; ws1.title = '자체생산'
    _sheet_inhouse(ws1, rows_in, year, month)

    ws2 = wb.create_sheet('외주처')
    _sheet_outsourced(ws2, rows_out, year, month)

    ws3 = wb.create_sheet('종합요약')
    _sheet_summary(ws3, rows_in, rows_out, year, month)

    ws4 = wb.create_sheet('경영분석')
    _sheet_analysis(ws4, rows_in, rows_out, year, month)

    # 기본 시트를 종합요약으로
    wb.active = ws3

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    fn_ascii = f"SPARE_PART_{year}_{month:02d}.xlsx"
    fn_kor   = f"SPARE_PART_손익보고서_{year}년{month:02d}월.xlsx"
    encoded  = quote(fn_kor, safe='')
    return StreamingResponse(
        buf,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f"attachment; filename={fn_ascii}; filename*=UTF-8''{encoded}"},
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  납기준수율 종합 보고서
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _grade_cust(dr):
    if dr is None: return '—', 'FFFFFF'
    if dr >= 95: return 'A', 'C6EFCE'
    if dr >= 85: return 'B', 'BDD7EE'
    if dr >= 70: return 'C', 'FFEB9C'
    return 'D', 'FFC7CE'

def _grade_sup(dr, fr):
    ds = 0 if dr is None else (4 if dr >= 95 else 3 if dr >= 85 else 2 if dr >= 70 else 1)
    fs = 0 if fr is None else (4 if fr <= 0.5 else 3 if fr <= 1 else 2 if fr <= 5 else 1)
    tot = (ds + fs) / 2 if (ds + fs) > 0 else 0
    if tot >= 3.5: return 'A', 'C6EFCE'
    if tot >= 2.5: return 'B', 'BDD7EE'
    if tot >= 1.5: return 'C', 'FFEB9C'
    return 'D', 'FFC7CE'

def _rate_color(val, good=90, warn=70, invert=False):
    if val is None: return C_LGRAY
    good_cond = val <= good if invert else val >= good
    warn_cond = val <= warn if invert else val >= warn
    if good_cond: return C_GREEN
    if warn_cond: return C_AMBER
    return C_RED

@router.get("/delivery-report")
def delivery_report(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    today = date.today()
    month_start = date(year, month, 1)
    month_end   = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}

    # ── 고객사 스코어카드 ──
    ship_agg = db.query(
        SalesOrder.partner_id,
        func.count(func.distinct(Shipment.so_no)).label("closed_count"),
        func.sum(Shipment.qty * Shipment.unit_price).label("ship_amt"),
    ).join(Shipment, Shipment.so_no == SalesOrder.so_no).filter(
        Shipment.status == ShipmentStatus.confirmed,
        Shipment.ship_date >= month_start,
        Shipment.ship_date < month_end,
    ).group_by(SalesOrder.partner_id).all()

    order_agg = db.query(
        SalesOrder.partner_id,
        func.count(SalesOrder.so_no).label("cnt"),
    ).filter(
        SalesOrder.status != SOStatus.cancelled,
        SalesOrder.order_date >= month_start,
        SalesOrder.order_date < month_end,
    ).group_by(SalesOrder.partner_id).all()
    order_map = {r.partner_id: int(r.cnt) for r in order_agg}

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

    on_time_map: dict = {}
    for r in ship_due:
        on_time = (r.due_date is None) or (r.last_ship <= r.due_date)
        on_time_map.setdefault(r.partner_id, []).append(on_time)

    customers = []
    for r in ship_agg:
        flags = on_time_map.get(r.partner_id, [])
        on_time = sum(flags)
        closed  = int(r.closed_count)
        dr = round(on_time / closed * 100, 1) if closed else None
        customers.append({
            "partner_id": r.partner_id,
            "name": partner_map.get(r.partner_id, r.partner_id),
            "total_orders": order_map.get(r.partner_id, 0),
            "closed_orders": closed,
            "on_time": on_time,
            "delivery_rate": dr,
            "ship_amt": float(r.ship_amt or 0),
        })
    customers.sort(key=lambda x: (x["delivery_rate"] or 0), reverse=True)

    # ── 외주처 스코어카드 ──
    suppliers_q = db.query(Partner).filter(Partner.partner_type.in_(["외주처", "공용"])).all()
    pids = [p.partner_id for p in suppliers_q]
    pname = {p.partner_id: p.name for p in suppliers_q}

    po_cnt_map = {r.partner_id: int(r.cnt) for r in db.query(
        PurchaseOrder.partner_id,
        func.count(PurchaseOrder.po_no).label("cnt"),
    ).filter(PurchaseOrder.partner_id.in_(pids), PurchaseOrder.status != POStatus.cancelled
    ).group_by(PurchaseOrder.partner_id).all()}

    closed_po = db.query(PurchaseOrder).filter(
        PurchaseOrder.partner_id.in_(pids), PurchaseOrder.status == POStatus.closed,
    ).all()
    closed_po_nos = [po.po_no for po in closed_po]
    last_receipts = {}
    if closed_po_nos:
        last_receipts = {r.po_no: r.last_date for r in db.query(
            Receipt.po_no, func.max(Receipt.receipt_date).label("last_date"),
        ).filter(Receipt.po_no.in_(closed_po_nos), Receipt.status == ReceiptStatus.confirmed
        ).group_by(Receipt.po_no).all()}

    on_time_sup: dict = {}
    for po in closed_po:
        ld = last_receipts.get(po.po_no)
        on_time_sup.setdefault(po.partner_id, []).append(bool(ld and (po.due_date is None or ld <= po.due_date)))

    insp_map = {r.partner_id: (int(r.total or 0), int(r.fail or 0)) for r in db.query(
        PurchaseOrder.partner_id,
        func.sum(Inspection.pass_qty + Inspection.fail_qty).label("total"),
        func.sum(Inspection.fail_qty).label("fail"),
    ).join(Receipt, Receipt.gr_no == Inspection.gr_no
    ).join(PurchaseOrder, PurchaseOrder.po_no == Receipt.po_no
    ).filter(PurchaseOrder.partner_id.in_(pids)).group_by(PurchaseOrder.partner_id).all()}

    buy_map = {r.partner_id: float(r.amt or 0) for r in db.query(
        PurchaseOrder.partner_id,
        func.sum(Receipt.qty * Receipt.unit_price).label("amt"),
    ).join(Receipt, Receipt.po_no == PurchaseOrder.po_no
    ).filter(PurchaseOrder.partner_id.in_(pids), Receipt.status == ReceiptStatus.confirmed
    ).group_by(PurchaseOrder.partner_id).all()}

    suppliers = []
    for pid in pids:
        flags = on_time_sup.get(pid, [])
        closed = len(flags)
        on_time = sum(flags)
        ti, tf = insp_map.get(pid, (0, 0))
        dr = round(on_time / closed * 100, 1) if closed else None
        fr = round(tf / ti * 100, 2) if ti > 0 else None
        suppliers.append({
            "partner_id": pid,
            "name": pname[pid],
            "total_pos": po_cnt_map.get(pid, 0),
            "delivery_rate": dr,
            "defect_rate": fr,
            "buy_amt": buy_map.get(pid, 0.0),
        })
    suppliers.sort(key=lambda x: (x["delivery_rate"] or 0), reverse=True)

    # ── Excel 생성 ──
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "납기준수율 보고서"

    C_KAISER = 'C8102E'    # 카이저 레드
    C_PURPLE = '5B21B6'    # 외주처 보라

    def cell(r, c): return ws.cell(row=r, column=c)

    def hdr_cell(r, c, val, bg=C_DKGRAY, fg=C_WHITE, size=9, bold=True, align='center'):
        cl = cell(r, c)
        cl.value = val
        cl.font = Font(name='Arial', bold=bold, size=size, color=fg)
        cl.fill = PatternFill('solid', fgColor=bg)
        cl.alignment = Alignment(horizontal=align, vertical='center', wrap_text=True)
        cl.border = _border()
        return cl

    def data_cell(r, c, val, fmt=None, bold=False, color=C_BLACK, align='right', fill_hex=None):
        cl = cell(r, c)
        cl.value = val
        cl.font = Font(name='Arial', bold=bold, size=9, color=color)
        cl.alignment = Alignment(horizontal=align, vertical='center')
        cl.border = _border()
        if fmt: cl.number_format = fmt
        if fill_hex: cl.fill = PatternFill('solid', fgColor=fill_hex)
        return cl

    # ── 제목 블록 ──
    ws.merge_cells('A1:I1')
    t = ws['A1']
    t.value = f'납기준수율 종합 보고서   {year}년 {month}월'
    t.font  = Font(name='Arial', bold=True, size=14, color=C_WHITE)
    t.fill  = PatternFill('solid', fgColor=C_KAISER)
    t.alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[1].height = 32

    ws.merge_cells('A2:I2')
    s = ws['A2']
    s.value = f'조이산업(주)  |  출력일: {today.strftime("%Y년 %m월 %d일")}  |  기준기간: {year}년 {month}월 출하'
    s.font  = Font(name='Arial', size=9, color=C_LGRAY)
    s.fill  = PatternFill('solid', fgColor='F2F2F2')
    s.alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[2].height = 18

    # ── KPI 요약 ──
    ws.row_dimensions[3].height = 6

    avg_cust = sum(c['delivery_rate'] for c in customers if c['delivery_rate'] is not None)
    n_cust   = sum(1 for c in customers if c['delivery_rate'] is not None)
    avg_cust = round(avg_cust / n_cust, 1) if n_cust else None

    avg_sup = sum(s['delivery_rate'] for s in suppliers if s['delivery_rate'] is not None)
    n_sup   = sum(1 for s in suppliers if s['delivery_rate'] is not None)
    avg_sup = round(avg_sup / n_sup, 1) if n_sup else None

    avg_def = sum(s['defect_rate'] for s in suppliers if s['defect_rate'] is not None)
    n_def   = sum(1 for s in suppliers if s['defect_rate'] is not None)
    avg_def = round(avg_def / n_def, 2) if n_def else None

    kpi_data = [
        ('고객사 평균\n납기준수율', f"{avg_cust:.1f}%" if avg_cust is not None else "—",
         _rate_color(avg_cust)),
        ('외주처 평균\n납기준수율', f"{avg_sup:.1f}%" if avg_sup is not None else "—",
         _rate_color(avg_sup)),
        ('외주처 평균\n불량율',     f"{avg_def:.2f}%" if avg_def is not None else "—",
         _rate_color(avg_def, good=1, warn=5, invert=True)),
        ('고객사 수', f"{len(customers)}개사", C_BLUE),
        ('외주처 수', f"{len(suppliers)}개사", C_BLUE),
    ]
    kpi_cols = [1, 3, 5, 7, 9]
    ws.merge_cells('A3:I3')
    for i, (lbl, val, col) in enumerate(kpi_data):
        c_start = kpi_cols[i]
        c_end   = c_start + 1
        ws.merge_cells(start_row=4, start_column=c_start, end_row=4, end_column=c_end)
        ws.merge_cells(start_row=5, start_column=c_start, end_row=5, end_column=c_end)
        lb = ws.cell(row=4, column=c_start)
        lb.value = lbl; lb.font = Font(name='Arial', size=8, color=C_LGRAY)
        lb.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        lb.fill = PatternFill('solid', fgColor='F2F2F2')
        vl = ws.cell(row=5, column=c_start)
        vl.value = val; vl.font = Font(name='Arial', bold=True, size=13, color=col)
        vl.alignment = Alignment(horizontal='center', vertical='center')
        vl.fill = PatternFill('solid', fgColor='F2F2F2')
    ws.row_dimensions[4].height = 22
    ws.row_dimensions[5].height = 26
    ws.row_dimensions[6].height = 8

    # ═══════════════════════════════════════════
    #  고객사 납기준수율
    # ═══════════════════════════════════════════
    ROW = 7
    ws.merge_cells(start_row=ROW, start_column=1, end_row=ROW, end_column=9)
    sec = ws.cell(row=ROW, column=1)
    sec.value = f'■  고객사별 납기준수율   ({year}년 {month}월 출하 기준)'
    sec.font  = Font(name='Arial', bold=True, size=10, color=C_WHITE)
    sec.fill  = PatternFill('solid', fgColor=C_KAISER)
    sec.alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[ROW].height = 22
    ROW += 1

    CUST_HDRS = ['순위', '고객사명', '전체수주', '출하완료', '납기준수', '납기준수율', '등급', '총 출하금액', '비고']
    CUST_COLS = [3, 20, 8, 8, 8, 12, 5, 14, 10]
    for ci, (h, w) in enumerate(zip(CUST_HDRS, CUST_COLS), 1):
        hdr_cell(ROW, ci, h, bg='3A3A3C')
        ws.column_dimensions[get_column_letter(ci)].width = w
    ws.row_dimensions[ROW].height = 18
    ROW += 1

    total_ship = 0
    for i, c in enumerate(customers):
        dr = c['delivery_rate']
        grade, grade_bg = _grade_cust(dr)
        rank = i + 1
        rank_str = '🥇' if rank == 1 else '🥈' if rank == 2 else '🥉' if rank == 3 else str(rank)
        bg = 'FFFFFF' if i % 2 == 0 else C_SNOW
        data_cell(ROW, 1, rank_str, align='center', fill_hex=bg)
        # 고객사명 셀 — 상세 시트 하이퍼링크
        safe_sheet = c['name'][:31].replace('/', '-').replace('\\', '-').replace('*', '').replace('?', '').replace('[', '').replace(']', '').replace(':', '')
        name_cell = data_cell(ROW, 2, c['name'], align='left', bold=True, fill_hex=bg)
        name_cell.hyperlink = f"#'{safe_sheet}_출고'!A1"
        name_cell.font = Font(name='Arial', bold=True, size=9, color='1D4ED8', underline='single')
        data_cell(ROW, 3, c['total_orders'], MF, fill_hex=bg)
        data_cell(ROW, 4, c['closed_orders'], MF, fill_hex=bg)
        data_cell(ROW, 5, c['on_time'], MF, color=C_BLUE, bold=True, fill_hex=bg)
        dr_cell = data_cell(ROW, 6, (dr/100 if dr is not None else None), '0.0%',
                            bold=True, color=_rate_color(dr), fill_hex=bg)
        if dr is None: dr_cell.value = '—'; dr_cell.number_format = '@'
        g_cell = data_cell(ROW, 7, grade, align='center', bold=True,
                           color='000000' if grade_bg != 'FFFFFF' else C_LGRAY,
                           fill_hex=grade_bg)
        data_cell(ROW, 8, c['ship_amt'], '#,##0', bold=True, color=C_BLUE, fill_hex=bg)
        data_cell(ROW, 9, '', fill_hex=bg)
        ws.row_dimensions[ROW].height = 16
        total_ship += c['ship_amt']
        ROW += 1

    # 합계행
    n_with_rate = sum(1 for c in customers if c['delivery_rate'] is not None)
    hdr_cell(ROW, 1, '', bg='1C1C1E'); hdr_cell(ROW, 2, '합계 / 평균', bg='1C1C1E', align='right')
    hdr_cell(ROW, 3, sum(c['total_orders'] for c in customers), bg='1C1C1E'); hdr_cell(ROW, 3, '', bg='1C1C1E')
    data_cell(ROW, 3, sum(c['total_orders'] for c in customers), MF, bold=True, color=C_WHITE, fill_hex='1C1C1E')
    data_cell(ROW, 4, sum(c['closed_orders'] for c in customers), MF, bold=True, color=C_WHITE, fill_hex='1C1C1E')
    data_cell(ROW, 5, sum(c['on_time'] for c in customers), MF, bold=True, color=C_WHITE, fill_hex='1C1C1E')
    avg_str = f"{avg_cust:.1f}%" if avg_cust is not None else "—"
    data_cell(ROW, 6, avg_str, bold=True, color=_rate_color(avg_cust), align='center', fill_hex='1C1C1E')
    data_cell(ROW, 7, '', fill_hex='1C1C1E')
    data_cell(ROW, 8, total_ship, '#,##0', bold=True, color=C_BLUE, fill_hex='1C1C1E')
    data_cell(ROW, 9, '', fill_hex='1C1C1E')
    ws.row_dimensions[ROW].height = 18
    ROW += 2

    # 등급 범례
    ws.merge_cells(start_row=ROW, start_column=1, end_row=ROW, end_column=9)
    leg = ws.cell(row=ROW, column=1)
    leg.value = '※ 납기준수율 등급 기준:  A = 95% 이상 (우수)   B = 85~94% (양호)   C = 70~84% (보통)   D = 70% 미만 (개선필요)'
    leg.font = Font(name='Arial', size=8, color=C_LGRAY, italic=True)
    leg.alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[ROW].height = 14
    ROW += 2

    # ═══════════════════════════════════════════
    #  외주처 납기준수율 · 품질 스코어카드
    # ═══════════════════════════════════════════
    ws.merge_cells(start_row=ROW, start_column=1, end_row=ROW, end_column=9)
    sec2 = ws.cell(row=ROW, column=1)
    sec2.value = '■  외주처별 납기준수율 · 품질 스코어카드   (전체 발주 기준)'
    sec2.font  = Font(name='Arial', bold=True, size=10, color=C_WHITE)
    sec2.fill  = PatternFill('solid', fgColor=C_PURPLE)
    sec2.alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[ROW].height = 22
    ROW += 1

    SUP_HDRS = ['순위', '외주처명', '발주건수', '납기준수율', '불량율', '종합등급', '총 입고금액', '비고', '']
    for ci, h in enumerate(SUP_HDRS, 1):
        hdr_cell(ROW, ci, h, bg='3A3A3C')
    ws.row_dimensions[ROW].height = 18
    ROW += 1

    total_buy = 0
    for i, s in enumerate(suppliers):
        dr = s['delivery_rate']
        fr = s['defect_rate']
        grade, grade_bg = _grade_sup(dr, fr)
        rank = i + 1
        rank_str = '🥇' if rank == 1 else '🥈' if rank == 2 else '🥉' if rank == 3 else str(rank)
        bg = 'FFFFFF' if i % 2 == 0 else C_SNOW
        data_cell(ROW, 1, rank_str, align='center', fill_hex=bg)
        # 외주처명 셀 — 상세 시트 하이퍼링크
        safe_sup = s['name'][:31].replace('/', '-').replace('\\', '-').replace('*', '').replace('?', '').replace('[', '').replace(']', '').replace(':', '')
        sup_name_cell = data_cell(ROW, 2, s['name'], align='left', bold=True, fill_hex=bg)
        sup_name_cell.hyperlink = f"#'{safe_sup}_입고'!A1"
        sup_name_cell.font = Font(name='Arial', bold=True, size=9, color='5B21B6', underline='single')
        data_cell(ROW, 3, s['total_pos'], MF, fill_hex=bg)
        dr_cell2 = data_cell(ROW, 4, (dr/100 if dr is not None else None), '0.0%',
                             bold=True, color=_rate_color(dr), fill_hex=bg)
        if dr is None: dr_cell2.value = '—'; dr_cell2.number_format = '@'
        fr_cell = data_cell(ROW, 5, (fr/100 if fr is not None else None), '0.00%',
                            bold=True, color=_rate_color(fr, good=1, warn=5, invert=True), fill_hex=bg)
        if fr is None: fr_cell.value = '—'; fr_cell.number_format = '@'
        data_cell(ROW, 6, grade, align='center', bold=True,
                  color='000000' if grade_bg != 'FFFFFF' else C_LGRAY,
                  fill_hex=grade_bg)
        data_cell(ROW, 7, s['buy_amt'], '#,##0', bold=True, color='5B21B6', fill_hex=bg)
        data_cell(ROW, 8, '', fill_hex=bg)
        data_cell(ROW, 9, '', fill_hex=bg)
        ws.row_dimensions[ROW].height = 16
        total_buy += s['buy_amt']
        ROW += 1

    # 합계행
    hdr_cell(ROW, 1, '', bg='1C1C1E')
    hdr_cell(ROW, 2, '합계 / 평균', bg='1C1C1E', align='right')
    data_cell(ROW, 3, sum(s['total_pos'] for s in suppliers), MF, bold=True, color=C_WHITE, fill_hex='1C1C1E')
    avg_sup_str = f"{avg_sup:.1f}%" if avg_sup is not None else "—"
    avg_def_str = f"{avg_def:.2f}%" if avg_def is not None else "—"
    data_cell(ROW, 4, avg_sup_str, bold=True, color=_rate_color(avg_sup), align='center', fill_hex='1C1C1E')
    data_cell(ROW, 5, avg_def_str, bold=True, color=_rate_color(avg_def, good=1, warn=5, invert=True),
              align='center', fill_hex='1C1C1E')
    data_cell(ROW, 6, '', fill_hex='1C1C1E')
    data_cell(ROW, 7, total_buy, '#,##0', bold=True, color='5B21B6', fill_hex='1C1C1E')
    data_cell(ROW, 8, '', fill_hex='1C1C1E')
    data_cell(ROW, 9, '', fill_hex='1C1C1E')
    ws.row_dimensions[ROW].height = 18
    ROW += 2

    # 범례
    ws.merge_cells(start_row=ROW, start_column=1, end_row=ROW, end_column=9)
    leg2 = ws.cell(row=ROW, column=1)
    leg2.value = '※ 외주처 종합등급: 납기준수율 + 불량율 복합 평가  |  A(우수) · B(양호) · C(보통) · D(개선필요)'
    leg2.font = Font(name='Arial', size=8, color=C_LGRAY, italic=True)
    leg2.alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[ROW].height = 14
    ROW += 2

    # ── 서명란 ──
    ws.merge_cells(start_row=ROW, start_column=1, end_row=ROW, end_column=9)
    ws.row_dimensions[ROW].height = 10
    ROW += 1
    sign_titles = ['담당', '팀장', '본부장', '대표이사']
    sign_cols   = [1, 3, 5, 7]
    for title, sc in zip(sign_titles, sign_cols):
        ws.merge_cells(start_row=ROW, start_column=sc, end_row=ROW, end_column=sc+1)
        ws.merge_cells(start_row=ROW+1, start_column=sc, end_row=ROW+3, end_column=sc+1)
        ws.merge_cells(start_row=ROW+4, start_column=sc, end_row=ROW+4, end_column=sc+1)
        t_cell = ws.cell(row=ROW, column=sc)
        t_cell.value = title
        t_cell.font = Font(name='Arial', bold=True, size=9, color=C_BLACK)
        t_cell.fill = PatternFill('solid', fgColor='F2F2F2')
        t_cell.alignment = Alignment(horizontal='center', vertical='center')
        t_cell.border = _border(b='000000')
        for rr in range(ROW+1, ROW+4):
            ws.cell(row=rr, column=sc).border = Border(
                left=Side(style='thin', color='AAAAAA'),
                right=Side(style='thin', color='AAAAAA'),
            )
        b_cell = ws.cell(row=ROW+4, column=sc)
        b_cell.value = '(서명)'
        b_cell.font = Font(name='Arial', size=8, color=C_LGRAY)
        b_cell.alignment = Alignment(horizontal='center', vertical='center')
        b_cell.border = _border(t='000000')
        ws.row_dimensions[ROW].height = 16
        for rr in range(ROW+1, ROW+4): ws.row_dimensions[rr].height = 12
        ws.row_dimensions[ROW+4].height = 14

    ws.sheet_view.showGridLines = False
    ws.print_area = f'A1:I{ROW+4}'

    # ═══════════════════════════════════════════
    #  고객사별 출고이력 상세 시트
    # ═══════════════════════════════════════════
    item_map = {it.part_no: it.name for it in db.query(Item).all()}

    for c in customers:
        pid = c['partner_id']
        cname = c['name']
        safe_name = cname[:27].replace('/', '-').replace('\\', '-').replace('*', '').replace('?', '').replace('[', '').replace(']', '').replace(':', '')
        ws_d = wb.create_sheet(title=f"{safe_name}_출고")

        # 시트 헤더
        ws_d.merge_cells('A1:J1')
        t = ws_d['A1']
        t.value = f'{cname}  출고이력  ({year}년 {month}월)'
        t.font = Font(name='Arial', bold=True, size=12, color=C_WHITE)
        t.fill = PatternFill('solid', fgColor=C_KAISER)
        t.alignment = Alignment(horizontal='left', vertical='center')
        ws_d.row_dimensions[1].height = 26

        hdrs = ['출하번호', '수주번호', '품번', '품명', '수량', '단가', '금액', '납기일', '출하일', '납기준수']
        col_w = [16, 16, 16, 30, 10, 12, 14, 12, 12, 8]
        for ci, (h, w) in enumerate(zip(hdrs, col_w), 1):
            cl = ws_d.cell(row=2, column=ci)
            cl.value = h
            cl.font = Font(name='Arial', bold=True, size=9, color=C_WHITE)
            cl.fill = PatternFill('solid', fgColor='3A3A3C')
            cl.alignment = Alignment(horizontal='center', vertical='center')
            cl.border = _border()
            ws_d.column_dimensions[get_column_letter(ci)].width = w
        ws_d.row_dimensions[2].height = 16

        # 출하 데이터 조회
        ships = db.query(Shipment, SalesOrder).join(
            SalesOrder, SalesOrder.so_no == Shipment.so_no
        ).filter(
            SalesOrder.partner_id == pid,
            Shipment.status == ShipmentStatus.confirmed,
            Shipment.ship_date >= month_start,
            Shipment.ship_date < month_end,
        ).order_by(Shipment.ship_date, Shipment.sh_no).all()

        DR = 3
        total_amt = 0
        for sh, so in ships:
            amt = sh.qty * float(sh.unit_price or 0)
            on_time = (so.due_date is None) or (sh.ship_date <= so.due_date)
            bg_r = 'FFFFFF' if (DR - 3) % 2 == 0 else 'F8F8F8'
            for ci2, val in enumerate([
                sh.sh_no, sh.so_no, sh.part_no,
                item_map.get(sh.part_no, ''),
                sh.qty, float(sh.unit_price or 0), amt,
                str(so.due_date) if so.due_date else '—',
                str(sh.ship_date),
                '✓' if on_time else '✗',
            ], 1):
                cl = ws_d.cell(row=DR, column=ci2)
                cl.value = val
                cl.font = Font(name='Arial', size=9,
                               color='16A34A' if (ci2 == 10 and on_time) else ('DC2626' if ci2 == 10 else C_BLACK))
                cl.alignment = Alignment(horizontal='right' if ci2 in (5,6,7) else ('center' if ci2 in (1,10) else 'left'), vertical='center')
                cl.border = _border()
                cl.fill = PatternFill('solid', fgColor=bg_r)
                if ci2 in (5, 6): cl.number_format = '#,##0'
                if ci2 == 7: cl.number_format = '#,##0'
            ws_d.row_dimensions[DR].height = 15
            total_amt += amt
            DR += 1

        # 합계행
        for ci2 in range(1, 11):
            cl = ws_d.cell(row=DR, column=ci2)
            cl.fill = PatternFill('solid', fgColor='1C1C1E')
            cl.border = _border()
            cl.font = Font(name='Arial', bold=True, size=9, color=C_WHITE)
            cl.alignment = Alignment(horizontal='center', vertical='center')
        ws_d.cell(row=DR, column=1).value = '합계'
        ws_d.cell(row=DR, column=7).value = total_amt
        ws_d.cell(row=DR, column=7).number_format = '#,##0'
        ws_d.cell(row=DR, column=7).font = Font(name='Arial', bold=True, size=9, color='60A5FA')
        ws_d.row_dimensions[DR].height = 16

        ws_d.sheet_view.showGridLines = False

    # ═══════════════════════════════════════════
    #  외주처별 입고이력 상세 시트
    # ═══════════════════════════════════════════
    for s in suppliers:
        pid = s['partner_id']
        sname = s['name']
        safe_name = sname[:27].replace('/', '-').replace('\\', '-').replace('*', '').replace('?', '').replace('[', '').replace(']', '').replace(':', '')
        ws_s = wb.create_sheet(title=f"{safe_name}_입고")

        ws_s.merge_cells('A1:H1')
        t = ws_s['A1']
        t.value = f'{sname}  입고이력  ({year}년 {month}월)'
        t.font = Font(name='Arial', bold=True, size=12, color=C_WHITE)
        t.fill = PatternFill('solid', fgColor=C_PURPLE)
        t.alignment = Alignment(horizontal='left', vertical='center')
        ws_s.row_dimensions[1].height = 26

        hdrs_s = ['입고번호', '발주번호', '품번', '품명', '수량', '단가', '금액', '상태']
        col_w_s = [16, 16, 16, 30, 10, 12, 14, 8]
        for ci, (h, w) in enumerate(zip(hdrs_s, col_w_s), 1):
            cl = ws_s.cell(row=2, column=ci)
            cl.value = h
            cl.font = Font(name='Arial', bold=True, size=9, color=C_WHITE)
            cl.fill = PatternFill('solid', fgColor='3A3A3C')
            cl.alignment = Alignment(horizontal='center', vertical='center')
            cl.border = _border()
            ws_s.column_dimensions[get_column_letter(ci)].width = w
        ws_s.row_dimensions[2].height = 16

        receipts = db.query(Receipt, PurchaseOrder).join(
            PurchaseOrder, PurchaseOrder.po_no == Receipt.po_no
        ).filter(
            PurchaseOrder.partner_id == pid,
            Receipt.receipt_date >= month_start,
            Receipt.receipt_date < month_end,
        ).order_by(Receipt.receipt_date, Receipt.gr_no).all()

        DR = 3
        total_amt_s = 0
        for rc, po in receipts:
            amt = rc.qty * float(rc.unit_price or 0)
            bg_r = 'FFFFFF' if (DR - 3) % 2 == 0 else 'F8F8F8'
            status_kor = {'confirmed': '확정', 'pending': '대기', 'cancelled': '취소'}.get(rc.status.value if hasattr(rc.status, 'value') else str(rc.status), str(rc.status))
            for ci2, val in enumerate([
                rc.gr_no, rc.po_no, rc.part_no,
                item_map.get(rc.part_no, ''),
                rc.qty, float(rc.unit_price or 0), amt, status_kor,
            ], 1):
                cl = ws_s.cell(row=DR, column=ci2)
                cl.value = val
                cl.font = Font(name='Arial', size=9, color=C_BLACK)
                cl.alignment = Alignment(horizontal='right' if ci2 in (5,6,7) else ('center' if ci2 == 8 else 'left'), vertical='center')
                cl.border = _border()
                cl.fill = PatternFill('solid', fgColor=bg_r)
                if ci2 in (5, 6, 7): cl.number_format = '#,##0'
            ws_s.row_dimensions[DR].height = 15
            total_amt_s += amt
            DR += 1

        for ci2 in range(1, 9):
            cl = ws_s.cell(row=DR, column=ci2)
            cl.fill = PatternFill('solid', fgColor='1C1C1E')
            cl.border = _border()
            cl.font = Font(name='Arial', bold=True, size=9, color=C_WHITE)
            cl.alignment = Alignment(horizontal='center', vertical='center')
        ws_s.cell(row=DR, column=1).value = '합계'
        ws_s.cell(row=DR, column=7).value = total_amt_s
        ws_s.cell(row=DR, column=7).number_format = '#,##0'
        ws_s.cell(row=DR, column=7).font = Font(name='Arial', bold=True, size=9, color='A78BFA')
        ws_s.row_dimensions[DR].height = 16
        ws_s.sheet_view.showGridLines = False
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.orientation = 'landscape'
    ws.page_margins.left = 0.5
    ws.page_margins.right = 0.5

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    fn_ascii = f"DeliveryReport_{year}_{month:02d}.xlsx"
    fn_kor   = f"납기준수율_보고서_{year}년{month:02d}월.xlsx"
    encoded  = quote(fn_kor, safe='')
    return StreamingResponse(
        buf,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f"attachment; filename={fn_ascii}; filename*=UTF-8''{encoded}"},
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  외주처 매입매출 손익 보고서
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@router.get("/outsource-pl")
def outsource_pl(
    year:  int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    from collections import defaultdict

    today       = date.today()
    month_start = date(year, month, 1)
    month_end   = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    # 공급사 목록 (supplier / both)
    sup_list = db.query(Partner).filter(Partner.partner_type.in_(["supplier", "both"])).all()
    sup_map  = {p.partner_id: p.name for p in sup_list}
    pids     = list(sup_map.keys())

    # 고객사 목록
    cust_list = db.query(Partner).filter(Partner.partner_type.in_(["customer", "both"])).all()
    cust_map  = {p.partner_id: p.name for p in cust_list}

    # 이달 확정 입고: receipt.partner_id 우선, NULL이면 item.supplier 대체
    # is_carryover 구분: 당월매입(0/NULL) vs 이월(1)
    _pid_col = func.coalesce(Receipt.partner_id, Item.supplier)

    # 이월 입고는 carryover_qty(실이월수량) 우선, 없으면 qty 전체
    _co_qty  = func.coalesce(Receipt.carryover_qty, Receipt.qty)
    # 순수량 = qty - return_qty (반품 차감)
    _net_qty = Receipt.qty - func.coalesce(Receipt.return_qty, 0)

    def _buy_q(carryover_flag):
        flt = [
            _pid_col.in_(pids),
            Receipt.status == ReceiptStatus.confirmed,
            Receipt.receipt_date >= month_start,
            Receipt.receipt_date < month_end,
            # 전량 반품 제외 (net_qty > 0)
            (Receipt.return_qty == None) | (Receipt.return_qty < Receipt.qty),
        ]
        if carryover_flag:
            flt.append(Receipt.is_carryover == 1)
            qty_col = _co_qty
        else:
            flt.append((Receipt.is_carryover == None) | (Receipt.is_carryover == 0))
            qty_col = _net_qty
        return db.query(
            _pid_col.label("partner_id"),
            Receipt.part_no,
            func.sum(qty_col * Receipt.unit_price).label("buy_amt"),
            func.sum(qty_col).label("buy_qty"),
        ).outerjoin(Item, Receipt.part_no == Item.part_no).filter(*flt
        ).group_by(_pid_col, Receipt.part_no).all()

    buy_rows          = _buy_q(False)   # 당월 매입
    buy_rows_carryover = _buy_q(True)   # 이월 매입

    # 이월 매입: (supplier, part_no) → {amt, qty}
    carryover_map: dict[tuple, dict] = {}
    for r in buy_rows_carryover:
        carryover_map[(r.partner_id, r.part_no)] = {
            'amt': float(r.buy_amt or 0),
            'qty': int(r.buy_qty or 0),
        }

    # 외주처 입고 품번 집합 (고객사별 매출 필터용)
    outsrc_part_nos = {r.part_no for r in buy_rows} | {r.part_no for r in buy_rows_carryover}

    # 이달 출고: stock_ledger issue 기준 (외주처 입고 GR에 연결된 것)
    # 매출금액 = 출고단가(std_sell_price) × 출고수량
    issue_rows = db.query(
        StockLedger.part_no,
        func.sum(StockLedger.qty * StockLedger.unit_price).label("ship_amt"),
        func.sum(StockLedger.qty).label("ship_qty"),
    ).join(Receipt, Receipt.gr_no == StockLedger.ref_no
    ).filter(
        StockLedger.ledger_type == "issue",
        StockLedger.ref_type == "receipt",
        StockLedger.txn_date >= month_start,
        StockLedger.txn_date < month_end,
        StockLedger.part_no.in_(list(outsrc_part_nos)),
        Receipt.partner_id.in_(pids),
    ).group_by(StockLedger.part_no).all()

    # 고객사 정보는 shipment에서 보조적으로 가져옴
    ship_cust_src = db.query(
        Shipment.part_no,
        func.coalesce(Item.spec, SalesOrder.partner_id).label("customer_id"),
        func.sum(Shipment.qty).label("ship_qty"),
    ).join(SalesOrder, Shipment.so_no == SalesOrder.so_no
    ).outerjoin(Item, Shipment.part_no == Item.part_no
    ).filter(
        Shipment.status == ShipmentStatus.confirmed,
        Shipment.ship_date >= month_start,
        Shipment.ship_date < month_end,
        Shipment.part_no.in_(list(outsrc_part_nos)),
    ).group_by(Shipment.part_no, func.coalesce(Item.spec, SalesOrder.partner_id)).all()

    # 품번별 출하 집계 (stock_ledger issue 기준)
    ship_by_part: dict[str, dict] = defaultdict(lambda: {'amt': 0.0, 'qty': 0})
    for r in issue_rows:
        ship_by_part[r.part_no]['amt'] += float(r.ship_amt or 0)
        ship_by_part[r.part_no]['qty'] += int(r.ship_qty or 0)

    # 고객사 매핑 (shipment 기준 - qty 비율로 대표 고객사 결정)
    ship_cust_by_part: dict[str, dict] = defaultdict(lambda: defaultdict(float))
    for r in ship_cust_src:
        ship_cust_by_part[r.part_no][r.customer_id or '기타'] += float(r.ship_qty or 0)

    # 동일 품번을 여러 공급사에서 입고 시 → 입고수량 비례 안분
    total_buy_qty_by_part: dict[str, int] = defaultdict(int)
    for r in buy_rows:
        total_buy_qty_by_part[r.part_no] += int(r.buy_qty or 0)

    item_objs = db.query(Item).filter(Item.part_no.in_(
        list({r.part_no for r in buy_rows})
    )).all()
    item_map      = {it.part_no: it.name            for it in item_objs}
    item_spec_map = {it.part_no: (it.spec or '')    for it in item_objs}
    item_sell_map = {it.part_no: float(it.std_sell_price or 0) for it in item_objs}

    # 품목별 세부행
    detail_rows: list[dict] = []
    sup_agg: dict[str, dict] = defaultdict(lambda: {'buy_amt': 0.0, 'ship_amt': 0.0, 'items': 0})
    cust_agg: dict[str, dict] = defaultdict(lambda: {'ship_amt': 0.0, 'buy_amt': 0.0})

    for r in buy_rows:
        pid      = r.partner_id
        pno      = r.part_no
        buy_amt  = float(r.buy_amt or 0)
        buy_qty  = int(r.buy_qty or 0)
        total_q  = total_buy_qty_by_part.get(pno, buy_qty) or buy_qty
        ratio    = buy_qty / total_q
        si       = ship_by_part.get(pno, {'amt': 0, 'qty': 0})
        ship_amt = si['amt'] * ratio
        ship_qty = round(si['qty'] * ratio)

        # 이 입고 비율로 고객사별 매출도 안분
        cust_ship = {cid: amt * ratio for cid, amt in ship_cust_by_part.get(pno, {}).items()}
        # 주 고객사 (매출 최대 → 없으면 item.spec fallback)
        main_cust_id = max(cust_ship, key=cust_ship.get) if cust_ship else ''
        if main_cust_id:
            main_cust_nm = cust_map.get(main_cust_id, main_cust_id)
        else:
            spec = item_spec_map.get(pno, '')
            main_cust_nm = spec if spec else '—'

        co_info = carryover_map.get((pid, pno), {'amt': 0.0, 'qty': 0})
        detail_rows.append({
            'partner_id':     pid,
            'partner_name':   sup_map.get(pid, pid),
            'part_no':        pno,
            'part_name':      item_map.get(pno, pno),
            'buy_qty':        buy_qty,
            'buy_amt':        buy_amt,
            'carryover_qty':  co_info['qty'],
            'carryover_amt':  co_info['amt'],
            'ship_qty':       ship_qty,
            'ship_amt':       ship_amt,
            'main_cust':      main_cust_nm,
        })
        sup_agg[pid]['buy_amt']  += buy_amt
        sup_agg[pid]['ship_amt'] += ship_amt
        sup_agg[pid]['items']    += 1
        for cid, amt in cust_ship.items():
            cust_agg[cid]['ship_amt'] += amt
            cust_agg[cid]['buy_amt']  += buy_amt * (amt / ship_amt if ship_amt > 0 else 0)

    # 이월만 있고 당월 입고 없는 품목을 detail_rows에 추가
    existing_keys = {(d['partner_id'], d['part_no']) for d in detail_rows}
    for (co_pid, co_pno), co_info in carryover_map.items():
        if (co_pid, co_pno) not in existing_keys:
            si = ship_by_part.get(co_pno, {'amt': 0.0, 'qty': 0})
            total_q = total_buy_qty_by_part.get(co_pno, 0)
            ratio = 1.0  # 당월 입고 없으니 이월분이 전부
            ship_amt = si['amt'] * ratio
            ship_qty = round(si['qty'] * ratio)
            cust_ship = {cid: amt * ratio for cid, amt in ship_cust_by_part.get(co_pno, {}).items()}
            main_cust_id = max(cust_ship, key=cust_ship.get) if cust_ship else ''
            if main_cust_id:
                main_cust_nm = cust_map.get(main_cust_id, main_cust_id)
            else:
                spec = item_spec_map.get(co_pno, '')
                main_cust_nm = spec if spec else '—'
            detail_rows.append({
                'partner_id':    co_pid,
                'partner_name':  sup_map.get(co_pid, co_pid),
                'part_no':       co_pno,
                'part_name':     item_map.get(co_pno, co_pno),
                'buy_qty':       0,
                'buy_amt':       0.0,
                'carryover_qty': co_info['qty'],
                'carryover_amt': co_info['amt'],
                'ship_qty':      ship_qty,
                'ship_amt':      ship_amt,
                'main_cust':     main_cust_nm,
            })
            sup_agg[co_pid]['buy_amt']  += 0
            sup_agg[co_pid]['ship_amt'] += ship_amt
            sup_agg[co_pid]['items']    += 1

    # 외주처 요약 (매출 내림차순)
    summary: list[dict] = []
    for pid, d in sup_agg.items():
        profit = d['ship_amt'] - d['buy_amt']
        margin = (profit / d['ship_amt'] * 100) if d['ship_amt'] > 0 else None
        summary.append({
            'name':     sup_map.get(pid, pid),
            'buy_amt':  d['buy_amt'],
            'ship_amt': d['ship_amt'],
            'profit':   profit,
            'margin':   margin,
            'items':    d['items'],
        })
    summary.sort(key=lambda x: x['ship_amt'], reverse=True)

    order_idx = {s['name']: i for i, s in enumerate(summary)}
    detail_rows.sort(key=lambda x: (order_idx.get(x['partner_name'], 999), -x['ship_amt']))

    t_buy  = sum(s['buy_amt']  for s in summary)
    t_ship = sum(s['ship_amt'] for s in summary)
    t_prof = t_ship - t_buy
    t_marg = (t_prof / t_ship * 100) if t_ship > 0 else 0

    # ── Excel 생성 ──
    # 컬럼: 1외주처 2품번 3품명 4입고수량 5매입금액 6이월수량 7이월금액 8출하수량(입력) 9단가(입력) 10매출금액 11손익 12마진율 13고객사 [14=숨김 파트너키]
    NCOLS = 13
    CL    = get_column_letter(NCOLS)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "외주처 손익"
    ws.sheet_view.showGridLines = False

    _col_widths(ws, [4, 16, 14, 11, 13, 8, 13, 10, 12, 13, 12, 9, 16])

    def mc(r1, c1, r2, c2):
        ws.merge_cells(start_row=r1, start_column=c1, end_row=r2, end_column=c2)

    # ── 타이틀 블록 ──
    mc(1, 1, 1, NCOLS)
    c = ws['A1']
    c.value     = 'NEXGEM CO., LTD.'
    c.font      = _font(bold=True, size=8, color=C_LGRAY)
    c.fill      = _f(C_BLACK)
    c.alignment = _al('left')
    ws.row_dimensions[1].height = 14

    mc(2, 1, 2, NCOLS)
    c = ws['A2']
    c.value     = f'외주처 매입매출 손익 보고서  —  {year}.{month:02d}'
    c.font      = _font(bold=True, size=16, color='FFFFFF', name='Arial')
    c.fill      = _f(C_BLACK)
    c.alignment = _al('left')
    ws.row_dimensions[2].height = 36

    mc(3, 1, 3, NCOLS)
    c = ws['A3']
    c.value     = (f'조이산업(주)  |  출력일: {today.strftime("%Y년 %m월 %d일")}  |  '
                   f'기준기간: {year}년 {month}월 입고·출하')
    c.font      = _font(size=9, color=C_LGRAY)
    c.fill      = _f(C_DKGRAY)
    c.alignment = _al('left')
    ws.row_dimensions[3].height = 18

    # ── KPI 카드 ──
    kpi_items = [
        ('총 매입금액',  f"₩{t_buy:,.0f}",  C_BLUE),
        ('총 매출금액',  f"₩{t_ship:,.0f}", C_BLUE),
        ('총 손익',      f"₩{t_prof:,.0f}", C_GREEN if t_prof >= 0 else C_RED),
        ('평균 마진율',  f"{t_marg:.1f}%",  C_GREEN if t_marg >= 20 else C_AMBER if t_marg >= 5 else C_RED),
        ('거래 외주처',  f"{len(summary)}개사", C_LGRAY),
    ]
    ws.row_dimensions[4].height = 6
    kpi_spans = [(1,2),(3,4),(5,6),(7,8),(9,10)]
    for (c1, c2), (lbl, val, col) in zip(kpi_spans, kpi_items):
        mc(5, c1, 5, c2); mc(6, c1, 6, c2)
        lb = ws.cell(5, c1, lbl); lb.font = _font(size=8, color=C_LGRAY); lb.fill = _f('F2F2F2'); lb.alignment = _al('center', wrap=True)
        vl = ws.cell(6, c1, val); vl.font = _font(bold=True, size=11, color=col); vl.fill = _f('F2F2F2'); vl.alignment = _al('center')
    ws.row_dimensions[5].height = 20
    ws.row_dimensions[6].height = 24
    ws.row_dimensions[7].height = 8

    ROW = 8

    # ═══════════════════════════════════
    #  섹션1: 외주처별 요약
    # ═══════════════════════════════════
    mc(ROW, 1, ROW, NCOLS)
    sec = ws.cell(ROW, 1, f'■  외주처별 손익 요약   ({year}년 {month}월 입고·출하 기준)')
    sec.font = _font(bold=True, size=10, color='FFFFFF'); sec.fill = _f(C_BLACK); sec.alignment = _al('left')
    ws.row_dimensions[ROW].height = 22; ROW += 1

    S_HDRS = ['순위', '외주처명', '매입금액(원)', '매출금액(원)', '손익(원)', '마진율', '품목수', '비고', '', '']
    _col_header(ws, ROW, S_HDRS, bg=C_DKGRAY)
    ws.row_dimensions[ROW].height = 20; ROW += 1

    s_start = ROW
    summary_rows_info = []  # (excel_row, partner_name) for SUMIF backfill
    for i, s in enumerate(summary):
        bg    = C_SNOW if i % 2 == 0 else C_WHITE
        row_n = ROW
        summary_rows_info.append((row_n, s['name']))
        _data_row(ws, ROW, [
            (1, str(i + 1),   AF, False, C_LGRAY, 'center'),
            (2, s['name'],    AF, True,  C_BLACK,  'left'),
            (3, 0,            MF, False, C_BLACK,  'right'),   # → SUMIF 나중에 덮어씀
            (4, 0,            MF, True,  C_BLUE,   'right'),   # → SUMIF 나중에 덮어씀
            (5, None,         MF, True,  C_GREEN,  'right'),
            (6, None,         '0.0%', True, C_GREEN, 'center'),
            (7, 0,            MF, False, C_LGRAY,  'center'),  # → COUNTIF 나중에 덮어씀
            (8, '', AF, False, C_BLACK, 'left'),
            (9, '', AF, False, C_BLACK, 'left'),
            (10,'', AF, False, C_BLACK, 'left'),
        ], bg)
        prof_cell = ws.cell(row_n, 5)
        prof_cell.value = f'=D{row_n}-C{row_n}'
        prof_cell.number_format = MF
        prof_cell.font = _font(bold=True, size=9, color=C_GREEN)
        prof_cell.alignment = _al('right')
        marg_cell = ws.cell(row_n, 6)
        marg_cell.value = f'=IFERROR(E{row_n}/D{row_n},"")'
        marg_cell.number_format = '0.0%'
        marg_cell.font = _font(bold=True, size=9, color=C_GREEN)
        marg_cell.alignment = _al('center')
        ROW += 1

    s_end = ROW - 1
    _total_bar(ws, ROW, NCOLS, 1, {
        3: f'=SUM(C{s_start}:C{s_end})',
        4: f'=SUM(D{s_start}:D{s_end})',
        5: f'=SUM(E{s_start}:E{s_end})',
    }, '합  계')
    tot_marg = ws.cell(ROW, 6)
    tot_marg.value = f'=IFERROR(E{ROW}/D{ROW},"")'
    tot_marg.number_format = '0.0%'
    tot_marg.font = _font(bold=True, size=9, color=C_WHITE)
    tot_marg.fill = _f(C_MGRAY); tot_marg.alignment = _al('center')
    ROW += 2

    # ═══════════════════════════════════
    #  섹션2: 품목별 세부내역 (고객사 포함)
    # ═══════════════════════════════════
    mc(ROW, 1, ROW, NCOLS)
    sec2 = ws.cell(ROW, 1, f'■  품목별 세부 내역   (외주처 그룹 · 고객사 포함)')
    sec2.font = _font(bold=True, size=10, color='FFFFFF'); sec2.fill = _f(C_MGRAY); sec2.alignment = _al('left')
    ws.row_dimensions[ROW].height = 20; ROW += 1

    # 컬럼: 1외주처 2품번 3품명 4입고수량 5매입금액 6이월수량 7이월금액(=F×I) 8출하수량 9단가(입력) 10매출금액(=H×I) 11손익(=J-E) 12마진율 13고객사
    D_HDRS = ['외주처명', '품번', '품명', '입고수량', '매입금액(원)', '이월수량', '이월금액(원)', '출하수량', '단가(원)', '매출금액(원)', '손익(원)', '마진율', '고객사']
    _col_header(ws, ROW, D_HDRS, bg=C_MGRAY)
    ws.row_dimensions[ROW].height = 20; ROW += 1

    C_INPUT = '1565C8'  # 단가 입력셀 파란색

    d_start = ROW
    prev_partner = None
    for d in detail_rows:
        same  = (d['partner_name'] == prev_partner)
        bg    = 'EEF2FF' if (order_idx.get(d['partner_name'], 0) % 2 == 0) else 'F0FDF4'
        row_n = ROW

        # 단가: 출하금액/출하수량 역산, 없으면 item.std_sell_price 사용
        unit_price = round(d['ship_amt'] / d['ship_qty']) if d['ship_qty'] else item_sell_map.get(d['part_no'], 0)

        _data_row(ws, ROW, [
            (1,  '' if same else d['partner_name'],  AF, not same, C_BLACK if not same else C_LGRAY, 'left'),
            (2,  d['part_no'],          AF,    False, C_MGRAY,  'left'),
            (3,  d['part_name'],        AF,    False, C_BLACK,  'left'),
            (4,  d['buy_qty'],          MF,    False, C_BLACK,  'right'),
            (5,  d['buy_amt'],          MF,    False, C_BLACK,  'right'),
            (6,  d['carryover_qty'] or None, MF, False, 'E67E22', 'right'),
            (7,  d['carryover_amt'] or None, MF, False, 'E67E22', 'right'),  # 이월금액 고정값
            (8,  d['ship_qty'] or None, MF,    True,  C_INPUT,  'right'),   # 출하수량 입력셀
            (9,  unit_price or None,    MF,    True,  C_INPUT,  'right'),   # 단가 입력셀
            (10, None,                  MF,    True,  C_BLUE,   'right'),   # 매출금액 수식
            (11, None,                  MF,    True,  C_GREEN,  'right'),   # 손익 수식
            (12, None,                  '0.0%',False, C_GREEN,  'center'),  # 마진율 수식
            (13, d['main_cust'],        AF,    False, C_MGRAY,  'left'),
        ], bg)
        # 숨김 파트너키 컬럼 N(14) — SUMIF용
        hc = ws.cell(row_n, 14)
        hc.value = d['partner_name']
        hc.font  = _font(size=1, color='FFFFFF')
        ws.column_dimensions['N'].width = 1

        # 매출금액 = 출하수량 × 단가  (H열 × I열)
        j_cell = ws.cell(row_n, 10)
        j_cell.value = f'=H{row_n}*I{row_n}'
        j_cell.number_format = MF
        j_cell.font = _font(bold=True, size=9, color=C_BLUE)
        j_cell.alignment = _al('right')
        j_cell.fill = _f(bg)

        # 손익 = 매출금액 - 매입금액  (J열 - E열)
        k_cell = ws.cell(row_n, 11)
        k_cell.value = f'=J{row_n}-E{row_n}'
        k_cell.number_format = MF
        k_cell.font = _font(bold=True, size=9, color=C_GREEN)
        k_cell.alignment = _al('right')
        k_cell.fill = _f(bg)

        # 마진율 = 손익 / 매출금액
        l_cell = ws.cell(row_n, 12)
        l_cell.value = f'=IFERROR(K{row_n}/J{row_n},"")'
        l_cell.number_format = '0.0%'
        l_cell.font = _font(size=9, color=C_GREEN)
        l_cell.alignment = _al('center')
        l_cell.fill = _f(bg)

        prev_partner = d['partner_name']
        ROW += 1

    d_end = ROW - 1

    # ── 요약 테이블 SUMIF 역주입 (세부 내역 기준으로 수식 연결) ──
    for s_row, pname in summary_rows_info:
        safe = pname.replace('"', '""')
        # 매입금액(C) = 세부내역 E열 합산
        c_cell = ws.cell(s_row, 3)
        c_cell.value = f'=SUMIF(N{d_start}:N{d_end},"{safe}",E{d_start}:E{d_end})'
        c_cell.number_format = MF
        c_cell.font = _font(size=9, color=C_BLACK); c_cell.alignment = _al('right')
        # 매출금액(D) = 세부내역 J열 합산
        d_cell = ws.cell(s_row, 4)
        d_cell.value = f'=SUMIF(N{d_start}:N{d_end},"{safe}",J{d_start}:J{d_end})'
        d_cell.number_format = MF
        d_cell.font = _font(bold=True, size=9, color=C_BLUE); d_cell.alignment = _al('right')
        # 품목수(G) = 세부내역 행 수
        g_cell = ws.cell(s_row, 7)
        g_cell.value = f'=COUNTIF(N{d_start}:N{d_end},"{safe}")'
        g_cell.number_format = '0'
        g_cell.font = _font(size=9, color=C_LGRAY); g_cell.alignment = _al('center')

    # ── KPI 카드 수식 업데이트 (요약 테이블 참조) ──
    kpi_cell_val = ws.cell(6, 1)
    kpi_cell_val.value = f'=TEXT(SUM(C{s_start}:C{s_end}),"₩#,##0")'
    kpi_cell_ship = ws.cell(6, 3)
    kpi_cell_ship.value = f'=TEXT(SUM(D{s_start}:D{s_end}),"₩#,##0")'
    kpi_cell_prof = ws.cell(6, 5)
    kpi_cell_prof.value = f'=TEXT(SUM(E{s_start}:E{s_end}),"₩#,##0")'
    kpi_cell_marg = ws.cell(6, 7)
    kpi_cell_marg.value = f'=IFERROR(TEXT(SUM(E{s_start}:E{s_end})/SUM(D{s_start}:D{s_end}),"0.0%"),"0.0%")'

    _total_bar(ws, ROW, NCOLS, 3, {
        4:  f'=SUM(D{d_start}:D{d_end})',
        5:  f'=SUM(E{d_start}:E{d_end})',
        6:  f'=SUM(F{d_start}:F{d_end})',
        7:  f'=SUM(G{d_start}:G{d_end})',
        8:  f'=SUM(H{d_start}:H{d_end})',
        10: f'=SUM(J{d_start}:J{d_end})',
        11: f'=SUM(K{d_start}:K{d_end})',
    }, '합  계')
    tot2_marg = ws.cell(ROW, 12)
    tot2_marg.value = f'=IFERROR(K{ROW}/J{ROW},"")'
    tot2_marg.number_format = '0.0%'
    tot2_marg.font = _font(bold=True, size=9, color=C_WHITE)
    tot2_marg.fill = _f(C_MGRAY); tot2_marg.alignment = _al('center')
    ROW += 2

    # ── 서명란 ──
    sign_titles = ['담당', '팀장', '본부장', '대표이사']
    sign_cols   = [1, 3, 5, 7]
    ws.row_dimensions[ROW].height = 10; ROW += 1
    for title, sc in zip(sign_titles, sign_cols):
        mc(ROW,   sc, ROW,   sc + 1); mc(ROW+1, sc, ROW+3, sc + 1); mc(ROW+4, sc, ROW+4, sc + 1)
        tc = ws.cell(ROW, sc, title); tc.font = _font(bold=True, size=9); tc.fill = _f('F2F2F2'); tc.alignment = _al('center'); tc.border = _border(b='000000')
        for rr in range(ROW+1, ROW+4):
            ws.cell(rr, sc).border = Border(left=Side(style='thin', color='AAAAAA'), right=Side(style='thin', color='AAAAAA'))
        bc = ws.cell(ROW+4, sc, '(서명)'); bc.font = _font(size=8, color=C_LGRAY); bc.alignment = _al('center'); bc.border = _border(t='000000')
        ws.row_dimensions[ROW].height = 16
        for rr in range(ROW+1, ROW+4): ws.row_dimensions[rr].height = 12
        ws.row_dimensions[ROW+4].height = 14

    ws.print_area = f'A1:{CL}{ROW + 4}'
    ws.page_setup.fitToPage = True; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 1
    ws.page_setup.orientation = 'landscape'
    ws.page_margins.left = 0.4; ws.page_margins.right = 0.4

    # ═══════════════════════════════════
    #  시트2: 고객사별 매출 분석
    # ═══════════════════════════════════
    ws2 = wb.create_sheet("고객사별 매출")
    ws2.sheet_view.showGridLines = False
    _col_widths(ws2, [4, 20, 16, 16, 16, 12, 20])

    def mc2s(r1, c1, r2, c2):
        ws2.merge_cells(start_row=r1, start_column=c1, end_row=r2, end_column=c2)

    mc2s(1, 1, 1, 7)
    h = ws2['A1']; h.value = f'고객사별 매출 분석  —  {year}년 {month}월'; h.font = _font(bold=True, size=14, color='FFFFFF'); h.fill = _f(C_BLACK); h.alignment = _al('left')
    ws2.row_dimensions[1].height = 32
    mc2s(2, 1, 2, 7)
    s = ws2['A2']; s.value = f'조이산업(주)  |  기준: {year}년 {month}월 출하 확정'; s.font = _font(size=9, color=C_LGRAY); s.fill = _f(C_DKGRAY); s.alignment = _al('left')
    ws2.row_dimensions[2].height = 16
    ws2.row_dimensions[3].height = 8

    # 고객사별 매출 집계: 외주처 입고 품목만, item.spec(품목 고객사) 우선
    all_ship_rows = db.query(
        func.coalesce(Item.spec, SalesOrder.partner_id).label("customer_id"),
        func.sum(Shipment.qty * Shipment.unit_price).label("ship_amt"),
        func.sum(Shipment.qty).label("ship_qty"),
        func.count(func.distinct(Shipment.part_no)).label("part_cnt"),
    ).join(SalesOrder, Shipment.so_no == SalesOrder.so_no
    ).outerjoin(Item, Shipment.part_no == Item.part_no
    ).filter(
        Shipment.status == ShipmentStatus.confirmed,
        Shipment.ship_date >= month_start,
        Shipment.ship_date < month_end,
        Shipment.part_no.in_(list(outsrc_part_nos)),   # 외주처 입고 품목만
    ).group_by(func.coalesce(Item.spec, SalesOrder.partner_id)).all()

    # item.spec은 이미 고객사 이름이므로 cust_map 조회 불필요, 그대로 사용
    cust_name_map = {p.name: p.name for p in cust_list}  # name→name (일관성)
    cust_summary = sorted([{
        'cust_id':   r.customer_id or '기타',
        'cust_name': r.customer_id or '기타',
        'ship_amt':  float(r.ship_amt or 0),
        'ship_qty':  int(r.ship_qty or 0),
        'part_cnt':  int(r.part_cnt or 0),
    } for r in all_ship_rows], key=lambda x: -x['ship_amt'])

    total_cust_ship = sum(c['ship_amt'] for c in cust_summary)

    C2_HDRS = ['순위', '고객사명', '매출금액(원)', '출하수량', '품목수', '비중', '비고']
    _col_header(ws2, 4, C2_HDRS, bg=C_DKGRAY)
    ws2.row_dimensions[4].height = 20

    c2_start = 5
    ROW2 = 5
    for i, c in enumerate(cust_summary):
        bg  = C_SNOW if i % 2 == 0 else C_WHITE
        pct = (c['ship_amt'] / total_cust_ship) if total_cust_ship > 0 else 0
        _data_row(ws2, ROW2, [
            (1, str(i+1),        AF,    False, C_LGRAY, 'center'),
            (2, c['cust_name'],  AF,    True,  C_BLACK,  'left'),
            (3, c['ship_amt'],   MF,    True,  C_BLUE,   'right'),
            (4, c['ship_qty'],   MF,    False, C_BLACK,  'right'),
            (5, c['part_cnt'],   AF,    False, C_LGRAY,  'center'),
            (6, pct,             '0.0%',False, C_GREEN,  'center'),
            (7, '',              AF,    False, C_BLACK,  'left'),
        ], bg)
        ROW2 += 1

    c2_end = ROW2 - 1
    _total_bar(ws2, ROW2, 7, 1, {
        3: f'=SUM(C{c2_start}:C{c2_end})',
        4: f'=SUM(D{c2_start}:D{c2_end})',
        5: f'=SUM(E{c2_start}:E{c2_end})',
    }, '합  계')
    pct_cell = ws2.cell(ROW2, 6); pct_cell.value = 1.0; pct_cell.number_format = '0.0%'
    pct_cell.font = _font(bold=True, size=9, color=C_WHITE); pct_cell.fill = _f(C_MGRAY); pct_cell.alignment = _al('center')
    ROW2 += 2

    # 고객사별 품목 상세
    mc2s(ROW2, 1, ROW2, 7)
    sec3 = ws2.cell(ROW2, 1, '■  고객사별 품목 상세')
    sec3.font = _font(bold=True, size=10, color='FFFFFF'); sec3.fill = _f(C_MGRAY); sec3.alignment = _al('left')
    ws2.row_dimensions[ROW2].height = 20; ROW2 += 1

    D2_HDRS = ['고객사명', '품번', '품명', '출하수량', '매출금액(원)', '손익(원)', '비고']
    _col_header(ws2, ROW2, D2_HDRS, bg=C_MGRAY)
    ws2.row_dimensions[ROW2].height = 20; ROW2 += 1

    # 고객사별 품목 상세 쿼리: 외주처 입고 품목만, item.spec 우선
    cust_detail_rows = db.query(
        func.coalesce(Item.spec, SalesOrder.partner_id).label("customer_id"),
        Shipment.part_no,
        func.sum(Shipment.qty * Shipment.unit_price).label("ship_amt"),
        func.sum(Shipment.qty).label("ship_qty"),
    ).join(SalesOrder, Shipment.so_no == SalesOrder.so_no
    ).outerjoin(Item, Shipment.part_no == Item.part_no
    ).filter(
        Shipment.status == ShipmentStatus.confirmed,
        Shipment.ship_date >= month_start,
        Shipment.ship_date < month_end,
        Shipment.part_no.in_(list(outsrc_part_nos)),   # 외주처 입고 품목만
    ).group_by(func.coalesce(Item.spec, SalesOrder.partner_id), Shipment.part_no).all()

    # 품번별 매입금액 (출하 비율 기준 추정)
    buy_by_part = {}
    for r in buy_rows:
        pno = r.part_no
        buy_by_part[pno] = buy_by_part.get(pno, 0) + float(r.buy_amt or 0)

    cust_detail_sorted = sorted(cust_detail_rows, key=lambda x: (x.customer_id or '', -float(x.ship_amt or 0)))
    prev_cust = None
    cust_order = {c['cust_id']: i for i, c in enumerate(cust_summary)}

    cust_detail_sorted = sorted(cust_detail_sorted,
        key=lambda x: (cust_order.get(x.customer_id or '기타', 999), -float(x.ship_amt or 0)))

    item_map2 = {it.part_no: it.name for it in db.query(Item).filter(Item.part_no.in_(
        list({r.part_no for r in cust_detail_rows})
    )).all()}

    for r in cust_detail_sorted:
        cid   = r.customer_id or '기타'
        cname = cust_map.get(cid, cid)
        same  = (cname == prev_cust)
        sship = float(r.ship_amt or 0)
        sbuy  = buy_by_part.get(r.part_no, 0)
        stot  = ship_by_part.get(r.part_no, {}).get('amt', 0)
        ratio = sship / stot if stot > 0 else 0
        sprofit = sship - sbuy * ratio
        bg = 'EEF2FF' if (cust_order.get(cid, 0) % 2 == 0) else 'F0FDF4'
        row_n2 = ROW2
        _data_row(ws2, ROW2, [
            (1, '' if same else cname, AF, not same, C_BLACK if not same else C_LGRAY, 'left'),
            (2, r.part_no,                  AF, False, C_MGRAY, 'left'),
            (3, item_map2.get(r.part_no,''),AF, False, C_BLACK,  'left'),
            (4, int(r.ship_qty or 0),       MF, False, C_BLACK,  'right'),
            (5, sship,                      MF, True,  C_BLUE,   'right'),
            (6, sprofit,                    MF, True,  C_GREEN if sprofit >= 0 else C_RED, 'right'),
            (7, '',                         AF, False, C_BLACK,  'left'),
        ], bg)
        prev_cust = cname
        ROW2 += 1

    ws2.print_area = f'A1:G{ROW2}'
    ws2.page_setup.fitToPage = True; ws2.page_setup.fitToWidth = 1
    ws2.page_setup.orientation = 'landscape'
    ws2.page_margins.left = 0.4; ws2.page_margins.right = 0.4

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    fn_ascii = f"OutsourcePL_{year}_{month:02d}.xlsx"
    fn_kor   = f"외주처_손익보고서_{year}년{month:02d}월.xlsx"
    encoded  = quote(fn_kor, safe='')
    return StreamingResponse(
        buf,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f"attachment; filename={fn_ascii}; filename*=UTF-8''{encoded}"},
    )
