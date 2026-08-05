"""v1 gateway permission enforcement — read_only keys cannot write."""
import pytest
from fastapi import HTTPException

from database import ApiKey, User
from routes.v1_gateway import _auth_user
from auth import generate_api_key


class _FakeClient:
    host = "203.0.113.7"


class _FakeRequest:
    client = _FakeClient()


def _make_key(db, user, perms="read_write", active=True):
    k = ApiKey(
        user_id=user.id,
        key=generate_api_key(),
        name="test key",
        permissions=perms,
        is_active=active,
    )
    db.add(k)
    db.commit()
    db.refresh(k)
    return k


def test_read_write_key_can_write(db, make_user):
    u = make_user()
    k = _make_key(db, u, "read_write")
    user, api_key = _auth_user(db, k.key, _FakeRequest(), require_write=True)
    assert user.id == u.id
    assert api_key.id == k.id


def test_read_only_key_blocked_from_write(db, make_user):
    u = make_user()
    k = _make_key(db, u, "read_only")
    with pytest.raises(HTTPException) as exc:
        _auth_user(db, k.key, _FakeRequest(), require_write=True)
    assert exc.value.status_code == 403


def test_read_only_key_allowed_for_read(db, make_user):
    u = make_user()
    k = _make_key(db, u, "read_only")
    # require_write=False (e.g. GET /v1/models) must pass
    user, api_key = _auth_user(db, k.key, _FakeRequest(), require_write=False)
    assert user.id == u.id


def test_inactive_key_rejected(db, make_user):
    u = make_user()
    k = _make_key(db, u, "read_write", active=False)
    with pytest.raises(HTTPException) as exc:
        _auth_user(db, k.key, _FakeRequest(), require_write=False)
    assert exc.value.status_code == 401


def test_expired_key_rejected(db, make_user):
    from datetime import datetime, timedelta, timezone
    u = make_user()
    k = _make_key(db, u)
    k.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        _auth_user(db, k.key, _FakeRequest(), require_write=False)
    assert exc.value.status_code == 403


def test_ip_allowlist_enforced(db, make_user):
    u = make_user()
    k = _make_key(db, u)
    k.ip_allowlist = "198.51.100.1"
    db.commit()
    with pytest.raises(HTTPException) as exc:
        _auth_user(db, k.key, _FakeRequest(), require_write=False)  # client is 203.0.113.7
    assert exc.value.status_code == 403


def test_unknown_key_rejected(db):
    with pytest.raises(HTTPException) as exc:
        _auth_user(db, "sk-nonexistent-123456", _FakeRequest(), require_write=False)
    assert exc.value.status_code == 401
