"""카이젠 과제 CRUD — 자체생산 개선 추적"""
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.tps import KaizenTask, AndonAlert, OeeDaily

router = APIRouter(prefix="/kaizen", tags=["카이젠"])

VALID_CATEGORIES = {"품질", "안전", "생산성", "원가", "납기"}
VALID_SOURCES = {"수동", "OEE자동", "불량자동", "안돈자동"}
VALID_STATUSES = {"등록", "진행중", "완료", "보류"}


class KaizenCreate(BaseModel):
    title: str
    category: str = "생산성"
    source: str = "수동"
    machine_no: Optional[str] = None
    part_no: Optional[str] = None
    before_value: Optional[str] = None
    target_value: Optional[str] = None
    assignee: Optional[str] = None
    due_date: Optional[date] = None
    oee_daily_id: Optional[int] = None
    andon_alert_id: Optional[int] = None
    note: Optional[str] = None


class KaizenUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    assignee: Optional[str] = None
    due_date: Optional[date] = None
    before_value: Optional[str] = None
    target_value: Optional[str] = None
    after_value: Optional[str] = None
    note: Optional[str] = None


def _serialize(k: KaizenTask) -> dict:
    return {
        "id": k.id,
        "title": k.title,
        "category": k.category,
        "source": k.source,
        "machine_no": k.machine_no,
        "part_no": k.part_no,
        "before_value": k.before_value,
        "target_value": k.target_value,
        "after_value": k.after_value,
        "assignee": k.assignee,
        "due_date": str(k.due_date) if k.due_date else None,
        "status": k.status,
        "oee_daily_id": k.oee_daily_id,
        "andon_alert_id": k.andon_alert_id,
        "note": k.note,
        "created_at": k.created_at.isoformat() if k.created_at else None,
        "completed_at": k.completed_at.isoformat() if k.completed_at else None,
        "overdue": (
            k.due_date < date.today() and k.status not in ("완료", "보류")
        ) if k.due_date else False,
    }


@router.get("")
def list_kaizen(
    status: Optional[str] = None,
    category: Optional[str] = None,
    machine_no: Optional[str] = None,
    part_no: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(KaizenTask)
    if status:
        q = q.filter(KaizenTask.status == status)
    if category:
        q = q.filter(KaizenTask.category == category)
    if machine_no:
        q = q.filter(KaizenTask.machine_no == machine_no)
    if part_no:
        q = q.filter(KaizenTask.part_no == part_no)
    if source:
        q = q.filter(KaizenTask.source == source)
    tasks = q.order_by(KaizenTask.created_at.desc()).limit(limit).all()
    return [_serialize(t) for t in tasks]


@router.get("/summary")
def kaizen_summary(db: Session = Depends(get_db)):
    """카이젠 현황 요약"""
    all_tasks = db.query(KaizenTask).all()
    by_status: dict[str, int] = {}
    by_category: dict[str, int] = {}
    overdue = 0
    today = date.today()

    for t in all_tasks:
        by_status[t.status] = by_status.get(t.status, 0) + 1
        by_category[t.category] = by_category.get(t.category, 0) + 1
        if t.due_date and t.due_date < today and t.status not in ("완료", "보류"):
            overdue += 1

    total = len(all_tasks)
    completed = by_status.get("완료", 0)
    return {
        "total": total,
        "by_status": by_status,
        "by_category": by_category,
        "overdue": overdue,
        "completion_rate": round(completed / total * 100, 1) if total else 0,
    }


@router.post("")
def create_kaizen(body: KaizenCreate, db: Session = Depends(get_db)):
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(400, f"category는 {VALID_CATEGORIES} 중 하나")
    if body.source not in VALID_SOURCES:
        raise HTTPException(400, f"source는 {VALID_SOURCES} 중 하나")

    task = KaizenTask(
        title=body.title,
        category=body.category,
        source=body.source,
        machine_no=body.machine_no,
        part_no=body.part_no,
        before_value=body.before_value,
        target_value=body.target_value,
        assignee=body.assignee,
        due_date=body.due_date,
        oee_daily_id=body.oee_daily_id,
        andon_alert_id=body.andon_alert_id,
        note=body.note,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _serialize(task)


@router.get("/{task_id}")
def get_kaizen(task_id: int, db: Session = Depends(get_db)):
    t = db.query(KaizenTask).filter(KaizenTask.id == task_id).first()
    if not t:
        raise HTTPException(404, "과제 없음")
    return _serialize(t)


@router.patch("/{task_id}")
def update_kaizen(task_id: int, body: KaizenUpdate, db: Session = Depends(get_db)):
    t = db.query(KaizenTask).filter(KaizenTask.id == task_id).first()
    if not t:
        raise HTTPException(404, "과제 없음")
    if body.status and body.status not in VALID_STATUSES:
        raise HTTPException(400, f"status는 {VALID_STATUSES} 중 하나")
    if body.category and body.category not in VALID_CATEGORIES:
        raise HTTPException(400, f"category는 {VALID_CATEGORIES} 중 하나")

    for field, val in body.model_dump(exclude_none=True).items():
        setattr(t, field, val)

    if body.status == "완료" and not t.completed_at:
        t.completed_at = datetime.now()

    db.commit()
    db.refresh(t)
    return _serialize(t)


@router.delete("/{task_id}")
def delete_kaizen(task_id: int, db: Session = Depends(get_db)):
    t = db.query(KaizenTask).filter(KaizenTask.id == task_id).first()
    if not t:
        raise HTTPException(404, "과제 없음")
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.get("/by-oee/{oee_id}")
def kaizen_by_oee(oee_id: int, db: Session = Depends(get_db)):
    """OEE 레코드 연계 카이젠 과제"""
    tasks = db.query(KaizenTask).filter(KaizenTask.oee_daily_id == oee_id).all()
    return [_serialize(t) for t in tasks]


@router.get("/by-andon/{alert_id}")
def kaizen_by_andon(alert_id: int, db: Session = Depends(get_db)):
    """안돈 알림 연계 카이젠 과제"""
    tasks = db.query(KaizenTask).filter(KaizenTask.andon_alert_id == alert_id).all()
    return [_serialize(t) for t in tasks]
