"""2FA (TOTP) endpoint + login-gate tests — real DB, no Auth0 dependency."""

from auth import create_access_token
from totp import totp_at


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def test_2fa_status_disabled_by_default(client, make_user):
    u = make_user()
    r = client.get("/api/auth/2fa/status", headers=_auth(u))
    assert r.status_code == 200
    assert r.json()["enabled"] is False


def test_2fa_setup_returns_secret(client, make_user):
    u = make_user()
    r = client.post("/api/auth/2fa/setup", headers=_auth(u))
    assert r.status_code == 200
    body = r.json()
    assert len(body["secret"]) == 32
    assert body["otpauth_url"].startswith("otpauth://")


def test_2fa_enable_requires_valid_code(client, make_user):
    u = make_user()
    setup = client.post("/api/auth/2fa/setup", headers=_auth(u)).json()
    secret = setup["secret"]

    # Wrong code → 400
    bad = client.post("/api/auth/2fa/enable", headers=_auth(u), json={"code": "000000"})
    assert bad.status_code == 400

    # Correct code → enabled
    good = client.post("/api/auth/2fa/enable", headers=_auth(u), json={"code": totp_at(secret)})
    assert good.status_code == 200
    assert good.json()["status"] == "enabled"
    assert client.get("/api/auth/2fa/status", headers=_auth(u)).json()["enabled"] is True


def test_2fa_cannot_setup_twice(client, make_user):
    u = make_user()
    client.post("/api/auth/2fa/setup", headers=_auth(u))
    secret = client.post("/api/auth/2fa/setup", headers=_auth(u)).json()["secret"]
    client.post("/api/auth/2fa/enable", headers=_auth(u), json={"code": totp_at(secret)})
    r = client.post("/api/auth/2fa/setup", headers=_auth(u))
    assert r.status_code == 400  # already enabled


def test_password_login_requires_2fa_when_enabled(client, make_user):
    u = make_user(email="gated@test.com", password="secret123")
    setup = client.post("/api/auth/2fa/setup", headers=_auth(u)).json()
    client.post("/api/auth/2fa/enable", headers=_auth(u), json={"code": totp_at(setup["secret"])})

    # Normal password login → must NOT return a real token
    r = client.post("/api/auth/login", json={"email": "gated@test.com", "password": "secret123"})
    assert r.status_code == 200
    body = r.json()
    assert body.get("requires_2fa") is True
    assert "pre_token" in body
    assert "token" not in body


def test_2fa_confirm_exchanges_pre_token(client, make_user):
    u = make_user(email="confirm@test.com", password="secret123")
    setup = client.post("/api/auth/2fa/setup", headers=_auth(u)).json()
    client.post("/api/auth/2fa/enable", headers=_auth(u), json={"code": totp_at(setup["secret"])})

    login = client.post("/api/auth/login", json={"email": "confirm@test.com", "password": "secret123"}).json()
    pre = login["pre_token"]

    # Wrong code → 401
    bad = client.post("/api/auth/2fa/confirm", json={"pre_token": pre, "code": "000000"})
    assert bad.status_code == 401

    # Correct code → full auth response
    good = client.post("/api/auth/2fa/confirm", json={"pre_token": pre, "code": totp_at(setup["secret"])})
    assert good.status_code == 200
    body = good.json()
    assert body.get("token")
    assert body.get("refresh_token")
    assert body["user"]["email"] == "confirm@test.com"


def test_2fa_confirm_rejects_regular_token(client, make_user):
    u = make_user()
    # A plain access token (no scope=2fa) must NOT pass as a pre_token
    regular = create_access_token({"sub": str(u.id)})
    r = client.post("/api/auth/2fa/confirm", json={"pre_token": regular, "code": totp_at("JBSWY3DPEHPK3PXP")})
    assert r.status_code == 401


def test_2fa_disable_requires_code(client, make_user):
    u = make_user()
    setup = client.post("/api/auth/2fa/setup", headers=_auth(u)).json()
    client.post("/api/auth/2fa/enable", headers=_auth(u), json={"code": totp_at(setup["secret"])})

    bad = client.post("/api/auth/2fa/disable", headers=_auth(u), json={"code": "000000"})
    assert bad.status_code == 400

    good = client.post("/api/auth/2fa/disable", headers=_auth(u), json={"code": totp_at(setup["secret"])})
    assert good.status_code == 200
    assert client.get("/api/auth/2fa/status", headers=_auth(u)).json()["enabled"] is False
