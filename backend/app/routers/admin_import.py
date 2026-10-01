"""데이터 마이그레이션용 임시 엔드포인트"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db
from app.routers.auth import require_admin
from app.models.auth import User

router = APIRouter(prefix="/admin", tags=["관리자"])

@router.post("/import-data")
def import_data(data: dict, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    results = {}
    # FK 제약 일시 비활성화
    db.execute(text("SET session_replication_role = replica"))
    for table, rows in data.items():
        if not rows:
            results[table] = 0
            continue
        try:
            db.execute(text(f'DELETE FROM "{table}"'))
            count = 0
            for row in rows:
                cols = ", ".join(f'"{k}"' for k in row.keys())
                vals = ", ".join(f":{k}" for k in row.keys())
                db.execute(text(f'INSERT INTO "{table}" ({cols}) VALUES ({vals})'), row)
                count += 1
            db.commit()
            results[table] = count
        except Exception as e:
            db.rollback()
            results[table] = f"오류: {str(e)[:150]}"
    db.execute(text("SET session_replication_role = DEFAULT"))
    return results
