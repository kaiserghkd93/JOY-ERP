from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime
from app.database import get_db
from app.models.mold import (
    MoldOrder, MoldPart, MoldProcess, MoldTrial,
    MoldOrderStatus, MoldPartStatus, MoldProcessStatus, MoldProcessType, MoldTrialResult,
)
from app.models.master import Partner

router = APIRouter(prefix="/mold", tags=["금형관리"])

DEFAULT_PROCESSES = [
    (1, "CNC 황삭"),
    (2, "CNC 정삭"),
    (3, "방전가공"),
    (4, "와이어컷"),
    (5, "열처리"),
    (6, "연마"),
    (7, "조립"),
]

DEFAULT_PARTS = ["상형(Core)", "하형(Cavity)"]


def _order_to_dict(order: MoldOrder, db: Session) -> dict:
    partner_map = {p.partner_id: p.name for p in db.query(Partner).all()}
    today = date.today()
    d_day = (order.due_date - today).days

    parts = []
    for part in sorted(order.parts, key=lambda p: p.seq):
        procs = []
        for proc in part.processes:
            # 공수 계산 (분)
            duration_min = None
            if proc.actual_start and proc.actual_end:
                st = proc.actual_start_time or "00:00"
                et = proc.actual_end_time or "00:00"
                try:
                    dt_start = datetime.combine(proc.actual_start, datetime.strptime(st, "%H:%M").time())
                    dt_end   = datetime.combine(proc.actual_end,   datetime.strptime(et, "%H:%M").time())
                    diff = (dt_end - dt_start).total_seconds() / 60
                    if diff > 0:
                        duration_min = int(diff)
                except Exception:
                    pass

            procs.append({
                "id": proc.id,
                "seq": proc.seq,
                "process_name": proc.process_name,
                "process_type": proc.process_type,
                "assignee": proc.assignee,
                "partner_id": proc.partner_id,
                "partner_name": partner_map.get(proc.partner_id, "") if proc.partner_id else "",
                "po_no": proc.po_no,
                "plan_start": str(proc.plan_start) if proc.plan_start else None,
                "plan_end": str(proc.plan_end) if proc.plan_end else None,
                "actual_start": str(proc.actual_start) if proc.actual_start else None,
                "actual_end": str(proc.actual_end) if proc.actual_end else None,
                "actual_start_time": proc.actual_start_time,
                "actual_end_time": proc.actual_end_time,
                "duration_min": duration_min,
                "status": proc.status,
                "note": proc.note,
            })

        # 부품 전체 공정 기준 진행률
        total = len(procs)
        done  = sum(1 for p in procs if p["status"] == MoldProcessStatus.completed)
        pct   = round(done / total * 100) if total else 0

        # 현재 공정 (진행중 우선, 없으면 첫 대기)
        current = next((p["process_name"] for p in procs if p["status"] == MoldProcessStatus.in_progress), None)
        if not current:
            current = next((p["process_name"] for p in procs if p["status"] == MoldProcessStatus.waiting), "완료")

        parts.append({
            "id": part.id,
            "part_name": part.part_name,
            "seq": part.seq,
            "status": part.status,
            "pct": pct,
            "current_process": current,
            "processes": procs,
            "note": part.note,
        })

    # 전체 진행률 (모든 부품 공정 기준)
    all_procs = [p for part in order.parts for p in part.processes]
    total_all = len(all_procs)
    done_all  = sum(1 for p in all_procs if p.status == MoldProcessStatus.completed)
    total_pct = round(done_all / total_all * 100) if total_all else 0

    trials = [{
        "id": t.id,
        "trial_no": t.trial_no,
        "trial_date": str(t.trial_date),
        "result": t.result,
        "sample_qty": t.sample_qty,
        "customer_attended": t.customer_attended,
        "issues": t.issues,
        "note": t.note,
    } for t in sorted(order.trials, key=lambda t: t.trial_date)]

    # 상태 자동 동기화 (조회 시점)
    if order.status not in (MoldOrderStatus.cancelled,):
        all_part_statuses = [p.status for p in order.parts]
        if all_part_statuses and all(s == MoldPartStatus.completed for s in all_part_statuses):
            if order.status != MoldOrderStatus.completed:
                order.status = MoldOrderStatus.completed
                db.commit()

    return {
        "mold_no": order.mold_no,
        "customer_id": order.customer_id,
        "customer_name": partner_map.get(order.customer_id, order.customer_id),
        "mold_name": order.mold_name,
        "cavity": order.cavity,
        "material": order.material,
        "order_date": str(order.order_date),
        "due_date": str(order.due_date),
        "d_day": d_day,
        "mold_fee": float(order.mold_fee) if order.mold_fee else None,
        "status": order.status,
        "note": order.note,
        "total_pct": total_pct,
        "parts": parts,
        "trials": trials,
    }


@router.get("/orders")
def list_orders(status: str | None = None, db: Session = Depends(get_db)):
    """금형 수주 목록"""
    q = db.query(MoldOrder)
    if status:
        q = q.filter(MoldOrder.status == status)
    orders = q.order_by(MoldOrder.due_date).all()
    return [_order_to_dict(o, db) for o in orders]


@router.get("/orders/{mold_no}")
def get_order(mold_no: str, db: Session = Depends(get_db)):
    """금형 수주 상세"""
    order = db.get(MoldOrder, mold_no)
    if not order:
        raise HTTPException(404, f"금형 없음: {mold_no}")
    return _order_to_dict(order, db)


@router.post("/orders")
def create_order(body: dict, db: Session = Depends(get_db)):
    """금형 수주 등록 (기본 부품/공정 자동 생성)"""
    from app.services.doc_no import next_doc_no

    mold_no = next_doc_no(db, "MD", "mold_order", "mold_no")
    order = MoldOrder(
        mold_no=mold_no,
        customer_id=body["customer_id"],
        mold_name=body["mold_name"],
        cavity=int(body.get("cavity", 1)),
        material=body.get("material"),
        order_date=date.fromisoformat(body["order_date"]),
        due_date=date.fromisoformat(body["due_date"]),
        mold_fee=float(body["mold_fee"]) if body.get("mold_fee") else None,
        note=body.get("note"),
    )
    db.add(order)
    db.flush()

    # 기본 부품 자동 생성 (상형/하형 + 요청 추가 부품)
    part_names = body.get("parts") or DEFAULT_PARTS
    for seq, pname in enumerate(part_names, 1):
        part = MoldPart(mold_no=mold_no, part_name=pname, seq=seq)
        db.add(part)
        db.flush()
        # 각 부품에 기본 공정 자동 생성
        for pseq, pname2 in DEFAULT_PROCESSES:
            db.add(MoldProcess(
                part_id=part.id,
                seq=pseq,
                process_name=pname2,
                process_type=MoldProcessType.internal,
            ))

    db.commit()
    db.refresh(order)
    return _order_to_dict(order, db)


@router.patch("/orders/{mold_no}")
def update_order(mold_no: str, body: dict, db: Session = Depends(get_db)):
    """금형 수주 수정"""
    order = db.get(MoldOrder, mold_no)
    if not order:
        raise HTTPException(404)
    for field in ["mold_name", "cavity", "material", "note"]:
        if field in body:
            setattr(order, field, body[field])
    if "due_date" in body:
        order.due_date = date.fromisoformat(body["due_date"])
    if "mold_fee" in body:
        order.mold_fee = float(body["mold_fee"]) if body["mold_fee"] else None
    if "status" in body:
        order.status = body["status"]
    db.commit()
    return _order_to_dict(order, db)


@router.post("/orders/{mold_no}/parts")
def add_part(mold_no: str, body: dict, db: Session = Depends(get_db)):
    """부품 추가"""
    order = db.get(MoldOrder, mold_no)
    if not order:
        raise HTTPException(404)
    max_seq = max((p.seq for p in order.parts), default=0)
    part = MoldPart(
        mold_no=mold_no,
        part_name=body["part_name"],
        seq=max_seq + 1,
    )
    db.add(part)
    db.flush()
    for pseq, pname in DEFAULT_PROCESSES:
        db.add(MoldProcess(part_id=part.id, seq=pseq, process_name=pname,
                           process_type=MoldProcessType.internal))
    db.commit()
    return _order_to_dict(order, db)


@router.patch("/process/{process_id}")
def update_process(process_id: int, body: dict, db: Session = Depends(get_db)):
    """공정 상태/담당자/외주처 수정"""
    proc = db.get(MoldProcess, process_id)
    if not proc:
        raise HTTPException(404, "공정 없음")

    if "status" in body:
        proc.status = body["status"]
        if body["status"] == MoldProcessStatus.in_progress and not proc.actual_start:
            proc.actual_start = date.today()
        if body["status"] == MoldProcessStatus.completed and not proc.actual_end:
            proc.actual_end = date.today()
        if body["status"] == MoldProcessStatus.outsourced:
            proc.process_type = MoldProcessType.outsource

    for field in ["process_type", "assignee", "partner_id", "po_no",
                  "plan_start", "plan_end", "actual_start", "actual_end",
                  "actual_start_time", "actual_end_time", "note"]:
        if field in body:
            val = body[field]
            if field in ("plan_start", "plan_end", "actual_start", "actual_end") and val:
                val = date.fromisoformat(val)
            setattr(proc, field, val)

    # 부품 상태 자동 업데이트
    part = db.get(MoldPart, proc.part_id)
    if part:
        all_s = [p.status for p in part.processes]
        if all(s == MoldProcessStatus.completed for s in all_s):
            part.status = MoldPartStatus.completed
        elif any(s in (MoldProcessStatus.in_progress, MoldProcessStatus.outsourced) for s in all_s):
            part.status = MoldPartStatus.in_progress
        else:
            part.status = MoldPartStatus.waiting

    db.commit()
    # 금형 수주 상태 자동 업데이트
    order = db.get(MoldOrder, part.mold_no)
    if order and order.status not in (MoldOrderStatus.cancelled,):
        all_part_statuses = [p.status for p in order.parts]
        if all_part_statuses and all(s == MoldPartStatus.completed for s in all_part_statuses):
            order.status = MoldOrderStatus.completed
        elif any(s == MoldPartStatus.in_progress for s in all_part_statuses):
            if order.status == MoldOrderStatus.completed:
                order.status = MoldOrderStatus.in_progress
        db.commit()
    return _order_to_dict(order, db)


@router.post("/orders/{mold_no}/trials")
def add_trial(mold_no: str, body: dict, db: Session = Depends(get_db)):
    """시사출 이력 추가"""
    order = db.get(MoldOrder, mold_no)
    if not order:
        raise HTTPException(404)
    trial = MoldTrial(
        mold_no=mold_no,
        trial_no=body.get("trial_no", "T0"),
        trial_date=date.fromisoformat(body["trial_date"]),
        result=body.get("result", MoldTrialResult.ng),
        sample_qty=int(body.get("sample_qty", 0)),
        customer_attended=bool(body.get("customer_attended", False)),
        issues=body.get("issues"),
        note=body.get("note"),
    )
    db.add(trial)
    db.commit()
    return _order_to_dict(order, db)


@router.delete("/orders/{mold_no}")
def delete_order(mold_no: str, db: Session = Depends(get_db)):
    """금형 수주 삭제"""
    order = db.get(MoldOrder, mold_no)
    if not order:
        raise HTTPException(404)
    db.delete(order)
    db.commit()
    return {"ok": True}


@router.delete("/orders/{mold_no}/trials/{trial_id}")
def delete_trial(mold_no: str, trial_id: int, db: Session = Depends(get_db)):
    t = db.get(MoldTrial, trial_id)
    if not t or t.mold_no != mold_no:
        raise HTTPException(404)
    db.delete(t)
    db.commit()
    order = db.get(MoldOrder, mold_no)
    return _order_to_dict(order, db)
