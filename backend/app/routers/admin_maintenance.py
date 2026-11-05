"""
관리자 전용 유지보수 엔드포인트
- 테스트 데이터 삭제 (2026-10 이전)
- 나라엠텍 BOM 아이템 업로드
"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db, engine
from app.models.master import Item, ItemType

router = APIRouter(prefix="/admin", tags=["admin-maintenance"])

CUTOFF = date(2026, 11, 1)   # 2026-10-31 이전 모두 삭제 (= < 2026-11-01)

# 외주처 파트너 서브쿼리 (receipt/inspection/PO 유지용)
_OUTSOURCE_PARTNER_SQ = (
    "SELECT partner_id FROM partner WHERE partner_type = 'supplier'"
)
# 외주 입고 gr_no 목록 (keep)
_KEEP_GR_SQ = (
    f"SELECT gr_no FROM receipt "
    f"WHERE partner_id IN ({_OUTSOURCE_PARTNER_SQ})"
)
# 외주 PO no 목록 (keep)
_KEEP_PO_SQ = (
    f"SELECT DISTINCT po_no FROM receipt "
    f"WHERE po_no IS NOT NULL AND partner_id IN ({_OUTSOURCE_PARTNER_SQ})"
)


@router.post("/cleanup-pre-nov2026")
def cleanup_pre_nov2026(confirm: str):
    """
    2026-11-01 이전 트랜잭션 데이터 삭제 (= 10월31일 기준).
    외주처(외주 매입) 입고·발주·검사 기록은 유지.
    confirm="DELETE_TEST_DATA" 를 전달해야 실행됨.
    """
    if confirm != "DELETE_TEST_DATA":
        raise HTTPException(400, "confirm 파라미터에 'DELETE_TEST_DATA' 를 전달하세요")

    deleted = {}
    errors = {}

    # engine.connect()를 직접 사용해 세션 상태 오염 방지
    # 각 SQL마다 savepoint로 개별 에러 격리
    conn = engine.connect()
    sp_idx = [0]

    def run(label: str, sql: str, params: dict = {}):
        sp = f"sp{sp_idx[0]}"
        sp_idx[0] += 1
        try:
            conn.execute(text(f"SAVEPOINT {sp}"))
            r = conn.execute(text(sql), params)
            deleted[label] = r.rowcount
            conn.execute(text(f"RELEASE SAVEPOINT {sp}"))
        except Exception as e:
            errors[label] = str(e)
            try:
                conn.execute(text(f"ROLLBACK TO SAVEPOINT {sp}"))
            except Exception:
                pass

    # ── 1. 품질 하위 ──────────────────────────────────────────────
    # NCR 중 외주 입고와 무관한 것 삭제
    run("ncr_appeal",
        f"DELETE FROM ncr_appeal WHERE ncr_no IN ("
        f"  SELECT ncr_no FROM non_conformance "
        f"  WHERE created_at < :c "
        f"  AND (gr_no IS NULL OR gr_no NOT IN ({_KEEP_GR_SQ}))"
        f")", {"c": CUTOFF})

    run("non_conformance",
        f"DELETE FROM non_conformance "
        f"WHERE created_at < :c "
        f"AND (gr_no IS NULL OR gr_no NOT IN ({_KEEP_GR_SQ}))",
        {"c": CUTOFF})

    run("quality_claim",
        "DELETE FROM quality_claim WHERE created_at < :c", {"c": CUTOFF})

    run("process_outgoing_defect",
        "DELETE FROM process_outgoing_defect WHERE defect_date < :c", {"c": CUTOFF})

    # ── 2. 검사 — 외주 입고 연결된 검사는 유지 ──────────────────
    run("inspection",
        f"DELETE FROM inspection "
        f"WHERE inspect_date < :c "
        f"AND gr_no NOT IN ({_KEEP_GR_SQ})",
        {"c": CUTOFF})

    # ── 3. MES ───────────────────────────────────────────────────
    run("mes_production_cost",
        "DELETE FROM mes_production_cost WHERE id IN "
        "(SELECT c.id FROM mes_production_cost c "
        " JOIN mes_production_log l ON c.mes_log_id = l.id WHERE l.prod_date < :c)",
        {"c": CUTOFF})

    run("mes_defect_detail",
        "DELETE FROM mes_defect_detail WHERE id IN "
        "(SELECT d.id FROM mes_defect_detail d "
        " JOIN mes_production_log l ON d.mes_log_id = l.id WHERE l.prod_date < :c)",
        {"c": CUTOFF})

    run("mes_production_log",
        "DELETE FROM mes_production_log WHERE prod_date < :c", {"c": CUTOFF})

    run("mes_sync_log",
        "DELETE FROM mes_sync_log WHERE target_date < :c", {"c": CUTOFF})

    # ── 4. 생산 ───────────────────────────────────────────────────
    run("oee_daily",
        "DELETE FROM oee_daily WHERE prod_date < :c", {"c": CUTOFF})

    run("production_loss",
        "DELETE FROM production_loss WHERE loss_date < :c", {"c": CUTOFF})

    run("andon_alert",
        "DELETE FROM andon_alert WHERE alert_at < :c", {"c": CUTOFF})

    run("daily_actual",
        "DELETE FROM daily_actual WHERE prod_date < :c", {"c": CUTOFF})

    run("monthly_plan",
        "DELETE FROM monthly_plan WHERE (year < 2026) OR (year = 2026 AND month < 11)")

    run("production_order",
        "DELETE FROM production_order WHERE plan_date < :c", {"c": CUTOFF})

    # ── 5. 영업 ───────────────────────────────────────────────────
    run("invoice_line",
        "DELETE FROM invoice_line WHERE inv_no IN "
        "(SELECT inv_no FROM invoice WHERE issue_date < :c)", {"c": CUTOFF})

    run("invoice",
        "DELETE FROM invoice WHERE issue_date < :c", {"c": CUTOFF})

    run("shipment",
        "DELETE FROM shipment WHERE ship_date < :c", {"c": CUTOFF})

    run("sales_order",
        "DELETE FROM sales_order WHERE order_date < :c", {"c": CUTOFF})

    # ── 6. 구매 / 입고 — 외주 매입 유지 ─────────────────────────
    run("receipt (비외주)",
        f"DELETE FROM receipt "
        f"WHERE receipt_date < :c "
        f"AND (partner_id IS NULL OR partner_id NOT IN ({_OUTSOURCE_PARTNER_SQ}))",
        {"c": CUTOFF})

    run("purchase_order (비외주)",
        f"DELETE FROM purchase_order "
        f"WHERE order_date < :c "
        f"AND po_no NOT IN ({_KEEP_PO_SQ})",
        {"c": CUTOFF})

    run("purchase_order_group",
        "DELETE FROM purchase_order_group WHERE created_at < :c "
        "AND (group_no IS NULL OR group_no NOT IN ("
        "  SELECT DISTINCT group_no FROM purchase_order WHERE group_no IS NOT NULL"
        "))", {"c": CUTOFF})

    run("purchase_request",
        "DELETE FROM purchase_request WHERE created_at < :c", {"c": CUTOFF})

    run("carryover",
        "DELETE FROM carryover WHERE source_ym < '2026-11'")

    # ── 7. 재고 ───────────────────────────────────────────────────
    run("stock_ledger",
        "DELETE FROM stock_ledger WHERE txn_date < :c", {"c": CUTOFF})

    run("inventory_adjustment",
        "DELETE FROM inventory_adjustment WHERE adj_date < :c", {"c": CUTOFF})

    # ── 8. 금형 수주 ──────────────────────────────────────────────
    run("mold_trial",
        "DELETE FROM mold_trial WHERE mold_no IN "
        "(SELECT mold_no FROM mold_order WHERE order_date < :c)",
        {"c": CUTOFF})

    run("mold_order",
        "DELETE FROM mold_order WHERE order_date < :c", {"c": CUTOFF})

    # ── 9. 개선 / 원가 ────────────────────────────────────────────
    run("kaizen_task",
        "DELETE FROM kaizen_task WHERE created_at < :c", {"c": CUTOFF})

    run("improvement_request",
        "DELETE FROM improvement_request WHERE created_at < :c", {"c": CUTOFF})

    run("overhead_entry",
        "DELETE FROM overhead_entry WHERE created_at < :c", {"c": CUTOFF})

    try:
        conn.commit()
    finally:
        conn.close()

    total = sum(deleted.values())
    return {
        "ok": len(errors) == 0,
        "cutoff": str(CUTOFF),
        "note": "외주처 입고·발주·검사는 유지됨",
        "total_deleted": total,
        "detail": deleted,
        "errors": errors,
    }


# ─── 나라엠텍 BOM 업로드 ─────────────────────────────────────────────────────
NARAEMTEC_BOM = [
    # (part_no, name, unit_price, item_type)
    # ── 원자재 ────────────────────────────────────────────────────
    ("LLGP1007-KA02F",   "LLGP1007-KA02F",                              3300,  "raw"),
    ("PS000023",          "JH4,Cooling Plate",                            510,   "raw"),
    ("LOFB2106F-BK",     "MPPO+G/F10% LUMILOY FB2106F",                 6300,  "raw"),
    ("TA000041",         "THERMAL_BARRIER_DOUBLE-SIDE-TAPE",              440,  "raw"),
    ("LLGP1000FC-KA02P", "LLGP1000FC-KA02P",                            4390,  "raw"),
    ("CC-LUMILOY-0539",  "MPPO+G/F10% LUMILOY FB2106F O0539",           7000,  "raw"),
    ("LYEF1006F-E6056",  "PC,LUPOY EF1006F(LIGHT GRAY)",                3500,  "raw"),
    ("LYEF1006F-K1343P", "PC,LUPOY EF1006F(BLACK)",                     3500,  "raw"),
    ("EFC-5048B",        "EFC-5048(BLACK)",                              3170,  "raw"),
    ("OT000044",         "Mica_Sheet A(0.3)/258*114",                     873,  "raw"),
    ("OT000046",         "Mica_Sheet C(1.0)/312*119.8",                   766,  "raw"),
    ("OT000047-1",       "Mica_Sheet D(1.0)/256.5*22.2(4M)",              395,  "raw"),
    ("PS000061",         "Terminal Busbar POS-A",                        1801,  "raw"),
    ("PS000062",         "Terminal Busbar NEG-A",                        3075,  "raw"),
    ("PS000063",         "Terminal Busbar NEG-B",                        4194,  "raw"),
    ("OT000043",         "Fuse,NH5KM(500A)",                            13200,  "raw"),
    # ── 부자재 ────────────────────────────────────────────────────
    ("BT000038-2",       "INSERT BOLT M5*12",                              64,  "sub"),
    ("NT000082",         "INSERT NUT M4*L8(비관통)",                        59,  "sub"),
    ("BT000039-1",       "INSERT BOLT M10*23",                            157,  "sub"),
    ("BT000040-2",       "사각머리_Bolt M5*19(수소취성제거)",                  68,  "sub"),
    ("NT000083",         "Flange Nut M10*P1.25",                           65,  "sub"),
    ("NM-001",           "OMRON GEN3 카톤박스",                             670,  "sub"),
    ("NM-002",           "GRID-JF2 PAD",                                  280,  "sub"),
    ("NM-003",           "지퍼백(350*400)",                                  116,  "sub"),
    ("NM-004",           "TRAY JF2 Connector Cover",                      500,  "sub"),
    ("NM-005",           "HD 봉투(20*120*120)",                             210,  "sub"),
    ("NM-006",           "GRID-JF2 키톤박스",                              1765,  "sub"),
    ("NM-007",           "GRID-JF2 패드",                                  280,  "sub"),
    ("NM-008",           "PP Pallet A급(1100*1100)",                     10000,  "sub"),
]

TYPE_MAP = {"raw": ItemType.raw, "sub": ItemType.sub}


@router.post("/upload-bom-naraemtec")
def upload_bom_naraemtec(db: Session = Depends(get_db)):
    """나라엠텍 부자재 BOM → 품목 마스터 등록 (원자재/부자재 분류)"""
    created = []
    skipped = []

    for part_no, name, unit_price, itype in NARAEMTEC_BOM:
        existing = db.get(Item, part_no)
        if existing:
            skipped.append(part_no)
            continue
        item = Item(
            part_no=part_no,
            name=name,
            std_buy_price=unit_price,
            item_type=TYPE_MAP[itype],
            supplier="나라엠텍",
            unit="EA",
        )
        db.add(item)
        created.append(part_no)

    db.commit()
    return {
        "ok": True,
        "created": len(created),
        "skipped": len(skipped),
        "created_list": created,
        "skipped_list": skipped,
    }


@router.post("/fix-naraemtec-item-types")
def fix_naraemtec_item_types():
    """
    spec='나라엠텍'인 품목 중 item_type='finished'(완제품)으로 잘못 분류된 것을
    'outsourced'(외주품)로 일괄 수정 + MPL02871AA 삭제
    """
    try:
        conn = engine.connect()
        try:
            r = conn.execute(text(
                "UPDATE item SET item_type='outsourced' "
                "WHERE spec LIKE :spec_pat AND item_type='finished'"
            ), {"spec_pat": "%나라엠텍%"})
            updated_count = r.rowcount
            r2 = conn.execute(text("DELETE FROM item WHERE part_no = :pno"), {"pno": "MPL02871AA"})
            deleted_count = r2.rowcount
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "ok": True,
        "updated_to_outsourced": updated_count,
        "deleted_MPL02871AA": deleted_count,
    }
