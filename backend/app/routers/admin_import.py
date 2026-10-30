"""데이터 마이그레이션용 임시 엔드포인트"""
import hashlib, os
from fastapi import APIRouter, Depends
from sqlalchemy import text, inspect
from sqlalchemy.orm import Session
from app.database import get_db, engine
from app.routers.auth import require_admin
from app.models.auth import User, UserRole

SECRET = os.environ.get("JWT_SECRET", "joy-erp-secret-2024")

def _hash(pw: str) -> str:
    return hashlib.sha256((pw + SECRET).encode()).hexdigest()

router = APIRouter(prefix="/admin", tags=["관리자"])


@router.post("/reset-supplier-passwords")
def reset_supplier_passwords(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """외주처 계정 비밀번호를 아이디+1234 로 일괄 초기화"""
    suppliers = db.query(User).filter(User.role == UserRole.supplier).all()
    result = []
    for u in suppliers:
        new_pw = u.username + "1234"
        u.password_hash = _hash(new_pw)
        result.append({"username": u.username, "password": new_pw, "name": u.name})
    db.commit()
    return {"reset": len(result), "accounts": result}


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


@router.get("/debug-purchase-oct")
def debug_purchase_oct(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """10월 발주 전체 현황 디버그 (po_type 무관)"""
    rows = db.execute(text("""
        SELECT po_no, partner_id, part_no, qty, order_date,
               status, po_type, note
        FROM purchase_order
        WHERE order_date >= '2026-10-01'
          AND order_date <= '2026-10-31'
        ORDER BY order_date, po_no
    """)).fetchall()
    # po_type 별 집계
    summary = {}
    for r in rows:
        pt = r._mapping.get('po_type') or 'NULL'
        summary[pt] = summary.get(pt, 0) + 1
    return {
        "total": len(rows),
        "by_po_type": summary,
        "items": [dict(r._mapping) for r in rows[:50]]
    }


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
    """2026년 10월 외주 발주 및 관련 입고·원장 전체 삭제 (po_type=outsource OR NULL, 정식오픈 전 정리)"""
    # 10월 발주번호 수집 (po_type 무관 — NULL도 포함)
    po_nos = [r[0] for r in db.execute(text("""
        SELECT po_no FROM purchase_order
        WHERE order_date >= '2026-10-01'
          AND order_date <= '2026-10-31'
          AND (po_type = 'outsource' OR po_type IS NULL OR po_type = '')
    """)).fetchall()]

    if not po_nos:
        return {"deleted": 0, "message": "삭제할 10월 외주 발주가 없습니다 — /admin/debug-purchase-oct 로 실제 데이터 확인하세요"}

    in_clause = ", ".join(f"'{p}'" for p in po_nos)

    r_ledger = db.execute(text(f"DELETE FROM stock_ledger WHERE ref_no IN ({in_clause})"))
    r_receipt = db.execute(text(f"DELETE FROM receipt WHERE po_no IN ({in_clause})"))
    r_po = db.execute(text(f"DELETE FROM purchase_order WHERE po_no IN ({in_clause})"))
    db.commit()

    return {
        "deleted_pos": r_po.rowcount,
        "deleted_receipts": r_receipt.rowcount,
        "deleted_ledger": r_ledger.rowcount,
        "po_nos": po_nos,
        "message": f"10월 외주 발주 {r_po.rowcount}건 및 관련 데이터 삭제 완료"
    }


@router.delete("/purge-all-outsource")
def purge_all_outsource(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """발주·발주서 전체 삭제 (purchase_order + purchase_order_group + receipt + 관련 원장)"""
    po_nos = [r[0] for r in db.execute(text("SELECT po_no FROM purchase_order")).fetchall()]
    if po_nos:
        in_clause = ", ".join(f"'{p}'" for p in po_nos)
        db.execute(text(f"DELETE FROM stock_ledger WHERE ref_no IN ({in_clause})"))
        db.execute(text(f"DELETE FROM receipt WHERE po_no IN ({in_clause})"))
    r_po    = db.execute(text("DELETE FROM purchase_order"))
    r_group = db.execute(text("DELETE FROM purchase_order_group"))
    db.commit()
    return {
        "deleted_pos": r_po.rowcount,
        "deleted_groups": r_group.rowcount,
        "message": f"발주 {r_po.rowcount}건 + 발주서 {r_group.rowcount}건 전체 삭제 완료"
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


@router.post("/purge-portal-test-receipts")
def purge_portal_test_receipts(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """포털 실수납품 정리: GR-20261030-001 ~ 007 및 연관 검사·NCR 일괄 삭제"""
    from app.models.purchase import Receipt, ReceiptStatus
    from app.models.quality import Inspection, NonConformance

    targets = [f"GR-20261030-{i:03d}" for i in range(1, 8)]
    deleted = []
    skipped = []

    for gr_no in targets:
        r = db.get(Receipt, gr_no)
        if not r:
            skipped.append(gr_no)
            continue
        if r.status == ReceiptStatus.confirmed:
            skipped.append(f"{gr_no}(확정입고-스킵)")
            continue
        insp = db.query(Inspection).filter(Inspection.gr_no == gr_no).first()
        if insp:
            db.delete(insp)
        ncrs = db.query(NonConformance).filter(NonConformance.gr_no == gr_no).all()
        for ncr in ncrs:
            db.delete(ncr)
        db.delete(r)
        deleted.append(gr_no)

    db.commit()
    return {"deleted": deleted, "skipped": skipped, "total_deleted": len(deleted)}
