"""Phase 0 테스트 — 마스터/트랜잭션 분리, 미입고잔량"""
import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

TEST_DB_URL = "sqlite:///./test_phase0.db"
engine_test = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)

Base.metadata.create_all(bind=engine_test)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup():
    Base.metadata.drop_all(bind=engine_test)
    Base.metadata.create_all(bind=engine_test)
    # 거래처 + 품목 생성
    client.post("/master/partners", json={"partner_id": "P001", "name": "테스트외주", "partner_type": "외주처"})
    client.post("/master/items", json={"part_no": "TEST-001", "name": "테스트품목", "item_type": "외주품", "std_buy_price": 100, "std_sell_price": 150})


def test_receipt_requires_po():
    """발주 없이 입고 등록 시 404"""
    res = client.post("/purchase/receipts", json={
        "po_no": "PO-FAKE-001", "qty": 10,
        "receipt_date": "2026-06-22", "unit_price": 100,
    })
    assert res.status_code == 404


def test_remaining_qty_accurate():
    """발주 100 → 입고 30 → 미입고잔량 70"""
    po_res = client.post("/purchase/orders", json={
        "partner_id": "P001", "part_no": "TEST-001", "qty": 100,
        "order_date": "2026-06-20", "due_date": "2026-06-30",
    })
    assert po_res.status_code == 200
    po_no = po_res.json()["po_no"]

    client.post("/purchase/receipts", json={
        "po_no": po_no, "qty": 30,
        "receipt_date": "2026-06-22", "unit_price": 100,
    })

    summary = client.get(f"/purchase/orders/{po_no}/summary").json()
    assert summary["order_qty"] == 100
    assert summary["received_qty"] == 30
    assert summary["remaining_qty"] == 70


def test_receipt_exceeds_remaining():
    """미입고잔량 초과 입고 시 400"""
    po_res = client.post("/purchase/orders", json={
        "partner_id": "P001", "part_no": "TEST-001", "qty": 50,
        "order_date": "2026-06-20", "due_date": "2026-06-30",
    })
    po_no = po_res.json()["po_no"]
    res = client.post("/purchase/receipts", json={
        "po_no": po_no, "qty": 60,
        "receipt_date": "2026-06-22", "unit_price": 100,
    })
    assert res.status_code == 400


def test_po_status_transitions():
    """발주상태 발주중 → 일부입고 → 입고완료 전이 확인"""
    po_res = client.post("/purchase/orders", json={
        "partner_id": "P001", "part_no": "TEST-001", "qty": 100,
        "order_date": "2026-06-20", "due_date": "2026-06-30",
    })
    po_no = po_res.json()["po_no"]
    assert po_res.json()["status"] == "발주중"

    client.post("/purchase/receipts", json={"po_no": po_no, "qty": 50, "receipt_date": "2026-06-22", "unit_price": 100})
    summary = client.get(f"/purchase/orders/{po_no}/summary").json()
    assert summary["status"] == "일부입고"

    client.post("/purchase/receipts", json={"po_no": po_no, "qty": 50, "receipt_date": "2026-06-23", "unit_price": 100})
    summary = client.get(f"/purchase/orders/{po_no}/summary").json()
    assert summary["status"] == "입고완료"
    assert summary["remaining_qty"] == 0


def test_item_crud():
    res = client.get("/master/items")
    assert res.status_code == 200
    items = res.json()
    assert any(i["part_no"] == "TEST-001" for i in items)

    client.patch("/master/items/TEST-001", json={"std_buy_price": 200})
    updated = client.get("/master/items/TEST-001").json()
    assert updated["std_buy_price"] == 200
