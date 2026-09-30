"""자동발주: 안전재고 미달 품목을 MOQ 기준으로 자동 PO 생성 + 이메일 발송"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.master import Item, Partner
from app.models.purchase import PurchaseOrder, PurchaseOrderGroup, POStatus, POGroupStatus
from app.services.ledger_service import get_stock
from app.services.doc_no import next_doc_no

router = APIRouter(prefix="/auto-order", tags=["자동발주"])


def _smtp_cfg():
    return {
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from_name": os.getenv("SMTP_FROM_NAME", "넥스젬 구매팀"),
    }


def _send_email_with(to_email: str, subject: str, html_body: str, override: dict = {}):
    cfg = {**_smtp_cfg(), **override}
    if not cfg["user"] or not cfg["password"]:
        return False, "SMTP 설정 없음 (이메일/비밀번호 입력 필요)"
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{cfg['from_name']} <{cfg['user']}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        port = int(cfg["port"])
        # 465 포트는 SSL, 나머지는 STARTTLS
        if port == 465:
            import ssl
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(cfg["host"], port, context=ctx) as s:
                s.login(cfg["user"], cfg["password"])
                s.sendmail(cfg["user"], [to_email], msg.as_string())
        else:
            with smtplib.SMTP(cfg["host"], port) as s:
                s.ehlo()
                s.starttls()
                s.login(cfg["user"], cfg["password"])
                s.sendmail(cfg["user"], [to_email], msg.as_string())
        return True, "발송 완료"
    except Exception as e:
        return False, str(e)


def _send_email(to_email: str, subject: str, html_body: str):
    return _send_email_with(to_email, subject, html_body)


def _po_email_html(partner_name: str, po_no: str, part_no: str, part_name: str,
                   qty: int, due_date: date, unit_price: float) -> str:
    return f"""
<html><body style="font-family:'Malgun Gothic',sans-serif;font-size:12pt;color:#111">
<h2 style="color:#1d4ed8">발주서 ({po_no})</h2>
<table style="border-collapse:collapse;width:500px">
  <tr style="background:#1d4ed8;color:#fff">
    <th style="padding:8px 12px;border:1px solid #1d4ed8">항목</th>
    <th style="padding:8px 12px;border:1px solid #1d4ed8">내용</th>
  </tr>
  <tr><td style="padding:7px 12px;border:1px solid #ddd">수신</td><td style="padding:7px 12px;border:1px solid #ddd"><b>{partner_name}</b></td></tr>
  <tr style="background:#f9f9f9"><td style="padding:7px 12px;border:1px solid #ddd">품번</td><td style="padding:7px 12px;border:1px solid #ddd">{part_no}</td></tr>
  <tr><td style="padding:7px 12px;border:1px solid #ddd">품명</td><td style="padding:7px 12px;border:1px solid #ddd">{part_name}</td></tr>
  <tr style="background:#f9f9f9"><td style="padding:7px 12px;border:1px solid #ddd">발주수량</td><td style="padding:7px 12px;border:1px solid #ddd"><b>{qty:,} EA</b></td></tr>
  <tr><td style="padding:7px 12px;border:1px solid #ddd">단가</td><td style="padding:7px 12px;border:1px solid #ddd">₩{unit_price:,.0f}</td></tr>
  <tr style="background:#f9f9f9"><td style="padding:7px 12px;border:1px solid #ddd">납기일</td><td style="padding:7px 12px;border:1px solid #ddd"><b>{due_date}</b></td></tr>
  <tr><td style="padding:7px 12px;border:1px solid #ddd">발주금액</td><td style="padding:7px 12px;border:1px solid #ddd;color:#1d4ed8;font-weight:bold">₩{qty*unit_price:,.0f}</td></tr>
</table>
<p style="margin-top:20px;color:#555;font-size:10pt">본 발주서는 넥스젬 ERP에서 자동 발행되었습니다.</p>
</body></html>"""


@router.get("/check")
def check_safety_stock(db: Session = Depends(get_db)):
    """안전재고 미달 품목 확인 (발주 없이 조회만)"""
    items = db.query(Item).filter(Item.active == True, Item.safety_stock > 0).all()
    result = []
    for item in items:
        stock = get_stock(db, item.part_no)
        shortage = item.safety_stock - stock
        if shortage > 0:
            # MOQ 기준 올림
            order_qty = item.moq * max(1, -(-shortage // item.moq))  # ceiling division
            result.append({
                "part_no": item.part_no,
                "name": item.name,
                "current_stock": stock,
                "safety_stock": item.safety_stock,
                "shortage": shortage,
                "moq": item.moq,
                "suggest_qty": order_qty,
                "std_buy_price": float(item.std_buy_price),
                "suggest_amount": round(order_qty * float(item.std_buy_price), 0),
            })
    return sorted(result, key=lambda x: x["shortage"], reverse=True)


@router.post("/execute")
def execute_auto_order(
    send_email: bool = True,
    due_days: int = 14,
    smtp_host: str | None = None,
    smtp_port: int | None = None,
    smtp_user: str | None = None,
    smtp_password: str | None = None,
    db: Session = Depends(get_db),
):
    """안전재고 미달 품목 자동 PO 생성 + 외주처 이메일 발송"""
    items = db.query(Item).filter(Item.active == True, Item.safety_stock > 0).all()
    today = date.today()
    due_date = today + timedelta(days=due_days)

    created = []
    email_results = []

    for item in items:
        stock = get_stock(db, item.part_no)
        shortage = item.safety_stock - stock
        if shortage <= 0:
            continue

        order_qty = item.moq * max(1, -(-shortage // item.moq))

        # 기본 외주처: std_buy_price 있는 외주처를 PO 이력에서 가장 최근 것으로
        from app.models.purchase import PurchaseOrder as PO
        last_po = db.query(PO).filter(
            PO.part_no == item.part_no,
            PO.status != POStatus.cancelled,
        ).order_by(PO.created_at.desc()).first()

        if not last_po:
            continue  # 발주 이력 없으면 스킵

        partner_id = last_po.partner_id
        up = float(last_po.unit_price) if last_po.unit_price is not None else 0.0
        unit_price = up if up > 0 else float(item.std_buy_price)

        # 그룹 생성
        grp_no = next_doc_no(db, "PG", "purchase_order_group", "group_no")
        grp = PurchaseOrderGroup(
            group_no=grp_no,
            partner_id=partner_id,
            order_date=today,
            due_date=due_date,
            status=POGroupStatus.issued,
            note=f"자동발주 (안전재고 부족: {item.part_no})",
        )
        db.add(grp)
        db.flush()

        po_no = next_doc_no(db, "PO", "purchase_order", "po_no")
        po = PO(
            po_no=po_no,
            group_no=grp_no,
            partner_id=partner_id,
            part_no=item.part_no,
            qty=order_qty,
            unit_price=unit_price,
            order_date=today,
            due_date=due_date,
            status=POStatus.open,
            note=f"자동발주 — 현재고 {stock}, 안전재고 {item.safety_stock}",
        )
        db.add(po)

        created.append({
            "po_no": po_no,
            "part_no": item.part_no,
            "name": item.name,
            "partner_id": partner_id,
            "qty": order_qty,
            "unit_price": unit_price,
            "due_date": str(due_date),
        })

        # 이메일 발송
        if send_email:
            partner = db.get(Partner, partner_id)
            if partner and partner.email:
                html = _po_email_html(
                    partner.name, po_no, item.part_no, item.name,
                    order_qty, due_date, unit_price,
                )
                cfg_override = {}
                if smtp_host: cfg_override["host"] = smtp_host
                if smtp_port: cfg_override["port"] = smtp_port
                if smtp_user: cfg_override["user"] = smtp_user
                if smtp_password: cfg_override["password"] = smtp_password
                ok, msg = _send_email_with(
                    partner.email,
                    f"[발주서] {item.part_no} {item.name} — {po_no}",
                    html,
                    cfg_override,
                )
                email_results.append({
                    "po_no": po_no,
                    "to": partner.email,
                    "success": ok,
                    "message": msg,
                })
            else:
                email_results.append({
                    "po_no": po_no,
                    "to": None,
                    "success": False,
                    "message": "이메일 미등록",
                })

    db.commit()
    return {
        "created_count": len(created),
        "orders": created,
        "email_results": email_results,
    }


@router.post("/send-po-email/{po_no}")
def send_po_email(po_no: str, db: Session = Depends(get_db)):
    """특정 PO 개별 이메일 발송"""
    from app.models.purchase import PurchaseOrder as PO
    po = db.get(PO, po_no)
    if not po:
        raise HTTPException(404)
    partner = db.get(Partner, po.partner_id)
    if not partner or not partner.email:
        raise HTTPException(400, f"외주처 이메일 미등록 ({po.partner_id})")
    item = db.get(Item, po.part_no)
    html = _po_email_html(
        partner.name, po_no, po.part_no,
        item.name if item else po.part_no,
        po.qty, po.due_date, float(po.unit_price),
    )
    ok, msg = _send_email(
        partner.email,
        f"[발주서] {po.part_no} — {po_no}",
        html,
    )
    if not ok:
        raise HTTPException(500, msg)
    return {"success": True, "to": partner.email}
