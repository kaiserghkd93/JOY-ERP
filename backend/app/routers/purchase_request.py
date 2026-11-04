"""구매요청(PR) — MRP 제안 또는 수동 → 승인 → PO 전환"""
from datetime import date as date_type, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.auth import User
from app.models.master import Item, Partner
from app.models.purchase import PurchaseRequest, PRStatus, PurchaseOrder, POStatus
from app.routers.auth import get_current_user
from app.services.doc_no import next_doc_no

router = APIRouter(prefix="/purchase-requests", tags=["구매요청(PR)"])

APPROVE_ROLES = {"admin", "manager", "material", "executive", "owner"}


class PRIn(BaseModel):
    part_no: str
    partner_id: Optional[str] = None
    qty: int
    unit_price: Optional[float] = None
    need_date: date_type
    order_by_date: Optional[date_type] = None
    source: str = "수동"
    source_ref: Optional[str] = None
    note: Optional[str] = None


def _pr_out(pr: PurchaseRequest, db: Session) -> dict:
    item = db.get(Item, pr.part_no)
    partner = db.get(Partner, pr.partner_id) if pr.partner_id else None
    days_to_order = None
    if pr.order_by_date:
        days_to_order = (pr.order_by_date - date_type.today()).days
    return {
        "pr_no": pr.pr_no,
        "part_no": pr.part_no,
        "item_name": item.name if item else pr.part_no,
        "item_type": item.item_type if item else None,
        "partner_id": pr.partner_id,
        "partner_name": partner.name if partner else None,
        "qty": pr.qty,
        "unit_price": float(pr.unit_price) if pr.unit_price else None,
        "estimated_amount": round(pr.qty * float(pr.unit_price), 0) if pr.unit_price else None,
        "need_date": str(pr.need_date),
        "order_by_date": str(pr.order_by_date) if pr.order_by_date else None,
        "days_to_order": days_to_order,
        "is_overdue": days_to_order is not None and days_to_order < 0,
        "is_urgent": days_to_order is not None and 0 <= days_to_order <= 3,
        "status": pr.status.value,
        "source": pr.source,
        "source_ref": pr.source_ref,
        "note": pr.note,
        "requested_by": pr.requested_by,
        "approved_by": pr.approved_by,
        "approved_at": pr.approved_at.isoformat() if pr.approved_at else None,
        "po_no": pr.po_no,
        "created_at": pr.created_at.isoformat() if pr.created_at else None,
    }


@router.get("")
def list_prs(
    status: Optional[str] = None,
    source: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(PurchaseRequest)
    if status:
        q = q.filter(PurchaseRequest.status == status)
    if source:
        q = q.filter(PurchaseRequest.source == source)
    rows = q.order_by(PurchaseRequest.need_date.asc(), PurchaseRequest.created_at.desc()).all()
    return [_pr_out(r, db) for r in rows]


@router.post("")
def create_pr(body: PRIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.get(Item, body.part_no):
        raise HTTPException(404, f"품목 없음: {body.part_no}")
    if body.partner_id and not db.get(Partner, body.partner_id):
        raise HTTPException(404, f"거래처 없음: {body.partner_id}")
    pr_no = next_doc_no(db, "PR", "purchase_request", "pr_no")
    pr = PurchaseRequest(
        pr_no=pr_no,
        part_no=body.part_no,
        partner_id=body.partner_id,
        qty=body.qty,
        unit_price=body.unit_price,
        need_date=body.need_date,
        order_by_date=body.order_by_date,
        status=PRStatus.pending,
        source=body.source,
        source_ref=body.source_ref,
        note=body.note,
        requested_by=user.name,
    )
    db.add(pr)
    db.commit()
    db.refresh(pr)
    return _pr_out(pr, db)


@router.post("/bulk")
def create_prs_bulk(
    body: list[PRIn],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    created = []
    for b in body:
        if not db.get(Item, b.part_no):
            continue
        pr_no = next_doc_no(db, "PR", "purchase_request", "pr_no")
        pr = PurchaseRequest(
            pr_no=pr_no, part_no=b.part_no, partner_id=b.partner_id,
            qty=b.qty, unit_price=b.unit_price,
            need_date=b.need_date, order_by_date=b.order_by_date,
            status=PRStatus.pending, source=b.source,
            source_ref=b.source_ref, note=b.note,
            requested_by=user.name,
        )
        db.add(pr)
        db.flush()
        created.append(_pr_out(pr, db))
    db.commit()
    return {"ok": True, "count": len(created), "created": created}


@router.patch("/{pr_no}/approve")
def approve_pr(
    pr_no: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in APPROVE_ROLES:
        raise HTTPException(403, "승인 권한 없음")
    pr = db.get(PurchaseRequest, pr_no)
    if not pr:
        raise HTTPException(404)
    if pr.status != PRStatus.pending:
        raise HTTPException(400, f"현재 상태({pr.status.value})에서는 승인 불가")
    pr.status = PRStatus.approved
    pr.approved_by = user.name
    pr.approved_at = datetime.now()
    db.commit()
    return _pr_out(pr, db)


@router.patch("/{pr_no}/reject")
def reject_pr(
    pr_no: str,
    note: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in APPROVE_ROLES:
        raise HTTPException(403, "반려 권한 없음")
    pr = db.get(PurchaseRequest, pr_no)
    if not pr:
        raise HTTPException(404)
    pr.status = PRStatus.rejected
    pr.approved_by = user.name
    pr.approved_at = datetime.now()
    if note:
        pr.note = (pr.note or "") + f" [반려사유: {note}]"
    db.commit()
    return _pr_out(pr, db)


@router.post("/{pr_no}/convert-to-po")
def convert_to_po(
    pr_no: str,
    due_date: Optional[date_type] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """승인된 PR을 구매발주(PO)로 전환"""
    pr = db.get(PurchaseRequest, pr_no)
    if not pr:
        raise HTTPException(404)
    if pr.status != PRStatus.approved:
        raise HTTPException(400, f"승인된 PR만 PO 전환 가능 (현재: {pr.status.value})")
    if not pr.partner_id:
        raise HTTPException(400, "거래처(partner_id)를 먼저 지정해야 PO 전환 가능합니다")
    final_due = due_date or pr.need_date
    po_no = next_doc_no(db, "MPO", "purchase_order", "po_no")
    po = PurchaseOrder(
        po_no=po_no,
        partner_id=pr.partner_id,
        part_no=pr.part_no,
        qty=pr.qty,
        unit_price=float(pr.unit_price) if pr.unit_price else 0,
        order_date=date_type.today(),
        due_date=final_due,
        po_type="material",
        note=f"PR {pr.pr_no} 전환",
    )
    db.add(po)
    pr.status = PRStatus.ordered
    pr.po_no = po_no
    db.commit()
    return {"ok": True, "po_no": po_no, "pr_no": pr_no}


@router.delete("/{pr_no}")
def delete_pr(pr_no: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pr = db.get(PurchaseRequest, pr_no)
    if not pr:
        raise HTTPException(404)
    if pr.status == PRStatus.ordered:
        raise HTTPException(400, "PO 전환된 PR은 삭제 불가")
    db.delete(pr)
    db.commit()
    return {"ok": True}
