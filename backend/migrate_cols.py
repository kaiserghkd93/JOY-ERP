from app.database import engine
import sqlalchemy as sa

with engine.connect() as conn:
    for sql in [
        "ALTER TABLE item ADD COLUMN safety_stock INTEGER DEFAULT 0",
        "ALTER TABLE item ADD COLUMN moq INTEGER DEFAULT 1",
        "ALTER TABLE partner ADD COLUMN email VARCHAR(200)",
    ]:
        try:
            conn.execute(sa.text(sql))
            print("OK:", sql[:60])
        except Exception as e:
            print("SKIP:", e)
    conn.commit()
print("Done")
