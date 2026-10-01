"""로컬 SQLite 데이터를 Railway API로 전송"""
import sqlite3, requests

RAILWAY_URL = "https://joy-erp-production.up.railway.app"

# 관리자 로그인
r = requests.post(f"{RAILWAY_URL}/auth/login", json={"username": "admin", "password": "admin1234"})
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

conn = sqlite3.connect("joy_erp.db")
conn.row_factory = sqlite3.Row

# FK 순서에 맞게 정렬
tables = [
    "partner", "item", "bom_line",
    "purchase_order_group",
    "purchase_order", "receipt",
    "sales_order", "shipment", "invoice", "invoice_line",
    "stock_ledger",
    "inspection", "quality_claim",
    "production_order", "monthly_plan", "daily_actual",
    "labor_rate", "product_cost_std", "carryover",
    "mold", "mold_order", "mold_part", "mold_trial", "mold_process",
    "mes_sync_log", "mes_part_map", "mes_production_log", "mes_production_cost",
]

data = {}
for table in tables:
    try:
        rows = conn.execute(f"SELECT * FROM [{table}]").fetchall()
        data[table] = [dict(r) for r in rows]
        print(f"  {table}: {len(rows)}건")
    except Exception as e:
        print(f"  {table}: 스킵 ({e})")

conn.close()

print("\nRailway로 전송 중...")
r = requests.post(f"{RAILWAY_URL}/admin/import-data", json=data, headers=headers, timeout=180)
print("결과:", r.status_code)
result = r.json()
for table, val in result.items():
    print(f"  {table}: {val}")
