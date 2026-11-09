from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func, text as _sql
from app.models.quality import Inspection, QualityClaim, InspectionResult, DisposalType, ClaimStatus
from app.models.purchase import Receipt, ReceiptStatus
from app.models.ledger import LedgerType
from app.services.doc_no import next_doc_no
from app.services.ledger_service import post_ledger, get_avg_price
from fastapi import HTTPException


def _to_str(v) -> str:
    """enum 또는 문자열 → 순수 str (SQLAlchemy enum 타입 검증 완전 우회)"""
    if hasattr(v, 'value'):
        return str(v.value)
    return str(v)


def register_inspection(
    db: Session,
    gr_no: str,
    inspect_date: date,
    pass_qty: int,
    fail_qty: int,
    disposal: DisposalType,
    defect_note: str | None = None,
    result: str | None = None,  # 외부에서 자동판정 결과 주입 가능
) -> Inspection:
    receipt = db.get(Receipt, gr_no)
    if not receipt:
        raise HTTPException(404, f"입고 없음: {gr_no}")
    if receipt.status == ReceiptStatus.confirmed:
        raise HTTPException(400, "이미 확정된 입고 — 검사 재등록 불가")
    if receipt.status == ReceiptStatus.cancelled:
        raise HTTPException(400, "취소 입고는 검사 불가")

    inspect_qty = pass_qty + fail_qty
    if inspect_qty > receipt.qty:
        raise HTTPException(400, f"검사수량({inspect_qty}) > 입고수량({receipt.qty})")

    # 판정 결정
    if result is not None:
        result_str = _to_str(result) if hasattr(result, 'value') else result
    elif pass_qty > 0 and fail_qty > 0:
        result_str = "부분합격"
    elif fail_qty > 0:
        result_str = "불합격"
    else:
        result_str = "합격"

    disposal_str = _to_str(disposal)

    # 기존 레코드 확인 (raw SQL — ORM enum 타입 검증 우회)
    existing_row = db.execute(
        _sql("SELECT id, result FROM inspection WHERE gr_no = :gr"), {"gr": gr_no}
    ).first()

    _PENDING_VALUES = {"pending_insp", "검사대기"}

    if existing_row:
        existing_result = existing_row[1] or ""
        if existing_result not in _PENDING_VALUES:
            raise HTTPException(409, "이미 검사 등록된 입고")
        # 기존 레코드 업데이트 (raw SQL)
        db.execute(_sql(
            "UPDATE inspection SET "
            "inspect_date = :date, inspect_qty = :iqty, "
            "pass_qty = :pq, fail_qty = :fq, "
            "result = :result, disposal = :disposal, defect_note = :note "
            "WHERE gr_no = :gr"
        ), {
            "date": inspect_date, "iqty": inspect_qty,
            "pq": pass_qty, "fq": fail_qty,
            "result": result_str, "disposal": disposal_str,
            "note": defect_note, "gr": gr_no,
        })
        insp_id = existing_row[0]
    else:
        # 새 레코드 INSERT (raw SQL)
        db.execute(_sql(
            "INSERT INTO inspection "
            "(gr_no, inspect_date, inspect_qty, pass_qty, fail_qty, result, disposal, defect_note) "
            "VALUES (:gr, :date, :iqty, :pq, :fq, :result, :disposal, :note)"
        ), {
            "gr": gr_no, "date": inspect_date, "iqty": inspect_qty,
            "pq": pass_qty, "fq": fail_qty,
            "result": result_str, "disposal": disposal_str,
            "note": defect_note,
        })
        row = db.execute(_sql("SELECT id FROM inspection WHERE gr_no = :gr"), {"gr": gr_no}).first()
        insp_id = row[0]

    # ORM 세션 캐시 무효화 후 재로드
    db.expire_all()
    insp = db.get(Inspection, insp_id)

    # 합격수량만 재고원장에 입고(+) — 핵심 게이트
    if pass_qty > 0:
        receipt.status = ReceiptStatus.confirmed
        post_ledger(
            db, receipt.part_no, inspect_date,
            LedgerType.receipt, +pass_qty, float(receipt.unit_price),
            ref_type="GR", ref_no=gr_no, lot_no=receipt.lot_no,
            note=f"검사합격 {pass_qty}/{inspect_qty}",
        )
    else:
        receipt.status = ReceiptStatus.cancelled

    db.flush()
    return insp


def get_defect_rate(db: Session, partner_id: str | None = None,
                    from_date: date | None = None, to_date: date | None = None) -> list[dict]:
    """외주처별 불량률 집계"""
    from app.models.purchase import Receipt, PurchaseOrder
    q = db.query(
        PurchaseOrder.partner_id,
        func.sum(Inspection.inspect_qty).label("total_inspect"),
        func.sum(Inspection.fail_qty).label("total_fail"),
    ).join(Receipt, Receipt.po_no == PurchaseOrder.po_no
    ).join(Inspection, Inspection.gr_no == Receipt.gr_no)

    if partner_id:
        q = q.filter(PurchaseOrder.partner_id == partner_id)
    if from_date:
        q = q.filter(Inspection.inspect_date >= from_date)
    if to_date:
        q = q.filter(Inspection.inspect_date <= to_date)

    rows = q.group_by(PurchaseOrder.partner_id).all()
    result = []
    for row in rows:
        total = int(row.total_inspect or 0)
        fail = int(row.total_fail or 0)
        result.append({
            "partner_id": row.partner_id,
            "total_inspect": total,
            "total_fail": fail,
            "defect_rate": round(fail / total * 100, 2) if total > 0 else 0.0,
        })
    return sorted(result, key=lambda x: x["defect_rate"], reverse=True)


def create_claim(db: Session, **kwargs) -> QualityClaim:
    claim_no = next_doc_no(db, "CLM", "quality_claim", "claim_no")
    claim = QualityClaim(claim_no=claim_no, **kwargs)
    db.add(claim)
    db.commit()
    db.refresh(claim)
    return claim


def update_claim(db: Session, claim_no: str, **kwargs) -> QualityClaim:
    claim = db.get(QualityClaim, claim_no)
    if not claim:
        raise HTTPException(404)
    for k, v in kwargs.items():
        if v is not None:
            setattr(claim, k, v)
    db.commit()
    db.refresh(claim)
    return claim
