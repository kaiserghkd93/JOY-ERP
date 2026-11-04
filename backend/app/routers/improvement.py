from __future__ import annotations
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.improvement import ImprovementRequest
from app.routers.auth import get_current_user
from app.models.auth import User

router = APIRouter(prefix="/improvement", tags=["개선과제"])


class ImprovementCreate(BaseModel):
    year: int
    month: int
    source_module: str
    source_category: str
    title: str
    content: Optional[str] = None
    root_cause: Optional[str] = None
    action_plan: Optional[str] = None
    target_dept: Optional[str] = None
    target_date: Optional[date] = None
    ref_no: Optional[str] = None


class ImprovementUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    root_cause: Optional[str] = None
    action_plan: Optional[str] = None
    target_dept: Optional[str] = None
    target_date: Optional[date] = None
    status: Optional[str] = None
    result: Optional[str] = None


def _out(r: ImprovementRequest) -> dict:
    return {
        "id": r.id,
        "year": r.year,
        "month": r.month,
        "source_module": r.source_module,
        "source_category": r.source_category,
        "title": r.title,
        "content": r.content,
        "root_cause": r.root_cause,
        "action_plan": r.action_plan,
        "target_dept": r.target_dept,
        "target_date": str(r.target_date) if r.target_date else None,
        "status": r.status,
        "result": r.result,
        "ref_no": r.ref_no,
        "created_by": r.created_by,
        "created_at": str(r.created_at),
    }


@router.get("")
def list_improvements(
    year: Optional[int] = None,
    month: Optional[int] = None,
    source_module: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(ImprovementRequest)
    if year:
        q = q.filter(ImprovementRequest.year == year)
    if month:
        q = q.filter(ImprovementRequest.month == month)
    if source_module:
        q = q.filter(ImprovementRequest.source_module == source_module)
    if status:
        q = q.filter(ImprovementRequest.status == status)
    rows = q.order_by(ImprovementRequest.created_at.desc()).all()
    return [_out(r) for r in rows]


@router.post("", status_code=201)
def create_improvement(
    body: ImprovementCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = ImprovementRequest(**body.model_dump(), created_by=user.username)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.patch("/{row_id}")
def update_improvement(
    row_id: int,
    body: ImprovementUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = db.get(ImprovementRequest, row_id)
    if not row:
        raise HTTPException(404, "not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(row, k, v)
    db.commit()
    return _out(row)


@router.delete("/{row_id}", status_code=204)
def delete_improvement(
    row_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = db.get(ImprovementRequest, row_id)
    if not row:
        raise HTTPException(404, "not found")
    db.delete(row)
    db.commit()
