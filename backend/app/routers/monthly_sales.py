"""월 매출 집계표 — 관리자가 작성/조회/Excel 양식 다운로드/업로드"""
from datetime import date as date_type
from typing import Optional
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Numeric, Date, Text, text
from sqlalchemy.orm import Session, Mapped, mapped_column

from app.database import get_db, Base, engine
from app.routers.auth import require_admin
from app.models.auth import User


# ── 모델 ──────────────────────────────────────────────────────────
class MonthlySalesRow(Base):
    __tablename__ = "monthly_sales_row"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year_month: Mapped[str] = mapped_column(String(7))          # YYYY-MM
    company_name: Mapped[str] = mapped_column(String(100), default="")
    closing_date: Mapped[Optional[date_type]] = mapped_column(Date, nullable=True)
    row_no: Mapped[int] = mapped_column(Integer)                # 1~15
    trade_date: Mapped[Optional[date_type]] = mapped_column(Date, nullable=True)
    item_name: Mapped[str] = mapped_column(String(200), default="")
    spec: Mapped[str] = mapped_column(String(200), default="")
    qty: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    unit_price: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    supply_amount: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    has_invoice: Mapped[bool] = mapped_column(default=True)     # True=유 False=무
    note: Mapped[str] = mapped_column(Text, default="")


Base.metadata.create_all(bind=engine)


# ── 라우터 ──────────────────────────────────────────────────────
router = APIRouter(prefix="/monthly-sales", tags=["월 매출 집계표"])


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


class SummaryIn(BaseModel):
    year_month: str          # YYYY-MM
    company_name: str = ""
    closing_date: Optional[date_type] = None
    rows: list[RowIn]


@router.get("/list")
def list_months(db: Session = Depends(get_db)):
    """저장된 월 목록"""
    rows = db.execute(
        text("SELECT DISTINCT year_month, company_name FROM monthly_sales_row ORDER BY year_month DESC")
    ).fetchall()
    return [{"year_month": r[0], "company_name": r[1]} for r in rows]


@router.get("/{year_month}")
def get_summary(year_month: str, db: Session = Depends(get_db)):
    """특정 월 집계표 조회"""
    rows = (
        db.query(MonthlySalesRow)
        .filter(MonthlySalesRow.year_month == year_month)
        .order_by(MonthlySalesRow.row_no)
        .all()
    )
    if not rows:
        return {"year_month": year_month, "company_name": "", "closing_date": None, "rows": []}
    first = rows[0]
    return {
        "year_month": year_month,
        "company_name": first.company_name,
        "closing_date": str(first.closing_date) if first.closing_date else None,
        "rows": [
            {
                "row_no": r.row_no,
                "trade_date": str(r.trade_date) if r.trade_date else None,
                "item_name": r.item_name,
                "spec": r.spec,
                "qty": r.qty,
                "unit_price": r.unit_price,
                "supply_amount": r.supply_amount,
                "has_invoice": r.has_invoice,
                "note": r.note,
            }
            for r in rows
        ],
    }


@router.post("/save")
def save_summary(body: SummaryIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """월 집계표 저장 (기존 덮어쓰기)"""
    db.query(MonthlySalesRow).filter(MonthlySalesRow.year_month == body.year_month).delete()
    for r in body.rows:
        db.add(MonthlySalesRow(
            year_month=body.year_month,
            company_name=body.company_name,
            closing_date=body.closing_date,
            row_no=r.row_no,
            trade_date=r.trade_date,
            item_name=r.item_name,
            spec=r.spec,
            qty=r.qty,
            unit_price=r.unit_price,
            supply_amount=r.supply_amount,
            has_invoice=r.has_invoice,
            note=r.note,
        ))
    db.commit()
    return {"ok": True}


@router.get("/template")
def download_template():
    """빈 월 매출 집계표 Excel 양식 다운로드"""
    try:
        import openpyxl
        from openpyxl.styles import (Font, Alignment, Border, Side, PatternFill)
        from openpyxl.utils import get_column_letter
    except ImportError:
        raise HTTPException(500, "openpyxl 패키지가 없습니다")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "월매출집계표"

    # ── 헬퍼 ─────────────────────────────────────────────────────
    thin = Side(style="thin")
    thick = Side(style="medium")
    def border(l=False, r=False, t=False, b=False):
        return Border(
            left=thick if l else thin,
            right=thick if r else thin,
            top=thick if t else thin,
            bottom=thick if b else thin,
        )
    def cell(row, col, value="", bold=False, size=11, align="left", fill=None, wrap=False):
        c = ws.cell(row=row, column=col, value=value)
        c.font = Font(name="맑은 고딕", size=size, bold=bold)
        h = {"left": "left", "center": "center", "right": "right"}.get(align, "left")
        c.alignment = Alignment(horizontal=h, vertical="center", wrap_text=wrap)
        if fill:
            c.fill = PatternFill("solid", fgColor=fill)
        return c

    # ── 열 너비 ──────────────────────────────────────────────────
    col_widths = [6, 13, 26, 18, 8, 13, 16, 8, 8, 14]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # ── 결재란 (행 1~2, 열 6~10) ─────────────────────────────────
    for label, col in [("담당", 7), ("경리 확인", 8), ("임원", 9), ("대표이사", 10)]:
        c1 = ws.cell(row=1, column=col, value=label)
        c1.font = Font(name="맑은 고딕", size=9, bold=True)
        c1.alignment = Alignment(horizontal="center", vertical="center")
        c1.fill = PatternFill("solid", fgColor="D9D9D9")
        c1.border = Border(left=thin, right=thin, top=thick, bottom=thin)
        ws.cell(row=2, column=col).border = Border(left=thin, right=thin, top=thin, bottom=thick)
    ws.row_dimensions[1].height = 16
    ws.row_dimensions[2].height = 28

    # ── 업체명 (행 2) ────────────────────────────────────────────
    cell(2, 1, "업체명 :", bold=True, size=10)
    ws.merge_cells("B2:D2")
    c = ws.cell(row=2, column=2)
    c.font = Font(name="맑은 고딕", size=11)
    c.border = Border(bottom=thick)

    # ── 제목 (행 3) ──────────────────────────────────────────────
    ws.merge_cells("A3:J3")
    t = ws.cell(row=3, column=1, value="월  매출  집계표")
    t.font = Font(name="맑은 고딕", size=16, bold=True, underline="single", color="1F4E79")
    t.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[3].height = 30

    # ── 마감제출일 (행 4) ────────────────────────────────────────
    cell(4, 1, "마감제출일 :", bold=True, size=10)
    ws.merge_cells("B4:D4")
    ws.cell(row=4, column=2).border = Border(bottom=thick)
    ws.row_dimensions[4].height = 18

    # ── NO별 거래명세표 첨부 안내 (행 5) ─────────────────────────
    ws.merge_cells("A5:J5")
    n = ws.cell(row=5, column=1, value="* NO별 거래 명세표 첨부")
    n.font = Font(name="맑은 고딕", size=9, color="595959")
    n.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[5].height = 14

    # ── 헤더 행 (행 6) ───────────────────────────────────────────
    headers = ["NO", "거래일", "품명", "규격", "수량", "단가", "공급가액", "거래명세표", "", "비고"]
    for col, h in enumerate(headers, 1):
        c = ws.cell(row=6, column=col, value=h)
        c.font = Font(name="맑은 고딕", size=10, bold=True)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.fill = PatternFill("solid", fgColor="F2F2F2")
        c.border = Border(left=thick if col == 1 else thin,
                          right=thick if col == 10 else thin,
                          top=thick, bottom=thin)
    # 거래명세표 유/무 서브헤더
    ws.merge_cells("H6:I6")
    ws.row_dimensions[6].height = 18

    # ── 데이터 행 7~21 (15행) ────────────────────────────────────
    for row_no in range(1, 16):
        r = row_no + 6
        ws.row_dimensions[r].height = 16
        for col in range(1, 11):
            c = ws.cell(row=r, column=col)
            c.font = Font(name="맑은 고딕", size=10)
            c.border = Border(
                left=thick if col == 1 else thin,
                right=thick if col == 10 else thin,
                top=thin,
                bottom=thick if row_no == 15 else thin,
            )
            if col == 1:
                c.value = row_no
                c.alignment = Alignment(horizontal="center", vertical="center")
            elif col in (5, 6, 7):
                c.alignment = Alignment(horizontal="right", vertical="center")
                if col == 7:
                    # 공급가액 = 수량 × 단가 수식
                    c.value = f"=IF(AND(E{r}<>\"\",F{r}<>\"\"),E{r}*F{r},\"\")"
                    c.number_format = "#,##0"
            elif col in (8, 9):
                c.alignment = Alignment(horizontal="center", vertical="center")
                if col == 8:
                    c.value = "유"
                    c.fill = PatternFill("solid", fgColor="F5C518")
                    c.font = Font(name="맑은 고딕", size=10, bold=True)
                else:
                    c.value = "무"
            else:
                c.alignment = Alignment(horizontal="left", vertical="center")

    # ── 합계 행 (행 22) ──────────────────────────────────────────
    sum_r = 22
    ws.row_dimensions[sum_r].height = 18
    ws.merge_cells(f"A{sum_r}:D{sum_r}")
    sc = ws.cell(row=sum_r, column=1, value="합계")
    sc.font = Font(name="맑은 고딕", size=10, bold=True)
    sc.alignment = Alignment(horizontal="center", vertical="center")
    sc.fill = PatternFill("solid", fgColor="F2F2F2")
    sc.border = Border(left=thick, right=thin, top=thin, bottom=thick)

    for col in range(2, 5):
        ws.cell(row=sum_r, column=col).border = Border(top=thin, bottom=thick)

    # 수량 합계
    qc = ws.cell(row=sum_r, column=5, value="=SUM(E7:E21)")
    qc.font = Font(name="맑은 고딕", size=10, bold=True)
    qc.alignment = Alignment(horizontal="right", vertical="center")
    qc.border = Border(left=thin, right=thin, top=thin, bottom=thick)
    qc.number_format = "#,##0"

    ws.cell(row=sum_r, column=6).border = Border(top=thin, bottom=thick)

    # 공급가액 합계
    ac = ws.cell(row=sum_r, column=7, value="=SUM(G7:G21)")
    ac.font = Font(name="맑은 고딕", size=10, bold=True)
    ac.alignment = Alignment(horizontal="right", vertical="center")
    ac.border = Border(left=thin, right=thin, top=thin, bottom=thick)
    ac.number_format = "#,##0"

    for col in range(8, 11):
        ws.cell(row=sum_r, column=col).border = Border(
            left=thin, right=thick if col == 10 else thin, top=thin, bottom=thick
        )

    # ── 출력 ─────────────────────────────────────────────────────
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=monthly_sales_form.xlsx"},
    )


@router.post("/upload-excel/{year_month}")
async def upload_excel(
    year_month: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """엑셀 업로드 → DB 저장
    양식(ERP 템플릿 기준):
      B2: 업체명
      B4: 마감제출일
      행 6: 헤더 (NO/거래일/품명/규격/수량/단가/공급가액/거래명세표유/무/비고)
      행 7~21: 데이터 (15행)
      NO(A) 거래일(B) 품명(C) 규격(D) 수량(E) 단가(F) 공급가액(G) 유/무(H/I) 비고(J)
    """
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(500, "openpyxl 패키지가 없습니다")

    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active

    # 헤더 정보
    company_name = str(ws["B2"].value or "").strip()
    closing_raw = ws["B4"].value
    closing_date = None
    if closing_raw:
        if hasattr(closing_raw, "date"):
            closing_date = closing_raw.date()
        else:
            try:
                from datetime import datetime
                closing_date = datetime.strptime(str(closing_raw), "%Y-%m-%d").date()
            except Exception:
                pass

    db.query(MonthlySalesRow).filter(MonthlySalesRow.year_month == year_month).delete()

    count = 0
    for row_no in range(1, 16):
        excel_row = row_no + 6   # 데이터 시작 7행
        a = ws.cell(excel_row, 1).value  # NO
        b = ws.cell(excel_row, 2).value  # 거래일
        c = ws.cell(excel_row, 3).value  # 품명
        d = ws.cell(excel_row, 4).value  # 규격
        e = ws.cell(excel_row, 5).value  # 수량
        f = ws.cell(excel_row, 6).value  # 단가
        g = ws.cell(excel_row, 7).value  # 공급가액
        h = ws.cell(excel_row, 8).value  # 거래명세표 유
        i_val = ws.cell(excel_row, 9).value  # 거래명세표 무
        i = ws.cell(excel_row, 10).value  # 비고

        # 빈 행 스킵
        if not any([b, c, d, e, f, g]):
            db.add(MonthlySalesRow(
                year_month=year_month, company_name=company_name, closing_date=closing_date,
                row_no=row_no, has_invoice=True,
            ))
            count += 1
            continue

        trade_date = None
        if b:
            if hasattr(b, "date"):
                trade_date = b.date()
            else:
                try:
                    from datetime import datetime
                    trade_date = datetime.strptime(str(b), "%Y-%m-%d").date()
                except Exception:
                    pass

        # 유 셀이 "유" 면 has_invoice=True, 무 셀이 "무" 면 False
        if i_val and str(i_val).strip() == "무":
            has_invoice = False
        elif h and str(h).strip() == "유":
            has_invoice = True
        else:
            has_invoice = True  # 기본값

        db.add(MonthlySalesRow(
            year_month=year_month,
            company_name=company_name,
            closing_date=closing_date,
            row_no=row_no,
            trade_date=trade_date,
            item_name=str(c or ""),
            spec=str(d or ""),
            qty=int(e) if e else None,
            unit_price=int(f) if f else None,
            supply_amount=int(g) if g else None,
            has_invoice=has_invoice,
            note=str(i or ""),
        ))
        count += 1

    db.commit()
    return {"ok": True, "imported": count, "year_month": year_month, "company_name": company_name}
