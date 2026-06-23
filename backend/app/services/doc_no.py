from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import text


def next_doc_no(db: Session, prefix: str, table: str, pk_col: str) -> str:
    today_str = date.today().strftime("%Y%m%d")
    pattern = f"{prefix}-{today_str}-%"
    row = db.execute(
        text(f"SELECT {pk_col} FROM {table} WHERE {pk_col} LIKE :p ORDER BY {pk_col} DESC LIMIT 1"),
        {"p": pattern},
    ).fetchone()
    if row:
        seq = int(row[0].split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}-{today_str}-{seq:03d}"
