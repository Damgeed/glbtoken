"""GlbTOKEN — API Keys Routes (CRUD)"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from database import get_db, User, ApiKey, Transaction
from auth import get_current_user, generate_api_key
from common import _400, _404
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


def _total_spent_map(db: Session) -> dict:
    rows = (
        db.query(Transaction.key_id, func.coalesce(func.sum(Transaction.tokens), 0))
        .filter(Transaction.type == "consumption", Transaction.key_id.isnot(None))
        .group_by(Transaction.key_id)
        .all()
    )
    return {int(kid): float(spent) for kid, spent in rows}


@router.get("/api/keys")
def list_keys(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    keys = db.query(ApiKey).filter(ApiKey.user_id == user.id).order_by(desc(ApiKey.created_at)).all()
    spent = _total_spent_map(db)
    return [
        {
            "id": k.id,
            "name": k.name,
            "key": k.key[:12] + "••••••••" + k.key[-4:],
            "key_prefix": k.key[:12],
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
def create_key(req: ApiKeyCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Limit to 10 active keys
    active_count = db.query(ApiKey).filter(
        ApiKey.user_id == user.id, ApiKey.is_active == True
    ).count()
    if active_count >= 10:
        _400("Maximum 10 active API keys")

    key = ApiKey(
        user_id=user.id,
        key=generate_api_key(),
        name=req.name,
        permissions=req.permissions,
        expires_at=_parse_expiry(req.expires_at),
        rate_limit_rpm=req.rate_limit_rpm if (req.rate_limit_rpm or 0) > 0 else None,
        ip_allowlist=(req.ip_allowlist or "").strip() or None,
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return {
        "id": key.id,
        "name": key.name,
        "key": key.key,  # Full key shown once
        "permissions": key.permissions,
        "created_at": key.created_at.isoformat(),
    }


@router.put("/api/keys/{key_id}")
def update_key(key_id: int, req: ApiKeyUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        _404("API key not found")
    if req.name is not None: key.name = req.name
    if req.permissions is not None: key.permissions = req.permissions
    if req.is_active is not None: key.is_active = req.is_active
    if req.expires_at is not None: key.expires_at = _parse_expiry(req.expires_at)
    if req.rate_limit_rpm is not None: key.rate_limit_rpm = req.rate_limit_rpm if req.rate_limit_rpm > 0 else None
    if req.ip_allowlist is not None: key.ip_allowlist = (req.ip_allowlist or "").strip() or None
    db.commit()
    return {"status": "updated"}


@router.delete("/api/keys/{key_id}")
def delete_key(key_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        _404("API key not found")
    db.delete(key)
    db.commit()
    return {"status": "deleted"}
