"""Phase 0 테스트 — 마스터/트랜잭션 분리, 미입고잔량"""
import pytest


def _seed(client):
    client.post("/master/partners", json={"partner_id": "P001", "name": "테스트외주", "partner_type": "외주처"})
    client.post("/master/items", json={"part_no": "TEST-001", "name": "테스트품목", "item_type": "외주품",
                                       "std_buy_price": 100, "std_sell_price": 150})


def test_receipt_requires_po(client):
    _seed(client)
    res = client.post("/purchase/receipts", json={
        "po_no": "PO-FAKE-001", "qty": 10,
        "receipt_date": "2026-06-22", "unit_price": 100,
    })
    assert res.status_code == 404


def test_remaining_qty_accurate(client):
    _seed(client)
    po = client.post("/purchase/orders", json={
        "partner_id": "P001", "part_no": "TEST-001", "qty": 100,
        "order_date": "2026-06-20", "due_date": "2026-06-30",
    }).json()
    client.post("/purchase/receipts", json={
        "po_no": po["po_no"], "qty": 30,
        "receipt_date": "2026-06-22", "unit_price": 100,
    })
    summary = client.get(f"/purchase/orders/{po['po_no']}/summary").json()
    assert summary["order_qty"] == 100
    assert summary["received_qty"] == 30
    assert summary["remaining_qty"] == 70


def test_receipt_exceeds_remaining(client):
    _seed(client)
    po = client.post("/purchase/orders", json={
        "partner_id": "P001", "part_no": "TEST-001", "qty": 50,
        "order_date": "2026-06-20", "due_date": "2026-06-30",
    }).json()
    res = client.post("/purchase/receipts", json={
        "po_no": po["po_no"], "qty": 60,
        "receipt_date": "2026-06-22", "unit_price": 100,
    })
    assert res.status_code == 400


def test_po_status_transitions(client):
    _seed(client)
    po = client.post("/purchase/orders", json={
        "partner_id": "P001", "part_no": "TEST-001", "qty": 100,
        "order_date": "2026-06-20", "due_date": "2026-06-30",
    }).json()
    assert po["status"] == "발주중"

    client.post("/purchase/receipts", json={"po_no": po["po_no"], "qty": 50,
                                             "receipt_date": "2026-06-22", "unit_price": 100})
    assert client.get(f"/purchase/orders/{po['po_no']}/summary").json()["status"] == "일부입고"

    client.post("/purchase/receipts", json={"po_no": po["po_no"], "qty": 50,
                                             "receipt_date": "2026-06-23", "unit_price": 100})
    s = client.get(f"/purchase/orders/{po['po_no']}/summary").json()
    assert s["status"] == "입고완료"
    assert s["remaining_qty"] == 0


def test_item_crud(client):
    _seed(client)
    items = client.get("/master/items").json()
    assert any(i["part_no"] == "TEST-001" for i in items)
    client.patch("/master/items/TEST-001", json={"std_buy_price": 200})
    assert client.get("/master/items/TEST-001").json()["std_buy_price"] == 200
