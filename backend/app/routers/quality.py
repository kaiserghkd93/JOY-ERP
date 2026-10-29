from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime
from pydantic import BaseModel
from app.database import get_db
from app.models.quality import Inspection, QualityClaim, ApprovalStatus, InspectionStandard, InspectionItem, StandardStatus
from app.models.auth import User
from app.schemas.quality import (
    InspectionCreate, InspectionOut,
    ClaimCreate, ClaimUpdate, ClaimOut, DefectRateOut,
    StandardCreate, StandardOut, SamplingPlanOut,
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
    if insp.inspector_id == user.username:
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
    if insp.inspector_id == user.username:
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
