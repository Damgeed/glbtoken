"""Atomic billing tests — balance can never go negative under deduction."""
import pytest
from fastapi import HTTPException

from database import User
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
