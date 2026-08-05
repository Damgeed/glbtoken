"""GlbTOKEN — outbound developer webhooks.

Users can register a webhook URL (+ optional shared secret). When events fire
(low_balance, key.created, key.deleted, topup.success) we POST a signed JSON
payload. Signing: HMAC-SHA256 of the raw body with the shared secret, sent in
the `X-GlbTOKEN-Signature` header (hex). Delivery is fire-and-forget in a
daemon thread with a 10s timeout so API latency is never affected.
"""
import hashlib
import hmac
import json
import threading
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
    return (_settings(user).get("webhook_secret") or "").strip()


def _sign(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def send_webhook(user, event: str, payload: dict):
    """Queue a signed webhook POST for the given event (fire-and-forget)."""
    url = get_webhook_url(user)
    if not url or not (url.startswith("https://") or url.startswith("http://")):
        return
    body = json.dumps({
        "event": event,
        "data": payload,
        "timestamp": __import__("time").time(),
    }).encode("utf-8")
    secret = get_webhook_secret(user)

    def _deliver():
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
            with urllib.request.urlopen(req, timeout=10) as resp:
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
