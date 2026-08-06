"""Org usage aggregation regression test — API calls must count ONLY
consumption rows (deposits are not calls), and total_spent must be the sum
of members' canonical user.total_spent, not a deposit-row sum.
"""
import pytest
from fastapi.testclient import TestClient

from database import User, Transaction, Organization, OrgMember


def _auth_headers(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def test_org_usage_counts_consumption_only(make_user, client, db):
    owner = make_user(name="Org Owner", email="owner@test.com", password="pass1234", balance=500.0)
    member = make_user(name="API Member", email="api@test.com", password="pass1234", balance=500.0)

    # Org creation is Enterprise+ — owner must be above the $100 spend threshold
    owner.total_spent = 100.0
    db.commit()

    # Owner creates the org (auto-added as owner)
    h = _auth_headers(client, "owner@test.com", "pass1234")
    r = client.post("/api/orgs", json={"name": "Stats Org"}, headers=h)
    assert r.status_code == 200, r.text
    org_id = r.json()["id"]

    # Member joins
    hm = _auth_headers(client, "api@test.com", "pass1234")
    r = client.post(f"/api/orgs/{org_id}/invite", json={"email": "api@test.com", "role": "member"}, headers=h)
    assert r.status_code == 200, r.text
    r = client.post(f"/api/orgs/{org_id}/join", json={"token": r.json()["invite_token"]}, headers=hm)
    assert r.status_code == 200, r.text

    # Two deposits → these land in user.total_spent and MUST NOT count as calls
    member.total_spent = 150.0
    db.add(Transaction(user_id=member.id, type="deposit", amount=100.0, tokens=100000, status="completed"))
    db.add(Transaction(user_id=member.id, type="deposit", amount=50.0, tokens=50000, status="completed"))
    # Three real API calls (consumption rows)
    for _ in range(3):
        db.add(Transaction(user_id=member.id, type="consumption", amount=0.0, tokens=1234, model_used="gpt-4o", status="completed"))
    db.commit()

    r = client.get(f"/api/orgs/{org_id}/usage", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()

    # The headline bug: deposits must NOT inflate the API-call counter
    assert data["total_transactions"] == 3, f"expected 3 API calls, got {data['total_transactions']}"
    assert data["total_members"] == 2

    # total_spent = sum of members' canonical user.total_spent (owner 100 + member 150)
    assert abs(data["total_spent"] - 250.0) < 1e-6

    # Avg-cost is finite and non-negative
    assert data["total_spent"] / data["total_transactions"] >= 0

    # member_breakdown covers everyone; the member has tokens
    by_id = {b["user_id"]: b for b in data["member_breakdown"]}
    assert len(by_id) == 2
    assert by_id[member.id]["tokens_used"] == 3 * 1234


def test_org_usage_zero_calls_zero_stats(make_user, client, db):
    owner = make_user(name="Quiet Owner", email="quiet@test.com", password="pass1234", balance=100.0)
    # Enterprise+ gate: owner must be above the $100 spend threshold to create an org
    owner.total_spent = 200.0
    db.commit()
    h = _auth_headers(client, "quiet@test.com", "pass1234")
    r = client.post("/api/orgs", json={"name": "Quiet Org"}, headers=h)
    org_id = r.json()["id"]

    # Balance/deposit without any API usage → old bug showed phantom call counts
    owner.total_spent = 40.0
    db.add(Transaction(user_id=owner.id, type="deposit", amount=40.0, tokens=40000, status="completed"))
    db.commit()

    r = client.get(f"/api/orgs/{org_id}/usage", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total_transactions"] == 0
    assert data["total_tokens_used"] == 0
    # Spend still reflects what the member actually put in
    assert abs(data["total_spent"] - 40.0) < 1e-6
