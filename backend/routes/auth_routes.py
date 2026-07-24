"""GlbTOKEN — Auth Routes (register, login, OAuth, Auth0, OTP, SMS, password, profile)"""

from fastapi import APIRouter, Depends, Query, Body, Request, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone, timedelta
import secrets, json, random

from database import get_db, User, LoginEvent
from auth import (
    hash_password, verify_password, create_access_token, decode_token,
    get_current_user, get_optional_user, generate_api_key,
    verify_google_token, verify_github_code, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID
)
from newapi_integration import create_newapi_user, create_api_token
from auth0 import (
    is_configured as is_auth0_configured, get_config as get_auth0_config,
    verify_token as verify_auth0_token, get_user_info, exchange_pkce_code,
    password_login as auth0_password_login, signup as auth0_signup,
    get_social_login_url, send_passwordless_code, verify_passwordless_code,
    send_sms_code, verify_sms_code
)
from common import _400, _401, _402, _403, _404, _500, _502, _503, _not_configured, limiter, _safe_error, _url_quote, NEW_API_BASE_URL
from schemas import (
    RegisterRequest, LoginRequest, GoogleAuthRequest, GithubAuthRequest,
    Auth0LoginRequest, SendCodeRequest, VerifyCodeRequest,
    SendSmsCodeRequest, VerifySmsCodeRequest, Auth0PasswordLoginRequest,
    Auth0SignupRequest, OptionalEmailRequest, VerifyEmailRequest,
    ForgotPasswordRequest, ChangePasswordRequest, ResetPasswordRequest,
    ProfileUpdateRequest,
)

router = APIRouter()


def record_login_event(user_id: int, request: Request, success: bool, db: Session):
    """Record a login event for audit/history purposes."""
    try:
        ip_address = request.client.host if request.client else ""
        user_agent = request.headers.get("user-agent", "")
        device_type = "mobile" if any(k in user_agent.lower() for k in ["mobile", "android", "iphone", "ipad"]) else "desktop"
        event = LoginEvent(
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            device_type=device_type,
            success=success,
        )
        db.add(event)
        db.commit()
    except Exception as e:
        print(f"⚠️ Failed to record login event: {e}")
        db.rollback()


# ── Auth Routes ──

@router.post("/api/auth/register")
@limiter.limit("5/minute")
async def register(req: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    try:
        if db.query(User).filter(User.email == req.email).first():
            _400("Email already registered")
        if len(req.password) < 8:
            _400("Password must be at least 8 characters")
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
        _500("Database error. Please try again.")
    
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
        result["newapi_endpoint"] = NEW_API_BASE_URL
    
    # Record login event
    try:
        record_login_event(user.id, request, True, db)
    except Exception:
        pass
    
    return result


@router.post("/api/auth/login")
@limiter.limit("10/minute")
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not user.password_hash:
        record_login_event(0, request, False, db)
        _401("Invalid credentials")
    if not verify_password(req.password, user.password_hash):
        record_login_event(0, request, False, db)
        _401("Invalid credentials")
    record_login_event(user.id, request, True, db)
    token = create_access_token({"sub": str(user.id)})
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance, "country": user.country}, "token": token}


@router.get("/api/auth/google")
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


@router.post("/api/auth/google/callback")
@limiter.limit("10/minute")
async def google_callback(req: GoogleAuthRequest, request: Request, db: Session = Depends(get_db)):
    # Exchange authorization code for id_token
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        _not_configured("Google OAuth")
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
            _400(token_resp.json().get("error_description", "Google OAuth token exchange failed"))
        token_data = token_resp.json()
        id_token = token_data.get("id_token")
        if not id_token:
            _400("No id_token from Google")
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
    record_login_event(user.id, request, True, db)
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance}, "token": token}


@router.get("/api/auth/github")
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


@router.post("/api/auth/github/callback")
@limiter.limit("10/minute")
async def github_callback(req: GithubAuthRequest, request: Request, db: Session = Depends(get_db)):
    try:
        github_user = await verify_github_code(req.code)
    except Exception as e:
        print(f"❌ GitHub login error: {e}")
        _400(str(e))
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
    record_login_event(user.id, request, True, db)
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance}, "token": token}


# ── Auth0 Routes ──

@router.get("/api/auth/auth0/config")
def auth0_config():
    """Return Auth0 public config for frontend. Gracefully disabled if unconfigured."""
    return get_auth0_config()


@router.post("/api/auth/send-code")
@limiter.limit("5/minute")
async def send_code(request: Request, body: SendCodeRequest, db: Session = Depends(get_db)):
    """Send a verification code via Auth0 Passwordless Email to the given email."""
    email = body.email.lower().strip()
    if not email or "@" not in email:
        _400("Valid email required")
    if not is_auth0_configured():
        _not_configured("Auth0")
    try:
        send_passwordless_code(email)
        return {"sent": True, "email": email}
    except ValueError as e:
        print(f"❌ Send code error: {e}")
        _400(str(e))


@router.post("/api/auth/verify-code")
@limiter.limit("10/minute")
async def verify_code(request: Request, body: VerifyCodeRequest, db: Session = Depends(get_db)):
    """Verify a code from Auth0 Passwordless Email, create/login user, return JWT."""
    email = body.email.lower().strip()
    code = body.code.strip()
    if not email or not code:
        _400("Email and code required")
    if not is_auth0_configured():
        _not_configured("Auth0")
    try:
        tokens = verify_passwordless_code(email, code)
        payload = verify_auth0_token(tokens["id_token"])
        user_info = get_user_info(payload)
    except Exception as e:
        print(f"❌ Email verify error: {e}")
        _400(str(e))
    
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
    record_login_event(user.id, request, True, db)
    return {
        "token": jwt_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "token_balance": user.token_balance,
        },
    }


@router.post("/api/auth/send-sms-code")
@limiter.limit("5/minute")
async def send_sms_code_endpoint(request: Request, body: SendSmsCodeRequest):
    """Send a verification code via SMS using Auth0 Passwordless SMS."""
    phone = body.phone.strip()
    if not phone:
        _400("Phone number required")
    if not is_auth0_configured():
        _not_configured("Auth0")
    try:
        send_sms_code(phone)
        return {"sent": True, "phone": phone}
    except ValueError as e:
        print(f"❌ Send SMS code error: {e}")
        _400("Authentication failed. Please try again.")


@router.post("/api/auth/verify-sms-code")
@limiter.limit("10/minute")
async def verify_sms_code_endpoint(request: Request, body: VerifySmsCodeRequest, db: Session = Depends(get_db)):
    """Verify SMS code, create/login user, return JWT."""
    phone = body.phone.strip()
    code = body.code.strip()
    if not phone or not code:
        _400("Phone and code required")
    if not is_auth0_configured():
        _not_configured("Auth0")
    try:
        tokens = verify_sms_code(phone, code)
        payload = verify_auth0_token(tokens["id_token"])
        user_info = get_user_info(payload)
    except Exception as e:
        err_msg = str(e)
        print(f"❌ SMS verify error for {phone}: {err_msg}")
        _400("Verification failed. Please try again.")
    
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
    record_login_event(user.id, request, True, db)
    return {
        "token": jwt_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "token_balance": user.token_balance,
        },
    }


@router.post("/api/auth/auth0/login")
@limiter.limit("10/minute")
async def auth0_login(request: Request, req: Auth0LoginRequest, db: Session = Depends(get_db)):
    """Verify Auth0 ID token, create/link user, return GlbTOKEN JWT."""
    if not is_auth0_configured():
        _not_configured("Auth0")

    try:
        payload = verify_auth0_token(req.token)
        info = get_user_info(payload)
    except ValueError as e:
        print(f"❌ Auth0 token login error: {e}")
        _401("Auth0 login failed. Invalid token.")
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
    record_login_event(user.id, request, True, db)
    return {
        "user": {
            "id": user.id, "name": user.name, "email": user.email,
            "token_balance": user.token_balance, "picture": info.get("picture", ""),
        },
        "token": token,
    }


@router.get("/api/auth/auth0/callback")
async def auth0_callback_redirect(id_token: str = Query(...)):
    """Callback redirect endpoint for social login. Validates Auth0 id_token and redirects to frontend dashboard with JWT."""
    from starlette.responses import RedirectResponse
    if not is_auth0_configured():
        return RedirectResponse(url="https://glbtoken.com/login.html?error=Auth0+not+configured")
    from urllib.parse import quote
    try:
        payload = verify_auth0_token(id_token)
        info = get_user_info(payload)
    except ValueError as e:
        return RedirectResponse(url=f"https://glbtoken.com/login.html?error=Invalid+token:+{_safe_error(e)}")
    from database import User, get_db
    from sqlalchemy.orm import Session
    db = next(get_db())
    try:
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
    except Exception as e:
        db.close()
        return RedirectResponse(url=f"https://glbtoken.com/login.html?error=Database+error:+{_safe_error(e)}")
    try:
        from newapi_integration import create_newapi_user
        await create_newapi_user(email=info["email"], name=info["name"], quota=0)
    except Exception as e:
        print(f"⚠️ New API sync failed for Auth0 callback: {e}")
    jwt_token = create_access_token({"sub": str(user.id)})
    user_json = _url_quote(json.dumps({
        "id": user.id, "name": user.name, "email": user.email,
        "token_balance": user.token_balance, "picture": info.get("picture", ""),
    }))
    db.close()
    return RedirectResponse(url=f"https://glbtoken.com/dashboard.html?token={_url_quote(jwt_token, safe='')}&user={user_json}")


@router.get("/api/auth/auth0/pkce-callback")
async def auth0_pkce_callback(code: str = Query(...), code_verifier: str = Query(...), state: str = Query(None)):
    """Server-side PKCE callback: exchange Auth0 code for tokens, then redirect to dashboard with JWT."""
    from starlette.responses import RedirectResponse
    if not is_auth0_configured():
        return RedirectResponse(url="https://glbtoken.com/login.html?error=Auth0+not+configured")
    try:
        redirect_uri = "https://glbtoken.com/auth/callback.html"
        tokens = exchange_pkce_code(code, code_verifier, redirect_uri)
        id_token = tokens.get("id_token")
        if not id_token:
            return RedirectResponse(url="https://glbtoken.com/login.html?error=No+id_token+from+Auth0")
        payload = verify_auth0_token(id_token)
        info = get_user_info(payload)
    except ValueError as e:
        return RedirectResponse(url=f"https://glbtoken.com/login.html?error={_safe_error(e)}")
    from database import User, get_db
    from sqlalchemy.orm import Session
    db = next(get_db())
    try:
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
    except Exception as e:
        db.close()
        return RedirectResponse(url=f"https://glbtoken.com/login.html?error=Database+error:+{_safe_error(e)}")
    try:
        from newapi_integration import create_newapi_user
        await create_newapi_user(email=info["email"], name=info["name"], quota=0)
    except Exception as e:
        print(f"⚠️ New API sync failed for Auth0 PKCE: {e}")
    jwt_token = create_access_token({"sub": str(user.id)})
    user_json = _url_quote(json.dumps({
        "id": user.id, "name": user.name, "email": user.email,
        "token_balance": user.token_balance, "picture": info.get("picture", ""),
    }))
    db.close()
    import time
    ts = int(time.time() * 1000)
    return RedirectResponse(url=f"https://glbtoken.com/dashboard.html?token={_url_quote(jwt_token, safe='')}&user={user_json}&_ts={ts}")


@router.post("/api/auth/auth0/password-login")
@limiter.limit("10/minute")
async def auth0_password_login_endpoint(request: Request, body: Auth0PasswordLoginRequest, db: Session = Depends(get_db)):
    """Email/password login via Auth0 Resource Owner Password Grant."""
    if not is_auth0_configured():
        _not_configured("Auth0")
    email = body.email.strip()
    password = body.password
    if not email or not password:
        _400("Email and password required")
    try:
        tokens = auth0_password_login(email, password)
        payload = verify_auth0_token(tokens["id_token"])
        info = get_user_info(payload)
    except ValueError as e:
        print(f"❌ Auth0 password login error: {e}")
        _401("Auth0 login failed. Invalid token.")

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
    record_login_event(user.id, request, True, db)
    return {
        "user": {"id": user.id, "name": user.name, "email": user.email,
                 "token_balance": user.token_balance, "picture": info.get("picture", "")},
        "token": jwt_token,
    }


@router.post("/api/auth/auth0/signup")
@limiter.limit("5/minute")
async def auth0_signup_endpoint(request: Request, body: Auth0SignupRequest, db: Session = Depends(get_db)):
    """Register via Auth0 Database Connection, then auto-login."""
    if not is_auth0_configured():
        _not_configured("Auth0")
    name = body.name.strip()
    email = body.email.strip()
    password = body.password
    if not name or not email or not password:
        _400("Name, email, and password required")

    try:
        auth0_signup(email, password, name)
    except ValueError as e:
        print(f"❌ Auth0 signup error: {e}")
        _400("Signup failed. Please try again.")

    try:
        tokens = auth0_password_login(email, password)
        payload = verify_auth0_token(tokens["id_token"])
        info = get_user_info(payload)
    except ValueError as e:
        print(f"❌ Auth0 auto-login error: {e}")
        _401("Account created but login failed.")

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
    record_login_event(user.id, request, True, db)
    return {
        "user": {"id": user.id, "name": user.name, "email": user.email,
                 "token_balance": user.token_balance, "picture": info.get("picture", "")},
        "token": jwt_token,
    }


@router.get("/api/auth/auth0/social-url")
def auth0_social_url(provider: str = Query(...), state: str = Query("")):
    """Get the Auth0 authorize URL for a social login provider."""
    if not is_auth0_configured():
        _not_configured("Auth0")
    redirect_uri = "https://glbtoken.com/auth/callback.html"
    url = get_social_login_url(provider, redirect_uri, state=state)
    if not url:
        _400(f"Unsupported provider: {provider}")
    return {"url": url, "redirect_uri": redirect_uri}


# ── User Profile ──

@router.get("/api/auth/me")
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

@router.post("/api/auth/send-verification")
@limiter.limit("5/minute")
def send_verification(req: OptionalEmailRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    email = req.email or user.email
    if not email:
        _400("Email required")
    otp = str(random.randint(100000, 999999))
    user.email_otp = otp
    user.email_otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.commit()
    sent = send_email(email, "Verify your GlbTOKEN email",
        f"Your verification code is: {otp}\n\nIt expires in 10 minutes.\n\n- GlbTOKEN Team")
    return {"status": "sent" if sent else "email_unavailable", "email": email}


@router.post("/api/auth/verify-email")
def verify_email(req: VerifyEmailRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    if user.email_otp != req.otp:
        _400("Invalid OTP")
    if not user.email_otp_expiry or now > user.email_otp_expiry:
        _400("OTP expired")
    user.email_verified = True
    user.email_otp = None
    user.email_otp_expiry = None
    db.commit()
    return {"status": "verified"}


# ── Password Management ──

@router.put("/api/user/password")
def change_password(req: ChangePasswordRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.password_hash or not verify_password(req.current_password, user.password_hash):
        _400("Current password is incorrect")
    if len(req.new_password) < 8:
        _400("New password must be at least 8 characters")
    user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"status": "password_updated"}


@router.post("/api/auth/forgot-password")
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


@router.post("/api/auth/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, req: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == req.token).first()
    if not user:
        _400("Invalid or expired reset token")
    now = datetime.now(timezone.utc)
    if not user.reset_token_expiry or now > user.reset_token_expiry:
        _400("Reset token expired")
    if len(req.new_password) < 8:
        _400("Password too short")
    user.password_hash = hash_password(req.new_password)
    user.reset_token = None
    user.reset_token_expiry = None
    db.commit()
    return {"status": "password_reset"}


# ── Login History ──

@router.get("/api/auth/login-history")
@limiter.limit("30/minute")
def get_login_history(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                      offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
    """Returns paginated login history for the current user."""
    total = db.query(LoginEvent).filter(LoginEvent.user_id == user.id).count()
    events = db.query(LoginEvent).filter(
        LoginEvent.user_id == user.id
    ).order_by(desc(LoginEvent.created_at)).offset(offset).limit(limit).all()
    
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "events": [
            {
                "id": e.id,
                "ip_address": e.ip_address,
                "user_agent": e.user_agent,
                "device_type": e.device_type,
                "location": e.location,
                "success": e.success,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
    }


# ── User Profile (get/update) ──

@router.get("/api/user/profile")
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


@router.put("/api/user/profile")
def update_profile(req: ProfileUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if req.name is not None: user.name = req.name
    if req.country is not None: user.country = req.country
    db.commit()
    return {"status": "updated", "name": user.name, "country": user.country}


# ── Helper: send_email ──

def send_email(to: str, subject: str, body: str) -> bool:
    from common import _smtp_host, _smtp_port, _smtp_user, _smtp_pass, _from_addr
    smtp_host, smtp_port, smtp_user, smtp_pass, from_addr = _smtp_host, _smtp_port, _smtp_user, _smtp_pass, _from_addr
    if not smtp_host:
        print(f"📧 SMTP not configured. Would send email to {to}: {subject}")
        return False
    from email.mime.text import MIMEText
    import smtplib
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
