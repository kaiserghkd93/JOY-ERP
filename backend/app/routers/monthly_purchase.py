"""월 매입 집계표 — 업체별 / ERP receipt 자동 집계 + 수동 저장"""
from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import Integer, String, Numeric, Date, Text, Boolean
from sqlalchemy.orm import Session, Mapped, mapped_column
from sqlalchemy import text
import io, openpyxl
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.utils import get_column_letter

from app.database import get_db, Base, engine


# ── 저장 모델 ─────────────────────────────────────────────────────
class MonthlyPurchaseRow(Base):
    __tablename__ = "monthly_purchase_row"

    id:           Mapped[int]            = mapped_column(Integer, primary_key=True, autoincrement=True)
    year_month:   Mapped[str]            = mapped_column(String(7))
    partner_id:   Mapped[str]            = mapped_column(String(100), default="")
    company_name: Mapped[str]            = mapped_column(String(100), default="")
    closing_date: Mapped[Optional[date_type]] = mapped_column(Date, nullable=True)
    row_no:       Mapped[int]            = mapped_column(Integer)
    trade_date:   Mapped[Optional[date_type]] = mapped_column(Date, nullable=True)
    item_name:    Mapped[str]            = mapped_column(String(200), default="")
    spec:         Mapped[str]            = mapped_column(String(200), default="")
    qty:          Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    unit_price:   Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    supply_amount: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    has_invoice:  Mapped[bool]           = mapped_column(Boolean, default=True)
    note:         Mapped[str]            = mapped_column(Text, default="")


Base.metadata.create_all(bind=engine)

router = APIRouter(prefix="/monthly-purchase", tags=["월 매입 집계표"])


class RowIn(BaseModel):
    row_no: int
    trade_date: Optional[date_type] = None
    item_name: str = ""
    spec: str = ""
    qty: Optional[int] = None
    unit_price: Optional[int] = None
    supply_amount: Optional[int] = None
    has_invoice: bool = True
    note: str = ""


class SaveIn(BaseModel):
    year_month:   str
    partner_id:   str
    company_name: str = ""
    closing_date: Optional[date_type] = None
    rows: list[RowIn]


def _serialize(rows):
    return [{"row_no": r.row_no,
             "trade_date": str(r.trade_date) if r.trade_date else None,
             "item_name": r.item_name, "spec": r.spec,
             "qty": r.qty, "unit_price": r.unit_price,
             "supply_amount": r.supply_amount,
             "has_invoice": r.has_invoice, "note": r.note}
            for r in rows]


# ── 저장된 월 목록 (파트너별) ──────────────────────────────────────
@router.get("/list")
def list_months(db: Session = Depends(get_db)):
    rows = db.execute(text(
        "SELECT DISTINCT year_month, partner_id FROM monthly_purchase_row ORDER BY year_month DESC"
    )).fetchall()
    return [{"year_month": r.year_month, "partner_id": r.partner_id} for r in rows]


# ── 해당 월 거래 파트너 목록 (ERP) ────────────────────────────────
@router.get("/partners/{year_month}")
def partners_for_month(year_month: str, db: Session = Depends(get_db)):
    y, m = year_month.split("-")
    start = f"{y}-{m}-01"
    nm = int(m) + 1; ny = int(y)
    if nm > 12: nm = 1; ny += 1
    end = f"{ny}-{nm:02d}-01"
    rows = db.execute(text("""
        SELECT r.partner_id, COALESCE(p.name, r.partner_id) AS partner_name,
               SUM(r.qty * COALESCE(r.unit_price,0)) AS total
        FROM receipt r
        LEFT JOIN partner p ON p.partner_id = r.partner_id
        WHERE r.receipt_date >= :s AND r.receipt_date < :e
          AND r.status = 'confirmed' AND r.partner_id IS NOT NULL
        GROUP BY r.partner_id, COALESCE(p.name, r.partner_id)
        ORDER BY total DESC
    """), {"s": start, "e": end}).fetchall()
    return [{"partner_id": r.partner_id, "partner_name": r.partner_name, "total": int(r.total or 0)}
            for r in rows]


# ── ERP 자동집계 (업체별) ─────────────────────────────────────────
@router.get("/auto/{year_month}/{partner_id}")
def auto_from_erp(year_month: str, partner_id: str, db: Session = Depends(get_db)):
    y, m = year_month.split("-")
    start = f"{y}-{m}-01"
    nm = int(m) + 1; ny = int(y)
    if nm > 12: nm = 1; ny += 1
    end = f"{ny}-{nm:02d}-01"

    receipts = db.execute(text("""
        SELECT r.receipt_date, COALESCE(i.name, r.part_no) AS item_name,
               COALESCE(i.spec,'') AS spec, r.qty,
               COALESCE(r.unit_price, i.std_buy_price, 0) AS unit_price,
               COALESCE(p.name, r.partner_id) AS partner_name
        FROM receipt r
        LEFT JOIN item i    ON i.part_no    = r.part_no
        LEFT JOIN partner p ON p.partner_id = r.partner_id
        WHERE r.partner_id = :pid
          AND r.receipt_date >= :s AND r.receipt_date < :e
          AND r.status = 'confirmed'
        ORDER BY r.receipt_date, r.gr_no
    """), {"pid": partner_id, "s": start, "e": end}).fetchall()

    partner_name = receipts[0].partner_name if receipts else partner_id
    rows = []
    for i, r in enumerate(receipts, 1):
        qty = int(r.qty or 0)
        up  = int(r.unit_price or 0)
        rows.append({
            "row_no": i, "trade_date": str(r.receipt_date) if r.receipt_date else None,
            "item_name": r.item_name or "", "spec": r.spec or "",
            "qty": qty, "unit_price": up,
            "supply_amount": qty * up, "has_invoice": True, "note": "",
        })
    return {"year_month": year_month, "partner_id": partner_id,
            "company_name": partner_name, "closing_date": None,
            "rows": rows, "source": "erp"}


# ── 저장된 데이터 조회 ─────────────────────────────────────────────
@router.get("/{year_month}/{partner_id}")
def get_month(year_month: str, partner_id: str, db: Session = Depends(get_db)):
    saved = db.execute(text(
        "SELECT * FROM monthly_purchase_row WHERE year_month=:ym AND partner_id=:pid ORDER BY row_no"
    ), {"ym": year_month, "pid": partner_id}).fetchall()
    if saved:
        meta = saved[0]
        return {"year_month": year_month, "partner_id": partner_id,
                "company_name": meta.company_name or "",
                "closing_date": str(meta.closing_date) if meta.closing_date else None,
                "rows": _serialize(saved), "source": "saved"}
    return auto_from_erp(year_month, partner_id, db)


# ── 저장 ──────────────────────────────────────────────────────────
@router.post("/save")
def save_month(body: SaveIn, db: Session = Depends(get_db)):
    db.execute(text(
        "DELETE FROM monthly_purchase_row WHERE year_month=:ym AND partner_id=:pid"
    ), {"ym": body.year_month, "pid": body.partner_id})
    for r in body.rows:
        db.execute(text("""
            INSERT INTO monthly_purchase_row
              (year_month,partner_id,company_name,closing_date,row_no,
               trade_date,item_name,spec,qty,unit_price,supply_amount,has_invoice,note)
            VALUES(:ym,:pid,:cn,:cd,:rn,:td,:nm,:sp,:qty,:up,:sa,:hi,:nt)
        """), {
            "ym": body.year_month, "pid": body.partner_id,
            "cn": body.company_name, "cd": body.closing_date,
            "rn": r.row_no, "td": r.trade_date,
            "nm": r.item_name, "sp": r.spec,
            "qty": r.qty, "up": r.unit_price,
            "sa": r.supply_amount, "hi": r.has_invoice, "nt": r.note,
        })
    db.commit()
    return {"ok": True}


# ── Excel 다운로드 (원본 양식 동일 형식) ──────────────────────────
@router.get("/excel/{year_month}/{partner_id}")
def download_excel(year_month: str, partner_id: str, db: Session = Depends(get_db)):
    data = get_month(year_month, partner_id, db)
    rows = data["rows"]
    y, m = year_month.split("-")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "매입집계표"

    def cell(r, c, v=None, bold=False, size=10, align='left', border=False, bg=None, color='000000'):
        cel = ws.cell(r, c, v)
        cel.font = Font(name='맑은 고딕', bold=bold, size=size, color=color)
        cel.alignment = Alignment(horizontal=align, vertical='center', wrap_text=True)
        if border:
            s = Side(style='thin', color='000000')
            cel.border = Border(left=s, right=s, top=s, bottom=s)
        if bg:
            cel.fill = PatternFill('solid', fgColor=bg)
        return cel

    def mc(r1, c1, r2, c2):
        ws.merge_cells(start_row=r1, start_column=c1, end_row=r2, end_column=c2)

    # 컬럼 너비 (A~N = 14열)
    widths = [4, 10, 20, 12, 7, 10, 10, 13, 10, 4, 4, 4, 4, 10]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # 행1: 결재란
    ws.row_dimensions[1].height = 36
    for lbl, c1, c2 in [('담당', 7, 8), ('경리 확인', 9, 11), ('임원', 12, 13), ('대표이사', 14, 14)]:
        mc(1, c1, 1, c2)
        cell(1, c1, lbl, bold=True, size=9, align='center', border=True, bg='EEEEEE')
    mc(2, 7, 2, 8); mc(2, 9, 2, 11); mc(2, 12, 2, 13)
    for c in [7, 9, 12, 14]:
        ws.row_dimensions[2].height = 40
        ws.cell(2, c).border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin'))

    # 행2: 업체명
    mc(3, 1, 3, 6)
    cell(3, 1, f'업체명 : {data["company_name"]}', bold=True, size=11)
    ws.row_dimensions[3].height = 18

    # 행3: 제목
    mc(4, 1, 4, 14)
    cell(4, 1, f'{y}년 {m}월    매 입    집 계 표', bold=True, size=16, align='center')
    ws.row_dimensions[4].height = 34

    # 행4: 마감제출일
    mc(5, 1, 5, 6)
    cd = data.get("closing_date") or ""
    cell(5, 1, f'마감제출일 : {cd}', size=10)
    ws.row_dimensions[5].height = 16

    # 행5: 노트
    mc(6, 1, 6, 14)
    cell(6, 1, '* NO별 거래 명세표 첨부', size=9, color='555555')
    ws.row_dimensions[6].height = 14

    # 헤더행
    ws.row_dimensions[7].height = 20
    hdrs = [
        (1,1,'NO',2,1), (1,2,'거래일',2,2), (1,3,'품명',2,3), (1,4,'규격',2,4),
        (1,5,'수량',2,5), (1,6,'단가',2,8),
        (1,9,'공급가액',2,11), (1,12,'거래명세표',1,13), (1,14,'비고',2,14),
    ]
    for r1,c1,lbl,r2,c2 in hdrs:
        mc(7+r1-1, c1, 7+r2-1, c2)
        cell(7+r1-1, c1, lbl, bold=True, size=10, align='center', border=True, bg='F0F0F0')
    # 거래명세표 유/무 서브헤더
    mc(8, 12, 8, 12); mc(8, 13, 8, 13)
    cell(8, 12, '유', bold=True, size=9, align='center', border=True, bg='F0F0F0')
    cell(8, 13, '무', bold=True, size=9, align='center', border=True, bg='F0F0F0')
    ws.row_dimensions[8].height = 16

    # 데이터행 (최소 15행)
    data_rows = list(rows)
    while len(data_rows) < 15:
        data_rows.append({"row_no": len(data_rows)+1, "trade_date": None, "item_name": "",
                          "spec": "", "qty": None, "unit_price": None,
                          "supply_amount": None, "has_invoice": True, "note": ""})

    total_supply = 0
    for i, r in enumerate(data_rows):
        rn = 9 + i
        ws.row_dimensions[rn].height = 16
        sa = r.get("supply_amount") or 0
        total_supply += sa
        mc(rn, 6, rn, 8); mc(rn, 9, rn, 11)
        vals = [
            (1, r.get("row_no") or i+1, 'center'),
            (2, str(r.get("trade_date") or ""), 'center'),
            (3, r.get("item_name") or "", 'left'),
            (4, r.get("spec") or "", 'center'),
            (5, r.get("qty") or None, 'right'),
            (6, r.get("unit_price") or None, 'right'),
            (9, sa if sa else None, 'right'),
            (12, '●' if r.get("has_invoice", True) else '', 'center'),
            (13, '' if r.get("has_invoice", True) else '●', 'center'),
            (14, r.get("note") or "", 'left'),
        ]
        for c, v, al in vals:
            cel = ws.cell(rn, c, v)
            cel.font = Font(name='맑은 고딕', size=10)
            cel.alignment = Alignment(horizontal=al, vertical='center')
            s = Side(style='thin', color='AAAAAA')
            cel.border = Border(left=s, right=s, top=s, bottom=s)
            if c == 9 and v:
                cel.number_format = '#,##0'
            if c in (5, 6) and v:
                cel.number_format = '#,##0'

    # 합계행
    foot_r = 9 + len(data_rows)
    ws.row_dimensions[foot_r].height = 18
    mc(foot_r, 1, foot_r, 8)
    cell(foot_r, 1, '합  계', bold=True, size=11, align='center', border=True, bg='F0F0F0')
    mc(foot_r, 9, foot_r, 11)
    fc = ws.cell(foot_r, 9, total_supply)
    fc.font = Font(name='맑은 고딕', bold=True, size=11)
    fc.alignment = Alignment(horizontal='right', vertical='center')
    fc.number_format = '#,##0'
    s = Side(style='thin'); fc.border = Border(left=s, right=s, top=s, bottom=s)
    fc.fill = PatternFill('solid', fgColor='F0F0F0')

    ws.print_area = f'A1:N{foot_r}'
    ws.page_setup.fitToPage = True; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 1
    ws.page_setup.orientation = 'landscape'

    buf = io.BytesIO()
    wb.save(buf); buf.seek(0)
    safe_name = data["company_name"].replace(" ", "_")
    fname = f'매입집계표_{safe_name}_{year_month}.xlsx'
    return StreamingResponse(buf,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={"Content-Disposition": f'attachment; filename="{fname}"'})
