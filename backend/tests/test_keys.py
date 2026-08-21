"""API key CRUD + permission validation tests."""
from datetime import datetime, timezone

from auth import create_access_token


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def test_create_key_validation(client, make_user):
    u = make_user()
    r = client.post("/api/keys", headers=_auth(u), json={
        "name": "bad", "permissions": "admin",  # not allowed
    })
    assert r.status_code == 400


def test_create_key_ok(client, make_user):
    u = make_user()
    r = client.post("/api/keys", headers=_auth(u), json={
        "name": "prod", "permissions": "read_only", "rate_limit_rpm": 60,
        "monthly_token_limit": 100000,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["permissions"] == "read_only"
    assert body["monthly_token_limit"] == 100000
    assert body["key"].startswith("sk-") or len(body["key"]) > 20


def test_create_key_uses_safe_defaults(client, make_user):
    u = make_user()
    created = client.post("/api/keys", headers=_auth(u), json={"name": "defaulted"})
    assert created.status_code == 200

    keys = client.get("/api/keys", headers=_auth(u)).json()
    key = keys[0]
    assert key["permissions"] == "read_write"
    assert key["rate_limit_rpm"] == 60
    expiry = datetime.fromisoformat(key["expires_at"])
    if expiry.tzinfo is None:  # SQLite drops timezone metadata in tests.
        expiry = expiry.replace(tzinfo=timezone.utc)
    days_remaining = (expiry - datetime.now(timezone.utc)).days
    assert 89 <= days_remaining <= 90


def test_list_keys_masked(client, make_user):
    u = make_user()
    client.post("/api/keys", headers=_auth(u), json={"name": "a"})
    r = client.get("/api/keys", headers=_auth(u))
    assert r.status_code == 200
    keys = r.json()
    assert len(keys) == 1
    # The stored full key must never be returned by the list endpoint
    assert "••••" in keys[0]["key"]
    assert "key_prefix" in keys[0]


def test_update_key_validates_permissions(client, make_user):
    u = make_user()
    k = client.post("/api/keys", headers=_auth(u), json={"name": "a"}).json()
    r = client.put(f"/api/keys/{k['id']}", headers=_auth(u), json={"permissions": "superuser"})
    assert r.status_code == 400


def test_update_key_ok(client, make_user):
    u = make_user()
    k = client.post("/api/keys", headers=_auth(u), json={"name": "a"}).json()
    r = client.put(f"/api/keys/{k['id']}", headers=_auth(u), json={"name": "renamed", "rate_limit_rpm": 30, "monthly_token_limit": 5000})
    assert r.status_code == 200
    keys = client.get("/api/keys", headers=_auth(u)).json()
    assert keys[0]["name"] == "renamed"
    assert keys[0]["rate_limit_rpm"] == 30
    assert keys[0]["monthly_token_limit"] == 5000
    assert keys[0]["monthly_tokens_used"] == 0


def test_key_budget_validation(client, make_user):
    u = make_user()
    r = client.post("/api/keys", headers=_auth(u), json={
        "name": "bad-budget", "monthly_token_limit": -1,
    })
    assert r.status_code == 400


def test_account_budget_settings_round_trip(client, make_user):
    u = make_user()
    saved = client.put("/api/user/settings", headers=_auth(u), json={
        "monthly_token_limit": 250000,
    })
    assert saved.status_code == 200
    assert saved.json()["settings"]["monthly_token_limit"] == 250000
    loaded = client.get("/api/user/settings", headers=_auth(u))
    assert loaded.json()["monthly_token_limit"] == 250000


def test_delete_key(client, make_user):
    u = make_user()
    k = client.post("/api/keys", headers=_auth(u), json={"name": "a"}).json()
    r = client.delete(f"/api/keys/{k['id']}", headers=_auth(u))
    assert r.status_code == 200
    assert client.get("/api/keys", headers=_auth(u)).json() == []


def test_max_ten_active_keys(client, make_user):
    u = make_user()
    for i in range(10):
        r = client.post("/api/keys", headers=_auth(u), json={"name": f"k{i}"})
        assert r.status_code == 200
    r = client.post("/api/keys", headers=_auth(u), json={"name": "eleventh"})
    assert r.status_code == 400
    assert "Maximum" in r.json()["detail"]
