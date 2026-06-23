"""각 테스트가 독립된 in-memory DB를 쓰도록 격리 (StaticPool로 연결 공유)"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# 모든 모델을 강제 임포트해야 Base.metadata에 테이블이 등록됨
import app.models.master        # noqa: F401
import app.models.purchase      # noqa: F401
import app.models.ledger        # noqa: F401
import app.models.sales         # noqa: F401
import app.models.quality       # noqa: F401
import app.models.production    # noqa: F401

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,   # 모든 세션이 동일한 in-memory DB를 바라보게
    )
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
