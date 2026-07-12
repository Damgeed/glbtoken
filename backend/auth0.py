"""GlbTOKEN — Auth0 Integration
Handles password grant login, signup, social login, and JWT verification.
All existing frontend buttons route through Auth0 behind the scenes.
Gracefully disabled — falls back to custom auth if Auth0 not configured."""

import os, json, requests
from jose import jwt, JWTError
from datetime import datetime, timezone

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "")
AUTH0_CLIENT_ID = os.getenv("AUTH0_CLIENT_ID", "")
AUTH0_CLIENT_SECRET = os.getenv("AUTH0_CLIENT_SECRET", "")

JWKS_CACHE = None

def is_configured() -> bool:
    return bool(AUTH0_DOMAIN and AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET)

def get_config() -> dict:
    return {
        "configured": is_configured(),
        "domain": AUTH0_DOMAIN,
        "client_id": AUTH0_CLIENT_ID,
    }

# ── Password Grant (Email/Password Login) ──

def password_login(email: str, password: str) -> dict:
    """Exchange email+password for Auth0 tokens via Resource Owner Password Grant."""
    if not is_configured():
        raise ValueError("Auth0 not configured")
    url = f"https://{AUTH0_DOMAIN}/oauth/token"
    payload = {
        "grant_type": "password",
        "username": email,
        "password": password,
        "client_id": AUTH0_CLIENT_ID,
        "client_secret": AUTH0_CLIENT_SECRET,
        "scope": "openid email profile",
    }
    resp = requests.post(url, json=payload, timeout=10)
    if resp.status_code != 200:
        err = resp.json().get("error_description", resp.text)
        raise ValueError(f"Auth0 login failed: {err}")
    return resp.json()

# ── Signup (Database Connection) ──

def signup(email: str, password: str, name: str) -> dict:
    """Create a new user in Auth0's Username-Password-Authentication database."""
    if not is_configured():
        raise ValueError("Auth0 not configured")
    url = f"https://{AUTH0_DOMAIN}/dbconnections/signup"
    payload = {
        "client_id": AUTH0_CLIENT_ID,
        "email": email,
        "password": password,
        "name": name,
        "connection": "Username-Password-Authentication",
    }
    resp = requests.post(url, json=payload, timeout=10)
    if resp.status_code != 200:
        err = resp.json().get("description", resp.text)
        raise ValueError(f"Auth0 signup failed: {err}")
    return resp.json()

# ── Passwordless Email (Magic Code) ──

def send_passwordless_code(email: str) -> dict:
    """Send a verification code to the user's email via Auth0 Passwordless Email."""
    if not is_configured():
        raise ValueError("Auth0 not configured")
    url = f"https://{AUTH0_DOMAIN}/passwordless/start"
    payload = {
        "client_id": AUTH0_CLIENT_ID,
        "client_secret": AUTH0_CLIENT_SECRET,
        "connection": "email",
        "email": email,
        "send": "code",
    }
    resp = requests.post(url, json=payload, timeout=10)
    if resp.status_code != 200:
        err = resp.json().get("error_description", resp.text)
        raise ValueError(f"Auth0 passwordless start failed: {err}")
    return {"email": email, "sent": True}

def verify_passwordless_code(email: str, code: str) -> dict:
    """Exchange a verification code for Auth0 tokens."""
    if not is_configured():
        raise ValueError("Auth0 not configured")
    url = f"https://{AUTH0_DOMAIN}/oauth/token"
    payload = {
        "grant_type": "http://auth0.com/oauth/grant-type/passwordless/otp",
        "realm": "email",
        "username": email,
        "otp": code,
        "client_id": AUTH0_CLIENT_ID,
        "client_secret": AUTH0_CLIENT_SECRET,
        "scope": "openid email profile",
    }
    resp = requests.post(url, json=payload, timeout=10)
    if resp.status_code != 200:
        err = resp.json().get("error_description", resp.text)
        raise ValueError(f"Auth0 code verification failed: {err}")
    return resp.json()

# ── Passwordless SMS (Phone Code) ──

def send_sms_code(phone: str) -> dict:
    """Send a verification code via SMS using Auth0 Passwordless SMS."""
    if not is_configured():
        raise ValueError("Auth0 not configured")
    url = f"https://{AUTH0_DOMAIN}/passwordless/start"
    payload = {
        "client_id": AUTH0_CLIENT_ID,
        "client_secret": AUTH0_CLIENT_SECRET,
        "connection": "sms",
        "phone_number": phone,
        "send": "code",
    }
    resp = requests.post(url, json=payload, timeout=10)
    if resp.status_code != 200:
        err = resp.json().get("error_description", resp.text)
        raise ValueError(f"Auth0 SMS start failed: {err}")
    return {"phone": phone, "sent": True}

def verify_sms_code(phone: str, code: str) -> dict:
    """Exchange an SMS verification code for Auth0 tokens."""
    if not is_configured():
        raise ValueError("Auth0 not configured")
    url = f"https://{AUTH0_DOMAIN}/oauth/token"
    payload = {
        "grant_type": "http://auth0.com/oauth/grant-type/passwordless/otp",
        "realm": "sms",
        "username": phone,
        "otp": code,
        "client_id": AUTH0_CLIENT_ID,
        "client_secret": AUTH0_CLIENT_SECRET,
        "scope": "openid email profile phone",
    }
    resp = requests.post(url, json=payload, timeout=10)
    if resp.status_code != 200:
        err = resp.json().get("error_description", resp.text)
        raise ValueError(f"Auth0 SMS verification failed: {err}")
    return resp.json()

# ── Social Login Redirect URL ──

def get_social_login_url(provider: str, redirect_uri: str) -> str:
    """Build Auth0 authorize URL for a social connection (google-oauth2, github, etc.)."""
    if not is_configured():
        return ""
    connection_map = {
        "google": "google-oauth2",
        "github": "github",
        "microsoft": "windowslive",
        "apple": "apple",
    }
    connection = connection_map.get(provider)
    if not connection:
        return ""
    from urllib.parse import urlencode
    params = {
        "client_id": AUTH0_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "token id_token",
        "scope": "openid email profile",
        "connection": connection,
        "nonce": str(int(datetime.now(timezone.utc).timestamp())),
    }
    return f"https://{AUTH0_DOMAIN}/authorize?{urlencode(params)}"

# ── JWT Verification ──

def _fetch_jwks() -> dict:
    global JWKS_CACHE
    if JWKS_CACHE is None and AUTH0_DOMAIN:
        try:
            url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                JWKS_CACHE = resp.json()
        except Exception as e:
            print(f"⚠️ Failed to fetch Auth0 JWKS: {e}")
    return JWKS_CACHE or {}

def verify_token(id_token: str) -> dict:
    """Verify an Auth0 ID token. Returns decoded payload on success."""
    if not is_configured():
        raise ValueError("Auth0 not configured")
    jwks = _fetch_jwks()
    if not jwks:
        raise ValueError("Could not fetch Auth0 JWKS")
    try:
        unverified_header = jwt.get_unverified_header(id_token)
        rsa_key = {}
        for key in jwks.get("keys", []):
            if key["kid"] == unverified_header["kid"]:
                rsa_key = {k: key[k] for k in ["kty", "kid", "use", "n", "e"] if k in key}
                break
        if not rsa_key:
            raise ValueError("No matching RSA key found in JWKS")
        payload = jwt.decode(
            id_token, rsa_key,
            algorithms=["RS256"],
            audience=AUTH0_CLIENT_ID,
            issuer=f"https://{AUTH0_DOMAIN}/",
            options={"verify_exp": True, "verify_at_hash": False},
        )
        return payload
    except JWTError as e:
        raise ValueError(f"Auth0 token verification failed: {e}")

def get_user_info(payload: dict) -> dict:
    """Extract standardized user info from Auth0 token payload."""
    return {
        "sub": payload.get("sub", ""),
        "email": payload.get("email", ""),
        "name": payload.get("name", payload.get("nickname", payload.get("sub", ""))),
        "picture": payload.get("picture", ""),
        "email_verified": payload.get("email_verified", False),
    }
