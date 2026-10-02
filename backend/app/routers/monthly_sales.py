"""월 매출 집계표 — 관리자가 작성/조회/Excel 업로드"""
from datetime import date as date_type
from typing import Optional
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
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
def list_months(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """저장된 월 목록"""
    rows = db.execute(
        text("SELECT DISTINCT year_month, company_name FROM monthly_sales_row ORDER BY year_month DESC")
    ).fetchall()
    return [{"year_month": r[0], "company_name": r[1]} for r in rows]


@router.get("/{year_month}")
def get_summary(year_month: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
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


@router.post("/upload-excel/{year_month}")
async def upload_excel(
    year_month: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """엑셀 업로드 → DB 저장
    양식: NO(A) 거래일(B) 품명(C) 규격(D) 수량(E) 단가(F) 공급가액(G) 거래명세표(H) 비고(I)
    데이터 시작 행: 7 (헤더 포함 6행)
    업체명: B2, 마감제출일: B4
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
        h = ws.cell(excel_row, 8).value  # 거래명세표(유/무)
        i = ws.cell(excel_row, 9).value  # 비고

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

        has_invoice = str(h or "유").strip() in ("유", "Y", "y", "1", "True", "true")

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
