"""
PDF 로컬 저장 에이전트
======================
로컬 PC에서 실행하는 소형 HTTP 서버 (기본 포트 9091).
ERP 화면의 "네트워크 저장" 버튼이 이 서버를 호출합니다.

사용법:
  1. middleware/.env 에 설정 입력 (아래 항목 참조)
  2. python middleware/pdf_agent.py 실행 (또는 start_pdf_agent.bat 더블클릭)

.env 설정 항목:
  ERP_BASE_URL=https://your-app.railway.app
  INVOICE_DIR=\\\\192.168.0.124\\e\\명세서,발주서 저장폴더\\명세서 집계
  PO_DIR=\\\\192.168.0.124\\e\\명세서,발주서 저장폴더\\발주서 집계
  AGENT_PORT=9091
"""

import os
import sys
import requests
import uvicorn
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── .env 로드 ────────────────────────────────────────────────────────────────
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

ERP_BASE_URL = os.environ.get("ERP_BASE_URL", "http://localhost:8000")
INVOICE_DIR  = os.environ.get("INVOICE_DIR",  r"\\192.168.0.124\e\명세서,발주서 저장폴더\명세서 집계")
PO_DIR       = os.environ.get("PO_DIR",       r"\\192.168.0.124\e\명세서,발주서 저장폴더\발주서 집계")
AGENT_PORT   = int(os.environ.get("AGENT_PORT", "9091"))

# ── FastAPI 앱 ────────────────────────────────────────────────────────────────
app = FastAPI(title="JOY-ERP PDF 로컬 에이전트")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _ensure_dir(path: str) -> Path:
    p = Path(path)
    p.mkdir(parents=True, exist_ok=True)
    return p


@app.get("/health")
def health():
    return {"status": "ok", "erp": ERP_BASE_URL}


@app.get("/save/invoice/{inv_no}")
def save_invoice(inv_no: str):
    """명세서 PDF 를 명세서 집계 폴더에 저장"""
    url = f"{ERP_BASE_URL}/invoices/{inv_no}/pdf"
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": f"ERP API 오류: {e}"})

    save_dir = _ensure_dir(INVOICE_DIR)
    filename = f"명세서_{inv_no}.pdf"
    filepath = save_dir / filename
    filepath.write_bytes(r.content)
    return {"saved": str(filepath), "size": len(r.content)}


@app.get("/save/purchase/{group_no}")
def save_purchase(group_no: str):
    """발주서 PDF 를 발주서 집계/업체명 폴더에 저장"""
    # 업체명 조회
    try:
        info_r = requests.get(f"{ERP_BASE_URL}/purchase/groups/{group_no}", timeout=10)
        info_r.raise_for_status()
        info = info_r.json()
        partner_name = info.get("partner_name") or info.get("partner_id") or "미확인업체"
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": f"발주서 정보 조회 실패: {e}"})

    # PDF 다운로드
    pdf_url = f"{ERP_BASE_URL}/purchase/groups/{group_no}/pdf"
    try:
        r = requests.get(pdf_url, timeout=30)
        r.raise_for_status()
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": f"PDF 다운로드 실패: {e}"})

    # 업체명 폴더에 저장
    save_dir = _ensure_dir(os.path.join(PO_DIR, partner_name))
    filename = f"발주서_{group_no}.pdf"
    filepath = save_dir / filename
    filepath.write_bytes(r.content)
    return {"saved": str(filepath), "partner": partner_name, "size": len(r.content)}


@app.post("/init-folders")
def init_folders():
    """업체 목록을 가져와서 발주서 집계 폴더 안에 업체별 하위폴더 일괄 생성"""
    try:
        r = requests.get(f"{ERP_BASE_URL}/master/partners", timeout=15)
        r.raise_for_status()
        partners = r.json()
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": f"업체 목록 조회 실패: {e}"})

    created = []
    for p in partners:
        name = p.get("name") or p.get("partner_id", "")
        if name:
            d = Path(PO_DIR) / name
            d.mkdir(parents=True, exist_ok=True)
            created.append(str(d))

    return {"created": len(created), "dirs": created}


if __name__ == "__main__":
    print(f"[PDF 에이전트] ERP: {ERP_BASE_URL}")
    print(f"[PDF 에이전트] 명세서 저장: {INVOICE_DIR}")
    print(f"[PDF 에이전트] 발주서 저장: {PO_DIR}")
    print(f"[PDF 에이전트] 포트: {AGENT_PORT}")
    print(f"[PDF 에이전트] 시작 → http://localhost:{AGENT_PORT}/health")
    uvicorn.run(app, host="127.0.0.1", port=AGENT_PORT)
