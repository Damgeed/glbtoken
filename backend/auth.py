import secrets, hashlib
from datetime import datetime, timedelta, timezone
import jwt  # PyJWT (replaces unmaintained python-jose; removes vulnerable ecdsa dep)
from passlib.context import CryptContext
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db, User, RefreshToken
import httpx
import os

SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET environment variable is required")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # 1-hour expiry for security (refresh mechanism handles extension)
REFRESH_TOKEN_EXPIRE_DAYS = 30    # 30-day refresh token

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

# OAuth config — set these via environment variables
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_minutes: int | None = None) -> str:
    to_encode = data.copy()
    minutes = expires_minutes if expires_minutes is not None else ACCESS_TOKEN_EXPIRE_MINUTES
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def generate_refresh_token(user_id: int, db: Session, ua: str = "", device_type: str = "") -> str:
    """Generate a refresh token, store its SHA-256 hash, return the raw token.

    ua/device_type label the row so the sessions list can show which browser
    a session belongs to (and so login can replace the same device's old
    token instead of accumulating one row per login).
    """
    # Opportunistic cleanup: drop this user's expired tokens (rotation is
    # non-destructive now, so without this the table would grow until expiry)
    try:
        db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id,
            RefreshToken.expires_at < datetime.now(timezone.utc)
        ).delete(synchronize_session=False)
    except Exception as e:
        print(f"⚠️ Refresh-token cleanup failed (non-critical): {e}")
    raw = secrets.token_hex(32)  # 64-char hex string
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    db_entry = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires,
        user_agent=(ua or "")[:500],
        device_type=(device_type or "")[:50],
    )
    db.add(db_entry)
    db.commit()
    return raw

def validate_refresh_token(raw: str, db: Session) -> int:
    """Validate a refresh token. Returns user_id if valid. Raises 401 on failure.

    NOTE: rotation is NON-destructive — the old token is NOT revoked here.
    Revoking on every refresh caused false logouts with multiple tabs: two tabs
    refreshing the same token race, the loser gets 401 despite a valid session,
    and the frontend then clears the session and redirects to login. Old tokens
    stay valid until the 30-day expiry; explicit logout still revokes.
    """
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    entry = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash,
        RefreshToken.revoked == False,
        RefreshToken.expires_at > datetime.now(timezone.utc)
    ).first()
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    return entry.user_id


def revoke_refresh_token(raw: str, db: Session) -> bool:
    """Revoke a refresh token server-side (logout). Returns True if revoked."""
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    entry = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash,
        RefreshToken.revoked == False
    ).first()
    if entry:
        entry.revoked = True
        db.commit()
        return True
    return False

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    # SECURITY: a 2FA pre_token (scope="2fa") is a short-lived step-up token
    # meant ONLY for the /api/auth/2fa/confirm exchange. It must never be
    # accepted as a full access token on protected endpoints — otherwise anyone
    # with the password (but not the TOTP code) could replay it as a Bearer
    # token and get full account access.
    if payload.get("scope") == "2fa":
        raise HTTPException(status_code=401, detail="Invalid token scope")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    try:
        uid = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid user ID in token")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    if not credentials:
        return None
    try:
        payload = decode_token(credentials.credentials)
        # Same 2FA pre_token guard as get_current_user: a step-up token must
        # not resolve to a user on any authenticated path.
        if payload.get("scope") == "2fa":
            return None
        user_id = payload.get("sub")
        if user_id:
            return db.query(User).filter(User.id == int(user_id)).first()
    except Exception as e:
        print(f"⚠️ Optional user auth failed: {e}")
        return None

def generate_api_key() -> str:
    return "gtk_" + secrets.token_hex(24)

def hash_api_key(raw: str) -> str:
    """SHA-256 hex hash of an API key for safe DB storage/lookup."""
    return hashlib.sha256(raw.encode()).hexdigest()

async def verify_google_token(token: str) -> dict:
    """Verify Google OAuth token and return user info."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/tokeninfo",
            data={"id_token": token},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Invalid Google token")
        data = resp.json()
        # CRITICAL: verify the audience (aud) matches OUR Google OAuth client.
        # Without this, any valid id_token issued to a different Google app
        # (containing the victim's email) would pass verification → account takeover.
        aud = data.get("aud", "")
        if not GOOGLE_CLIENT_ID or aud != GOOGLE_CLIENT_ID:
            raise HTTPException(status_code=401, detail="Invalid Google token audience")
        return {
            "id": data["sub"],
            "email": data["email"],
            "name": data.get("name", ""),
            "email_verified": str(data.get("email_verified", "false")).lower() in ("true", "1"),
        }

async def verify_github_code(code: str) -> dict:
    """Exchange GitHub OAuth code for user info."""
    async with httpx.AsyncClient() as client:
        # Exchange code for access token
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="GitHub auth failed")
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="No access token from GitHub")
        
        # Get user info
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get GitHub user")
        user_data = user_resp.json()
        
        # Get email
        email_resp = await client.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        emails = email_resp.json() if email_resp.status_code == 200 else []
        primary = next((e for e in emails if e.get("primary")), None)
        primary_email = (primary or {}).get("email") or user_data.get("email")
        email_verified = bool((primary or {}).get("verified"))
        if not primary_email:
            # No real email available — fall back to a synthetic address that is
            # NEVER marked verified (it is not a real mailbox).
            primary_email = f"{user_data['login']}@github.com"
            email_verified = False

        return {
            "id": str(user_data["id"]),
            "email": primary_email,
            "name": user_data.get("name", user_data["login"]),
            "email_verified": email_verified,
        }
