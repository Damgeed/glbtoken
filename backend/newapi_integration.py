"""
GlbTOKEN — New API Integration
Handles user creation and API token generation against a New API gateway,
plus exposes the shared gateway token used to proxy chat to the upstream.

AUTH NOTE (2026-08-15): This New API deployment authenticates its ADMIN panel API
(`/api/user/`, `/api/token/`, `/api/log/`) via a **login session cookie** + the
`New-Api-User: 1` header — NOT `Authorization: Bearer <token>`. Bearer tokens only
authenticate the OpenAI-compatible `/v1/*` gateway. The old code passed Bearer to
admin endpoints, which this gateway rejects ("Unauthorized, invalid access token").

TOKEN KEYS ARE IRRECOVERABLE: New API masks/omits API keys in every admin response
(even on create), so we CANNOT auto-mint a plaintext per-user gateway key. Users'
chat is therefore proxied through a single shared gateway token (NEW_API_GATEWAY_TOKEN)
that IS valid for `/v1`. Per-user `newapi_token` values, when present, are honored for
direct access / advanced setups.
"""

import asyncio
import httpx
import os
import time

NEW_API_BASE = os.getenv("NEW_API_BASE_URL", "").rstrip("/")
ADMIN_TOKEN = os.getenv("NEW_API_ADMIN_TOKEN", "")       # legacy Bearer (best-effort)
ADMIN_USER = os.getenv("NEW_API_ADMIN_USER", "root")
ADMIN_PASSWORD = os.getenv("NEW_API_ADMIN_PASSWORD", "")
GATEWAY_TOKEN = os.getenv("NEW_API_GATEWAY_TOKEN", "")   # shared /v1 key for chat proxy

# Exchange rate between GlbTOKEN tokens (1 USD = 1,000 tokens) and New API quota.
GLOBTOKEN_TOKENS_PER_USD = 1000
NEWAPI_QUOTA_PER_USD = int(os.getenv("NEWAPI_QUOTA_PER_USD", "1000"))

# Group for tokens minted for glbtoken users. New API channel `kimi` uses `vip`.
DEFAULT_GROUP = os.getenv("NEWAPI_GROUP", "vip")


def tokens_to_newapi_quota(tokens) -> int:
    """Convert GlbTOKEN tokens → New API quota units."""
    try:
        return int(float(tokens or 0) / GLOBTOKEN_TOKENS_PER_USD * NEWAPI_QUOTA_PER_USD)
    except (TypeError, ValueError, ZeroDivisionError):
        return 0


def newapi_quota_to_tokens(quota) -> float:
    """Convert New API quota units → GlbTOKEN tokens."""
    try:
        return round(float(quota or 0) / NEWAPI_QUOTA_PER_USD * GLOBTOKEN_TOKENS_PER_USD, 2)
    except (TypeError, ValueError, ZeroDivisionError):
        return 0.0


def get_gateway_token() -> str:
    """The shared gateway key for proxying chat to New API's /v1 endpoint."""
    return GATEWAY_TOKEN


def admin_configured() -> bool:
    """True when we can attempt admin (session-cookie) New API operations."""
    if not NEW_API_BASE:
        return False
    return bool(ADMIN_PASSWORD) or bool(ADMIN_TOKEN)


# ── Admin session management (session cookie, re-login on 401) ──
_session_cookie = None
_session_ts = 0.0
_SESSION_TTL = 23 * 3600
_lt = None  # lazy lock


def _lock():
    global _lt
    if _lt is None:
        _lt = asyncio.Lock()
    return _lt


async def _ensure_session(client: httpx.AsyncClient, force: bool = False) -> bool:
    global _session_cookie, _session_ts
    if not NEW_API_BASE or not ADMIN_PASSWORD:
        return False
    if not force and _session_cookie and (time.time() - _session_ts) < _SESSION_TTL:
        client.cookies.set("session", _session_cookie)
        return True
    try:
        async with _lock():
            # Double-check inside lock (another task may have refreshed).
            if not force and _session_cookie and (time.time() - _session_ts) < _SESSION_TTL:
                client.cookies.set("session", _session_cookie)
                return True
            client.cookies.clear()
            resp = await client.post(
                f"{NEW_API_BASE}/api/user/login",
                json={"username": ADMIN_USER, "password": ADMIN_PASSWORD},
            )
            if resp.status_code >= 400:
                return False
            body = resp.json()
            if not (body or {}).get("success"):
                return False
            candidate = client.cookies.get("session") or resp.cookies.get("session")
            if not candidate:
                return False
            _session_cookie = candidate
            _session_ts = time.time()
            return True
    except Exception as e:
        print(f"⚠️ New API admin session login failed: {e}")
        return False


def _admin_headers():
    return {"New-Api-User": "1", "Content-Type": "application/json"}


async def _admin_request(method: str, path: str, data: dict = None, retry: bool = True):
    """Perform a session-authenticated request to a New API ADMIN endpoint."""
    if not NEW_API_BASE:
        return {"error": "New API not configured"}
    url = f"{NEW_API_BASE}{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        ok = await _ensure_session(client)
        if not ok:
            if ADMIN_TOKEN:
                resp = await client.request(method, url, json=data,
                                            headers={**_admin_headers(), "Authorization": f"Bearer {ADMIN_TOKEN}"})
            else:
                return {"error": "New API admin not configured (no admin password/token)"}
        else:
            resp = await client.request(method, url, json=data, headers=_admin_headers())
        if resp.status_code == 401 and retry:
            await _ensure_session(client, force=True)
            resp = await client.request(method, url, json=data, headers=_admin_headers())
        if resp.status_code >= 400:
            try:
                detail = resp.json().get("message") or resp.json().get("error")
            except Exception:
                detail = resp.text[:120]
            return {"error": f"New API request failed ({resp.status_code}): {detail}"}
        try:
            return resp.json()
        except Exception:
            return {"error": "New API returned non-JSON"}


async def create_newapi_user(email: str, name: str, quota: int = 25000) -> dict:
    """
    Create a user in New API, then fetch their ID via the admin user list.
    Returns user dict with 'id' on success (id=0 => not linked).
    """
    if not NEW_API_BASE:
        print("⚠️  NEW_API_BASE_URL unset — users fall back to FALLBACK_API_URL.")
        return {"id": 0, "email": email, "name": name, "quota": quota}
    if not admin_configured():
        print("⚠️  New API admin credentials missing — users will NOT get a newapi_token.")
        return {"id": 0, "email": email, "name": name, "quota": quota}

    import secrets
    auto_password = "Gt" + secrets.token_hex(6)
    username = (email.split("@")[0] + "_" + secrets.token_hex(4))[:32]

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            reg = await client.post(
                f"{NEW_API_BASE}/api/user/register",
                json={"username": username, "password": auto_password,
                      "display_name": name, "email": email},
            )
            if reg.status_code >= 400:
                return {"error": "New API register failed", "status": reg.status_code}
    except Exception as e:
        print(f"⚠️ New API register error: {e}")
        return {"error": str(e)}

    # Find the new user id via admin user list (session auth).
    users_resp = await _admin_request("GET", "/api/user/?page=1&page_size=200")
    if users_resp.get("error"):
        return users_resp
    items = (users_resp.get("data") or {}).get("items") or []
    for u in items:
        if u.get("email") == email or u.get("username") == username:
            return {"id": u["id"], "email": email, "name": name,
                    "quota": quota, "username": username}
    return {"id": 0, "email": email, "name": name, "quota": quota, "username": username}


async def create_api_token(user_id: int, name: str = "GlbTOKEN", group: str = None) -> dict:
    """
    Create a New API token for a user (admin session). The key is masked by the
    admin API, so this returns the token id only — NOT a usable key. Chat is
    proxied via NEW_API_GATEWAY_TOKEN instead.
    """
    if not admin_configured():
        return {"key": "", "name": name}
    grp = group or DEFAULT_GROUP
    resp = await _admin_request(
        "POST", "/api/token/",
        {"name": name, "user_id": user_id, "remain_quota": 0,
         "expired_time": -1, "unlimited_quota": True, "group": grp},
    )
    if resp.get("error"):
        return {"key": "", "name": name, "error": resp["error"]}
    data = resp.get("data") or {}
    return {"key": "", "name": name, "id": data.get("id"), "masked": True}


async def add_user_quota(user_id: int, tokens: int) -> dict:
    """Add tokens (GlbTOKEN units) to a user's quota in New API (converted to quota units)."""
    quota = tokens_to_newapi_quota(tokens)
    return await _admin_request("POST", f"/api/user/{user_id}", {"add_quota": quota})


async def get_user_quota(user_id: int):
    """Fetch a user's remaining quota from New API (raw quota units)."""
    result = await _admin_request("GET", f"/api/user/{user_id}")
    if isinstance(result, dict) and (result.get("error") or not result.get("data")):
        return None
    data = result.get("data") if isinstance(result.get("data"), dict) else result
    return data.get("quota")


async def get_usage_today(user_id: int) -> dict:
    """Get today's usage for a user from New API."""
    result = await _admin_request("GET", f"/api/user/{user_id}/usage")
    if isinstance(result, dict) and result.get("error"):
        return {"total": 0, "models": {}}
    return result


async def get_user_logs(user_id: int, page: int = 1, page_size: int = 20) -> dict:
    """Fetch request logs for a user from New API."""
    result = await _admin_request(
        "GET", f"/api/log/?user_id={user_id}&page={page}&page_size={page_size}"
    )
    if isinstance(result, dict) and result.get("error"):
        return {"total": 0, "items": []}
    data = result.get("data") if isinstance(result.get("data"), dict) else result
    return {
        "total": (data or {}).get("total", 0) if isinstance(data, dict) else 0,
        "items": (data or {}).get("items", []) if isinstance(data, dict) else (data or []),
    }


async def get_user_models(user_id: int) -> list:
    """Get models accessible to a user from New API."""
    result = await _admin_request("GET", f"/api/user/{user_id}/models")
    if isinstance(result, dict) and result.get("error"):
        return []
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        return result.get("models", [])
    return []


async def get_log_content(log_id: int) -> dict:
    """Fetch full request content for a specific log entry from New API."""
    result = await _admin_request("GET", f"/api/log/content?log_id={log_id}")
    if isinstance(result, dict) and result.get("error"):
        return {"error": "Content not available"}
    return result
