"""GlbTOKEN — TOTP (RFC 6238) via stdlib only. No external dependency.

Generates and verifies 6-digit time-based one-time passwords compatible
with Google Authenticator / Authy / 1Password (SHA1, 30s step, 6 digits).
"""
import base64
import hashlib
import hmac
import os
import struct
import time

TOTP_STEP = 30          # seconds per code
TOTP_DIGITS = 6         # code length
TOTP_WINDOW = 1         # ±1 step tolerance for clock drift


def generate_secret() -> str:
    """Return a 32-char base32 secret (160 bits) — standard TOTP size."""
    return base64.b32encode(os.urandom(20)).decode("ascii").rstrip("=")


def _hotp(secret_b32: str, counter: int) -> str:
    """HMAC-SHA1 one-time password (RFC 4226)."""
    key = base64.b32decode(secret_b32, casefold=True)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{binary % (10 ** TOTP_DIGITS):0{TOTP_DIGITS}d}"


def totp_at(secret_b32: str, timestamp: float | None = None) -> str:
    """Current/next TOTP code for the given secret."""
    ts = int(timestamp if timestamp is not None else time.time())
    return _hotp(secret_b32, ts // TOTP_STEP)


def verify(secret_b32: str, code: str, window: int = TOTP_WINDOW) -> bool:
    """Verify a user-supplied code, allowing ±window steps for drift.

    Uses hmac.compare_digest to avoid timing side-channels.
    """
    if not secret_b32 or not code:
        return False
    code = code.strip()
    if not code.isdigit() or len(code) != TOTP_DIGITS:
        return False
    counter = int(time.time()) // TOTP_STEP
    for i in range(-window, window + 1):
        expected = _hotp(secret_b32, counter + i)
        if hmac.compare_digest(expected, code):
            return True
    return False


def otpauth_url(secret_b32: str, email: str, issuer: str = "GlbTOKEN") -> str:
    """otpauth:// URI for QR codes / manual entry in authenticator apps."""
    from urllib.parse import quote
    label = quote(f"{issuer}:{email}", safe="")
    return (
        f"otpauth://totp/{label}?secret={secret_b32}"
        f"&issuer={quote(issuer)}&algorithm=SHA1&digits={TOTP_DIGITS}&period={TOTP_STEP}"
    )
