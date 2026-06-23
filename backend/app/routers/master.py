from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.master import Item, Partner
from app.schemas.master import ItemCreate, ItemUpdate, ItemOut, PartnerCreate, PartnerUpdate, PartnerOut
import openpyxl, io

router = APIRouter(prefix="/master", tags=["기준정보"])


@router.post("/items", response_model=ItemOut)
def create_item(body: ItemCreate, db: Session = Depends(get_db)):
    if db.get(Item, body.part_no):
        raise HTTPException(409, f"이미 존재: {body.part_no}")
    item = Item(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/items", response_model=list[ItemOut])
def list_items(active_only: bool = True, db: Session = Depends(get_db)):
    q = db.query(Item)
    if active_only:
        q = q.filter(Item.active == True)
    return q.all()


@router.get("/items/{part_no}", response_model=ItemOut)
def get_item(part_no: str, db: Session = Depends(get_db)):
    item = db.get(Item, part_no)
    if not item:
        raise HTTPException(404)
    return item


@router.patch("/items/{part_no}", response_model=ItemOut)
def update_item(part_no: str, body: ItemUpdate, db: Session = Depends(get_db)):
    item = db.get(Item, part_no)
    if not item:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.post("/items/bulk-upload")
def bulk_upload_items(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """엑셀 대량 등록: 열 순서 = 품번, 품명, 규격, 단위, 품목구분, 표준입고가, 표준판매가"""
    wb = openpyxl.load_workbook(io.BytesIO(file.file.read()))
    ws = wb.active
    created, updated, errors = 0, 0, []
    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row[0]:
            continue
        try:
            part_no = str(row[0]).strip()
            data = {
                "name": str(row[1]).strip() if row[1] else "",
                "spec": str(row[2]).strip() if row[2] else None,
                "unit": str(row[3]).strip() if row[3] else "EA",
                "item_type": str(row[4]).strip() if row[4] else "외주품",
                "std_buy_price": float(row[5] or 0),
                "std_sell_price": float(row[6] or 0),
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
def create_partner(body: PartnerCreate, db: Session = Depends(get_db)):
    if db.get(Partner, body.partner_id):
        raise HTTPException(409, f"이미 존재: {body.partner_id}")
    partner = Partner(**body.model_dump())
    db.add(partner)
    db.commit()
    db.refresh(partner)
    return partner


@router.get("/partners", response_model=list[PartnerOut])
def list_partners(db: Session = Depends(get_db)):
    return db.query(Partner).filter(Partner.active == True).all()


@router.get("/partners/{partner_id}", response_model=PartnerOut)
def get_partner(partner_id: str, db: Session = Depends(get_db)):
    p = db.get(Partner, partner_id)
    if not p:
        raise HTTPException(404)
    return p


@router.patch("/partners/{partner_id}", response_model=PartnerOut)
def update_partner(partner_id: str, body: PartnerUpdate, db: Session = Depends(get_db)):
    p = db.get(Partner, partner_id)
    if not p:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p
