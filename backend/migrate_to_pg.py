"""SQLite → PostgreSQL 데이터 마이그레이션"""
import os, sys
os.environ["DATABASE_URL"] = "postgresql://postgres:LgEDhCQmYKpzdilScCbkXMWLenXtCvyX@postgres.railway.internal:5432/railway"

# Railway internal 주소는 외부에서 접근 불가 → public URL 사용
PG_URL = "postgresql://postgres:LgEDhCQmYKpzdilScCbkXMWLenXtCvyX@postgres.railway.internal:5432/railway"

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

SQLITE_URL = "sqlite:///joy_erp.db"
sqlite_engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
SqliteSession = sessionmaker(bind=sqlite_engine)

pg_engine = create_engine(PG_URL)
PgSession = sessionmaker(bind=pg_engine)

# 모든 모델 임포트 (테이블 생성용)
from app.database import Base
import app.models.master
import app.models.purchase
import app.models.sales
import app.models.ledger
import app.models.quality
import app.models.production
import app.models.auth
import app.models.mold

print("PostgreSQL 테이블 생성 중...")
Base.metadata.create_all(bind=pg_engine)
print("완료!")

tables = [
    "partners", "items", "bom_items",
    "purchase_orders", "receipts", "purchase_groups", "purchase_group_items",
    "sales_orders", "shipments", "invoices",
    "stock_ledger",
    "quality_checks",
    "production_orders", "production_results",
    "auto_order_rules",
    "mold_masters", "mold_processes", "mold_process_assignments",
    "users",
]

sqlite_conn = sqlite_engine.connect()
pg_conn = pg_engine.connect()

for table in tables:
    try:
        rows = sqlite_conn.execute(text(f"SELECT * FROM {table}")).mappings().all()
        if not rows:
            print(f"  {table}: 0건 (스킵)")
            continue

        # PostgreSQL에 기존 데이터 삭제
        pg_conn.execute(text(f"DELETE FROM {table}"))

        # 데이터 삽입
        for row in rows:
            d = dict(row)
            cols = ", ".join(f'"{k}"' for k in d.keys())
            vals = ", ".join(f":{k}" for k in d.keys())
            pg_conn.execute(text(f'INSERT INTO "{table}" ({cols}) VALUES ({vals})'), d)

        pg_conn.commit()
        print(f"  {table}: {len(rows)}건 완료")
    except Exception as e:
        pg_conn.rollback()
        print(f"  {table}: 오류 - {e}")

sqlite_conn.close()
pg_conn.close()
print("\n마이그레이션 완료!")
