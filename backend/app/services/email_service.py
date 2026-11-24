"""
ERP 메일 발송 서비스 — Resend HTTP API 사용
RESEND_API_KEY: Railway 환경변수로 관리
RESEND_FROM: 발신 주소 (도메인 인증 전: onboarding@resend.dev)
"""
import os
import logging
import requests
from datetime import date

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM    = os.getenv("RESEND_FROM", "조이산업 ERP <onboarding@resend.dev>")
RESEND_URL     = "https://api.resend.com/emails"


def _enabled() -> bool:
    return bool(RESEND_API_KEY)


def _send(to_email: str, to_name: str, subject: str, html: str) -> bool:
    if not _enabled():
        logger.info(f"[email] RESEND_API_KEY 미설정 — 스킵: {subject}")
        return True
    if not to_email:
        logger.info(f"[email] 수신 이메일 없음 — 스킵: {subject}")
        return True

    payload = {
        "from": RESEND_FROM,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(RESEND_URL, json=payload, headers=headers, timeout=15)
        if resp.status_code in (200, 201):
            logger.info(f"[email] 발송 완료: {subject} -> {to_email}")
            return True
        else:
            logger.error(f"[email] 발송 실패 ({resp.status_code}): {resp.text[:200]}")
            return False
    except Exception as exc:
        logger.error(f"[email] 발송 오류: {subject} -> {to_email} | {exc}")
        return False


def send_po_group_notification(
    *,
    to_email: str,
    to_name: str,
    group_no: str,
    partner_name: str,
    order_date: date,
    due_date: date,
    lines: list[dict],
    note: str | None = None,
) -> bool:
    """발주 그룹(복수 품목) 등록 알림 메일"""
    rows_html = ""
    for i, ln in enumerate(lines):
        bg = "#f8fafc" if i % 2 == 0 else "#ffffff"
        up = ln.get("unit_price") or 0
        qty = ln.get("qty", 0)
        total = up * qty if up else 0
        price_str = f"&#8361;{up:,.0f} / &#8361;{total:,.0f}" if up else "-"
        due = ln.get("due_date") or due_date
        rows_html += f"""
        <tr style="background:{bg};">
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;">{ln.get('part_no','')}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;">{ln.get('part_name','')}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">{qty:,}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">{price_str}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#dc2626;font-weight:600;">{due}</td>
        </tr>"""

    note_row = (f"<tr><td colspan='5' style='padding:8px 10px;color:#64748b;font-size:13px;'>"
                f"비고: {note}</td></tr>") if note else ""

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;
              border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#1e40af;padding:24px 28px;">
      <h2 style="margin:0;color:#fff;font-size:18px;">&#128203; 발주서 등록 알림</h2>
      <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">조이산업 ERP에서 발주가 등록되었습니다.</p>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 16px;color:#334155;">
        안녕하세요, <strong>{partner_name}</strong> 담당자님.<br>
        아래 내용으로 발주가 등록되었으니 확인 부탁드립니다.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#334155;margin-bottom:16px;">
        <tr><td style="padding:6px 0;color:#64748b;width:100px;">발주번호</td>
            <td style="padding:6px 0;font-weight:700;color:#1e40af;">{group_no}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">발주일자</td>
            <td style="padding:6px 0;">{order_date}</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#334155;">
        <thead>
          <tr style="background:#1e40af;color:#fff;">
            <th style="padding:8px 10px;text-align:left;">품번</th>
            <th style="padding:8px 10px;text-align:left;">품명</th>
            <th style="padding:8px 10px;text-align:right;">수량</th>
            <th style="padding:8px 10px;text-align:right;">단가/금액</th>
            <th style="padding:8px 10px;text-align:left;">납기일</th>
          </tr>
        </thead>
        <tbody>{rows_html}{note_row}</tbody>
      </table>
      <div style="margin-top:20px;padding:12px 16px;background:#eff6ff;border-radius:6px;
                  font-size:13px;color:#1e40af;">
        궁금하신 점은 조이산업 구매담당자에게 연락주시기 바랍니다.
      </div>
    </div>
    <div style="padding:12px 28px;background:#f8fafc;font-size:11px;color:#94a3b8;
                border-top:1px solid #e2e8f0;">
      본 메일은 조이산업 ERP 시스템에서 자동 발송되었습니다.
    </div>
  </div>
</body>
</html>"""

    subject = f"[조이산업] 발주서 등록 알림 - {group_no}"
    return _send(to_email, to_name, subject, html)


def send_po_notification(
    *,
    to_email: str,
    to_name: str,
    po_no: str,
    part_no: str,
    part_name: str,
    qty: int,
    unit_price: float | None,
    order_date: date,
    due_date: date,
    note: str | None = None,
) -> bool:
    """단일 발주 알림 (purchase.py 호환용)"""
    return send_po_group_notification(
        to_email=to_email,
        to_name=to_name,
        group_no=po_no,
        partner_name=to_name,
        order_date=order_date,
        due_date=due_date,
        lines=[{
            "part_no": part_no,
            "part_name": part_name,
            "qty": qty,
            "unit_price": unit_price,
            "due_date": due_date,
        }],
        note=note,
    )
