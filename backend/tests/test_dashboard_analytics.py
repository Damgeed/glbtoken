"""Dashboard analytics must expose estimates honestly and use catalog metadata."""
from datetime import datetime, timezone

from auth import create_access_token
from database import AIModel, Transaction
from routes.analytics import _ANALYTICS_CACHE


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def _seed_usage(db, user):
    model = AIModel(
        model_id="openai/test-model",
        name="Test Model",
        provider="OpenAI",
        prompt_price=0.000001,
        completion_price=0.000003,
        is_active=True,
    )
    db.add(model)
    db.add(Transaction(
        user_id=user.id,
        type="consumption",
        tokens=100,
        model_used=model.model_id,
        status="completed",
        created_at=datetime.now(timezone.utc),
    ))
    db.commit()


def test_cost_breakdown_includes_provider_and_estimate_flag(client, make_user, db):
    _ANALYTICS_CACHE.clear()
    user = make_user()
    _seed_usage(db, user)

    response = client.get("/api/analytics/cost-by-model?days=7", headers=_auth(user))

    assert response.status_code == 200, response.text
    item = response.json()[0]
    assert item["provider"] == "OpenAI"
    assert item["estimated"] is True
    assert item["calls"] == 1
    assert abs(item["cost"] - 0.0002) < 1e-9


def test_usage_cost_uses_blended_catalog_price(client, make_user, db):
    _ANALYTICS_CACHE.clear()
    user = make_user()
    _seed_usage(db, user)

    response = client.get("/api/usage-analytics?days=7", headers=_auth(user))

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["costs_estimated"] is True
    assert "Provider-reported cost" in data["cost_methodology"]
    assert abs(data["total_cost"] - 0.0002) < 1e-9
    assert abs(sum(data["costs"]) - data["total_cost"]) < 1e-9


def test_projection_discloses_estimate_methodology(client, make_user, db):
    _ANALYTICS_CACHE.clear()
    user = make_user()
    _seed_usage(db, user)

    response = client.get("/api/analytics/cost-projection?days=30", headers=_auth(user))

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["estimated"] is True
    assert "Provider-reported cost" in data["methodology"]
    assert data["days_of_data"] == 1
    assert abs(data["projected_monthly"] - 0.006) < 1e-9


def test_reported_cost_and_measured_latency_are_not_estimates(client, make_user, db):
    _ANALYTICS_CACHE.clear()
    user = make_user()
    _seed_usage(db, user)
    tx = db.query(Transaction).filter(Transaction.user_id == user.id).one()
    tx.prompt_tokens = 25
    tx.completion_tokens = 75
    tx.upstream_cost = 0.0123
    tx.latency_ms = 432.1
    db.commit()

    cost = client.get("/api/analytics/cost-by-model?days=7", headers=_auth(user)).json()[0]
    latency = client.get("/api/analytics/response-times?days=7", headers=_auth(user)).json()[0]

    assert cost["estimated"] is False
    assert abs(cost["cost"] - 0.0123) < 1e-9
    assert latency["estimated"] is False
    assert latency["provider"] == "OpenAI"
    assert latency["response_time_ms"] == 432.1
    assert latency["avg_response_time_ms"] == 432.1
