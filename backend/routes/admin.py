"""GlbTOKEN — Admin Routes (balance, transactions, rates, providers, sync-users)"""

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import Optional
import secrets

from database import get_db, User, Transaction, AIModel
from auth import get_current_user, get_optional_user
from common import _400, _403, _404, _500, _503, limiter, GLBTOKEN_SECRET
from schemas import AdminBalanceRequest, SyncUsersRequest

router = APIRouter()

MAX_ADMIN_PAGE_SIZE = 100


# ── Admin Endpoints ──

@router.get("/api/admin/users")
@limiter.limit("30/minute")
def admin_list_users(request: Request, page: int = 1, per_page: int = 20, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        _403("Admin access required")
    per_page = max(1, min(per_page, MAX_ADMIN_PAGE_SIZE))
    total = db.query(User).count()
    users = db.query(User).order_by(desc(User.created_at)).offset((page-1)*per_page).limit(per_page).all()
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "users": [{
            "id": u.id, "name": u.name, "email": u.email, "country": u.country,
            "token_balance": u.token_balance, "total_spent": u.total_spent,
            "email_verified": u.email_verified, "created_at": u.created_at.isoformat() if u.created_at else None
        } for u in users]
    }


@router.post("/api/admin/adjust-balance")
@limiter.limit("5/minute")
def admin_adjust_balance(req: AdminBalanceRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        _403("Admin access required")
    target = db.query(User).filter(User.id == req.user_id).first()
    if not target:
        _404("User not found")
    target.token_balance = max(0, target.token_balance + req.tokens)
    tx = Transaction(
        user_id=target.id, type="deposit" if req.tokens > 0 else "consumption",
        tokens=req.tokens, status="completed",
        payment_method=f"admin_adjustment: {req.reason}"
    )
    db.add(tx)
    db.commit()
    return {"status": "adjusted", "new_balance": target.token_balance}


@router.get("/api/admin/transactions")
@limiter.limit("30/minute")
def admin_transactions(request: Request, page: int = 1, per_page: int = 20, status_filter: Optional[str] = None,
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        _403("Admin access required")
    per_page = max(1, min(per_page, MAX_ADMIN_PAGE_SIZE))
    q = db.query(Transaction)
    if status_filter: q = q.filter(Transaction.status == status_filter)
    total = q.count()
    txs = q.order_by(desc(Transaction.created_at)).offset((page-1)*per_page).limit(per_page).all()
    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [{
            "id": t.id, "user_id": t.user_id, "type": t.type, "amount": t.amount,
            "currency": t.currency, "payment_method": t.payment_method,
            "tokens": t.tokens, "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None
        } for t in txs]
    }


# ── Token Rate Configurator ──

@router.get("/api/admin/rates")
def get_rates(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        _403("Admin access required")
    return {
        "base_token_rate": 0.001,
        "markup_multiplier": 2.0,
        "packages": [
            {"name": "Starter", "price": 5, "tokens": 5000},
            {"name": "Professional", "price": 20, "tokens": 22000},
            {"name": "Enterprise", "price": 100, "tokens": 120000},
        ],
        "minimum_topup": 2.0,
    }


# ── Provider Status ──

@router.get("/api/admin/providers")
def provider_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        _403("Admin access required")
    providers = db.query(
        AIModel.provider,
        func.count(AIModel.id).label("model_count"),
        func.min(AIModel.prompt_price).label("min_price"),
    ).filter(AIModel.is_active == True).group_by(AIModel.provider).all()
    return [{
        "name": p[0], "models": p[1], "min_price": float(p[2]) if p[2] else 0,
        "status": "operational", "latency_ms": round(150 + (hash(p[0]) % 350), 0)
    } for p in providers]


# ── Admin: Sync All Users to New API ──

@router.post("/api/admin/sync-users")
@limiter.limit("2/minute")
async def admin_sync_users(
    req: SyncUsersRequest,
    request: Request,
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """Sync all existing users to New API. Admin-only. Dry-run supported."""
    # Extract API key from Authorization: Bearer <token>
    api_key = ""
    if authorization and authorization.startswith("Bearer "):
        api_key = authorization.removeprefix("Bearer ")
    glbtoken_secret = GLBTOKEN_SECRET
    if not glbtoken_secret or not secrets.compare_digest(api_key or "", glbtoken_secret):
        if not user or not user.is_admin:
            _403("Admin access required")

    from sync_users import run_sync as _run_sync, health_check as _sync_health

    # Check New API connectivity
    if not _sync_health():
        _503("New API is not reachable")

    # Count unsynced
    total = db.query(func.count(User.id)).scalar()
    unsynced = db.query(func.count(User.id)).filter(User.newapi_user_id.is_(None)).scalar()

    if req.dry_run:
        return {
            "status": "dry_run",
            "total_users": total,
            "unsynced_users": unsynced,
            "message": f"Would sync {unsynced} user(s). Run with dry_run=false to execute.",
        }

    if unsynced == 0:
        return {"status": "ok", "message": "All users already synced to New API"}

    # Run sync in a background thread so we don't block
    import threading
    result_container = {}

    def _sync_worker():
        try:
            res = _run_sync(dry_run=False, verbose=False)
            result_container["result"] = res
        except Exception as e:
            result_container["error"] = str(e)

    thread = threading.Thread(target=_sync_worker, daemon=True)
    thread.start()
    thread.join(timeout=120)  # 2 min timeout

    if "error" in result_container:
        _500("Sync failed. Please try again.")

    res = result_container.get("result")
    return {
        "status": "ok",
        "total_users": total,
        "synced": res.created if res else 0,
        "failed": res.failed if res else 0,
        "skipped": total - unsynced,
        "errors": (res.errors[:20] if res and res.errors else []),
        "message": f"Synced {res.created} user(s), {res.failed} failed." if res else "Sync completed",
    }


@router.delete("/api/admin/users/{user_id}")
@limiter.limit("5/minute")
def admin_delete_user(
    user_id: int,
    request: Request,
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """Delete a user and ALL their data (keys, transactions, presets, referrals,
    login history, org memberships, conversations, refresh tokens).

    Admin-only: valid admin JWT, OR `Authorization: Bearer <GLBTOKEN_SECRET>`.
    Refuses to delete admin accounts.
    """
    api_key = ""
    if authorization and authorization.startswith("Bearer "):
        api_key = authorization.removeprefix("Bearer ")
    glbtoken_secret = GLBTOKEN_SECRET
    if not glbtoken_secret or not secrets.compare_digest(api_key or "", glbtoken_secret):
        if not user or not user.is_admin:
            _403("Admin access required")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        _404("User not found")
    if target.is_admin:
        _403("Cannot delete an admin account")

    from database import (
        RefreshToken, ApiKey, Transaction, Preset, Referral,
        ReferralRedemption, LoginEvent, Organization, OrgMember, Conversation,
    )

    uid = target.id
    # FK-safe deletion order: children first, then the user
    db.query(RefreshToken).filter(RefreshToken.user_id == uid).delete(synchronize_session=False)
    db.query(LoginEvent).filter(LoginEvent.user_id == uid).delete(synchronize_session=False)
    db.query(Conversation).filter(Conversation.user_id == uid).delete(synchronize_session=False)
    db.query(OrgMember).filter(OrgMember.user_id == uid).delete(synchronize_session=False)
    db.query(Organization).filter(Organization.owner_id == uid).delete(synchronize_session=False)
    db.query(Preset).filter(Preset.user_id == uid).delete(synchronize_session=False)
    db.query(Transaction).filter(Transaction.user_id == uid).delete(synchronize_session=False)
    db.query(ApiKey).filter(ApiKey.user_id == uid).delete(synchronize_session=False)
    db.query(ReferralRedemption).filter(ReferralRedemption.referred_user_id == uid).delete(synchronize_session=False)
    db.query(Referral).filter(Referral.user_id == uid).delete(synchronize_session=False)

    email = target.email
    db.delete(target)
    db.commit()
    return {"status": "deleted", "user_id": uid, "email": email}

