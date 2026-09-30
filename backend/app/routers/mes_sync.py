"""
MES 연동 라우터
- POST /mes/push         : MES → ERP 생산실적 푸시 (동기화 스크립트가 호출)
- POST /mes/upload-excel : 생산계획대비실적 엑셀 업로드
- GET  /mes/daily        : 날짜별 수신 실적 조회
- GET  /mes/logs         : 동기화 이력 조회
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date, datetime
import json
import io

from app.database import get_db
from app.models.mes import MesSyncLog, MesProductionLog, MesPartMap, MesProductionCost
from app.models.production import ProductionOrder, DailyActual, POrdStatus
from app.models.ledger import StockLedger, LedgerType
from app.models.cost import ProductCostStd, LaborRate
from app.services.doc_no import next_doc_no
from sqlalchemy import func

router = APIRouter(prefix="/mes", tags=["MES연동"])


def _link_to_erp(db, log: MesProductionLog):
    """
    MES 실적 로그를 ERP 생산오더에 연결.
    MES 작업지시번호(PWO...)가 있으면 그걸 그대로 pord_no로 사용.
    없으면 part_no+date 기준으로 탐색하거나 자동 채번.
    """
    part_no = log.part_no
    prod_date = log.prod_date

    if log.mes_order_no:
        # 1순위: MES 작업지시번호로 생산오더 탐색
        pord = db.query(ProductionOrder).filter(
            ProductionOrder.pord_no == log.mes_order_no
        ).first()
        if not pord:
            pord = ProductionOrder(
                pord_no=log.mes_order_no,
                part_no=part_no,
                planned_qty=log.plan_qty or 0,
                plan_date=prod_date,
                status=POrdStatus.in_progress,
                mold_no=None,
            )
            db.add(pord)
            db.flush()
    else:
        # 2순위: part_no + date 탐색
        pord = db.query(ProductionOrder).filter(
            ProductionOrder.part_no == part_no,
            ProductionOrder.plan_date == prod_date,
            ProductionOrder.status != "취소",
        ).first()
        if not pord:
            pord_no = next_doc_no(db, "WO", "production_order", "pord_no")
            pord = ProductionOrder(
                pord_no=pord_no,
                part_no=part_no,
                planned_qty=log.plan_qty or 0,
                plan_date=prod_date,
                status=POrdStatus.in_progress,
                mold_no=None,
            )
            db.add(pord)
            db.flush()

    # 생산오더 실적 = 이 MES 로그의 actual_qty
    actual = log.actual_qty or 0
    pord.actual_qty = actual
    pord.planned_qty = log.plan_qty or pord.planned_qty
    if actual > 0 and actual >= pord.planned_qty > 0 and pord.status == POrdStatus.in_progress:
        pord.status = POrdStatus.completed
        pord.complete_date = prod_date
    elif actual > 0 and pord.status == POrdStatus.planned:
        pord.status = "진행중"

    # DailyActual 업서트
    da = db.query(DailyActual).filter(
        DailyActual.plan_id == pord.pord_no,
        DailyActual.prod_date == prod_date,
    ).first()
    if da:
        da.actual_qty = actual
    else:
        db.add(DailyActual(plan_id=pord.pord_no, prod_date=prod_date,
                           actual_qty=actual, note="MES연동"))

    log.synced_to_erp = True
    log.erp_pord_no = pord.pord_no


def _calc_and_deduct(db: Session, log: MesProductionLog):
    """
    BOM 기준 원자재 재고 차감 + 공수비/마진 계산.
    - 이미 계산된 기록이 있으면 업데이트 (멱등)
    - actual_qty = 0 이면 계산 생략
    """
    from app.models.master import BomLine, Item

    actual_qty = log.actual_qty or 0

    # 기존 원가 레코드 조회 (upsert)
    cost_rec = db.query(MesProductionCost).filter(
        MesProductionCost.mes_log_id == log.id
    ).first()
    if cost_rec is None:
        cost_rec = MesProductionCost(
            mes_log_id=log.id,
            prod_date=log.prod_date,
            part_no=log.part_no,
        )
        db.add(cost_rec)

    cost_rec.actual_qty = actual_qty
    cost_rec.calc_at = datetime.now()

    if actual_qty == 0:
        cost_rec.material_cost = 0
        cost_rec.labor_cost = 0
        cost_rec.revenue = 0
        cost_rec.margin = 0
        cost_rec.margin_rate = None
        db.flush()
        return

    # ── 1. 원자재비 계산 (BOM × 매입단가) ──────────────────────────────
    bom_lines = db.query(BomLine).filter(BomLine.product_part_no == log.part_no).all()
    cost_rec.bom_ok = len(bom_lines) > 0

    material_cost = 0.0
    if bom_lines:
        component_nos = [b.component_part_no for b in bom_lines]
        items = {
            i.part_no: i
            for i in db.query(Item).filter(Item.part_no.in_(component_nos)).all()
        }
        for b in bom_lines:
            item = items.get(b.component_part_no)
            price = float(item.std_buy_price or 0) if item else 0
            material_cost += float(b.qty_per) * actual_qty * price

    cost_rec.material_cost = round(material_cost, 2)

    # ── 2. 원자재 재고 차감 (멱등: 같은 ref_no 없을 때만) ─────────────
    if bom_lines and actual_qty > 0:
        ref_no = log.mes_order_no or f"MES-{log.id}"
        already = db.query(StockLedger).filter(
            StockLedger.ref_no == ref_no,
            StockLedger.ref_type == "MES",
        ).first()
        if not already:
            items = items if bom_lines else {}
            for b in bom_lines:
                consume_qty = int(float(b.qty_per) * actual_qty)
                if consume_qty == 0:
                    continue
                item = items.get(b.component_part_no)
                price = float(item.std_buy_price or 0) if item else 0
                db.add(StockLedger(
                    txn_date=log.prod_date,
                    part_no=b.component_part_no,
                    ledger_type=LedgerType.consumption,
                    qty=-consume_qty,
                    unit_price=price,
                    ref_type="MES",
                    ref_no=ref_no,
                    note=f"MES생산투입: {log.part_no} × {actual_qty}EA",
                ))
            cost_rec.stock_deducted = True

    # ── 3. 공수비 계산 ───────────────────────────────────────────────────
    cost_std = db.query(ProductCostStd).filter(
        ProductCostStd.part_no == log.part_no
    ).first()
    cost_rec.labor_ok = cost_std is not None

    labor_cost = 0.0
    if cost_std:
        # shift에 따라 임률 결정
        if log.shift and "야" in log.shift:
            rate_row = db.query(LaborRate).filter(
                LaborRate.process_name.like("%야간%"),
                LaborRate.active == True,
            ).first()
        else:
            rate_row = db.query(LaborRate).filter(
                LaborRate.id == cost_std.process_id,
            ).first()
        if rate_row:
            labor_cost = float(cost_std.std_labor_min) / 60.0 * float(rate_row.rate_per_hour) * actual_qty

    cost_rec.labor_cost = round(labor_cost, 2)

    # ── 4. 판매단가 → 매출 → 마진 ───────────────────────────────────────
    item_master = db.query(Item).filter(Item.part_no == log.part_no).first()
    sell_price = float(item_master.std_sell_price or 0) if item_master else 0
    cost_rec.std_sell_price = sell_price

    revenue = sell_price * actual_qty
    cost_rec.revenue = round(revenue, 2)

    margin = revenue - material_cost - labor_cost
    cost_rec.margin = round(margin, 2)
    cost_rec.margin_rate = round(margin / revenue * 100, 1) if revenue > 0 else None

    db.flush()


@router.post("/push")
def push_production(body: dict, db: Session = Depends(get_db)):
    """
    MES 동기화 스크립트가 호출하는 엔드포인트.
    body 형식:
    {
        "target_date": "2026-07-23",
        "records": [
            {
                "part_no": "GC1-MO-0026",
                "part_name": "커버A",
                "machine_no": "INJ-01",
                "shift": "주간",
                "plan_qty": 500,
                "actual_qty": 490,
                "defect_qty": 10,
                "defect_reason": "치수불량",
                "run_time_min": 480,
                "down_time_min": 30,
                "down_reason": "금형교체",
                "worker": "홍길동",
                "mes_order_no": "WO-2026-001"
            },
            ...
        ]
    }
    """
    target_date_str = body.get("target_date")
    records = body.get("records", [])

    if not target_date_str:
        raise HTTPException(400, "target_date 필수")

    try:
        target_date = date.fromisoformat(target_date_str)
    except ValueError:
        raise HTTPException(400, "target_date 형식 오류 (YYYY-MM-DD)")

    rows_ok = 0
    rows_err = 0
    err_messages = []

    for rec in records:
        part_no = rec.get("part_no", "").strip()
        if not part_no:
            rows_err += 1
            continue

        try:
            # MES 실적 로그 저장 (upsert: 같은 날짜+품번+설비+교대 중복 방지)
            existing = db.query(MesProductionLog).filter(
                MesProductionLog.prod_date == target_date,
                MesProductionLog.part_no == part_no,
                MesProductionLog.machine_no == rec.get("machine_no"),
                MesProductionLog.shift == rec.get("shift"),
            ).first()

            if existing:
                log = existing
            else:
                log = MesProductionLog(prod_date=target_date, part_no=part_no)
                db.add(log)

            log.part_name = rec.get("part_name")
            log.machine_no = rec.get("machine_no")
            log.shift = rec.get("shift")
            log.plan_qty = int(rec.get("plan_qty", 0))
            log.actual_qty = int(rec.get("actual_qty", 0))
            log.defect_qty = int(rec.get("defect_qty", 0))
            log.defect_reason = rec.get("defect_reason")
            log.run_time_min = float(rec.get("run_time_min", 0)) if rec.get("run_time_min") else None
            log.down_time_min = float(rec.get("down_time_min", 0)) if rec.get("down_time_min") else None
            log.down_reason = rec.get("down_reason")
            log.worker = rec.get("worker")
            log.mes_order_no = rec.get("mes_order_no")
            log.raw_json = json.dumps(rec, ensure_ascii=False)
            log.sync_at = datetime.now()

            db.flush()
            _link_to_erp(db, log)
            db.flush()
            rows_ok += 1

        except Exception as e:
            rows_err += 1
            err_messages.append(f"{part_no}: {str(e)}")

    # 동기화 이력 저장
    sync_log = MesSyncLog(
        target_date=target_date,
        rows_fetched=len(records),
        rows_ok=rows_ok,
        rows_err=rows_err,
        status="success" if rows_err == 0 else ("partial" if rows_ok > 0 else "error"),
        message="\n".join(err_messages) if err_messages else None,
    )
    db.add(sync_log)
    db.commit()

    return {
        "target_date": target_date_str,
        "rows_fetched": len(records),
        "rows_ok": rows_ok,
        "rows_err": rows_err,
        "errors": err_messages[:5],
    }


@router.get("/daily")
def get_daily(
    prod_date: str = Query(..., description="조회날짜 YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """날짜별 MES 수신 생산실적 조회"""
    try:
        d = date.fromisoformat(prod_date)
    except ValueError:
        raise HTTPException(400, "날짜 형식 오류")

    rows = db.query(MesProductionLog).filter(
        MesProductionLog.prod_date == d
    ).order_by(MesProductionLog.part_no, MesProductionLog.machine_no).all()

    return [{
        "id": r.id,
        "prod_date": str(r.prod_date),
        "part_no": r.part_no,
        "part_name": r.part_name,
        "machine_no": r.machine_no,
        "shift": r.shift,
        "plan_qty": r.plan_qty,
        "actual_qty": r.actual_qty,
        "defect_qty": r.defect_qty,
        "defect_rate": round(r.defect_qty / (r.actual_qty + r.defect_qty) * 100, 1)
                       if (r.actual_qty + r.defect_qty) > 0 else 0,
        "defect_reason": r.defect_reason,
        "run_time_min": r.run_time_min,
        "down_time_min": r.down_time_min,
        "down_reason": r.down_reason,
        "worker": r.worker,
        "mes_order_no": r.mes_order_no,
        "erp_pord_no": r.erp_pord_no,
        "synced_to_erp": r.synced_to_erp,
    } for r in rows]


@router.get("/daily-summary")
def get_daily_summary(
    start: str = Query(...),
    end: str = Query(...),
    db: Session = Depends(get_db),
):
    """기간별 일일 생산실적 요약 (대시보드용)"""
    rows = db.execute(text("""
        SELECT
            prod_date,
            COUNT(DISTINCT part_no) AS item_cnt,
            SUM(actual_qty)         AS total_actual,
            SUM(defect_qty)         AS total_defect,
            SUM(plan_qty)           AS total_plan
        FROM mes_production_log
        WHERE prod_date BETWEEN :s AND :e
        GROUP BY prod_date
        ORDER BY prod_date
    """), {"s": start, "e": end}).fetchall()

    return [{
        "prod_date": str(r[0]),
        "item_cnt": r[1],
        "total_actual": r[2],
        "total_defect": r[3],
        "total_plan": r[4],
        "achievement_rate": round(r[2] / r[4] * 100, 1) if r[4] else 0,
    } for r in rows]


@router.get("/logs")
def get_sync_logs(limit: int = 20, db: Session = Depends(get_db)):
    """동기화 이력 조회"""
    logs = db.query(MesSyncLog).order_by(MesSyncLog.sync_at.desc()).limit(limit).all()
    return [{
        "id": l.id,
        "sync_at": l.sync_at.strftime("%Y-%m-%d %H:%M:%S"),
        "target_date": str(l.target_date),
        "rows_fetched": l.rows_fetched,
        "rows_ok": l.rows_ok,
        "rows_err": l.rows_err,
        "status": l.status,
        "message": l.message,
    } for l in logs]


@router.post("/upload-excel")
async def upload_excel(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    생산계획대비실적 엑셀 업로드.
    필수 컬럼: 날짜(생산일), 품번, 계획수량, 실적수량
    선택 컬럼: 품명, 설비번호, 교대, 불량수량, 불량원인, 가동시간, 비가동시간, 비가동원인, 작업자, 작업지시번호
    """
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(500, "openpyxl 패키지 필요: pip install openpyxl")

    content = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        ws = wb.active
    except Exception as e:
        raise HTTPException(400, f"엑셀 파일 읽기 오류: {e}")

    # 헤더 행 찾기 (첫 번째 행)
    headers = []
    for cell in ws[1]:
        headers.append(str(cell.value).strip() if cell.value is not None else "")

    # 컬럼 매핑 (MES 양식 기준 + 한국어/영어 혼용 지원)
    COL_MAP = {
        "날짜":      ["계획일", "날짜", "생산일", "작업일", "일자", "DATE", "PROD_DATE", "WOR_DATE", "ORD_DATE"],
        "품번":      ["품목코드", "품번", "PART_NO", "ITEM_CD", "ITEM_CODE"],
        "품명":      ["품명", "품목명", "PART_NAME", "ITEM_NM", "ITEM_NAME"],
        "설비번호":  ["설비", "설비번호", "기계번호", "MACHINE_NO", "EQUIP_NAME", "EQP_NO"],
        "교대":      ["주/야", "교/야", "교대", "SHIFT", "SHIFTWORK"],
        "계획수량":  ["계획수량", "계획", "PLAN_QTY", "PLN_QTY"],
        "실적수량":  ["실적수량", "실적", "양품수량", "생산수량", "GOOD_QTY", "ACT_QTY", "ACTUAL_QTY"],
        "불량수량":  ["불량수량", "불량", "BAD_QTY", "NG_QTY", "DEFECT_QTY"],
        "불량원인":  ["불량원인", "불량원인명", "BAD_REASON", "NG_REASON", "DEFECT_REASON"],
        "가동시간":  ["가동시간", "RUN_TIME", "SILDONG_TIME"],
        "비가동시간":["비가동시간", "STOP_MIN", "DOWN_TIME"],
        "비가동원인":["비가동원인", "STOP_REASON", "DOWN_REASON"],
        "작업자":    ["작업자", "작업자명", "WORKER", "WORKER_NM"],
        "작업지시번호": ["작업지시번호", "지시번호", "WO_NO", "PRD_WO_CD", "MES_ORDER_NO"],
    }

    col_idx = {}  # key -> 0-based column index
    for key, aliases in COL_MAP.items():
        for alias in aliases:
            for i, h in enumerate(headers):
                if h.upper() == alias.upper():
                    col_idx[key] = i
                    break
            if key in col_idx:
                break

    if "날짜" not in col_idx:
        raise HTTPException(400, f"'날짜(생산일)' 컬럼을 찾을 수 없습니다. 헤더: {headers}")
    if "품번" not in col_idx:
        raise HTTPException(400, f"'품번' 컬럼을 찾을 수 없습니다. 헤더: {headers}")
    if "실적수량" not in col_idx:
        raise HTTPException(400, f"'실적수량(양품수량)' 컬럼을 찾을 수 없습니다. 헤더: {headers}")

    def cell_val(row, key, default=None):
        if key not in col_idx:
            return default
        v = row[col_idx[key]]
        return v.value if v.value is not None else default

    def to_date(v):
        if v is None:
            return None
        if isinstance(v, (date, datetime)):
            return v.date() if isinstance(v, datetime) else v
        s = str(v).strip()
        for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d"]:
            try:
                return datetime.strptime(s, fmt).date()
            except:
                pass
        return None

    # 매핑 테이블 로드 (mes_part_no → erp_part_no)
    part_map = {m.mes_part_no: m.erp_part_no for m in db.query(MesPartMap).all()}

    rows_ok = 0
    rows_err = 0
    err_messages = []
    dates_seen = set()
    unmapped = []

    for row in ws.iter_rows(min_row=2):
        raw_date = cell_val(row, "날짜")
        raw_part = cell_val(row, "품번")

        if raw_date is None and raw_part is None:
            continue  # 빈 행 스킵

        prod_date = to_date(raw_date)
        mes_part_no = str(raw_part).strip() if raw_part else None

        # 매핑 적용: MES 품번 → ERP 품번
        part_no = part_map.get(mes_part_no, mes_part_no) if mes_part_no else None

        if not prod_date or not part_no:
            rows_err += 1
            err_messages.append(f"날짜/품번 누락 (날짜={raw_date}, 품번={raw_part})")
            continue

        try:
            actual_qty = int(float(cell_val(row, "실적수량", 0) or 0))
            plan_qty   = int(float(cell_val(row, "계획수량", 0) or 0))
            defect_qty = int(float(cell_val(row, "불량수량", 0) or 0))
            machine_no = str(cell_val(row, "설비번호", "") or "").strip() or None
            shift      = str(cell_val(row, "교대", "") or "").strip() or None
            defect_reason = str(cell_val(row, "불량원인", "") or "").strip() or None
            run_time = cell_val(row, "가동시간")
            down_time = cell_val(row, "비가동시간")
            down_reason = str(cell_val(row, "비가동원인", "") or "").strip() or None
            worker = str(cell_val(row, "작업자", "") or "").strip() or None
            mes_order_no = str(cell_val(row, "작업지시번호", "") or "").strip() or None

            existing = db.query(MesProductionLog).filter(
                MesProductionLog.prod_date == prod_date,
                MesProductionLog.part_no == part_no,
                MesProductionLog.machine_no == machine_no,
                MesProductionLog.shift == shift,
            ).first()

            if existing:
                log = existing
            else:
                log = MesProductionLog(prod_date=prod_date, part_no=part_no)
                db.add(log)

            log.part_name     = str(cell_val(row, "품명", "") or "").strip() or None
            log.machine_no    = machine_no
            log.shift         = shift
            log.plan_qty      = plan_qty
            log.actual_qty    = actual_qty
            log.defect_qty    = defect_qty
            log.defect_reason = defect_reason
            log.run_time_min  = float(run_time) if run_time is not None else None
            log.down_time_min = float(down_time) if down_time is not None else None
            log.down_reason   = down_reason
            log.worker        = worker
            log.mes_order_no  = mes_order_no
            log.sync_at       = datetime.now()

            db.flush()
            _link_to_erp(db, log)
            db.flush()
            _calc_and_deduct(db, log)
            dates_seen.add(str(prod_date))
            rows_ok += 1

        except Exception as e:
            rows_err += 1
            err_messages.append(f"{mes_part_no}→{part_no} ({prod_date}): {e}")

    # 업로드 이력 저장
    if dates_seen:
        from_date = min(dates_seen)
        sync_log = MesSyncLog(
            target_date=date.fromisoformat(from_date),
            rows_fetched=rows_ok + rows_err,
            rows_ok=rows_ok,
            rows_err=rows_err,
            status="success" if rows_err == 0 else ("partial" if rows_ok > 0 else "error"),
            message=f"엑셀업로드: {file.filename}\n" + "\n".join(err_messages[:5]) if err_messages else f"엑셀업로드: {file.filename}",
        )
        db.add(sync_log)

    db.commit()

    return {
        "filename": file.filename,
        "rows_fetched": rows_ok + rows_err,
        "rows_ok": rows_ok,
        "rows_err": rows_err,
        "dates": sorted(dates_seen),
        "errors": err_messages[:10],
        "col_mapping": {k: headers[v] for k, v in col_idx.items()},
        "unmapped_parts": unmapped,  # ERP에 없는 MES 품번
    }


@router.get("/cost-report")
def get_cost_report(
    start: str = Query(..., description="시작일 YYYY-MM-DD"),
    end: str = Query(..., description="종료일 YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """기간별 생산원가·마진 보고서"""
    rows = db.execute(text("""
        SELECT
            c.prod_date,
            c.part_no,
            i.name            AS part_name,
            SUM(c.actual_qty) AS actual_qty,
            SUM(c.material_cost) AS material_cost,
            SUM(c.labor_cost)    AS labor_cost,
            SUM(c.revenue)       AS revenue,
            SUM(c.margin)        AS margin,
            MAX(c.bom_ok)        AS bom_ok,
            MAX(c.labor_ok)      AS labor_ok,
            MAX(c.stock_deducted) AS stock_deducted
        FROM mes_production_cost c
        LEFT JOIN item i ON i.part_no = c.part_no
        WHERE c.prod_date BETWEEN :s AND :e
        GROUP BY c.prod_date, c.part_no
        ORDER BY c.prod_date, c.part_no
    """), {"s": start, "e": end}).fetchall()

    result = []
    for r in rows:
        # 0=prod_date,1=part_no,2=part_name,3=actual_qty,4=material_cost,
        # 5=labor_cost,6=revenue,7=margin,8=bom_ok,9=labor_ok,10=stock_deducted
        revenue = float(r[6] or 0)
        margin  = float(r[7] or 0)
        result.append({
            "prod_date": str(r[0]),
            "part_no": r[1],
            "part_name": r[2],
            "actual_qty": r[3],
            "material_cost": float(r[4] or 0),
            "labor_cost": float(r[5] or 0),
            "revenue": revenue,
            "margin": margin,
            "margin_rate": round(margin / revenue * 100, 1) if revenue > 0 else None,
            "bom_ok": bool(r[8]),
            "labor_ok": bool(r[9]),
            "stock_deducted": bool(r[10]),
        })
    return result


@router.get("/cost-summary")
def get_cost_summary(
    start: str = Query(...),
    end: str = Query(...),
    db: Session = Depends(get_db),
):
    """기간 합계 원가 요약"""
    r = db.execute(text("""
        SELECT
            SUM(actual_qty),
            SUM(material_cost),
            SUM(labor_cost),
            SUM(revenue),
            SUM(margin),
            COUNT(DISTINCT part_no),
            SUM(CASE WHEN bom_ok THEN 1 ELSE 0 END),
            SUM(CASE WHEN NOT bom_ok THEN 1 ELSE 0 END)
        FROM mes_production_cost
        WHERE prod_date BETWEEN :s AND :e
    """), {"s": start, "e": end}).fetchone()

    revenue = float(r[3] or 0)
    margin  = float(r[4] or 0)
    return {
        "total_qty": r[0] or 0,
        "total_material_cost": float(r[1] or 0),
        "total_labor_cost": float(r[2] or 0),
        "total_revenue": revenue,
        "total_margin": margin,
        "margin_rate": round(margin / revenue * 100, 1) if revenue > 0 else None,
        "part_count": r[5] or 0,
        "bom_ok_count": r[6] or 0,
        "bom_missing_count": r[7] or 0,
    }


@router.get("/part-map")
def get_part_map(db: Session = Depends(get_db)):
    """MES→ERP 품번 매핑 목록"""
    rows = db.query(MesPartMap).order_by(MesPartMap.mes_part_no).all()
    return [{"id": r.id, "mes_part_no": r.mes_part_no, "erp_part_no": r.erp_part_no, "note": r.note} for r in rows]


@router.post("/part-map")
def upsert_part_map(body: dict, db: Session = Depends(get_db)):
    """매핑 추가/수정"""
    mes = (body.get("mes_part_no") or "").strip()
    erp = (body.get("erp_part_no") or "").strip()
    if not mes or not erp:
        raise HTTPException(400, "mes_part_no, erp_part_no 필수")
    existing = db.query(MesPartMap).filter(MesPartMap.mes_part_no == mes).first()
    if existing:
        existing.erp_part_no = erp
        existing.note = body.get("note")
    else:
        db.add(MesPartMap(mes_part_no=mes, erp_part_no=erp, note=body.get("note")))
    db.commit()
    return {"ok": True}


@router.delete("/part-map/{map_id}")
def delete_part_map(map_id: int, db: Session = Depends(get_db)):
    """매핑 삭제"""
    m = db.query(MesPartMap).filter(MesPartMap.id == map_id).first()
    if not m:
        raise HTTPException(404, "없음")
    db.delete(m)
    db.commit()
    return {"ok": True}


@router.get("/template")
def download_template():
    """엑셀 업로드 양식 컬럼 안내"""
    return {
        "required_columns": ["날짜", "품번", "실적수량"],
        "optional_columns": ["품명", "설비번호", "교대", "계획수량", "불량수량", "불량원인",
                             "가동시간(분)", "비가동시간(분)", "비가동원인", "작업자", "작업지시번호"],
        "date_formats": ["YYYY-MM-DD", "YYYY/MM/DD", "YYYY.MM.DD"],
        "note": "첫 번째 행이 헤더여야 합니다. 엑셀의 날짜 형식 셀도 인식합니다.",
    }
