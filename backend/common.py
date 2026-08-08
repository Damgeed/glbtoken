"""GlbTOKEN — Shared Config, Error Helpers, and Dependencies

Extracted from the main.py monolith. Do NOT modify function logic.
"""

import os
from urllib.parse import quote as _url_quote

# Re-export _url_quote for use in route modules
__all__ = [
    '_smtp_host', '_smtp_port', '_smtp_user', '_smtp_pass', '_from_addr',
    'NEW_API_BASE_URL', 'FALLBACK_API_KEY', 'FALLBACK_API_URL',
    'PAYSTACK_SECRET_KEY', 'PAYSTACK_PUBLIC_KEY',
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
    'CRYPTO_USDT_TRC20', 'CRYPTO_USDT_ERC20', 'CRYPTO_BTC', 'CRYPTO_ETH',
    'GLBTOKEN_SECRET', 'PORT', 'CRYPTO_WALLET_ADDRESSES',
    '_400', '_401', '_402', '_403', '_404', '_500', '_502', '_503', '_not_configured',
    'limiter', '_safe_error', '_url_quote',
]

from fastapi import HTTPException
from slowapi import Limiter
from slowapi.util import get_remote_address


# ═══════════════════════════════════════════════════════════════
# CONFIG — All environment variables loaded here
# ═══════════════════════════════════════════════════════════════

# SMTP / Email
_smtp_host = os.getenv("SMTP_HOST", "")
_smtp_port = int(os.getenv("SMTP_PORT", "587"))
_smtp_user = os.getenv("SMTP_USER", "")
_smtp_pass = os.getenv("SMTP_PASS", "")
_from_addr = os.getenv("SMTP_FROM", "")

# New API Gateway
NEW_API_BASE_URL = os.getenv("NEW_API_BASE_URL", "")

# Fallback AI API
FALLBACK_API_KEY = os.getenv("FALLBACK_API_KEY", "")
FALLBACK_API_URL = os.getenv("FALLBACK_API_URL", "")

# Payments: Paystack
PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")
PAYSTACK_PUBLIC_KEY = os.getenv("PAYSTACK_PUBLIC_KEY", "")
# Paystack non-USD currencies are billed in the local currency (e.g. GHS).
# Tokens are priced in USD (1 USD = 1000 tokens), so local amounts must be
# converted before minting tokens — otherwise 2 GHS (~$0.15) would mint
# 2,000 tokens ($2.00). Override via env if the rate drifts.
GHS_TO_USD_RATE = float(os.getenv("GHS_TO_USD_RATE", "14.5"))

# Referral program — GT granted to a referrer when a referred user makes their
# first real (paid) consumption. 0 disables rewards.
REFERRAL_REWARD_GT = float(os.getenv("REFERRAL_REWARD_GT", "2.0"))
# Anti-fraud: minimum real consumption (tokens) before a referred user triggers
# the referrer's reward. Blocks signup-and-abandon farming.
REFERRAL_MIN_SPEND_TOKENS = int(os.getenv("REFERRAL_MIN_SPEND_TOKENS", "1000"))
# Signup bonus — GT credited to every NEW account at registration (all channels:
# email/password, phone, email-code, Auth0, social OAuth). Matches the public
# "25,000 free tokens" promise (FAQ + marketing). 0 disables the bonus.
# Tune via env (Railway) without redeploying.
SIGNUP_BONUS_TOKENS = float(os.getenv("SIGNUP_BONUS_TOKENS", "25000"))
# Disposable / temp-mail domains whose signups never trigger a referral reward.
DISPOSABLE_EMAIL_DOMAINS = set(
    d.strip().lower() for d in os.getenv(
        "REFERRAL_BLOCKED_DOMAINS",
        "mailinator.com,guerrillamail.com,10minutemail.com,sharklasers.com,"
        "yopmail.com,tempmail.com,temp-mail.org,maildrop.cc,mailnesia.com,"
        "discard.email,trashmail.com,getnada.com,tempmailo.com,emailondeck.com,"
        "mohmal.com,throwawaymail.com,33mail.com,spamgourmet.com,"
    ).split(",") if d.strip()
)

# Payments: Stripe
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

# Payments: Crypto wallet addresses
CRYPTO_USDT_TRC20 = os.getenv("CRYPTO_USDT_TRC20", "")
CRYPTO_USDT_ERC20 = os.getenv("CRYPTO_USDT_ERC20", "")
CRYPTO_BTC = os.getenv("CRYPTO_BTC", "")
CRYPTO_ETH = os.getenv("CRYPTO_ETH", "")

# Security
GLBTOKEN_SECRET = os.environ.get("GLBTOKEN_SECRET")

# Server
PORT = os.getenv("PORT", "8000")

CRYPTO_WALLET_ADDRESSES = {
    "USDT_TRC20": CRYPTO_USDT_TRC20,
    "USDT_ERC20": CRYPTO_USDT_ERC20,
    "BTC": CRYPTO_BTC,
    "ETH": CRYPTO_ETH,
}


# ═══════════════════════════════════════════════════════════════
# HTTP ERROR HELPERS — Uniform error responses
# ═══════════════════════════════════════════════════════════════

def _400(detail: str = "Bad request"):
    raise HTTPException(status_code=400, detail=detail)

def _401(detail: str = "Unauthorized"):
    raise HTTPException(status_code=401, detail=detail)

def _402(detail: str = "Payment required"):
    raise HTTPException(status_code=402, detail=detail)

def _403(detail: str = "Forbidden"):
    raise HTTPException(status_code=403, detail=detail)


# ═══════════════════════════════════════════════════════════════
# CUSTOMER TIER HELPERS — derived from lifetime spend (no DB column)
#   starter      <  $20
#   professional $20 – $99.99
#   enterprise   >= $100  (Enterprise+ unlocks Team / organization features)
# ═══════════════════════════════════════════════════════════════

TIER_ORDER = {"starter": 0, "professional": 1, "enterprise": 2}
ENTERPRISE_SPEND = 100.0
PROFESSIONAL_SPEND = 20.0

def user_tier(user) -> str:
    """Derive a customer's tier from lifetime spend (total_spent)."""
    spent = float(getattr(user, "total_spent", 0) or 0)
    if spent >= ENTERPRISE_SPEND:
        return "enterprise"
    if spent >= PROFESSIONAL_SPEND:
        return "professional"
    return "starter"

def require_tier(user, tier: str, feature: str = ""):
    """Raise 403 unless the user's tier is at least `tier`.

    Example: require_tier(user, 'enterprise', 'Team access')
    """
    if TIER_ORDER.get(user_tier(user), 0) < TIER_ORDER.get(tier, 2):
        _403(
            f"{feature} is available on the {tier.capitalize()} plan and above. "
            "Upgrade to unlock access."
        )


def ensure_public_id(user) -> str:
    """Return the user's OpenRouter-style public ID (u_xxx), generating one if missing.

    Idempotent: existing users keep their ID; new users get a random one.
    Format mirrors OpenRouter: lowercase 'u_' + 22 URL-safe random chars.
    """
    import secrets

    if getattr(user, "public_id", None):
        return user.public_id
    new_id = "u_" + secrets.token_urlsafe(16)  # 22 chars, e.g. u_5f3a..._xQ
    user.public_id = new_id
    return new_id



def _429(detail: str = "Too many requests"):
    raise HTTPException(status_code=429, detail=detail)


def _404(detail: str = "Not found"):
    raise HTTPException(status_code=404, detail=detail)

def _500(detail: str = "Internal server error"):
    raise HTTPException(status_code=500, detail=detail)

def _502(detail: str = "Bad gateway"):
    raise HTTPException(status_code=502, detail=detail)

def _503(detail: str = "Service unavailable"):
    raise HTTPException(status_code=503, detail=detail)

def _not_configured(service: str):
    """400: '{service} not configured'"""
    _400(f"{service} not configured")


# ── Rate Limiter ──

def real_client_ip(request) -> str:
    """Resolve the REAL client IP for rate limiting / audit.

    uvicorn runs with proxy_headers=True. When FORWARDED_ALLOW_IPS lists
    Railway's ingress proxy IPs, request.client.host is already the validated
    real client IP. By default (FORWARDED_ALLOW_IPS unset) uvicorn trusts NO
    proxy headers, so request.client.host is the ingress proxy's PRIVATE IP —
    every user then shares one rate-limit bucket. To fix that: if the direct
    peer is a public IP use it; if it is private/reserved (behind a proxy
    uvicorn doesn't trust) fall back to the RIGHTMOST X-Forwarded-For entry,
    which the ingress proxy appends itself (client-supplied values sit to its
    LEFT, so the rightmost value is not spoofable).
    """
    direct = (getattr(getattr(request, "client", None), "host", None)) or ""
    if direct:
        try:
            import ipaddress
            a = ipaddress.ip_address(direct.split("%")[0])
            if not (a.is_private or a.is_loopback or a.is_link_local
                    or a.is_reserved or a.is_multicast or a.is_unspecified):
                return direct  # real public client IP — use it
        except Exception:
            return direct
    try:
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[-1].strip()
    except Exception:
        pass
    return direct or "unknown"


limiter = Limiter(key_func=lambda request: real_client_ip(request))


# ── Safe Error Helper ──

def _safe_error(msg: str) -> str:
    """Return a generic, URL-safe error message for redirects.

    The raw exception detail is logged server-side only — surfacing the first
    line of SQL/provider errors in the browser URL bar leaks DB paths, table
    names, and provider internals to anyone watching history/proxy/access logs.
    """
    raw = str(msg)
    if raw and raw != "None":
        print(f"⚠️  Redirect error detail (logged, not shown to client): {raw}")
    return "Authentication failed, please try again"


# ── Alert Helpers (login alerts, low-balance alerts) ──

def _user_setting(user, key: str, default=True):
    """Read a user's settings JSON flag safely (never raises)."""
    import json
    try:
        s = json.loads(user.settings) if user.settings else {}
    except (json.JSONDecodeError, TypeError):
        s = {}
    return s.get(key, default)


def send_alert_email(user, subject: str, body: str):
    """Fire-and-forget alert email that respects the user's email_notifications pref.

    SMTP is sync and can block up to 15s — run in a daemon thread so API
    latency is never affected by a slow/stuck mail server.
    """
    import threading
    if not _user_setting(user, "email_notifications", True):
        return
    if not getattr(user, "email", None):
        return
    try:
        from routes.auth_routes import send_email
        threading.Thread(
            target=send_email, args=(user.email, subject, body), daemon=True
        ).start()
    except Exception as e:
        print(f"⚠️ Failed to queue alert email: {e}")

