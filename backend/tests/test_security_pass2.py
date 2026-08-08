"""Security assessment Pass 2 regression tests — fixes for findings 1-7."""
import json
import pytest
from fastapi.testclient import TestClient

from database import User
from common import SIGNUP_BONUS_TOKENS
from webhooks import encrypt_secret, decrypt_secret, _is_private_url


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── Finding 1: SSRF via webhook_url ──

def test_webhook_url_rejects_plain_http(client, make_user):
    u = make_user()
    r = client.put("/api/user/settings", json={"webhook_url": "http://example.com/hook"}, headers=_auth("t"))
    assert r.status_code == 401  # need real token


def _token_for(client, u):
    # Issue a token via login? Simpler: create access token directly is not
    # exposed — login path requires password. Use make_user + login.
    r = client.post("/api/auth/login", json={"email": u.email, "password": "pass1234"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_webhook_url_https_only_and_ssrf_blocked(client, make_user):
    u = make_user()
    tok = _token_for(client, u)
    h = _auth(tok)
    # plain http rejected
    r = client.put("/api/user/settings", json={"webhook_url": "http://example.com/hook"}, headers=h)
    assert r.status_code == 400, r.text
    # loopback rejected
    r = client.put("/api/user/settings", json={"webhook_url": "https://127.0.0.1:8000/x"}, headers=h)
    assert r.status_code == 400, r.text
    # cloud metadata rejected
    r = client.put("/api/user/settings", json={"webhook_url": "https://169.254.169.254/latest/meta-data/"}, headers=h)
    assert r.status_code == 400, r.text
    # private 10/8 rejected
    r = client.put("/api/user/settings", json={"webhook_url": "https://10.0.0.5/hook"}, headers=h)
    assert r.status_code == 400, r.text
    # valid https accepted (example.com is a resolvable public host)
    r = client.put("/api/user/settings", json={"webhook_url": "https://example.com/glbtoken"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["settings"]["webhook_url"] == "https://example.com/glbtoken"


def test_is_private_url_covers_cgnat():
    assert _is_private_url("http://100.64.0.1/x") is True
    assert _is_private_url("https://100.127.255.254/x") is True
    assert _is_private_url("https://example.com/x") is False


# ── Finding 3/7: webhook_secret encrypted at rest + masked ──

def test_webhook_secret_encrypted_and_masked(client, make_user, db):
    u = make_user()
    tok = _token_for(client, u)
    h = _auth(tok)
    r = client.put("/api/user/settings", json={"webhook_secret": "super-secret-value"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["settings"]["webhook_secret"] == "••••••••"
    # At rest: encrypted, not plaintext
    db.refresh(u)
    stored = json.loads(u.settings)["webhook_secret"]
    assert stored.startswith("enc:v1:"), stored
    assert "super-secret-value" not in stored
    # Round-trip decryption restores the original for signing
    assert decrypt_secret(stored) == "super-secret-value"
    # GET returns masked
    r = client.get("/api/user/settings", headers=h)
    assert r.json()["webhook_secret"] == "••••••••"


def test_secret_roundtrip():
    enc = encrypt_secret("abc123")
    assert enc.startswith("enc:v1:")
    assert decrypt_secret(enc) == "abc123"
    assert decrypt_secret("legacy-plain") == "legacy-plain"


# ── Finding 2: free-credit farming — bonus held until email verified ──

def test_register_holds_bonus_until_verified(client, db):
    r = client.post("/api/auth/register", json={
        "name": "New User", "email": "fresh@example.com", "password": "strongpass1",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["token_balance"] == 0  # held
    tok = body["token"]
    user = db.query(User).filter(User.email == "fresh@example.com").first()
    assert user is not None
    assert json.loads(user.settings)["pending_bonus"] == SIGNUP_BONUS_TOKENS

    # Request verification OTP, then verify with the stored OTP
    r = client.post("/api/auth/send-verification", json={}, headers=_auth(tok))
    assert r.status_code == 200, r.text
    db.refresh(user)
    otp = user.email_otp
    assert otp
    r = client.post("/api/auth/verify-email", json={"otp": otp}, headers=_auth(tok))
    assert r.status_code == 200, r.text
    db.refresh(user)
    assert user.email_verified is True
    assert user.token_balance == SIGNUP_BONUS_TOKENS  # released
    assert "pending_bonus" not in json.loads(user.settings)


def test_register_duplicate_email_blocked(client):
    r1 = client.post("/api/auth/register", json={
        "name": "A", "email": "dup@example.com", "password": "strongpass1"})
    assert r1.status_code == 200, r1.text
    r2 = client.post("/api/auth/register", json={
        "name": "B", "email": "dup@example.com", "password": "strongpass2"})
    assert r2.status_code == 400


# ── Finding 4: uniform forgot-password response ──

def test_forgot_password_uniform_response(client, make_user):
    make_user(email="exists@example.com")
    r_missing = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    r_existing = client.post("/api/auth/forgot-password", json={"email": "exists@example.com"})
    assert r_missing.status_code == 200
    assert r_existing.status_code == 200
    assert r_missing.json() == r_existing.json() == {"status": "sent"}


# ── Finding 5: login lockout ──

def test_login_lockout_after_5_failures(client, make_user):
    u = make_user(email="lock@example.com", password="rightpass1")
    for i in range(5):
        r = client.post("/api/auth/login", json={"email": u.email, "password": "wrongpass"})
        assert r.status_code == 401, (i, r.status_code)
    r = client.post("/api/auth/login", json={"email": u.email, "password": "wrongpass"})
    assert r.status_code == 429, r.text
    # Correct password is also blocked while locked
    r = client.post("/api/auth/login", json={"email": u.email, "password": "rightpass1"})
    assert r.status_code == 429, r.text


def test_login_success_clears_lockout(client, make_user):
    u = make_user(email="ok@example.com", password="rightpass1")
    for _ in range(3):
        client.post("/api/auth/login", json={"email": u.email, "password": "bad"})
    r = client.post("/api/auth/login", json={"email": u.email, "password": "rightpass1"})
    assert r.status_code == 200, r.text
    # After success, failures restart counting (not locked)
    r = client.post("/api/auth/login", json={"email": u.email, "password": "bad"})
    assert r.status_code == 401


# ── Finding 6: health slim + openapi disabled ──

def test_health_is_minimal(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body == {"status": "ok"}
    for leak in ("version", "newapi_connected", "database", "models_count", "name"):
        assert leak not in body


def test_openapi_disabled(client):
    assert client.get("/openapi.json").status_code == 404
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404


# ── Finding 10: payment rails config — frontend hides unconfigured rails ──

def test_payment_methods_config(client):
    r = client.get("/api/config/payments")
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {"stripe", "paystack", "crypto"}
    for k, v in body.items():
        assert isinstance(v, bool)
