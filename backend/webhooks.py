"""GlbTOKEN — outbound developer webhooks.

Users can register a webhook URL (+ optional shared secret). When events fire
(low_balance, key.created, key.deleted, topup.success) we POST a signed JSON
payload. Signing: HMAC-SHA256 of the raw body with the shared secret, sent in
the `X-GlbTOKEN-Signature` header (hex). Delivery is fire-and-forget in a
daemon thread with a 10s timeout so API latency is never affected.
"""
import hashlib
import hmac
import ipaddress
import json
import socket
import threading
import urllib.parse
import urllib.request
import urllib.error

DEFAULT_EVENTS = ["low_balance", "key.created", "key.deleted", "topup.success"]


def _settings(user) -> dict:
    try:
        s = json.loads(user.settings) if user.settings else {}
    except (json.JSONDecodeError, TypeError):
        s = {}
    return s


def get_webhook_url(user) -> str:
    return (_settings(user).get("webhook_url") or "").strip()


def get_webhook_secret(user) -> str:
    return decrypt_secret((_settings(user).get("webhook_secret") or "").strip())


_EPHEMERAL_KEY = None  # per-process random key when GLBTOKEN_SECRET is unset


def _fernet():
    """Fernet instance keyed off the server secret (GLBTOKEN_SECRET).

    If GLBTOKEN_SECRET is unset we fall back to a per-process EPHEMERAL key —
    never a hardcoded value. A predictable dev key would let anyone who can
    read the DB decrypt every webhook secret. With the ephemeral key the
    ciphertext is simply undecryptable after a restart (user re-enters the
    secret), which is fail-closed instead of fail-open.
    """
    import base64
    from cryptography.fernet import Fernet
    from common import GLBTOKEN_SECRET
    global _EPHEMERAL_KEY
    if GLBTOKEN_SECRET:
        material = GLBTOKEN_SECRET.encode()
    else:
        if _EPHEMERAL_KEY is None:
            import secrets as _secrets
            _EPHEMERAL_KEY = _secrets.token_bytes(32)
            print("⚠️ GLBTOKEN_SECRET unset — webhook secrets use an ephemeral per-process key "
                  "(undecryptable after restart; set GLBTOKEN_SECRET to persist)")
        material = _EPHEMERAL_KEY
    key = base64.urlsafe_b64encode(hashlib.sha256(material).digest())
    return Fernet(key)


def encrypt_secret(raw: str) -> str:
    """Encrypt a webhook secret at rest (Fernet, AES-128-CBC+HMAC)."""
    if not raw:
        return ""
    try:
        return "enc:v1:" + _fernet().encrypt(raw.encode()).decode()
    except Exception as e:
        # NEVER store the raw secret on encryption failure — that would leave
        # plaintext credentials in the DB. Return empty (secret cleared) and
        # log loudly; the user can re-enter the secret.
        print(f"⚠️ Webhook secret encryption failed (secret NOT stored): {e}")
        return ""


def decrypt_secret(stored: str) -> str:
    """Decrypt a webhook secret for signing; legacy plaintext passes through."""
    if not stored:
        return ""
    if stored.startswith("enc:v1:"):
        try:
            return _fernet().decrypt(stored[len("enc:v1:"):].encode()).decode()
        except Exception as e:
            print(f"⚠️ Webhook secret decryption failed: {e}")
            return ""
    return stored  # legacy plaintext value


def _sign(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _is_private_url(url: str) -> bool:
    """Block SSRF targets: private/reserved IPs, localhost, cloud metadata."""
    try:
        host = urllib.parse.urlparse(url).hostname
        if not host:
            return True
        # Resolve DNS; if it fails or resolves to private/reserved ranges → block
        infos = socket.getaddrinfo(host, None)
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if (ip.is_private or ip.is_loopback or ip.is_link_local
                    or ip.is_reserved or ip.is_multicast or ip.is_unspecified
                    or _is_cgnat(ip)):
                return True
        return False
    except Exception as e:
        print(f"⚠️  Webhook URL SSRF check failed (fail-closed): {e}")
        return True  # fail closed


def _is_cgnat(ip) -> bool:
    """CGNAT 100.64.0.0/10 (RFC 6598) — ipaddress flags it is_private on 3.11+,
    but check explicitly for older runtimes / clarity."""
    try:
        if ip.version == 4:
            return int(ip) & 0xFFC00000 == 0x64400000  # 100.64.0.0/10
        return ip.is_private  # IPv6 ULA fc00::/7 covered by is_private
    except Exception:
        return False


class _ValidatingRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Re-validate every redirect hop against the SSRF guard.

    urllib follows 301/302/303/307 redirects by default WITHOUT re-checking
    the target host, so a public URL could redirect to 169.254.169.254
    (cloud metadata) or another private address. Every hop is re-checked and
    non-http(s) schemes (file://, gopher://, ...) are rejected outright.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not (newurl.startswith("https://") or newurl.startswith("http://")):
            raise urllib.error.HTTPError(req.full_url, code, "Blocked non-HTTP redirect", headers, fp)
        if _is_private_url(newurl):
            raise urllib.error.HTTPError(req.full_url, code, "Blocked redirect to private address", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def send_webhook(user, event: str, payload: dict):
    """Queue a signed webhook POST for the given event (fire-and-forget)."""
    url = get_webhook_url(user)
    if not url or not url.startswith("https://"):
        # https-only (plain http rejected at save time and here as defense).
        return
    # SSRF guard: reject private-network / metadata endpoints before delivery.
    if _is_private_url(url):
        print(f"⚠️ Webhook URL blocked (private/reserved address): {url}")
        return
    body = json.dumps({
        "event": event,
        "data": payload,
        "timestamp": __import__("time").time(),
    }).encode("utf-8")
    secret = get_webhook_secret(user)

    def _deliver():
        # Re-check immediately before connect to narrow the DNS-rebinding
        # window (the pre-queue check in send_webhook may be stale by seconds).
        # Note: a true TOCTOU-free fix requires pinning the connection to the
        # validated IP; this is defense-in-depth on top of the redirect
        # re-validation in _ValidatingRedirectHandler.
        if _is_private_url(url):
            print(f"⚠️ Webhook URL became private/reserved before delivery: {url}")
            return
        try:
            req = urllib.request.Request(
                url, data=body, method="POST",
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "GlbTOKEN-Webhook/1.0",
                    "X-GlbTOKEN-Event": event,
                    "X-GlbTOKEN-Signature": _sign(body, secret) if secret else "",
                },
            )
            # Opener with the validating redirect handler: every redirect hop is
            # re-checked against the SSRF guard (no silent hop to private IPs).
            _opener = urllib.request.build_opener(_ValidatingRedirectHandler())
            with _opener.open(req, timeout=10) as resp:
                resp.read()
        except Exception as e:
            print(f"⚠️ Webhook delivery failed ({event} → {url}): {e}")

    threading.Thread(target=_deliver, daemon=True).start()


def event_enabled(user, event: str) -> bool:
    s = _settings(user)
    events = s.get("webhook_events")
    if events is None:
        return True  # default: all events
    return event in events
