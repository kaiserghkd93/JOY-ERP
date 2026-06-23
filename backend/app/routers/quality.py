from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from app.database import get_db
from app.models.quality import Inspection, QualityClaim
from app.schemas.quality import (
    InspectionCreate, InspectionOut,
    ClaimCreate, ClaimUpdate, ClaimOut, DefectRateOut,
)
from app.services.quality_service import (
    register_inspection, get_defect_rate, create_claim, update_claim
)

router = APIRouter(prefix="/quality", tags=["품질"])


@router.post("/inspections", response_model=InspectionOut)
def post_inspection(body: InspectionCreate, db: Session = Depends(get_db)):
    insp = register_inspection(db, **body.model_dump())
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
