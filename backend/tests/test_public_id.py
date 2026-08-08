"""Tests for public_id (u_xxx) on users."""
import re
from fastapi.testclient import TestClient


def _register(client, email="pubid_user@test.com"):
    return client.post("/api/auth/register", json={
        "name": "PubID User",
        "email": email,
        "password": "password123",
        "country": "GH",
    })


def test_register_returns_public_id(client):
    r = _register(client)
    assert r.status_code == 200, r.text
    user = r.json().get("user", {})
    pid = user.get("public_id")
    assert pid and pid.startswith("u_"), f"public_id missing/wrong: {pid}"
    assert len(pid) > 3
    # URL-safe chars only
    assert re.fullmatch(r"u_[A-Za-z0-9_-]+", pid)


def test_public_id_is_stable_across_logins(client):
    _register(client)
    r = client.post("/api/auth/login", json={
        "email": "pubid_user@test.com",
        "password": "password123",
    })
    assert r.status_code == 200, r.text
    pid1 = r.json()["user"]["public_id"]
    r2 = client.post("/api/auth/login", json={
        "email": "pubid_user@test.com",
        "password": "password123",
    })
    pid2 = r2.json()["user"]["public_id"]
    assert pid1 == pid2


def test_profile_returns_public_id(client):
    r = _register(client)
    token = r.json()["token"]
    pr = client.get("/api/user/profile", headers={"Authorization": f"Bearer {token}"})
    assert pr.status_code == 200, pr.text
    pid = pr.json().get("public_id")
    assert pid and pid.startswith("u_")


def test_public_ids_are_unique(client):
    ids = set()
    for i in range(5):
        r = _register(client, email=f"uniq{i}@test.com")
        assert r.status_code == 200
        ids.add(r.json()["user"]["public_id"])
    assert len(ids) == 5, f"duplicate public_ids: {ids}"
