from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime
from pydantic import BaseModel
from app.database import get_db
from app.models.quality import (
    Inspection, QualityClaim, ApprovalStatus,
    InspectionStandard, InspectionItem, StandardStatus,
    NonConformance, NcrAppeal, NcrStatus, AppealStatus,
    ProcessOutgoingDefect, InspectType,
)
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
MANAGER_ROLES = {"admin", "quality_manager"}


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
def post_claim(body: ClaimCreate, db: Session = Depends(get_db)):
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
def patch_claim(claim_no: str, body: ClaimUpdate, db: Session = Depends(get_db)):
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
    if insp.approval_status in (ApprovalStatus.approved, ApprovalStatus.confirmed):
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
    # admin/owner는 소규모 회사에서 겸직 허용
    if insp.inspector_id == user.username and user.role not in ("admin", "owner"):
        raise HTTPException(403, "본인이 등록한 검사결과는 직접 확정할 수 없습니다")
    insp.approval_status = ApprovalStatus.confirmed
    insp.confirmer_id = user.username
    insp.confirmed_at = datetime.now()
    db.commit()
    return {"ok": True, "status": insp.approval_status}


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
        "line_no": r.line_no,
        "cause": r.cause,
        "action_taken": r.action_taken,
        "registered_by": r.registered_by,
        "note": r.note,
        "created_at": str(r.created_at),
    }


@router.get("/quality/defect-reg")
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


@router.post("/quality/defect-reg", status_code=201)
def create_defect_reg(body: DefectRegCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models.quality import DefectSourceType
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


@router.get("/quality/defect-reg/monthly-summary")
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
            outsource_map[pid] = {"partner_id": pid, "partner_name": pname, "total_inspect": 0, "total_defect": 0, "items": []}
        g = outsource_map[pid]
        g["total_inspect"] += r.inspect_qty
        g["total_defect"] += r.defect_qty
        g["items"].append(_defect_row(r))

    for g in outsource_map.values():
        g["defect_rate"] = round(g["total_defect"] / g["total_inspect"] * 100, 2) if g["total_inspect"] else None

    return {
        "year": year,
        "month": month,
        "inhouse": {
            "total_inspect": sum(r.inspect_qty for r in inhouse),
            "total_defect": sum(r.defect_qty for r in inhouse),
            "items": [_defect_row(r) for r in inhouse],
        },
        "outsource": sorted(outsource_map.values(), key=lambda x: x["total_defect"], reverse=True),
    }


@router.delete("/quality/defect-reg/{row_id}", status_code=204)
def delete_defect_reg(row_id: int, db: Session = Depends(get_db)):
    row = db.get(ProcessOutgoingDefect, row_id)
    if not row:
        raise HTTPException(404, "not found")
    db.delete(row)
    db.commit()
