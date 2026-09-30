from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from app.database import get_db
from app.models.master import BomLine, Item
from app.services.ledger_service import get_stock

router = APIRouter(prefix="/bom", tags=["BOM"])


class BomLineIn(BaseModel):
    component_part_no: str
    qty_per: float
    unit: str = "g"
    note: str | None = None


class BomLineOut(BaseModel):
    id: int
    product_part_no: str
    component_part_no: str
    component_name: str | None = None
    qty_per: float
    unit: str
    note: str | None = None
    model_config = {"from_attributes": True}


@router.get("/{product_part_no}", response_model=list[BomLineOut])
def get_bom(product_part_no: str, db: Session = Depends(get_db)):
    lines = db.query(BomLine).filter(BomLine.product_part_no == product_part_no).all()
    result = []
    for l in lines:
        item = db.get(Item, l.component_part_no)
        result.append(BomLineOut(
            id=l.id,
            product_part_no=l.product_part_no,
            component_part_no=l.component_part_no,
            component_name=item.name if item else None,
            qty_per=float(l.qty_per),
            unit=l.unit,
            note=l.note,
        ))
    return result


@router.post("/{product_part_no}", response_model=BomLineOut)
def add_bom_line(product_part_no: str, body: BomLineIn, db: Session = Depends(get_db)):
    line = BomLine(product_part_no=product_part_no, **body.model_dump())
    db.add(line)
    db.commit()
    db.refresh(line)
    item = db.get(Item, line.component_part_no)
    return BomLineOut(
        id=line.id,
        product_part_no=line.product_part_no,
        component_part_no=line.component_part_no,
        component_name=item.name if item else None,
        qty_per=float(line.qty_per),
        unit=line.unit,
        note=line.note,
    )


@router.put("/line/{line_id}", response_model=BomLineOut)
def update_bom_line(line_id: int, body: BomLineIn, db: Session = Depends(get_db)):
    line = db.get(BomLine, line_id)
    if not line:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(line, k, v)
    db.commit()
    db.refresh(line)
    item = db.get(Item, line.component_part_no)
    return BomLineOut(
        id=line.id,
        product_part_no=line.product_part_no,
        component_part_no=line.component_part_no,
        component_name=item.name if item else None,
        qty_per=float(line.qty_per),
        unit=line.unit,
        note=line.note,
    )


@router.delete("/line/{line_id}")
def delete_bom_line(line_id: int, db: Session = Depends(get_db)):
    line = db.get(BomLine, line_id)
    if not line:
        raise HTTPException(404)
    db.delete(line)
    db.commit()
    return {"ok": True}


@router.get("/mrp/plan")
def mrp_plan(year: int, month: int, db: Session = Depends(get_db)):
    """
    월별 원재료 소요량 계산 — 3개 그룹으로 분리:
      [1] 외주처 발주 품목 BOM: 해당 월 발주(PO)된 제품의 BOM 원재료 소요량
      [2] Spare Part BOM: SPARE PART 제품군의 BOM 원재료 소요량
      [3] 전체(수주 기준): 기존 SO 기반 전체 소요량
    """
    from app.models.sales import SalesOrder, SOStatus
    from app.models.purchase import PurchaseOrder
    from calendar import monthrange
    from datetime import date

    first = date(year, month, 1)
    last  = date(year, month, monthrange(year, month)[1])

    def expand_bom(product_qty: dict[str, float]) -> list[dict]:
        """제품별 수량 dict → BOM 전개 후 원재료 소요량 리스트 반환"""
        material_req: dict[str, dict] = {}
        for prod_no, prod_qty in product_qty.items():
            bom_lines = db.query(BomLine).filter(BomLine.product_part_no == prod_no).all()
            for bl in bom_lines:
                comp = bl.component_part_no
                needed = float(bl.qty_per) * prod_qty
                if comp not in material_req:
                    item = db.get(Item, comp)
                    material_req[comp] = {
                        "component_part_no": comp,
                        "component_name": item.name if item else comp,
                        "item_type": item.item_type if item else "raw",
                        "unit": bl.unit,
                        "required_qty": 0,
                        "stock_qty": get_stock(db, comp),
                        "buy_price": float(item.std_buy_price) if item else 0,
                        "products": [],
                    }
                material_req[comp]["required_qty"] += needed
                material_req[comp]["products"].append({"part_no": prod_no, "prod_qty": prod_qty, "need": needed})
        result = []
        for d in material_req.values():
            d["order_qty"] = max(0, d["required_qty"] - d["stock_qty"])
            d["order_amount"] = d["order_qty"] * d["buy_price"]
            result.append(d)
        result.sort(key=lambda x: -x["required_qty"])
        return result

    # ── [1] 외주처 발주 품목 BOM 전개 ──
    po_orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.order_date >= first,
        PurchaseOrder.order_date <= last,
    ).all()
    po_product_qty: dict[str, float] = {}
    for o in po_orders:
        po_product_qty[o.part_no] = po_product_qty.get(o.part_no, 0) + o.qty

    po_result = expand_bom(po_product_qty)
    po_raw = [r for r in po_result if r["item_type"] != "sub"]
    po_sub = [r for r in po_result if r["item_type"] == "sub"]

    # ── [2] Spare Part 제품 BOM 전개 ──
    spare_products = {
        r[0] for r in db.query(Item.part_no).filter(Item.name.ilike('%SPARE%')).all()
    }
    spare_product_qty = {p: 1 for p in spare_products}  # 수량 1로 소요량 비율 표시
    spare_result = expand_bom(spare_product_qty) if spare_products else []
    spare_raw = [r for r in spare_result if r["item_type"] != "sub"]

    # ── [3] 수주 기반 전체 소요량 ──
    orders = db.query(SalesOrder).filter(
        SalesOrder.due_date >= first,
        SalesOrder.due_date <= last,
        SalesOrder.status != SOStatus.cancelled,
    ).all()
    so_product_qty: dict[str, float] = {}
    for o in orders:
        so_product_qty[o.part_no] = so_product_qty.get(o.part_no, 0) + o.qty

    so_result = expand_bom(so_product_qty)
    so_raw = [r for r in so_result if r["item_type"] != "sub"]
    so_sub = [r for r in so_result if r["item_type"] == "sub"]

    return {
        "year": year, "month": month,
        # 수주 기준 (기존)
        "product_count": len(so_product_qty),
        "materials": so_raw,
        "sub_materials": so_sub,
        "total_order_amount": sum(r["order_amount"] for r in so_raw),
        "sub_order_amount": sum(r["order_amount"] for r in so_sub),
        # 외주처 발주 품목 BOM
        "po_product_count": len(po_product_qty),
        "po_materials": po_raw,
        "po_sub_materials": po_sub,
        "po_order_amount": sum(r["order_amount"] for r in po_raw),
        # Spare Part BOM
        "spare_product_count": len(spare_products),
        "spare_materials": spare_raw,
        "spare_order_amount": sum(r["order_amount"] for r in spare_raw),
    }
