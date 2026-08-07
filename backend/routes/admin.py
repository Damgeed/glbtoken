"""GlbTOKEN — Admin Routes (balance, transactions, rates, providers, sync-users)"""

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import Optional
import json
import secrets

from database import get_db, User, Transaction, AIModel, AdminLog, Announcement
from auth import get_current_user, get_optional_user
from common import _400, _403, _404, _500, _503, limiter, GLBTOKEN_SECRET
from schemas import AdminBalanceRequest, SyncUsersRequest, AnnouncementCreate, AnnouncementUpdate

router = APIRouter()

MAX_ADMIN_PAGE_SIZE = 100


def _client_ip(request) -> str:
    """Real client IP — trust the validated proxy header, not client-supplied XFF."""
    try:
        if request.client and request.client.host:
            return request.client.host
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[-1].strip()
    except Exception as e:
        print(f"⚠️ client ip parse failed: {e}")
    return ""


def _audit(db: Session, admin, action: str, target=None, detail: str = "", ip: str = ""):
    """Append an immutable admin audit log row."""
    try:
        db.add(AdminLog(
            admin_id=admin.id if admin else 0,
            admin_email=admin.email if admin else "system",
            action=action,
            target_user_id=target.id if target else None,
            target_email=target.email if target else None,
            detail=detail,
            ip_address=ip or "",
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"⚠️ Audit log failed: {e}")


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
    _audit(
        db, user, "adjust_balance", target=target,
        detail=json.dumps({"tokens": req.tokens, "reason": req.reason or "",
                           "new_balance": target.token_balance}),
        ip=_client_ip(request),
    )
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

    if thread.is_alive():
        _audit(
            db, user if (user and user.is_admin) else None, "sync_users",
            detail='{"synced": 0, "failed": 0, "note": "timed out after 120s"}',
            ip=_client_ip(request),
        )
        return {"status": "running", "message": "Sync is still running in the background (over 120s). Check /api/admin/audit shortly."}

    if "error" in result_container:
        _500("Sync failed. Please try again.")

    res = result_container.get("result")
    _audit(
        db, user if (user and user.is_admin) else None, "sync_users",
        detail=f'{{"synced": {res.created if res else 0}, "failed": {res.failed if res else 0}}}',
        ip=_client_ip(request),
    )
    return {
        "status": "ok",
        "total_users": total,
        "synced": res.created if res else 0,
        "failed": res.failed if res else 0,
        "skipped": total - unsynced,
        "errors": (res.errors[:20] if res and res.errors else []),
        "message": f"Synced {res.created} user(s), {res.failed} failed." if res else "Sync completed",
    }


@router.get("/api/admin/audit")
@limiter.limit("30/minute")
def admin_audit_log(request: Request, page: int = 1, per_page: int = 50, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Admin audit trail (adjust-balance, delete-user, sync-users)."""
    if not user.is_admin:
        _403("Admin access required")
    per_page = max(1, min(per_page, MAX_ADMIN_PAGE_SIZE))
    total = db.query(func.count(AdminLog.id)).scalar()
    logs = db.query(AdminLog).order_by(desc(AdminLog.created_at)).offset((page-1)*per_page).limit(per_page).all()
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "logs": [{
            "id": l.id,
            "admin_email": l.admin_email,
            "action": l.action,
            "target_email": l.target_email,
            "detail": l.detail,
            "ip_address": l.ip_address,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        } for l in logs]
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
    # Also drop the OTHER members of orgs this user owns — bulk .delete() skips
    # ORM cascade, so without this the org_members rows would orphan (FK
    # violation on Postgres / dangling rows on SQLite).
    owned_org_ids = [
        oid for (oid,) in db.query(Organization.id).filter(Organization.owner_id == uid).all()
    ]
    if owned_org_ids:
        db.query(OrgMember).filter(OrgMember.org_id.in_(owned_org_ids)).delete(synchronize_session=False)
    db.query(Organization).filter(Organization.owner_id == uid).delete(synchronize_session=False)
    db.query(Preset).filter(Preset.user_id == uid).delete(synchronize_session=False)
    db.query(Transaction).filter(Transaction.user_id == uid).delete(synchronize_session=False)
    db.query(ApiKey).filter(ApiKey.user_id == uid).delete(synchronize_session=False)
    db.query(ReferralRedemption).filter(ReferralRedemption.referred_user_id == uid).delete(synchronize_session=False)
    db.query(Referral).filter(Referral.user_id == uid).delete(synchronize_session=False)

    email = target.email
    db.delete(target)
    db.commit()
    _audit(
        db, user if (user and user.is_admin) else None, "delete_user",
        detail=json.dumps({"deleted_user_id": uid, "deleted_email": email}),
        ip=_client_ip(request),
    )
    return {"status": "deleted", "user_id": uid, "email": email}



# ── Announcements (admin CRUD) ──

def _announcement_dict(a):
    return {
        "id": a.id,
        "title": a.title,
        "message": a.message,
        "priority": a.priority,
        "is_active": a.is_active,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "expires_at": a.expires_at.isoformat() if a.expires_at else None,
    }


def _parse_expiry(value):
    """Parse ISO datetime string → naive/aware datetime, or None."""
    from datetime import datetime, timezone
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


@router.get("/api/admin/announcements")
@limiter.limit("30/minute")
def admin_list_announcements(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        _403("Admin access required")
    rows = db.query(Announcement).order_by(desc(Announcement.created_at)).all()
    return {"announcements": [_announcement_dict(a) for a in rows]}


@router.post("/api/admin/announcements")
@limiter.limit("10/minute")
def admin_create_announcement(req: AnnouncementCreate, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        _403("Admin access required")
    if req.priority not in ("info", "warning", "success"):
        _400("priority must be info, warning or success")
    a = Announcement(
        title=(req.title or "").strip(),
        message=req.message.strip(),
        priority=req.priority,
        is_active=True,
        created_by=user.id,
        expires_at=_parse_expiry(req.expires_at),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    _audit(db, user, "create_announcement", detail=json.dumps({"announcement_id": a.id, "title": (a.title or "")[:50]}), ip=_client_ip(request))
    return {"status": "created", "announcement": _announcement_dict(a)}


@router.patch("/api/admin/announcements/{announcement_id}")
@limiter.limit("20/minute")
def admin_update_announcement(announcement_id: int, req: AnnouncementUpdate, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        _403("Admin access required")
    a = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not a:
        _404("Announcement not found")
    if req.is_active is not None:
        a.is_active = req.is_active
    if req.title is not None:
        a.title = (req.title or "").strip()
    if req.message is not None:
        a.message = req.message.strip()
    if req.priority is not None:
        if req.priority not in ("info", "warning", "success"):
            _400("priority must be info, warning or success")
        a.priority = req.priority
    if req.expires_at is not None:
        a.expires_at = _parse_expiry(req.expires_at)
    db.commit()
    db.refresh(a)
    _audit(db, user, "update_announcement", detail=f'{{"announcement_id": {a.id}}}', ip=_client_ip(request))
    return {"status": "updated", "announcement": _announcement_dict(a)}


@router.delete("/api/admin/announcements/{announcement_id}")
@limiter.limit("10/minute")
def admin_delete_announcement(announcement_id: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        _403("Admin access required")
    a = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not a:
        _404("Announcement not found")
    db.delete(a)
    db.commit()
    _audit(db, user, "delete_announcement", detail=f'{{"announcement_id": {announcement_id}}}', ip=_client_ip(request))
    return {"status": "deleted", "announcement_id": announcement_id}
