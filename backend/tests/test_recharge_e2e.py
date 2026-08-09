"""Recharge E2E — full credit path, no Stripe API needed.

Covers the exact money-in flow:
  1. Stripe Checkout webhook (checkout.session.completed)  → balance credited, tx completed
  2. Idempotency — replaying the same webhook never double-credits
  3. Invalid signature rejected (no credit)
  4. Unknown session → safe no-op
  5. Quick-recharge PaymentIntent safety net (payment_intent.succeeded)
  6. Recharge → spend cycle: credited balance is atomically spendable

Signatures are computed locally with the known test webhook secret, so the
full request path (construct_event → validate → credit) is exercised.
"""
import hashlib
import hmac
import json
import time

import pytest

import common
import routes.payments as payments_mod
from database import Transaction
from routes.chat import _atomic_deduct

WEBHOOK_SECRET = "whsec_test_recharge_e2e_0123456789"


@pytest.fixture(autouse=True)
def _stripe_env(monkeypatch):
    """Point the route module at known test secrets (never touches Stripe's API)."""
    monkeypatch.setattr(payments_mod, "STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET)
    monkeypatch.setattr(payments_mod, "STRIPE_SECRET_KEY", "sk_test_dummy")
    monkeypatch.setattr(common, "STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET)
    monkeypatch.setattr(common, "STRIPE_SECRET_KEY", "sk_test_dummy")


def _sign(payload: bytes, t: int = None) -> str:
    t = t or int(time.time())
    signed = f"{t}.".encode() + payload
    sig = hmac.new(WEBHOOK_SECRET.encode(), signed, hashlib.sha256).hexdigest()
    return f"t={t},v1={sig}"


def _webhook(client, event: dict, secret_override: str = None):
    payload = json.dumps(event).encode()
    sig = _sign(payload)
    if secret_override:
        sig = secret_override
    return client.post(
        "/api/payments/stripe/webhook",
        content=payload,
        headers={"stripe-signature": sig},
    )


def _pending_tx(db, user, ref, amount=0.0, currency="usd", method="stripe"):
    tx = Transaction(
        user_id=user.id, type="deposit", amount=amount, currency=currency,
        payment_method=method, payment_ref=ref, tokens=0, status="pending",
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def _checkout_completed_event(session_id, user_id, amount_cents, customer="cus_test_1"):
    return {
        "id": "evt_test_1",
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": session_id,
                "amount_total": amount_cents,
                "currency": "usd",
                "customer": customer,
                "payment_method": None,
                "payment_status": "paid",
                "setup_future_usage": None,
                "metadata": {"user_id": str(user_id), "tokens": str(int(amount_cents / 100 * 1000))},
            }
        },
    }


# ── 1. Checkout webhook credits exactly the real charged amount ──
def test_checkout_webhook_credits_balance(client, db, make_user):
    u = make_user(balance=0)
    _pending_tx(db, u, "cs_test_abc123")

    r = _webhook(client, _checkout_completed_event("cs_test_abc123", u.id, amount_cents=500))
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}

    db.refresh(u)
    tx = db.query(Transaction).filter(Transaction.payment_ref == "cs_test_abc123").first()
    # $5.00 → 5,000 tokens, derived from amount_total (not client metadata)
    assert u.token_balance == 5000
    assert u.total_spent == 5.0
    assert tx.status == "completed"
    assert tx.tokens == 5000
    assert tx.amount == 5.0


# ── 2. Idempotency: replaying the same webhook never double-credits ──
def test_webhook_idempotent_no_double_credit(client, db, make_user):
    u = make_user(balance=0)
    _pending_tx(db, u, "cs_test_idem")
    event = _checkout_completed_event("cs_test_idem", u.id, amount_cents=1000)

    assert _webhook(client, event).status_code == 200
    db.refresh(u)
    assert u.token_balance == 10000

    # Stripe retries the exact same event → must stay 10,000
    assert _webhook(client, event).status_code == 200
    db.refresh(u)
    assert u.token_balance == 10000
    assert db.query(Transaction).filter(Transaction.payment_ref == "cs_test_idem").first().status == "completed"


# ── 3. Invalid signature rejected → no credit ──
def test_webhook_invalid_signature_rejected(client, db, make_user):
    u = make_user(balance=0)
    _pending_tx(db, u, "cs_test_bad_sig")

    r = _webhook(client, _checkout_completed_event("cs_test_bad_sig", u.id, 500), secret_override="t=1,v1=deadbeef")
    assert r.status_code == 400
    db.refresh(u)
    assert u.token_balance == 0
    tx = db.query(Transaction).filter(Transaction.payment_ref == "cs_test_bad_sig").first()
    assert tx.status == "pending"


# ── 4. Unknown session id → safe no-op, no crash, no credit ──
def test_webhook_unknown_session_noop(client, db, make_user):
    u = make_user(balance=100)
    r = _webhook(client, _checkout_completed_event("cs_test_never_created", u.id, 9999))
    assert r.status_code == 200
    db.refresh(u)
    assert u.token_balance == 100  # unchanged


# ── 5. Quick-recharge PaymentIntent safety net ──
def test_payment_intent_succeeded_safety_net(client, db, make_user):
    u = make_user(balance=0)
    _pending_tx(db, u, "pi_test_quick1")

    event = {
        "id": "evt_test_pi",
        "object": "event",
        "type": "payment_intent.succeeded",
        "data": {"object": {"id": "pi_test_quick1", "amount": 300, "metadata": {"user_id": str(u.id)}}},
    }
    assert _webhook(client, event).status_code == 200
    db.refresh(u)
    assert u.token_balance == 3000
    assert db.query(Transaction).filter(Transaction.payment_ref == "pi_test_quick1").first().status == "completed"

    # Replay → no double credit
    assert _webhook(client, event).status_code == 200
    db.refresh(u)
    assert u.token_balance == 3000


# ── 6. Recharge → spend cycle: credited money is atomically spendable ──
def test_recharge_then_spend_cycle(client, db, make_user):
    u = make_user(balance=0)
    _pending_tx(db, u, "cs_test_cycle")
    assert _webhook(client, _checkout_completed_event("cs_test_cycle", u.id, 2000)).status_code == 200
    db.refresh(u)
    assert u.token_balance == 20000

    # Spend within budget (route commits after a successful deduction)
    _atomic_deduct(db, u, 500)
    db.commit()
    db.refresh(u)
    assert u.token_balance == 19500

    # Overspend rejected (402) — no negative balance
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        _atomic_deduct(db, u, 999999)
    assert exc.value.status_code == 402
    db.refresh(u)
    assert u.token_balance == 19500
