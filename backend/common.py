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
    'TRON_USDT_ADDRESS', 'ETH_USDT_ADDRESS', 'BTC_ADDRESS',
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

# Payments: Stripe
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

# Payments: Crypto wallet addresses
CRYPTO_USDT_TRC20 = os.getenv("CRYPTO_USDT_TRC20", "")
CRYPTO_USDT_ERC20 = os.getenv("CRYPTO_USDT_ERC20", "")
CRYPTO_BTC = os.getenv("CRYPTO_BTC", "")
CRYPTO_ETH = os.getenv("CRYPTO_ETH", "")
TRON_USDT_ADDRESS = os.getenv("TRON_USDT_ADDRESS", "")
ETH_USDT_ADDRESS = os.getenv("ETH_USDT_ADDRESS", "")
BTC_ADDRESS = os.getenv("BTC_ADDRESS", "")

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

limiter = Limiter(key_func=get_remote_address)


# ── Safe Error Helper ──

def _safe_error(msg: str) -> str:
    """Sanitize and truncate exception messages for URL-safe redirects."""
    msg = str(msg)
    # Only first line (SQL traces span multiple lines)
    first_line = msg.split('\n')[0].strip()
    # Truncate to 200 chars maximum
    if len(first_line) > 200:
        first_line = first_line[:197] + '...'
    return _url_quote(first_line)
