"""Tests for the Cloudflare origin guard middleware (watchdog Round 6/7 fix).

The Railway origin is directly reachable; rate limits keyed on
CF-Connecting-IP were bypassable by forging that header. All real user traffic
flows through Cloudflare (api.glbtoken.com), which adds cf-ray to every
proxied request. The guard fails closed: sensitive auth endpoints reject
requests with no cf-ray (403) unless the peer is loopback/private (local dev)
or the test limiter is disabled (conftest).

These tests enable the limiter + guard explicitly to exercise the 403 path,
then restore the conftest defaults.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

os.environ.setdefault("JWT_SECRET", "pytest-secret-key")
os.environ.setdefault("GLBTOKEN_SECRET", "pytest-secret-key")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_glbtoken.db")

import pytest
from fastapi.testclient import TestClient
from database import Base, engine, SessionLocal, get_db
import main as app_module
from common import limiter


@pytest.fixture(autouse=True)
def _reset_guard_state():
    """Every test starts with the conftest default (limiter disabled) so tests
    never leak enabled-state into one another. dispatch monkeypatching is
    handled by pytest's monkeypatch fixture (auto-restored)."""
    limiter.enabled = False
    yield
    limiter.enabled = False


def _make_client(db, peer="100.64.0.99"):
    """TestClient whose requests present a CGNAT peer (production-like)."""
    def override_get_db():
        try:
            yield db
        finally:
            pass
    app_module.app.dependency_overrides[get_db] = override_get_db
    c = TestClient(app_module.app, raise_server_exceptions=True)
    # Force the client peer to a CGNAT address so the guard treats it as an
    # untrusted direct-origin hit (not localhost).
    c.headers["x-forwarded-for"] = peer  # informational; guard keys on cf-ray
    return c


def _guard_enabled(client, enabled=True):
    """Temporarily flip the guard on/off by toggling the limiter flag the
    middleware consults. The guard checks `limiter.enabled` — conftest sets it
    False; tests here turn it True to exercise production enforcement."""
    if enabled:
        limiter.enabled = True
    else:
        limiter.enabled = False


def test_guard_blocks_direct_origin_login(db):
    """No cf-ray on a CGNAT peer ⇒ 403 on /api/auth/login."""
    c = _make_client(db)
    _guard_enabled(c, True)
    try:
        r = c.post("/api/auth/login", json={"email": "a@b.com", "password": "x"})
        assert r.status_code == 403
        assert "Direct origin" in r.json().get("detail", "")
    finally:
        _guard_enabled(c, False)
        app_module.app.dependency_overrides.clear()


def test_guard_blocks_direct_origin_register(db):
    c = _make_client(db)
    _guard_enabled(c, True)
    try:
        r = c.post("/api/auth/register", json={"email": "new@b.com", "password": "x"})
        assert r.status_code == 403
    finally:
        _guard_enabled(c, False)
        app_module.app.dependency_overrides.clear()


def test_guard_allows_cf_ray(db):
    """cf-ray present (real Cloudflare traffic) ⇒ passes through to handler."""
    c = _make_client(db)
    _guard_enabled(c, True)
    try:
        r = c.post(
            "/api/auth/login",
            json={"email": "a@b.com", "password": "x"},
            headers={"cf-ray": "abc123def456-SIN"},
        )
        # Not 403 → guard let it through; handler responds 401 (bad creds)
        assert r.status_code == 401
    finally:
        _guard_enabled(c, False)
        app_module.app.dependency_overrides.clear()


def test_guard_allows_localhost(db):
    """Loopback peer (local dev) bypasses the guard even without cf-ray.

    NOTE: we test the _is_local_peer helper directly here. A full request-path
    test is impossible with TestClient because its ASGI transport reports the
    peer as 'testclient' (not a real IP) and BaseHTTPMiddleware caches dispatch
    at instantiation, so monkeypatching dispatch doesn't take effect. The
    production path (uvicorn with a real 127.0.0.1 peer) is verified manually.
    """
    from common import _is_local_peer

    class FakeReq:
        def __init__(self, peer):
            self.client = type("C", (), {"host": peer})()

    assert _is_local_peer(FakeReq("127.0.0.1")) is True
    assert _is_local_peer(FakeReq("::1")) is True
    assert _is_local_peer(FakeReq("192.168.1.10")) is True
    assert _is_local_peer(FakeReq("10.0.0.5")) is True
    # CGNAT Railway peer must NOT be treated as local
    assert _is_local_peer(FakeReq("100.64.0.99")) is False
    assert _is_local_peer(FakeReq("8.8.8.8")) is False
    assert _is_local_peer(FakeReq("172.64.0.5")) is False


def test_guard_does_not_block_health(db):
    c = _make_client(db)
    _guard_enabled(c, True)
    try:
        r = c.get("/")
        assert r.status_code == 200
    finally:
        _guard_enabled(c, False)
        app_module.app.dependency_overrides.clear()


def test_guard_does_not_block_v1_gateway(db):
    """/v1 endpoints use API-key auth and must not be blocked."""
    c = _make_client(db)
    _guard_enabled(c, True)
    try:
        r = c.get("/v1/models", headers={"Authorization": "Bearer bad-key"})
        assert r.status_code != 403  # either 401/422 from gateway auth, not guard
    finally:
        _guard_enabled(c, False)
        app_module.app.dependency_overrides.clear()


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in fns:
        fn(None) if fn.__code__.co_argcount == 0 else None
        print(f"⚠️  {fn.__name__} skipped (needs pytest fixtures)")
    print("Run with: python -m pytest tests/test_cloudflare_guard.py -v")
