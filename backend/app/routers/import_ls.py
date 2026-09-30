"""LS Electric 출고내역 엑셀 임포트 → 품목 자동등록 + 거래명세서 자동발행"""
import io
from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import openpyxl

from sqlalchemy.orm import Session
from app.database import get_db
from app.models.master import Item, Partner, ItemType
from app.models.sales import Invoice, InvoiceLine, InvoiceStatus, SalesOrder, SOStatus, Shipment, ShipmentStatus
from app.models.ledger import LedgerType
from app.services.doc_no import next_doc_no
from app.services.ledger_service import post_ledger, get_avg_price

router = APIRouter(prefix="/import", tags=["데이터 임포트"])


@router.post("/hyundai-so")
def import_hyundai_so(
    partner_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    현대 수주양식 엑셀 임포트.
    열 순서 (0-based, 헤더 1행 스킵):
      A(0)=품번, B(1)=품번2, C(2)=품명(긴설명), D(3)=수주수량,
      E(4)=단가, F(5)=금액, G(6)=이납수량, H(7)=이납금액,
      I(8)=수주일자, J(9)=납기요구일자
    중복 체크: 동일 (partner_id + part_no + order_date + due_date + qty) 이미 존재하면 SKIP
    """
    partner = db.get(Partner, partner_id)
    if not partner:
        raise HTTPException(404, f"거래처 없음: {partner_id}")

    content = file.file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active

    stats = {"rows_ok": 0, "rows_skip": 0, "items_created": 0, "so_created": 0, "errors": []}

    all_rows = list(ws.iter_rows(min_row=1, values_only=True))

    # 헤더 감지: 첫 행 D열이 숫자가 아니면 헤더
    first_data_row = 0
    if all_rows and not isinstance(all_rows[0][3], (int, float)):
        first_data_row = 1

    for row_idx, row in enumerate(all_rows[first_data_row:], start=first_data_row + 1):
        if not row[0]:
            stats["rows_skip"] += 1
            continue
        try:
            part_no    = str(row[0]).strip()
            raw_name   = str(row[2]).strip() if row[2] else ""
            # "ACB DWG PART/ASSY {part_no} {name} ACB" 형식에서 품명 추출
            prefix = f"ACB DWG PART/ASSY {part_no} "
            if raw_name.upper().startswith("ACB DWG PART/ASSY"):
                name = raw_name[len(prefix):].strip()
                if name.upper().endswith(" ACB"):
                    name = name[:-4].strip()
            else:
                name = raw_name

            qty        = _safe_int(row[3])
            unit_price = _safe_float(row[4])
            order_date = _parse_date(row[8])
            due_date   = _parse_date(row[9])

            if not part_no or qty <= 0:
                stats["rows_skip"] += 1
                continue
            if not order_date or not due_date:
                stats["errors"].append({"row": row_idx, "error": f"날짜 파싱 실패: {row[8]}, {row[9]}"})
                continue

            # 중복 체크: 동일 품번+수주일+납기일+수량이 이미 있으면 SKIP
            exists = db.query(SalesOrder).filter(
                SalesOrder.partner_id == partner_id,
                SalesOrder.part_no == part_no,
                SalesOrder.order_date == order_date,
                SalesOrder.due_date == due_date,
                SalesOrder.qty == qty,
            ).first()
            if exists:
                stats["rows_skip"] += 1
                continue

            # 품목 자동 등록
            item = db.get(Item, part_no)
            if not item:
                item = Item(
                    part_no=part_no, name=name, unit="EA",
                    item_type=ItemType.outsourced,
                    std_sell_price=unit_price, std_buy_price=0,
                )
                db.add(item)
                db.flush()
                stats["items_created"] += 1

            # 수주 등록
            so_no = next_doc_no(db, "SO", "sales_order", "so_no")
            so = SalesOrder(
                so_no=so_no, partner_id=partner_id, part_no=part_no,
                qty=qty, order_date=order_date, due_date=due_date,
                status=SOStatus.open, note="현대 수주양식 임포트",
            )
            db.add(so)
            db.flush()
            stats["so_created"] += 1
            stats["rows_ok"] += 1

        except Exception as e:
            stats["errors"].append({"row": row_idx, "error": str(e)})

    db.commit()
    return stats


def _parse_date(val) -> date_type | None:
    from datetime import datetime as dt_type
    if val is None:
        return None
    if isinstance(val, dt_type):
        return val.date()
    if isinstance(val, date_type):
        return val
    if hasattr(val, 'date'):
        return val.date()
    s = str(val).strip()
    for fmt in ('%Y-%m-%d', '%Y/%m/%d', '%Y.%m.%d', '%d-%m-%Y'):
        try:
            from datetime import datetime
            return datetime.strptime(s, fmt).date()
        except Exception:
            pass
    return None


def _safe_float(val) -> float:
    try:
        return float(str(val).replace(',', '').strip()) if val else 0.0
    except Exception:
        return 0.0


def _safe_int(val) -> int:
    try:
        return int(round(float(str(val).replace(',', '').strip()))) if val else 0
    except Exception:
        return 0


@router.post("/ls-shipment")
def import_ls_shipment(
    partner_id: str,
    auto_issue: bool = True,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    LS Electric 출고내역 엑셀 임포트.
    열 순서 (1-based):
      A=품명, B=품번(LS코드), C=내부번호, D=도면번호,
      E=출고일자, F=단위, G=(공백), H=(공백),
      I=수량, J=통화, K=단가, L=금액, M=날짜, ...

    - partner_id: 고객사 코드 (LS Electric 거래처 코드)
    - auto_issue: True면 임포트 즉시 발행+출하처리
    """
    partner = db.get(Partner, partner_id)
    if not partner:
        raise HTTPException(404, f"거래처 없음: {partner_id}")

    content = file.file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active

    stats = {"items_created": 0, "rows_ok": 0, "rows_skip": 0, "invoices": [], "errors": []}

    # 날짜별 라인 그룹핑
    groups: dict[str, list[dict]] = {}

    # 실제 납품현황 파일 열 구조 (헤더 1행 스킵):
    # A(0)=Shipment No.  B(1)=품번호  C(2)=주문번호  D(3)=품목호(품번)
    # E(4)=Category      F(5)=품명    G(6)=납품구분  H(7)=납품수량
    # I(8)=단가          J(9)=Org     K(10)=품목창고 L(11)=납품일시(date)
    # M(12)=납품시간     N(13)=납품날짜 O(14)=납품날짜2  R(17)=단위
    all_rows = list(ws.iter_rows(min_row=1, values_only=True))

    # 헤더행 감지: 첫 행에 숫자가 없으면 헤더
    first_data_row = 1 if not all_rows[0][2] or not str(all_rows[0][2]).replace('.','').isdigit() else 0

    for row_idx, row in enumerate(all_rows[first_data_row:], start=first_data_row + 1):
        if not row[0] and not row[1]:
            stats["rows_skip"] += 1
            continue

        try:
            part_no    = str(row[0]).strip() if row[0] else ""
            part_name  = str(row[1]).strip() if row[1] else ""
            qty        = _safe_int(row[2])
            unit_price = _safe_float(row[3])
            ship_date  = _parse_date(row[4])
            unit       = "EA"
            ref_no     = None

            if not part_no or qty <= 0:
                stats["rows_skip"] += 1
                continue
            if not ship_date:
                stats["errors"].append({"row": row_idx, "error": f"날짜 파싱 실패: {row[11]}"})
                continue

            # 품목 자동 등록 (없으면 신규)
            item = db.get(Item, part_no)
            if not item:
                item = Item(
                    part_no=part_no,
                    name=part_name,
                    unit=unit,
                    item_type=ItemType.outsourced,
                    std_sell_price=unit_price,
                    std_buy_price=0,
                )
                db.add(item)
                db.flush()
                stats["items_created"] += 1

            key = str(ship_date)
            groups.setdefault(key, []).append({
                "part_no": part_no,
                "qty": qty,
                "unit_price": unit_price,
                "ship_date": ship_date,
                "ref_no": ref_no,
            })
            stats["rows_ok"] += 1

        except Exception as e:
            stats["errors"].append({"row": row_idx, "error": str(e)})

    # 날짜별로 거래명세서 생성
    for ship_date_str, lines in groups.items():
        ship_date = lines[0]["ship_date"]

        inv_no = next_doc_no(db, "INV", "invoice", "inv_no")
        inv = Invoice(
            inv_no=inv_no,
            partner_id=partner_id,
            issue_date=ship_date,
            status=InvoiceStatus.draft,
            note=f"LS Electric 출고내역 임포트 ({ship_date_str})",
        )
        db.add(inv)
        db.flush()

        for ln in lines:
            db.add(InvoiceLine(
                inv_no=inv_no,
                part_no=ln["part_no"],
                qty=ln["qty"],
                unit_price=ln["unit_price"],
            ))

        if auto_issue:
            # 발행 + 자동 출하처리
            for ln in lines:
                so_no = next_doc_no(db, "SO", "sales_order", "so_no")
                so = SalesOrder(
                    so_no=so_no,
                    partner_id=partner_id,
                    part_no=ln["part_no"],
                    qty=ln["qty"],
                    order_date=ship_date,
                    due_date=ship_date,
                    status=SOStatus.closed,
                    note=f"LS 임포트 {inv_no}",
                )
                db.add(so)
                db.flush()

                sh_no = next_doc_no(db, "SH", "shipment", "sh_no")
                db.add(Shipment(
                    sh_no=sh_no,
                    so_no=so_no,
                    part_no=ln["part_no"],
                    qty=ln["qty"],
                    ship_date=ship_date,
                    unit_price=ln["unit_price"],
                    status=ShipmentStatus.confirmed,
                    note=f"LS 임포트 {inv_no}",
                ))
                db.flush()
                avg = get_avg_price(db, ln["part_no"])
                post_ledger(db, ln["part_no"], ship_date, LedgerType.shipment, -ln["qty"], avg,
                            ref_type="SH", ref_no=sh_no, note=f"LS 임포트 {inv_no}")

            inv.status = InvoiceStatus.issued

        stats["invoices"].append({
            "inv_no": inv_no,
            "ship_date": ship_date_str,
            "lines": len(lines),
            "issued": auto_issue,
        })

    db.commit()
    return stats
