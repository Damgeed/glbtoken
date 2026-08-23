"""Regression tests for credential cleanup and security boundaries."""

import asyncio
import hashlib
import json
from datetime import datetime, timedelta, timezone

from auth import create_access_token
from data_hygiene import clean_security_data
from database import ApiKey, OrgInvite, RefreshToken, User
from main import BodySizeLimitMiddleware, MAX_JSON_BODY_BYTES
from secret_store import decrypt_secret


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def test_cleanup_hashes_and_purges_plaintext_secrets(db, make_user):
    user = make_user()
    user.newapi_token = "upstream-plaintext-token"
    user.settings = json.dumps({
        "webhook_secret": "webhook-plaintext",
        "totp_secret": "totp-plaintext",
    })
    legacy = ApiKey(user_id=user.id, key="sk-legacy-plaintext", name="legacy")
    past = datetime.now(timezone.utc) - timedelta(days=1)
    db.add_all([
        legacy,
        RefreshToken(user_id=user.id, token_hash="expired-hash", expires_at=past),
        OrgInvite(org_id=1, email=user.email, token="expired-invite", expires_at=past),
    ])
    db.commit()

    counts = clean_security_data(delete_expired=True)
    db.expire_all()
    cleaned = db.query(ApiKey).filter(ApiKey.id == legacy.id).one()
    assert cleaned.key is None
    assert cleaned.key_hash == hashlib.sha256(b"sk-legacy-plaintext").hexdigest()
    assert counts["api_keys_purged"] == 1
    assert db.query(RefreshToken).count() == 0
    assert db.query(OrgInvite).count() == 0

    db.refresh(user)
    assert user.newapi_token.startswith("enc:v1:")
    assert decrypt_secret(user.newapi_token) == "upstream-plaintext-token"
    settings = json.loads(user.settings)
    assert decrypt_secret(settings["webhook_secret"]) == "webhook-plaintext"
    assert decrypt_secret(settings["totp_secret"]) == "totp-plaintext"


def test_first_signup_is_not_implicitly_admin(client, db):
    response = client.post("/api/auth/register", json={
        "name": "First", "email": "first@example.com", "password": "strongpass1",
    })
    assert response.status_code == 200
    user = db.query(User).filter_by(email="first@example.com").one()
    assert user.is_admin is False


def test_admin_bootstrap_requires_allowlisted_verified_email(client, db, monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "owner@example.com")
    response = client.post("/api/auth/register", json={
        "name": "Owner", "email": "owner@example.com", "password": "strongpass1",
    })
    assert response.status_code == 200
    user = db.query(User).filter_by(email="owner@example.com").one()
    assert user.is_admin is False

    user.email_otp = hashlib.sha256(b"123456").hexdigest()
    user.email_otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    db.commit()
    verified = client.post(
        "/api/auth/verify-email", json={"otp": "123456"}, headers=_auth(user)
    )
    assert verified.status_code == 200
    db.refresh(user)
    assert user.is_admin is True


def test_chunked_json_body_limit_is_enforced():
    sent = []
    messages = iter([
        {"type": "http.request", "body": b"x" * MAX_JSON_BODY_BYTES, "more_body": True},
        {"type": "http.request", "body": b"x", "more_body": False},
    ])

    async def receive():
        return next(messages)

    async def send(message):
        sent.append(message)

    async def downstream(scope, receive, send):
        while True:
            message = await receive()
            if not message.get("more_body"):
                break

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": [(b"content-type", b"application/json")],
    }
    asyncio.run(BodySizeLimitMiddleware(downstream)(scope, receive, send))
    assert sent[0]["type"] == "http.response.start"
    assert sent[0]["status"] == 413


def test_implicit_oauth_is_disabled_and_pkce_uses_post(client, monkeypatch):
    monkeypatch.setattr("routes.auth_routes.is_auth0_configured", lambda: False)
    implicit = client.get("/api/auth/auth0/callback")
    assert implicit.status_code == 410

    pkce = client.post(
        "/api/auth/auth0/pkce-callback",
        data={"code": "one-time-code", "code_verifier": "verifier"},
        follow_redirects=False,
    )
    assert pkce.status_code == 303
    assert "code_verifier" not in pkce.headers["location"]
