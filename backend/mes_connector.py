"""
MES → ERP 일일 생산실적 동기화 스크립트
======================================
사용법:
  python mes_connector.py                   # 오늘 실적 동기화
  python mes_connector.py --date 2026-07-22 # 특정 날짜

설정:
  아래 CONFIG 섹션에 MES URL과 계정 정보 입력
"""
import argparse
import json
import sys
from datetime import date, timedelta

import requests


# ──────────────────────────────────────────────
# ▼▼▼ 여기에 MES 정보 입력 ▼▼▼
# ──────────────────────────────────────────────
CONFIG = {
    "mes_url":      "http://your-mes-server/",   # MES 주소 (끝에 / 포함)
    "mes_user":     "your_id",                   # MES 로그인 ID
    "mes_password": "your_password",             # MES 로그인 PW
    "erp_url":      "http://localhost:8001",     # ERP 주소 (바꾸지 마세요)
}
# ──────────────────────────────────────────────


def mes_login(session: requests.Session) -> bool:
    """MES 로그인 — MES API에 맞게 수정 필요"""
    # ────────────────────────────────────────────────────
    # TODO: 아래를 실제 MES 로그인 API로 교체하세요.
    #
    # 예시 1) Form 로그인 방식:
    #   resp = session.post(CONFIG["mes_url"] + "api/login", data={
    #       "username": CONFIG["mes_user"],
    #       "password": CONFIG["mes_password"],
    #   })
    #
    # 예시 2) JSON 로그인 방식:
    #   resp = session.post(CONFIG["mes_url"] + "api/auth/login", json={
    #       "id": CONFIG["mes_user"],
    #       "pw": CONFIG["mes_password"],
    #   })
    #   token = resp.json()["token"]
    #   session.headers.update({"Authorization": f"Bearer {token}"})
    # ────────────────────────────────────────────────────
    print("[MES] 로그인 로직을 아직 설정하지 않았습니다.")
    print("      mes_connector.py 파일의 mes_login() 함수를 수정해주세요.")
    return False


def mes_fetch_production(session: requests.Session, target_date: str) -> list[dict]:
    """
    MES에서 일일 생산실적 가져오기 — MES API에 맞게 수정 필요
    반환값은 ERP push 형식에 맞는 리스트여야 합니다.
    """
    # ────────────────────────────────────────────────────
    # TODO: 아래를 실제 MES 조회 API로 교체하세요.
    #
    # 예시 1) GET 방식:
    #   resp = session.get(CONFIG["mes_url"] + "api/production/daily", params={"date": target_date})
    #   raw = resp.json()  # MES 응답 JSON
    #
    # 예시 2) POST 방식:
    #   resp = session.post(CONFIG["mes_url"] + "api/production/query", json={"date": target_date})
    #   raw = resp.json()
    #
    # MES 응답을 아래 ERP 형식으로 변환하세요:
    # ────────────────────────────────────────────────────

    # 아래는 예시 변환 코드 (실제 MES 필드명으로 바꿔야 함)
    raw = []  # TODO: 실제 MES API 호출로 교체

    records = []
    for item in raw:
        records.append({
            # ─── 아래 키 이름을 MES 실제 필드명으로 바꾸세요 ───
            "part_no":       item.get("ITEM_CD", ""),        # 품번 (ERP part_no와 일치해야 함)
            "part_name":     item.get("ITEM_NM", ""),        # 품명
            "machine_no":    item.get("MACHINE_ID", ""),     # 설비번호
            "shift":         item.get("SHIFT", "주간"),      # 주간/야간
            "plan_qty":      item.get("PLAN_QTY", 0),        # 계획수량
            "actual_qty":    item.get("GOOD_QTY", 0),        # 양품수량
            "defect_qty":    item.get("NG_QTY", 0),          # 불량수량
            "defect_reason": item.get("NG_REASON", ""),      # 불량원인
            "run_time_min":  item.get("RUN_TIME", 0),        # 가동시간(분)
            "down_time_min": item.get("DOWN_TIME", 0),       # 비가동시간(분)
            "down_reason":   item.get("DOWN_REASON", ""),    # 비가동원인
            "worker":        item.get("WORKER_NM", ""),      # 작업자
            "mes_order_no":  item.get("WO_NO", ""),          # MES 작업지시번호
            # ──────────────────────────────────────────────
        })
    return records


def push_to_erp(target_date: str, records: list[dict]) -> dict:
    """ERP에 생산실적 전송"""
    resp = requests.post(
        f"{CONFIG['erp_url']}/mes/push",
        json={"target_date": target_date, "records": records},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def sync(target_date: str):
    print(f"\n{'='*50}")
    print(f"MES → ERP 동기화 시작: {target_date}")
    print(f"{'='*50}")

    session = requests.Session()

    # 1. MES 로그인
    print("\n[1/3] MES 로그인 중...")
    ok = mes_login(session)
    if not ok:
        print("  ✗ 로그인 실패. mes_connector.py 설정을 확인하세요.")
        sys.exit(1)
    print("  ✓ 로그인 성공")

    # 2. 생산실적 가져오기
    print(f"\n[2/3] MES 생산실적 조회 중... ({target_date})")
    try:
        records = mes_fetch_production(session, target_date)
        print(f"  ✓ {len(records)}건 조회됨")
    except Exception as e:
        print(f"  ✗ 조회 실패: {e}")
        sys.exit(1)

    if not records:
        print("  ! 조회된 실적이 없습니다.")
        return

    # 3. ERP에 전송
    print(f"\n[3/3] ERP에 {len(records)}건 전송 중...")
    try:
        result = push_to_erp(target_date, records)
        print(f"  ✓ 완료: 성공 {result['rows_ok']}건 / 오류 {result['rows_err']}건")
        if result.get("errors"):
            print("  오류 상세:")
            for e in result["errors"]:
                print(f"    - {e}")
    except Exception as e:
        print(f"  ✗ ERP 전송 실패: {e}")
        sys.exit(1)

    print(f"\n동기화 완료 ✓")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MES → ERP 생산실적 동기화")
    parser.add_argument("--date", default=str(date.today()), help="동기화 날짜 (YYYY-MM-DD, 기본: 오늘)")
    parser.add_argument("--yesterday", action="store_true", help="어제 날짜로 동기화")
    args = parser.parse_args()

    target = str(date.today() - timedelta(days=1)) if args.yesterday else args.date
    sync(target)
