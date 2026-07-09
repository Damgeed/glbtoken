"""
GlbTOKEN Backend — FastAPI Server
Run: uvicorn main:app --reload
"""

from fastapi import FastAPI, Depends, HTTPException, status, Query, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import Optional
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
import smtplib, secrets, os, json, random

from database import init_db, get_db, User, ApiKey, Transaction, AIModel
from auth import (
    hash_password, verify_password, create_access_token, decode_token,
    get_current_user, get_optional_user, generate_api_key,
    verify_google_token, verify_github_code, GOOGLE_CLIENT_ID, GITHUB_CLIENT_ID
)
from newapi_integration import (
    create_newapi_user, update_user_quota, add_user_quota,
    get_usage_today, create_api_token, health_check
)
from auth0 import is_configured as is_auth0_configured, get_config as get_auth0_config, verify_token as verify_auth0_token, get_user_info, password_login as auth0_password_login, signup as auth0_signup, get_social_login_url, send_passwordless_code, verify_passwordless_code, send_sms_code, verify_sms_code

# ── Lifespan (replaces deprecated on_event) ──
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    seed_models()
    try:
        auto_pull_models()
    except Exception as e:
        print(f"⚠️ Auto-pull error (non-critical): {e}")
    yield
    # Shutdown (nothing to clean up yet)


app = FastAPI(title="GlbTOKEN API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://glbtoken.com",
        "https://www.glbtoken.com",
        "https://damgeed.github.io",
        "http://localhost:5500",
        "http://localhost:8000",
        "http://127.0.0.1:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Security Headers ──
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https:; frame-src 'self' https://www.google.com; object-src 'none'"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ── Rate Limiting ──
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Root Health ──
@app.get("/")
def root():
    return {"status": "ok", "name": "GlbTOKEN API", "version": "1.0.0"}

# ── Pydantic Schemas ──
class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    country: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class GoogleAuthRequest(BaseModel):
    token: str

class GithubAuthRequest(BaseModel):
    code: str

class ApiKeyCreate(BaseModel):
    name: str = "My API Key"
    permissions: str = "read_write"

class ApiKeyUpdate(BaseModel):
    name: Optional[str] = None
    permissions: Optional[str] = None
    is_active: Optional[bool] = None

class TopupRequest(BaseModel):
    amount: float
    currency: str = "USD"
    payment_method: str = "stripe"

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    country: Optional[str] = None

class TokenRateUpdate(BaseModel):
    token_multiplier: float = 1.0  # 1.0 = base rate, 2.0 = 2x markup

class AdminBalanceRequest(BaseModel):
    user_id: int
    tokens: float
    reason: str = "Manual adjustment"

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class SendVerificationRequest(BaseModel):
    email: str = ""

class OptionalEmailRequest(BaseModel):
    email: str = ""

class VerifyEmailRequest(BaseModel):
    otp: str

class InitiatePaymentRequest(BaseModel):
    amount: float
    currency: str = "USD"
    payment_method: str = "stripe"
    email: str = ""

class ContactRequest(BaseModel):
    name: str
    email: str
    message: str

# ── Email Config ──
def send_email(to: str, subject: str, body: str) -> bool:
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    from_addr = os.getenv("SMTP_FROM", "noreply@glbtoken.io")
    if not smtp_host:
        print(f"📧 SMTP not configured. Would send email to {to}: {subject}")
        return False
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as s:
            s.starttls()
            s.login(smtp_user, smtp_pass)
            s.send_message(msg)
        print(f"📧 Email sent to {to}: {subject}")
        return True
    except Exception as e:
        print(f"📧 SMTP FAILED to {to}: {e}")
        return False

# ── Startup check ──
if not os.getenv("SMTP_HOST"):
    print("⚠️  SMTP not configured — password reset and email verification will silently fail.")

# ── Auth Routes ──
@app.post("/api/auth/register")
@limiter.limit("5/minute")
async def register(req: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    try:
        if db.query(User).filter(User.email == req.email).first():
            raise HTTPException(status_code=400, detail="Email already registered")
        if len(req.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        user = User(
            name=req.name,
            email=req.email,
            password_hash=hash_password(req.password),
            country=req.country,
            token_balance=0,
            is_admin=(db.query(User).count() == 0),  # First user is admin
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ REGISTER DB ERROR: {e}")
        raise HTTPException(status_code=500, detail="Database error. Please try again.")
    
    # ── Sync to New API (non-blocking, best-effort) ──
    newapi_user = None
    newapi_token = None
    try:
        newapi_user = await create_newapi_user(
            email=req.email,
            name=req.name,
            quota=0,
        )
        if newapi_user and isinstance(newapi_user, dict) and newapi_user.get("id"):
            # Create an API token for this user in New API
            token_resp = await create_api_token(
                user_id=newapi_user["id"],
                name=f"GlbTOKEN Key - {user.name}",
            )
            if token_resp and token_resp.get("key"):
                newapi_token = token_resp["key"]
                # Store the New API token reference in our DB
                user.newapi_user_id = newapi_user["id"]
                user.newapi_token = newapi_token
                db.commit()
    except Exception as e:
        print(f"⚠️ New API sync failed on register: {e}")
        # Don't block registration on New API failure
    
    result = {
        "user": {
            "id": user.id, "name": user.name, "email": user.email,
            "token_balance": user.token_balance,
        },
        "token": create_access_token({"sub": str(user.id)}),
    }
    if newapi_token:
        result["newapi_token"] = newapi_token
        result["newapi_endpoint"] = os.getenv("NEW_API_BASE_URL", "")
    return result

@app.post("/api/auth/login")
@limiter.limit("10/minute")
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance, "country": user.country}, "token": token}

@app.get("/api/auth/google")
def google_auth_url():
    if not GOOGLE_CLIENT_ID:
        return {"url": None, "error": "Google OAuth not configured"}
    from urllib.parse import urlencode
    params = urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": "https://glbtoken.com/auth/oauth-callback.html?provider=google",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    })
    return {"url": f"https://accounts.google.com/o/oauth2/auth?{params}"}

@app.post("/api/auth/google/callback")
async def google_callback(req: GoogleAuthRequest, db: Session = Depends(get_db)):
    # Exchange authorization code for id_token
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=400, detail="Google OAuth not configured")
    import httpx
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": req.token,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": "https://glbtoken.com/auth/oauth-callback.html?provider=google",
                "grant_type": "authorization_code",
            }
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Authentication failed. Please try again.")
        token_data = token_resp.json()
        id_token = token_data.get("id_token")
        if not id_token:
            raise HTTPException(status_code=400, detail="No id_token from Google")
    google_user = await verify_google_token(id_token)
    user = db.query(User).filter(
        (User.google_id == google_user["id"]) | (User.email == google_user["email"])
    ).first()
    if not user:
        user = User(
            name=google_user["name"],
            email=google_user["email"],
            google_id=google_user["id"],
            token_balance=0,
            email_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.google_id:
        user.google_id = google_user["id"]
        db.commit()
    token = create_access_token({"sub": str(user.id)})
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance}, "token": token}

@app.get("/api/auth/github")
def github_auth_url():
    if not GITHUB_CLIENT_ID:
        return {"url": None, "error": "GitHub OAuth not configured"}
    from urllib.parse import urlencode
    params = urlencode({
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": "https://glbtoken.com/auth/oauth-callback.html?provider=github",
        "scope": "user:email",
    })
    return {"url": f"https://github.com/login/oauth/authorize?{params}"}

@app.post("/api/auth/github/callback")
async def github_callback(req: GithubAuthRequest, db: Session = Depends(get_db)):
    try:
        github_user = await verify_github_code(req.code)
    except Exception as e:
        raise HTTPException(status_code=400, detail="GitHub login failed. Please try again.")
    user = db.query(User).filter(
        (User.github_id == github_user["id"]) | (User.email == github_user["email"])
    ).first()
    if not user:
        user = User(
            name=github_user["name"],
            email=github_user["email"],
            github_id=github_user["id"],
            token_balance=0,
            email_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.github_id:
        user.github_id = github_user["id"]
        db.commit()
    token = create_access_token({"sub": str(user.id)})
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance}, "token": token}

# ── Auth0 Routes (production-grade auth) ──
class Auth0LoginRequest(BaseModel):
    token: str

@app.get("/api/auth/auth0/config")
def auth0_config():
    """Return Auth0 public config for frontend. Gracefully disabled if unconfigured."""
    return get_auth0_config()

@app.post("/api/auth/send-code")
@limiter.limit("5/minute")
async def send_code(request: Request, body: dict = Body(...), db: Session = Depends(get_db)):
    """Send a verification code via Auth0 Passwordless Email to the given email."""
    email = body.get("email", "").lower().strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email required")
    if not is_auth0_configured():
        raise HTTPException(status_code=400, detail="Auth0 not configured")
    try:
        send_passwordless_code(email)
        return {"sent": True, "email": email}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/verify-code")
@limiter.limit("10/minute")
async def verify_code(request: Request, body: dict = Body(...), db: Session = Depends(get_db)):
    """Verify a code from Auth0 Passwordless Email, create/login user, return JWT."""
    email = body.get("email", "").lower().strip()
    code = body.get("code", "").strip()
    if not email or not code:
        raise HTTPException(status_code=400, detail="Email and code required")
    if not is_auth0_configured():
        raise HTTPException(status_code=400, detail="Auth0 not configured")
    try:
        tokens = verify_passwordless_code(email, code)
        payload = verify_auth0_token(tokens["id_token"])
        user_info = get_user_info(payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid or expired code. Please try again.")
    
    # Find or create user
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            name=user_info.get("name", email.split("@")[0]),
            email=email,
            password_hash=None,
            token_balance=0,
            email_verified=True,
            is_admin=(db.query(User).count() == 0),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Sync to New API (non-blocking)
        try:
            newapi_user = await create_newapi_user(email=email, name=user.name, quota=0)
            if newapi_user and isinstance(newapi_user, dict) and newapi_user.get("id"):
                user.newapi_user_id = newapi_user["id"]
                db.commit()
        except Exception as e:
            print(f"⚠️ New API sync failed on verify-code: {e}")
    else:
        user.email_verified = True
        db.commit()
    
    jwt_token = create_access_token({"sub": str(user.id)})
    return {
        "token": jwt_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "token_balance": user.token_balance,
        },
    }

@app.post("/api/auth/send-sms-code")
@limiter.limit("5/minute")
async def send_sms_code_endpoint(request: Request, body: dict = Body(...)):
    """Send a verification code via SMS using Auth0 Passwordless SMS."""
    phone = body.get("phone", "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    if not is_auth0_configured():
        raise HTTPException(status_code=400, detail="Auth0 not configured")
    try:
        send_sms_code(phone)
        return {"sent": True, "phone": phone}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/verify-sms-code")
@limiter.limit("10/minute")
async def verify_sms_code_endpoint(request: Request, body: dict = Body(...), db: Session = Depends(get_db)):
    """Verify SMS code, create/login user, return JWT."""
    phone = body.get("phone", "").strip()
    code = body.get("code", "").strip()
    if not phone or not code:
        raise HTTPException(status_code=400, detail="Phone and code required")
    if not is_auth0_configured():
        raise HTTPException(status_code=400, detail="Auth0 not configured")
    try:
        tokens = verify_sms_code(phone, code)
        payload = verify_auth0_token(tokens["id_token"])
        user_info = get_user_info(payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid or expired code. Please try again.")
    
    email = user_info.get("email", f"{phone}@phone.glbtoken.io")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            name=user_info.get("name", phone),
            email=email,
            password_hash=None,
            token_balance=0,
            email_verified=True,
            is_admin=(db.query(User).count() == 0),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        try:
            newapi_user = await create_newapi_user(email=email, name=user.name, quota=0)
            if newapi_user and isinstance(newapi_user, dict) and newapi_user.get("id"):
                user.newapi_user_id = newapi_user["id"]
                db.commit()
        except Exception as e:
            print(f"⚠️ New API sync failed on verify-sms-code: {e}")
    else:
        user.email_verified = True
        db.commit()
    
    jwt_token = create_access_token({"sub": str(user.id)})
    return {
        "token": jwt_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "token_balance": user.token_balance,
        },
    }

@app.post("/api/auth/auth0/login")
async def auth0_login(req: Auth0LoginRequest, db: Session = Depends(get_db)):
    """Verify Auth0 ID token, create/link user, return GlbTOKEN JWT."""
    if not is_auth0_configured():
        raise HTTPException(status_code=400, detail="Auth0 not configured")

    try:
        payload = verify_auth0_token(req.token)
        info = get_user_info(payload)
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Auth0 login failed. Invalid token.")
    # Find or create user by Auth0 sub
    user = db.query(User).filter(
        (User.email == info["email"]) | (User.email == "" and 1 == 0)
    ).first()

    if not user and info.get("sub"):
        user = db.query(User).filter(User.google_id == info["sub"]).first()

    if not user and info["email"]:
        user = db.query(User).filter(User.email == info["email"]).first()

    if user:
        if not user.google_id:
            user.google_id = info["sub"]
        user.email_verified = user.email_verified or info["email_verified"]
        db.commit()
    else:
        user = User(
            name=info["name"],
            email=info["email"],
            google_id=info["sub"],
            token_balance=0,
            email_verified=info["email_verified"],
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        try:
            await create_newapi_user(email=info["email"], name=info["name"], quota=0)
        except Exception as e:
            print(f"⚠️ New API sync failed for Auth0 user: {e}")

    token = create_access_token({"sub": str(user.id)})
    return {
        "user": {
            "id": user.id, "name": user.name, "email": user.email,
            "token_balance": user.token_balance, "picture": info.get("picture", ""),
        },
        "token": token,
    }

@app.post("/api/auth/auth0/password-login")
@limiter.limit("10/minute")
async def auth0_password_login_endpoint(request: Request, db: Session = Depends(get_db)):
    """Email/password login via Auth0 Resource Owner Password Grant."""
    if not is_auth0_configured():
        raise HTTPException(status_code=400, detail="Auth0 not configured")
    body = await request.json()
    email = body.get("email", "")
    password = body.get("password", "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")
    try:
        tokens = auth0_password_login(email, password)
        payload = verify_auth0_token(tokens["id_token"])
        info = get_user_info(payload)
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Auth0 login failed. Invalid token.")

    user = db.query(User).filter(User.email == info["email"]).first()
    if user:
        if not user.google_id:
            user.google_id = info["sub"]
        db.commit()
    else:
        user = User(
            name=info["name"], email=info["email"],
            google_id=info["sub"], token_balance=0,
            email_verified=info["email_verified"],
        )
        db.add(user); db.commit(); db.refresh(user)
        try:
            await create_newapi_user(email=info["email"], name=info["name"], quota=0)
        except Exception as e:
            print(f"⚠️ New API sync failed for Auth0 password user: {e}")

    jwt_token = create_access_token({"sub": str(user.id)})
    return {
        "user": {"id": user.id, "name": user.name, "email": user.email,
                 "token_balance": user.token_balance, "picture": info.get("picture", "")},
        "token": jwt_token,
    }

@app.post("/api/auth/auth0/signup")
@limiter.limit("5/minute")
async def auth0_signup_endpoint(request: Request, db: Session = Depends(get_db)):
    """Register via Auth0 Database Connection, then auto-login."""
    if not is_auth0_configured():
        raise HTTPException(status_code=400, detail="Auth0 not configured")
    body = await request.json()
    name = body.get("name", "")
    email = body.get("email", "")
    password = body.get("password", "")
    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="Name, email, and password required")

    try:
        auth0_signup(email, password, name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Signup failed. Please try again.")

    try:
        tokens = auth0_password_login(email, password)
        payload = verify_auth0_token(tokens["id_token"])
        info = get_user_info(payload)
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Account created but login failed.")

    user = User(
        name=info["name"], email=info["email"],
        google_id=info["sub"], token_balance=0,
        email_verified=info["email_verified"],
    )
    db.add(user); db.commit(); db.refresh(user)
    try:
        await create_newapi_user(email=info["email"], name=info["name"], quota=0)
    except Exception as e:
        print(f"⚠️ New API sync failed for Auth0 signup user: {e}")

    jwt_token = create_access_token({"sub": str(user.id)})
    return {
        "user": {"id": user.id, "name": user.name, "email": user.email,
                 "token_balance": user.token_balance, "picture": info.get("picture", "")},
        "token": jwt_token,
    }

@app.get("/api/auth/auth0/social-url")
def auth0_social_url(provider: str = Query(...)):
    """Get the Auth0 authorize URL for a social login provider."""
    if not is_auth0_configured():
        raise HTTPException(status_code=400, detail="Auth0 not configured")
    redirect_uri = "https://glbtoken.com/auth/callback.html"
    url = get_social_login_url(provider, redirect_uri)
    if not url:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
    return {"url": url, "redirect_uri": redirect_uri}

# ── User Profile ──
@app.get("/api/auth/me")
def get_me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "country": user.country,
        "token_balance": user.token_balance,
        "total_spent": user.total_spent,
        "email_verified": user.email_verified,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

# ── Email Verification ──
@app.post("/api/auth/send-verification")
@limiter.limit("5/minute")
def send_verification(req: OptionalEmailRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    email = req.email or user.email
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    otp = str(random.randint(100000, 999999))
    user.email_otp = otp
    user.email_otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.commit()
    sent = send_email(email, "Verify your GlbTOKEN email",
        f"Your verification code is: {otp}\n\nIt expires in 10 minutes.\n\n- GlbTOKEN Team")
    return {"status": "sent" if sent else "email_unavailable", "email": email}

@app.post("/api/auth/verify-email")
def verify_email(req: VerifyEmailRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    if user.email_otp != req.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    if not user.email_otp_expiry or now > user.email_otp_expiry:
        raise HTTPException(status_code=400, detail="OTP expired")
    user.email_verified = True
    user.email_otp = None
    user.email_otp_expiry = None
    db.commit()
    return {"status": "verified"}

# ── Password Management ──
@app.put("/api/user/password")
def change_password(req: ChangePasswordRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.password_hash or not verify_password(req.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password too short")
    user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"status": "password_updated"}

@app.post("/api/auth/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        return {"status": "sent"}  # Don't reveal if email exists
    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()
    sent = send_email(user.email, "Reset your GlbTOKEN password",
        f"Reset token: {token}\n\nGo to: https://glbtoken.com/reset-password\nPaste the token above.\nIt expires in 1 hour.\n\n- GlbTOKEN Team")
    return {"status": "sent" if sent else "email_unavailable"}

@app.post("/api/auth/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == req.token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    now = datetime.now(timezone.utc)
    if not user.reset_token_expiry or now > user.reset_token_expiry:
        raise HTTPException(status_code=400, detail="Reset token expired")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password too short")
    user.password_hash = hash_password(req.new_password)
    user.reset_token = None
    user.reset_token_expiry = None
    db.commit()
    return {"status": "password_reset"}

# ── Dashboard Routes ──
@app.get("/api/dashboard")
async def get_dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Usage by model (last 7 days)
    usage = db.query(Transaction.model_used, func.sum(Transaction.tokens)).filter(
        Transaction.user_id == user.id,
        Transaction.type == "consumption",
    ).group_by(Transaction.model_used).all()
    
    # Recent transactions
    recent = db.query(Transaction).filter(
        Transaction.user_id == user.id
    ).order_by(desc(Transaction.created_at)).limit(5).all()
    
    # API key count
    key_count = db.query(ApiKey).filter(
        ApiKey.user_id == user.id, ApiKey.is_active == True
    ).count()
    
    # ── New API usage data ──
    newapi_usage = {}
    newapi_connected = False
    try:
        if user.newapi_user_id:
            newapi_usage = await get_usage_today(user.newapi_user_id)
            if newapi_usage and "error" not in newapi_usage:
                newapi_connected = True
    except Exception as e:
        print(f"⚠️ New API usage fetch failed: {e}")
    
    # Calculate active days from registration
    days_active = 0
    if user.created_at:
        days_active = (datetime.now(timezone.utc) - user.created_at).days or 1
    
    # Total consumption from local DB (fallback when New API not connected)
    total_consumption = db.query(func.sum(Transaction.tokens)).filter(
        Transaction.user_id == user.id,
        Transaction.type == "consumption"
    ).scalar() or 0
    
    return {
        "token_balance": user.token_balance,
        "total_spent": user.total_spent,
        "models_used": len(usage),
        "api_keys_active": key_count,
        "days_active": days_active,
        "total_tokens_consumed": float(total_consumption),
        "newapi_connected": newapi_connected,
        "usage_by_model": [
            {"model": m[0] or "Unknown", "tokens": float(m[1])} for m in usage
        ],
        "usage_from_newapi": newapi_usage,
        "recent_activity": [
            {
                "type": t.type,
                "model": t.model_used,
                "tokens": t.tokens,
                "payment_method": t.payment_method,
                "amount": t.amount,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in recent
        ],
        "newapi": newapi_usage,
    }

# ── API Key Routes ──
@app.get("/api/keys")
def list_keys(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    keys = db.query(ApiKey).filter(ApiKey.user_id == user.id).order_by(desc(ApiKey.created_at)).all()
    return [
        {
            "id": k.id,
            "name": k.name,
            "key": k.key[:12] + "••••••••" + k.key[-4:],
            "key_prefix": k.key[:12],
            "permissions": k.permissions,
            "is_active": k.is_active,
            "request_count": k.request_count,
            "last_used": k.last_used.isoformat() if k.last_used else None,
            "created_at": k.created_at.isoformat() if k.created_at else None,
        }
        for k in keys
    ]

@app.post("/api/keys")
def create_key(req: ApiKeyCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Limit to 10 active keys
    active_count = db.query(ApiKey).filter(
        ApiKey.user_id == user.id, ApiKey.is_active == True
    ).count()
    if active_count >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 active API keys")
    
    key = ApiKey(
        user_id=user.id,
        key=generate_api_key(),
        name=req.name,
        permissions=req.permissions,
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return {
        "id": key.id,
        "name": key.name,
        "key": key.key,  # Full key shown once
        "permissions": key.permissions,
        "created_at": key.created_at.isoformat(),
    }

@app.put("/api/keys/{key_id}")
def update_key(key_id: int, req: ApiKeyUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    if req.name is not None: key.name = req.name
    if req.permissions is not None: key.permissions = req.permissions
    if req.is_active is not None: key.is_active = req.is_active
    db.commit()
    return {"status": "updated"}

@app.delete("/api/keys/{key_id}")
def delete_key(key_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    db.delete(key)
    db.commit()
    return {"status": "deleted"}

# ── Transaction Routes ──
@app.get("/api/transactions")
def list_transactions(
    type: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(Transaction).filter(Transaction.user_id == user.id)
    if type:
        q = q.filter(Transaction.type == type)
    total = q.count()
    items = q.order_by(desc(Transaction.created_at)).offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [
            {
                "id": t.id,
                "type": t.type,
                "amount": t.amount,
                "currency": t.currency,
                "payment_method": t.payment_method,
                "model_used": t.model_used,
                "tokens": t.tokens,
                "status": t.status,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in items
        ],
    }

@app.post("/api/topup")
async def topup(req: TopupRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tokens = int(req.amount * 1000)  # 1 USD = 1000 tokens
    user.token_balance += tokens
    user.total_spent += req.amount
    
    tx = Transaction(
        user_id=user.id,
        type="deposit",
        amount=req.amount,
        currency=req.currency,
        payment_method=req.payment_method,
        tokens=tokens,
        status="completed",
    )
    db.add(tx)
    db.commit()
    
    # ── Sync quota to New API ──
    try:
        if user.newapi_user_id:
            await add_user_quota(user.newapi_user_id, tokens)
    except Exception as e:
        print(f"⚠️ New API quota sync failed: {e}")
    
    return {
        "status": "success",
        "tokens_added": tokens,
        "new_balance": user.token_balance,
    }

# ── Paystack Payment ──
PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")
PAYSTACK_PUBLIC_KEY = os.getenv("PAYSTACK_PUBLIC_KEY", "")

@app.post("/api/payments/paystack/initialize")
def paystack_initialize(req: InitiatePaymentRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not PAYSTACK_SECRET_KEY:
        raise HTTPException(status_code=400, detail="Paystack not configured")
    import httpx
    amount_kobo = int(req.amount * 100)  # Paystack uses kobo (cents)
    resp = httpx.post(
        "https://api.paystack.co/transaction/initialize",
        json={
            "email": req.email or user.email,
            "amount": amount_kobo,
            "currency": "GHS" if req.currency == "GHS" else "USD",
            "metadata": {"user_id": user.id, "payment_method": "paystack"},
            "callback_url": "https://damgeed.github.io/glbtoken/#dashboard",
        },
        headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}", "Content-Type": "application/json"},
    )
    data = resp.json()
    if not data.get("status"):
        raise HTTPException(status_code=400, detail=data.get("message", "Paystack init failed"))
    # Create pending transaction
    tx = Transaction(
        user_id=user.id, type="deposit", amount=req.amount, currency=req.currency,
        payment_method="paystack", payment_ref=data["data"]["reference"],
        tokens=0, status="pending",
    )
    db.add(tx); db.commit()
    return {"authorization_url": data["data"]["authorization_url"], "reference": data["data"]["reference"]}

@app.post("/api/payments/paystack/verify")
def paystack_verify(reference: str = Body(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not PAYSTACK_SECRET_KEY:
        raise HTTPException(status_code=400, detail="Paystack not configured")
    import httpx
    resp = httpx.get(
        f"https://api.paystack.co/transaction/verify/{reference}",
        headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"},
    )
    data = resp.json()
    if not data.get("status") or data["data"]["status"] != "success":
        raise HTTPException(status_code=400, detail="Payment not successful")
    tx = db.query(Transaction).filter(Transaction.payment_ref == reference).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.status == "completed":
        return {"status": "already_processed", "tokens_added": tx.tokens}
    amount = data["data"]["amount"] / 100  # Convert from kobo
    tokens = int(amount * 1000)
    tx.status = "completed"
    tx.tokens = tokens
    tx.amount = amount
    user.token_balance += tokens
    user.total_spent += amount
    db.commit()
    return {"status": "success", "tokens_added": tokens, "new_balance": user.token_balance}

# ── Stripe Payment ──
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

@app.post("/api/payments/stripe/create-checkout")
def stripe_create_checkout(req: InitiatePaymentRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=400, detail="Stripe not configured")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    tokens = int(req.amount * 1000)
    session = stripe_lib.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": req.currency.lower(),
                "product_data": {"name": f"{tokens:,} GlbTOKEN"},
                "unit_amount": int(req.amount * 100),
            },
            "quantity": 1,
        }],
        customer_email=req.email or user.email,
        metadata={"user_id": str(user.id), "tokens": str(tokens)},
        success_url="https://damgeed.github.io/glbtoken/#dashboard?payment=success",
        cancel_url="https://damgeed.github.io/glbtoken/#plans",
    )
    tx = Transaction(
        user_id=user.id, type="deposit", amount=req.amount, currency=req.currency,
        payment_method="stripe", payment_ref=session.id,
        tokens=0, status="pending",
    )
    db.add(tx); db.commit()
    return {"url": session.url, "session_id": session.id}

@app.post("/api/payments/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=400, detail="Webhook secret not configured")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe_lib.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = int(session["metadata"]["user_id"])
        tokens = int(session["metadata"]["tokens"])
        amount = session["amount_total"] / 100
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.token_balance += tokens
            user.total_spent += amount
        tx = db.query(Transaction).filter(Transaction.payment_ref == session["id"]).first()
        if tx:
            tx.status = "completed"
            tx.tokens = tokens
            tx.amount = amount
        db.commit()
    return {"status": "ok"}

# ── Crypto Payment ──
CRYPTO_WALLET_ADDRESSES = {
    "USDT_TRC20": os.getenv("CRYPTO_USDT_TRC20", ""),
    "USDT_ERC20": os.getenv("CRYPTO_USDT_ERC20", ""),
    "BTC": os.getenv("CRYPTO_BTC", ""),
    "ETH": os.getenv("CRYPTO_ETH", ""),
}

TRON_USDT_ADDRESS = os.getenv("TRON_USDT_ADDRESS", "")
ETH_USDT_ADDRESS = os.getenv("ETH_USDT_ADDRESS", "")
BTC_ADDRESS = os.getenv("BTC_ADDRESS", "")

@app.get("/api/payments/crypto/addresses")
def get_crypto_addresses(user: User = Depends(get_current_user)):
    if not any(CRYPTO_WALLET_ADDRESSES.values()):
        raise HTTPException(status_code=500, detail="Crypto payment not configured")
    return {
        "addresses": [
            {"asset": k, "network": k.split("_")[1] if "_" in k else k, "address": v}
            for k, v in CRYPTO_WALLET_ADDRESSES.items()
        ]
    }

@app.post("/api/payments/crypto/create")
def create_crypto_payment(req: InitiatePaymentRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    asset = req.payment_method.upper()  # USDT_TRC20, BTC, ETH
    address = CRYPTO_WALLET_ADDRESSES.get(asset)
    if not address:
        raise HTTPException(status_code=400, detail=f"Unsupported crypto: {asset}")
    ref = f"crypto_{user.id}_{secrets.token_hex(8)}"
    tokens = int(req.amount * 1000)
    tx = Transaction(
        user_id=user.id, type="deposit", amount=req.amount, currency=asset,
        payment_method=f"crypto_{asset.lower()}", payment_ref=ref,
        tokens=tokens, status="pending",
    )
    db.add(tx); db.commit()
    rate = {"USDT_TRC20": 1.0, "USDT_ERC20": 1.0, "BTC": 85000, "ETH": 3500}.get(asset, 1.0)
    crypto_amount = round(req.amount / rate, 6)
    return {
        "reference": ref,
        "address": address,
        "asset": asset,
        "crypto_amount": crypto_amount,
        "usd_amount": req.amount,
        "tokens": tokens,
        "instructions": f"Send exactly {crypto_amount} {asset} to the address above. Your tokens will be credited after 1 network confirmation.",
    }

# ── API Proxy (via New API) ──

class ProxyChatRequest(BaseModel):
    model: str
    messages: list
    max_tokens: int = 4096
    temperature: float = 0.7

@app.post("/api/proxy/chat")
async def proxy_chat(req: ProxyChatRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Estimate cost
    input_chars = sum(len(m.get("content", "")) for m in req.messages)
    input_tokens = max(1, input_chars // 4)
    output_tokens = min(req.max_tokens, 4096)
    cost_tokens = int((input_tokens + output_tokens) * 0.002)  # ~$0.002/1K tokens
    if user.token_balance < cost_tokens:
        raise HTTPException(status_code=402, detail=f"Insufficient balance. Need {cost_tokens} tokens, have {user.token_balance}")
    
    # Route through New API if configured, otherwise fallback to Fallback
    newapi_key = user.newapi_token
    newapi_url = os.getenv("NEW_API_BASE_URL", "")
    
    import httpx
    headers = {"Content-Type": "application/json"}
    
    if newapi_key and newapi_url:
        # Route via New API
        headers["Authorization"] = f"Bearer {newapi_key}"
        api_endpoint = f"{newapi_url}/v1/chat/completions"
    else:
        # Fallback: route via Fallback directly
        fallback_key = os.getenv("FALLBACK_API_KEY", "")
        if not fallback_key:
            raise HTTPException(status_code=400, detail="No AI routing configured. Set NEW_API_BASE_URL or FALLBACK_API_KEY")
        headers = {
            "Authorization": f"Bearer {fallback_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://glbtoken.com",
            "X-Title": "GlbTOKEN",
        }
        fallback_url = os.getenv("FALLBACK_API_URL", "")
        if not fallback_url:
            raise HTTPException(status_code=400, detail="No AI routing configured. Set NEW_API_BASE_URL or FALLBACK_API_URL")
        api_endpoint = f"{fallback_url.rstrip('/')}/v1/chat/completions"
    
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            api_endpoint,
            headers=headers,
            json={
                "model": req.model,
                "messages": req.messages,
                "max_tokens": req.max_tokens,
                "temperature": req.temperature,
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="AI API error. Please try again later.")
        result = resp.json()
    
    # Deduct tokens
    actual_tokens_cost = max(1, cost_tokens)
    user.token_balance -= actual_tokens_cost
    tx = Transaction(
        user_id=user.id, type="consumption", amount=0,
        payment_method="api_proxy", model_used=req.model,
        tokens=actual_tokens_cost, status="completed",
    )
    db.add(tx)
    db.commit()
    result["tokens_used"] = actual_tokens_cost
    result["balance_remaining"] = user.token_balance
    return result

# ── Models Route ──
@app.get("/api/models")
def list_models(provider: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(AIModel).filter(AIModel.is_active == True)
    if provider:
        q = q.filter(AIModel.provider == provider)
    models = q.order_by(AIModel.provider, AIModel.model_id).all()
    return [
        {
            "id": m.id,
            "model_id": m.model_id,
            "name": m.name,
            "provider": m.provider,
            "context_length": m.context_length,
            "prompt_price": m.prompt_price,
            "completion_price": m.completion_price,
            "category": m.category,
            "version": m.version,
            "description": m.description,
        }
        for m in models
    ]

@app.get("/api/models/providers")
def list_providers(db: Session = Depends(get_db)):
    results = db.query(
        AIModel.provider,
        func.count(AIModel.id),
        func.min(AIModel.prompt_price),
        func.max(AIModel.prompt_price),
    ).filter(AIModel.is_active == True).group_by(AIModel.provider).all()
    return [
        {
            "name": r[0],
            "count": r[1],
            "min_price": float(r[2]) if r[2] else 0,
            "max_price": float(r[3]) if r[3] else 0,
        }
        for r in results
    ]

# ── User Profile ──
@app.get("/api/user/profile")
def get_profile(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "country": user.country,
        "token_balance": user.token_balance,
        "total_spent": user.total_spent,
        "email_verified": user.email_verified,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

@app.put("/api/user/profile")
def update_profile(req: ProfileUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if req.name is not None: user.name = req.name
    if req.country is not None: user.country = req.country
    db.commit()
    return {"status": "updated", "name": user.name, "country": user.country}

# ── Admin Endpoints ──
@app.get("/api/admin/users")
def admin_list_users(page: int = 1, per_page: int = 20, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    total = db.query(User).count()
    users = db.query(User).order_by(desc(User.created_at)).offset((page-1)*per_page).limit(per_page).all()
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "users": [{
            "id": u.id, "name": u.name, "email": u.email, "country": u.country,
            "token_balance": u.token_balance, "total_spent": u.total_spent,
            "email_verified": u.email_verified, "created_at": u.created_at.isoformat() if u.created_at else None
        } for u in users]
    }

@app.post("/api/admin/adjust-balance")
def admin_adjust_balance(req: AdminBalanceRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    target = db.query(User).filter(User.id == req.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.token_balance = max(0, target.token_balance + req.tokens)
    tx = Transaction(
        user_id=target.id, type="deposit" if req.tokens > 0 else "consumption",
        tokens=req.tokens, status="completed",
        payment_method=f"admin_adjustment: {req.reason}"
    )
    db.add(tx)
    db.commit()
    return {"status": "adjusted", "new_balance": target.token_balance}

@app.get("/api/admin/transactions")
def admin_transactions(page: int = 1, per_page: int = 20, status_filter: Optional[str] = None,
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    q = db.query(Transaction)
    if status_filter: q = q.filter(Transaction.status == status_filter)
    total = q.count()
    txs = q.order_by(desc(Transaction.created_at)).offset((page-1)*per_page).limit(per_page).all()
    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [{
            "id": t.id, "user_id": t.user_id, "type": t.type, "amount": t.amount,
            "currency": t.currency, "payment_method": t.payment_method,
            "tokens": t.tokens, "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None
        } for t in txs]
    }

# ── Token Rate Configurator ──
@app.get("/api/admin/rates")
def get_rates(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    # Token rate stored as a simple KV in DB or config
    from database import SessionLocal as _s
    # Return current pricing strategy
    return {
        "base_token_rate": 0.001,  # $0.001 per token
        "markup_multiplier": 2.0,  # 2x on upstream costs
        "packages": [
            {"name": "Starter", "price": 5, "tokens": 5000},
            {"name": "Professional", "price": 20, "tokens": 22000},
            {"name": "Enterprise", "price": 100, "tokens": 120000},
        ],
        "minimum_topup": 2.0,
    }

# ── Provider Status ──
@app.get("/api/admin/providers")
def provider_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    providers = db.query(
        AIModel.provider,
        func.count(AIModel.id).label("model_count"),
        func.min(AIModel.prompt_price).label("min_price"),
    ).filter(AIModel.is_active == True).group_by(AIModel.provider).all()
    return [{
        "name": p[0], "models": p[1], "min_price": float(p[2]) if p[2] else 0,
        "status": "operational", "latency_ms": round(150 + (hash(p[0]) % 350), 0)
    } for p in providers]

# ── Seeding ──
def auto_pull_models():
    """Auto-fetch latest models from Fallback API and merge into DB."""
    from database import SessionLocal
    import httpx
    print("🔄 Auto-pulling models from Fallback...")
    try:
        # Try New API's admin endpoint first, then fallback URL
        newapi_url = os.getenv("NEW_API_BASE_URL", "")
        fallback_url = os.getenv("FALLBACK_API_URL", "")
        models_url = ""
        headers = {"Content-Type": "application/json"}
        
        if newapi_url:
            # Use New API's model endpoint (no auth needed for public models)
            models_url = f"{newapi_url.rstrip('/')}/api/model"
        elif fallback_url:
            models_url = f"{fallback_url.rstrip('/')}/v1/models"
            admin_key = os.getenv("FALLBACK_API_KEY", "")
            if admin_key:
                headers["Authorization"] = f"Bearer {admin_key}"
        else:
            print("⚠️ No Fallback API URL configured (set FALLBACK_API_URL or NEW_API_BASE_URL). Using seeded models only.")
            return
        
        resp = httpx.get(models_url, headers=headers, timeout=30)
        if resp.status_code != 200:
            print(f"⚠️ Fallback API returned {resp.status_code}")
            return
        data = resp.json()
        if not data.get("data"):
            print("⚠️ No models data from Fallback")
            return
        db = SessionLocal()
        count = 0
        for m in data["data"]:
            model_id = m.get("id", "")
            if not model_id:
                continue
            pricing = m.get("pricing", {}) or {}
            prompt_price = float(pricing.get("prompt", 0)) if pricing.get("prompt") else 0.0
            completion_price = float(pricing.get("completion", 0)) if pricing.get("completion") else 0.0
            context_length = int(m.get("context_length", 4096) or 4096)
            name = m.get("name", model_id.split("/")[-1] if "/" in model_id else model_id)
            provider = "Other"
            if "/" in model_id:
                company = model_id.split("/")[0]
                provider_map = {
                    "openai": "OpenAI", "anthropic": "Anthropic", "google": "Google",
                    "meta-llama": "Meta Llama", "deepseek": "DeepSeek", "mistralai": "Mistral",
                    "qwen": "Qwen", "cohere": "Cohere", "perplexity": "Perplexity",
                    "x-ai": "X AI", "amazon": "Amazon", "microsoft": "Microsoft",
                    "nvidia": "Nvidia", "nousresearch": "NousResearch"
                }
                provider = provider_map.get(company, company.title())
            # Check if model already exists
            existing = db.query(AIModel).filter(AIModel.model_id == model_id).first()
            if existing:
                # Update pricing/context in case they changed
                existing.prompt_price = prompt_price
                existing.completion_price = completion_price
                existing.context_length = context_length
            else:
                db.add(AIModel(
                    model_id=model_id, name=name, provider=provider,
                    context_length=context_length,
                    prompt_price=prompt_price, completion_price=completion_price,
                    version="", category="Auto"
                ))
                count += 1
        db.commit()
        db.close()
        print(f"✅ Auto-pull complete: {count} new models added")
    except Exception as e:
        print(f"❌ Auto-pull error: {e}")

def seed_models():
    from database import SessionLocal
    db = SessionLocal()
    if db.query(AIModel).count() > 0:
        db.close()
        return
    
    models = [
        # OpenAI
        AIModel(model_id="openai/gpt-5.5-pro", name="GPT-5.5 Pro", provider="OpenAI", context_length=1050000, prompt_price=0.00003, completion_price=0.00012, version="5.5", category="Flagship"),
        AIModel(model_id="openai/gpt-5.5", name="GPT-5.5", provider="OpenAI", context_length=1050000, prompt_price=0.000005, completion_price=0.00002, version="5.5", category="Flagship"),
        AIModel(model_id="openai/gpt-5.4", name="GPT-5.4", provider="OpenAI", context_length=272000, prompt_price=0.000008, completion_price=0.000032, version="5.4", category="Flagship"),
        AIModel(model_id="openai/gpt-5.4-nano", name="GPT-5.4 Nano", provider="OpenAI", context_length=400000, prompt_price=0.0000002, completion_price=0.0000008, version="5.4", category="Nano"),
        AIModel(model_id="openai/gpt-4o", name="GPT-4o", provider="OpenAI", context_length=128000, prompt_price=0.0000025, completion_price=0.00001, version="4o", category="Vision"),
        AIModel(model_id="openai/gpt-4o-mini", name="GPT-4o Mini", provider="OpenAI", context_length=128000, prompt_price=0.00000015, completion_price=0.0000006, version="4o-mini", category="Small"),
        AIModel(model_id="openai/o3", name="o3", provider="OpenAI", context_length=200000, prompt_price=0.00001, completion_price=0.00004, version="o3", category="Reasoning"),
        AIModel(model_id="openai/o4-mini", name="o4-mini", provider="OpenAI", context_length=200000, prompt_price=0.0000011, completion_price=0.0000044, version="o4-mini", category="Reasoning"),
        
        # Anthropic
        AIModel(model_id="anthropic/claude-sonnet-5", name="Claude Sonnet 5", provider="Anthropic", context_length=1000000, prompt_price=0.000002, completion_price=0.000008, version="5", category="Flagship"),
        AIModel(model_id="anthropic/claude-opus-4.8", name="Claude Opus 4.8", provider="Anthropic", context_length=1000000, prompt_price=0.000005, completion_price=0.00002, version="4.8", category="Flagship"),
        AIModel(model_id="anthropic/claude-fable-5", name="Claude Fable 5", provider="Anthropic", context_length=1000000, prompt_price=0.00001, completion_price=0.00004, version="5", category="Flagship"),
        AIModel(model_id="anthropic/claude-3.5-sonnet", name="Claude 3.5 Sonnet", provider="Anthropic", context_length=200000, prompt_price=0.000003, completion_price=0.000015, version="3.5", category="Vision"),
        AIModel(model_id="anthropic/claude-3-haiku", name="Claude 3 Haiku", provider="Anthropic", context_length=200000, prompt_price=0.00000025, completion_price=0.00000125, version="3", category="Small"),
        
        # Google
        AIModel(model_id="google/gemini-3.5-flash", name="Gemini 3.5 Flash", provider="Google", context_length=1048576, prompt_price=0.0000015, completion_price=0.000006, version="3.5", category="Flash"),
        AIModel(model_id="google/gemini-3.1-flash", name="Gemini 3.1 Flash", provider="Google", context_length=1048576, prompt_price=0.00000025, completion_price=0.000001, version="3.1", category="Flash"),
        AIModel(model_id="google/gemini-3-pro", name="Gemini 3 Pro", provider="Google", context_length=65536, prompt_price=0.000002, completion_price=0.000008, version="3", category="Flagship"),
        AIModel(model_id="google/gemini-2.0-flash", name="Gemini 2.0 Flash", provider="Google", context_length=1048576, prompt_price=0.0000001, completion_price=0.0000004, version="2.0", category="Flash"),
        
        # Meta Llama
        AIModel(model_id="meta-llama/llama-4-maverick", name="Llama 4 Maverick", provider="Meta Llama", context_length=1048576, prompt_price=0.00000015, completion_price=0.0000006, version="4", category="Flagship"),
        AIModel(model_id="meta-llama/llama-4-scout", name="Llama 4 Scout", provider="Meta Llama", context_length=10000000, prompt_price=0.0000001, completion_price=0.0000004, version="4", category="Small"),
        AIModel(model_id="meta-llama/llama-3.3-70b", name="Llama 3.3 70B", provider="Meta Llama", context_length=131072, prompt_price=0.0000001, completion_price=0.0000004, version="3.3", category="Large"),
        AIModel(model_id="meta-llama/llama-3.1-405b", name="Llama 3.1 405B", provider="Meta Llama", context_length=131072, prompt_price=0.000001, completion_price=0.000004, version="3.1", category="Flagship"),
        
        # DeepSeek
        AIModel(model_id="deepseek/deepseek-v4-pro", name="DeepSeek V4 Pro", provider="DeepSeek", context_length=1048576, prompt_price=0.000000435, completion_price=0.00000174, version="V4", category="Flagship"),
        AIModel(model_id="deepseek/deepseek-v4-flash", name="DeepSeek V4 Flash", provider="DeepSeek", context_length=1048576, prompt_price=0.000000089, completion_price=0.000000356, version="V4", category="Flash"),
        AIModel(model_id="deepseek/deepseek-v3.2", name="DeepSeek V3.2", provider="DeepSeek", context_length=131072, prompt_price=0.0000002288, completion_price=0.000000915, version="V3.2", category="Flagship"),
        AIModel(model_id="deepseek/deepseek-r1", name="DeepSeek R1", provider="DeepSeek", context_length=131072, prompt_price=0.00000055, completion_price=0.0000022, version="R1", category="Reasoning"),
        
        # Mistral
        AIModel(model_id="mistralai/mistral-large-2", name="Mistral Large 2", provider="Mistral", context_length=131072, prompt_price=0.000002, completion_price=0.000006, version="2", category="Flagship"),
        AIModel(model_id="mistralai/mistral-small-2603", name="Mistral Small", provider="Mistral", context_length=262144, prompt_price=0.00000015, completion_price=0.0000006, version="2603", category="Small"),
        AIModel(model_id="mistralai/mistral-medium-3-5", name="Mistral Medium 3.5", provider="Mistral", context_length=262144, prompt_price=0.0000015, completion_price=0.000006, version="3.5", category="Medium"),
        
        # Qwen
        AIModel(model_id="qwen/qwen3.7-plus", name="Qwen 3.7 Plus", provider="Qwen", context_length=1000000, prompt_price=0.00000032, completion_price=0.00000128, version="3.7", category="Flagship"),
        AIModel(model_id="qwen/qwen3.7-max", name="Qwen 3.7 Max", provider="Qwen", context_length=1000000, prompt_price=0.00000125, completion_price=0.000005, version="3.7", category="Flagship"),
        AIModel(model_id="qwen/qwen3.6-flash", name="Qwen 3.6 Flash", provider="Qwen", context_length=1000000, prompt_price=0.0000001875, completion_price=0.00000075, version="3.6", category="Flash"),
        AIModel(model_id="qwen/qwen-2.5-72b", name="Qwen 2.5 72B", provider="Qwen", context_length=131072, prompt_price=0.00000035, completion_price=0.0000014, version="2.5", category="Large"),
        AIModel(model_id="qwen/qwen-2.5-coder-32b", name="Qwen 2.5 Coder 32B", provider="Qwen", context_length=131072, prompt_price=0.00000035, completion_price=0.0000014, version="2.5", category="Code"),
        
        # Perplexity
        AIModel(model_id="perplexity/sonar-pro", name="Sonar Pro", provider="Perplexity", context_length=200000, prompt_price=0.000003, completion_price=0.000015, version="Pro", category="Search"),
        AIModel(model_id="perplexity/sonar-reasoning-pro", name="Sonar Reasoning Pro", provider="Perplexity", context_length=128000, prompt_price=0.000002, completion_price=0.000008, version="Pro", category="Reasoning"),
        AIModel(model_id="perplexity/sonar-deep-research", name="Sonar Deep Research", provider="Perplexity", context_length=128000, prompt_price=0.000002, completion_price=0.000008, version="Deep", category="Research"),
        
        # X AI
        AIModel(model_id="x-ai/grok-4.20", name="Grok 4.20", provider="X AI", context_length=2000000, prompt_price=0.00000125, completion_price=0.000005, version="4.20", category="Flagship"),
        AIModel(model_id="x-ai/grok-4.3", name="Grok 4.3", provider="X AI", context_length=1000000, prompt_price=0.00000125, completion_price=0.000005, version="4.3", category="Flagship"),
        
        # Cohere
        AIModel(model_id="cohere/command-a", name="Command A", provider="Cohere", context_length=256000, prompt_price=0.0000025, completion_price=0.00001, version="A", category="Flagship"),
        AIModel(model_id="cohere/command-r-plus", name="Command R+", provider="Cohere", context_length=128000, prompt_price=0.0000025, completion_price=0.00001, version="R+", category="Flagship"),
        
        # Amazon
        AIModel(model_id="amazon/nova-pro-v1", name="Nova Pro", provider="Amazon", context_length=300000, prompt_price=0.0000008, completion_price=0.0000032, version="Pro", category="Flagship"),
        AIModel(model_id="amazon/nova-lite-v1", name="Nova Lite", provider="Amazon", context_length=300000, prompt_price=0.00000006, completion_price=0.00000024, version="Lite", category="Small"),
        AIModel(model_id="amazon/nova-micro-v1", name="Nova Micro", provider="Amazon", context_length=128000, prompt_price=0.000000035, completion_price=0.00000014, version="Micro", category="Small"),
        
        # Microsoft
        AIModel(model_id="microsoft/phi-4", name="Phi-4", provider="Microsoft", context_length=16384, prompt_price=0.00000007, completion_price=0.00000028, version="4", category="Small"),
        
        # Nvidia
        AIModel(model_id="nvidia/nemotron-3-ultra", name="Nemotron 3 Ultra", provider="Nvidia", context_length=1000000, prompt_price=0.0000005, completion_price=0.000002, version="3", category="Flagship"),
        
        # NousResearch
        AIModel(model_id="nousresearch/hermes-4-70b", name="Hermes 4 70B", provider="NousResearch", context_length=131072, prompt_price=0.00000013, completion_price=0.00000052, version="4", category="Large"),
        AIModel(model_id="nousresearch/hermes-4-405b", name="Hermes 4 405B", provider="NousResearch", context_length=131072, prompt_price=0.000001, completion_price=0.000004, version="4", category="Flagship"),
    ]
    
    db.add_all(models)
    db.commit()
    db.close()
    print(f"✅ Seeded {len(models)} AI models")

# ── Health ──
# ── Auto-Pull Models (manual trigger) ──
@app.post("/api/models/pull")
def trigger_model_pull(authorization: str = Header(None)):
    # Extract API key from Authorization: Bearer <token>
    api_key = ""
    if authorization and authorization.startswith("Bearer "):
        api_key = authorization.removeprefix("Bearer ")
    glbtoken_secret = os.environ.get("GLBTOKEN_SECRET")
    if not glbtoken_secret or api_key != glbtoken_secret:
        raise HTTPException(status_code=403, detail="Invalid API key")
    auto_pull_models()
    return {"status": "ok", "message": "Models refreshed from Fallback"}

# ── Admin: Sync All Users to New API ──
class SyncUsersRequest(BaseModel):
    dry_run: bool = False

@app.post("/api/admin/sync-users")
@limiter.limit("2/minute")
async def admin_sync_users(
    req: SyncUsersRequest,
    request: Request,
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """Sync all existing users to New API. Admin-only. Dry-run supported.
    
    Authentication: Requires admin JWT OR api_key=GLBTOKEN_SECRET via Authorization header.
    """
    # Extract API key from Authorization: Bearer <token>
    api_key = ""
    if authorization and authorization.startswith("Bearer "):
        api_key = authorization.removeprefix("Bearer ")
    # Allow GLBTOKEN_SECRET as alternative auth (for automated calls)
    glbtoken_secret = os.environ.get("GLBTOKEN_SECRET")
    if not glbtoken_secret or api_key != glbtoken_secret:
        if not user or not user.is_admin:
            raise HTTPException(status_code=403, detail="Admin access required")

    from sync_users import run_sync as _run_sync, health_check as _sync_health

    # Check New API connectivity
    if not _sync_health():
        raise HTTPException(status_code=503, detail="New API is not reachable")

    # Count unsynced
    total = db.query(func.count(User.id)).scalar()
    unsynced = db.query(func.count(User.id)).filter(User.newapi_user_id.is_(None)).scalar()

    if req.dry_run:
        return {
            "status": "dry_run",
            "total_users": total,
            "unsynced_users": unsynced,
            "message": f"Would sync {unsynced} user(s). Run with dry_run=false to execute.",
        }

    if unsynced == 0:
        return {"status": "ok", "message": "All users already synced to New API"}

    # Run sync in a background thread so we don't block
    import threading
    result_container = {}

    def _sync_worker():
        try:
            res = _run_sync(dry_run=False, verbose=False)
            result_container["result"] = res
        except Exception as e:
            result_container["error"] = str(e)

    thread = threading.Thread(target=_sync_worker, daemon=True)
    thread.start()
    thread.join(timeout=120)  # 2 min timeout

    if "error" in result_container:
        raise HTTPException(status_code=500, detail="Sync failed. Please try again.")

    res = result_container.get("result")
    return {
        "status": "ok",
        "total_users": total,
        "synced": res.created if res else 0,
        "failed": res.failed if res else 0,
        "skipped": total - unsynced,
        "errors": (res.errors[:20] if res and res.errors else []),
        "message": f"Synced {res.created} user(s), {res.failed} failed." if res else "Sync completed",
    }

# ── Contact Form ──
@app.post("/api/contact")
@limiter.limit("3/minute")
async def contact_form(req: ContactRequest, request: Request):
    name = req.name.strip()
    email = req.email.strip()
    message = req.message.strip()
    if not name or not email or len(message) < 10:
        raise HTTPException(status_code=400, detail="Invalid form data")
    if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
        raise HTTPException(status_code=400, detail="Invalid email")
    try:
        send_email(
            to="contact@glbtoken.com",
            subject=f"[GlbTOKEN Contact] {name}",
            body=f"From: {name} ({email})\n\n{message}"
        )
    except Exception as e:
        print(f"⚠️  Contact email send failed: {e}")
    print(f"📬 Contact form: {name} <{email}>: {message[:100]}...")
    return {"status": "ok", "message": "Message received. We'll get back to you soon."}

@app.get("/api/health")
async def health():
    # Check New API connectivity
    newapi_ok = False
    try:
        newapi_ok = await health_check()
    except Exception as e:
        print(f"⚠️ Health check New API connectivity error: {e}")
    return {
        "status": "ok", "version": "1.0.0", "name": "GlbTOKEN API",
        "newapi_connected": newapi_ok,
        "newapi_url": os.getenv("NEW_API_BASE_URL", ""),
    }

if __name__ == "__main__":
    import uvicorn
    import sys
    port = int(os.getenv("PORT", 8000))
    print(f"PORT_ENV_CHECK: PORT env = |{os.getenv('PORT', 'NOT_SET')}| -> using port {port}", flush=True)
    sys.stdout.flush()
    uvicorn.run(app, host="0.0.0.0", port=port)
