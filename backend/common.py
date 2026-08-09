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
    """Return the user's public ID (u_xxx), generating one if missing.

    Idempotent: existing users keep their ID; new users get a random one.
    Format: lowercase 'u_' + 22 URL-safe random chars.
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

# Cloudflare's published edge IP ranges (IPv4 + IPv6). CF-Connecting-IP is
# ONLY trustworthy when the direct peer is one of these — i.e. the request
# actually came through Cloudflare. A private/CGNAT peer (Railway 100.64.0.0/10)
# is NOT sufficient: the Railway origin is directly reachable and an attacker
# can forge CF-Connecting-IP to bypass every per-IP rate limit (watchdog
# finding, Round 6). Source: https://www.cloudflare.com/ips-v4 / ips-v6
CLOUDFLARE_IP_NETS = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22",
    "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
    "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22",
    "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
    "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32",
    "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29",
    "2c0f:f248::/32",
]

def _in_networks(ipstr: str, nets) -> bool:
    """True if ipstr is inside any of the given CIDR networks."""
    try:
        import ipaddress
        ip = ipaddress.ip_address(ipstr.split("%")[0].strip())
        for net in nets:
            if ip in ipaddress.ip_network(net, strict=False):
                return True
    except Exception:
        return False
    return False


def _is_cloudflare_peer(ipstr: str) -> bool:
    """True if the direct peer is one of Cloudflare's published edge IPs."""
    if not ipstr:
        return False
    return _in_networks(ipstr, CLOUDFLARE_IP_NETS)


def _is_local_peer(request) -> bool:
    """True for loopback / private-network peers (local dev, no Cloudflare)."""
    direct = (getattr(getattr(request, "client", None), "host", None)) or ""
    if not direct:
        return False
    try:
        import ipaddress
        ip = ipaddress.ip_address(direct.split("%")[0].strip())
        # Loopback (127.0.0.1, ::1) and RFC1918 private (10/8, 172.16/12,
        # 192.168/16) = developer machine / private network. NOTE: CGNAT
        # 100.64.0.0/10 is deliberately NOT included — Railway's origin peer is
        # CGNAT and must be treated as untrusted (forged-header vector).
        if ip.is_loopback or ip.is_private:
            return True
    except Exception:
        return False
    return False


def real_client_ip(request) -> str:
    """Resolve the REAL client IP for rate limiting / audit.

    Empirical production finding (Railway + Cloudflare): Railway's internal
    proxy terminates TLS and the app sees a PRIVATE/CGNAT peer (100.64.0.0/10)
    that VARIES per request (edge load balancing). The old logic fell back to
    the RIGHTMOST X-Forwarded-For entry — but Railway's proxy APPENDS its own
    private IP to XFF, so the rightmost entry was a varying 100.64.0.x and the
    rate limiter / login lockout / GeoIP all saw a different IP every request
    (lockout never fired, "5/hour" never triggered, locations stayed Unknown).

    Correct sources, in order of trust:
      1. CF-Connecting-IP — Cloudflare sets this to the real client IP at the
         edge. ONLY trusted when the direct peer is a Cloudflare edge IP
         (CLOUDFLARE_IP_NETS) — never for private/CGNAT peers, because the
         Railway origin is directly reachable and a forged CF-Connecting-IP
         would bypass every rate limit (watchdog Round 6).
      2. FIRST public entry in X-Forwarded-For — the edge proxy (Cloudflare or
         Railway's public edge) prepends the real client IP; Railway's own
         private proxy entries (100.64.0.x, 10.x…) are skipped. Client-supplied
         values sit to the LEFT of what the trusted edge appended, so the first
         public entry is the edge-validated client IP for normal traffic.
      3. Direct peer — only when it is a public IP (local dev, no proxy).
    """
    direct = (getattr(getattr(request, "client", None), "host", None)) or ""

    def _public(ipstr: str) -> bool:
        try:
            import ipaddress
            a = ipaddress.ip_address(ipstr.split("%")[0].strip())
            # is_global is the authoritative "real public IP" check: it is
            # False for private (10/8, 172.16/12, 192.168/16), CGNAT
            # (100.64.0.0/10 — NOT flagged is_private on Python 3.11!),
            # loopback, link-local, documentation/TEST-NET, reserved, etc.
            return bool(a.is_global)
        except Exception:
            return False

    try:
        # SECURITY: only trust proxy-provided headers (CF-Connecting-IP /
        # X-Forwarded-For) when the direct peer is NOT a public IP. A public
        # direct peer means the client reached the origin directly (no platform
        # ingress in between), so any such header is client-forged and must be
        # ignored. Behind Railway/Cloudflare the peer is private/CGNAT (10.x,
        # 100.64.0.0/10) — the trusted-ingress case.
        if direct and _public(direct):
            return direct
        # 1) Cloudflare edge header (production path via api.glbtoken.com).
        #    Trust ONLY when the request provably came through Cloudflare:
        #    either the direct peer is a Cloudflare edge IP (non-CGNAT
        #    deployments), OR the cf-ray header is present (Cloudflare adds
        #    cf-ray to every proxied request — an attacker hitting the origin
        #    directly must actively forge it). A bare CF-Connecting-IP on a
        #    private/CGNAT peer is NOT sufficient: the Railway origin is
        #    directly reachable and a forged CF-CIP would bypass every rate
        #    limit (watchdog Round 6).
        cf = (request.headers.get("cf-connecting-ip", "") or "").strip()
        cf_ray = (request.headers.get("cf-ray", "") or "").strip()
        cf_peer = _in_networks(direct, CLOUDFLARE_IP_NETS)
        if cf and _public(cf) and (cf_ray or cf_peer):
            return cf
        # 2) X-Forwarded-For — first public entry (edge-appended client IP).
        #    This is safe even for directly-reached origins: an attacker can
        #    prepend a fake public IP to XFF, but the rate limiter then keys
        #    on that attacker-chosen value, which still isolates each attacker
        #    (their requests share one key only if they reuse the same IP).
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            for part in fwd.split(","):
                p = part.strip()
                if p and _public(p):
                    return p
        # 3) Direct peer if public (no proxy / local dev)
        if direct and _public(direct):
            return direct
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

