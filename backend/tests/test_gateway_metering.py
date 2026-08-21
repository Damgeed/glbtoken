"""Gateway fallback, compatibility, telemetry, and budget enforcement tests."""
import json

import httpx

from auth import create_access_token, hash_api_key
from database import AIModel, ApiKey, Transaction
import routes.v1_gateway as gateway


def _gateway_setup(db, user, monthly_limit=None):
    raw_key = "sk-test-gateway-key-1234567890"
    key = ApiKey(
        user_id=user.id,
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:12],
        key_suffix=raw_key[-4:],
        name="gateway",
        permissions="read_write",
        is_active=True,
        monthly_token_limit=monthly_limit,
    )
    db.add_all([
        key,
        AIModel(model_id="provider/primary", name="Primary", provider="Provider A", is_active=True),
        AIModel(model_id="provider/fallback", name="Fallback", provider="Provider B", is_active=True),
    ])
    db.commit()
    db.refresh(key)
    return raw_key, key


def _api_headers(raw_key):
    return {"Authorization": f"Bearer {raw_key}"}


def _user_headers(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def test_model_fallback_preserves_compatible_fields_and_records_telemetry(
    client, make_user, db, monkeypatch
):
    user = make_user(balance=1000)
    raw_key, key = _gateway_setup(db, user)
    attempts = []

    async def fake_route(endpoint_path, routed_user, payload, timeout=120):
        attempts.append(dict(payload))
        request = httpx.Request("POST", f"https://gateway.test{endpoint_path}")
        if payload["model"] == "provider/primary":
            return httpx.Response(503, json={"error": "temporary"}, request=request)
        return httpx.Response(200, json={
            "id": "req_test_123",
            "provider": "Resolved Provider",
            "choices": [{"message": {"role": "assistant", "content": "ok"}}],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5,
                "total_tokens": 15,
                "prompt_tokens_details": {"cached_tokens": 2},
                "completion_tokens_details": {"reasoning_tokens": 3},
                "cost": 0.02,
            },
        }, request=request)

    monkeypatch.setattr(gateway, "_route", fake_route)
    response = client.post("/v1/chat/completions", headers=_api_headers(raw_key), json={
        "model": "provider/primary",
        "models": ["provider/fallback"],
        "messages": [{"role": "user", "content": "hello"}],
        "tools": [{"type": "function", "function": {"name": "ping", "parameters": {"type": "object"}}}],
    })

    assert response.status_code == 200, response.text
    assert [attempt["model"] for attempt in attempts] == ["provider/primary", "provider/fallback"]
    assert "tools" in attempts[0]
    assert response.json()["tokens_used"] == 15

    db.expire_all()
    tx = db.query(Transaction).filter(Transaction.user_id == user.id).one()
    assert tx.requested_model == "provider/primary"
    assert tx.model_used == "provider/fallback"
    assert tx.provider == "Resolved Provider"
    assert tx.request_id == "req_test_123"
    assert tx.prompt_tokens == 10
    assert tx.completion_tokens == 5
    assert tx.cached_tokens == 2
    assert tx.reasoning_tokens == 3
    assert tx.upstream_cost == 0.02
    assert tx.latency_ms is not None
    assert tx.status_code == 200
    assert db.query(ApiKey).filter(ApiKey.id == key.id).one().request_count == 1

    logs = client.get("/api/logs", headers=_user_headers(user)).json()
    assert logs["source"] == "glbtoken_gateway"
    assert logs["items"][0]["request_id"] == "req_test_123"
    assert logs["items"][0]["provider"] == "Resolved Provider"
    assert logs["items"][0]["cost_estimated"] is False
    details = client.get(
        f"/api/logs/content?log_id={logs['items'][0]['id']}",
        headers=_user_headers(user),
    ).json()
    assert details["content_stored"] is False
    assert details["prompt_tokens"] == 10


def test_account_budget_blocks_gateway_before_upstream(client, make_user, db, monkeypatch):
    user = make_user(balance=1000)
    user.settings = json.dumps({"monthly_token_limit": 100})
    db.commit()
    raw_key, key = _gateway_setup(db, user)
    db.add(Transaction(
        user_id=user.id,
        key_id=key.id,
        type="consumption",
        tokens=100,
        model_used="provider/primary",
        status="completed",
    ))
    db.commit()

    async def should_not_route(*args, **kwargs):
        raise AssertionError("budgeted request reached upstream")

    monkeypatch.setattr(gateway, "_route", should_not_route)
    response = client.post("/v1/chat/completions", headers=_api_headers(raw_key), json={
        "model": "provider/primary",
        "messages": [{"role": "user", "content": "hello"}],
    })

    assert response.status_code == 402
    assert "budget" in response.json()["detail"].lower()


def test_key_budget_blocks_gateway_before_upstream(client, make_user, db, monkeypatch):
    user = make_user(balance=1000)
    raw_key, key = _gateway_setup(db, user, monthly_limit=50)
    db.add(Transaction(
        user_id=user.id,
        key_id=key.id,
        type="consumption",
        tokens=50,
        model_used="provider/primary",
        status="completed",
    ))
    db.commit()

    async def should_not_route(*args, **kwargs):
        raise AssertionError("key-budgeted request reached upstream")

    monkeypatch.setattr(gateway, "_route", should_not_route)
    response = client.post("/v1/chat/completions", headers=_api_headers(raw_key), json={
        "model": "provider/primary",
        "messages": [{"role": "user", "content": "hello"}],
    })

    assert response.status_code == 402
    assert "key" in response.json()["detail"].lower()
