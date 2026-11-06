"""일반구매 품의 — 소모품/비품/서비스 구매 2단계 결재 (팀장→임원)"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from app.database import get_db
from app.models.purchase import GeneralPurchaseRequest
from app.models.auth import User
from app.routers.auth import get_current_user
from app.services.doc_no import next_doc_no

router = APIRouter(prefix="/general-purchase", tags=["일반구매품의"])

MANAGER_ROLES = {"admin", "manager", "owner"}
EXECUTIVE_ROLES = {"admin", "executive", "owner"}
WRITE_ROLES = {"admin", "manager", "executive", "accounting", "sales", "purchase",
               "material", "quality_manager", "quality", "production", "manufacturing", "shipping"}


class GPRItemIn(BaseModel):
    name: str
    spec: Optional[str] = None
    qty: int = 1
    unit_price: int = 0

class GPRIn(BaseModel):
    title: str
    vendor: Optional[str] = None
    purpose: Optional[str] = None
    items: List[GPRItemIn] = []

class RejectIn(BaseModel):
    reason: str


def _row_to_dict(r: GeneralPurchaseRequest) -> dict:
    return {
        "gpr_no": r.gpr_no,
        "title": r.title,
        "vendor": r.vendor,
        "purpose": r.purpose,
        "total_amount": r.total_amount,
        "items": json.loads(r.items_json) if r.items_json else [],
        "status": r.status,
        "requester_id": r.requester_id,
        "requester_name": r.requester_name,
        "manager_id": r.manager_id,
        "manager_name": r.manager_name,
        "manager_approved_at": r.manager_approved_at.isoformat() if r.manager_approved_at else None,
        "executive_id": r.executive_id,
        "executive_name": r.executive_name,
        "executive_approved_at": r.executive_approved_at.isoformat() if r.executive_approved_at else None,
        "rejection_reason": r.rejection_reason,
        "rejection_step": r.rejection_step,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/")
def list_gpr(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    role = str(me.role.value if hasattr(me.role, 'value') else me.role)
    q = db.query(GeneralPurchaseRequest)
    # admin/manager/executive는 전체, 나머지는 본인 것만
    if role not in {"admin", "manager", "executive", "owner"}:
        q = q.filter(GeneralPurchaseRequest.requester_id == me.username)
    rows = q.order_by(GeneralPurchaseRequest.created_at.desc()).all()
    return [_row_to_dict(r) for r in rows]


@router.get("/pending")
def pending_gpr(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    role = str(me.role.value if hasattr(me.role, 'value') else me.role)
    rows = []
    if role in MANAGER_ROLES:
        rows += db.query(GeneralPurchaseRequest).filter(
            GeneralPurchaseRequest.status == "팀장승인대기"
        ).all()
    if role in EXECUTIVE_ROLES:
        rows += db.query(GeneralPurchaseRequest).filter(
            GeneralPurchaseRequest.status == "임원승인대기"
        ).all()
    seen = set()
    result = []
    for r in rows:
        if r.gpr_no not in seen:
            seen.add(r.gpr_no)
            result.append(_row_to_dict(r))
    return result


@router.post("/")
def create_gpr(body: GPRIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    role = str(me.role.value if hasattr(me.role, 'value') else me.role)
    if role not in WRITE_ROLES:
        raise HTTPException(403, "권한 없음")
    items_list = [i.model_dump() for i in body.items]
    total = sum(i["qty"] * i["unit_price"] for i in items_list)
    gpr_no = next_doc_no(db, "GPR", "general_purchase_request", "gpr_no")
    row = GeneralPurchaseRequest(
        gpr_no=gpr_no,
        title=body.title,
        vendor=body.vendor,
        purpose=body.purpose,
        total_amount=total,
        items_json=json.dumps(items_list, ensure_ascii=False),
        status="작성중",
        requester_id=me.username,
        requester_name=me.name,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


@router.patch("/{gpr_no}/submit")
def submit_gpr(gpr_no: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    row = db.query(GeneralPurchaseRequest).filter_by(gpr_no=gpr_no).first()
    if not row:
        raise HTTPException(404)
    if row.requester_id != me.username and str(me.role.value if hasattr(me.role, 'value') else me.role) != "admin":
        raise HTTPException(403)
    if row.status not in ("작성중", "반려"):
        raise HTTPException(400, f"현재 상태({row.status})에서는 상신 불가")
    row.status = "팀장승인대기"
    row.rejection_reason = None
    row.rejection_step = None
    db.commit()
    return _row_to_dict(row)


@router.patch("/{gpr_no}/approve")
def approve_gpr(gpr_no: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    role = str(me.role.value if hasattr(me.role, 'value') else me.role)
    row = db.query(GeneralPurchaseRequest).filter_by(gpr_no=gpr_no).first()
    if not row:
        raise HTTPException(404)
    if row.status == "팀장승인대기":
        if role not in MANAGER_ROLES:
            raise HTTPException(403, "팀장 이상 권한 필요")
        row.manager_id = me.username
        row.manager_name = me.name
        row.manager_approved_at = datetime.now()
        row.status = "임원승인대기"
    elif row.status == "임원승인대기":
        if role not in EXECUTIVE_ROLES:
            raise HTTPException(403, "임원 이상 권한 필요")
        row.executive_id = me.username
        row.executive_name = me.name
        row.executive_approved_at = datetime.now()
        row.status = "승인완료"
    else:
        raise HTTPException(400, f"현재 상태({row.status})에서는 승인 불가")
    db.commit()
    return _row_to_dict(row)


@router.patch("/{gpr_no}/reject")
def reject_gpr(gpr_no: str, body: RejectIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    role = str(me.role.value if hasattr(me.role, 'value') else me.role)
    row = db.query(GeneralPurchaseRequest).filter_by(gpr_no=gpr_no).first()
    if not row:
        raise HTTPException(404)
    if row.status == "팀장승인대기" and role not in MANAGER_ROLES:
        raise HTTPException(403)
    if row.status == "임원승인대기" and role not in EXECUTIVE_ROLES:
        raise HTTPException(403)
    if row.status not in ("팀장승인대기", "임원승인대기"):
        raise HTTPException(400, f"현재 상태({row.status})에서는 반려 불가")
    row.rejection_step = row.status
    row.rejection_reason = body.reason
    row.status = "반려"
    db.commit()
    return _row_to_dict(row)


@router.delete("/{gpr_no}")
def delete_gpr(gpr_no: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    row = db.query(GeneralPurchaseRequest).filter_by(gpr_no=gpr_no).first()
    if not row:
        raise HTTPException(404)
    role = str(me.role.value if hasattr(me.role, 'value') else me.role)
    if row.requester_id != me.username and role != "admin":
        raise HTTPException(403)
    if row.status not in ("작성중", "반려"):
        raise HTTPException(400, "승인 진행 중인 품의는 삭제 불가")
    db.delete(row)
    db.commit()
    return {"ok": True}
