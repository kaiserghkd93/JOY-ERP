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
    WOStatus, SessionStatus, DowntimeReason, MachineStatus, AndonCall, MesPallet,
    ArticleInspection, WorkerSessionCost, FiveWhy,
    SetupChecklist, ShiftHandover, MaterialRequisition,
    ProcessCondition, MoldPmPlan, WorkerSkill,
)
from app.models.master import Item, BomLine
from app.models.ledger import StockLedger, LedgerType
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
    protocol_type: Optional[str] = None      # modbus_rtu, modbus_tcp, fanuc_focas
    comm_host: Optional[str] = None          # COM3 (RTU) or 192.168.1.10:502 (TCP)
    modbus_slave_id: int = 1
    counter_register_addr: Optional[int] = None
    counter_register_count: int = 2


class CommConfigIn(BaseModel):
    protocol_type: Optional[str] = None     # modbus_rtu / modbus_tcp / fanuc_focas
    comm_host: Optional[str] = None         # COM3 or 192.168.1.10:502
    modbus_slave_id: int = 1
    counter_register_addr: Optional[int] = None
    counter_register_count: int = 2         # 1=16bit, 2=32bit


class ShotPushIn(BaseModel):
    machine_total_shot: int                 # 기계의 현재 누적 총 숏트수
    timestamp: Optional[str] = None        # ISO 형식 (없으면 서버 시간 사용)


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


# ── 호기 Modbus 설정 ─────────────────────────────────────────────────

@router.get("/machines/{machine_id}/comm-config")
def get_comm_config(machine_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    m = db.get(Machine, machine_id)
    if not m:
        raise HTTPException(404)
    return {
        "machine_id": m.machine_id,
        "name": m.name,
        "protocol_type": m.protocol_type,
        "comm_host": m.comm_host,
        "modbus_slave_id": m.modbus_slave_id,
        "counter_register_addr": m.counter_register_addr,
        "counter_register_count": m.counter_register_count,
        "cavity_count": m.cavity_count,
    }


@router.patch("/machines/{machine_id}/comm-config")
def update_comm_config(machine_id: str, body: CommConfigIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    m = db.get(Machine, machine_id)
    if not m:
        raise HTTPException(404)
    m.protocol_type = body.protocol_type
    m.comm_host = body.comm_host
    m.modbus_slave_id = body.modbus_slave_id
    m.counter_register_addr = body.counter_register_addr
    m.counter_register_count = body.counter_register_count
    db.commit()
    return {"ok": True}


@router.post("/machines/{machine_id}/shot-push")
def shot_push(machine_id: str, body: ShotPushIn, db: Session = Depends(get_db)):
    """
    미들웨어(공장 PC)에서 주기적으로 호출.
    machine_total_shot: 기계의 현재 누적 총 숏트수
    → 진행 중인 세션의 shot_count, good_qty 자동 갱신
    """
    import os
    # 간단한 토큰 인증 (env MACHINE_TOKEN 미설정 시 인증 생략)
    machine_token = os.environ.get("MACHINE_TOKEN", "")
    # (필요 시 Header 인증 추가 가능)

    m = db.get(Machine, machine_id)
    if not m:
        raise HTTPException(404, f"호기 없음: {machine_id}")

    session = db.query(WorkerSession).filter(
        WorkerSession.machine_id == machine_id,
        WorkerSession.status == SessionStatus.running,
    ).order_by(WorkerSession.start_time.desc()).first()

    if not session:
        return {"ok": False, "reason": "no_active_session", "machine_id": machine_id}

    # 세션 시작 시 기준값 설정
    if session.shot_base is None:
        session.shot_base = body.machine_total_shot
        session.shot_count = 0
    else:
        session.shot_count = max(0, body.machine_total_shot - session.shot_base)

    # 양품 = 사이클수 × 캐비티(사출기) or 1(단품 가공) - 불량
    total_produced = session.shot_count * m.cavity_count
    session.good_qty = max(0, total_produced - session.defect_qty)

    db.commit()
    return {
        "ok": True,
        "machine_id": machine_id,
        "machine_total_count": body.machine_total_shot,
        "session_count": session.shot_count,
        "total_produced": total_produced,
        "good_qty": session.good_qty,
        "defect_qty": session.defect_qty,
    }


@router.get("/machines/{machine_id}/shot-status")
def shot_status(machine_id: str, db: Session = Depends(get_db)):
    """현재 세션의 숏트 현황 조회"""
    m = db.get(Machine, machine_id)
    if not m:
        raise HTTPException(404)
    session = db.query(WorkerSession).filter(
        WorkerSession.machine_id == machine_id,
        WorkerSession.status == SessionStatus.running,
    ).order_by(WorkerSession.start_time.desc()).first()
    if not session:
        return {"machine_id": machine_id, "active": False}
    return {
        "machine_id": machine_id,
        "active": True,
        "session_id": session.id,
        "shot_count": session.shot_count,
        "total_produced": session.shot_count * m.cavity_count,
        "good_qty": session.good_qty,
        "defect_qty": session.defect_qty,
        "shot_base": session.shot_base,
    }


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
    if body.assigned_worker_id and not db.query(AuthUser).filter(AuthUser.username == body.assigned_worker_id).first():
        raise HTTPException(404, f"작업자 없음: {body.assigned_worker_id}")

    wo_no = next_doc_no(db, "WO", "mes_work_order", "wo_no")
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


class WOStatusUpdate(BaseModel):
    status: str


class WOActualUpdate(BaseModel):
    good_qty: int = 0
    defect_qty: int = 0


STATUS_FLOW = {
    "대기":     "자재확인",
    "자재확인": "발행",
    "발행":     "진행",
    "진행":     "완료",
    "완료":     "마감",
}


@router.patch("/work-orders/{wo_no}/status")
def update_wo_status(wo_no: str, body: WOStatusUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """작업지시 상태 변경 (대기→자재확인→발행→진행→완료→마감)"""
    try:
        wo = db.get(MesWorkOrder, wo_no)
        if not wo:
            raise HTTPException(404, f"작업지시 없음: {wo_no}")
        current = wo.status.value if hasattr(wo.status, 'value') else str(wo.status)
        next_allowed = STATUS_FLOW.get(current)
        if next_allowed != body.status:
            raise HTTPException(400, f"현재 상태 '{current}'에서 '{body.status}'로 변경 불가 (다음: {next_allowed})")
        try:
            wo.status = WOStatus(body.status)
        except ValueError:
            raise HTTPException(400, f"유효하지 않은 상태값: {body.status}")
        try:
            db.commit()
        except Exception as commit_err:
            db.rollback()
            raise HTTPException(500, f"DB 커밋 오류: {type(commit_err).__name__}: {commit_err}")
        db.refresh(wo)
        return _wo_with_qr(wo)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"상태변경 처리 오류: {type(e).__name__}: {e}")


@router.patch("/work-orders/{wo_no}/actual")
def update_wo_actual(wo_no: str, body: WOActualUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """작업지시 실적 직접 입력 (세션 없이)"""
    from app.models.mes import MesProductionLog as ProdLog, MesSession
    wo = db.get(MesWorkOrder, wo_no)
    if not wo:
        raise HTTPException(404, f"작업지시 없음: {wo_no}")
    # 직접 세션 없이 실적 조정 — 직접 입력 세션 찾거나 새로 생성
    direct_session = db.query(MesSession).filter(
        MesSession.wo_no == wo_no,
        MesSession.worker_id == "direct",
    ).first()
    if not direct_session:
        from app.models.mes import MesSession as Sess
        from datetime import datetime
        direct_session = Sess(
            session_id=f"DS-{wo_no}",
            wo_no=wo_no,
            machine_id=wo.machine_id,
            worker_id="direct",
            start_time=datetime.now(),
            good_qty=0,
            defect_qty=0,
        )
        db.add(direct_session)
        db.flush()
    direct_session.good_qty = body.good_qty
    direct_session.defect_qty = body.defect_qty
    if wo.status == WOStatus.pending or (hasattr(wo.status, 'value') and wo.status.value == "대기"):
        wo.status = WOStatus.running
    db.commit()
    return _wo_with_qr(wo)


@router.post("/work-orders/{wo_no}/cancel")
def cancel_wo(wo_no: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """⑤ WO 취소 — 자재 불출 역전표 자동 생성"""
    wo = db.get(MesWorkOrder, wo_no)
    if not wo:
        raise HTTPException(404, f"작업지시 없음: {wo_no}")
    if wo.status in (WOStatus.completed, WOStatus.closed):
        raise HTTPException(400, f"완료/마감된 작업지시는 취소 불가")
    if wo.status == WOStatus.cancelled:
        raise HTTPException(400, "이미 취소된 작업지시")

    # 자재 불출 역전표 (소모로 차감된 것 복원)
    consumed = db.query(StockLedger).filter(
        StockLedger.ref_no == wo_no,
        StockLedger.ref_type == "WO",
        StockLedger.ledger_type == LedgerType.consumption,
    ).all()
    today_date = date.today()
    for entry in consumed:
        db.add(StockLedger(
            txn_date=today_date,
            part_no=entry.part_no,
            ledger_type=LedgerType.cancel,
            qty=-entry.qty,  # 원래 음수였으므로 반전하면 양수
            unit_price=entry.unit_price,
            ref_type="WO",
            ref_no=wo_no,
            note=f"작업지시취소 역전표 (원전표 #{entry.id})",
        ))

    wo.status = WOStatus.cancelled
    # 진행중인 세션도 중단
    for s in wo.sessions:
        if s.status == SessionStatus.running:
            s.status = SessionStatus.stopped
            s.end_time = datetime.now()

    db.commit()
    return {"ok": True, "reversed_entries": len(consumed)}


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

    # ② 자재 불출 자동화: BOM 소요량 × 목표수량 → 생산소모 원장 등록
    bom_lines = db.query(BomLine).filter(BomLine.product_part_no == wo.part_no).all()
    today_date = date.today()
    for bom in bom_lines:
        consume_qty = int(round(float(bom.qty_per) * wo.target_qty))
        if consume_qty <= 0:
            continue
        db.add(StockLedger(
            txn_date=today_date,
            part_no=bom.component_part_no,
            ledger_type=LedgerType.consumption,
            qty=-consume_qty,
            unit_price=0,
            ref_type="WO",
            ref_no=wo.wo_no,
            note=f"작업지시 자동불출 세션#{session.worker_id}",
        ))

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

    # ⑤ 표준 CT 이상 경보
    total_qty = session.good_qty + session.defect_qty
    if total_qty > 0:
        elapsed_sec = (datetime.now() - session.start_time).total_seconds()
        actual_ct = elapsed_sec / total_qty
        machine = db.get(Machine, session.machine_id)
        std_ct = machine.std_cycle_sec if machine and machine.std_cycle_sec else 0
        if std_ct > 0 and actual_ct > std_ct * 1.2:
            existing = db.query(AndonCall).filter(
                AndonCall.machine_id == session.machine_id,
                AndonCall.caller_id == "SYSTEM_CT",
                AndonCall.is_resolved == False,
            ).first()
            if not existing:
                db.add(AndonCall(
                    machine_id=session.machine_id,
                    caller_id="SYSTEM_CT",
                    andon_type="품질이상",
                    note=f"CT 이상: 실제 {actual_ct:.1f}초 / 표준 {std_ct:.1f}초 ({((actual_ct/std_ct-1)*100):.0f}% 초과)",
                ))

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

    # ① 재고원장 반영 — 완성품 생산입고
    from app.services.ledger_service import post_ledger
    from app.models.master import Item
    item = db.get(Item, wo.part_no)
    avg_cost = float(item.avg_cost or item.std_buy_price or 0) if item else 0
    if session.good_qty > 0:
        post_ledger(
            db, wo.part_no, date.today(),
            LedgerType.production, session.good_qty, avg_cost,
            ref_type="WO", ref_no=session.wo_no,
            note=f"MES생산입고 {session.machine_id}",
        )

    # ② 금형 샷수 자동 누적 + ③ PM Andon 자동 생성
    if wo.mold_no:
        from app.models.mold import MoldOrder
        mold = db.get(MoldOrder, wo.mold_no)
        if mold:
            mold.production_shot_count = (mold.production_shot_count or 0) + session.shot_count
            since_pm = mold.production_shot_count - (mold.last_pm_shot or 0)
            if since_pm >= (mold.pm_cycle_shot or 500000):
                existing_pm = db.query(AndonCall).filter(
                    AndonCall.machine_id == session.machine_id,
                    AndonCall.caller_id == "SYSTEM_PM",
                    AndonCall.is_resolved == False,
                ).first()
                if not existing_pm:
                    db.add(AndonCall(
                        machine_id=session.machine_id,
                        caller_id="SYSTEM_PM",
                        andon_type="설비고장",
                        note=f"금형 PM 주기 도달: {wo.mold_no} (누적 {mold.production_shot_count:,}샷 / 주기 {mold.pm_cycle_shot:,}샷)",
                    ))

    # ④ 실원가 자동 계산
    from app.models.ledger import StockLedger as _SL
    consumed = db.query(_SL).filter(
        _SL.ref_no == session.wo_no,
        _SL.ref_type == "WO",
        _SL.ledger_type == LedgerType.consumption,
    ).all()
    material_cost = sum(abs(float(c.qty)) * float(c.unit_price or 0) for c in consumed)
    elapsed_min = (session.end_time - session.start_time).total_seconds() / 60 if session.end_time else 0
    labor_cost = round(elapsed_min / 60 * 15000, 2)  # 시간당 15,000원 기준
    total_cost = material_cost + labor_cost
    unit_cost = round(total_cost / session.good_qty, 2) if session.good_qty > 0 else 0
    db.add(WorkerSessionCost(
        session_id=session.id,
        wo_no=session.wo_no,
        part_no=wo.part_no,
        good_qty=session.good_qty,
        material_cost=material_cost,
        labor_cost=labor_cost,
        total_cost=total_cost,
        unit_cost=unit_cost,
        calc_note=f"재료비:{material_cost:,.0f} 노무비:{labor_cost:,.0f} ({elapsed_min:.0f}분×15,000원/h)",
    ))

    db.commit()
    return _session_detail(db, session)


# ── 파렛트 LOT ───────────────────────────────────────────────────────

@router.post("/sessions/{session_id}/pallet-close")
def pallet_close(session_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """파렛트 완성 처리 — 현재 양품수량으로 파렛트 LOT 생성"""
    session = db.get(WorkerSession, session_id)
    if not session:
        raise HTTPException(404)
    if session.worker_id != user.username:
        raise HTTPException(403, "본인 세션만 처리 가능")

    wo = db.get(MesWorkOrder, session.wo_no)
    if not wo:
        raise HTTPException(404)

    # 이미 발행된 파렛트 수량 합산
    issued = db.query(func.sum(MesPallet.qty)).filter(
        MesPallet.session_id == session_id
    ).scalar() or 0

    # 이번 파렛트 수량 = 현재 good_qty - 이미 발행된 수량
    pallet_qty = session.good_qty - issued
    if pallet_qty <= 0:
        raise HTTPException(400, f"발행할 수량 없음 (양품 {session.good_qty} - 기발행 {issued} = {pallet_qty})")

    pallet_id = next_doc_no(db, "PLT", "mes_pallet", "pallet_id")
    pallet = MesPallet(
        pallet_id=pallet_id,
        wo_no=session.wo_no,
        session_id=session_id,
        part_no=wo.part_no,
        machine_id=session.machine_id,
        worker_id=session.worker_id,
        qty=pallet_qty,
    )
    db.add(pallet)
    db.commit()
    db.refresh(pallet)

    item = db.get(type(wo.item), wo.part_no) if wo.item else None
    machine = db.get(Machine, session.machine_id)
    return {
        "pallet_id": pallet_id,
        "part_no": wo.part_no,
        "part_name": wo.item.name if wo.item else "",
        "machine_name": machine.name if machine else "",
        "worker_id": session.worker_id,
        "qty": pallet_qty,
        "wo_no": session.wo_no,
        "created_at": pallet.created_at.isoformat(),
        # QR에 담을 데이터 (프론트에서 렌더링)
        "qr_text": f"{pallet_id}|{wo.part_no}|{pallet_qty}|{session.wo_no}",
    }


@router.get("/pallets/{pallet_id}")
def get_pallet(pallet_id: str, db: Session = Depends(get_db)):
    """파렛트 LOT 조회 — QR 스캔 후 추적 화면"""
    p = db.get(MesPallet, pallet_id)
    if not p:
        raise HTTPException(404, f"파렛트 없음: {pallet_id}")
    wo = db.get(MesWorkOrder, p.wo_no)
    session = db.get(WorkerSession, p.session_id)
    machine = db.get(Machine, p.machine_id)
    from app.models.auth import User as AuthUser
    worker = db.get(AuthUser, p.worker_id)
    return {
        "pallet_id": p.pallet_id,
        "status": p.status,
        "part_no": p.part_no,
        "part_name": wo.item.name if wo and wo.item else "",
        "qty": p.qty,
        "wo_no": p.wo_no,
        "machine_name": machine.name if machine else p.machine_id,
        "worker_name": worker.name if worker else p.worker_id,
        "created_at": p.created_at.isoformat(),
        "shift": session.shift if session else None,
        "mold_no": wo.mold_no if wo else None,
    }


@router.get("/pallets")
def list_pallets(
    wo_no: Optional[str] = None,
    part_no: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(MesPallet).order_by(MesPallet.created_at.desc())
    if wo_no:
        q = q.filter(MesPallet.wo_no == wo_no)
    if part_no:
        q = q.filter(MesPallet.part_no == part_no)
    pallets = q.limit(limit).all()
    result = []
    for p in pallets:
        wo = db.get(MesWorkOrder, p.wo_no)
        machine = db.get(Machine, p.machine_id)
        result.append({
            "pallet_id": p.pallet_id,
            "part_no": p.part_no,
            "part_name": wo.item.name if wo and wo.item else "",
            "qty": p.qty,
            "wo_no": p.wo_no,
            "machine_name": machine.name if machine else p.machine_id,
            "worker_id": p.worker_id,
            "created_at": p.created_at.isoformat(),
            "status": p.status,
        })
    return result


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
        # 불량 누락 감지 (기계 연동 시에만 유효)
        "shot_count": session.shot_count,
        "machine_connected": session.shot_base is not None,
        "unaccounted_qty": (
            max(0, session.shot_count * cavity - (session.good_qty + session.defect_qty))
            if session.shot_base is not None else None
        ),
        # 파렛트 기준수량 (품목 설정값)
        "pallet_std_qty": int(wo_item.pallet_std_qty) if wo_item and getattr(wo_item, "pallet_std_qty", None) else 0,
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
def worker_kpi(worker_id: str, kpi_date: Optional[str] = None, db: Session = Depends(get_db)):
    """작업자 일별 공수 KPI (주야 교대 집계)"""
    target: date = date.fromisoformat(kpi_date) if kpi_date else date.today()
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


@router.get("/oee-trend")
def oee_trend(days: int = 7, db: Session = Depends(get_db)):
    """최근 N일 OEE 트렌드 — 날짜별 집계"""
    from datetime import timedelta
    today = date.today()
    result = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        sessions = db.query(WorkerSession).filter(
            WorkerSession.start_time >= datetime.combine(d, datetime.min.time()),
            WorkerSession.start_time <= datetime.combine(d, datetime.max.time()),
        ).all()
        if not sessions:
            result.append({
                "date": str(d), "avg_oee": 0, "total_good": 0, "total_defect": 0,
                "defect_rate": 0, "active_machines": 0,
            })
            continue
        oees, goods, defects, m_set = [], 0, 0, set()
        for s in sessions:
            detail = _session_detail(db, s)
            oees.append(detail["oee"])
            goods += s.good_qty
            defects += s.defect_qty
            m_set.add(s.machine_id)
        total = goods + defects
        result.append({
            "date": str(d),
            "avg_oee": round(sum(oees) / len(oees), 1) if oees else 0,
            "total_good": goods,
            "total_defect": defects,
            "defect_rate": round(defects / total * 100, 2) if total > 0 else 0,
            "active_machines": len(m_set),
        })
    return result


@router.get("/machine-oee-summary")
def machine_oee_summary(days: int = 7, db: Session = Depends(get_db)):
    """최근 N일 호기별 OEE 집계"""
    from datetime import timedelta
    from app.models.mes import Machine
    start = datetime.combine(date.today() - timedelta(days=days-1), datetime.min.time())
    sessions = db.query(WorkerSession).filter(WorkerSession.start_time >= start).all()
    by_machine: dict = {}
    for s in sessions:
        mid = s.machine_id
        if mid not in by_machine:
            by_machine[mid] = {"oees": [], "goods": 0, "defects": 0, "sessions": 0}
        d = _session_detail(db, s)
        by_machine[mid]["oees"].append(d["oee"])
        by_machine[mid]["goods"] += s.good_qty
        by_machine[mid]["defects"] += s.defect_qty
        by_machine[mid]["sessions"] += 1
    result = []
    for mid, v in by_machine.items():
        m = db.get(Machine, mid)
        total = v["goods"] + v["defects"]
        result.append({
            "machine_id": mid,
            "machine_name": m.name if m else mid,
            "avg_oee": round(sum(v["oees"]) / len(v["oees"]), 1) if v["oees"] else 0,
            "total_good": v["goods"],
            "total_defect": v["defects"],
            "defect_rate": round(v["defects"] / total * 100, 2) if total > 0 else 0,
            "sessions": v["sessions"],
        })
    result.sort(key=lambda x: x["avg_oee"], reverse=True)
    return result


# ═══════════════════════════════════════════════════════════════════
# #3  교대 인수인계
# ═══════════════════════════════════════════════════════════════════
class HandoverIn(BaseModel):
    shift_date: str           # YYYY-MM-DD
    from_shift: str
    to_shift: str
    machine_id: Optional[str] = None
    outgoing_worker: str
    incoming_worker: Optional[str] = None
    good_qty: int = 0
    defect_qty: int = 0
    issues: Optional[str] = None
    pending_work: Optional[str] = None
    special_note: Optional[str] = None

@router.post("/handover")
def create_handover(body: HandoverIn, db: Session = Depends(get_db)):
    ho = ShiftHandover(
        shift_date=date.fromisoformat(body.shift_date),
        from_shift=body.from_shift,
        to_shift=body.to_shift,
        machine_id=body.machine_id,
        outgoing_worker=body.outgoing_worker,
        incoming_worker=body.incoming_worker,
        good_qty=body.good_qty,
        defect_qty=body.defect_qty,
        issues=body.issues,
        pending_work=body.pending_work,
        special_note=body.special_note,
    )
    db.add(ho)
    db.commit()
    db.refresh(ho)
    return {"id": ho.id, "created_at": ho.created_at.isoformat()}

@router.get("/handover")
def list_handovers(
    shift_date: Optional[str] = None,
    machine_id: Optional[str] = None,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    q = db.query(ShiftHandover)
    if shift_date:
        q = q.filter(ShiftHandover.shift_date == date.fromisoformat(shift_date))
    if machine_id:
        q = q.filter(ShiftHandover.machine_id == machine_id)
    rows = q.order_by(ShiftHandover.created_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id, "shift_date": r.shift_date.isoformat(),
            "from_shift": r.from_shift, "to_shift": r.to_shift,
            "machine_id": r.machine_id,
            "outgoing_worker": r.outgoing_worker,
            "incoming_worker": r.incoming_worker,
            "good_qty": r.good_qty, "defect_qty": r.defect_qty,
            "issues": r.issues, "pending_work": r.pending_work,
            "special_note": r.special_note,
            "created_at": r.created_at.isoformat(),
            "acknowledged_at": r.acknowledged_at.isoformat() if r.acknowledged_at else None,
        }
        for r in rows
    ]

@router.post("/handover/{handover_id}/acknowledge")
def acknowledge_handover(handover_id: int, db: Session = Depends(get_db)):
    ho = db.get(ShiftHandover, handover_id)
    if not ho:
        raise HTTPException(404, "인수인계 없음")
    ho.acknowledged_at = datetime.now()
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════
# #4  자재 출고 요청
# ═══════════════════════════════════════════════════════════════════

class MatReqIn(BaseModel):
    wo_no: Optional[str] = None
    machine_id: Optional[str] = None
    requester_id: str
    part_no: str
    req_qty: float
    reason: Optional[str] = None

@router.post("/material-req")
def create_mat_req(body: MatReqIn, db: Session = Depends(get_db)):
    today = date.today()
    prefix = f"MR-{today.strftime('%Y%m%d')}"
    count = db.query(MaterialRequisition).filter(
        MaterialRequisition.req_no.like(f"{prefix}%")
    ).count()
    req_no = f"{prefix}-{str(count + 1).zfill(3)}"

    req = MaterialRequisition(
        req_no=req_no,
        wo_no=body.wo_no,
        machine_id=body.machine_id,
        requester_id=body.requester_id,
        part_no=body.part_no,
        req_qty=body.req_qty,
        reason=body.reason,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"id": req.id, "req_no": req.req_no}

@router.get("/material-req")
def list_mat_reqs(
    status: Optional[str] = None,
    requester_id: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(MaterialRequisition)
    if status:
        q = q.filter(MaterialRequisition.status == status)
    if requester_id:
        q = q.filter(MaterialRequisition.requester_id == requester_id)
    rows = q.order_by(MaterialRequisition.created_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id, "req_no": r.req_no, "wo_no": r.wo_no,
            "machine_id": r.machine_id, "requester_id": r.requester_id,
            "part_no": r.part_no,
            "part_name": r.item.name if r.item else r.part_no,
            "req_qty": r.req_qty, "reason": r.reason, "status": r.status,
            "created_at": r.created_at.isoformat(),
            "handled_at": r.handled_at.isoformat() if r.handled_at else None,
            "handled_by": r.handled_by,
        }
        for r in rows
    ]

@router.patch("/material-req/{req_id}/status")
def update_mat_req_status(
    req_id: int,
    status: str,
    handled_by: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    req = db.get(MaterialRequisition, req_id)
    if not req:
        raise HTTPException(404, "요청 없음")
    req.status = status
    req.handled_by = handled_by
    req.handled_at = datetime.now()
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════
# #5  작업 준비 체크리스트
# ═══════════════════════════════════════════════════════════════════

class ChecklistIn(BaseModel):
    wo_no: str
    machine_id: str
    worker_id: str
    shift: str
    mold_ok: Optional[str] = None
    material_ok: Optional[str] = None
    temp_ok: Optional[str] = None
    pressure_ok: Optional[str] = None
    safety_ok: Optional[str] = None
    first_ok: Optional[str] = None
    tool_ok: Optional[str] = None
    cleaning_ok: Optional[str] = None
    note: Optional[str] = None

@router.post("/setup-checklist")
def create_checklist(body: ChecklistIn, db: Session = Depends(get_db)):
    items = [body.mold_ok, body.material_ok, body.temp_ok, body.pressure_ok,
             body.safety_ok, body.first_ok, body.tool_ok, body.cleaning_ok]
    is_complete = all(v == 'Y' for v in items)
    cl = SetupChecklist(
        wo_no=body.wo_no, machine_id=body.machine_id,
        worker_id=body.worker_id, shift=body.shift,
        mold_ok=body.mold_ok, material_ok=body.material_ok,
        temp_ok=body.temp_ok, pressure_ok=body.pressure_ok,
        safety_ok=body.safety_ok, first_ok=body.first_ok,
        tool_ok=body.tool_ok, cleaning_ok=body.cleaning_ok,
        note=body.note, is_complete=is_complete,
        completed_at=datetime.now() if is_complete else None,
    )
    db.add(cl)
    db.commit()
    db.refresh(cl)
    return {"id": cl.id, "is_complete": is_complete}

@router.get("/defect-pareto")
def defect_pareto(
    start: Optional[date] = None,
    end: Optional[date] = None,
    machine_id: Optional[str] = None,
    part_no: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """③ 불량 유형별 파레토 집계"""
    from sqlalchemy import func as sqlfunc
    if not start:
        start = date.today().replace(day=1)
    if not end:
        end = date.today()

    q = db.query(
        ProdLog.defect_type,
        sqlfunc.sum(ProdLog.defect_qty).label("count"),
    ).join(WorkerSession, ProdLog.session_id == WorkerSession.id)

    if machine_id:
        q = q.filter(WorkerSession.machine_id == machine_id)
    if part_no:
        q = q.join(MesWorkOrder, WorkerSession.wo_no == MesWorkOrder.wo_no).filter(MesWorkOrder.part_no == part_no)

    q = q.filter(
        ProdLog.defect_qty > 0,
        ProdLog.defect_type != None,
        ProdLog.logged_at >= datetime.combine(start, dt_time.min),
        ProdLog.logged_at <= datetime.combine(end, dt_time.max),
    )
    rows = q.group_by(ProdLog.defect_type).order_by(sqlfunc.sum(ProdLog.defect_qty).desc()).all()

    total = sum(r.count for r in rows) or 1
    cumulative = 0
    result = []
    for r in rows:
        cumulative += r.count
        result.append({
            "defect_type": r.defect_type or "미분류",
            "count": int(r.count),
            "pct": round(r.count / total * 100, 1),
            "cumulative_pct": round(cumulative / total * 100, 1),
        })
    return {"total": int(total), "items": result}


@router.get("/setup-checklist")
def get_checklist(wo_no: str, db: Session = Depends(get_db)):
    cl = db.query(SetupChecklist).filter(
        SetupChecklist.wo_no == wo_no
    ).order_by(SetupChecklist.created_at.desc()).first()
    if not cl:
        return None
    return {
        "id": cl.id, "wo_no": cl.wo_no, "machine_id": cl.machine_id,
        "worker_id": cl.worker_id, "shift": cl.shift,
        "mold_ok": cl.mold_ok, "material_ok": cl.material_ok,
        "temp_ok": cl.temp_ok, "pressure_ok": cl.pressure_ok,
        "safety_ok": cl.safety_ok, "first_ok": cl.first_ok,
        "tool_ok": cl.tool_ok, "cleaning_ok": cl.cleaning_ok,
        "note": cl.note, "is_complete": cl.is_complete,
        "created_at": cl.created_at.isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════
# ① 초·중·종물 검사
# ═══════════════════════════════════════════════════════════════════

class ArticleInspIn(BaseModel):
    session_id: int
    wo_no: str
    machine_id: str
    worker_id: str
    insp_type: str                       # 초물 / 중간 / 종물
    result: str                          # OK / NG
    dim1_spec: Optional[float] = None
    dim1_actual: Optional[float] = None
    dim2_spec: Optional[float] = None
    dim2_actual: Optional[float] = None
    dim3_spec: Optional[float] = None
    dim3_actual: Optional[float] = None
    appearance: Optional[str] = None
    note: Optional[str] = None


@router.post("/article-inspection")
def create_article_inspection(body: ArticleInspIn, db: Session = Depends(get_db)):
    insp = ArticleInspection(**body.model_dump())
    db.add(insp)
    # NG면 Andon 품질이상 자동 호출
    if body.result == "NG":
        db.add(AndonCall(
            machine_id=body.machine_id,
            caller_id=body.worker_id,
            andon_type="품질이상",
            note=f"{body.insp_type} 검사 NG — WO:{body.wo_no}",
        ))
    db.commit()
    db.refresh(insp)
    return {"id": insp.id, "result": insp.result}


@router.get("/article-inspection")
def list_article_inspections(
    session_id: Optional[int] = None,
    wo_no: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(ArticleInspection).order_by(ArticleInspection.created_at.desc())
    if session_id:
        q = q.filter(ArticleInspection.session_id == session_id)
    if wo_no:
        q = q.filter(ArticleInspection.wo_no == wo_no)
    rows = q.limit(limit).all()
    return [
        {
            "id": r.id, "session_id": r.session_id, "wo_no": r.wo_no,
            "machine_id": r.machine_id, "worker_id": r.worker_id,
            "insp_type": r.insp_type, "result": r.result,
            "dim1_spec": r.dim1_spec, "dim1_actual": r.dim1_actual,
            "dim2_spec": r.dim2_spec, "dim2_actual": r.dim2_actual,
            "dim3_spec": r.dim3_spec, "dim3_actual": r.dim3_actual,
            "appearance": r.appearance, "note": r.note,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


# ═══════════════════════════════════════════════════════════════════
# ② 계획 대비 실적 대시보드
# ═══════════════════════════════════════════════════════════════════

@router.get("/plan-vs-actual")
def plan_vs_actual(
    year: int,
    month: int,
    db: Session = Depends(get_db),
):
    """주별 계획 대비 실적 (WeeklyPlan vs WorkerSession)"""
    from app.models.production import WeeklyPlan
    from sqlalchemy import func as sqlfunc

    plans = db.query(WeeklyPlan).filter(
        WeeklyPlan.year == year,
        WeeklyPlan.month == month,
    ).all()

    # 해당 월 세션 실적 집계 (part_no 기준)
    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year + 1, 1, 1)
    else:
        month_end = date(year, month + 1, 1)

    actual_rows = db.query(
        MesWorkOrder.part_no,
        sqlfunc.sum(WorkerSession.good_qty).label("actual_qty"),
    ).join(WorkerSession, WorkerSession.wo_no == MesWorkOrder.wo_no).filter(
        MesWorkOrder.plan_date >= month_start,
        MesWorkOrder.plan_date < month_end,
        WorkerSession.status == SessionStatus.completed,
    ).group_by(MesWorkOrder.part_no).all()

    actual_map: dict[str, int] = {r.part_no: int(r.actual_qty or 0) for r in actual_rows}

    # 계획 집계 (part_no + week_no)
    result: dict[str, dict] = {}
    for p in plans:
        key = p.part_no
        if key not in result:
            item = db.query(Item).get(key)
            result[key] = {
                "part_no": key,
                "part_name": item.name if item else key,
                "planned_qty": 0,
                "actual_qty": actual_map.get(key, 0),
                "weeks": {},
            }
        result[key]["planned_qty"] += p.planned_qty
        result[key]["weeks"][p.week_no] = p.planned_qty

    rows = list(result.values())
    for r in rows:
        r["achievement_pct"] = round(r["actual_qty"] / r["planned_qty"] * 100, 1) if r["planned_qty"] > 0 else 0

    rows.sort(key=lambda x: x["part_no"])
    return {"year": year, "month": month, "items": rows}


@router.get("/session-cost")
def get_session_cost(session_id: int, db: Session = Depends(get_db)):
    cost = db.query(WorkerSessionCost).filter(WorkerSessionCost.session_id == session_id).first()
    if not cost:
        raise HTTPException(404, "원가 데이터 없음")
    return {
        "session_id": cost.session_id, "wo_no": cost.wo_no, "part_no": cost.part_no,
        "good_qty": cost.good_qty, "material_cost": cost.material_cost,
        "labor_cost": cost.labor_cost, "total_cost": cost.total_cost,
        "unit_cost": cost.unit_cost, "calc_note": cost.calc_note,
        "created_at": cost.created_at.isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════
# 5-Why 불량 원인 분석
# ═══════════════════════════════════════════════════════════════════

class FiveWhyIn(BaseModel):
    andon_id: int
    why1: Optional[str] = None
    why2: Optional[str] = None
    why3: Optional[str] = None
    why4: Optional[str] = None
    why5: Optional[str] = None
    root_cause: Optional[str] = None
    countermeasure: Optional[str] = None
    created_by: Optional[str] = None


@router.post("/five-why")
def create_five_why(body: FiveWhyIn, db: Session = Depends(get_db)):
    fw = FiveWhy(**body.model_dump())
    db.add(fw)
    andon = db.get(AndonCall, body.andon_id)
    if andon and not andon.is_resolved and body.countermeasure:
        andon.is_resolved = True
        andon.resolved_at = datetime.now()
        andon.resolved_by = body.created_by
    db.commit()
    db.refresh(fw)
    return {"id": fw.id}


@router.get("/five-why")
def list_five_why(andon_id: Optional[int] = None, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(FiveWhy).order_by(FiveWhy.created_at.desc())
    if andon_id:
        q = q.filter(FiveWhy.andon_id == andon_id)
    rows = q.limit(limit).all()
    return [
        {
            "id": r.id, "andon_id": r.andon_id,
            "why1": r.why1, "why2": r.why2, "why3": r.why3, "why4": r.why4, "why5": r.why5,
            "root_cause": r.root_cause, "countermeasure": r.countermeasure,
            "created_by": r.created_by, "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


# ═══════════════════════════════════════════════════════════════════
# SPC 관리도 (Xbar-R) — ArticleInspection 치수 데이터 활용
# ═══════════════════════════════════════════════════════════════════

@router.get("/spc-chart")
def spc_chart(
    part_no: str,
    dim: str = "dim1",
    limit_groups: int = 25,
    usl: Optional[float] = None,
    lsl: Optional[float] = None,
    db: Session = Depends(get_db),
):
    """Xbar-R 관리도 + Cp/Cpk 공정능력지수 (n=3)"""
    # A2, D3, D4, d2 상수 (n=3 기준)
    A2, D3, D4, d2 = 1.023, 0.0, 2.574, 1.693

    actual_col = getattr(ArticleInspection, f"{dim}_actual", None)
    if actual_col is None:
        raise HTTPException(400, f"잘못된 dim: {dim}")

    rows = db.query(ArticleInspection).filter(
        ArticleInspection.wo_no.in_(
            db.query(MesWorkOrder.wo_no).filter(MesWorkOrder.part_no == part_no)
        ),
        actual_col != None,
    ).order_by(ArticleInspection.created_at).all()

    if not rows:
        return {"part_no": part_no, "dim": dim, "groups": [], "ucl_x": None, "lcl_x": None, "ucl_r": None, "spec": None, "cp": None, "cpk": None}

    spec_val = getattr(rows[0], f"{dim}_spec", None)
    # spec 값 기반 USL/LSL 추정 (파라미터 없을 때)
    if usl is None and lsl is None and spec_val:
        pass  # caller 미제공시 Cp/Cpk 계산 불가

    n = 3
    groups = []
    for i in range(0, len(rows), n):
        sub = [float(getattr(r, f"{dim}_actual")) for r in rows[i:i+n] if getattr(r, f"{dim}_actual") is not None]
        if not sub:
            continue
        xbar = sum(sub) / len(sub)
        rng  = max(sub) - min(sub)
        groups.append({
            "idx": len(groups) + 1,
            "xbar": round(xbar, 4),
            "r": round(rng, 4),
            "insp_type": rows[i].insp_type,
            "created_at": rows[i].created_at.isoformat(),
        })

    if not groups:
        return {"part_no": part_no, "dim": dim, "groups": [], "ucl_x": None, "lcl_x": None, "ucl_r": None, "spec": spec_val, "cp": None, "cpk": None}

    groups = groups[-limit_groups:]

    xbar_bar = sum(g["xbar"] for g in groups) / len(groups)
    r_bar    = sum(g["r"] for g in groups) / len(groups)
    ucl_x = round(xbar_bar + A2 * r_bar, 4)
    lcl_x = round(xbar_bar - A2 * r_bar, 4)
    ucl_r = round(D4 * r_bar, 4)
    lcl_r = round(D3 * r_bar, 4)

    # Cp/Cpk 계산 (σ = R̄/d2)
    cp = cpk = cpu = cpl = None
    sigma = r_bar / d2 if r_bar > 0 else 0
    if sigma > 0 and usl is not None and lsl is not None:
        cp  = round((usl - lsl) / (6 * sigma), 3)
        cpu = round((usl - xbar_bar) / (3 * sigma), 3)
        cpl = round((xbar_bar - lsl) / (3 * sigma), 3)
        cpk = round(min(cpu, cpl), 3)
    elif sigma > 0 and usl is not None:
        cpu = round((usl - xbar_bar) / (3 * sigma), 3)
        cpk = cpu
    elif sigma > 0 and lsl is not None:
        cpl = round((xbar_bar - lsl) / (3 * sigma), 3)
        cpk = cpl

    return {
        "part_no": part_no, "dim": dim,
        "xbar_bar": round(xbar_bar, 4), "r_bar": round(r_bar, 4),
        "ucl_x": ucl_x, "lcl_x": lcl_x, "ucl_r": ucl_r, "lcl_r": lcl_r,
        "spec": float(spec_val) if spec_val else None,
        "sigma": round(sigma, 4),
        "cp": cp, "cpk": cpk, "cpu": cpu, "cpl": cpl,
        "usl": usl, "lsl": lsl,
        "groups": groups,
    }


# ═══════════════════════════════════════════════════════════════════
# SMED — 금형 교체 시간 분석
# ═══════════════════════════════════════════════════════════════════

@router.get("/smed-analysis")
def smed_analysis(days: int = 30, db: Session = Depends(get_db)):
    """금형교체 비가동 시간 집계"""
    from sqlalchemy import func as sqlfunc
    since = datetime.now() - timedelta(days=days)

    rows = db.query(DowntimeLog).filter(
        DowntimeLog.reason == DowntimeReason.mold_change,
        DowntimeLog.start_time >= since,
        DowntimeLog.end_time != None,
    ).all()

    if not rows:
        return {"avg_min": 0, "min_min": 0, "max_min": 0, "count": 0, "target_min": 30, "items": []}

    durations = [
        (dt.end_time - dt.start_time).total_seconds() / 60
        for dt in rows
    ]
    result_items = []
    for dt in rows:
        dur = (dt.end_time - dt.start_time).total_seconds() / 60
        session = db.get(WorkerSession, dt.session_id)
        result_items.append({
            "date": dt.start_time.strftime("%m/%d"),
            "machine_id": session.machine_id if session else "-",
            "duration_min": round(dur, 1),
        })

    # 기계별 평균
    machine_avg: dict[str, list] = {}
    for item in result_items:
        machine_avg.setdefault(item["machine_id"], []).append(item["duration_min"])

    return {
        "avg_min": round(sum(durations) / len(durations), 1),
        "min_min": round(min(durations), 1),
        "max_min": round(max(durations), 1),
        "count": len(durations),
        "target_min": 30,
        "items": sorted(result_items, key=lambda x: x["date"]),
        "by_machine": [
            {"machine_id": k, "avg_min": round(sum(v) / len(v), 1), "count": len(v)}
            for k, v in machine_avg.items()
        ],
    }


# ═══════════════════════════════════════════════════════════════════
# 실원가 분석 대시보드
# ═══════════════════════════════════════════════════════════════════

@router.get("/cost-analysis")
def cost_analysis(year: int, month: int, db: Session = Depends(get_db)):
    """품목별 실원가 집계"""
    from sqlalchemy import func as sqlfunc
    month_start = date(year, month, 1)
    month_end = date(year, month + 1, 1) if month < 12 else date(year + 1, 1, 1)

    costs = db.query(WorkerSessionCost).join(
        WorkerSession, WorkerSessionCost.session_id == WorkerSession.id
    ).filter(
        WorkerSession.start_time >= datetime.combine(month_start, dt_time.min),
        WorkerSession.start_time < datetime.combine(month_end, dt_time.min),
    ).all()

    part_map: dict[str, dict] = {}
    for c in costs:
        k = c.part_no
        if k not in part_map:
            item = db.get(Item, k)
            std_price = float(item.std_buy_price or 0) if item else 0
            part_map[k] = {
                "part_no": k,
                "part_name": item.name if item else k,
                "std_unit_price": std_price,
                "good_qty": 0, "material_cost": 0, "labor_cost": 0,
                "total_cost": 0, "sessions": 0,
            }
        part_map[k]["good_qty"] += c.good_qty
        part_map[k]["material_cost"] += c.material_cost
        part_map[k]["labor_cost"] += c.labor_cost
        part_map[k]["total_cost"] += c.total_cost
        part_map[k]["sessions"] += 1

    rows = []
    for v in part_map.values():
        v["unit_cost"] = round(v["total_cost"] / v["good_qty"], 2) if v["good_qty"] > 0 else 0
        v["margin"] = round((v["std_unit_price"] - v["unit_cost"]) / v["std_unit_price"] * 100, 1) if v["std_unit_price"] > 0 else None
        rows.append(v)

    rows.sort(key=lambda x: -x["total_cost"])
    return {
        "year": year, "month": month,
        "total_material": round(sum(r["material_cost"] for r in rows)),
        "total_labor": round(sum(r["labor_cost"] for r in rows)),
        "total_cost": round(sum(r["total_cost"] for r in rows)),
        "items": rows,
    }


# ═══════════════════════════════════════════════════════════════════
# 고객납기 추적 (수주 → WO → 출하)
# ═══════════════════════════════════════════════════════════════════

@router.get("/delivery-tracking")
def delivery_tracking(
    year: int,
    month: int,
    db: Session = Depends(get_db),
):
    """수주-WO-출하 납기 추적"""
    from app.models.sales import SalesOrder, Shipment
    from app.models.auth import User as AuthUser

    month_start = date(year, month, 1)
    month_end = date(year, month + 1, 1) if month < 12 else date(year + 1, 1, 1)

    orders = db.query(SalesOrder).filter(
        SalesOrder.due_date >= month_start,
        SalesOrder.due_date < month_end,
    ).all()

    result = []
    for so in orders:
        # 같은 품번, 납기 ±7일 내 WO 연결
        wos = db.query(MesWorkOrder).filter(
            MesWorkOrder.part_no == so.part_no,
            MesWorkOrder.plan_date >= month_start - timedelta(days=7),
            MesWorkOrder.plan_date < month_end + timedelta(days=7),
        ).all()
        wo_data = [{"wo_no": w.wo_no, "plan_date": str(w.plan_date), "status": w.status,
                    "good_qty": sum(s.good_qty for s in w.sessions)} for w in wos]
        wo_total_good = sum(w["good_qty"] for w in wo_data)

        # 같은 수주번호 출하
        ships = db.query(Shipment).filter(Shipment.so_no == so.so_no).all()
        shipped_qty = sum(s.qty for s in ships)
        last_ship = max((s.ship_date for s in ships), default=None)

        # 납기 준수 판정
        on_time = None
        if last_ship:
            on_time = last_ship <= so.due_date

        from app.models.master import Partner
        partner = db.get(Partner, so.partner_id)

        result.append({
            "so_no": so.so_no,
            "partner_name": partner.name if partner else so.partner_id,
            "part_no": so.part_no,
            "part_name": so.item.name if so.item else so.part_no,
            "order_qty": so.qty,
            "due_date": str(so.due_date),
            "so_status": so.status,
            "wo_count": len(wos),
            "wo_good_qty": wo_total_good,
            "shipped_qty": shipped_qty,
            "last_ship_date": str(last_ship) if last_ship else None,
            "on_time": on_time,
            "open_qty": max(0, so.qty - shipped_qty),
            "work_orders": wo_data,
        })

    result.sort(key=lambda x: x["due_date"])
    return {"year": year, "month": month, "items": result}


# ═══════════════════════════════════════════════════════════════════
# ② 공정 조건 기록표
# ═══════════════════════════════════════════════════════════════════

class ProcessConditionIn(BaseModel):
    session_id: int
    wo_no: str
    machine_id: str
    barrel_temp1: Optional[float] = None
    barrel_temp2: Optional[float] = None
    barrel_temp3: Optional[float] = None
    mold_temp_core: Optional[float] = None
    mold_temp_cav: Optional[float] = None
    injection_pressure: Optional[float] = None
    holding_pressure: Optional[float] = None
    back_pressure: Optional[float] = None
    injection_speed: Optional[float] = None
    cooling_time: Optional[float] = None
    cycle_time: Optional[float] = None
    shot_weight: Optional[float] = None
    recorded_by: Optional[str] = None
    note: Optional[str] = None


@router.post("/process-condition")
def add_process_condition(body: ProcessConditionIn, db: Session = Depends(get_db)):
    rec = ProcessCondition(**body.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "created_at": rec.created_at.isoformat()}


@router.get("/process-condition")
def list_process_conditions(
    session_id: Optional[int] = None,
    wo_no: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(ProcessCondition)
    if session_id:
        q = q.filter(ProcessCondition.session_id == session_id)
    if wo_no:
        q = q.filter(ProcessCondition.wo_no == wo_no)
    rows = q.order_by(ProcessCondition.created_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id, "session_id": r.session_id, "wo_no": r.wo_no, "machine_id": r.machine_id,
            "barrel_temp1": r.barrel_temp1, "barrel_temp2": r.barrel_temp2, "barrel_temp3": r.barrel_temp3,
            "mold_temp_core": r.mold_temp_core, "mold_temp_cav": r.mold_temp_cav,
            "injection_pressure": r.injection_pressure, "holding_pressure": r.holding_pressure,
            "back_pressure": r.back_pressure, "injection_speed": r.injection_speed,
            "cooling_time": r.cooling_time, "cycle_time": r.cycle_time, "shot_weight": r.shot_weight,
            "recorded_by": r.recorded_by, "note": r.note,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


# ═══════════════════════════════════════════════════════════════════
# ③ 금형 PM 캘린더
# ═══════════════════════════════════════════════════════════════════

class PmPlanIn(BaseModel):
    mold_no: str
    plan_date: str         # YYYY-MM-DD
    pm_type: str = "정기"
    description: Optional[str] = None
    note: Optional[str] = None


@router.post("/pm-plan")
def add_pm_plan(body: PmPlanIn, db: Session = Depends(get_db)):
    rec = MoldPmPlan(
        mold_no=body.mold_no,
        plan_date=date.fromisoformat(body.plan_date),
        pm_type=body.pm_type,
        description=body.description,
        note=body.note,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id}


@router.patch("/pm-plan/{plan_id}/complete")
def complete_pm_plan(
    plan_id: int,
    completed_by: Optional[str] = None,
    note: Optional[str] = None,
    db: Session = Depends(get_db),
):
    rec = db.get(MoldPmPlan, plan_id)
    if not rec:
        raise HTTPException(404, "PM 계획 없음")
    rec.status = "완료"
    rec.completed_date = date.today()
    if completed_by:
        rec.completed_by = completed_by
    if note:
        rec.note = note
    # 금형 last_pm_shot 갱신
    from app.models.mold import MoldOrder
    mold = db.get(MoldOrder, rec.mold_no)
    if mold:
        mold.last_pm_shot = mold.production_shot_count or 0
    db.commit()
    return {"ok": True}


@router.get("/pm-calendar")
def pm_calendar(
    year: int,
    month: int,
    db: Session = Depends(get_db),
):
    month_start = date(year, month, 1)
    month_end = date(year, month + 1, 1) if month < 12 else date(year + 1, 1, 1)
    rows = db.query(MoldPmPlan).filter(
        MoldPmPlan.plan_date >= month_start,
        MoldPmPlan.plan_date < month_end,
    ).order_by(MoldPmPlan.plan_date).all()

    # 미완료 금형 PM 주의 목록
    from app.models.mold import MoldOrder
    molds_due = db.query(MoldOrder).filter(
        MoldOrder.production_shot_count != None,
        MoldOrder.pm_cycle_shot != None,
    ).all()
    overdue = []
    for m in molds_due:
        since = (m.production_shot_count or 0) - (m.last_pm_shot or 0)
        if since >= (m.pm_cycle_shot or 500000):
            overdue.append({"mold_no": m.mold_no, "mold_name": m.mold_name, "since_pm_shot": since, "pm_cycle_shot": m.pm_cycle_shot})

    return {
        "year": year, "month": month,
        "plans": [
            {
                "id": r.id, "mold_no": r.mold_no, "plan_date": str(r.plan_date),
                "pm_type": r.pm_type, "description": r.description, "status": r.status,
                "completed_date": str(r.completed_date) if r.completed_date else None,
                "completed_by": r.completed_by,
            }
            for r in rows
        ],
        "overdue_molds": overdue,
    }


# ═══════════════════════════════════════════════════════════════════
# ④ 작업자 스킬 매트릭스
# ═══════════════════════════════════════════════════════════════════

class WorkerSkillIn(BaseModel):
    worker_id: str
    machine_id: str
    part_no: Optional[str] = None
    skill_level: str = "견습"   # 견습/보조/주작업자/교사
    certified_at: Optional[str] = None
    certified_by: Optional[str] = None
    valid_until: Optional[str] = None
    note: Optional[str] = None


@router.post("/worker-skill")
def upsert_worker_skill(body: WorkerSkillIn, db: Session = Depends(get_db)):
    existing = db.query(WorkerSkill).filter(
        WorkerSkill.worker_id == body.worker_id,
        WorkerSkill.machine_id == body.machine_id,
        WorkerSkill.part_no == body.part_no,
    ).first()
    if existing:
        existing.skill_level = body.skill_level
        existing.certified_at = date.fromisoformat(body.certified_at) if body.certified_at else existing.certified_at
        existing.certified_by = body.certified_by or existing.certified_by
        existing.valid_until = date.fromisoformat(body.valid_until) if body.valid_until else existing.valid_until
        existing.note = body.note or existing.note
        db.commit()
        return {"id": existing.id, "updated": True}
    rec = WorkerSkill(
        worker_id=body.worker_id,
        machine_id=body.machine_id,
        part_no=body.part_no,
        skill_level=body.skill_level,
        certified_at=date.fromisoformat(body.certified_at) if body.certified_at else None,
        certified_by=body.certified_by,
        valid_until=date.fromisoformat(body.valid_until) if body.valid_until else None,
        note=body.note,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "updated": False}


@router.get("/worker-skill")
def list_worker_skills(
    worker_id: Optional[str] = None,
    machine_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(WorkerSkill)
    if worker_id:
        q = q.filter(WorkerSkill.worker_id == worker_id)
    if machine_id:
        q = q.filter(WorkerSkill.machine_id == machine_id)
    rows = q.all()

    from app.models.auth import User as AuthUser
    users = {u.username: u.name for u in db.query(AuthUser).all()}
    machines_q = {m.machine_id: m.name for m in db.query(Machine).all()}

    # 매트릭스 형태로 변환
    skill_map: dict = {}
    for r in rows:
        wid = r.worker_id
        if wid not in skill_map:
            skill_map[wid] = {"worker_id": wid, "worker_name": users.get(wid, wid), "skills": []}
        skill_map[wid]["skills"].append({
            "id": r.id,
            "machine_id": r.machine_id,
            "machine_name": machines_q.get(r.machine_id, r.machine_id),
            "part_no": r.part_no,
            "skill_level": r.skill_level,
            "certified_at": str(r.certified_at) if r.certified_at else None,
            "certified_by": r.certified_by,
            "valid_until": str(r.valid_until) if r.valid_until else None,
        })
    return list(skill_map.values())


# ═══════════════════════════════════════════════════════════════════
# ⑤ 재고 ABC 분석
# ═══════════════════════════════════════════════════════════════════

@router.get("/abc-analysis")
def abc_analysis(
    days: int = 365,
    db: Session = Depends(get_db),
):
    """재고 ABC 분석 — 이동금액 기준 A(70%) / B(20%) / C(10%) 분류"""
    from app.models.ledger import StockLedger as SL
    from app.models.master import Item
    from sqlalchemy import func as sqlfunc
    cutoff = datetime.now() - timedelta(days=days)

    # 품목별 이동금액 합산 (입출고 절댓값 기준)
    rows = db.query(
        SL.part_no,
        sqlfunc.sum(sqlfunc.abs(SL.qty * SL.unit_price)).label("move_val"),
        sqlfunc.max(SL.txn_date).label("last_move"),
    ).filter(
        SL.txn_date >= cutoff.date(),
    ).group_by(SL.part_no).all()

    total_val = sum(float(r.move_val or 0) for r in rows)
    if total_val == 0:
        return {"total_items": 0, "items": []}

    items_sorted = sorted(rows, key=lambda r: float(r.move_val or 0), reverse=True)

    result = []
    cum = 0.0
    dead_cutoff = date.today() - timedelta(days=90)
    for r in items_sorted:
        mv = float(r.move_val or 0)
        cum += mv
        pct = cum / total_val
        cls = "A" if pct <= 0.7 else "B" if pct <= 0.9 else "C"
        last = r.last_move
        dead = (last < dead_cutoff) if last else True

        item = db.get(Item, r.part_no)
        result.append({
            "part_no": r.part_no,
            "part_name": item.name if item else r.part_no,
            "move_value": round(mv, 0),
            "cumulative_pct": round(cum / total_val * 100, 1),
            "abc_class": cls,
            "last_move": str(last) if last else None,
            "dead_stock": dead,
        })

    summary = {"A": 0, "B": 0, "C": 0, "dead": 0}
    for r in result:
        summary[r["abc_class"]] += 1
        if r["dead_stock"]:
            summary["dead"] += 1

    return {"total_items": len(result), "summary": summary, "items": result}


# ═══════════════════════════════════════════════════════════════════
# ⑥ MRP 자재 부족 예측
# ═══════════════════════════════════════════════════════════════════

@router.get("/mrp-alert")
def mrp_alert(
    days: int = 30,
    db: Session = Depends(get_db),
):
    """향후 N일 작업지시 BOM 수요 vs 현재고 부족 예측"""
    from app.models.master import BomLine, Item
    from app.models.ledger import StockLedger as SL
    from sqlalchemy import func as sqlfunc

    horizon = date.today() + timedelta(days=days)
    pending_wos = db.query(MesWorkOrder).filter(
        MesWorkOrder.plan_date <= horizon,
        MesWorkOrder.plan_date >= date.today(),
        MesWorkOrder.status.in_(["대기", "자재확인", "발행", WOStatus.pending, WOStatus.material_check, WOStatus.issued]),
    ).all()

    # 품목별 필요 수량 집계
    demand: dict = {}
    wo_map: dict = {}
    for wo in pending_wos:
        boms = db.query(BomLine).filter(BomLine.product_part_no == wo.part_no).all()
        for b in boms:
            comp = b.component_part_no
            needed = float(b.qty_per) * wo.target_qty
            demand[comp] = demand.get(comp, 0) + needed
            if comp not in wo_map:
                wo_map[comp] = []
            wo_map[comp].append({"wo_no": wo.wo_no, "part_no": wo.part_no, "qty": needed})

    # 현재고 계산
    stock_rows = db.query(
        SL.part_no,
        sqlfunc.sum(SL.qty).label("on_hand"),
    ).group_by(SL.part_no).all()
    stock_map = {r.part_no: float(r.on_hand or 0) for r in stock_rows}

    alerts = []
    for part_no, need in demand.items():
        on_hand = stock_map.get(part_no, 0)
        shortage = need - on_hand
        item = db.get(Item, part_no)
        alerts.append({
            "part_no": part_no,
            "part_name": item.name if item else part_no,
            "required_qty": round(need, 2),
            "on_hand_qty": round(on_hand, 2),
            "shortage_qty": round(max(0, shortage), 2),
            "is_short": shortage > 0,
            "related_wos": wo_map.get(part_no, []),
        })

    alerts.sort(key=lambda x: -x["shortage_qty"])
    return {
        "horizon_days": days,
        "wo_count": len(pending_wos),
        "shortage_items": sum(1 for a in alerts if a["is_short"]),
        "items": alerts,
    }


# ═══════════════════════════════════════════════════════════════════
# ⑦ 월별 손익 자동화
# ═══════════════════════════════════════════════════════════════════

@router.get("/monthly-pl")
def monthly_pl(
    year: int,
    month: int,
    db: Session = Depends(get_db),
):
    """월별 손익 = 출하 매출 - 실원가"""
    from app.models.sales import SalesOrder, Shipment
    from app.models.master import Item
    month_start = date(year, month, 1)
    month_end = date(year, month + 1, 1) if month < 12 else date(year + 1, 1, 1)

    # 출하 매출 (출하수량 × 품목 표준판가)
    shipments = db.query(Shipment).filter(
        Shipment.ship_date >= month_start,
        Shipment.ship_date < month_end,
    ).all()

    revenue_by_part: dict = {}
    for s in shipments:
        item = db.get(Item, s.part_no)
        price = float(item.std_sell_price or item.std_buy_price or 0) if item else 0
        part = s.part_no
        if part not in revenue_by_part:
            revenue_by_part[part] = {"part_no": part, "part_name": item.name if item else part, "revenue": 0, "qty": 0}
        revenue_by_part[part]["revenue"] += price * s.qty
        revenue_by_part[part]["qty"] += s.qty

    # 실원가 (WorkerSessionCost 집계)
    costs = db.query(WorkerSessionCost).join(
        WorkerSession, WorkerSessionCost.session_id == WorkerSession.id
    ).filter(
        WorkerSession.start_time >= datetime.combine(month_start, dt_time.min),
        WorkerSession.start_time < datetime.combine(month_end, dt_time.min),
    ).all()

    cost_by_part: dict = {}
    for c in costs:
        p = c.part_no
        if p not in cost_by_part:
            cost_by_part[p] = {"total_cost": 0, "material_cost": 0, "labor_cost": 0, "good_qty": 0}
        cost_by_part[p]["total_cost"] += float(c.total_cost)
        cost_by_part[p]["material_cost"] += float(c.material_cost)
        cost_by_part[p]["labor_cost"] += float(c.labor_cost)
        cost_by_part[p]["good_qty"] += c.good_qty

    # 품목별 손익 조합
    all_parts = set(revenue_by_part) | set(cost_by_part)
    items = []
    for p in all_parts:
        rv = revenue_by_part.get(p, {})
        co = cost_by_part.get(p, {})
        revenue = rv.get("revenue", 0)
        total_cost = co.get("total_cost", 0)
        profit = revenue - total_cost
        margin = round(profit / revenue * 100, 1) if revenue > 0 else None
        items.append({
            "part_no": p,
            "part_name": rv.get("part_name", co.get("part_name", p)),
            "shipped_qty": rv.get("qty", 0),
            "good_qty_produced": co.get("good_qty", 0),
            "revenue": round(revenue, 0),
            "material_cost": round(co.get("material_cost", 0), 0),
            "labor_cost": round(co.get("labor_cost", 0), 0),
            "total_cost": round(total_cost, 0),
            "profit": round(profit, 0),
            "margin_pct": margin,
        })

    items.sort(key=lambda x: -abs(x["profit"]))
    total_rev = sum(i["revenue"] for i in items)
    total_cost_sum = sum(i["total_cost"] for i in items)
    total_profit = total_rev - total_cost_sum

    return {
        "year": year, "month": month,
        "total_revenue": round(total_rev, 0),
        "total_cost": round(total_cost_sum, 0),
        "total_profit": round(total_profit, 0),
        "total_margin_pct": round(total_profit / total_rev * 100, 1) if total_rev > 0 else None,
        "items": items,
    }


# ═══════════════════════════════════════════════════════════════════
# ⑧ 클레임 LOT 역추적
# ═══════════════════════════════════════════════════════════════════

@router.get("/claim-trace")
def claim_trace(
    part_no: str,
    date_from: str,
    date_to: str,
    db: Session = Depends(get_db),
):
    """클레임 LOT 역추적 — 품번 + 기간 → 세션·검사·공정조건·안돈 풀 체인"""
    d_from = date.fromisoformat(date_from)
    d_to   = date.fromisoformat(date_to)

    # 1. 작업지시 → 세션
    wos = db.query(MesWorkOrder).filter(
        MesWorkOrder.part_no == part_no,
        MesWorkOrder.plan_date >= d_from,
        MesWorkOrder.plan_date <= d_to,
    ).all()

    result = []
    for wo in wos:
        for sess in wo.sessions:
            if sess.start_time.date() < d_from or sess.start_time.date() > d_to:
                continue

            # 검사 기록
            inspections = db.query(ArticleInspection).filter(
                ArticleInspection.session_id == sess.id
            ).all()

            # 공정 조건
            conditions = db.query(ProcessCondition).filter(
                ProcessCondition.session_id == sess.id
            ).all()

            # 안돈
            andons = db.query(AndonCall).filter(
                AndonCall.machine_id == sess.machine_id,
                AndonCall.called_at >= sess.start_time,
                AndonCall.called_at <= (sess.end_time or datetime.now()),
            ).all()

            # 파렛트 LOT
            pallets = db.query(MesPallet).filter(
                MesPallet.session_id == sess.id
            ).all()

            result.append({
                "wo_no": wo.wo_no,
                "session_id": sess.id,
                "machine_id": sess.machine_id,
                "worker_id": sess.worker_id,
                "start_time": sess.start_time.isoformat(),
                "end_time": sess.end_time.isoformat() if sess.end_time else None,
                "good_qty": sess.good_qty,
                "defect_qty": sess.defect_qty,
                "status": sess.status.value if hasattr(sess.status, 'value') else str(sess.status),
                "pallets": [{"pallet_id": p.pallet_id, "qty": p.qty} for p in pallets],
                "inspections": [
                    {
                        "id": i.id, "insp_type": i.insp_type, "result": i.result,
                        "dim1_spec": i.dim1_spec, "dim1_actual": i.dim1_actual,
                        "appearance": i.appearance, "note": i.note,
                        "created_at": i.created_at.isoformat(),
                    }
                    for i in inspections
                ],
                "process_conditions": [
                    {
                        "id": c.id,
                        "barrel_temp1": c.barrel_temp1, "injection_pressure": c.injection_pressure,
                        "cycle_time": c.cycle_time, "recorded_by": c.recorded_by,
                        "created_at": c.created_at.isoformat(),
                    }
                    for c in conditions
                ],
                "andons": [
                    {
                        "id": a.id, "andon_type": a.andon_type, "caller_id": a.caller_id,
                        "note": a.note, "is_resolved": a.is_resolved,
                        "called_at": a.called_at.isoformat(),
                    }
                    for a in andons
                ],
            })

    result.sort(key=lambda x: x["start_time"])
    return {
        "part_no": part_no,
        "date_from": date_from,
        "date_to": date_to,
        "wo_count": len(wos),
        "session_count": len(result),
        "sessions": result,
    }
