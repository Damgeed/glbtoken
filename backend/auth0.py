"""
GlbTOKEN — Auth0 Integration
Verifies Auth0 JWTs, creates/links users in our database.
Gracefully disabled — all endpoints/docs work without Auth0 config.
"""
import os, json, requests
from jose import jwt, JWTError
from datetime import datetime, timezone

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "")
AUTH0_CLIENT_ID = os.getenv("AUTH0_CLIENT_ID", "")
AUTH0_CLIENT_SECRET = os.getenv("AUTH0_CLIENT_SECRET", "")
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE", f"https://{AUTH0_DOMAIN}/api/v2/") if AUTH0_DOMAIN else ""

JWKS_CACHE = None

def is_auth0_configured() -> bool:
    """Check if Auth0 env vars are set."""
    return bool(AUTH0_DOMAIN and AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET)


def get_auth0_config() -> dict:
    """Return public Auth0 config for the frontend."""
    return {
        "configured": is_auth0_configured(),
        "domain": AUTH0_DOMAIN,
        "client_id": AUTH0_CLIENT_ID,
        "audience": AUTH0_AUDIENCE or "",
        "redirect_uri": f"https://glbtoken.com/auth/callback.html",
    }


def _fetch_jwks() -> dict:
    """Fetch Auth0 JWKS keys (cached)."""
    global JWKS_CACHE
    if JWKS_CACHE is None and AUTH0_DOMAIN:
        try:
            url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                JWKS_CACHE = resp.json()
        except Exception:
            pass
    return JWKS_CACHE or {}


def verify_auth0_token(id_token: str) -> dict:
    """
    Verify an Auth0 ID token / access token.
    Returns decoded payload on success, or raises ValueError.
    """
    if not is_auth0_configured():
        raise ValueError("Auth0 not configured")

    jwks = _fetch_jwks()
    if not jwks:
        raise ValueError("Could not fetch Auth0 JWKS")

    try:
        # Get the key ID from token header
        unverified_header = jwt.get_unverified_header(id_token)
        rsa_key = {}
        for key in jwks.get("keys", []):
            if key["kid"] == unverified_header["kid"]:
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "use": key["use"],
                    "n": key["n"],
                    "e": key["e"],
                }
                break
        if not rsa_key:
            raise ValueError("No matching RSA key found in JWKS")

        payload = jwt.decode(
            id_token,
            rsa_key,
            algorithms=["RS256"],
            audience=AUTH0_CLIENT_ID,
            issuer=f"https://{AUTH0_DOMAIN}/",
            options={"verify_exp": True},
        )
        return payload
    except JWTError as e:
        raise ValueError(f"Auth0 token verification failed: {e}")


def get_user_info(payload: dict) -> dict:
    """Extract standardized user info from Auth0 token payload."""
    return {
        "sub": payload.get("sub", ""),           # Auth0 user ID (e.g. auth0|xxx)
        "email": payload.get("email", ""),
        "name": payload.get("name", payload.get("nickname", payload.get("sub", ""))),
        "picture": payload.get("picture", ""),
        "email_verified": payload.get("email_verified", False),
    }
