"""
MES 현장 라우터
- 호기(Machine) 마스터 관리
- 작업지시서 발행 + QR 데이터
- 작업자 세션 (시작/실적입력/비가동/완료)
- 현장 모니터 데이터
- 관리자 대시보드
- 작업자 KPI
"""
from datetime import datetime, date, timedelta, time as dt_time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from pydantic import BaseModel
from typing import Optional
import json

# ── 교대 설정 (주간 08:30~20:30 / 야간 20:30~08:30, 각 12시간) ──────────
SHIFT_DAY_START = dt_time(8, 30)
SHIFT_DAY_END   = dt_time(20, 30)
SHIFT_PLAN_MIN  = 720  # 12시간 = 720분

def get_shift(dt: Optional[datetime] = None) -> str:
    t = (dt or datetime.now()).time()
    if SHIFT_DAY_START <= t < SHIFT_DAY_END:
        return "주간"
    return "야간"

from app.database import get_db
from app.routers.auth import get_current_user
from app.models.auth import User
from app.models.mes_floor import (
    Machine, MesWorkOrder, WorkerSession, ProdLog, DowntimeLog,
    WOStatus, SessionStatus, DowntimeReason, MachineStatus, AndonCall,
)
from app.models.master import Item
from app.services.doc_no import next_doc_no

router = APIRouter(prefix="/mes-floor", tags=["MES현장"])


# ── 작업자 목록 (인증된 사용자라면 누구나 조회 가능) ──────────────────
@router.get("/worker-list")
def get_worker_list(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    from app.models.auth import User as AuthUser
    users = db.query(AuthUser).filter(AuthUser.is_active == True).order_by(AuthUser.name).all()
    return [{"username": u.username, "name": u.name, "role": u.role} for u in users]


# ── 호기 마스터 ───────────────────────────────────────────────────────

class MachineIn(BaseModel):
    machine_id: str
    name: str
    std_cycle_sec: float = 30.0
    cavity_count: int = 1
    note: Optional[str] = None


@router.get("/machines")
def list_machines(db: Session = Depends(get_db)):
    return db.query(Machine).order_by(Machine.machine_id).all()


@router.post("/machines")
def create_machine(body: MachineIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if db.get(Machine, body.machine_id):
        raise HTTPException(400, f"이미 존재하는 호기: {body.machine_id}")
    m = Machine(**body.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.patch("/machines/{machine_id}")
def update_machine(machine_id: str, body: MachineIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    m = db.get(Machine, machine_id)
    if not m:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude={"machine_id"}).items():
        setattr(m, k, v)
    db.commit()
    return m


@router.delete("/machines/{machine_id}")
def delete_machine(machine_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    m = db.get(Machine, machine_id)
    if not m:
        raise HTTPException(404)
    m.is_active = False
    db.commit()
    return {"ok": True}


# ── 작업지시서 ────────────────────────────────────────────────────────

class WOCreate(BaseModel):
    part_no: str
    machine_id: str
    mold_no: Optional[str] = None
    target_qty: int
    plan_date: date
    note: Optional[str] = None
    assigned_worker_id: Optional[str] = None


@router.post("/work-orders")
def create_wo(body: WOCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models.auth import User as AuthUser
    if not db.get(Item, body.part_no):
        raise HTTPException(404, f"품목 없음: {body.part_no}")
    if not db.get(Machine, body.machine_id):
        raise HTTPException(404, f"호기 없음: {body.machine_id}")
    if body.assigned_worker_id and not db.get(AuthUser, body.assigned_worker_id):
        raise HTTPException(404, f"작업자 없음: {body.assigned_worker_id}")

    wo_no = next_doc_no(db, "WO", body.plan_date)
    wo = MesWorkOrder(
        wo_no=wo_no,
        part_no=body.part_no,
        machine_id=body.machine_id,
        mold_no=body.mold_no,
        target_qty=body.target_qty,
        plan_date=body.plan_date,
        note=body.note,
        assigned_worker_id=body.assigned_worker_id,
        created_by=user.username,
    )
    db.add(wo)
    db.commit()
    db.refresh(wo)
    return _wo_with_qr(wo)


@router.get("/work-orders")
def list_wos(
    plan_date: Optional[date] = None,
    machine_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(MesWorkOrder)
    if plan_date:
        q = q.filter(MesWorkOrder.plan_date == plan_date)
    if machine_id:
        q = q.filter(MesWorkOrder.machine_id == machine_id)
    if status:
        q = q.filter(MesWorkOrder.status == status)
    rows = q.order_by(MesWorkOrder.plan_date.desc(), MesWorkOrder.wo_no).all()
    return [_wo_with_qr(r) for r in rows]


@router.get("/work-orders/{wo_no}")
def get_wo(wo_no: str, db: Session = Depends(get_db)):
    wo = db.get(MesWorkOrder, wo_no)
    if not wo:
        raise HTTPException(404)
    return _wo_with_qr(wo)


def _wo_with_qr(wo: MesWorkOrder) -> dict:
    """작업지시서 + QR 인코딩 데이터"""
    qr_data = json.dumps({
        "wo_no": wo.wo_no,
        "part_no": wo.part_no,
        "machine_id": wo.machine_id,
        "target_qty": wo.target_qty,
        "plan_date": str(wo.plan_date),
    }, ensure_ascii=False)

    good_qty = sum(s.good_qty for s in wo.sessions)
    defect_qty = sum(s.defect_qty for s in wo.sessions)

    return {
        "wo_no": wo.wo_no,
        "part_no": wo.part_no,
        "part_name": wo.item.name if wo.item else "",
        "machine_id": wo.machine_id,
        "machine_name": wo.machine.name if wo.machine else "",
        "mold_no": wo.mold_no,
        "target_qty": wo.target_qty,
        "good_qty": good_qty,
        "defect_qty": defect_qty,
        "plan_date": str(wo.plan_date),
        "status": wo.status,
        "note": wo.note,
        "assigned_worker_id": wo.assigned_worker_id,
        "qr_data": qr_data,
        "created_at": wo.created_at.isoformat() if wo.created_at else None,
    }


# ── 작업 세션 ─────────────────────────────────────────────────────────

class SessionStart(BaseModel):
    wo_no: str
    worker_id: str


@router.post("/sessions/start")
def start_session(body: SessionStart, db: Session = Depends(get_db)):
    """QR 스캔 → 작업 시작"""
    wo = db.get(MesWorkOrder, body.wo_no)
    if not wo:
        raise HTTPException(404, f"작업지시서 없음: {body.wo_no}")
    if wo.status == WOStatus.completed:
        raise HTTPException(400, "이미 완료된 작업지시서")
    if wo.status == WOStatus.cancelled:
        raise HTTPException(400, "취소된 작업지시서")

    # 같은 호기에서 진행중인 세션 있으면 종료
    prev = db.query(WorkerSession).filter(
        WorkerSession.machine_id == wo.machine_id,
        WorkerSession.status == SessionStatus.running,
    ).first()
    if prev:
        prev.status = SessionStatus.stopped
        prev.end_time = datetime.now()

    # 작업지시서 상태 진행으로
    wo.status = WOStatus.running

    session = WorkerSession(
        wo_no=body.wo_no,
        machine_id=wo.machine_id,
        worker_id=body.worker_id,
        shift=get_shift(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_detail(db, session)


class ProdInput(BaseModel):
    good_qty: int = 0
    defect_qty: int = 0
    defect_type: Optional[str] = None


@router.post("/sessions/{session_id}/log")
def add_prod_log(session_id: int, body: ProdInput, db: Session = Depends(get_db)):
    """실적 입력 (수량 추가)"""
    session = db.get(WorkerSession, session_id)
    if not session or session.status != SessionStatus.running:
        raise HTTPException(400, "진행중인 세션이 없습니다")

    entry = ProdLog(
        session_id=session_id,
        good_qty=body.good_qty,
        defect_qty=body.defect_qty,
        defect_type=body.defect_type,
    )
    db.add(entry)
    session.good_qty += body.good_qty
    session.defect_qty += body.defect_qty
    db.commit()
    return _session_detail(db, session)


class DowntimeStart(BaseModel):
    reason: str
    note: Optional[str] = None


@router.post("/sessions/{session_id}/downtime/start")
def start_downtime(session_id: int, body: DowntimeStart, db: Session = Depends(get_db)):
    """비가동 시작"""
    session = db.get(WorkerSession, session_id)
    if not session or session.status != SessionStatus.running:
        raise HTTPException(400, "진행중인 세션이 없습니다")

    # 이미 열린 비가동 있으면 종료
    open_dt = db.query(DowntimeLog).filter(
        DowntimeLog.session_id == session_id,
        DowntimeLog.end_time == None,
    ).first()
    if open_dt:
        open_dt.end_time = datetime.now()

    dt = DowntimeLog(session_id=session_id, reason=body.reason, note=body.note)
    db.add(dt)
    db.commit()
    return {"ok": True, "downtime_id": dt.id}


@router.post("/sessions/{session_id}/downtime/end")
def end_downtime(session_id: int, db: Session = Depends(get_db)):
    """비가동 종료"""
    dt = db.query(DowntimeLog).filter(
        DowntimeLog.session_id == session_id,
        DowntimeLog.end_time == None,
    ).first()
    if not dt:
        raise HTTPException(404, "진행중인 비가동 없음")
    dt.end_time = datetime.now()
    db.commit()
    return {"ok": True, "duration_min": round((dt.end_time - dt.start_time).total_seconds() / 60, 1)}


@router.post("/sessions/{session_id}/complete")
def complete_session(session_id: int, db: Session = Depends(get_db)):
    """작업 완료 → 재고 자동 반영"""
    session = db.get(WorkerSession, session_id)
    if not session or session.status != SessionStatus.running:
        raise HTTPException(400, "진행중인 세션이 없습니다")

    session.status = SessionStatus.completed
    session.end_time = datetime.now()

    wo = db.get(MesWorkOrder, session.wo_no)
    total_good = sum(s.good_qty for s in wo.sessions)
    if total_good >= wo.target_qty:
        wo.status = WOStatus.completed

    # 재고원장 반영 (완성품 입고)
    from app.services.ledger_service import post_ledger
    from app.models.ledger import LedgerType
    from app.models.master import Item
    item = db.get(Item, wo.part_no)
    avg_cost = float(item.avg_cost or item.std_buy_price or 0) if item else 0
    if session.good_qty > 0:
        post_ledger(
            db, wo.part_no, date.today(),
            LedgerType.receipt, session.good_qty, avg_cost,
            ref_type="MES", ref_no=session.wo_no,
            note=f"MES생산확정 {session.machine_id}",
        )

    db.commit()
    return _session_detail(db, session)


def _session_detail(db: Session, session: WorkerSession) -> dict:
    wo = db.get(MesWorkOrder, session.wo_no)
    machine = db.get(Machine, session.machine_id)

    # 경과 시간 (분)
    end = session.end_time or datetime.now()
    elapsed_min = (end - session.start_time).total_seconds() / 60

    # 비가동 시간 (분)
    downtime_min = sum(
        ((d.end_time or datetime.now()) - d.start_time).total_seconds() / 60
        for d in session.downtime_logs
    )

    # 가동 시간
    working_min = max(elapsed_min - downtime_min, 0)

    # 이론 생산량 — 품목 기준 CT/캐비티 우선, 없으면 호기 기준 fallback
    wo_item = wo.item if wo else None
    std_ct = float(wo_item.machine_ct_sec) if wo_item and wo_item.machine_ct_sec else (machine.std_cycle_sec if machine else 30)
    cavity = int(wo_item.cavity_count) if wo_item and wo_item.cavity_count else (machine.cavity_count if machine else 1)
    theory_qty = int(working_min * 60 / std_ct * cavity) if std_ct > 0 else 0

    # OEE 성능률
    performance = round(session.good_qty / theory_qty * 100, 1) if theory_qty > 0 else 0
    total_qty = session.good_qty + session.defect_qty
    quality_rate = round(session.good_qty / total_qty * 100, 1) if total_qty > 0 else 100
    avail_rate = round(working_min / elapsed_min * 100, 1) if elapsed_min > 0 else 100
    oee = round(avail_rate * performance * quality_rate / 10000, 1)

    # 목표 대비
    target = wo.target_qty if wo else 0
    achievement = round(session.good_qty / target * 100, 1) if target > 0 else 0

    # 현재 비가동 여부
    open_dt = next((d for d in session.downtime_logs if not d.end_time), None)

    return {
        "session_id": session.id,
        "wo_no": session.wo_no,
        "part_no": wo.part_no if wo else "",
        "part_name": wo.item.name if wo and wo.item else "",
        "machine_id": session.machine_id,
        "machine_name": machine.name if machine else "",
        "worker_id": session.worker_id,
        "status": session.status,
        "start_time": session.start_time.isoformat(),
        "end_time": session.end_time.isoformat() if session.end_time else None,
        "target_qty": target,
        "good_qty": session.good_qty,
        "defect_qty": session.defect_qty,
        "theory_qty": theory_qty,
        "achievement_pct": achievement,
        "elapsed_min": round(elapsed_min, 1),
        "working_min": round(working_min, 1),
        "downtime_min": round(downtime_min, 1),
        "oee": oee,
        "avail_rate": avail_rate,
        "performance": performance,
        "quality_rate": quality_rate,
        "is_down": open_dt is not None,
        "downtime_reason": open_dt.reason if open_dt else None,
        # 공수 (주야 2교대 각 12h=720분 기준)
        "shift": session.shift or get_shift(session.start_time),
        "man_hour_min": round(elapsed_min, 1),
        "plan_hour_min": SHIFT_PLAN_MIN,
        "man_hour_rate": round(min(elapsed_min / SHIFT_PLAN_MIN * 100, 100), 1),
    }


# ── 현장 모니터 API ──────────────────────────────────────────────────

@router.get("/floor/{machine_id}")
def floor_status(machine_id: str, db: Session = Depends(get_db)):
    """호기 모니터 화면용 실시간 데이터"""
    machine = db.get(Machine, machine_id)
    if not machine:
        raise HTTPException(404, f"호기 없음: {machine_id}")

    session = db.query(WorkerSession).filter(
        WorkerSession.machine_id == machine_id,
        WorkerSession.status == SessionStatus.running,
    ).first()

    if not session:
        return {
            "machine_id": machine_id,
            "machine_name": machine.name,
            "status": "대기",
            "session": None,
        }

    return {
        "machine_id": machine_id,
        "machine_name": machine.name,
        "status": "비가동" if _has_open_downtime(db, session.id) else "가동",
        "session": _session_detail(db, session),
    }


def _has_open_downtime(db: Session, session_id: int) -> bool:
    return db.query(DowntimeLog).filter(
        DowntimeLog.session_id == session_id,
        DowntimeLog.end_time == None,
    ).first() is not None


# ── 작업자 본인 세션 조회 ─────────────────────────────────────────────

@router.get("/my-session")
def my_session(worker_id: str, db: Session = Depends(get_db)):
    """작업자 ID로 현재 진행 중인 세션 조회 (작업자 화면용)"""
    session = db.query(WorkerSession).filter(
        WorkerSession.worker_id == worker_id,
        WorkerSession.status == SessionStatus.running,
    ).first()
    if not session:
        return None
    return _session_detail(db, session)


@router.get("/worker-kpi")
def worker_kpi(worker_id: str, kpi_date: Optional[date] = None, db: Session = Depends(get_db)):
    """작업자 일별 공수 KPI (주야 교대 집계)"""
    target = kpi_date or date.today()
    day_start = datetime.combine(target, dt_time(0, 0))
    day_end   = datetime.combine(target + timedelta(days=1), dt_time(0, 0))

    sessions = db.query(WorkerSession).filter(
        WorkerSession.worker_id == worker_id,
        WorkerSession.start_time >= day_start,
        WorkerSession.start_time < day_end,
    ).all()

    agg = {"주간": {"min": 0.0, "good": 0, "defect": 0}, "야간": {"min": 0.0, "good": 0, "defect": 0}}
    for s in sessions:
        sh = s.shift or get_shift(s.start_time)
        end = s.end_time or datetime.now()
        agg[sh]["min"] += (end - s.start_time).total_seconds() / 60
        agg[sh]["good"]   += s.good_qty
        agg[sh]["defect"] += s.defect_qty

    from app.models.auth import User as AuthUser
    worker = db.get(AuthUser, worker_id)

    def _shift_out(d):
        m = d["min"]
        return {
            "man_hour_min":  round(m, 1),
            "man_hour_h":    round(m / 60, 2),
            "man_hour_rate": round(min(m / SHIFT_PLAN_MIN * 100, 100), 1),
            "good_qty":  d["good"],
            "defect_qty": d["defect"],
            "plan_hour_min": SHIFT_PLAN_MIN,
        }

    return {
        "worker_id":    worker_id,
        "worker_name":  worker.name if worker else worker_id,
        "date":         str(target),
        "current_shift": get_shift(),
        "shift_label":  "08:30~20:30" if get_shift() == "주간" else "20:30~08:30",
        "day_shift":    _shift_out(agg["주간"]),
        "night_shift":  _shift_out(agg["야간"]),
    }


# ── 관리자 전체 대시보드 ──────────────────────────────────────────────

@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    """20대 호기 전체 현황"""
    machines = db.query(Machine).filter(Machine.is_active == True).order_by(Machine.machine_id).all()
    result = []
    for m in machines:
        session = db.query(WorkerSession).filter(
            WorkerSession.machine_id == m.machine_id,
            WorkerSession.status == SessionStatus.running,
        ).first()

        if session:
            detail = _session_detail(db, session)
            result.append({
                "machine_id": m.machine_id,
                "machine_name": m.name,
                "status": "비가동" if detail["is_down"] else "가동",
                **detail,
            })
        else:
            result.append({
                "machine_id": m.machine_id,
                "machine_name": m.name,
                "status": "대기",
                "good_qty": 0,
                "target_qty": 0,
                "oee": 0,
                "worker_id": None,
                "part_name": "",
                "achievement_pct": 0,
                "is_down": False,
            })
    return result


# ── 작업자 KPI ───────────────────────────────────────────────────────

@router.get("/kpi/worker")
def worker_kpi(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """작업자별 KPI 집계"""
    if not from_date:
        from_date = date.today().replace(day=1)
    if not to_date:
        to_date = date.today()

    sessions = db.query(WorkerSession).filter(
        WorkerSession.start_time >= datetime.combine(from_date, datetime.min.time()),
        WorkerSession.start_time <= datetime.combine(to_date, datetime.max.time()),
    ).all()

    by_worker: dict = {}
    for s in sessions:
        w = s.worker_id
        if w not in by_worker:
            by_worker[w] = {
                "worker_id": w,
                "total_good": 0,
                "total_defect": 0,
                "total_working_min": 0,
                "session_count": 0,
                "oee_sum": 0,
            }
        d = _session_detail(db, s)
        by_worker[w]["total_good"] += s.good_qty
        by_worker[w]["total_defect"] += s.defect_qty
        by_worker[w]["total_working_min"] += d["working_min"]
        by_worker[w]["session_count"] += 1
        by_worker[w]["oee_sum"] += d["oee"]

    result = []
    for w, v in by_worker.items():
        total = v["total_good"] + v["total_defect"]
        result.append({
            "worker_id": v["worker_id"],
            "total_good": v["total_good"],
            "total_defect": v["total_defect"],
            "defect_rate": round(v["total_defect"] / total * 100, 2) if total > 0 else 0,
            "total_working_hr": round(v["total_working_min"] / 60, 1),
            "avg_oee": round(v["oee_sum"] / v["session_count"], 1) if v["session_count"] > 0 else 0,
            "session_count": v["session_count"],
        })

    result.sort(key=lambda x: x["avg_oee"], reverse=True)
    for i, r in enumerate(result):
        r["rank"] = i + 1

    return {"from_date": str(from_date), "to_date": str(to_date), "workers": result}


# ── Toyota 안돈 (Andon) ───────────────────────────────────────────

class AndonCallIn(BaseModel):
    machine_id: str
    caller_id: str
    andon_type: str
    note: Optional[str] = None


@router.post("/andon/call")
def andon_call(body: AndonCallIn, db: Session = Depends(get_db)):
    """안돈 호출 — 이상 발생 시 즉시 등록"""
    call = AndonCall(
        machine_id=body.machine_id,
        caller_id=body.caller_id,
        andon_type=body.andon_type,
        note=body.note,
    )
    db.add(call)
    db.commit()
    db.refresh(call)
    return {
        "id": call.id, "machine_id": call.machine_id,
        "andon_type": call.andon_type, "called_at": call.called_at.isoformat(),
        "is_resolved": call.is_resolved,
    }


@router.get("/andon/active")
def active_andons(db: Session = Depends(get_db)):
    """미해결 안돈 목록 (대시보드 경보용)"""
    rows = db.query(AndonCall).filter(
        AndonCall.is_resolved == False
    ).order_by(AndonCall.called_at.desc()).all()
    return [{
        "id": r.id, "machine_id": r.machine_id,
        "machine_name": r.machine.name if r.machine else r.machine_id,
        "andon_type": r.andon_type, "caller_id": r.caller_id,
        "note": r.note, "called_at": r.called_at.isoformat(),
        "elapsed_min": round((datetime.now() - r.called_at).total_seconds() / 60, 1),
    } for r in rows]


@router.post("/andon/{andon_id}/resolve")
def resolve_andon(andon_id: int, resolved_by: str, db: Session = Depends(get_db)):
    """안돈 해제"""
    call = db.get(AndonCall, andon_id)
    if not call:
        raise HTTPException(404, "안돈 없음")
    call.is_resolved = True
    call.resolved_at = datetime.now()
    call.resolved_by = resolved_by
    db.commit()
    return {"ok": True, "andon_id": andon_id}


@router.get("/andon/history")
def andon_history(
    machine_id: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """안돈 이력"""
    q = db.query(AndonCall).order_by(AndonCall.called_at.desc())
    if machine_id:
        q = q.filter(AndonCall.machine_id == machine_id)
    rows = q.limit(limit).all()
    return [{
        "id": r.id, "machine_id": r.machine_id,
        "machine_name": r.machine.name if r.machine else r.machine_id,
        "andon_type": r.andon_type, "caller_id": r.caller_id,
        "note": r.note, "called_at": r.called_at.isoformat(),
        "is_resolved": r.is_resolved,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
        "resolved_by": r.resolved_by,
        "response_min": round((r.resolved_at - r.called_at).total_seconds() / 60, 1) if r.resolved_at else None,
    } for r in rows]


# ── 택트 타임 (Takt Time) ─────────────────────────────────────────

@router.get("/takt-time")
def takt_time(
    daily_demand: int,
    available_hours: float = 8.0,
    db: Session = Depends(get_db),
):
    """Toyota 택트 타임: 가용시간 ÷ 일일수요 → 각 호기 CT vs TT 비교"""
    if daily_demand <= 0:
        raise HTTPException(400, "daily_demand > 0 필요")
    takt_sec = (available_hours * 3600) / daily_demand
    machines = db.query(Machine).filter(Machine.is_active == True).order_by(Machine.machine_id).all()
    result = []
    for m in machines:
        ratio = round(m.std_cycle_sec / takt_sec * 100, 1)
        result.append({
            "machine_id": m.machine_id,
            "machine_name": m.name,
            "std_cycle_sec": m.std_cycle_sec,
            "takt_sec": round(takt_sec, 1),
            "ct_tt_pct": ratio,
            "status": "과부하" if ratio > 100 else ("주의" if ratio > 90 else "정상"),
        })
    return {"takt_sec": round(takt_sec, 1), "daily_demand": daily_demand, "machines": result}


# ── 오늘 호기별 일보 ─────────────────────────────────────────────────

@router.get("/daily-report")
def daily_report(target_date: Optional[date] = None, db: Session = Depends(get_db)):
    """날짜별 호기 일보"""
    if not target_date:
        target_date = date.today()

    sessions = db.query(WorkerSession).filter(
        WorkerSession.start_time >= datetime.combine(target_date, datetime.min.time()),
        WorkerSession.start_time <= datetime.combine(target_date, datetime.max.time()),
    ).all()

    rows = []
    for s in sessions:
        d = _session_detail(db, s)
        rows.append({
            "machine_id": s.machine_id,
            "machine_name": d["machine_name"],
            "worker_id": s.worker_id,
            "wo_no": s.wo_no,
            "part_no": d["part_no"],
            "part_name": d["part_name"],
            "target_qty": d["target_qty"],
            "good_qty": s.good_qty,
            "defect_qty": s.defect_qty,
            "oee": d["oee"],
            "working_min": d["working_min"],
            "downtime_min": d["downtime_min"],
            "status": s.status,
        })

    total_good = sum(r["good_qty"] for r in rows)
    total_defect = sum(r["defect_qty"] for r in rows)
    avg_oee = round(sum(r["oee"] for r in rows) / len(rows), 1) if rows else 0

    return {
        "date": str(target_date),
        "summary": {
            "total_good": total_good,
            "total_defect": total_defect,
            "defect_rate": round(total_defect / (total_good + total_defect) * 100, 2) if (total_good + total_defect) > 0 else 0,
            "avg_oee": avg_oee,
            "active_machines": len({r["machine_id"] for r in rows}),
        },
        "rows": rows,
    }
