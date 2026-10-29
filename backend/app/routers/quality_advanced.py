"""IATF 16949 / VDA 6.3 고도화 품질 API"""
import math, statistics
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.auth import User
from app.models.master import Item
from app.routers.auth import get_current_user
from app.services.doc_no import next_doc_no
from app.models.quality_advanced import (
    SpcChart, SpcMeasurement,
    ControlPlan, ControlPlanItem, CpStatus, CharType,
    Pfmea, PfmeaItem, PfmeaStatus,
    Instrument, CalibrationRecord, InstrumentStatus,
    AuditPlan, AuditFinding, AuditStatus, FindingType, FindingStatus,
    Ppap, PpapElement, PpapStatus, ElementStatus, PPAP_ELEMENTS,
    MsaStudy, MsaMeasurement, MsaType,
)

router = APIRouter(prefix="/quality-adv", tags=["품질고도화"])


# ═══════════════════════════════════════════════════════════════════
# SPC
# ═══════════════════════════════════════════════════════════════════

class SpcChartIn(BaseModel):
    part_no: str
    characteristic: str
    unit: Optional[str] = None
    usl: Optional[float] = None
    lsl: Optional[float] = None
    subgroup_size: int = 5
    note: Optional[str] = None


class SpcMeasIn(BaseModel):
    measured_at: datetime
    measured_by: Optional[str] = None
    values: list[float]
    note: Optional[str] = None


@router.get("/spc/charts")
def list_spc_charts(part_no: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(SpcChart).filter(SpcChart.is_active == True)
    if part_no:
        q = q.filter(SpcChart.part_no == part_no)
    charts = q.all()
    result = []
    for c in charts:
        item = db.get(Item, c.part_no)
        result.append({
            "id": c.id, "part_no": c.part_no,
            "part_name": item.name if item else None,
            "characteristic": c.characteristic, "unit": c.unit,
            "usl": float(c.usl) if c.usl else None,
            "lsl": float(c.lsl) if c.lsl else None,
            "ucl": float(c.ucl) if c.ucl else None,
            "lcl": float(c.lcl) if c.lcl else None,
            "cl": float(c.cl) if c.cl else None,
            "subgroup_size": c.subgroup_size, "note": c.note,
        })
    return result


@router.post("/spc/charts")
def create_spc_chart(body: SpcChartIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chart = SpcChart(**body.model_dump())
    db.add(chart); db.commit(); db.refresh(chart)
    return {"id": chart.id}


@router.post("/spc/charts/{chart_id}/measurements")
def add_measurement(chart_id: int, body: SpcMeasIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chart = db.get(SpcChart, chart_id)
    if not chart:
        raise HTTPException(404)
    vals = body.values
    xbar = statistics.mean(vals) if vals else 0
    r_val = max(vals) - min(vals) if len(vals) > 1 else 0
    m = SpcMeasurement(
        chart_id=chart_id,
        measured_at=body.measured_at,
        measured_by=body.measured_by or user.name,
        values=vals,
        xbar=xbar, r_val=r_val, note=body.note,
    )
    db.add(m); db.commit(); db.refresh(m)
    return {"id": m.id, "xbar": xbar, "r": r_val}


@router.get("/spc/charts/{chart_id}/measurements")
def get_measurements(chart_id: int, limit: int = 50, db: Session = Depends(get_db)):
    rows = db.query(SpcMeasurement).filter(SpcMeasurement.chart_id == chart_id)\
             .order_by(SpcMeasurement.measured_at.desc()).limit(limit).all()
    return [{"id": r.id, "measured_at": r.measured_at, "measured_by": r.measured_by,
             "values": r.values, "xbar": float(r.xbar or 0), "r": float(r.r_val or 0),
             "note": r.note} for r in reversed(rows)]


@router.get("/spc/charts/{chart_id}/analysis")
def spc_analysis(chart_id: int, db: Session = Depends(get_db)):
    chart = db.get(SpcChart, chart_id)
    if not chart:
        raise HTTPException(404)
    rows = db.query(SpcMeasurement).filter(SpcMeasurement.chart_id == chart_id)\
             .order_by(SpcMeasurement.measured_at).all()
    all_vals = [v for r in rows for v in r.values]
    if len(all_vals) < 2:
        return {"error": "데이터 부족 (최소 2개 소그룹 필요)"}
    mean_val = statistics.mean(all_vals)
    std_val = statistics.stdev(all_vals)
    cp = cpk = None
    if chart.usl and chart.lsl and std_val > 0:
        cp = (float(chart.usl) - float(chart.lsl)) / (6 * std_val)
        cpu = (float(chart.usl) - mean_val) / (3 * std_val)
        cpl = (mean_val - float(chart.lsl)) / (3 * std_val)
        cpk = min(cpu, cpl)
    return {
        "chart_id": chart_id, "n": len(all_vals),
        "mean": round(mean_val, 6), "std": round(std_val, 6),
        "cp": round(cp, 4) if cp else None,
        "cpk": round(cpk, 4) if cpk else None,
        "cp_result": ("합격" if cp >= 1.33 else "주의" if cp >= 1.0 else "불합격") if cp else None,
        "cpk_result": ("합격" if cpk >= 1.33 else "주의" if cpk >= 1.0 else "불합격") if cpk else None,
    }


# ═══════════════════════════════════════════════════════════════════
# 관리계획서 (Control Plan)
# ═══════════════════════════════════════════════════════════════════

class CpIn(BaseModel):
    part_no: str
    customer: Optional[str] = None
    revision: str = "A"
    plan_type: str = "양산"
    effective_date: Optional[date] = None
    note: Optional[str] = None


class CpItemIn(BaseModel):
    process_no: Optional[str] = None
    process_name: str
    operation: Optional[str] = None
    machine: Optional[str] = None
    characteristic_name: str
    char_type: str = "일반"
    spec_nominal: Optional[float] = None
    spec_upper: Optional[float] = None
    spec_lower: Optional[float] = None
    unit: Optional[str] = None
    sample_size: Optional[str] = None
    sample_freq: Optional[str] = None
    control_method: Optional[str] = None
    reaction_plan: Optional[str] = None
    sort_order: int = 0


def _cp_out(cp: ControlPlan, db: Session, include_items: bool = False) -> dict:
    item = db.get(Item, cp.part_no)
    d = {
        "id": cp.id, "cp_no": cp.cp_no, "part_no": cp.part_no,
        "part_name": item.name if item else None,
        "customer": cp.customer, "revision": cp.revision,
        "plan_type": cp.plan_type, "status": cp.status,
        "approved_by": cp.approved_by, "effective_date": cp.effective_date,
        "created_by": cp.created_by, "created_at": cp.created_at,
    }
    if include_items:
        rows = db.query(ControlPlanItem).filter(ControlPlanItem.cp_id == cp.id)\
                 .order_by(ControlPlanItem.sort_order).all()
        d["items"] = [{"id": r.id, "process_no": r.process_no, "process_name": r.process_name,
            "operation": r.operation, "machine": r.machine,
            "characteristic_name": r.characteristic_name, "char_type": r.char_type,
            "spec_nominal": float(r.spec_nominal) if r.spec_nominal else None,
            "spec_upper": float(r.spec_upper) if r.spec_upper else None,
            "spec_lower": float(r.spec_lower) if r.spec_lower else None,
            "unit": r.unit, "sample_size": r.sample_size, "sample_freq": r.sample_freq,
            "control_method": r.control_method, "reaction_plan": r.reaction_plan,
            "sort_order": r.sort_order} for r in rows]
    return d


@router.get("/control-plan")
def list_control_plans(part_no: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(ControlPlan)
    if part_no:
        q = q.filter(ControlPlan.part_no == part_no)
    return [_cp_out(c, db) for c in q.order_by(ControlPlan.created_at.desc()).all()]


@router.post("/control-plan")
def create_control_plan(body: CpIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cp_no = next_doc_no(db, "CP", "control_plan", "cp_no")
    cp = ControlPlan(**body.model_dump(), cp_no=cp_no, created_by=user.name)
    db.add(cp); db.commit(); db.refresh(cp)
    return _cp_out(cp, db, include_items=True)


@router.get("/control-plan/{cp_id}")
def get_control_plan(cp_id: int, db: Session = Depends(get_db)):
    cp = db.get(ControlPlan, cp_id)
    if not cp: raise HTTPException(404)
    return _cp_out(cp, db, include_items=True)


@router.post("/control-plan/{cp_id}/items")
def add_cp_item(cp_id: int, body: CpItemIn, db: Session = Depends(get_db)):
    cp = db.get(ControlPlan, cp_id)
    if not cp: raise HTTPException(404)
    row = ControlPlanItem(cp_id=cp_id, **body.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return {"id": row.id}


@router.put("/control-plan/items/{item_id}")
def update_cp_item(item_id: int, body: CpItemIn, db: Session = Depends(get_db)):
    row = db.get(ControlPlanItem, item_id)
    if not row: raise HTTPException(404)
    for k, v in body.model_dump().items(): setattr(row, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/control-plan/items/{item_id}")
def delete_cp_item(item_id: int, db: Session = Depends(get_db)):
    row = db.get(ControlPlanItem, item_id)
    if not row: raise HTTPException(404)
    db.delete(row); db.commit()
    return {"ok": True}


@router.delete("/control-plan/{cp_id}")
def delete_control_plan(cp_id: int, db: Session = Depends(get_db)):
    cp = db.get(ControlPlan, cp_id)
    if not cp: raise HTTPException(404)
    # 하위 항목 먼저 삭제
    db.query(ControlPlanItem).filter(ControlPlanItem.cp_id == cp_id).delete()
    db.delete(cp); db.commit()
    return {"ok": True}


@router.patch("/control-plan/{cp_id}/approve")
def approve_control_plan(cp_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cp = db.get(ControlPlan, cp_id)
    if not cp: raise HTTPException(404)
    cp.status = CpStatus.approved
    cp.approved_by = user.name
    cp.approved_at = datetime.now()
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════
# PFMEA
# ═══════════════════════════════════════════════════════════════════

class PfmeaIn(BaseModel):
    part_no: str
    revision: str = "A"


class PfmeaItemIn(BaseModel):
    process_step: str
    function: Optional[str] = None
    failure_mode: str
    failure_effect: Optional[str] = None
    severity: int = 5
    failure_cause: Optional[str] = None
    occurrence: int = 5
    current_control: Optional[str] = None
    detection: int = 5
    action_required: Optional[str] = None
    responsible: Optional[str] = None
    target_date: Optional[date] = None
    action_taken: Optional[str] = None
    new_severity: Optional[int] = None
    new_occurrence: Optional[int] = None
    new_detection: Optional[int] = None
    sort_order: int = 0


def _pfmea_item_out(r: PfmeaItem) -> dict:
    new_rpn = None
    if r.new_severity and r.new_occurrence and r.new_detection:
        new_rpn = r.new_severity * r.new_occurrence * r.new_detection
    return {
        "id": r.id, "process_step": r.process_step, "function": r.function,
        "failure_mode": r.failure_mode, "failure_effect": r.failure_effect,
        "severity": r.severity, "failure_cause": r.failure_cause,
        "occurrence": r.occurrence, "current_control": r.current_control,
        "detection": r.detection, "rpn": r.severity * r.occurrence * r.detection,
        "action_required": r.action_required, "responsible": r.responsible,
        "target_date": r.target_date, "action_taken": r.action_taken,
        "new_severity": r.new_severity, "new_occurrence": r.new_occurrence,
        "new_detection": r.new_detection, "new_rpn": new_rpn,
        "sort_order": r.sort_order,
    }


@router.get("/pfmea")
def list_pfmea(part_no: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Pfmea)
    if part_no: q = q.filter(Pfmea.part_no == part_no)
    result = []
    for p in q.order_by(Pfmea.created_at.desc()).all():
        item = db.get(Item, p.part_no)
        result.append({"id": p.id, "pfmea_no": p.pfmea_no, "part_no": p.part_no,
            "part_name": item.name if item else None, "revision": p.revision,
            "status": p.status, "created_by": p.created_by, "created_at": p.created_at})
    return result


@router.post("/pfmea")
def create_pfmea(body: PfmeaIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    no = next_doc_no(db, "PFMEA", "pfmea", "pfmea_no")
    p = Pfmea(**body.model_dump(), pfmea_no=no, created_by=user.name)
    db.add(p); db.commit(); db.refresh(p)
    return {"id": p.id, "pfmea_no": p.pfmea_no}


@router.get("/pfmea/{pfmea_id}")
def get_pfmea(pfmea_id: int, db: Session = Depends(get_db)):
    p = db.get(Pfmea, pfmea_id)
    if not p: raise HTTPException(404)
    item = db.get(Item, p.part_no)
    rows = db.query(PfmeaItem).filter(PfmeaItem.pfmea_id == pfmea_id)\
             .order_by(PfmeaItem.sort_order).all()
    return {"id": p.id, "pfmea_no": p.pfmea_no, "part_no": p.part_no,
        "part_name": item.name if item else None,
        "revision": p.revision, "status": p.status,
        "items": [_pfmea_item_out(r) for r in rows]}


@router.post("/pfmea/{pfmea_id}/items")
def add_pfmea_item(pfmea_id: int, body: PfmeaItemIn, db: Session = Depends(get_db)):
    p = db.get(Pfmea, pfmea_id)
    if not p: raise HTTPException(404)
    d = body.model_dump()
    d["rpn"] = d["severity"] * d["occurrence"] * d["detection"]
    if d.get("new_severity") and d.get("new_occurrence") and d.get("new_detection"):
        d["new_rpn"] = d["new_severity"] * d["new_occurrence"] * d["new_detection"]
    row = PfmeaItem(pfmea_id=pfmea_id, **d)
    db.add(row); db.commit(); db.refresh(row)
    return _pfmea_item_out(row)


@router.put("/pfmea/items/{item_id}")
def update_pfmea_item(item_id: int, body: PfmeaItemIn, db: Session = Depends(get_db)):
    row = db.get(PfmeaItem, item_id)
    if not row: raise HTTPException(404)
    d = body.model_dump()
    d["rpn"] = d["severity"] * d["occurrence"] * d["detection"]
    if d.get("new_severity") and d.get("new_occurrence") and d.get("new_detection"):
        d["new_rpn"] = d["new_severity"] * d["new_occurrence"] * d["new_detection"]
    for k, v in d.items(): setattr(row, k, v)
    db.commit()
    return _pfmea_item_out(row)


@router.delete("/pfmea/items/{item_id}")
def delete_pfmea_item(item_id: int, db: Session = Depends(get_db)):
    row = db.get(PfmeaItem, item_id)
    if not row: raise HTTPException(404)
    db.delete(row); db.commit()
    return {"ok": True}


@router.delete("/pfmea/{pfmea_id}")
def delete_pfmea(pfmea_id: int, db: Session = Depends(get_db)):
    pf = db.get(Pfmea, pfmea_id)
    if not pf: raise HTTPException(404)
    db.query(PfmeaItem).filter(PfmeaItem.pfmea_id == pfmea_id).delete()
    db.delete(pf); db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════
# 교정 관리 (Calibration)
# ═══════════════════════════════════════════════════════════════════

class InstrumentIn(BaseModel):
    instrument_no: Optional[str] = None
    name: str
    instrument_type: Optional[str] = None
    manufacturer: Optional[str] = None
    model_no: Optional[str] = None
    serial_no: Optional[str] = None
    location: Optional[str] = None
    calibration_interval: int = 365
    last_calibrated: Optional[date] = None
    accuracy_spec: Optional[str] = None
    note: Optional[str] = None


class CalibIn(BaseModel):
    calibrated_at: date
    calibrated_by: Optional[str] = None
    agency: Optional[str] = None
    result: str = "합격"
    certificate_no: Optional[str] = None
    note: Optional[str] = None


def _update_instrument_status(inst: Instrument):
    if not inst.next_due:
        return
    today = date.today()
    days_left = (inst.next_due - today).days
    if days_left < 0:
        inst.status = InstrumentStatus.overdue
    elif days_left <= 30:
        inst.status = InstrumentStatus.due_soon
    else:
        inst.status = InstrumentStatus.active


def _inst_out(inst: Instrument) -> dict:
    return {
        "id": inst.id, "instrument_no": inst.instrument_no, "name": inst.name,
        "instrument_type": inst.instrument_type, "manufacturer": inst.manufacturer,
        "model_no": inst.model_no, "serial_no": inst.serial_no,
        "location": inst.location, "calibration_interval": inst.calibration_interval,
        "last_calibrated": inst.last_calibrated, "next_due": inst.next_due,
        "status": inst.status, "accuracy_spec": inst.accuracy_spec, "note": inst.note,
    }


@router.get("/instruments")
def list_instruments(db: Session = Depends(get_db)):
    insts = db.query(Instrument).filter(Instrument.status != InstrumentStatus.obsolete).all()
    for inst in insts:
        _update_instrument_status(inst)
    db.commit()
    return [_inst_out(i) for i in insts]


@router.post("/instruments")
def create_instrument(body: InstrumentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = body.model_dump()
    if not data.get("instrument_no"):
        data["instrument_no"] = next_doc_no(db, "EQP", "instrument", "instrument_no")
    if data.get("last_calibrated") and data.get("calibration_interval"):
        data["next_due"] = data["last_calibrated"] + timedelta(days=data["calibration_interval"])
    inst = Instrument(**data)
    _update_instrument_status(inst)
    db.add(inst); db.commit(); db.refresh(inst)
    return _inst_out(inst)


@router.patch("/instruments/{inst_id}")
def update_instrument(inst_id: int, body: InstrumentIn, db: Session = Depends(get_db)):
    inst = db.get(Instrument, inst_id)
    if not inst: raise HTTPException(404)
    data = body.model_dump(exclude_none=True)
    for k, v in data.items(): setattr(inst, k, v)
    if inst.last_calibrated and inst.calibration_interval:
        inst.next_due = inst.last_calibrated + timedelta(days=inst.calibration_interval)
    _update_instrument_status(inst)
    db.commit()
    return _inst_out(inst)


@router.post("/instruments/{inst_id}/calibrate")
def record_calibration(inst_id: int, body: CalibIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inst = db.get(Instrument, inst_id)
    if not inst: raise HTTPException(404)
    next_due = body.calibrated_at + timedelta(days=inst.calibration_interval)
    rec = CalibrationRecord(
        instrument_id=inst_id,
        calibrated_at=body.calibrated_at,
        calibrated_by=body.calibrated_by or user.name,
        agency=body.agency,
        result=body.result,
        certificate_no=body.certificate_no,
        next_due=next_due, note=body.note,
    )
    db.add(rec)
    inst.last_calibrated = body.calibrated_at
    inst.next_due = next_due
    _update_instrument_status(inst)
    db.commit()
    return {"ok": True, "next_due": next_due}


@router.get("/instruments/{inst_id}/history")
def get_calibration_history(inst_id: int, db: Session = Depends(get_db)):
    rows = db.query(CalibrationRecord).filter(CalibrationRecord.instrument_id == inst_id)\
             .order_by(CalibrationRecord.calibrated_at.desc()).all()
    return [{"id": r.id, "calibrated_at": r.calibrated_at, "calibrated_by": r.calibrated_by,
             "agency": r.agency, "result": r.result, "certificate_no": r.certificate_no,
             "next_due": r.next_due, "note": r.note} for r in rows]


@router.get("/instruments/summary")
def instruments_summary(db: Session = Depends(get_db)):
    insts = db.query(Instrument).filter(Instrument.status != InstrumentStatus.obsolete).all()
    for i in insts: _update_instrument_status(i)
    db.commit()
    return {
        "total": len(insts),
        "overdue": sum(1 for i in insts if i.status == InstrumentStatus.overdue),
        "due_soon": sum(1 for i in insts if i.status == InstrumentStatus.due_soon),
        "active": sum(1 for i in insts if i.status == InstrumentStatus.active),
    }


# ═══════════════════════════════════════════════════════════════════
# 내부감사 (Internal Audit)
# ═══════════════════════════════════════════════════════════════════

class AuditPlanIn(BaseModel):
    audit_type: str = "내부감사"
    standard: str = "IATF16949"
    scope: Optional[str] = None
    audit_date: date
    auditor: str
    auditee_dept: Optional[str] = None
    note: Optional[str] = None


class FindingIn(BaseModel):
    clause_no: Optional[str] = None
    clause_title: Optional[str] = None
    finding_type: str = "경미부적합"
    description: str
    evidence: Optional[str] = None
    due_date: Optional[date] = None


class FindingUpdateIn(BaseModel):
    root_cause: Optional[str] = None
    corrective_action: Optional[str] = None
    responsible: Optional[str] = None
    completion_date: Optional[date] = None
    effectiveness_result: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[date] = None
    status: Optional[str] = None


def _finding_out(f: AuditFinding) -> dict:
    return {
        "id": f.id, "audit_id": f.audit_id,
        "clause_no": f.clause_no, "clause_title": f.clause_title,
        "finding_type": f.finding_type, "description": f.description,
        "evidence": f.evidence, "status": f.status, "due_date": f.due_date,
        "root_cause": f.root_cause, "corrective_action": f.corrective_action,
        "responsible": f.responsible, "completion_date": f.completion_date,
        "effectiveness_result": f.effectiveness_result,
        "verified_by": f.verified_by, "verified_at": f.verified_at,
        "created_at": f.created_at,
    }


@router.get("/audits")
def list_audits(db: Session = Depends(get_db)):
    audits = db.query(AuditPlan).order_by(AuditPlan.audit_date.desc()).all()
    result = []
    for a in audits:
        findings = db.query(AuditFinding).filter(AuditFinding.audit_id == a.id).all()
        open_cnt = sum(1 for f in findings if f.status in (FindingStatus.open, FindingStatus.in_progress))
        result.append({
            "id": a.id, "audit_no": a.audit_no, "audit_type": a.audit_type,
            "standard": a.standard, "scope": a.scope, "audit_date": a.audit_date,
            "auditor": a.auditor, "auditee_dept": a.auditee_dept, "status": a.status,
            "finding_count": len(findings), "open_count": open_cnt,
        })
    return result


@router.post("/audits")
def create_audit(body: AuditPlanIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    no = next_doc_no(db, "AUD", "audit_plan", "audit_no")
    a = AuditPlan(**body.model_dump(), audit_no=no)
    db.add(a); db.commit(); db.refresh(a)
    return {"id": a.id, "audit_no": a.audit_no}


@router.get("/audits/{audit_id}/findings")
def get_findings(audit_id: int, db: Session = Depends(get_db)):
    rows = db.query(AuditFinding).filter(AuditFinding.audit_id == audit_id)\
             .order_by(AuditFinding.created_at).all()
    return [_finding_out(f) for f in rows]


@router.post("/audits/{audit_id}/findings")
def add_finding(audit_id: int, body: FindingIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(AuditPlan, audit_id)
    if not a: raise HTTPException(404)
    f = AuditFinding(audit_id=audit_id, **body.model_dump())
    db.add(f); db.commit(); db.refresh(f)
    return _finding_out(f)


@router.patch("/findings/{finding_id}")
def update_finding(finding_id: int, body: FindingUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.get(AuditFinding, finding_id)
    if not f: raise HTTPException(404)
    for k, v in body.model_dump(exclude_none=True).items(): setattr(f, k, v)
    db.commit()
    return _finding_out(f)


@router.patch("/audits/{audit_id}/status")
def update_audit_status(audit_id: int, status: str, db: Session = Depends(get_db)):
    a = db.get(AuditPlan, audit_id)
    if not a: raise HTTPException(404)
    a.status = status
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════
# PPAP
# ═══════════════════════════════════════════════════════════════════

class PpapIn(BaseModel):
    part_no: str
    partner_id: Optional[str] = None
    customer: Optional[str] = None
    submission_level: int = 3
    reason: Optional[str] = None
    note: Optional[str] = None


def _ppap_out(p: Ppap, db: Session, include_elements: bool = False) -> dict:
    item = db.get(Item, p.part_no)
    d = {
        "id": p.id, "ppap_no": p.ppap_no, "part_no": p.part_no,
        "part_name": item.name if item else None,
        "partner_id": p.partner_id, "customer": p.customer,
        "submission_level": p.submission_level, "submission_date": p.submission_date,
        "status": p.status, "approved_by": p.approved_by, "approved_at": p.approved_at,
        "reason": p.reason, "created_by": p.created_by, "created_at": p.created_at,
    }
    if include_elements:
        elems = db.query(PpapElement).filter(PpapElement.ppap_id == p.id)\
                  .order_by(PpapElement.element_no).all()
        d["elements"] = [{"id": e.id, "element_no": e.element_no, "element_name": e.element_name,
            "status": e.status, "document_ref": e.document_ref, "note": e.note} for e in elems]
    return d


@router.get("/ppap")
def list_ppap(db: Session = Depends(get_db)):
    rows = db.query(Ppap).order_by(Ppap.created_at.desc()).all()
    return [_ppap_out(p, db) for p in rows]


@router.post("/ppap")
def create_ppap(body: PpapIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    no = next_doc_no(db, "PPAP", "ppap", "ppap_no")
    p = Ppap(**body.model_dump(), ppap_no=no, created_by=user.name)
    db.add(p); db.flush()
    for elem_no, elem_name in PPAP_ELEMENTS:
        db.add(PpapElement(ppap_id=p.id, element_no=elem_no, element_name=elem_name))
    db.commit(); db.refresh(p)
    return _ppap_out(p, db, include_elements=True)


@router.get("/ppap/{ppap_id}")
def get_ppap(ppap_id: int, db: Session = Depends(get_db)):
    p = db.get(Ppap, ppap_id)
    if not p: raise HTTPException(404)
    return _ppap_out(p, db, include_elements=True)


@router.patch("/ppap/elements/{elem_id}")
def update_ppap_element(elem_id: int, status: str, document_ref: Optional[str] = None,
                        note: Optional[str] = None, db: Session = Depends(get_db)):
    e = db.get(PpapElement, elem_id)
    if not e: raise HTTPException(404)
    e.status = status
    if document_ref is not None: e.document_ref = document_ref
    if note is not None: e.note = note
    db.commit()
    return {"ok": True}


@router.patch("/ppap/{ppap_id}/submit")
def submit_ppap(ppap_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.get(Ppap, ppap_id)
    if not p: raise HTTPException(404)
    p.status = PpapStatus.submitted
    p.submission_date = date.today()
    db.commit()
    return {"ok": True}


@router.patch("/ppap/{ppap_id}/approve")
def approve_ppap(ppap_id: int, approved: bool, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.get(Ppap, ppap_id)
    if not p: raise HTTPException(404)
    p.status = PpapStatus.approved if approved else PpapStatus.rejected
    p.approved_by = user.name
    p.approved_at = date.today()
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════
# MSA
# ═══════════════════════════════════════════════════════════════════

class MsaIn(BaseModel):
    part_no: Optional[str] = None
    characteristic: str
    instrument_id: Optional[int] = None
    study_type: str = "Gage R&R"
    appraiser_count: int = 3
    part_count: int = 10
    trial_count: int = 2
    tolerance: Optional[float] = None
    note: Optional[str] = None


class MsaMeasIn(BaseModel):
    appraiser: str
    part_seq: int
    trial: int
    value: float


def _calc_grr(study: MsaStudy, db: Session) -> dict:
    """ANOVA Gage R&R 계산 (단순화 버전)"""
    rows = db.query(MsaMeasurement).filter(MsaMeasurement.study_id == study.id).all()
    if not rows:
        return {}
    appraisers = sorted(set(r.appraiser for r in rows))
    parts = sorted(set(r.part_seq for r in rows))
    n_app = len(appraisers)
    n_parts = len(parts)
    n_trials = study.trial_count

    all_vals = [float(r.value) for r in rows]
    grand_mean = statistics.mean(all_vals)

    # Equipment variation (EV) = 재현성
    app_ranges = []
    for app in appraisers:
        for part in parts:
            vals = [float(r.value) for r in rows if r.appraiser == app and r.part_seq == part]
            if len(vals) >= 2:
                app_ranges.append(max(vals) - min(vals))
    Rbar = statistics.mean(app_ranges) if app_ranges else 0

    d2_map = {1:1.128,2:1.128,3:1.693,4:2.059,5:2.326,6:2.534,7:2.704,8:2.847,9:2.970,10:3.078}
    d2 = d2_map.get(n_trials, 1.693)
    sigma_equipment = Rbar / d2

    # Appraiser variation (AV) = 재현성 (측정자간)
    app_means = [statistics.mean([float(r.value) for r in rows if r.appraiser == app]) for app in appraisers]
    Xbar_diff = max(app_means) - min(app_means) if len(app_means) > 1 else 0
    d2_app = d2_map.get(n_app, 1.693)
    sigma_appraiser_raw = (Xbar_diff / d2_app) ** 2 - (sigma_equipment ** 2) / (n_parts * n_trials)
    sigma_appraiser = math.sqrt(max(0, sigma_appraiser_raw))

    sigma_rr = math.sqrt(sigma_equipment ** 2 + sigma_appraiser ** 2)

    # Part variation (PV)
    part_means = [statistics.mean([float(r.value) for r in rows if r.part_seq == p]) for p in parts]
    Rp = max(part_means) - min(part_means) if len(part_means) > 1 else 0
    d2_p = d2_map.get(n_parts, 2.970)
    sigma_part = Rp / d2_p

    sigma_total = math.sqrt(sigma_rr ** 2 + sigma_part ** 2)

    grr_pct = (sigma_rr / sigma_total * 100) if sigma_total > 0 else None
    ndc = int(1.41 * (sigma_part / sigma_rr)) if sigma_rr > 0 else None

    if study.tolerance:
        grr_pct_tol = (6 * sigma_rr / float(study.tolerance) * 100)
    else:
        grr_pct_tol = grr_pct

    result = "불합격" if (grr_pct or 0) > 30 else ("주의" if (grr_pct or 0) > 10 else "합격")

    return {
        "sigma_equipment": round(sigma_equipment, 6),
        "sigma_appraiser": round(sigma_appraiser, 6),
        "sigma_rr": round(sigma_rr, 6),
        "sigma_part": round(sigma_part, 6),
        "sigma_total": round(sigma_total, 6),
        "grr_pct": round(grr_pct, 2) if grr_pct else None,
        "grr_pct_tolerance": round(grr_pct_tol, 2) if grr_pct_tol else None,
        "ndc": ndc,
        "result": result,
    }


@router.get("/msa")
def list_msa(db: Session = Depends(get_db)):
    rows = db.query(MsaStudy).order_by(MsaStudy.created_at.desc()).all()
    result = []
    for s in rows:
        item = db.get(Item, s.part_no) if s.part_no else None
        meas_count = db.query(MsaMeasurement).filter(MsaMeasurement.study_id == s.id).count()
        result.append({"id": s.id, "study_no": s.study_no, "part_no": s.part_no,
            "part_name": item.name if item else None, "characteristic": s.characteristic,
            "study_type": s.study_type, "grr_pct": float(s.grr_pct) if s.grr_pct else None,
            "ndc": s.ndc, "result": s.result, "measurement_count": meas_count,
            "created_by": s.created_by, "created_at": s.created_at})
    return result


@router.post("/msa")
def create_msa(body: MsaIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    no = next_doc_no(db, "MSA", "msa_study", "study_no")
    s = MsaStudy(**body.model_dump(), study_no=no, created_by=user.name)
    db.add(s); db.commit(); db.refresh(s)
    return {"id": s.id, "study_no": s.study_no}


@router.post("/msa/{study_id}/measurements")
def add_msa_measurement(study_id: int, body: MsaMeasIn, db: Session = Depends(get_db)):
    s = db.get(MsaStudy, study_id)
    if not s: raise HTTPException(404)
    # upsert — 같은 측정자/부품/시도 있으면 update
    existing = db.query(MsaMeasurement).filter(
        MsaMeasurement.study_id == study_id,
        MsaMeasurement.appraiser == body.appraiser,
        MsaMeasurement.part_seq == body.part_seq,
        MsaMeasurement.trial == body.trial,
    ).first()
    if existing:
        existing.value = body.value
    else:
        db.add(MsaMeasurement(study_id=study_id, **body.model_dump()))
    db.commit()
    return {"ok": True}


@router.get("/msa/{study_id}")
def get_msa(study_id: int, db: Session = Depends(get_db)):
    s = db.get(MsaStudy, study_id)
    if not s: raise HTTPException(404)
    item = db.get(Item, s.part_no) if s.part_no else None
    meas = db.query(MsaMeasurement).filter(MsaMeasurement.study_id == study_id).all()
    return {
        "id": s.id, "study_no": s.study_no, "part_no": s.part_no,
        "part_name": item.name if item else None,
        "characteristic": s.characteristic, "study_type": s.study_type,
        "appraiser_count": s.appraiser_count, "part_count": s.part_count,
        "trial_count": s.trial_count, "tolerance": float(s.tolerance) if s.tolerance else None,
        "grr_pct": float(s.grr_pct) if s.grr_pct else None,
        "ndc": s.ndc, "result": s.result, "note": s.note,
        "measurements": [{"appraiser": m.appraiser, "part_seq": m.part_seq,
            "trial": m.trial, "value": float(m.value)} for m in meas],
    }


@router.post("/msa/{study_id}/calculate")
def calculate_msa(study_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.get(MsaStudy, study_id)
    if not s: raise HTTPException(404)
    if s.study_type != MsaType.grr:
        raise HTTPException(400, "Gage R&R 유형만 자동계산 지원됩니다.")
    calc = _calc_grr(s, db)
    if not calc:
        raise HTTPException(400, "측정값이 부족합니다.")
    s.grr_pct = calc["grr_pct"]
    s.ndc = calc["ndc"]
    s.result = calc["result"]
    db.commit()
    return calc
