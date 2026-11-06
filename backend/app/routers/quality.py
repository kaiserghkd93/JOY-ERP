from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import date, datetime
import calendar as _calendar
from pydantic import BaseModel
from app.database import get_db
from app.models.quality import (
    Inspection, QualityClaim, ApprovalStatus,
    InspectionStandard, InspectionItem, StandardStatus,
    NonConformance, NcrAppeal, NcrStatus, AppealStatus,
    ProcessOutgoingDefect, InspectType,
)
from app.models.master import Partner, Item
from app.models.purchase import Receipt
from app.models.sales import Shipment
from app.models.auth import User
from app.schemas.quality import (
    InspectionCreate, InspectionOut,
    ClaimCreate, ClaimUpdate, ClaimOut, DefectRateOut,
    StandardCreate, StandardOut, SamplingPlanOut,
    NcrCreate, NcrUpdate, NcrOut, AppealOut,
)
from app.services.quality_service import (
    register_inspection, get_defect_rate, create_claim, update_claim
)
from app.services.sampling import get_ac_re, auto_judge
from app.routers.auth import get_current_user

router = APIRouter(prefix="/quality", tags=["품질"])

QUALITY_ROLES = {"admin", "quality", "quality_manager"}
MANAGER_ROLES = {"admin", "quality_manager", "owner"}


def _require_quality(user: User = Depends(get_current_user)) -> User:
    if user.role not in QUALITY_ROLES:
        raise HTTPException(403, "품질관리 권한이 없습니다")
    return user


def _require_manager(user: User = Depends(get_current_user)) -> User:
    if user.role not in MANAGER_ROLES:
        raise HTTPException(403, "품질책임자 권한이 필요합니다")
    return user


@router.get("/sampling-plan", response_model=SamplingPlanOut)
def sampling_plan(
    lot_size: int,
    level: str = "II",
    aql: float = 1.0,
):
    """ISO 2859-1 샘플링 플랜 조회 (lot_size, level, aql → sample_size, Ac, Re)"""
    plan = get_ac_re(lot_size, level, aql)
    return {"lot_size": lot_size, "level": level, "aql": aql, **plan}


@router.post("/inspections", response_model=InspectionOut)
def post_inspection(body: InspectionCreate, db: Session = Depends(get_db), user: User = Depends(_require_quality)):
    data = body.model_dump(exclude={"standard_id", "lot_size"})

    # 검사기준이 연결되어 있으면 샘플링 자동계산 + 자동판정
    std = db.get(InspectionStandard, body.standard_id) if body.standard_id else None
    lot = body.lot_size
    ac = re = sample_size = None

    if std and lot:
        plan = get_ac_re(lot, std.sampling_level, std.aql)
        sample_size = plan["sample_size"]
        ac = plan["ac"]
        re = plan["re"]
        # 자동판정: fail_qty 기준
        data["result"] = auto_judge(data["fail_qty"], ac, re)

    insp = register_inspection(db, **data)
    insp.inspector_id = user.username
    insp.approval_status = ApprovalStatus.draft
    insp.standard_id = body.standard_id
    insp.lot_size = lot
    insp.sample_size = sample_size
    insp.ac = ac
    insp.re = re

    # 입고전표에 납품수량(delivered_qty) 자동 기록 및 반품수량 설정
    from app.models.purchase import Receipt
    receipt = db.get(Receipt, insp.gr_no)
    if receipt:
        if not getattr(receipt, 'delivered_qty', 0):
            receipt.delivered_qty = insp.inspect_qty
        if insp.fail_qty > 0 and insp.disposal and insp.disposal.value == "반품":
            receipt.return_qty = insp.fail_qty
            receipt.return_reason = insp.defect_note or "수입검사 불합격 반품"

    # 처리방법이 반품/폐기/특채이면 NCR 자동 생성 (중복 방지)
    NCR_AUTO_DISPOSALS = {"반품", "폐기", "특채"}
    if (
        insp.fail_qty > 0
        and insp.disposal
        and insp.disposal.value in NCR_AUTO_DISPOSALS
    ):
        existing_ncr = db.query(NonConformance).filter(
            NonConformance.inspection_id == insp.id
        ).first()
        if not existing_ncr:
            from app.models.quality import NcrOccurType, NcrDisposal as _NcrDisposal
            _disposal_map = {"반품": _NcrDisposal.return_, "폐기": _NcrDisposal.scrap, "특채": _NcrDisposal.concession}
            part_no = receipt.part_no if receipt else None
            partner_id = receipt.partner_id if receipt else None
            if part_no:
                auto_ncr = NonConformance(
                    ncr_no=_next_ncr_no(db),
                    gr_no=insp.gr_no,
                    inspection_id=insp.id,
                    part_no=part_no,
                    partner_id=partner_id,
                    occur_type=NcrOccurType.receipt,
                    defect_type=insp.defect_note or "수입검사 불합격",
                    defect_qty=insp.fail_qty,
                    disposal=_disposal_map.get(insp.disposal.value, _NcrDisposal.pending),
                    notified_at=datetime.now(),
                )
                db.add(auto_ncr)

    db.commit()
    db.refresh(insp)
    return insp


@router.get("/inspections", response_model=list[InspectionOut])
def list_inspections(db: Session = Depends(get_db)):
    return db.query(Inspection).order_by(Inspection.inspect_date.desc()).all()


@router.get("/inspections/{gr_no}", response_model=InspectionOut)
def get_inspection(gr_no: str, db: Session = Depends(get_db)):
    insp = db.query(Inspection).filter(Inspection.gr_no == gr_no).first()
    if not insp:
        raise HTTPException(404)
    return insp


@router.get("/defect-rate", response_model=list[DefectRateOut])
def defect_rate(
    partner_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
):
    return get_defect_rate(db, partner_id, from_date, to_date)


@router.post("/claims", response_model=ClaimOut)
def post_claim(body: ClaimCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return create_claim(db, **body.model_dump())


@router.get("/claims", response_model=list[ClaimOut])
def list_claims(
    partner_id: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(QualityClaim)
    if partner_id:
        q = q.filter(QualityClaim.partner_id == partner_id)
    if status:
        q = q.filter(QualityClaim.status == status)
    return q.order_by(QualityClaim.occur_date.desc()).all()


@router.get("/claims/{claim_no}", response_model=ClaimOut)
def get_claim(claim_no: str, db: Session = Depends(get_db)):
    c = db.get(QualityClaim, claim_no)
    if not c:
        raise HTTPException(404)
    return c


@router.patch("/claims/{claim_no}", response_model=ClaimOut)
def patch_claim(claim_no: str, body: ClaimUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return update_claim(db, claim_no, **body.model_dump())


# ── 승인 워크플로 ─────────────────────────────────────────────────

def _get_insp(insp_id: int, db: Session) -> Inspection:
    insp = db.get(Inspection, insp_id)
    if not insp:
        raise HTTPException(404, "검사결과를 찾을 수 없습니다")
    return insp


class InspectorPatch(BaseModel):
    inspector_id: str

@router.patch("/inspections/{insp_id}/inspector")
def patch_inspector(insp_id: int, body: InspectorPatch, db: Session = Depends(get_db), user: User = Depends(_require_quality)):
    """담당자 이름 수정"""
    insp = _get_insp(insp_id, db)
    if insp.approval_status in (ApprovalStatus.approved, ApprovalStatus.confirmed) and user.role != "admin":
        raise HTTPException(400, "승인완료·확정 상태에서는 담당자를 변경할 수 없습니다")
    insp.inspector_id = body.inspector_id.strip()
    db.commit()
    return {"ok": True, "inspector_id": insp.inspector_id}


@router.post("/inspections/{insp_id}/request-approval")
def request_approval(insp_id: int, db: Session = Depends(get_db), user: User = Depends(_require_quality)):
    """담당자 → 승인 요청"""
    insp = _get_insp(insp_id, db)
    if insp.approval_status not in (ApprovalStatus.draft, ApprovalStatus.rejected):
        raise HTTPException(400, f"승인 요청 불가 상태: {insp.approval_status}")
    insp.approval_status = ApprovalStatus.pending
    insp.inspector_id = user.username
    insp.requested_at = datetime.now()
    insp.rejection_reason = None
    db.commit()
    return {"ok": True, "status": insp.approval_status}


class RejectBody(BaseModel):
    reason: str


@router.post("/inspections/{insp_id}/approve")
def approve_inspection(insp_id: int, db: Session = Depends(get_db), user: User = Depends(_require_manager)):
    """품질책임자 → 승인"""
    insp = _get_insp(insp_id, db)
    if insp.approval_status != ApprovalStatus.pending:
        raise HTTPException(400, "승인대기 상태가 아닙니다")
    # admin/owner는 소규모 회사에서 겸직 허용
    if insp.inspector_id == user.username and user.role not in ("admin", "owner"):
        raise HTTPException(403, "본인이 요청한 검사결과는 직접 승인할 수 없습니다")
    insp.approval_status = ApprovalStatus.approved
    insp.approver_id = user.username
    insp.approved_at = datetime.now()
    insp.rejection_reason = None
    db.commit()
    return {"ok": True, "status": insp.approval_status}


@router.post("/inspections/{insp_id}/reject")
def reject_inspection(insp_id: int, body: RejectBody, db: Session = Depends(get_db), user: User = Depends(_require_manager)):
    """품질책임자 → 반려"""
    insp = _get_insp(insp_id, db)
    if insp.approval_status != ApprovalStatus.pending:
        raise HTTPException(400, "승인대기 상태가 아닙니다")
    insp.approval_status = ApprovalStatus.rejected
    insp.approver_id = user.username
    insp.approved_at = datetime.now()
    insp.rejection_reason = body.reason
    db.commit()
    return {"ok": True, "status": insp.approval_status, "reason": body.reason}


@router.post("/inspections/{insp_id}/confirm")
def confirm_inspection(insp_id: int, db: Session = Depends(get_db), user: User = Depends(_require_manager)):
    """최종 확정 (승인완료 상태에서만 가능)"""
    insp = _get_insp(insp_id, db)
    if insp.approval_status != ApprovalStatus.approved:
        raise HTTPException(400, "승인완료 상태에서만 최종 확정할 수 있습니다")
    # admin/owner/quality_manager는 소규모 회사에서 겸직 허용
    if insp.inspector_id == user.username and user.role not in ("admin", "owner", "quality_manager"):
        raise HTTPException(403, "본인이 등록한 검사결과는 직접 확정할 수 없습니다")
    insp.approval_status = ApprovalStatus.confirmed
    insp.confirmer_id = user.username
    insp.confirmed_at = datetime.now()

    # 합격(전량 또는 부분합격 중 처리방법이 반품/폐기가 아닌 경우) → 자동 입고 확정
    from app.models.quality import InspectionResult, DisposalType
    from app.models.purchase import Receipt, ReceiptStatus
    from app.services.ledger_service import confirm_receipt as _confirm_receipt
    if insp.result in (InspectionResult.pass_, InspectionResult.partial):
        # 반품/폐기가 아닌 경우에만 재고 반영 (보류/특채는 입고)
        skip_disposals = {DisposalType.return_, DisposalType.scrap}
        if insp.disposal not in skip_disposals:
            # 처리방법을 "합격"으로 자동 변경
            insp.disposal = DisposalType.accepted
            receipt = db.get(Receipt, insp.gr_no)
            if receipt and receipt.status == ReceiptStatus.pending:
                _confirm_receipt(db, insp.gr_no)

    db.commit()
    return {"ok": True, "status": insp.approval_status}


class DisposalUpdate(BaseModel):
    disposal: str

@router.patch("/inspections/{insp_id}/disposal")
def update_disposal(insp_id: int, body: DisposalUpdate, db: Session = Depends(get_db), user: User = Depends(_require_manager)):
    """처리방법 수정 (승인완료 상태에서만 가능)"""
    from app.models.quality import DisposalType
    insp = _get_insp(insp_id, db)
    if insp.approval_status != ApprovalStatus.approved:
        raise HTTPException(400, "승인완료 상태에서만 처리방법을 변경할 수 있습니다")
    try:
        insp.disposal = DisposalType(body.disposal)
    except ValueError:
        raise HTTPException(400, f"유효하지 않은 처리방법: {body.disposal}")
    db.commit()
    return {"ok": True, "disposal": str(insp.disposal)}


@router.get("/inspections/pending-approval")
def list_pending(db: Session = Depends(get_db), user: User = Depends(_require_manager)):
    """승인대기 목록 (품질책임자용)"""
    rows = db.query(Inspection).filter(
        Inspection.approval_status == ApprovalStatus.pending
    ).order_by(Inspection.requested_at).all()
    return rows


# ── 검사기준 마스터 ─────────────────────────────────────────────────

def _next_std_no(db: Session) -> str:
    from datetime import date as _date
    prefix = f"QS-{_date.today().strftime('%Y%m')}"
    rows = db.query(InspectionStandard.std_no).filter(
        InspectionStandard.std_no.like(f"{prefix}-%")
    ).all()
    seq = len(rows) + 1
    return f"{prefix}-{seq:03d}"


@router.get("/standards", response_model=list[StandardOut])
def list_standards(
    part_no: str | None = None,
    partner_id: str | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(InspectionStandard)
    if part_no:
        q = q.filter(InspectionStandard.part_no == part_no)
    if partner_id:
        q = q.filter(InspectionStandard.partner_id == partner_id)
    if active_only:
        q = q.filter(InspectionStandard.status == StandardStatus.approved)
    return q.order_by(InspectionStandard.std_no.desc()).all()


@router.post("/standards", response_model=StandardOut)
def create_standard(body: StandardCreate, db: Session = Depends(get_db), user: User = Depends(_require_quality)):
    std_no = _next_std_no(db)
    std = InspectionStandard(
        std_no=std_no, std_rev="00",
        part_no=body.part_no, partner_id=body.partner_id,
        drawing_no=body.drawing_no, drawing_rev=body.drawing_rev,
        sampling_level=body.sampling_level, aql=body.aql,
        note=body.note, effective_date=body.effective_date,
        status=StandardStatus.draft,
    )
    db.add(std)
    db.flush()
    for i, item in enumerate(body.items):
        db.add(InspectionItem(standard_id=std.id, sort_order=i, **item.model_dump(exclude={"sort_order"})))
    db.commit()
    db.refresh(std)
    return std


@router.get("/standards/{std_id}", response_model=StandardOut)
def get_standard(std_id: int, db: Session = Depends(get_db)):
    s = db.get(InspectionStandard, std_id)
    if not s:
        raise HTTPException(404)
    return s


@router.post("/standards/{std_id}/approve", response_model=StandardOut)
def approve_standard(std_id: int, db: Session = Depends(get_db), user: User = Depends(_require_manager)):
    s = db.get(InspectionStandard, std_id)
    if not s:
        raise HTTPException(404)
    if s.status != StandardStatus.draft:
        raise HTTPException(400, "작성중 상태에서만 승인 가능합니다")
    s.status = StandardStatus.approved
    s.approver_id = user.username
    s.approved_at = datetime.now()
    db.commit()
    db.refresh(s)
    return s


@router.post("/standards/{std_id}/revise", response_model=StandardOut)
def revise_standard(std_id: int, body: StandardCreate, db: Session = Depends(get_db), user: User = Depends(_require_quality)):
    """기존 기준서를 기반으로 새 개정본 생성 (원본은 폐기)"""
    orig = db.get(InspectionStandard, std_id)
    if not orig:
        raise HTTPException(404)
    new_rev = f"{int(orig.std_rev) + 1:02d}"
    new_std = InspectionStandard(
        std_no=orig.std_no, std_rev=new_rev,
        part_no=body.part_no, partner_id=body.partner_id,
        drawing_no=body.drawing_no, drawing_rev=body.drawing_rev,
        sampling_level=body.sampling_level, aql=body.aql,
        note=body.note, effective_date=body.effective_date,
        status=StandardStatus.draft,
    )
    orig.status = StandardStatus.obsolete
    db.add(new_std)
    db.flush()
    for i, item in enumerate(body.items):
        db.add(InspectionItem(standard_id=new_std.id, sort_order=i, **item.model_dump(exclude={"sort_order"})))
    db.commit()
    db.refresh(new_std)
    return new_std


@router.post("/standards/{std_id}/items", response_model=StandardOut)
def add_standard_item(std_id: int, body: dict, db: Session = Depends(get_db), user: User = Depends(_require_quality)):
    s = db.get(InspectionStandard, std_id)
    if not s:
        raise HTTPException(404)
    item = InspectionItem(standard_id=std_id, **body)
    db.add(item)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/standards/items/{item_id}")
def delete_standard_item(item_id: int, db: Session = Depends(get_db), user: User = Depends(_require_quality)):
    item = db.get(InspectionItem, item_id)
    if not item:
        raise HTTPException(404)
    db.delete(item)
    db.commit()
    return {"ok": True}


# ── NCR (부적합품 관리) ──────────────────────────────────────────────

def _next_ncr_no(db: Session) -> str:
    from datetime import date as _date
    prefix = f"NCR-{_date.today().strftime('%Y%m%d')}"
    count = db.query(NonConformance).filter(NonConformance.ncr_no.like(f"{prefix}-%")).count()
    return f"{prefix}-{count+1:03d}"


def _ncr_to_dict(n: NonConformance) -> dict:
    d = NcrOut.model_validate(n).model_dump()
    d['item_name'] = n.item.name if n.item else n.part_no
    d['partner_name'] = n.partner.name if n.partner else n.partner_id
    return d


@router.get("/ncr")
def list_ncr(
    partner_id: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(_require_quality),
):
    q = db.query(NonConformance)
    if partner_id:
        q = q.filter(NonConformance.partner_id == partner_id)
    if status:
        q = q.filter(NonConformance.status == status)
    return [_ncr_to_dict(n) for n in q.order_by(NonConformance.created_at.desc()).all()]


@router.post("/ncr", response_model=NcrOut)
def create_ncr(body: NcrCreate, db: Session = Depends(get_db), user: User = Depends(_require_quality)):
    ncr = NonConformance(ncr_no=_next_ncr_no(db), **body.model_dump())
    ncr.notified_at = datetime.now()
    db.add(ncr)
    db.commit()
    db.refresh(ncr)
    return ncr


@router.get("/ncr/{ncr_no}")
def get_ncr(ncr_no: str, db: Session = Depends(get_db), _: User = Depends(_require_quality)):
    ncr = db.get(NonConformance, ncr_no)
    if not ncr:
        raise HTTPException(404)
    return _ncr_to_dict(ncr)


@router.patch("/ncr/{ncr_no}", response_model=NcrOut)
def update_ncr(ncr_no: str, body: NcrUpdate, db: Session = Depends(get_db), user: User = Depends(_require_quality)):
    ncr = db.get(NonConformance, ncr_no)
    if not ncr:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(ncr, k, v)
    if body.status == NcrStatus.closed and not ncr.closed_at:
        ncr.closed_at = datetime.now()

    # disposal=반품 설정 시 입고전표 return_qty 자동 업데이트
    from app.models.purchase import Receipt
    from app.models.quality import NcrDisposal
    if body.disposal == NcrDisposal.return_ and ncr.gr_no:
        receipt = db.get(Receipt, ncr.gr_no)
        if receipt and ncr.defect_qty:
            receipt.return_qty = ncr.defect_qty
            receipt.return_reason = ncr.d2_desc or "NCR 반품처리"

    db.commit()
    db.refresh(ncr)
    return ncr


# ── NCR 이의신청 ───────────────────────────────────────────────────

class AppealBody(BaseModel):
    appeal_reason: str
    evidence_text: str | None = None


class ReviewBody(BaseModel):
    status: AppealStatus
    review_note: str | None = None


@router.post("/ncr/{ncr_no}/appeal", response_model=AppealOut)
def create_appeal(ncr_no: str, body: AppealBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """협력업체(포털 포함)가 NCR에 이의신청"""
    ncr = db.get(NonConformance, ncr_no)
    if not ncr:
        raise HTTPException(404)
    # 본인 업체 NCR에만 이의신청 가능
    if user.role == "supplier" and ncr.partner_id != user.partner_id:
        raise HTTPException(403, "본인 업체의 부적합통보에만 이의신청 가능합니다")
    appeal = NcrAppeal(
        ncr_no=ncr_no,
        partner_id=ncr.partner_id or (user.partner_id or ""),
        appeal_reason=body.appeal_reason,
        evidence_text=body.evidence_text,
    )
    db.add(appeal)
    db.commit()
    db.refresh(appeal)
    return appeal


@router.patch("/ncr/{ncr_no}/appeal/{appeal_id}", response_model=AppealOut)
def review_appeal(ncr_no: str, appeal_id: int, body: ReviewBody, db: Session = Depends(get_db), user: User = Depends(_require_manager)):
    """품질책임자가 이의신청 검토"""
    appeal = db.get(NcrAppeal, appeal_id)
    if not appeal or appeal.ncr_no != ncr_no:
        raise HTTPException(404)
    appeal.status = body.status
    appeal.review_note = body.review_note
    appeal.reviewer_id = user.username
    appeal.reviewed_at = datetime.now()
    # 이의신청 인정 시 NCR 처리중으로 변경
    if body.status == AppealStatus.accepted:
        ncr = db.get(NonConformance, ncr_no)
        if ncr:
            ncr.status = NcrStatus.processing
    db.commit()
    db.refresh(appeal)
    return appeal


# ── 공정/출하 불량 등록 ───────────────────────────────────────────────

class DefectRegCreate(BaseModel):
    defect_date: date
    inspect_type: str
    source_type: str = "자체생산"   # 자체생산 | 외주
    partner_id: str | None = None
    part_no: str
    part_name: str | None = None
    defect_type: str
    defect_qty: int
    inspect_qty: int = 0
    unit_price: int = 0
    labor_loss_min: float | None = None   # None이면 품목 C/T에서 자동 계산
    line_no: str | None = None
    cause: str | None = None
    action_taken: str | None = None
    note: str | None = None


def _defect_row(r) -> dict:
    from app.models.master import Partner
    partner_name = None
    if r.partner_id and r.partner:
        partner_name = r.partner.name
    return {
        "id": r.id,
        "defect_date": str(r.defect_date),
        "inspect_type": r.inspect_type,
        "source_type": r.source_type if r.source_type else "자체생산",
        "partner_id": r.partner_id,
        "partner_name": partner_name,
        "part_no": r.part_no,
        "part_name": r.part_name,
        "defect_type": r.defect_type,
        "defect_qty": r.defect_qty,
        "inspect_qty": r.inspect_qty,
        "defect_rate": round(r.defect_qty / r.inspect_qty * 100, 2) if r.inspect_qty else None,
        "unit_price": r.unit_price or 0,
        "loss_amount": r.defect_qty * (r.unit_price or 0),
        "labor_loss_min": round(r.labor_loss_min or 0, 1),
        "line_no": r.line_no,
        "cause": r.cause,
        "action_taken": r.action_taken,
        "registered_by": r.registered_by,
        "note": r.note,
        "created_at": str(r.created_at),
        "status": r.status or "등록",
        "improvement_note": r.improvement_note,
        "reviewer": r.reviewer,
        "reviewed_at": str(r.reviewed_at) if r.reviewed_at else None,
    }


@router.get("/defect-reg")
def list_defect_reg(
    start: date | None = None,
    end: date | None = None,
    inspect_type: str | None = None,
    source_type: str | None = None,
    partner_id: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(ProcessOutgoingDefect)
    if start:
        q = q.filter(ProcessOutgoingDefect.defect_date >= start)
    if end:
        q = q.filter(ProcessOutgoingDefect.defect_date <= end)
    if inspect_type:
        q = q.filter(ProcessOutgoingDefect.inspect_type == inspect_type)
    if source_type:
        q = q.filter(ProcessOutgoingDefect.source_type == source_type)
    if partner_id:
        q = q.filter(ProcessOutgoingDefect.partner_id == partner_id)
    rows = q.order_by(ProcessOutgoingDefect.defect_date.desc(), ProcessOutgoingDefect.id.desc()).all()
    return [_defect_row(r) for r in rows]


@router.post("/defect-reg", status_code=201)
def create_defect_reg(body: DefectRegCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models.quality import DefectSourceType
    # 공수 로스 자동 계산: 명시 입력 없으면 품목 manual_ct_sec 사용
    labor_loss = body.labor_loss_min
    if labor_loss is None:
        item = db.query(Item).filter(Item.part_no == body.part_no).first()
        ct_sec = (item.manual_ct_sec or 0) if item else 0
        labor_loss = round(body.defect_qty * ct_sec / 60, 1)
    row = ProcessOutgoingDefect(
        defect_date=body.defect_date,
        inspect_type=body.inspect_type,
        source_type=DefectSourceType(body.source_type),
        partner_id=body.partner_id if body.source_type == "외주" else None,
        part_no=body.part_no,
        part_name=body.part_name,
        defect_type=body.defect_type,
        defect_qty=body.defect_qty,
        inspect_qty=body.inspect_qty,
        unit_price=body.unit_price,
        labor_loss_min=labor_loss,
        line_no=body.line_no,
        cause=body.cause,
        action_taken=body.action_taken,
        registered_by=current_user.username,
        note=body.note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id}


@router.get("/defect-reg/monthly-summary")
def defect_monthly_summary(
    year: int,
    month: int,
    db: Session = Depends(get_db),
):
    """월말 집계 — 외주업체별 불량 현황 (업체 통보용)"""
    from datetime import date as date_cls
    import calendar
    first_day = date_cls(year, month, 1)
    last_day = date_cls(year, month, calendar.monthrange(year, month)[1])

    rows = db.query(ProcessOutgoingDefect).filter(
        ProcessOutgoingDefect.defect_date >= first_day,
        ProcessOutgoingDefect.defect_date <= last_day,
    ).all()

    # 자체생산 집계
    inhouse = [r for r in rows if (r.source_type or "자체생산") == "자체생산"]
    # 외주 집계 — 업체별 그룹
    outsource_map: dict = {}
    for r in rows:
        if (r.source_type or "자체생산") != "외주":
            continue
        pid = r.partner_id or "미지정"
        pname = (r.partner.name if r.partner else None) or pid
        if pid not in outsource_map:
            outsource_map[pid] = {"partner_id": pid, "partner_name": pname, "total_inspect": 0, "total_defect": 0, "total_loss": 0, "items": []}
        g = outsource_map[pid]
        g["total_inspect"] += r.inspect_qty
        g["total_defect"] += r.defect_qty
        g["total_loss"] += r.defect_qty * (r.unit_price or 0)
        g["total_labor_loss_min"] = round(g.get("total_labor_loss_min", 0) + (r.labor_loss_min or 0), 1)
        g["items"].append(_defect_row(r))

    for g in outsource_map.values():
        g["defect_rate"] = round(g["total_defect"] / g["total_inspect"] * 100, 2) if g["total_inspect"] else None

    inhouse_loss = sum(r.defect_qty * (r.unit_price or 0) for r in inhouse)
    inhouse_labor_loss = round(sum(r.labor_loss_min or 0 for r in inhouse), 1)
    return {
        "year": year,
        "month": month,
        "inhouse": {
            "total_inspect": sum(r.inspect_qty for r in inhouse),
            "total_defect": sum(r.defect_qty for r in inhouse),
            "total_loss": inhouse_loss,
            "total_labor_loss_min": inhouse_labor_loss,
            "items": [_defect_row(r) for r in inhouse],
        },
        "outsource": sorted(outsource_map.values(), key=lambda x: x["total_loss"], reverse=True),
    }


class DefectRegUpdate(BaseModel):
    defect_date: date | None = None
    inspect_type: str | None = None
    source_type: str | None = None
    partner_id: str | None = None
    part_no: str | None = None
    part_name: str | None = None
    defect_type: str | None = None
    defect_qty: int | None = None
    inspect_qty: int | None = None
    unit_price: int | None = None
    labor_loss_min: float | None = None
    line_no: str | None = None
    cause: str | None = None
    action_taken: str | None = None
    note: str | None = None
    status: str | None = None
    improvement_note: str | None = None
    reviewer: str | None = None
    reviewed_at: date | None = None

@router.patch("/defect-reg/{row_id}")
def update_defect_reg(row_id: int, body: DefectRegUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    row = db.get(ProcessOutgoingDefect, row_id)
    if not row:
        raise HTTPException(404, "not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(row, field, val)
    db.commit()
    db.refresh(row)
    return _defect_row(row)


@router.delete("/defect-reg/{row_id}", status_code=204)
def delete_defect_reg(row_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    row = db.get(ProcessOutgoingDefect, row_id)
    if not row:
        raise HTTPException(404, "not found")
    db.delete(row)
    db.commit()


@router.post("/defect-reg/recalc-labor-loss")
def recalc_labor_loss(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """기존 불량 레코드 공수 로스 일괄 재계산 (manual_ct_sec 기준)"""
    items = {i.part_no: i for i in db.query(Item).all()}
    rows = db.query(ProcessOutgoingDefect).all()
    updated = 0
    for r in rows:
        item = items.get(r.part_no)
        ct_sec = float(item.manual_ct_sec or 0) if item else 0
        new_val = round(r.defect_qty * ct_sec / 60, 1)
        if new_val != (r.labor_loss_min or 0):
            r.labor_loss_min = new_val
            updated += 1
    db.commit()
    return {"updated": updated, "total": len(rows)}


# ── VDA 6.3 분석 엔드포인트 ────────────────────────────────────────

@router.get("/vda-analysis")
def vda_quality_analysis(year: int, month: int, db: Session = Depends(get_db)):
    """
    VDA 6.3 기준 월별 품질 종합 분석
    - 공정/출하 불량 유형별 파레토 + 로스비용
    - 입고검사 불합격 협력사별 분석
    - 클레임 현황 (고객 실패비용)
    - ERP 자동진단 (워스트/베스트)
    """
    first_day = date(year, month, 1)
    last_day = date(year, month, _calendar.monthrange(year, month)[1])

    # ── 1. 공정/출하 불량 유형별 파레토 ──────────────────────────
    defect_rows = db.query(ProcessOutgoingDefect).filter(
        ProcessOutgoingDefect.defect_date >= first_day,
        ProcessOutgoingDefect.defect_date <= last_day,
    ).all()

    # 불량유형별 집계
    type_map: dict = {}
    for r in defect_rows:
        key = (r.defect_type or '미분류', r.inspect_type.value if hasattr(r.inspect_type, 'value') else str(r.inspect_type))
        if key not in type_map:
            type_map[key] = {"defect_type": r.defect_type or '미분류', "inspect_type": key[1],
                             "defect_qty": 0, "inspect_qty": 0, "loss_cost": 0, "labor_loss_min": 0, "items": []}
        g = type_map[key]
        g["defect_qty"] += r.defect_qty
        g["inspect_qty"] += r.inspect_qty
        g["loss_cost"] += r.defect_qty * (r.unit_price or 0)
        g["labor_loss_min"] = round(g["labor_loss_min"] + (r.labor_loss_min or 0), 1)
        g["items"].append({
            "id": r.id, "part_no": r.part_no, "part_name": r.part_name,
            "defect_qty": r.defect_qty, "cause": r.cause, "action_taken": r.action_taken,
            "status": r.status,
        })

    defect_by_type = sorted(type_map.values(), key=lambda x: x["defect_qty"], reverse=True)
    total_defect_qty    = sum(d["defect_qty"]    for d in defect_by_type)
    total_loss_cost     = sum(d["loss_cost"]     for d in defect_by_type)
    total_labor_loss_min = round(sum(d["labor_loss_min"] for d in defect_by_type), 1)

    # 누적비율 추가 (파레토)
    cum = 0
    for d in defect_by_type:
        cum += d["defect_qty"]
        d["cumulative_rate"] = round(cum / total_defect_qty * 100, 1) if total_defect_qty else 0
        d["share_pct"] = round(d["defect_qty"] / total_defect_qty * 100, 1) if total_defect_qty else 0

    # 품번별 로스비용 TOP5
    part_loss: dict = {}
    for r in defect_rows:
        pn = r.part_no
        if pn not in part_loss:
            part_loss[pn] = {"part_no": pn, "part_name": r.part_name, "defect_qty": 0, "loss_cost": 0}
        part_loss[pn]["defect_qty"] += r.defect_qty
        part_loss[pn]["loss_cost"]  += r.defect_qty * (r.unit_price or 0)
    top_parts = sorted(part_loss.values(), key=lambda x: x["loss_cost"], reverse=True)[:5]

    # ── 2. 입고검사 불합격 분석 ──────────────────────────────────
    fail_inspections = db.query(Inspection).filter(
        Inspection.inspect_date >= first_day,
        Inspection.inspect_date <= last_day,
        Inspection.result == "불합격",
    ).all()

    fail_partner_map: dict = {}
    for insp in fail_inspections:
        receipt = insp.receipt
        pid = receipt.partner_id if receipt else "미지정"
        try:
            partner = db.query(Partner).filter(Partner.partner_id == pid).first()
            pname = partner.name if partner else pid
        except Exception:
            pname = pid
        if pid not in fail_partner_map:
            fail_partner_map[pid] = {"partner_id": pid, "partner_name": pname,
                                      "fail_count": 0, "total_fail_qty": 0, "defect_notes": []}
        fail_partner_map[pid]["fail_count"] += 1
        fail_partner_map[pid]["total_fail_qty"] += insp.fail_qty or 0
        if insp.defect_note:
            fail_partner_map[pid]["defect_notes"].append(insp.defect_note)

    # 전체 입고검사 현황
    all_inspections = db.query(Inspection).filter(
        Inspection.inspect_date >= first_day,
        Inspection.inspect_date <= last_day,
    ).all()
    total_inspect_cnt = len(all_inspections)
    fail_inspect_cnt  = len(fail_inspections)
    pass_inspect_cnt  = sum(1 for i in all_inspections if str(i.result) in ('합격', 'pass_'))
    incoming_pass_rate = round(pass_inspect_cnt / total_inspect_cnt * 100, 1) if total_inspect_cnt else None

    fail_by_partner = sorted(fail_partner_map.values(), key=lambda x: x["fail_count"], reverse=True)

    # ── 3. 클레임 현황 (고객 실패비용) ───────────────────────────
    claims = db.query(QualityClaim).filter(
        extract("year",  QualityClaim.occur_date) == year,
        extract("month", QualityClaim.occur_date) == month,
    ).all()

    claim_by_customer: dict = {}
    for c in claims:
        pid = c.partner_id or "미지정"
        try:
            partner = db.query(Partner).filter(Partner.partner_id == pid).first()
            pname = partner.name if partner else pid
        except Exception:
            pname = pid
        if pid not in claim_by_customer:
            claim_by_customer[pid] = {"partner_id": pid, "partner_name": pname,
                                       "count": 0, "status_map": {}}
        claim_by_customer[pid]["count"] += 1
        st = c.status or "미분류"
        claim_by_customer[pid]["status_map"][st] = claim_by_customer[pid]["status_map"].get(st, 0) + 1

    claim_status_total: dict = {}
    for c in claims:
        st = c.status or "미분류"
        claim_status_total[st] = claim_status_total.get(st, 0) + 1

    # ── 4. ERP 자동진단 (워스트/베스트) ──────────────────────────
    auto_insights = []

    # 워스트 불량유형
    if defect_by_type:
        worst = defect_by_type[0]
        auto_insights.append({
            "level": "critical" if worst["share_pct"] >= 40 else "warn",
            "category": "공정불량",
            "title": f"최다 불량유형: {worst['defect_type']}",
            "detail": f"불량수량 {worst['defect_qty']:,}개 ({worst['share_pct']}%) / 로스비용 {worst['loss_cost']:,}원",
            "suggestion": f"'{worst['defect_type']}' 불량 원인 집중 분석 및 작업표준 재검토 필요",
        })

    # 로스비용 경보
    if total_loss_cost >= 1_000_000:
        auto_insights.append({
            "level": "critical",
            "category": "로스비용",
            "title": f"공정불량 로스비용 {total_loss_cost:,}원",
            "detail": f"총 {total_defect_qty:,}개 불량 발생",
            "suggestion": "월 로스비용 목표 대비 초과 — 차월 개선목표 수립 필요",
        })

    # 입고검사 불합격 협력사
    if fail_by_partner:
        worst_supplier = fail_by_partner[0]
        auto_insights.append({
            "level": "warn",
            "category": "입고검사",
            "title": f"입고불합격 최다: {worst_supplier['partner_name']}",
            "detail": f"불합격 {worst_supplier['fail_count']}건 / 불합격수량 {worst_supplier['total_fail_qty']:,}개",
            "suggestion": f"{worst_supplier['partner_name']} 협력사 긴급 품질개선 요청 발송 필요",
        })

    # 클레임 경보
    if len(claims) > 0:
        open_claims = sum(1 for c in claims if c.status not in ('완료', '종결'))
        auto_insights.append({
            "level": "critical" if open_claims > 0 else "info",
            "category": "클레임",
            "title": f"고객 클레임 {len(claims)}건 발생",
            "detail": f"처리중 {open_claims}건 / 완료 {len(claims)-open_claims}건",
            "suggestion": "8D 보고서 작성 및 고객 실패비용 집계 필요",
        })

    # 합격률 경보
    if incoming_pass_rate is not None and incoming_pass_rate < 95:
        auto_insights.append({
            "level": "warn",
            "category": "수입검사",
            "title": f"입고검사 합격률 {incoming_pass_rate}% (목표: 95% 이상)",
            "detail": f"전체 {total_inspect_cnt}건 중 불합격 {fail_inspect_cnt}건",
            "suggestion": "협력사 품질개선 요청 및 수입검사 강화 조치 필요",
        })

    # ── 5. PPM 지수 계산 ─────────────────────────────────────────────
    try:
        from app.models.sales import ShipmentStatus
        total_ship_qty = int(db.query(func.sum(Shipment.qty)).filter(
            Shipment.ship_date >= first_day,
            Shipment.ship_date <= last_day,
            Shipment.status == ShipmentStatus.confirmed,
        ).scalar() or 0)

        outgoing_defect_qty = sum(
            d["defect_qty"] for d in defect_by_type
            if d.get("inspect_type") in ("출하", "출하검사", "P5-출하")
        )
        outgoing_ppm = round(float(outgoing_defect_qty) / total_ship_qty * 1_000_000, 0) if total_ship_qty > 0 else None

        process_defect_qty = sum(
            d["defect_qty"] for d in defect_by_type
            if d.get("inspect_type") not in ("출하", "출하검사", "P5-출하")
        )
        claim_ppm = round(float(len(claims)) / total_ship_qty * 1_000_000 * 1000, 0) if total_ship_qty > 0 else None

        ppm_data = {
            "total_ship_qty": total_ship_qty,
            "outgoing_defect_qty": outgoing_defect_qty,
            "outgoing_ppm": outgoing_ppm,
            "process_defect_qty": process_defect_qty,
            "claim_count": len(claims),
            "claim_ppm": claim_ppm,
            "ppm_target": 100,
        }
    except Exception:
        ppm_data = {
            "total_ship_qty": 0,
            "outgoing_defect_qty": 0,
            "outgoing_ppm": None,
            "process_defect_qty": 0,
            "claim_count": len(claims),
            "claim_ppm": None,
            "ppm_target": 100,
        }

    # ── 6. 3개월 불량률 추이 ─────────────────────────────────────────
    trend_months = []
    try:
        from app.models.sales import ShipmentStatus as _SS
        for delta in range(2, -1, -1):
            tm = month - delta
            ty = year
            if tm <= 0:
                tm += 12
                ty -= 1
            t_first = date(ty, tm, 1)
            t_last  = date(ty, tm, _calendar.monthrange(ty, tm)[1])

            t_defects = int(db.query(func.sum(ProcessOutgoingDefect.defect_qty)).filter(
                ProcessOutgoingDefect.defect_date >= t_first,
                ProcessOutgoingDefect.defect_date <= t_last,
            ).scalar() or 0)
            t_ship = int(db.query(func.sum(Shipment.qty)).filter(
                Shipment.ship_date >= t_first,
                Shipment.ship_date <= t_last,
                Shipment.status == _SS.confirmed,
            ).scalar() or 0)
            t_claims = int(db.query(func.count(QualityClaim.id)).filter(
                extract("year",  QualityClaim.occur_date) == ty,
                extract("month", QualityClaim.occur_date) == tm,
            ).scalar() or 0)
            t_fail_insp = int(db.query(func.count(Inspection.id)).filter(
                Inspection.inspect_date >= t_first,
                Inspection.inspect_date <= t_last,
                Inspection.result == "불합격",
            ).scalar() or 0)

            trend_months.append({
                "year": ty, "month": tm,
                "label": f"{ty}년 {tm}월",
                "defect_qty": t_defects,
                "ship_qty": t_ship,
                "defect_rate_pct": round(float(t_defects) / t_ship * 100, 3) if t_ship > 0 else 0,
                "ppm": round(float(t_defects) / t_ship * 1_000_000, 0) if t_ship > 0 else 0,
                "claim_count": t_claims,
                "fail_inspection": t_fail_insp,
            })
    except Exception:
        pass

    return {
        "year": year,
        "month": month,
        # 1. 공정/출하 불량
        "defect_summary": {
            "total_defect_qty": total_defect_qty,
            "total_loss_cost": total_loss_cost,
            "total_labor_loss_min": total_labor_loss_min,
            "by_type": defect_by_type,
            "top_parts": top_parts,
        },
        # 2. 입고검사
        "incoming_inspection": {
            "total_count": total_inspect_cnt,
            "pass_count": pass_inspect_cnt,
            "fail_count": fail_inspect_cnt,
            "pass_rate": incoming_pass_rate,
            "fail_by_partner": fail_by_partner,
        },
        # 3. 클레임
        "claims": {
            "total": len(claims),
            "by_status": claim_status_total,
            "by_customer": sorted(claim_by_customer.values(), key=lambda x: x["count"], reverse=True),
        },
        # 4. 자동진단
        "auto_insights": auto_insights,
        # 5. PPM 지수
        "ppm_data": ppm_data,
        # 6. 3개월 추이
        "trend": trend_months,
    }
