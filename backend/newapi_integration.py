"""
GlbTOKEN — New API Integration
Handles user creation, quota management, and API token generation
against a New API gateway instance.
"""

import httpx
import os
from typing import Optional, Dict, Any

NEW_API_BASE = os.getenv("NEW_API_BASE_URL", "")
ADMIN_TOKEN = os.getenv("NEW_API_ADMIN_TOKEN", "")

HEADERS = {"Authorization": f"Bearer {ADMIN_TOKEN}"} if ADMIN_TOKEN else {}

# For admin operations, New API also requires the user ID header
ADMIN_HEADERS = {**HEADERS, "New-Api-User": "1"} if ADMIN_TOKEN else {}

async def _post(path: str, data: dict = None, admin: bool = False) -> dict:
    """Make a POST request to New API."""
    if not NEW_API_BASE or not ADMIN_TOKEN:
        return {"error": "New API not configured"}
    url = f"{NEW_API_BASE.rstrip('/')}{path}"
    headers = ADMIN_HEADERS if admin else HEADERS
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, json=data, headers=headers)
        if r.status_code >= 400:
            return {"error": "New API request failed", "status": r.status_code}
        return r.json()

async def _get(path: str, admin: bool = False) -> dict:
    """Make a GET request to New API."""
    if not NEW_API_BASE or not ADMIN_TOKEN:
        return {"error": "New API not configured"}
    url = f"{NEW_API_BASE.rstrip('/')}{path}"
    headers = ADMIN_HEADERS if admin else HEADERS
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, headers=headers)
        if r.status_code >= 400:
            return {"error": "New API request failed", "status": r.status_code}
        return r.json()

async def health_check() -> bool:
    """Check if New API is reachable."""
    if not NEW_API_BASE:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{NEW_API_BASE.rstrip('/')}/api/status", headers=HEADERS)
            return r.status_code < 500
    except Exception as e:
        print(f"⚠️ New API health check failed: {e}")
        return False

async def create_newapi_user(email: str, name: str, quota: int = 25000) -> dict:
    """
    Create a user in New API.
    The /api/user/register endpoint is public (no auth needed) and returns
    success without the user ID. We then query the admin endpoint to get the ID.
    Returns user dict with 'id' field on success.
    """
    if not NEW_API_BASE or not ADMIN_TOKEN:
        # Fall back to local-only mode
        return {"id": 0, "email": email, "name": name, "quota": quota}
    import secrets
    auto_password = "Gt" + secrets.token_hex(6)  # 14 chars — fits New API's validation
    # New API uses 'username' not 'email' for registration
    username = email.split("@")[0] + "_" + secrets.token_hex(4)
    # Truncate to avoid overly long usernames
    username = username[:32]
    resp = await _post("/api/user/register", {
        "username": username,
        "password": auto_password,
        "display_name": name,
        "email": email,
    })
    # Register endpoint returns {"message":"","success":true} without ID.
    # Query user list to find the newly created user by email.
    if resp and resp.get("success") is True:
        users_resp = await _get("/api/user/?page=1&page_size=100", admin=True)
        if users_resp and "items" in users_resp.get("data", {}):
            for u in users_resp["data"]["items"]:
                if u.get("email") == email or u.get("username") == username:
                    return {"id": u["id"], "email": email, "name": name, "quota": quota, "username": username}
        # Fallback: just return what we have
        return {"id": 0, "email": email, "name": name, "quota": quota, "username": username}
    return resp or {"id": 0}

async def update_user_quota(user_id: int, quota: int) -> dict:
    """Set a user's remaining quota in New API."""
    return await _post(f"/api/user/{user_id}", {"quota": quota}, admin=True)

async def add_user_quota(user_id: int, tokens: int) -> dict:
    """Add tokens to a user's quota in New API."""
    return await _post(f"/api/user/{user_id}", {"add_quota": tokens}, admin=True)

async def get_usage_today(user_id: int) -> dict:
    """Get today's usage for a user from New API."""
    result = await _get(f"/api/user/{user_id}/usage", admin=True)
    if "error" in result:
        return {"total": 0, "models": {}}
    return result

async def create_api_token(user_id: int, name: str = "GlbTOKEN") -> dict:
    """
    Create an API key for a user in New API.
    Returns dict with 'key' field on success.
    """
    if not NEW_API_BASE or not ADMIN_TOKEN:
        return {"key": "", "name": name}
    return await _post(f"/api/user/{user_id}/key", {"name": name}, admin=True)

async def get_user_logs(user_id: int, page: int = 1, page_size: int = 20) -> dict:
    """Fetch request logs for a user from New API."""
    result = await _get(f"/api/log/?user_id={user_id}&page={page}&page_size={page_size}", admin=True)
    if "error" in result:
        return {"total": 0, "items": []}
    return result

async def get_user_models(user_id: int) -> list:
    """Get models accessible to a user from New API."""
    result = await _get(f"/api/user/{user_id}/models", admin=True)
    if isinstance(result, dict) and "error" in result:
        return []
    if isinstance(result, list):
        return result
    return result.get("models", []) if isinstance(result, dict) else []
