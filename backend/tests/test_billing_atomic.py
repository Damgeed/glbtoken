"""Atomic billing tests — balance can never go negative under deduction."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from database import Transaction
from metering import mark_usage_dispatched, reserve_usage
from routes.chat import _atomic_deduct


def test_deduct_success(db, make_user):
    u = make_user(balance=1000)
    _atomic_deduct(db, u, 300)
    assert u.token_balance == 700


def test_deduct_exact_balance(db, make_user):
    u = make_user(balance=500)
    _atomic_deduct(db, u, 500)
    assert u.token_balance == 0


def test_deduct_over_balance_rejected(db, make_user):
    u = make_user(balance=100)
    with pytest.raises(HTTPException) as exc:
        _atomic_deduct(db, u, 150)
    assert exc.value.status_code == 402
    # Balance unchanged — no negative
    assert u.token_balance == 100


def test_deduct_zero_balance(db, make_user):
    u = make_user(balance=0)
    with pytest.raises(HTTPException) as exc:
        _atomic_deduct(db, u, 1)
    assert exc.value.status_code == 402
    assert u.token_balance == 0


def test_concurrent_deduct_never_negative(db, make_user):
    """Simulate concurrency: two deductions racing on a small balance."""
    u = make_user(balance=100)
    # First deduction consumes the whole balance
    _atomic_deduct(db, u, 60)
    assert u.token_balance == 40
    # Second deduction must fail (not go negative)
    with pytest.raises(HTTPException) as exc:
        _atomic_deduct(db, u, 50)
    assert exc.value.status_code == 402
    assert u.token_balance == 40


def test_low_balance_alert_flag_set(db, make_user):
    """Crossing below $1 (1000 tokens) sets the dedup flag once."""
    u = make_user(balance=1500)
    _atomic_deduct(db, u, 600)  # → 900 tokens (< 1000)
    import json
    s = json.loads(u.settings or "{}")
    assert s.get("low_balance_sent") is True


def test_concurrent_reservations_cannot_overspend(db, make_user):
    u = make_user(balance=150)
    first = reserve_usage(db, u, 100, "test-model", payment_method="test")
    assert first.status == "reserved"
    assert u.token_balance == 50

    with pytest.raises(HTTPException) as exc:
        reserve_usage(db, u, 100, "test-model", payment_method="test")

    assert exc.value.status_code == 402
    db.refresh(u)
    assert u.token_balance == 50
    assert db.query(Transaction).filter(Transaction.status == "reserved").count() == 1


def test_stale_reservation_is_refunded_before_new_hold(db, make_user):
    u = make_user(balance=900)
    stale = Transaction(
        user_id=u.id,
        type="consumption",
        payment_method="test",
        model_used="test-model",
        requested_model="test-model",
        tokens=100,
        status="reserved",
        created_at=datetime.now(timezone.utc) - timedelta(minutes=20),
    )
    db.add(stale)
    db.commit()

    current = reserve_usage(db, u, 50, "test-model", payment_method="test")

    db.refresh(stale)
    assert stale.status == "failed"
    assert stale.status_code == 499
    assert stale.tokens == 0
    assert current.status == "reserved"
    assert u.token_balance == 950


def test_stale_dispatched_hold_is_charged_before_new_hold(db, make_user):
    u = make_user(balance=900)
    stale = Transaction(
        user_id=u.id,
        type="consumption",
        payment_method="test",
        model_used="test-model",
        requested_model="test-model",
        tokens=100,
        status="reserved",
        created_at=datetime.now(timezone.utc) - timedelta(minutes=20),
    )
    db.add(stale)
    db.commit()
    mark_usage_dispatched(db, stale.id)

    current = reserve_usage(db, u, 50, "test-model", payment_method="test")

    db.refresh(stale)
    assert stale.status == "completed"
    assert stale.status_code == 599
    assert stale.tokens == 100
    assert current.status == "reserved"
    assert u.token_balance == 850
