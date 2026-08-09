"""Round-4 deep-assessment regression tests.

Covers the 3 build-agent fixes:
1. DELETE /api/user/account now requires the current password (re-auth) when
   the account has one — a stolen session token alone can no longer destroy
   an account. OAuth-only accounts (no password_hash) fall through to 2FA.
2. /api/contact strips CR/LF from every field (SMTP header-injection guard).
3. /api/config/payments reports crypto honestly (any(...values())) and the
   crypto addresses endpoint returns a clean 400 instead of a 500 when no
   wallet is configured.
"""
import pytest

from auth import create_access_token
import routes.misc as misc_module


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _del(client, tok, body):
    return client.request("DELETE", "/api/user/account", json=body, headers=_auth(tok))


def _token_for(client, u, password="pass1234"):
    r = client.post("/api/auth/login", json={"email": u.email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _direct_token(u):
    return create_access_token({"sub": str(u.id)})


# ── Finding: account deletion without re-authentication ──

def test_delete_account_requires_password(client, make_user):
    u = make_user()
    tok = _token_for(client, u)
    r = _del(client, tok, {"email": u.email})
    assert r.status_code == 401, r.text
    assert "password" in r.json()["detail"].lower()


def test_delete_account_wrong_password_rejected(client, make_user):
    u = make_user()
    tok = _token_for(client, u)
    r = _del(client, tok, {"email": u.email, "password": "wrong-pass"})
    assert r.status_code == 401, r.text


def test_delete_account_correct_password_succeeds(client, make_user, db):
    u = make_user()
    tok = _token_for(client, u)
    r = _del(client, tok, {"email": u.email, "password": "pass1234"})
    assert r.status_code == 200, r.text
    assert r.json().get("status") == "deleted"
    # Row really gone
    from database import User
    assert db.query(User).filter(User.id == u.id).first() is None


def test_delete_account_oauth_only_without_password(client, make_user):
    """Social-login account (no password_hash): email match is enough."""
    u = make_user(password=None)
    tok = _direct_token(u)
    r = _del(client, tok, {"email": u.email})
    assert r.status_code == 200, r.text
    assert r.json().get("status") == "deleted"


def test_delete_account_email_mismatch_rejected(client, make_user):
    u = make_user()
    tok = _token_for(client, u)
    r = _del(client, tok, {"email": "other@example.com", "password": "pass1234"})
    assert r.status_code == 400, r.text


# ── Finding: contact form CRLF / header injection ──

def test_contact_strips_crlf(client, monkeypatch):
    captured = {}

    def fake_send_email(to, subject, body):
        captured["to"] = to
        captured["subject"] = subject
        captured["body"] = body

    monkeypatch.setattr(misc_module, "send_email", fake_send_email)
    r = client.post("/api/contact", json={
        "name": "Test\r\nBcc: victim@example.com",
        "email": "tester@example.com",
        "message": "hello\r\nBcc: victim@example.com — this body is long enough to pass",
    })
    assert r.status_code == 200, r.text
    # CRLF is the injection primitive — after sanitization no \r or lone \n
    # may survive in subject/body (the literal "Bcc" text is harmless once
    # the newline is gone, so we only assert on control chars).
    assert "\r" not in captured["subject"]
    assert "\r" not in captured["body"]
    assert "\n" not in captured["subject"]


def test_contact_rejects_oversized_message(client, monkeypatch):
    def fake_send_email(to, subject, body):
        raise AssertionError("should not send")

    monkeypatch.setattr(misc_module, "send_email", fake_send_email)
    r = client.post("/api/contact", json={
        "name": "Test",
        "email": "tester@example.com",
        "message": "x" * 5001,
    })
    assert r.status_code == 400, r.text


# ── Finding: crypto rail dead / config dishonest ──

def test_payments_config_crypto_honest(client):
    r = client.get("/api/config/payments")
    assert r.status_code == 200, r.text
    body = r.json()
    # No CRYPTO_* wallet env vars in the test env -> must be False, never a
    # dead rail shown to users.
    assert body["crypto"] is False


def test_crypto_addresses_clean_400_when_unconfigured(client, make_user):
    u = make_user()
    tok = _direct_token(u)
    r = client.get("/api/payments/crypto/addresses", headers=_auth(tok))
    assert r.status_code == 400, r.text
    assert "not configured" in r.json()["detail"].lower()
