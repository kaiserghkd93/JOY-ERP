from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.master import Item, Partner
from app.schemas.master import ItemCreate, ItemUpdate, ItemOut, PartnerCreate, PartnerUpdate, PartnerOut
from app.models.auth import User
from app.routers.auth import require_admin
from app.services.audit_service import audit_create, audit_update, audit_delete
import openpyxl, io

router = APIRouter(prefix="/master", tags=["기준정보"])

# 품목구분 → 자재코드 prefix 매핑
_TYPE_PREFIX = {
    "raw": "RM",
    "sub": "PM",
    "outsourced": "CP",
    "semi": "SF",
    "finished": "FG",
    "consumable": "CS",
}


@router.get("/items/next-code")
def next_item_code(item_type: str, db: Session = Depends(get_db)):
    """품목구분에 맞는 다음 자재코드 반환 (예: RM-052)"""
    prefix = _TYPE_PREFIX.get(item_type)
    if not prefix:
        raise HTTPException(400, f"알 수 없는 품목구분: {item_type}")
    pattern = f"{prefix}-%"
    rows = db.query(Item.part_no).filter(Item.part_no.like(pattern)).all()
    max_num = 0
    for (pno,) in rows:
        try:
            num = int(pno.split("-")[1])
            if num > max_num:
                max_num = num
        except Exception:
            pass
    next_num = max_num + 1
    return {"next_code": f"{prefix}-{next_num:03d}", "prefix": prefix}


@router.post("/items/reclassify")
def bulk_reclassify(
    changes: list[dict],
    db: Session = Depends(get_db),
    _: User = Depends(require_admin)
):
    """품목 타입 일괄 변경 [{part_no, item_type}, ...]"""
    from app.models.master import ItemType
    updated, errors = [], []
    for c in changes:
        part_no = c.get("part_no", "")
        new_type = c.get("item_type", "")
        try:
            ItemType(new_type)
        except ValueError:
            errors.append({"part_no": part_no, "error": f"유효하지 않은 타입: {new_type}"})
            continue
        item = db.get(Item, part_no)
        if not item:
            errors.append({"part_no": part_no, "error": "품목 없음"})
            continue
        item.item_type = new_type
        updated.append(part_no)
    db.commit()
    return {"updated": updated, "errors": errors}


@router.post("/items", response_model=ItemOut)
def create_item(body: ItemCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    if db.get(Item, body.part_no):
        raise HTTPException(409, f"이미 존재: {body.part_no}")
    item = Item(**body.model_dump())
    db.add(item)
    audit_create(db, "item", body.part_no, current_user.username, note=body.name)
    db.commit()
    db.refresh(item)
    return item


@router.get("/items/customer-parts")
def customer_parts(db: Session = Depends(get_db)):
    """고객사별 품번 목록 반환 {partner_id: [part_no, ...]}"""
    from app.models.sales import SalesOrder
    rows = db.query(SalesOrder.partner_id, SalesOrder.part_no).distinct().all()
    result: dict[str, list[str]] = {}
    for partner_id, part_no in rows:
        result.setdefault(partner_id, []).append(part_no)
    return result


@router.get("/items", response_model=list[ItemOut])
def list_items(active_only: bool = True, partner_id: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Item)
    if active_only:
        q = q.filter(Item.active == True)
    if partner_id:
        from app.models.sales import SalesOrder, Shipment
        from app.models.purchase import PurchaseOrder
        so_parts = {r[0] for r in db.query(SalesOrder.part_no).filter(SalesOrder.partner_id == partner_id).all()}
        sh_parts = {r[0] for r in db.query(Shipment.part_no).join(SalesOrder, SalesOrder.so_no == Shipment.so_no).filter(SalesOrder.partner_id == partner_id).all()}
        po_parts = {r[0] for r in db.query(PurchaseOrder.part_no).filter(PurchaseOrder.partner_id == partner_id).all()}
        part_nos = so_parts | sh_parts | po_parts
        if part_nos:
            q = q.filter(Item.part_no.in_(part_nos))
        else:
            return []
    return q.all()


@router.get("/items/{part_no:path}", response_model=ItemOut)
def get_item(part_no: str, db: Session = Depends(get_db)):
    item = db.get(Item, part_no)
    if not item:
        raise HTTPException(404)
    return item


@router.patch("/items/{part_no:path}", response_model=ItemOut)
def update_item(part_no: str, body: ItemUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    item = db.get(Item, part_no)
    if not item:
        raise HTTPException(404)
    changes = {}
    for k, v in body.model_dump(exclude_none=True).items():
        changes[k] = (getattr(item, k), v)
        setattr(item, k, v)
    audit_update(db, "item", part_no, changes, current_user.username)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{part_no:path}")
def delete_item(part_no: str, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """품목 삭제 (관리자 전용) — 거래 이력 있는 품목은 삭제 불가"""
    item = db.get(Item, part_no)
    if not item:
        raise HTTPException(404, "품목 없음")

    from app.models.purchase import PurchaseOrder, Receipt
    from app.models.sales import SalesOrder, Shipment
    from app.models.ledger import StockLedger
    from app.models.master import BomLine

    if db.query(PurchaseOrder).filter(PurchaseOrder.part_no == part_no).first():
        raise HTTPException(409, "발주 이력이 있어 삭제 불가")
    if db.query(Receipt).filter(Receipt.part_no == part_no).first():
        raise HTTPException(409, "입고 이력이 있어 삭제 불가")
    if db.query(SalesOrder).filter(SalesOrder.part_no == part_no).first():
        raise HTTPException(409, "수주 이력이 있어 삭제 불가")
    if db.query(Shipment).filter(Shipment.part_no == part_no).first():
        raise HTTPException(409, "출하 이력이 있어 삭제 불가")
    if db.query(StockLedger).filter(StockLedger.part_no == part_no).first():
        raise HTTPException(409, "재고 원장 이력이 있어 삭제 불가")
    if db.query(BomLine).filter(
        (BomLine.product_part_no == part_no) | (BomLine.component_part_no == part_no)
    ).first():
        raise HTTPException(409, "BOM에 등록된 품목이라 삭제 불가")

    audit_delete(db, "item", part_no, current_user.username, note=item.name)
    db.delete(item)
    db.commit()
    return {"ok": True, "deleted": part_no}


@router.post("/bulk-upload")
def bulk_upload_all(file: UploadFile = File(...), db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """
    통합 엑셀 업로드 (시트 3개):
      Sheet1 '품목' : 품번, 품명, 규격, 단위, 품목구분, 표준입고가, 표준판매가, 안전재고, MOQ
      Sheet2 '거래처': 거래처코드, 거래처명, 구분(외주처/고객/공용), 사업자번호, 결제조건, 이메일
      Sheet3 '초기재고': 품번, 현재고수량, 단가(선택)
    이미 존재하면 업데이트, 없으면 신규 생성.
    """
    from datetime import date
    from app.models.ledger import StockLedger, LedgerType
    from app.services.ledger_service import get_stock

    _ITEM_TYPE_MAP = {
        '제품': 'finished', '완제품': 'finished', 'FG': 'finished',
        '반제품': 'semi', 'SF': 'semi',
        '외주품': 'outsourced', '외주': 'outsourced', '구매부품': 'outsourced', 'CP': 'outsourced',
        '원자재': 'raw', 'RM': 'raw',
        '부자재': 'sub', 'PM': 'sub',
        '소모품': 'consumable', 'CS': 'consumable',
    }

    content = file.file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content))
    result = {"items": {}, "partners": {}, "stock": {}, "errors": []}

    # ── Sheet1: 품목 ──
    if '품목' in wb.sheetnames:
        ws = wb['품목']
        created, updated = 0, 0
        for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if not row[0]:
                continue
            try:
                part_no = str(row[0]).strip()
                data = {
                    "name":           str(row[1]).strip() if row[1] else "",
                    "spec":           str(row[2]).strip() if row[2] else None,
                    "unit":           str(row[3]).strip() if row[3] else "EA",
                    "item_type":      _ITEM_TYPE_MAP.get(str(row[4]).strip(), str(row[4]).strip()) if row[4] else "outsourced",
                    "std_buy_price":  float(row[5] or 0),
                    "std_sell_price": float(row[6] or 0),
                    "safety_stock":   int(row[7] or 0),
                    "moq":            int(row[8] or 1),
                }
                existing = db.get(Item, part_no)
                if existing:
                    for k, v in data.items():
                        setattr(existing, k, v)
                    updated += 1
                else:
                    db.add(Item(part_no=part_no, **data))
                    created += 1
            except Exception as e:
                result["errors"].append({"sheet": "품목", "row": row_idx, "error": str(e)})
        result["items"] = {"created": created, "updated": updated}

    # ── Sheet2: 거래처 ──
    if '거래처' in wb.sheetnames:
        ws = wb['거래처']
        created, updated = 0, 0
        for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if not row[0]:
                continue
            try:
                partner_id = str(row[0]).strip()
                data = {
                    "name":          str(row[1]).strip() if row[1] else "",
                    "partner_type":  str(row[2]).strip() if row[2] else "외주처",
                    "business_no":   str(row[3]).strip() if row[3] else None,
                    "payment_terms": str(row[4]).strip() if row[4] else None,
                    "email":         str(row[5]).strip() if row[5] else None,
                }
                existing = db.get(Partner, partner_id)
                if existing:
                    for k, v in data.items():
                        setattr(existing, k, v)
                    updated += 1
                else:
                    db.add(Partner(partner_id=partner_id, **data))
                    created += 1
            except Exception as e:
                result["errors"].append({"sheet": "거래처", "row": row_idx, "error": str(e)})
        result["partners"] = {"created": created, "updated": updated}

    db.flush()  # 품목/거래처 먼저 flush 후 재고 처리

    # ── Sheet3: 초기재고 ──
    if '초기재고' in wb.sheetnames:
        ws = wb['초기재고']
        today = date.today()
        adjusted = 0
        for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if not row[0]:
                continue
            try:
                part_no = str(row[0]).strip()
                target_qty = int(row[1] or 0)
                unit_price = float(row[2] or 0) if len(row) > 2 else 0.0

                if not db.get(Item, part_no):
                    result["errors"].append({"sheet": "초기재고", "row": row_idx, "error": f"품번 없음: {part_no}"})
                    continue

                current = get_stock(db, part_no)
                delta = target_qty - current
                if delta == 0:
                    continue

                entry = StockLedger(
                    txn_date=today,
                    part_no=part_no,
                    ledger_type=LedgerType.adjustment,
                    qty=delta,
                    unit_price=unit_price,
                    ref_type="ADJ",
                    note="초기재고 일괄 입력",
                )
                db.add(entry)
                adjusted += 1
            except Exception as e:
                result["errors"].append({"sheet": "초기재고", "row": row_idx, "error": str(e)})
        result["stock"] = {"adjusted": adjusted}

    db.commit()
    return result


@router.post("/items/import-ls")
def import_ls_items(file: UploadFile = File(...), db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """
    LS Electric 납품 Excel 업로드 — 세 가지 포맷 자동 감지:
      [A] LS 납품 포맷 (7열): 품번, 품명(or Category+품명), 수량, 단가, 날짜
           → 품목 신규등록 + 수주(SO) + 출하(SH) 자동 생성. 중복 행은 스킵.
      [B] 납품현황 포맷 (26열): 헤더 1행, D=품번, F=품명, I=단가, R=단위
      [C] 단순 3열 포맷: A=품번, B=품명, C=단가
    """
    from datetime import date as date_type
    from app.models.sales import SalesOrder, Shipment, SOStatus, ShipmentStatus
    from app.services.doc_no import next_doc_no
    from app.services.ledger_service import post_ledger, get_avg_price
    from app.models.ledger import LedgerType

    content = file.file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active
    created, updated, skipped, errors = 0, 0, 0, []
    so_created, sh_created = 0, 0

    def _safe_float(v):
        try:
            return float(str(v).replace(',', '').strip())
        except Exception:
            return 0.0

    def _safe_date(v):
        if isinstance(v, date_type):
            return v
        try:
            from datetime import datetime
            if isinstance(v, datetime):
                return v.date()
            return date_type.fromisoformat(str(v).strip()[:10])
        except Exception:
            return date_type.today()

    def _ensure_item(part_no, name, price):
        """품목이 없으면 신규 등록, 있으면 단가만 업데이트. 생성여부 반환."""
        nonlocal created, updated
        existing = db.get(Item, part_no)
        if existing:
            if price > 0:
                existing.std_sell_price = price
            updated += 1
            return False
        else:
            db.add(Item(
                part_no=part_no, name=name, unit="EA",
                item_type="finished", std_sell_price=price,
                std_buy_price=0, safety_stock=0, moq=1,
            ))
            db.flush()
            created += 1
            return True

    first_row = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
    h0 = str(first_row[0] or '').strip()
    h1 = str(first_row[1] or '').strip() if len(first_row) > 1 else ''
    is_ls_shipment_fmt = h0 == 'Shipment No.'

    # 포맷 A 감지: 7열짜리 + 2열이 Category 이거나 한글(품명) + Shipment No 아님
    # LS 납품 파일은 항상 6~8열이고 Shipment No. 헤더가 아님
    is_ls_delivery = (not is_ls_shipment_fmt) and (5 <= ws.max_column <= 9) and (
        h1 == 'Category' or (len(h1) >= 2 and not h1[0].isdigit())
    )

    if is_ls_delivery:
        # LS 납품 포맷: 품번(0), [Category(1),] 품명(1 or 2), 수량(2 or 3), 단가(3 or 4), ship_date(4 or 5)
        # Category 열 여부: 2행을 보고 col1이 영문이면 Category 있음
        sample = list(ws.iter_rows(min_row=2, max_row=2, values_only=True))[0]
        has_category = sample and sample[1] and str(sample[1]).replace(' ','').isascii() and len(str(sample[1])) < 20 and str(sample[1]).strip() not in ('', 'None')

        # 이미 임포트된 (part_no, ship_date, qty) 조합 체크용
        existing_sh = set()
        for row in db.query(Shipment.part_no, Shipment.ship_date, Shipment.qty).all():
            existing_sh.add((row[0], str(row[1]), row[2]))

        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row[0]:
                skipped += 1
                continue
            part_no = str(row[0]).strip()
            if has_category:
                name  = str(row[2]).strip() if row[2] else ""
                qty   = int(_safe_float(row[3])) if row[3] else 0
                price = _safe_float(row[4]) if row[4] else 0.0
                ship_date = _safe_date(row[5] if row[5] else row[6])
            else:
                name  = str(row[1]).strip() if row[1] else ""
                qty   = int(_safe_float(row[2])) if row[2] else 0
                price = _safe_float(row[3]) if row[3] else 0.0
                ship_date = _safe_date(row[4] if row[4] else row[5])

            if not part_no or not name or qty <= 0:
                skipped += 1
                continue

            # 중복 출하 스킵
            key = (part_no, str(ship_date), qty)
            if key in existing_sh:
                skipped += 1
                continue
            existing_sh.add(key)

            try:
                _ensure_item(part_no, name, price)
                db.flush()

                # SO 생성 (closed 상태로)
                so_no = next_doc_no(db, "SO", "sales_order", "so_no")
                so = SalesOrder(
                    so_no=so_no, partner_id="LS_ELEC", part_no=part_no,
                    qty=qty, order_date=ship_date, due_date=ship_date,
                    status=SOStatus.closed,
                    note=f"LS 납품 자동등록 {ship_date}",
                )
                db.add(so)
                db.flush()
                so_created += 1

                # 출하 생성
                sh_no = next_doc_no(db, "SH", "shipment", "sh_no")
                sh = Shipment(
                    sh_no=sh_no, so_no=so_no, part_no=part_no,
                    qty=qty, ship_date=ship_date, unit_price=price,
                    status=ShipmentStatus.confirmed,
                    note=f"LS 납품 자동등록",
                )
                db.add(sh)
                db.flush()
                sh_created += 1

                # 재고 출고 반영
                avg = get_avg_price(db, part_no)
                post_ledger(
                    db, part_no, ship_date,
                    LedgerType.shipment, -qty, avg or price,
                    ref_type="SH", ref_no=sh_no,
                )
            except Exception as e:
                errors.append({"part_no": part_no, "error": str(e)})

        db.commit()
        return {
            "format": "LS납품",
            "item_created": created, "item_updated": updated,
            "so_created": so_created, "sh_created": sh_created,
            "skipped": skipped, "errors": errors,
        }

    elif is_ls_shipment_fmt:
        # 납품현황 포맷: D(3)=품번, F(5)=품명, I(8)=단가, R(17)=단위
        items_map: dict[str, dict] = {}
        for row in ws.iter_rows(min_row=2, values_only=True):
            part_no = str(row[3]).strip() if row[3] else ""
            name    = str(row[5]).strip() if row[5] else ""
            price   = _safe_float(row[8]) if len(row) > 8 else 0.0
            unit    = str(row[17]).strip().upper() if len(row) > 17 and row[17] else "EA"
            if not part_no or not name:
                skipped += 1
                continue
            if unit not in ('EA', 'KG', 'M', 'SET', 'L'):
                unit = 'EA'
            if part_no not in items_map:
                items_map[part_no] = {'name': name, 'price': price, 'unit': unit}
            else:
                if price > 0:
                    items_map[part_no]['price'] = price

        for part_no, d in items_map.items():
            try:
                existing = db.get(Item, part_no)
                if existing:
                    existing.name = d['name']
                    if d['price'] > 0:
                        existing.std_buy_price = d['price']
                    updated += 1
                else:
                    db.add(Item(
                        part_no=part_no, name=d['name'], unit=d['unit'],
                        item_type="outsourced", std_buy_price=d['price'],
                        std_sell_price=0, safety_stock=0, moq=1,
                    ))
                    created += 1
            except Exception as e:
                errors.append({"part_no": part_no, "error": str(e)})
    else:
        # 단순 3열 포맷: A=품번, B=품명, C=단가
        for row_idx, row in enumerate(ws.iter_rows(min_row=1, values_only=True), start=1):
            if not row[0] and not row[1]:
                skipped += 1
                continue
            part_no = str(row[0]).strip() if row[0] else ""
            name    = str(row[1]).strip() if row[1] else ""
            if not part_no or part_no in ('품번', 'Part No', 'PART_NO'):
                skipped += 1
                continue
            if not name:
                skipped += 1
                continue
            price = _safe_float(row[2]) if len(row) > 2 and row[2] else 0.0
            try:
                existing = db.get(Item, part_no)
                if existing:
                    existing.name = name
                    if price > 0:
                        existing.std_buy_price = price
                    updated += 1
                else:
                    db.add(Item(
                        part_no=part_no, name=name, unit="EA",
                        item_type="outsourced", std_buy_price=price,
                        std_sell_price=0, safety_stock=0, moq=1,
                    ))
                    created += 1
            except Exception as e:
                errors.append({"row": row_idx, "part_no": part_no, "error": str(e)})

    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped, "errors": errors}


@router.post("/items/bulk-upload")
def bulk_upload_items(file: UploadFile = File(...), db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """하위호환: 품목만 단독 업로드 (열: 품번, 품명, 규격, 단위, 품목구분, 표준입고가, 표준판매가, 안전재고, MOQ)"""
    wb = openpyxl.load_workbook(io.BytesIO(file.file.read()))
    ws = wb.active
    created, updated, errors = 0, 0, []
    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row[0]:
            continue
        try:
            part_no = str(row[0]).strip()
            data = {
                "name":           str(row[1]).strip() if row[1] else "",
                "spec":           str(row[2]).strip() if row[2] else None,
                "unit":           str(row[3]).strip() if row[3] else "EA",
                "item_type":      str(row[4]).strip() if row[4] else "outsourced",
                "std_buy_price":  float(row[5] or 0),
                "std_sell_price": float(row[6] or 0),
                "safety_stock":   int(row[7] or 0),
                "moq":            int(row[8] or 1),
            }
            existing = db.get(Item, part_no)
            if existing:
                for k, v in data.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(Item(part_no=part_no, **data))
                created += 1
        except Exception as e:
            errors.append({"row": row_idx, "error": str(e)})
    db.commit()
    return {"created": created, "updated": updated, "errors": errors}




@router.post("/partners", response_model=PartnerOut)
def create_partner(body: PartnerCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    if db.get(Partner, body.partner_id):
        raise HTTPException(409, f"이미 존재: {body.partner_id}")
    partner = Partner(**body.model_dump())
    db.add(partner)
    audit_create(db, "partner", body.partner_id, current_user.username, note=body.name)
    db.commit()
    db.refresh(partner)
    return partner


@router.get("/partners", response_model=list[PartnerOut])
def list_partners(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(Partner)
    if not include_inactive:
        q = q.filter(Partner.active == True)
    return q.all()


@router.get("/partners/{partner_id}", response_model=PartnerOut)
def get_partner(partner_id: str, db: Session = Depends(get_db)):
    p = db.get(Partner, partner_id)
    if not p:
        raise HTTPException(404)
    return p


@router.patch("/partners/{partner_id}", response_model=PartnerOut)
def update_partner(partner_id: str, body: PartnerUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    p = db.get(Partner, partner_id)
    if not p:
        raise HTTPException(404)
    changes = {}
    for k, v in body.model_dump(exclude_none=True).items():
        changes[k] = (getattr(p, k), v)
        setattr(p, k, v)
    audit_update(db, "partner", partner_id, changes, current_user.username)
    db.commit()
    db.refresh(p)
    return p


# ─────────────────────────────────────────────
#  품번 전면 변경 마이그레이션
# ─────────────────────────────────────────────

_CHILD_TABLES = [
    # BOM
    ("bom_line",             "product_part_no"),
    ("bom_line",             "component_part_no"),
    ("bom_history",          "product_part_no"),
    ("bom_history",          "component_part_no"),
    # 구매
    ("purchase_order",       "part_no"),
    ("purchase_request",     "part_no"),
    ("receipt",              "part_no"),
    ("carryover",            "part_no"),
    # 판매
    ("sales_order",          "part_no"),
    ("shipment",             "part_no"),
    ("invoice_line",         "part_no"),
    # 재고
    ("stock_ledger",         "part_no"),
    # 원가
    ("product_cost_std",     "part_no"),
    # 재고조정
    ("inventory_adjustment", "part_no"),
    ("production_loss",      "part_no"),
    ("production_loss",      "raw_part_no"),
    # MES 현장
    ("mes_work_order",       "part_no"),
    ("mes_pallet",           "part_no"),
    ("mes_material_req",     "part_no"),
    ("mes_worker_skill",     "part_no"),
    ("mes_session_cost",     "part_no"),
    # 생산
    ("weekly_plan",          "part_no"),
    ("production_order",     "part_no"),
    ("mold",                 "part_no"),
    ("monthly_plan",         "part_no"),
    # 품질
    ("inspection_standard",  "part_no"),
    ("non_conformance",      "part_no"),
    ("quality_claim",        "part_no"),
    ("process_outgoing_defect", "part_no"),
    ("control_plan",         "part_no"),
    ("pfmea",                "part_no"),
    ("ppap",                 "part_no"),
    ("msa_study",            "part_no"),
    ("spc_chart",            "part_no"),
    # MES 연동
    ("mes_part_map",         "erp_part_no"),
    ("mes_production_cost",  "part_no"),
    ("mes_defect_detail",    "part_no"),
    ("mes_production_log",   "part_no"),
    # TPS
    ("oee_daily",            "part_no"),
    ("mold_change_log",      "part_no"),
    ("andon_alert",          "part_no"),
    ("kaizen_task",          "part_no"),
]


@router.post("/admin/migrate-part-codes")
def migrate_part_codes(
    dry_run: bool = True,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """기존 임의 품번 → RM-001/PM-001/CP-001/SF-001/FG-001/CS-001 형식으로 전면 변경.
    dry_run=true(기본): 변경 목록만 반환.  dry_run=false: 실제 DB 변경."""
    import re
    from sqlalchemy import text as T

    PREFIX = {
        "raw": "RM", "sub": "PM", "outsourced": "CP",
        "semi": "SF", "finished": "FG", "consumable": "CS",
    }

    def already_ok(pno: str, itype: str) -> bool:
        p = PREFIX.get(itype, "")
        return bool(re.match(rf"^{re.escape(p)}-\d{{3,}}$", pno)) if p else False

    rows = db.execute(T("SELECT part_no, item_type FROM item ORDER BY part_no")).fetchall()

    # 타입별 현재 최대 번호 파악
    max_num: dict = {t: 0 for t in PREFIX}
    for r in rows:
        itype = r.item_type
        if itype in PREFIX and already_ok(r.part_no, itype):
            n = int(r.part_no.split("-")[1])
            if n > max_num[itype]:
                max_num[itype] = n

    # 변경 대상 목록 (타입별·품번 순 정렬로 일관된 번호 부여)
    need = [(r.part_no, r.item_type) for r in rows if not already_ok(r.part_no, r.item_type)]
    need.sort(key=lambda x: (x[1], x[0]))

    counters = dict(max_num)
    mapping: dict = {}
    by_type: dict = {}
    for old_no, itype in need:
        if itype not in PREFIX:
            continue
        counters[itype] += 1
        mapping[old_no] = f"{PREFIX[itype]}-{counters[itype]:03d}"
        label = PREFIX[itype]
        by_type[label] = by_type.get(label, 0) + 1

    if dry_run or not mapping:
        return {
            "dry_run": True,
            "total_items": len(rows),
            "already_ok": len(rows) - len(need),
            "to_rename": len(mapping),
            "by_type": by_type,
            "sample_mapping": dict(list(mapping.items())[:40]),
        }

    # ── 실제 마이그레이션 ──────────────────────────────
    # 임시 매핑 테이블
    db.execute(T("""
        CREATE TEMP TABLE IF NOT EXISTS _rename_map
        (old_no VARCHAR(50) PRIMARY KEY, new_no VARCHAR(50) NOT NULL)
    """))
    db.execute(T("TRUNCATE _rename_map"))
    db.execute(
        T("INSERT INTO _rename_map (old_no, new_no) VALUES (:old, :new)"),
        [{"old": o, "new": n} for o, n in mapping.items()],
    )

    # 새 item 레코드 삽입 (old 복사본에 new part_no 부여)
    db.execute(T("""
        INSERT INTO item (part_no, name, spec, supplier, unit, item_type,
                          std_buy_price, std_sell_price, safety_stock, moq, lead_time_days,
                          location, weight_g, raw_material, avg_cost,
                          machine_ct_sec, manual_ct_sec, cavity_count, active, created_at)
        SELECT m.new_no, i.name, i.spec, i.supplier, i.unit, i.item_type,
               i.std_buy_price, i.std_sell_price, i.safety_stock, i.moq, i.lead_time_days,
               i.location, i.weight_g, i.raw_material, i.avg_cost,
               i.machine_ct_sec, i.manual_ct_sec, i.cavity_count, i.active, i.created_at
        FROM item i JOIN _rename_map m ON i.part_no = m.old_no
    """))

    # 모든 하위 테이블 일괄 업데이트
    table_counts: dict = {}
    for tbl, col in _CHILD_TABLES:
        try:
            sp = db.begin_nested()
            res = db.execute(T(f"""
                UPDATE {tbl} t
                SET {col} = m.new_no
                FROM _rename_map m
                WHERE t.{col} = m.old_no
            """))
            sp.commit()
            if res.rowcount:
                table_counts[f"{tbl}.{col}"] = res.rowcount
        except Exception as e:
            sp.rollback()
            table_counts[f"{tbl}.{col}"] = f"SKIP:{str(e)[:60]}"

    # 구 item 레코드 삭제
    del_res = db.execute(T("DELETE FROM item WHERE part_no IN (SELECT old_no FROM _rename_map)"))

    db.commit()

    return {
        "dry_run": False,
        "renamed": len(mapping),
        "deleted_old": del_res.rowcount,
        "by_type": by_type,
        "table_updates": table_counts,
        "sample_mapping": dict(list(mapping.items())[:20]),
    }


@router.post("/admin/apply-part-mapping")
def apply_part_mapping(
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """명시적 매핑으로 품번 변경: {"mapping": {"old": "new", ...}, "dry_run": true}"""
    from sqlalchemy import text as T

    mapping: dict = body.get("mapping", {})
    dry_run: bool = body.get("dry_run", True)

    if not mapping:
        return {"error": "mapping이 비어있습니다"}

    if dry_run:
        return {"dry_run": True, "count": len(mapping), "sample": dict(list(mapping.items())[:20])}

    db.execute(T("CREATE TEMP TABLE IF NOT EXISTS _rename_map (old_no VARCHAR(100) PRIMARY KEY, new_no VARCHAR(100) NOT NULL)"))
    db.execute(T("TRUNCATE _rename_map"))
    db.execute(T("INSERT INTO _rename_map (old_no, new_no) VALUES (:old, :new)"),
               [{"old": o, "new": n} for o, n in mapping.items()])

    db.execute(T("""
        INSERT INTO item (part_no, name, spec, supplier, unit, item_type,
                          std_buy_price, std_sell_price, safety_stock, moq, lead_time_days,
                          location, weight_g, raw_material, avg_cost,
                          machine_ct_sec, manual_ct_sec, cavity_count, active, created_at)
        SELECT m.new_no, i.name, i.spec, i.supplier, i.unit, i.item_type,
               i.std_buy_price, i.std_sell_price, i.safety_stock, i.moq, i.lead_time_days,
               i.location, i.weight_g, i.raw_material, i.avg_cost,
               i.machine_ct_sec, i.manual_ct_sec, i.cavity_count, i.active, i.created_at
        FROM item i JOIN _rename_map m ON i.part_no = m.old_no
    """))

    table_counts: dict = {}
    for tbl, col in _CHILD_TABLES:
        try:
            sp = db.begin_nested()
            res = db.execute(T(f"UPDATE {tbl} t SET {col} = m.new_no FROM _rename_map m WHERE t.{col} = m.old_no"))
            sp.commit()
            if res.rowcount:
                table_counts[f"{tbl}.{col}"] = res.rowcount
        except Exception as e:
            sp.rollback()
            table_counts[f"{tbl}.{col}"] = f"SKIP:{str(e)[:40]}"

    del_res = db.execute(T("DELETE FROM item WHERE part_no IN (SELECT old_no FROM _rename_map)"))
    db.commit()

    return {"dry_run": False, "applied": len(mapping), "deleted_old": del_res.rowcount, "table_updates": table_counts}
