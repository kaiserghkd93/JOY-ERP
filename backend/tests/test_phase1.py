"""Phase 1 테스트 — 재고원장, 수주/출하, 미납잔량, 취소전표"""


def _seed(client):
    client.post("/master/partners", json={"partner_id": "SUP1", "name": "외주처A", "partner_type": "외주처"})
    client.post("/master/partners", json={"partner_id": "CUS1", "name": "고객사A", "partner_type": "고객"})
    client.post("/master/items", json={"part_no": "P001", "name": "테스트품목", "item_type": "외주품",
                                       "std_buy_price": 100, "std_sell_price": 150})


def _make_po_receipt(client, qty=100, receipt_qty=None):
    po = client.post("/purchase/orders", json={
        "partner_id": "SUP1", "part_no": "P001", "qty": qty,
        "order_date": "2026-06-01", "due_date": "2026-06-30",
    }).json()
    gr = client.post("/purchase/receipts", json={
        "po_no": po["po_no"], "qty": receipt_qty or qty,
        "receipt_date": "2026-06-10", "unit_price": 100,
    }).json()
    return po, gr


def test_receipt_confirm_increases_stock(client):
    _seed(client)
    _, gr = _make_po_receipt(client, 100)
    client.post(f"/stock/receipts/{gr['gr_no']}/confirm")
    assert client.get("/stock/snapshot/P001").json()["current_stock"] == 100


def test_shipment_decreases_stock(client):
    _seed(client)
    _, gr = _make_po_receipt(client, 100)
    client.post(f"/stock/receipts/{gr['gr_no']}/confirm")
    so = client.post("/sales/orders", json={
        "partner_id": "CUS1", "part_no": "P001", "qty": 100,
        "order_date": "2026-06-01", "due_date": "2026-06-30",
    }).json()
    client.post("/sales/shipments", json={
        "so_no": so["so_no"], "qty": 60, "ship_date": "2026-06-15", "unit_price": 150,
    })
    assert client.get("/stock/snapshot/P001").json()["current_stock"] == 40


def test_cancel_receipt_restores_stock(client):
    _seed(client)
    _, gr = _make_po_receipt(client, 100)
    client.post(f"/stock/receipts/{gr['gr_no']}/confirm")
    assert client.get("/stock/snapshot/P001").json()["current_stock"] == 100
    client.post(f"/stock/receipts/{gr['gr_no']}/cancel")
    assert client.get("/stock/snapshot/P001").json()["current_stock"] == 0


def test_cancel_shipment_restores_stock(client):
    _seed(client)
    _, gr = _make_po_receipt(client, 100)
    client.post(f"/stock/receipts/{gr['gr_no']}/confirm")
    so = client.post("/sales/orders", json={
        "partner_id": "CUS1", "part_no": "P001", "qty": 100,
        "order_date": "2026-06-01", "due_date": "2026-06-30",
    }).json()
    sh = client.post("/sales/shipments", json={
        "so_no": so["so_no"], "qty": 60, "ship_date": "2026-06-15", "unit_price": 150,
    }).json()
    assert client.get("/stock/snapshot/P001").json()["current_stock"] == 40
    client.post(f"/sales/shipments/{sh['sh_no']}/cancel")
    assert client.get("/stock/snapshot/P001").json()["current_stock"] == 100


def test_ledger_sum_equals_stock(client):
    _seed(client)
    _, gr = _make_po_receipt(client, 100)
    client.post(f"/stock/receipts/{gr['gr_no']}/confirm")
    so = client.post("/sales/orders", json={
        "partner_id": "CUS1", "part_no": "P001", "qty": 100,
        "order_date": "2026-06-01", "due_date": "2026-06-30",
    }).json()
    client.post("/sales/shipments", json={
        "so_no": so["so_no"], "qty": 30, "ship_date": "2026-06-15", "unit_price": 150,
    })
    client.post("/stock/adjust", json={"part_no": "P001", "delta": 5, "txn_date": "2026-06-20", "note": "실사조정"})
    ledger = client.get("/stock/ledger/P001").json()
    assert sum(e["qty"] for e in ledger) == client.get("/stock/snapshot/P001").json()["current_stock"]


def test_so_remaining_qty(client):
    _seed(client)
    _, gr = _make_po_receipt(client, 200)
    client.post(f"/stock/receipts/{gr['gr_no']}/confirm")
    so = client.post("/sales/orders", json={
        "partner_id": "CUS1", "part_no": "P001", "qty": 150,
        "order_date": "2026-06-01", "due_date": "2026-06-30",
    }).json()
    client.post("/sales/shipments", json={
        "so_no": so["so_no"], "qty": 50, "ship_date": "2026-06-15", "unit_price": 150,
    })
    s = client.get(f"/sales/orders/{so['so_no']}/summary").json()
    assert s["order_qty"] == 150 and s["shipped_qty"] == 50 and s["remaining_qty"] == 100


def test_shipment_blocked_when_no_stock(client):
    _seed(client)
    so = client.post("/sales/orders", json={
        "partner_id": "CUS1", "part_no": "P001", "qty": 100,
        "order_date": "2026-06-01", "due_date": "2026-06-30",
    }).json()
    res = client.post("/sales/shipments", json={
        "so_no": so["so_no"], "qty": 10, "ship_date": "2026-06-15", "unit_price": 150,
    })
    assert res.status_code == 400
