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
    wo = db.get(MesWorkOrder, wo_no)
    if not wo:
        raise HTTPException(404, f"작업지시 없음: {wo_no}")
    current = wo.status if isinstance(wo.status, str) else wo.status.value
    next_allowed = STATUS_FLOW.get(current)
    if next_allowed != body.status:
        raise HTTPException(400, f"현재 상태 '{current}'에서 '{body.status}'로 변경 불가 (다음: {next_allowed})")
    wo.status = body.status
    db.commit()
    return _wo_with_qr(wo)


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
    if wo.status == "대기":
        wo.status = "진행"
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

    # ② 금형 샷수 자동 누적
    if wo.mold_no:
        from app.models.mold import MoldOrder
        mold = db.get(MoldOrder, wo.mold_no)
        if mold:
            mold.production_shot_count = (mold.production_shot_count or 0) + session.shot_count
            since_pm = mold.production_shot_count - (mold.last_pm_shot or 0)
            if since_pm >= (mold.pm_cycle_shot or 500000):
                pass  # 알림 플래그 → Andon or 별도 로직으로 확장 가능

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
from app.models.mes_floor import ShiftHandover, MaterialRequisition, SetupChecklist

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
