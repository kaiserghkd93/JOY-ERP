"""데이터 마이그레이션용 임시 엔드포인트"""
from fastapi import APIRouter, Depends
from sqlalchemy import text, inspect
from sqlalchemy.orm import Session
from app.database import get_db, engine
from app.routers.auth import require_admin
from app.models.auth import User

router = APIRouter(prefix="/admin", tags=["관리자"])


@router.post("/purge-old-receipts")
def purge_old_receipts(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """2026-10-01 이전 입고 및 관련 재고원장 삭제"""
    r1 = db.execute(text("""
        DELETE FROM stock_ledger
        WHERE ref_type = 'GR'
        AND ref_no IN (SELECT gr_no FROM receipt WHERE receipt_date < '2026-10-01')
    """))
    r2 = db.execute(text("DELETE FROM receipt WHERE receipt_date < '2026-10-01'"))
    db.commit()
    return {"deleted_ledger": r1.rowcount, "deleted_receipts": r2.rowcount}


def get_bool_columns(table: str) -> set:
    """PostgreSQL 테이블의 boolean 컬럼 목록 반환"""
    try:
        inspector = inspect(engine)
        cols = inspector.get_columns(table)
        return {c["name"] for c in cols if str(c["type"]).upper() == "BOOLEAN"}
    except Exception:
        return set()


@router.get("/preview-outsource-oct")
def preview_outsource_oct(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """2026년 10월 외주 발주 목록 미리보기"""
    rows = db.execute(text("""
        SELECT po_no, partner_id, part_no, qty, order_date, status, po_type
        FROM purchase_order
        WHERE po_type = 'outsource'
          AND order_date >= '2026-10-01'
          AND order_date <= '2026-10-31'
        ORDER BY order_date, po_no
    """)).fetchall()
    return {
        "count": len(rows),
        "items": [dict(r._mapping) for r in rows]
    }


@router.delete("/purge-outsource-oct")
def purge_outsource_oct(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """2026년 10월 외주 발주 및 관련 입고·원장 전체 삭제 (정식오픈 전 테스트 데이터 정리)"""
    # 10월 외주 발주번호 수집
    po_nos = [r[0] for r in db.execute(text("""
        SELECT po_no FROM purchase_order
        WHERE po_type = 'outsource'
          AND order_date >= '2026-10-01'
          AND order_date <= '2026-10-31'
    """)).fetchall()]

    if not po_nos:
        return {"deleted": 0, "message": "삭제할 10월 외주 발주가 없습니다"}

    in_clause = ", ".join(f"'{p}'" for p in po_nos)

    # 관련 재고원장 삭제
    r_ledger = db.execute(text(f"""
        DELETE FROM stock_ledger WHERE ref_no IN ({in_clause})
    """))
    # 관련 입고 삭제
    r_receipt = db.execute(text(f"""
        DELETE FROM receipt WHERE po_no IN ({in_clause})
    """))
    # 발주 삭제
    r_po = db.execute(text(f"""
        DELETE FROM purchase_order WHERE po_no IN ({in_clause})
    """))
    db.commit()

    return {
        "deleted_pos": r_po.rowcount,
        "deleted_receipts": r_receipt.rowcount,
        "deleted_ledger": r_ledger.rowcount,
        "po_nos": po_nos,
        "message": f"10월 외주 발주 {r_po.rowcount}건 및 관련 데이터 삭제 완료"
    }


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
            skip = 0
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
                try:
                    db.execute(text(f'INSERT INTO "{table}" ({cols}) VALUES ({vals}) ON CONFLICT DO NOTHING'), converted)
                    db.flush()
                    count += 1
                except Exception:
                    db.rollback()
                    skip += 1

            db.commit()
            results[table] = f"{count}건 완료 (스킵 {skip}건)"
        except Exception as e:
            db.rollback()
            results[table] = f"오류: {str(e)[:150]}"

    return results
