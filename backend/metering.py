"""Shared usage-metering helpers for gateway, dashboard, and budget checks."""
import json
import math
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from database import AIModel, Transaction, User, ApiKey


MAX_MONTHLY_TOKEN_LIMIT = 1_000_000_000


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
        Transaction.status == "completed",
        Transaction.created_at >= month_start_utc(),
    )
    if key_id is not None:
        query = query.filter(Transaction.key_id == key_id)
    return float(query.scalar() or 0)


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
