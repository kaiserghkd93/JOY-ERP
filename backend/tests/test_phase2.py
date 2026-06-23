"""Phase 2 테스트 — 수입검사 게이트, 불합격 재고 차단, 불량률 집계"""


def _seed(client):
    client.post("/master/partners", json={"partner_id": "SUP1", "name": "외주처A", "partner_type": "외주처"})
    client.post("/master/items", json={"part_no": "P001", "name": "테스트품목", "item_type": "외주품", "std_buy_price": 100})


def _make_receipt(client, qty=100):
    po = client.post("/purchase/orders", json={
        "partner_id": "SUP1", "part_no": "P001", "qty": qty,
        "order_date": "2026-06-01", "due_date": "2026-06-30",
    }).json()
    return client.post("/purchase/receipts", json={
        "po_no": po["po_no"], "qty": qty, "receipt_date": "2026-06-10", "unit_price": 100,
    }).json()


def test_full_pass_adds_stock(client):
    _seed(client)
    gr = _make_receipt(client, 100)
    client.post("/quality/inspections", json={
        "gr_no": gr["gr_no"], "inspect_date": "2026-06-11",
        "pass_qty": 100, "fail_qty": 0, "disposal": "보류",
    })
    assert client.get("/stock/snapshot/P001").json()["current_stock"] == 100


def test_full_fail_no_stock(client):
    _seed(client)
    gr = _make_receipt(client, 50)
    client.post("/quality/inspections", json={
        "gr_no": gr["gr_no"], "inspect_date": "2026-06-11",
        "pass_qty": 0, "fail_qty": 50, "disposal": "반품",
    })
    assert client.get("/stock/snapshot/P001").json()["current_stock"] == 0


def test_partial_pass_adds_only_pass_qty(client):
    _seed(client)
    gr = _make_receipt(client, 100)
    client.post("/quality/inspections", json={
        "gr_no": gr["gr_no"], "inspect_date": "2026-06-11",
        "pass_qty": 70, "fail_qty": 30, "disposal": "폐기",
    })
    assert client.get("/stock/snapshot/P001").json()["current_stock"] == 70


def test_confirm_blocked_after_inspection(client):
    _seed(client)
    gr = _make_receipt(client, 100)
    client.post("/quality/inspections", json={
        "gr_no": gr["gr_no"], "inspect_date": "2026-06-11",
        "pass_qty": 100, "fail_qty": 0, "disposal": "보류",
    })
    assert client.post(f"/stock/receipts/{gr['gr_no']}/confirm").status_code == 400


def test_defect_rate_calculation(client):
    _seed(client)
    gr1 = _make_receipt(client, 100)
    client.post("/quality/inspections", json={
        "gr_no": gr1["gr_no"], "inspect_date": "2026-06-11",
        "pass_qty": 80, "fail_qty": 20, "disposal": "폐기",
    })
    po2 = client.post("/purchase/orders", json={
        "partner_id": "SUP1", "part_no": "P001", "qty": 50,
        "order_date": "2026-06-05", "due_date": "2026-06-30",
    }).json()
    gr2 = client.post("/purchase/receipts", json={
        "po_no": po2["po_no"], "qty": 50, "receipt_date": "2026-06-12", "unit_price": 100,
    }).json()
    client.post("/quality/inspections", json={
        "gr_no": gr2["gr_no"], "inspect_date": "2026-06-12",
        "pass_qty": 50, "fail_qty": 0, "disposal": "보류",
    })
    rates = client.get("/quality/defect-rate").json()
    assert len(rates) == 1
    r = rates[0]
    assert r["total_inspect"] == 150
    assert r["total_fail"] == 20
    assert abs(r["defect_rate"] - 13.33) < 0.1


def test_claim_create_and_update(client):
    _seed(client)
    claim = client.post("/quality/claims", json={
        "partner_id": "SUP1", "part_no": "P001",
        "occur_date": "2026-06-11", "defect_type": "치수불량", "defect_qty": 20,
        "m4_category": "Material(자재)",
    }).json()
    assert claim["status"] == "접수"
    updated = client.patch(f"/quality/claims/{claim['claim_no']}", json={
        "why1": "원자재 두께 편차", "corrective_action": "수입검사 전수화", "status": "완료",
    }).json()
    assert updated["status"] == "완료"
    assert updated["why1"] == "원자재 두께 편차"
