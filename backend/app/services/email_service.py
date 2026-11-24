"""
ERP 메일 발송 서비스 — 외주 발주 등록 시 업체 자동 알림
SMTP 설정은 Railway 환경변수로 관리:
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_NAME
"""
import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import date

logger = logging.getLogger(__name__)

SMTP_HOST     = os.getenv("SMTP_HOST", "mail.nexgem.co.kr")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "조이산업 ERP")


def _smtp_enabled() -> bool:
    return bool(SMTP_USER and SMTP_PASSWORD)


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
    """
    외주 발주 등록 알림 메일 발송.
    SMTP 미설정 시 로그만 남기고 True 반환 (기능 차단 없음).
    """
    if not _smtp_enabled():
        logger.info(f"[email] SMTP 미설정 — 발주 알림 스킵: {po_no} → {to_email}")
        return True

    if not to_email:
        logger.info(f"[email] 업체 이메일 미등록 — 발주 알림 스킵: {po_no}")
        return True

    amount_str = ""
    if unit_price and unit_price > 0:
        total = unit_price * qty
        amount_str = f"""
        <tr>
          <td style="padding:6px 0;color:#64748b;">단가 / 금액</td>
          <td style="padding:6px 0;font-weight:600;">
            ₩{unit_price:,.0f} / ₩{total:,.0f}
          </td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;
              border:1px solid #e2e8f0;overflow:hidden;">

    <div style="background:#1e40af;padding:24px 28px;">
      <h2 style="margin:0;color:#fff;font-size:18px;">📋 발주서 등록 알림</h2>
      <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">조이산업 ERP에서 발주가 등록되었습니다.</p>
    </div>

    <div style="padding:24px 28px;">
      <p style="margin:0 0 16px;color:#334155;">
        안녕하세요, <strong>{to_name}</strong> 담당자님.<br>
        아래 내용으로 발주가 등록되었으니 확인 부탁드립니다.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#334155;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:8px 0;color:#64748b;width:120px;">발주번호</td>
          <td style="padding:8px 0;font-weight:700;color:#1e40af;">{po_no}</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:8px 0;color:#64748b;">발주일자</td>
          <td style="padding:8px 0;">{order_date}</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:8px 0;color:#64748b;">납기일자</td>
          <td style="padding:8px 0;font-weight:600;color:#dc2626;">{due_date}</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:8px 0;color:#64748b;">품번 / 품명</td>
          <td style="padding:8px 0;">{part_no}<br><span style="color:#64748b;font-size:13px;">{part_name}</span></td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:8px 0;color:#64748b;">발주수량</td>
          <td style="padding:8px 0;font-weight:600;">{qty:,} EA</td>
        </tr>{amount_str}
        {"<tr style='border-bottom:1px solid #e2e8f0;'><td style='padding:8px 0;color:#64748b;'>비고</td><td style='padding:8px 0;'>" + note + "</td></tr>" if note else ""}
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

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[조이산업] 발주서 등록 알림 — {po_no}"
    msg["From"]    = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
    msg["To"]      = f"{to_name} <{to_email}>"
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, [to_email], msg.as_string())
        logger.info(f"[email] 발주 알림 발송 완료: {po_no} → {to_email}")
        return True
    except Exception as exc:
        logger.error(f"[email] 발주 알림 발송 실패: {po_no} → {to_email} | {exc}")
        return False
