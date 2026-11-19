import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.modules.access.services.access_service import create_initial_principal


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client(anyio_backend):
    test_database_url = os.getenv("TEST_DATABASE_URL")
    if test_database_url:
        database_name = (make_url(test_database_url).database or "").lower()
        if "test" not in database_name and "prueba" not in database_name:
            raise RuntimeError(
                "TEST_DATABASE_URL debe apuntar a una base aislada cuyo nombre incluya "
                "'test' o 'prueba'; los fixtures crean y eliminan tablas."
            )
        engine = create_engine(test_database_url, pool_pre_ping=True)
    else:
        engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    async def override_db():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    with factory() as db:
        principal = create_initial_principal(
            db,
            "1234567",
            "Oscar",
            "Pari",
            "principal@example.edu",
            "70000000",
            "SeguraPassphrase2026!",
        )
        # Seed an already onboarded principal for tests that need admin access.
        principal.debe_cambiar_contrasena = False
        db.commit()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def origin_headers():
    return {"Origin": "http://localhost:5173"}
