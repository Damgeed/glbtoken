"""GlbTOKEN — Misc Routes (contact, health, user settings)"""

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
import json, re

from database import get_db, User, Announcement
from auth import get_current_user
from common import _400, limiter
from schemas import ContactRequest, UserSettingsUpdate

# Re-import send_email from auth_routes since it's a shared helper
from routes.auth_routes import send_email

router = APIRouter()


# ── Announcements (public) ──

@router.get("/api/announcements")
@limiter.limit("60/minute")
def list_announcements(request: Request, db: Session = Depends(get_db)):
    """Public list of currently-active announcements (dashboard banner)."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    rows = (db.query(Announcement)
              .filter(Announcement.is_active == True)
              .filter((Announcement.expires_at.is_(None)) | (Announcement.expires_at > now))
              .order_by(Announcement.created_at.desc())
              .limit(10)
              .all())
    return {
        "announcements": [{
            "id": a.id,
            "title": a.title,
            "message": a.message,
            "priority": a.priority,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        } for a in rows]
    }


# ── Contact Form ──

@router.post("/api/contact")
@limiter.limit("3/minute")
async def contact_form(req: ContactRequest, request: Request):
    # SMTP/header-injection guard — FAIL CLOSED: a raw CR (0x0D) is the
    # injection primitive, and browsers never send \r from a textarea, so any
    # \r in a submitted field is rejected outright (400) rather than silently
    # sanitized. name/email additionally feed the subject line, so \n is
    # stripped there too; message keeps plain \n for readable multi-line bodies.
    name = (req.name or "").strip()
    email = (req.email or "").strip()
    message = (req.message or "").strip()
    for label, val in (("name", name), ("email", email), ("message", message)):
        if "\r" in val:
            _400(f"Invalid characters in {label}")
    name = re.sub(r"[\r\n]", "", name)
    email = re.sub(r"[\r\n]", "", email)
    if not name or not email or len(message) < 10:
        _400("Invalid form data")
    if len(message) > 5000:
        _400("Message too long (max 5000 characters)")
    if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
        _400("Invalid email")
    try:
        send_email(
            to="contact@glbtoken.com",
            subject=f"[GlbTOKEN Contact] {name}",
            body=f"From: {name} ({email})\n\n{message}"
        )
    except Exception as e:
        print(f"⚠️  Contact email send failed: {e}")
    print(f"📬 Contact form: {name} <{email}>: {message[:100]}...")
    return {"status": "ok", "message": "Message received. We'll get back to you soon."}


# ── Health Check ──

@router.get("/api/health")
async def health(db: Session = Depends(get_db)):
    # Minimal liveness probe for the platform / Railway. Deliberately does NOT
    # leak version, DB state, New API connectivity or model counts to the
    # public (that detail was used for recon via the direct Railway origin).
    return {"status": "ok"}


# ── User Settings (Notification Prefs) ──

def _mask_secret(val: str) -> str:
    """Never echo secrets in cleartext — return a masked placeholder."""
    return "••••••••" if val else ""


def validate_webhook_url(url: str) -> str:
    """Validate + normalize a webhook URL at save time.

    HTTPS only (plain http is rejected) and the host must not resolve to a
    private/reserved address (SSRF guard, fail-closed). Reuses the same
    resolver the delivery path uses.
    """
    url = (url or "").strip()
    if not url:
        return ""
    if not url.startswith("https://"):
        _400("webhook_url must be https:// (plain http is not allowed)")
    try:
        from webhooks import _is_private_url
        if _is_private_url(url):
            _400("webhook_url resolves to a private/internal address and is not allowed")
    except HTTPException:
        raise
    except Exception as e:
        print(f"⚠️ webhook_url validation error: {e}")
        _400("webhook_url could not be validated")
    return url


@router.get("/api/user/settings")
def get_user_settings(user: User = Depends(get_current_user)):
    """Get notification and theme preferences for the current user."""
    try:
        settings = json.loads(user.settings) if user.settings else {}
    except (json.JSONDecodeError, TypeError):
        settings = {}
    return {
        "email_notifications": settings.get("email_notifications", True),
        "low_balance_alert": settings.get("low_balance_alert", True),
        "login_alerts": settings.get("login_alerts", True),
        "theme": settings.get("theme", "light"),
        "webhook_url": settings.get("webhook_url", ""),
        "webhook_secret": _mask_secret(settings.get("webhook_secret", "")),
        "webhook_events": settings.get("webhook_events", None),
    }


@router.post("/api/user/webhook/test")
@limiter.limit("5/minute")
def test_webhook(request: Request, user: User = Depends(get_current_user)):
    """Send a test webhook to the user's configured URL (if any)."""
    from webhooks import get_webhook_url, send_webhook
    url = get_webhook_url(user)
    if not url:
        _400("No webhook URL configured")
    send_webhook(user, "test.ping", {"message": "GlbTOKEN webhook test", "user_email": user.email})
    return {"status": "sent", "url": url}


@router.put("/api/user/settings")
@limiter.limit("10/minute")
def update_user_settings(
    req: UserSettingsUpdate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update notification and theme preferences for the current user."""
    try:
        settings = json.loads(user.settings) if user.settings else {}
    except (json.JSONDecodeError, TypeError):
        settings = {}

    if req.email_notifications is not None:
        settings["email_notifications"] = req.email_notifications
    if req.low_balance_alert is not None:
        settings["low_balance_alert"] = req.low_balance_alert
    if req.login_alerts is not None:
        settings["login_alerts"] = req.login_alerts
    if req.theme is not None:
        settings["theme"] = req.theme
    if req.webhook_url is not None:
        settings["webhook_url"] = validate_webhook_url(req.webhook_url)
    if req.webhook_secret is not None:
        from webhooks import encrypt_secret
        settings["webhook_secret"] = encrypt_secret((req.webhook_secret or "").strip())
    if req.webhook_events is not None:
        from webhooks import DEFAULT_EVENTS
        # Validate against known event names (unknown events could never be
        # delivered anyway) and cap the list length.
        known = [e for e in req.webhook_events if isinstance(e, str) and e in DEFAULT_EVENTS]
        settings["webhook_events"] = known[:len(DEFAULT_EVENTS)]

    user.settings = json.dumps(settings)
    db.commit()
    return {
        "status": "updated",
        "settings": {
            "email_notifications": settings.get("email_notifications", True),
            "low_balance_alert": settings.get("low_balance_alert", True),
            "login_alerts": settings.get("login_alerts", True),
            "theme": settings.get("theme", "light"),
            "webhook_url": settings.get("webhook_url", ""),
            "webhook_secret": _mask_secret(settings.get("webhook_secret", "")),
            "webhook_events": settings.get("webhook_events", None),
        },
    }
