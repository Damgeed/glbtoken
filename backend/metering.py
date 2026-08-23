"""Shared usage-metering helpers for gateway, dashboard, and budget checks."""
import json
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, update
from sqlalchemy.orm import Session

from database import AIModel, Transaction, User, ApiKey
from common import _402


MAX_MONTHLY_TOKEN_LIMIT = 1_000_000_000
USAGE_RESERVATION_TTL_MINUTES = 15
ACTIVE_RESERVATION_STATUSES = ("reserved", "dispatched")


def month_start_utc() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc)


def normalize_monthly_limit(value):
    if value in (None, "", 0, 0.0):
        return None
    try:
        limit = float(value)
    except (TypeError, ValueError):
        raise ValueError("Monthly token limit must be a number")
    if not math.isfinite(limit) or limit < 0 or limit > MAX_MONTHLY_TOKEN_LIMIT:
        raise ValueError(f"Monthly token limit must be between 0 and {MAX_MONTHLY_TOKEN_LIMIT:,}")
    return limit or None


def user_monthly_limit(user: User):
    try:
        settings = json.loads(user.settings) if user.settings else {}
    except (json.JSONDecodeError, TypeError):
        settings = {}
    try:
        return normalize_monthly_limit(settings.get("monthly_token_limit"))
    except ValueError:
        return None


def monthly_tokens_used(db: Session, user_id: int, key_id: int = None) -> float:
    query = db.query(func.coalesce(func.sum(Transaction.tokens), 0)).filter(
        Transaction.user_id == user_id,
        Transaction.type == "consumption",
        Transaction.model_used != "",
        Transaction.status.in_(("completed",) + ACTIVE_RESERVATION_STATUSES),
        Transaction.created_at >= month_start_utc(),
    )
    if key_id is not None:
        query = query.filter(Transaction.key_id == key_id)
    return float(query.scalar() or 0)


def conservative_token_reservation(db: Session, models: list[str], payload,
                                   max_output_tokens: int) -> int:
    """Return a conservative upper bound for a request's provider tokens.

    UTF-8 bytes are a safe, intentionally pessimistic proxy for text tokens.
    Remote media, files, and hosted tools can cost tokens not represented by
    their reference length, so those requests reserve the largest catalog
    context window among their candidate models instead.
    """
    try:
        serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError):
        serialized = str(payload)
    prompt_bound = max(1, len(serialized.encode("utf-8")))
    serialized_lower = serialized.lower()
    has_remote_content = any(marker in serialized_lower for marker in (
        '"image_url"', '"input_image"', '"input_audio"', '"audio_url"',
        '"input_file"', '"file_id"', '"vector_store_ids"',
        '"type":"image"', '"type":"audio"', '"type":"file_search"',
        '"type":"web_search_preview"', '"type":"computer_use_preview"',
    ))
    contexts = [
        int(row[0] or 0)
        for row in db.query(AIModel.context_length).filter(
            AIModel.model_id.in_(list(models or []))
        ).all()
    ]
    context_bound = max(contexts or [0])
    if has_remote_content and context_bound:
        prompt_bound = max(prompt_bound, context_bound)
    elif context_bound:
        # A successful upstream request cannot consume more prompt tokens than
        # the model context window; oversized requests are rejected upstream.
        prompt_bound = min(prompt_bound, context_bound)
    output_bound = max(1, int(max_output_tokens or 1))
    return prompt_bound + output_bound


def resolve_stale_usage_reservations(db: Session, user_id: int = None) -> dict:
    """Resolve abandoned reservations from dead/timed-out workers.

    The provider timeout is two minutes, while the lease is fifteen minutes.
    Pre-dispatch holds refund; dispatched holds remain charged. Conditional
    updates make the operation idempotent across multiple replicas.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=USAGE_RESERVATION_TTL_MINUTES)
    query = db.query(
        Transaction.id, Transaction.user_id, Transaction.tokens, Transaction.status
    ).filter(
        Transaction.type == "consumption",
        Transaction.status.in_(ACTIVE_RESERVATION_STATUSES),
        Transaction.created_at < cutoff,
    )
    if user_id is not None:
        query = query.filter(Transaction.user_id == user_id)
    stale = query.all()
    released = 0
    settled = 0
    for tx_id, tx_user_id, held_tokens, state in stale:
        if state == "reserved":
            changed = db.execute(
                update(Transaction)
                .where(Transaction.id == tx_id, Transaction.status == "reserved")
                .values(status="failed", status_code=499, tokens=0, amount=0)
            )
            if changed.rowcount:
                db.execute(
                    update(User)
                    .where(User.id == tx_user_id)
                    .values(token_balance=User.token_balance + float(held_tokens or 0))
                )
                released += 1
        else:
            # Once dispatched, the provider may have incurred cost even if the
            # worker died before usage telemetry arrived. Retain the conservative
            # hold instead of turning process crashes into free upstream spend.
            changed = db.execute(
                update(Transaction)
                .where(Transaction.id == tx_id, Transaction.status == "dispatched")
                .values(status="completed", status_code=599)
            )
            settled += int(bool(changed.rowcount))
    if released or settled:
        db.commit()
    return {"refunded": released, "charged": settled}


def reserve_usage(db: Session, user: User, reserved_tokens: int, model: str,
                  requested_model: str = "", payment_method: str = "api_key",
                  api_key: ApiKey = None) -> Transaction:
    """Atomically hold worst-case tokens before an upstream request starts."""
    held = max(1, int(reserved_tokens or 1))
    resolve_stale_usage_reservations(db, user.id)

    # This UPDATE both checks the balance and acquires the user's row lock.
    # Once it completes, prior reservations for the same user are committed and
    # visible to the budget query below, preventing concurrent oversubscription.
    available = float(db.query(User.token_balance).filter(User.id == user.id).scalar() or 0)
    changed = db.execute(
        update(User)
        .where(User.id == user.id, User.token_balance >= held)
        .values(token_balance=User.token_balance - held)
    )
    if changed.rowcount == 0:
        db.rollback()
        _402(f"Insufficient balance. Need {held} tokens, have {available:g}")

    snapshot = budget_snapshot(db, user, api_key)
    if snapshot.get("account_limit") and snapshot["account_used"] + held > snapshot["account_limit"]:
        db.rollback()
        _402("Monthly account token budget would be exceeded")
    if api_key is not None and snapshot.get("key_limit") and snapshot["key_used"] + held > snapshot["key_limit"]:
        db.rollback()
        _402("Monthly API key token budget would be exceeded")

    tx = Transaction(
        user_id=user.id,
        type="consumption",
        amount=0,
        payment_method=payment_method,
        model_used=model,
        requested_model=requested_model or model,
        provider=provider_for_model(db, model),
        tokens=held,
        status="reserved",
        key_id=api_key.id if api_key is not None else None,
    )
    db.add(tx)
    if api_key is not None:
        db.execute(
            update(ApiKey).where(ApiKey.id == api_key.id).values(
                request_count=func.coalesce(ApiKey.request_count, 0) + 1,
                last_used=datetime.now(timezone.utc),
            )
        )
    db.commit()
    db.refresh(tx)
    db.refresh(user)
    return tx


def mark_usage_dispatched(db: Session, reservation_id: int) -> None:
    """Durably record that the request is about to cross the trust boundary."""
    changed = db.execute(
        update(Transaction)
        .where(Transaction.id == reservation_id, Transaction.status == "reserved")
        .values(status="dispatched")
    )
    if changed.rowcount == 0:
        db.rollback()
        raise RuntimeError("Usage reservation could not be dispatched")
    db.commit()


def cancel_usage_reservation(db: Session, reservation_id: int, model: str,
                             status_code: int, latency_ms: float = None,
                             response=None, requested_model: str = "") -> bool:
    """Refund a held balance and retain the same ledger row as a failure."""
    tx = db.query(Transaction).filter(
        Transaction.id == reservation_id,
        Transaction.status.in_(ACTIVE_RESERVATION_STATUSES),
    ).first()
    if not tx:
        db.rollback()
        return False
    held = float(tx.tokens or 0)
    request_id = None
    if response is not None:
        request_id = response.headers.get("x-request-id") or response.headers.get("request-id")
    changed = db.execute(
        update(Transaction)
        .where(
            Transaction.id == reservation_id,
            Transaction.status.in_(ACTIVE_RESERVATION_STATUSES),
        )
        .values(
            status="failed",
            status_code=status_code,
            tokens=0,
            amount=0,
            model_used=model,
            requested_model=requested_model or tx.requested_model or model,
            provider=provider_for_model(db, model),
            request_id=str(request_id)[:200] if request_id else None,
            latency_ms=latency_ms,
        )
    )
    if changed.rowcount == 0:
        db.rollback()
        return False
    db.execute(
        update(User)
        .where(User.id == tx.user_id)
        .values(token_balance=User.token_balance + held)
    )
    db.commit()
    return True


def settle_usage_reservation(db: Session, reservation_id: int, user: User,
                             model: str, fallback_tokens: int, result: dict,
                             requested_model: str = "", latency_ms: float = None,
                             response=None) -> int:
    """Replace a worst-case hold with measured usage and refund the remainder."""
    tx = db.query(Transaction).filter(
        Transaction.id == reservation_id,
        Transaction.status.in_(ACTIVE_RESERVATION_STATUSES),
    ).first()
    if not tx:
        raise RuntimeError("Usage reservation is missing or already settled")
    metrics = usage_metrics(result)
    real = int(metrics["total_tokens"] or 0)
    charged = max(1, real or int(fallback_tokens or 1))
    if isinstance(result, dict):
        result["usage_estimated"] = not bool(real)
    held = float(tx.tokens or 0)
    # A conservative reservation should be >= charged. If an upstream reports
    # usage beyond its declared limits, the delta is still recorded as debt so
    # the account cannot continue spending provider funds for free.
    db.execute(
        update(User)
        .where(User.id == user.id)
        .values(token_balance=User.token_balance + held - charged)
    )
    request_id = (result or {}).get("id")
    if not request_id and response is not None:
        request_id = response.headers.get("x-request-id") or response.headers.get("request-id")
    tx.model_used = model
    tx.requested_model = requested_model or tx.requested_model or model
    tx.provider = provider_for_model(db, model, result)
    tx.request_id = str(request_id)[:200] if request_id else None
    tx.prompt_tokens = metrics["prompt_tokens"]
    tx.completion_tokens = metrics["completion_tokens"]
    tx.reasoning_tokens = metrics["reasoning_tokens"]
    tx.cached_tokens = metrics["cached_tokens"]
    tx.latency_ms = latency_ms
    tx.upstream_cost = metrics["upstream_cost"]
    tx.status_code = response.status_code if response is not None else 200
    tx.tokens = charged
    tx.status = "completed"
    db.commit()
    db.refresh(user)
    return charged


def budget_snapshot(db: Session, user: User, api_key: ApiKey = None) -> dict:
    account_used = monthly_tokens_used(db, user.id)
    account_limit = user_monthly_limit(user)
    result = {
        "account_used": account_used,
        "account_limit": account_limit,
        "account_remaining": max(0, account_limit - account_used) if account_limit else None,
        "account_exhausted": bool(account_limit and account_used >= account_limit),
    }
    if api_key is not None:
        key_limit = normalize_monthly_limit(api_key.monthly_token_limit)
        key_used = monthly_tokens_used(db, user.id, api_key.id)
        result.update({
            "key_used": key_used,
            "key_limit": key_limit,
            "key_remaining": max(0, key_limit - key_used) if key_limit else None,
            "key_exhausted": bool(key_limit and key_used >= key_limit),
        })
    return result


def usage_metrics(result: dict) -> dict:
    result = result if isinstance(result, dict) else {}
    usage = result.get("usage") or {}
    usage = usage if isinstance(usage, dict) else {}
    def nonnegative(value) -> float:
        try:
            number = float(value or 0)
        except (TypeError, ValueError):
            return 0.0
        return number if math.isfinite(number) and number >= 0 else 0.0

    prompt = nonnegative(usage.get("prompt_tokens") or usage.get("input_tokens"))
    completion = nonnegative(usage.get("completion_tokens") or usage.get("output_tokens"))
    total = nonnegative(usage.get("total_tokens") or (prompt + completion))
    prompt_details = usage.get("prompt_tokens_details") or usage.get("input_tokens_details") or {}
    completion_details = usage.get("completion_tokens_details") or usage.get("output_tokens_details") or {}
    prompt_details = prompt_details if isinstance(prompt_details, dict) else {}
    completion_details = completion_details if isinstance(completion_details, dict) else {}
    cached = nonnegative(prompt_details.get("cached_tokens") or usage.get("cached_tokens"))
    reasoning = nonnegative(completion_details.get("reasoning_tokens") or usage.get("reasoning_tokens"))
    upstream_cost = usage.get("cost")
    if upstream_cost is None:
        upstream_cost = usage.get("total_cost")
    try:
        upstream_cost = float(upstream_cost) if upstream_cost is not None else None
        if upstream_cost is not None and (not math.isfinite(upstream_cost) or upstream_cost < 0):
            upstream_cost = None
    except (TypeError, ValueError):
        upstream_cost = None
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "reasoning_tokens": reasoning,
        "cached_tokens": cached,
        "total_tokens": total,
        "upstream_cost": upstream_cost,
    }


def provider_for_model(db: Session, model: str, result: dict = None) -> str:
    upstream = (result or {}).get("provider") or (result or {}).get("owned_by")
    if upstream:
        return str(upstream)[:120]
    row = db.query(AIModel.provider).filter(AIModel.model_id == model).first()
    return (row[0] if row and row[0] else "Other")[:120]
