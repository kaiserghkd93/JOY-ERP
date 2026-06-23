from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.quality import Inspection, QualityClaim, InspectionResult, DisposalType, ClaimStatus
from app.models.purchase import Receipt, ReceiptStatus
from app.models.ledger import LedgerType
from app.services.doc_no import next_doc_no
from app.services.ledger_service import post_ledger, get_avg_price
from fastapi import HTTPException


def register_inspection(
    db: Session,
    gr_no: str,
    inspect_date: date,
    pass_qty: int,
    fail_qty: int,
    disposal: DisposalType,
    defect_note: str | None = None,
) -> Inspection:
    receipt = db.get(Receipt, gr_no)
    if not receipt:
        raise HTTPException(404, f"입고 없음: {gr_no}")
    if receipt.status == ReceiptStatus.confirmed:
        raise HTTPException(400, "이미 확정된 입고 — 검사 재등록 불가")
    if receipt.status == ReceiptStatus.cancelled:
        raise HTTPException(400, "취소 입고는 검사 불가")

    existing = db.query(Inspection).filter(Inspection.gr_no == gr_no).first()
    if existing:
        raise HTTPException(409, "이미 검사 등록된 입고")

    inspect_qty = pass_qty + fail_qty
    if inspect_qty > receipt.qty:
        raise HTTPException(400, f"검사수량({inspect_qty}) > 입고수량({receipt.qty})")

    if pass_qty > 0 and fail_qty > 0:
        result = InspectionResult.partial
    elif fail_qty > 0:
        result = InspectionResult.fail
    else:
        result = InspectionResult.pass_

    insp = Inspection(
        gr_no=gr_no, inspect_date=inspect_date,
        inspect_qty=inspect_qty, pass_qty=pass_qty, fail_qty=fail_qty,
        result=result, disposal=disposal, defect_note=defect_note,
    )
    db.add(insp)
    db.flush()

    # 합격수량만 재고원장에 입고(+) — 핵심 게이트
    if pass_qty > 0:
        receipt.status = ReceiptStatus.confirmed
        post_ledger(
            db, receipt.part_no, inspect_date,
            LedgerType.receipt, +pass_qty, float(receipt.unit_price),
            ref_type="GR", ref_no=gr_no, note=f"검사합격 {pass_qty}/{inspect_qty}",
        )
    else:
        # 전량 불합격 — 입고 상태를 cancelled로
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
