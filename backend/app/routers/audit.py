"""Audit Trail — 마스터 데이터 변경 이력 조회"""
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit import AuditLog
from app.routers.auth import require_admin
from app.models.auth import User

router = APIRouter(prefix="/audit", tags=["감사이력"])


@router.get("/")
def list_audit_logs(
    table_name: str | None = None,
    record_id: str | None = None,
    changed_by: str | None = None,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = db.query(AuditLog).order_by(AuditLog.changed_at.desc())
    if table_name:
        q = q.filter(AuditLog.table_name == table_name)
    if record_id:
        q = q.filter(AuditLog.record_id == record_id)
    if changed_by:
        q = q.filter(AuditLog.changed_by == changed_by)
    rows = q.limit(limit).all()
    return [{
        "id": r.id,
        "table_name": r.table_name,
        "record_id": r.record_id,
        "action": r.action,
        "field_name": r.field_name,
        "old_value": r.old_value,
        "new_value": r.new_value,
        "changed_by": r.changed_by,
        "changed_at": r.changed_at.isoformat() if r.changed_at else None,
        "note": r.note,
    } for r in rows]
