"""Enterprise+ gate for Team/org features — non-enterprise users get 403."""


def _auth_headers(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def test_org_create_blocked_for_starter(make_user, client, db):
    """A user below the $100 Enterprise threshold cannot create an org."""
    starter = make_user(name="Starter", email="starter@test.com", password="pass1234", balance=50.0)
    starter.total_spent = 5.0  # below Enterprise threshold
    db.commit()

    h = _auth_headers(client, "starter@test.com", "pass1234")
    r = client.post("/api/orgs", json={"name": "No Org"}, headers=h)
    assert r.status_code == 403, r.text
    assert "Enterprise" in r.json()["detail"]


def test_org_create_allowed_for_enterprise(make_user, client, db):
    """A user at/above the $100 Enterprise threshold can create an org."""
    ent = make_user(name="Ent", email="ent@test.com", password="pass1234", balance=500.0)
    ent.total_spent = 100.0  # exactly at threshold
    db.commit()

    h = _auth_headers(client, "ent@test.com", "pass1234")
    r = client.post("/api/orgs", json={"name": "Ent Org"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Ent Org"


def test_invite_blocked_for_starter_owner(make_user, client, db):
    """A pre-existing org whose owner dropped below Enterprise cannot invite."""
    owner = make_user(name="Old Owner", email="old@test.com", password="pass1234", balance=500.0)
    owner.total_spent = 100.0
    db.commit()

    h = _auth_headers(client, "old@test.com", "pass1234")
    r = client.post("/api/orgs", json={"name": "Old Org"}, headers=h)
    assert r.status_code == 200, r.text
    org_id = r.json()["id"]

    # Owner spend drops below threshold → invite must now 403
    owner.total_spent = 10.0
    db.commit()
    r = client.post(f"/api/orgs/{org_id}/invite", json={"email": "someone@test.com", "role": "member"}, headers=h)
    assert r.status_code == 403, r.text
    assert "Enterprise" in r.json()["detail"]
