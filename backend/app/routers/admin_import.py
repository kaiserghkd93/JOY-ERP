"""데이터 마이그레이션용 임시 엔드포인트"""
from fastapi import APIRouter, Depends
from sqlalchemy import text, inspect
from sqlalchemy.orm import Session
from app.database import get_db, engine
from app.routers.auth import require_admin
from app.models.auth import User

router = APIRouter(prefix="/admin", tags=["관리자"])


def get_bool_columns(table: str) -> set:
    """PostgreSQL 테이블의 boolean 컬럼 목록 반환"""
    try:
        inspector = inspect(engine)
        cols = inspector.get_columns(table)
        return {c["name"] for c in cols if str(c["type"]).upper() == "BOOLEAN"}
    except Exception:
        return set()


@router.post("/import-data")
def import_data(data: dict, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    results = {}

    for table, rows in data.items():
        if not rows:
            results[table] = 0
            continue

        bool_cols = get_bool_columns(table)

        try:
            # FK 제약 무시하고 삭제
            db.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
            db.commit()

            count = 0
            for row in rows:
                # boolean 변환
                converted = {}
                for k, v in row.items():
                    if k in bool_cols and isinstance(v, int):
                        converted[k] = bool(v)
                    else:
                        converted[k] = v

                cols = ", ".join(f'"{k}"' for k in converted.keys())
                vals = ", ".join(f":{k}" for k in converted.keys())
                db.execute(text(f'INSERT INTO "{table}" ({cols}) VALUES ({vals})'), converted)
                count += 1

            db.commit()
            results[table] = count
        except Exception as e:
            db.rollback()
            results[table] = f"오류: {str(e)[:150]}"

    return results
