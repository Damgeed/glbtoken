"""GlbTOKEN — Auth0 Integration
Handles password grant login, signup, social login, and JWT verification.
All existing frontend buttons route through Auth0 behind the scenes.
Gracefully disabled — falls back to custom auth if Auth0 not configured."""

import os, requests, time, secrets
import jwt  # PyJWT (replaces unmaintained python-jose; removes vulnerable ecdsa dep)

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "")
AUTH0_CLIENT_ID = os.getenv("AUTH0_CLIENT_ID", "")
AUTH0_CLIENT_SECRET = os.getenv("AUTH0_CLIENT_SECRET", "")

def is_configured() -> bool:
    return bool(AUTH0_DOMAIN and AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET)

def get_config() -> dict:
    return {
        "configured": is_configured(),
        "domain": AUTH0_DOMAIN,
        "client_id": AUTH0_CLIENT_ID,
    }

# ── PKCE Code Exchange (Social Login) ──

def _auth0_token_request(payload: dict) -> dict:
    """POST to Auth0 /oauth/token.

    STANDARD (preferred) flow: confidential client — client_secret in body
    ('Post' method), matching Auth0's recommended Regular Web App setup with
    RS256. Non-standard tenants (Single Page App / public client) reject
    client_secret with access_denied even when correct — fall back to public
    PKCE (no client_secret), then Basic auth header. Business errors
    (invalid_grant = bad code/verifier) are never retried as auth errors.
    Raw Auth0 error is logged for diagnostics (never the secret).
    """
    url = f"https://{AUTH0_DOMAIN}/oauth/token"
    # 1) STANDARD: confidential client, 'Post' method (client_secret in body)
    resp = requests.post(url, json=payload, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    try:
        err_body = resp.json()
        err = err_body.get("error_description") or err_body.get("error") or resp.text
        err_code = err_body.get("error", "")
    except Exception:
        err = resp.text
        err_code = ""
    # Business errors (invalid_grant etc.) mean the request was accepted and
    # the code/verifier is bad — retrying another auth style won't help.
    if err_code in ("invalid_grant", "invalid_request"):
        print(f"⚠️ Auth0 token endpoint error (HTTP {resp.status_code}): {err}")
        raise ValueError(f"Auth0 token request failed: {err}")
    # 2) Non-standard: public client (SPA) — retry WITHOUT client_secret.
    #    Auth0 public clients reject any client_secret with access_denied.
    if err_code in ("access_denied", "unauthorized_client", "unauthorized"):
        pub_payload = {k: v for k, v in payload.items() if k != "client_secret"}
        resp = requests.post(url, json=pub_payload, timeout=10)
        if resp.status_code == 200:
            print("⚠️ Auth0: token endpoint used public PKCE (app is a Single Page App — "
                  "recommend switching to Regular Web App + RS256)")
            return resp.json()
    # 3) Confidential client, 'Basic' method (Authorization header)
    try:
        resp2 = requests.post(
            url, json=payload, timeout=10,
            auth=(AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET),
        )
        if resp2.status_code == 200:
            print(f"⚠️ Auth0: token endpoint fell back to Basic auth (Post got: {err})")
            return resp2.json()
    except Exception as e:
        print(f"⚠️ Auth0 Basic auth fallback failed: {e}")
    print(f"⚠️ Auth0 token endpoint error (HTTP {resp.status_code}): {err}")
    raise ValueError(f"Auth0 token request failed: {err}")


def exchange_pkce_code(code: str, code_verifier: str, redirect_uri: str) -> dict:
    """Exchange an Auth0 authorization code for tokens using PKCE (server-side)."""
    if not is_configured():
        raise ValueError("Auth0 not configured")
    payload = {
        "grant_type": "authorization_code",
        "client_id": AUTH0_CLIENT_ID,
        "client_secret": AUTH0_CLIENT_SECRET,
        "code": code,
        "code_verifier": code_verifier,
        "redirect_uri": redirect_uri,
    }
    return _auth0_token_request(payload)

# ── Password Grant (Email/Password Login) ──

def password_login(email: str, password: str) -> dict:
    """Exchange email+password for Auth0 tokens via Resource Owner Password Grant."""
    if not is_configured():
        raise ValueError("Auth0 not configured")
    payload = {
        "grant_type": "password",
        "username": email,
        "password": password,
        "client_id": AUTH0_CLIENT_ID,
        "client_secret": AUTH0_CLIENT_SECRET,
        "scope": "openid email profile",
    }
    return _auth0_token_request(payload)

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

def get_social_login_url(provider: str, redirect_uri: str, state: str = "") -> str:
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
        "nonce": secrets.token_urlsafe(16),
        # Force Auth0 to re-authenticate instead of silently reusing an existing
        # session. Without this, a browser that already logged in via Apple would
        # silently return that SAME user when the user clicks "Google" — every
        # social login lands in the first account ("same dashboard" bug).
        "prompt": "login",
        "max_age": 0,
    }
    if state:
        params["state"] = state
    return f"https://{AUTH0_DOMAIN}/authorize?{urlencode(params)}"

JWKS_CACHE = None
JWKS_CACHE_TIME = 0

def _fetch_jwks() -> dict:
    global JWKS_CACHE, JWKS_CACHE_TIME
    now = time.time()
    if AUTH0_DOMAIN and (JWKS_CACHE is None or now - JWKS_CACHE_TIME > 86400):
        try:
            url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                JWKS_CACHE = resp.json()
                JWKS_CACHE_TIME = now
        except Exception as e:
            print(f"⚠️ Failed to fetch Auth0 JWKS: {e}")
    return JWKS_CACHE or {}

def verify_token(id_token: str) -> dict:
    """Verify an Auth0 ID token. Returns decoded payload on success.

    Supports both Auth0 signing algorithms:
    - RS256 (default): verified against the tenant JWKS public keys.
    - HS256: signed with the application's client_secret (Auth0 lets the app
      switch Signing Algorithm to HS256; token header alg then says HS256).
    """
    if not is_configured():
        raise ValueError("Auth0 not configured")
    try:
        unverified_header = jwt.get_unverified_header(id_token)
        alg = unverified_header.get("alg", "")
        if alg == "HS256":
            # HS256 is non-standard for Auth0 (shared-secret signing). Support
            # it for compatibility, but flag it — RS256 is the secure default.
            print("⚠️ Auth0: id_token signed with HS256 — recommend switching the "
                  "application's Signing Algorithm back to RS256 (public-key "
                  "verification, no shared secret)")
            payload = jwt.decode(
                id_token, AUTH0_CLIENT_SECRET,
                algorithms=["HS256"],
                audience=AUTH0_CLIENT_ID,
                issuer=f"https://{AUTH0_DOMAIN}/",
            )
            return payload
        # RS256 via JWKS
        jwks = _fetch_jwks()
        if not jwks:
            raise ValueError("Could not fetch Auth0 JWKS")
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
        )
        return payload
    except jwt.PyJWTError as e:
        raise ValueError(f"Auth0 token verification failed: {e}")

def get_user_info(payload: dict) -> dict:
    """Extract standardized user info from Auth0 token payload.

    NEVER fall back to `sub` for the name — the sub is a random code like
    "auth0|64f2ab..." and would overwrite the user's real display name.
    Fall back to the email local part instead (e.g. "john@x.com" -> "john").
    """
    email = payload.get("email", "")
    name = payload.get("name", payload.get("nickname", "") or "")
    if not name and email:
        name = email.split("@")[0]
    return {
        "sub": payload.get("sub", ""),
        "email": email,
        "name": name,
        "picture": payload.get("picture", ""),
        "email_verified": payload.get("email_verified", False),
    }
