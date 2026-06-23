"""Phase 3/4 테스트 — 생산오더·금형·외주+생산 통합풀·대시보드 KPI"""


def _seed(client):
    client.post("/master/partners", json={"partner_id": "SUP1", "name": "외주처A", "partner_type": "외주처"})
    client.post("/master/partners", json={"partner_id": "CUS1", "name": "고객사A", "partner_type": "고객"})
    client.post("/master/items", json={"part_no": "P001", "name": "테스트품목", "item_type": "외주품",
                                       "std_buy_price": 100, "std_sell_price": 150})


def _outsource_stock(client, qty=100):
    po = client.post("/purchase/orders", json={
        "partner_id": "SUP1", "part_no": "P001", "qty": qty,
        "order_date": "2026-06-01", "due_date": "2026-06-30",
    }).json()
    gr = client.post("/purchase/receipts", json={
        "po_no": po["po_no"], "qty": qty, "receipt_date": "2026-06-10", "unit_price": 100,
    }).json()
    client.post(f"/stock/receipts/{gr['gr_no']}/confirm")


def test_production_adds_same_pool(client):
    _seed(client)
    _outsource_stock(client, 50)
    pord = client.post("/production/orders", json={
        "part_no": "P001", "planned_qty": 30, "plan_date": "2026-06-15",
    }).json()
    client.post(f"/production/orders/{pord['pord_no']}/result", json={
        "actual_qty": 30, "complete_date": "2026-06-16",
    })
    assert client.get("/stock/snapshot/P001").json()["current_stock"] == 80


def test_mold_shots_accumulate(client):
    _seed(client)
    client.post("/production/molds", json={"mold_no": "M001", "owner": "HD현대일렉트릭", "part_no": "P001"})
    pord = client.post("/production/orders", json={
        "part_no": "P001", "planned_qty": 100, "plan_date": "2026-06-15", "mold_no": "M001",
    }).json()
    client.post(f"/production/orders/{pord['pord_no']}/result", json={
        "actual_qty": 80, "complete_date": "2026-06-16",
    })
    molds = client.get("/production/molds").json()
    assert next(m for m in molds if m["mold_no"] == "M001")["total_shots"] == 80


def test_shipment_draws_from_combined_pool(client):
    _seed(client)
    _outsource_stock(client, 40)
    pord = client.post("/production/orders", json={
        "part_no": "P001", "planned_qty": 60, "plan_date": "2026-06-15",
    }).json()
    client.post(f"/production/orders/{pord['pord_no']}/result", json={
        "actual_qty": 60, "complete_date": "2026-06-16",
    })
    assert client.get("/stock/snapshot/P001").json()["current_stock"] == 100
    so = client.post("/sales/orders", json={
        "partner_id": "CUS1", "part_no": "P001", "qty": 100,
        "order_date": "2026-06-01", "due_date": "2026-06-30",
    }).json()
    sh = client.post("/sales/shipments", json={
        "so_no": so["so_no"], "qty": 100, "ship_date": "2026-06-20", "unit_price": 150,
    })
    assert sh.status_code == 200
    assert client.get("/stock/snapshot/P001").json()["current_stock"] == 0


def test_dashboard_kpi_structure(client):
    _seed(client)
    res = client.get("/dashboard/kpi?year=2026&month=6")
    assert res.status_code == 200
    data = res.json()
    for key in ["delivery_rate", "defect_rate", "inventory_turnover", "gross_profit", "margin_rate"]:
        assert key in data


def test_monthly_closing_structure(client):
    _seed(client)
    res = client.get("/dashboard/monthly-closing?year=2026&month=6")
    assert res.status_code == 200
    data = res.json()
    assert "sales" in data and "purchases" in data


def test_supplier_scorecard(client):
    _seed(client)
    res = client.get("/dashboard/supplier-scorecard")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
