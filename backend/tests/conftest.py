"""GlbTOKEN test fixtures — isolated SQLite DB, dependency override, limiter off."""
import os
import sys
import pathlib

# MUST be set before importing app modules (engine created at import time)
os.environ["JWT_SECRET"] = "pytest-secret-key"
os.environ["GLBTOKEN_SECRET"] = "pytest-secret-key"
os.environ["DATABASE_URL"] = "sqlite:///./test_glbtoken.db"

BACKEND = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

import pytest
from fastapi.testclient import TestClient

from database import Base, engine, SessionLocal, get_db, User
import main as app_module
from common import limiter
from auth import hash_password

# Disable rate limiting in tests — all TestClient requests share one IP
limiter.enabled = False


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app_module.app.dependency_overrides[get_db] = override_get_db
    # Use TestClient WITHOUT context manager so lifespan (New API sync, pricing
    # pull) does not run — we only exercise route handlers.
    c = TestClient(app_module.app, raise_server_exceptions=True)
    yield c
    app_module.app.dependency_overrides.clear()


@pytest.fixture()
def make_user(db):
    """Factory: create a user (+ optional password) and return the ORM object."""
    counter = {"n": 0}

    def _make(name="Test User", email=None, password="pass1234", balance=1000.0, admin=False):
        counter["n"] += 1
        u = User(
            name=name,
            email=email or f"user{counter['n']}@test.com",
            password_hash=hash_password(password) if password else None,
            token_balance=balance,
            email_verified=True,
            is_admin=admin,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        return u

    return _make
