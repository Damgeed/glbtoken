"""GlbTOKEN — Misc Routes (contact, health, user settings)"""

from fastapi import APIRouter, Depends, Body, Request
from sqlalchemy.orm import Session
import json, re

from database import get_db, User
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
async def health():
    # Check New API connectivity
    newapi_ok = False
    try:
        newapi_ok = await health_check()
    except Exception as e:
        print(f"⚠️ Health check New API connectivity error: {e}")
    return {
        "status": "ok", "version": "1.0.0", "name": "GlbTOKEN API",
        "newapi_connected": newapi_ok,
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
    }


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

    user.settings = json.dumps(settings)
    db.commit()
    return {
        "status": "updated",
        "settings": {
            "email_notifications": settings.get("email_notifications", True),
            "low_balance_alert": settings.get("low_balance_alert", True),
            "login_alerts": settings.get("login_alerts", True),
            "theme": settings.get("theme", "light"),
        },
    }
