"""GlbTOKEN — Misc Routes (contact, health, user settings)"""

from fastapi import APIRouter, Depends, Body, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
import json, re

from database import get_db, User, AIModel
from auth import get_current_user
from newapi_integration import health_check
from common import _400, _401, _402, _403, _404, _500, _502, _503, _not_configured, limiter
from schemas import ContactRequest, UserSettingsUpdate

# Re-import send_email from auth_routes since it's a shared helper
from routes.auth_routes import send_email

router = APIRouter()


# ── Contact Form ──

@router.post("/api/contact")
@limiter.limit("3/minute")
async def contact_form(req: ContactRequest, request: Request):
    name = req.name.strip()
    email = req.email.strip()
    message = req.message.strip()
    if not name or not email or len(message) < 10:
        _400("Invalid form data")
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
    # Check New API connectivity
    newapi_ok = False
    try:
        newapi_ok = await health_check()
    except Exception as e:
        print(f"⚠️ Health check New API connectivity error: {e}")
    import time as _time
    db_ok = True
    models_count = 0
    try:
        models_count = db.query(func.count(AIModel.id)).filter(AIModel.is_active == True).scalar() or 0
    except Exception:
        db_ok = False
    return {
        "status": "ok", "version": "1.0.0", "name": "GlbTOKEN API",
        "newapi_connected": newapi_ok,
        "database": db_ok,
        "models_count": models_count,
        "timestamp": int(_time.time()),
    }


# ── User Settings (Notification Prefs) ──

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
        "webhook_secret": settings.get("webhook_secret", ""),
        "webhook_events": settings.get("webhook_events", None),
    }


@router.post("/api/user/webhook/test")
def test_webhook(user: User = Depends(get_current_user)):
    """Send a test webhook to the user's configured URL (if any)."""
    from webhooks import get_webhook_url, send_webhook
    url = get_webhook_url(user)
    if not url:
        _400("No webhook URL configured")
    send_webhook(user, "test.ping", {"message": "GlbTOKEN webhook test", "user_email": user.email})
    return {"status": "sent", "url": url}


@router.put("/api/user/settings")
def update_user_settings(
    req: UserSettingsUpdate,
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
        url = (req.webhook_url or "").strip()
        if url and not (url.startswith("https://") or url.startswith("http://")):
            _400("webhook_url must start with http:// or https://")
        settings["webhook_url"] = url
    if req.webhook_secret is not None:
        settings["webhook_secret"] = (req.webhook_secret or "").strip()
    if req.webhook_events is not None:
        settings["webhook_events"] = req.webhook_events

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
            "webhook_secret": settings.get("webhook_secret", ""),
            "webhook_events": settings.get("webhook_events", None),
        },
    }
