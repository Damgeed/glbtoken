"""Playground workbench routing and saved-run behavior."""

import httpx

from auth import create_access_token
from database import AIModel, Transaction
import routes.v1_gateway as gateway


def _headers(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def _models(db):
    db.add_all([
        AIModel(
            model_id="provider/primary",
            name="Primary",
            provider="Provider A",
            prompt_price=0.000001,
            completion_price=0.000002,
            is_active=True,
        ),
        AIModel(
            model_id="provider/fallback",
            name="Fallback",
            provider="Provider B",
            prompt_price=0.000001,
            completion_price=0.000002,
            is_active=True,
        ),
    ])
    db.commit()


def test_playground_uses_ordered_fallbacks_and_reports_resolved_model(
    client, make_user, db, monkeypatch
):
    user = make_user(balance=1000)
    _models(db)
    attempts = []

    async def fake_route(endpoint_path, routed_user, payload, timeout=120):
        attempts.append(payload["model"])
        request = httpx.Request("POST", f"https://gateway.test{endpoint_path}")
        if payload["model"] == "provider/primary":
            return httpx.Response(503, json={"error": "temporary"}, request=request)
        return httpx.Response(200, json={
            "id": "req_playground_1",
            "provider": "Resolved Provider",
            "choices": [{"message": {"role": "assistant", "content": "ok"}}],
            "usage": {"prompt_tokens": 4, "completion_tokens": 2, "total_tokens": 6},
        }, request=request)

    monkeypatch.setattr(gateway, "_route", fake_route)
    response = client.post("/api/playground/chat", headers=_headers(user), json={
        "model": "provider/primary",
        "models": ["provider/fallback"],
        "messages": [{"role": "user", "content": "hello"}],
        "max_tokens": 20,
    })

    assert response.status_code == 200, response.text
    data = response.json()
    assert attempts == ["provider/primary", "provider/fallback"]
    assert data["requested_model"] == "provider/primary"
    assert data["selected_model"] == "provider/fallback"
    assert data["fallback_used"] is True
    assert data["attempted_models"] == ["provider/primary", "provider/fallback"]
    assert data["tokens_used"] == 6

    db.expire_all()
    transaction = db.query(Transaction).filter(Transaction.user_id == user.id).one()
    assert transaction.requested_model == "provider/primary"
    assert transaction.model_used == "provider/fallback"
    assert transaction.provider == "Resolved Provider"


def test_saved_run_can_be_updated_without_creating_duplicates(client, make_user, db):
    owner = make_user()
    other = make_user()
    created = client.post("/api/playground/conversations", headers=_headers(owner), json={
        "title": "First title",
        "model": "provider/primary",
        "messages": [{"role": "user", "content": "first"}],
    })
    assert created.status_code == 200, created.text
    conversation_id = created.json()["id"]

    updated = client.put(
        f"/api/playground/conversations/{conversation_id}",
        headers=_headers(owner),
        json={
            "title": "Updated title",
            "model": "provider/fallback",
            "messages": [
                {"role": "user", "content": "first"},
                {"role": "assistant", "content": "second"},
            ],
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["message_count"] == 2

    listing = client.get("/api/playground/conversations", headers=_headers(owner)).json()
    assert len(listing) == 1
    assert listing[0]["title"] == "Updated title"
    assert listing[0]["model"] == "provider/fallback"

    forbidden = client.put(
        f"/api/playground/conversations/{conversation_id}",
        headers=_headers(other),
        json={"title": "Nope", "messages": [], "model": ""},
    )
    assert forbidden.status_code == 404
