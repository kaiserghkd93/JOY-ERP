"""Audit Trail 헬퍼"""
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.audit import AuditLog


def audit_create(db: Session, table: str, record_id: str, changed_by: str, note: str | None = None):
    db.add(AuditLog(
        table_name=table, record_id=record_id, action="CREATE",
        changed_by=changed_by, changed_at=datetime.now(), note=note,
    ))


def audit_delete(db: Session, table: str, record_id: str, changed_by: str, note: str | None = None):
    db.add(AuditLog(
        table_name=table, record_id=record_id, action="DELETE",
        changed_by=changed_by, changed_at=datetime.now(), note=note,
    ))


def audit_update(db: Session, table: str, record_id: str, changes: dict, changed_by: str):
    """changes = {field: (old_value, new_value)} — None 값은 건너뜀"""
    now = datetime.now()
    for field, (old, new) in changes.items():
        if str(old) == str(new):
            continue
        db.add(AuditLog(
            table_name=table, record_id=record_id, action="UPDATE",
            field_name=field,
            old_value=str(old) if old is not None else None,
            new_value=str(new) if new is not None else None,
            changed_by=changed_by, changed_at=now,
        ))
