"""GlbTOKEN — API Keys Routes (CRUD)"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from database import get_db, User, ApiKey, Transaction
from auth import get_current_user, generate_api_key, hash_api_key
from common import _400, _404, limiter
from schemas import ApiKeyCreate, ApiKeyUpdate

router = APIRouter()


def _parse_expiry(s):
    """Parse an ISO datetime string (or ''/'never') into a tz-aware datetime or None."""
    if not s:
        return None
    s = str(s).strip()
    if s.lower() in ("never", "none"):
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        _400("Invalid expires_at — use ISO datetime")


ALLOWED_PERMISSIONS = {"read_write", "read_only"}


def _validate_permissions(perms):
    if perms is not None and perms not in ALLOWED_PERMISSIONS:
        _400("permissions must be 'read_write' or 'read_only'")


def _total_spent_map(db: Session) -> dict:
    rows = (
        db.query(Transaction.key_id, func.coalesce(func.sum(Transaction.tokens), 0))
        .filter(Transaction.type == "consumption", Transaction.key_id.isnot(None))
        .group_by(Transaction.key_id)
        .all()
    )
    return {int(kid): float(spent) for kid, spent in rows}


@router.get("/api/keys")
@limiter.limit("60/minute")
def list_keys(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    keys = db.query(ApiKey).filter(ApiKey.user_id == user.id).order_by(desc(ApiKey.created_at)).all()
    spent = _total_spent_map(db)
    return [
        {
            "id": k.id,
            "name": k.name,
            "key": (k.key_prefix or k.key[:12] if k.key else "") + "••••••••" + (k.key_suffix or k.key[-4:] if k.key else ""),
            "key_prefix": k.key_prefix or (k.key[:12] if k.key else ""),
            "permissions": k.permissions,
            "is_active": k.is_active,
            "request_count": k.request_count,
            "last_used": k.last_used.isoformat() if k.last_used else None,
            "created_at": k.created_at.isoformat() if k.created_at else None,
            "total_spent": spent.get(k.id, 0),
            "expires_at": k.expires_at.isoformat() if k.expires_at else None,
            "rate_limit_rpm": k.rate_limit_rpm,
            "ip_allowlist": k.ip_allowlist or "",
        }
        for k in keys
    ]


@router.post("/api/keys")
@limiter.limit("10/minute")
def create_key(req: ApiKeyCreate, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Limit to 10 active keys
    active_count = db.query(ApiKey).filter(
        ApiKey.user_id == user.id, ApiKey.is_active == True
    ).count()
    if active_count >= 10:
        _400("Maximum 10 active API keys")

    _validate_permissions(req.permissions)

    raw_key = generate_api_key()
    key = ApiKey(
        user_id=user.id,
        key=None,  # plaintext NOT stored — only hash + masked prefix/suffix
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:12],
        key_suffix=raw_key[-4:],
        name=req.name,
        permissions=req.permissions,
        expires_at=_parse_expiry(req.expires_at),
        rate_limit_rpm=req.rate_limit_rpm if (req.rate_limit_rpm or 0) > 0 else None,
        ip_allowlist=(req.ip_allowlist or "").strip() or None,
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    try:
        from webhooks import send_webhook, event_enabled
        if event_enabled(user, "key.created"):
            send_webhook(user, "key.created", {"key_id": key.id, "name": key.name, "permissions": key.permissions})
    except Exception as e:
        print(f"⚠️ key.created webhook failed: {e}")
    return {
        "id": key.id,
        "name": key.name,
        "key": raw_key,  # Full key shown once — NOT stored in DB
        "permissions": key.permissions,
        "created_at": key.created_at.isoformat(),
    }


@router.get("/api/keys/{key_id}/usage")
@limiter.limit("60/minute")
def key_usage_series(key_id: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Per-key daily token usage for the last 7 days (sparkline data)."""
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        _404("API key not found")
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import func as _func
    since = datetime.now(timezone.utc) - timedelta(days=6)
    rows = db.query(
        _func.date(Transaction.created_at).label("day"),
        _func.coalesce(_func.sum(Transaction.tokens), 0).label("tokens"),
    ).filter(
        Transaction.user_id == user.id,
        Transaction.key_id == key_id,
        Transaction.type == "consumption",
        Transaction.created_at >= since,
    ).group_by(_func.date(Transaction.created_at)).all()
    by_day = {str(r.day): float(r.tokens or 0) for r in rows}
    # Fill all 7 days (oldest → newest) so the sparkline has a stable width
    series = []
    for i in range(6, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).date()
        series.append(by_day.get(str(d), 0.0))
    return {"key_id": key_id, "days": 7, "series": series}


@router.put("/api/keys/{key_id}")
@limiter.limit("30/minute")
def update_key(key_id: int, req: ApiKeyUpdate, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        _404("API key not found")
    _validate_permissions(req.permissions)
    if req.name is not None: key.name = req.name
    if req.permissions is not None: key.permissions = req.permissions
    if req.is_active is not None: key.is_active = req.is_active
    if req.expires_at is not None: key.expires_at = _parse_expiry(req.expires_at)
    if req.rate_limit_rpm is not None: key.rate_limit_rpm = req.rate_limit_rpm if req.rate_limit_rpm > 0 else None
    if req.ip_allowlist is not None: key.ip_allowlist = (req.ip_allowlist or "").strip() or None
    db.commit()
    return {"status": "updated"}


@router.delete("/api/keys/{key_id}")
@limiter.limit("30/minute")
def delete_key(key_id: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        _404("API key not found")
    db.delete(key)
    db.commit()
    try:
        from webhooks import send_webhook, event_enabled
        if event_enabled(user, "key.deleted"):
            send_webhook(user, "key.deleted", {"key_id": key.id, "name": key.name})
    except Exception as e:
        print(f"⚠️ key.deleted webhook failed: {e}")
    return {"status": "deleted"}
