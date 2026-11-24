"""
ERP 메일 발송 서비스 — Resend HTTP API 사용
RESEND_API_KEY: Railway 환경변수로 관리
RESEND_FROM: 발신 주소 (도메인 인증 전: onboarding@resend.dev)
"""
import os
import logging
import httpx
from datetime import date

logger = logging.getLogger(__name__)

RESEND_API_KEY     = os.getenv("RESEND_API_KEY", "")
RESEND_FROM        = os.getenv("RESEND_FROM", "조이산업 ERP <onboarding@resend.dev>")
RESEND_OVERRIDE_TO = os.getenv("RESEND_OVERRIDE_TO", "")
ERP_API_URL        = os.getenv("ERP_API_URL", "")   # Railway 백엔드 URL (발주서 확인 버튼용)
RESEND_URL         = "https://api.resend.com/emails"


def _enabled() -> bool:
    return bool(RESEND_API_KEY)


def _send(to_email: str, to_name: str, subject: str, html: str) -> bool:
    if not _enabled():
        logger.info(f"[email] RESEND_API_KEY 미설정 — 스킵: {subject}")
        return True
    if not to_email:
        logger.info(f"[email] 수신 이메일 없음 — 스킵: {subject}")
        return True

    effective_to = RESEND_OVERRIDE_TO or to_email
    payload = {
        "from": RESEND_FROM,
        "to": [effective_to],
        "subject": subject,
        "html": html,
    }
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        resp = httpx.post(RESEND_URL, json=payload, headers=headers, timeout=15)
        if resp.status_code in (200, 201):
            logger.warning(f"[email] 발송 완료: {subject} -> {effective_to}")
            return True
        else:
            logger.warning(f"[email] 발송 실패 ({resp.status_code}): {resp.text[:200]}")
            return False
    except Exception as exc:
        logger.warning(f"[email] 발송 오류: {subject} -> {effective_to} | {exc}")
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
    # 발주내용 요약: 첫 품목명 + 외 N건
    first_name = lines[0].get("part_name", "") if lines else ""
    extra_count = len(lines) - 1
    item_summary = f"{first_name} 외 {extra_count}건" if extra_count > 0 else first_name

    # 발주서 확인 버튼 URL
    print_url = f"{ERP_API_URL}/purchase/groups/{group_no}/print" if ERP_API_URL else ""
    btn_html = (
        f'<div style="text-align:center;margin-top:28px;">'
        f'<a href="{print_url}" style="display:inline-block;padding:13px 44px;'
        f'background:#1a5cb8;color:#fff;text-decoration:none;font-size:14px;'
        f'font-weight:700;letter-spacing:1px;">구매발주서 확인</a></div>'
    ) if print_url else ""

    # 전달내용 메시지
    delivery_msg = (
        "안녕하세요<br>"
        f"㈜넥스젬 구매 팀 입니다.<br><br>"
        "발주서 송부드립니다.<br>"
        "납기일 및 발주수량 확인 후 납품 요청드립니다.<br><br>"
        "감사합니다."
    )

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body{{font-family:'맑은 고딕',Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;}}
  .wrap{{max-width:600px;margin:0 auto;background:#fff;border:1px solid #d0d5dd;}}
  .top-bar{{background:#1a5cb8;color:#fff;padding:12px 20px;font-size:13px;display:flex;justify-content:space-between;align-items:center;}}
  .top-bar .date{{font-size:12px;opacity:.85;white-space:nowrap;margin-left:12px;}}
  .recipient-box{{border:1px solid #c8d0dc;margin:20px 24px 16px;padding:18px 20px;text-align:center;}}
  .recipient-box .name{{font-size:16px;font-weight:700;color:#111;margin-bottom:6px;}}
  .recipient-box .sub{{font-size:12px;color:#555;}}
  .section-title{{font-size:13px;font-weight:700;color:#111;margin:0 24px 6px;padding-bottom:6px;border-bottom:2px solid #111;}}
  .info-table{{width:calc(100% - 48px);margin:0 24px 20px;border-collapse:collapse;font-size:12.5px;}}
  .info-table td{{padding:8px 10px;border:1px solid #d0d5dd;vertical-align:top;}}
  .info-table .lbl{{background:#f4f6f8;font-weight:600;color:#333;width:72px;text-align:center;white-space:nowrap;}}
  .msg{{line-height:1.75;color:#333;}}
  .footer{{padding:10px 24px;background:#f8f9fa;border-top:1px solid #e0e0e0;font-size:10px;color:#999;text-align:center;}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top-bar">
    <span>㈜넥스젬 으로부터 구매발주서가 발송되었습니다. - {partner_name}</span>
    <span class="date">{order_date}</span>
  </div>
  <div class="recipient-box">
    <div class="name">수신처 : {partner_name}</div>
    <div class="sub">㈜넥스젬 으로부터 구매발주서가 발송되었습니다.</div>
  </div>
  <div class="section-title">발신정보</div>
  <table class="info-table">
    <tr>
      <td class="lbl">업 &nbsp;체 &nbsp;명</td>
      <td>㈜넥스젬</td>
      <td class="lbl">발 행 일 자</td>
      <td>{order_date}</td>
    </tr>
    <tr>
      <td class="lbl">이 &nbsp;메 &nbsp;일</td>
      <td>jhhwang@nexgem.co.kr</td>
      <td class="lbl">연 &nbsp;락 &nbsp;처</td>
      <td>043-212-3351</td>
    </tr>
    <tr>
      <td class="lbl">발 주 내 용</td>
      <td colspan="3">{item_summary}</td>
    </tr>
    <tr>
      <td class="lbl" style="vertical-align:top;padding-top:10px;">전 달 내 용</td>
      <td colspan="3" class="msg">{delivery_msg}</td>
    </tr>
  </table>
  {btn_html}
  <div style="height:24px;"></div>
  <div class="footer">본 메일은 ㈜넥스젬 ERP 시스템에서 자동 발송되었습니다.</div>
</div>
</body>
</html>"""

    subject = f"[㈜넥스젬] 구매발주서가 발송되었습니다. - {partner_name} ({group_no})"
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
