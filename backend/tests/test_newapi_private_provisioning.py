"""Ensure glbTOKEN onboarding never depends on New API public signup."""
import asyncio

import newapi_integration as gateway


def test_gateway_user_is_created_only_by_authenticated_admin(monkeypatch):
    monkeypatch.setattr(gateway, "NEW_API_BASE", "http://new-api.railway.internal:8080")
    monkeypatch.setattr(gateway, "ADMIN_PASSWORD", "test-admin-password")
    calls = []
    username = None

    async def fake_admin_request(method, path, data=None, retry=True):
        nonlocal username
        calls.append((method, path, data))
        if method == "POST":
            username = data["username"]
            return {"success": True}
        assert method == "GET"
        return {"success": True, "data": {"items": [
            {"id": 57, "username": username},
        ]}}

    monkeypatch.setattr(gateway, "_admin_request", fake_admin_request)
    result = asyncio.run(gateway.create_newapi_user("user@example.com", "Test User"))
    assert result["id"] == 57
    assert result["username"] == username
    assert calls[0][0:2] == ("POST", "/api/user/")
    assert calls[0][2]["role"] == 1
    assert calls[0][2]["display_name"] == "Test User"
    assert len(calls[0][2]["password"]) >= 24
    assert calls[1][0] == "GET"
    assert all("/register" not in path for _, path, _ in calls)


def test_failed_admin_creation_does_not_query_users(monkeypatch):
    monkeypatch.setattr(gateway, "NEW_API_BASE", "http://new-api.railway.internal:8080")
    monkeypatch.setattr(gateway, "ADMIN_PASSWORD", "test-admin-password")
    calls = []

    async def fake_admin_request(method, path, data=None, retry=True):
        calls.append((method, path))
        return {"success": False, "message": "insufficient permissions"}

    monkeypatch.setattr(gateway, "_admin_request", fake_admin_request)
    result = asyncio.run(gateway.create_newapi_user("user@example.com", "Test User"))
    assert "insufficient permissions" in result["error"]
    assert calls == [("POST", "/api/user/")]


def test_missing_admin_credentials_does_not_attempt_registration(monkeypatch):
    monkeypatch.setattr(gateway, "NEW_API_BASE", "http://new-api.railway.internal:8080")
    monkeypatch.setattr(gateway, "ADMIN_PASSWORD", "")
    monkeypatch.setattr(gateway, "ADMIN_TOKEN", "")
    result = asyncio.run(gateway.create_newapi_user("user@example.com", "Test User"))
    assert result["id"] == 0
