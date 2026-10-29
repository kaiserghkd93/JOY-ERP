"""재고조정 + 생산로스 API"""
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.auth import User
from app.models.master import Item
from app.models.ledger import LedgerType
from app.models.inventory_adj import (
    InventoryAdjustment, AdjStatus,
    ProductionLoss, LossType, LossStatus,
)
from app.routers.auth import get_current_user
from app.services.ledger_service import get_stock, post_ledger, get_avg_price
from app.services.doc_no import next_doc_no

router = APIRouter(prefix="/inv-adjust", tags=["재고조정·로스"])

ADMIN_ROLES = {"admin", "owner"}


# ── 재고조정 ─────────────────────────────────────────────────────

class AdjIn(BaseModel):
    adj_date: date
    part_no: str
    location: str | None = None
    actual_qty: int
    reason: str
    note: str | None = None
    related_pord: str | None = None


class AdjOut(BaseModel):
    id: int
    adj_no: str
    adj_date: date
    part_no: str
    part_name: str | None = None
    book_qty: int
    actual_qty: int
    diff_qty: int
    reason: str
    status: AdjStatus
    created_by: str
    approved_by: str | None = None
    rejection_reason: str | None = None
    confirmed_at: datetime | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


def _adj_out(adj: InventoryAdjustment, db: Session) -> dict:
    item = db.get(Item, adj.part_no)
    return {
        "id": adj.id, "adj_no": adj.adj_no, "adj_date": adj.adj_date,
        "part_no": adj.part_no, "part_name": item.name if item else adj.part_no,
        "book_qty": adj.book_qty, "actual_qty": adj.actual_qty, "diff_qty": adj.diff_qty,
        "reason": adj.reason, "note": adj.note, "status": adj.status,
        "created_by": adj.created_by, "approved_by": adj.approved_by,
        "rejection_reason": adj.rejection_reason,
        "confirmed_at": adj.confirmed_at, "created_at": adj.created_at,
    }


@router.post("/adjustments")
def create_adjustment(body: AdjIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    book = get_stock(db, body.part_no)
    diff = body.actual_qty - book

    # 관리자(admin/owner)는 기록 없이 바로 ledger 반영
    if user.role in ADMIN_ROLES:
        if diff == 0:
            return {"ok": True, "skipped": True, "msg": "차이 없음"}
        avg = get_avg_price(db, body.part_no)
        entry = post_ledger(
            db, body.part_no, body.adj_date, LedgerType.adjustment,
            diff, avg, ref_type="ADJ-ADMIN", ref_no=None,
            note=f"관리자재고조정: {body.reason}",
        )
        db.commit()
        return {"ok": True, "admin_direct": True, "diff_qty": diff, "ledger_id": entry.id}

    adj_no = next_doc_no(db, "ADJ", "inventory_adjustment", "adj_no")
    adj = InventoryAdjustment(
        adj_no=adj_no, adj_date=body.adj_date, part_no=body.part_no,
        location=body.location, book_qty=book, actual_qty=body.actual_qty,
        diff_qty=diff, reason=body.reason, note=body.note,
        related_pord=body.related_pord,
        status=AdjStatus.pending, created_by=user.name,
    )
    db.add(adj)
    db.commit()
    db.refresh(adj)
    return _adj_out(adj, db)


@router.get("/adjustments")
def list_adjustments(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(InventoryAdjustment)
    if status:
        q = q.filter(InventoryAdjustment.status == status)
    adjs = q.order_by(InventoryAdjustment.created_at.desc()).limit(200).all()
    return [_adj_out(a, db) for a in adjs]


@router.patch("/adjustments/{adj_id}/approve")
def approve_adjustment(adj_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    adj = db.get(InventoryAdjustment, adj_id)
    if not adj:
        raise HTTPException(404)
    if adj.status != AdjStatus.pending:
        raise HTTPException(400, "승인대기 상태가 아닙니다.")
    adj.status = AdjStatus.approved
    adj.approved_by = user.name
    adj.approved_at = datetime.now()
    db.commit()
    return _adj_out(adj, db)


@router.patch("/adjustments/{adj_id}/reject")
def reject_adjustment(adj_id: int, reason: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    adj = db.get(InventoryAdjustment, adj_id)
    if not adj:
        raise HTTPException(404)
    adj.status = AdjStatus.rejected
    adj.approved_by = user.name
    adj.approved_at = datetime.now()
    adj.rejection_reason = reason
    db.commit()
    return _adj_out(adj, db)


@router.patch("/adjustments/{adj_id}/confirm")
def confirm_adjustment(adj_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    adj = db.get(InventoryAdjustment, adj_id)
    if not adj:
        raise HTTPException(404)
    if adj.status != AdjStatus.approved:
        raise HTTPException(400, "승인완료 상태만 확정할 수 있습니다.")
    if adj.diff_qty == 0:
        adj.status = AdjStatus.confirmed
        adj.confirmed_at = datetime.now()
        db.commit()
        return _adj_out(adj, db)
    avg = get_avg_price(db, adj.part_no)
    entry = post_ledger(
        db, adj.part_no, adj.adj_date, LedgerType.adjustment,
        adj.diff_qty, avg, ref_type="ADJ", ref_no=adj.adj_no,
        note=f"재고조정({adj.reason})",
    )
    db.flush()
    adj.status = AdjStatus.confirmed
    adj.confirmed_at = datetime.now()
    adj.ledger_id = entry.id
    db.commit()
    return _adj_out(adj, db)


# ── 생산 로스 ─────────────────────────────────────────────────────

LOSS_TO_LEDGER = {
    LossType.purge:          LedgerType.loss_purge,
    LossType.startup:        LedgerType.loss_startup,
    LossType.runner_scrap:   LedgerType.loss_runner,
    LossType.raw_disposal:   LedgerType.raw_disposal,
    LossType.product_defect: LedgerType.loss_purge,
    LossType.other:          LedgerType.loss_purge,
    # 입고 방향
    LossType.regrind_in:     LedgerType.regrind_in,
    LossType.runner_recover: LedgerType.regrind_in,
    LossType.regrind_out:    LedgerType.regrind_out,
}

LOSS_SIGN = {
    LossType.regrind_in:     +1,
    LossType.runner_recover: +1,
    LossType.regrind_out:    -1,
}  # 나머지는 -1 (소비/손실)


class LossIn(BaseModel):
    loss_date: date
    raw_part_no: str
    loss_type: LossType
    qty_kg: float
    part_no: str | None = None
    machine_no: str | None = None
    pord_no: str | None = None
    reason_code: str | None = None
    note: str | None = None


def _loss_out(loss: ProductionLoss, db: Session) -> dict:
    item = db.get(Item, loss.raw_part_no)
    prod_item = db.get(Item, loss.part_no) if loss.part_no else None
    return {
        "id": loss.id, "loss_date": loss.loss_date,
        "raw_part_no": loss.raw_part_no,
        "raw_part_name": item.name if item else loss.raw_part_no,
        "part_no": loss.part_no,
        "part_name": prod_item.name if prod_item else loss.part_no,
        "machine_no": loss.machine_no, "pord_no": loss.pord_no,
        "loss_type": loss.loss_type, "qty_kg": float(loss.qty_kg),
        "reason_code": loss.reason_code, "note": loss.note,
        "status": loss.status, "created_by": loss.created_by,
        "confirmed_by": loss.confirmed_by, "confirmed_at": loss.confirmed_at,
        "created_at": loss.created_at,
    }


@router.post("/losses")
def create_loss(body: LossIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loss = ProductionLoss(
        loss_date=body.loss_date, part_no=body.part_no,
        raw_part_no=body.raw_part_no, machine_no=body.machine_no,
        pord_no=body.pord_no, loss_type=body.loss_type,
        qty_kg=body.qty_kg, reason_code=body.reason_code,
        note=body.note, created_by=user.name,
    )
    db.add(loss)
    db.commit()
    db.refresh(loss)
    return _loss_out(loss, db)


@router.get("/losses")
def list_losses(limit: int = 100, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    losses = db.query(ProductionLoss).order_by(ProductionLoss.created_at.desc()).limit(limit).all()
    return [_loss_out(l, db) for l in losses]


@router.patch("/losses/{loss_id}/confirm")
def confirm_loss(loss_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loss = db.get(ProductionLoss, loss_id)
    if not loss:
        raise HTTPException(404)
    if loss.status == LossStatus.confirmed:
        raise HTTPException(400, "이미 확정된 로스입니다.")

    sign = LOSS_SIGN.get(loss.loss_type, -1)
    ledger_type = LOSS_TO_LEDGER.get(loss.loss_type, LedgerType.loss_purge)
    qty_g = int(float(loss.qty_kg) * 1000)  # kg → g (원재료 단위: g)
    item = db.get(Item, loss.raw_part_no)
    price = float(item.avg_cost or item.std_buy_price or 0) if item else 0.0

    entry = post_ledger(
        db, loss.raw_part_no, loss.loss_date, ledger_type,
        sign * qty_g, price,
        ref_type="LOSS", ref_no=str(loss.id),
        note=f"{loss.loss_type.value} {loss.qty_kg}kg",
    )
    db.flush()
    loss.status = LossStatus.confirmed
    loss.confirmed_by = user.name
    loss.confirmed_at = datetime.now()
    loss.ledger_id = entry.id
    db.commit()
    return _loss_out(loss, db)


@router.delete("/losses/{loss_id}")
def delete_loss(loss_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loss = db.get(ProductionLoss, loss_id)
    if not loss:
        raise HTTPException(404)
    if loss.status == LossStatus.confirmed:
        raise HTTPException(400, "확정된 로스는 삭제할 수 없습니다.")
    db.delete(loss)
    db.commit()
    return {"ok": True}


# ── 편차 분석 ─────────────────────────────────────────────────────

@router.get("/deviation-summary")
def deviation_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """원재료별 최근 조정 현황 + 대기 건수"""
    pending = db.query(InventoryAdjustment).filter(
        InventoryAdjustment.status == AdjStatus.pending
    ).count()
    recent_losses = db.query(ProductionLoss).filter(
        ProductionLoss.status == LossStatus.draft
    ).count()
    return {
        "pending_adjustments": pending,
        "unconfirmed_losses": recent_losses,
    }
