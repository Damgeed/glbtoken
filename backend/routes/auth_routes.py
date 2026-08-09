"""GlbTOKEN — Auth Routes (register, login, OAuth, Auth0, OTP, SMS, password, profile)"""

from fastapi import APIRouter, Depends, Query, Request, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import desc, update
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone, timedelta
import secrets, json, random, re, hashlib, time, threading
import httpx

from database import get_db, User, LoginEvent, Referral, RefreshToken
from auth import (
    hash_password, verify_password, create_access_token, decode_token,
    get_current_user,
    verify_google_token, verify_github_code, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID,
    generate_refresh_token, validate_refresh_token, revoke_refresh_token
)
from newapi_integration import create_newapi_user, create_api_token
from auth0 import (
    is_configured as is_auth0_configured, get_config as get_auth0_config,
    verify_token as verify_auth0_token, get_user_info, exchange_pkce_code,
    password_login as auth0_password_login, signup as auth0_signup,
    get_social_login_url, send_passwordless_code, verify_passwordless_code,
    send_sms_code, verify_sms_code
)
from common import _400, _401, _500, _not_configured, limiter, _safe_error, _url_quote, NEW_API_BASE_URL, _user_setting, send_alert_email, SIGNUP_BONUS_TOKENS
from schemas import (
    RegisterRequest, LoginRequest, GoogleAuthRequest, GithubAuthRequest,
    Auth0LoginRequest, SendCodeRequest, VerifyCodeRequest,
    SendSmsCodeRequest, VerifySmsCodeRequest, Auth0PasswordLoginRequest,
    TwoFactorCodeRequest, TwoFactorConfirmRequest,
    Auth0SignupRequest, OptionalEmailRequest, VerifyEmailRequest,
    ForgotPasswordRequest, ChangePasswordRequest, ResetPasswordRequest,
    ProfileUpdateRequest, RefreshRequest, LogoutRequest,
    DeleteAccountRequest,
)

router = APIRouter()

# ── Helper: build auth response with refresh token ──
def _auth_response(user, db, ua: str = ""):
    """Return token + refresh_token + user object."""
    return {
        "token": create_access_token({"sub": str(user.id)}),
        "refresh_token": generate_refresh_token(
            user.id, db,
            ua=ua,
            device_type=_ua_device_type(ua),
        ),
    }

def _issue_auth_response(user, db, ua: str = ""):
    """Auth response for a REAL login/registration.

    Replaces the same browser's stale refresh tokens first, so the active
    session count reflects devices, not the number of times you've logged in.
    """
    try:
        _revoke_same_device(user.id, ua, db)
    except Exception as e:
        print(f"⚠️ Same-device session cleanup failed: {e}")
    return _auth_response(user, db, ua)

def _client_ip(request: Request) -> str:
    """Get the REAL client IP (single source of truth: common.real_client_ip)."""
    from common import real_client_ip
    return real_client_ip(request)


# ── Login location detection (IP → city/country, free GeoIP providers) ──
_geo_cache = {}          # ip -> location string
_geo_cache_ts = {}       # ip -> epoch seconds
_GEO_CACHE_TTL = 86400   # 24h for successful lookups
_GEO_FAIL_TTL = 900      # 15 min for failed lookups (retry sooner, don't lock out 24h)
_geo_lock = threading.Lock()

# Free no-key GeoIP providers, tried in order until one succeeds.
_GEO_PROVIDERS = (
    # 1. ipwho.is — primary (HTTPS, no key)
    ("ipwho.is", lambda ip: f"https://ipwho.is/{ip}"),
    # 2. ip-api.com — free tier is HTTP-only (HTTPS is paid); returns status/city/countryCode
    ("ip-api.com", lambda ip: f"http://ip-api.com/json/{ip}?fields=status,message,city,countryCode"),
    # 3. freeipapi.com — HTTPS fallback, no key
    ("freeipapi", lambda ip: f"https://freeipapi.com/api/json/{ip}"),
)

def _is_private_ip(ip: str) -> bool:
    """True for loopback/private/reserved ranges — GeoIP providers can't resolve them."""
    if not ip:
        return True
    try:
        import ipaddress
        a = ipaddress.ip_address(ip.split("%")[0])
        return (a.is_private or a.is_loopback or a.is_link_local
                or a.is_reserved or a.is_multicast or a.is_unspecified)
    except Exception:
        # Unparseable → treat as unknown but let providers try
        return False

def _geo_parse(payload: dict) -> str:
    """Extract 'City, CC' from any provider's JSON (normalized)."""
    try:
        city = (payload.get("city") or "").strip()
        cc = (payload.get("country_code") or payload.get("countryCode") or "").strip().upper()
        if cc == "SUCCESS":
            cc = ""
        parts = [p for p in (city, cc) if p]
        return ", ".join(parts)
    except Exception:
        return ""

def _geo_lookup(ip: str) -> str:
    """Resolve an IP to a short 'City, Country' label (or '' if unknown).

    Tries multiple free GeoIP providers with per-provider short timeouts so a
    single outage doesn't leave every login as 'Unknown location'. Results are
    cached in memory (24h success / 15 min failure) so login doesn't hammer APIs.
    """
    if not ip or _is_private_ip(ip):
        return ""
    now = time.time()
    with _geo_lock:
        if ip in _geo_cache:
            ttl = _GEO_CACHE_TTL if _geo_cache[ip] else _GEO_FAIL_TTL
            if now - _geo_cache_ts.get(ip, 0) < ttl:
                return _geo_cache[ip]
    last_err = ""
    for name, url_builder in _GEO_PROVIDERS:
        try:
            r = httpx.get(url_builder(ip), timeout=2.0)
            if r.status_code == 200:
                d = r.json()
                if name == "ip-api.com":
                    if d.get("status") != "success":
                        last_err = f"{name}: {d.get('message', 'fail')}"
                        continue
                elif not d.get("success", True):  # ipwho.is / freeipapi
                    last_err = f"{name}: success=false"
                    continue
                loc = _geo_parse(d)
                if loc:
                    with _geo_lock:
                        _geo_cache[ip] = loc
                        _geo_cache_ts[ip] = now
                    return loc
        except Exception as e:
            last_err = f"{name}: {e}"
            continue
    # All providers failed → cache a short negative so we retry soon, not in 24h
    with _geo_lock:
        _geo_cache[ip] = ""
        _geo_cache_ts[ip] = now
    if last_err:
        print(f"⚠️ GeoIP lookup failed for {ip}: {last_err}")
    return ""

# Backfill throttle: run at most once per 60s, one thread at a time.
_backfill_lock = threading.Lock()
_backfill_last_run = 0.0

def _backfill_login_locations():
    """Fill NULL locations for recent login events (fire-and-forget).

    Existing events recorded before location resolution (or whose background
    fill failed) stay NULL forever — this sweeps the last 14 days and resolves
    any missing IPs so the UI stops showing 'Unknown location'.
    """
    global _backfill_last_run
    now = time.time()
    with _backfill_lock:
        if now - _backfill_last_run < 60:
            return
        _backfill_last_run = now
    try:
        from database import SessionLocal
        s = SessionLocal()
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=14)
            rows = (
                s.query(LoginEvent.ip_address)
                .filter(LoginEvent.location.is_(None), LoginEvent.ip_address.isnot(None),
                        LoginEvent.created_at >= cutoff)
                .distinct()
                .limit(25)
                .all()
            )
            for (ip,) in rows:
                loc = _geo_lookup(ip)
                if not loc:
                    continue
                s.query(LoginEvent).filter(
                    LoginEvent.ip_address == ip,
                    LoginEvent.location.is_(None),
                ).update({LoginEvent.location: loc}, synchronize_session=False)
            s.commit()
        finally:
            s.close()
    except Exception as e:
        print(f"⚠️ Login location backfill failed: {e}")

def record_login_event(user_id: int, request: Request, success: bool, db: Session):
    """Record a login event for audit/history purposes."""
    try:
        ip_address = _client_ip(request)
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
        # Fire-and-forget location fill: never block the login response on a
        # third-party GeoIP call. Update the row in a background thread.
        if ip_address:
            def _fill_location():
                loc = _geo_lookup(ip_address)
                if loc:
                    try:
                        from database import SessionLocal
                        s = SessionLocal()
                        try:
                            ev = s.query(LoginEvent).filter(LoginEvent.id == event.id).first()
                            if ev:
                                ev.location = loc
                                s.commit()
                        finally:
                            s.close()
                    except Exception as e:
                        print(f"⚠️ Failed to save login location: {e}")
            threading.Thread(target=_fill_location, daemon=True).start()
    except Exception as e:
        print(f"⚠️ Failed to record login event: {e}")
        db.rollback()


def _ua_family(ua: str) -> str:
    """Coarse browser-family key from a User-Agent string.

    Used to decide whether two sessions belong to the same logical device:
    a fresh login replaces that browser's old refresh token (instead of
    accumulating one row per login), while different browsers keep their
    own sessions. Unknown clients fall back to the normalized UA so only
    identical clients collapse into one session.
    """
    if not ua:
        return ""
    u = ua.lower()
    # iOS browsers carry AppleWebKit + Safari tokens but NOT their own engine
    # name (e.g. Firefox iOS = "FxiOS/… Safari/…") — detect them BEFORE Safari
    # so Firefox iOS doesn't collapse into the Safari session family.
    if "fxios/" in u:
        return "firefox"
    if "crios/" in u:
        return "chrome"
    if "edgios/" in u:
        return "edge"
    if "opios/" in u:
        return "opera"
    if "samsungbrowser" in u:
        return "samsung"
    if "ucbrowser" in u:
        return "uc"
    if "edg/" in u or "edge/" in u:
        return "edge"
    if "opr/" in u or "opera" in u:
        return "opera"
    if "chrome/" in u and "chromium" not in u and "edg/" not in u:
        return "chrome"
    if "firefox/" in u:
        return "firefox"
    if "safari/" in u and "chrome" not in u:
        return "safari"
    return "other:" + u[:200]


def _ua_device_type(ua: str) -> str:
    """mobile / tablet / desktop classification for the sessions list."""
    if not ua:
        return "desktop"
    u = ua.lower()
    if "ipad" in u or "tablet" in u:
        return "tablet"
    if any(k in u for k in ["mobile", "android", "iphone"]):
        return "mobile"
    return "desktop"


def _revoke_same_device(user_id: int, ua: str, db: Session) -> int:
    """Revoke this user's OTHER active refresh tokens from the SAME browser.

    Root fix for 'N active sessions' inflation: before rotation, every login
    minted a new refresh token without revoking the old one, so the count was
    really 'number of times you logged in' (Bud saw 3 sessions = 3 logins).
    With this, logging in from Safari replaces the old Safari token, while a
    Firefox/Chrome/other-device session stays untouched. Refresh rotation
    already keeps one token per browser going forward.
    """
    if not ua:
        return 0
    family = _ua_family(ua)
    device_type = _ua_device_type(ua)
    if not family:
        return 0
    rows = db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.revoked == False,
        RefreshToken.expires_at > datetime.now(timezone.utc),
    ).all()
    n = 0
    for r in rows:
        # Old rows created before the device columns existed have ua "" —
        # they never match and simply expire on schedule. No retro-kill.
        if not (r.user_agent or ""):
            continue
        if _ua_family(r.user_agent) == family and (r.device_type or "") == device_type:
            r.revoked = True
            n += 1
    if n:
        db.commit()
    return n


# ── Auth Routes ──


def _clean_src(src):
    """Sanitize channel attribution — allowlist only known platforms."""
    if not src:
        return ""
    s = str(src).strip().lower()
    allowed = {"twitter", "whatsapp", "telegram", "email", "facebook", "linkedin", "direct"}
    return s if s in allowed else "direct"


def _resolve_ref(db, ref):
    """Extract + validate a referral code from 'CODE', '?ref=CODE', or a full URL.

    Tolerant by design: a bad/unknown ref never blocks signup — we just skip it.
    """
    if not ref:
        return None
    s = str(ref).strip()
    m = re.search(r'(GLB[A-Z0-9]{6})', s, re.IGNORECASE)
    if not m:
        return None
    code = m.group(1).upper()
    if db.query(Referral).filter(Referral.code == code).first():
        return code
    if db.query(User).filter(User.referral_code == code).first():
        return code
    return None

def _aware(dt):
    """Normalize a DB DateTime (naive UTC) to an aware datetime for comparison."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _grant_pending_bonus(user, db) -> bool:
    """Credit the held signup bonus once the account's email is verified.

    Anti-farming: new email/password accounts start with 0 tokens; the signup
    bonus is parked in settings['pending_bonus'] and released only after the
    email is verified (verify-email OTP or a verified social login). Returns
    True if a bonus was granted.
    """
    try:
        s = json.loads(user.settings) if user.settings else {}
    except (json.JSONDecodeError, TypeError):
        s = {}
    pending = s.get("pending_bonus", 0)
    if not pending:
        return False
    # SECURITY: SQL-side atomic increment — a Python read-modify-write can
    # double-credit when two grant paths race (email verify vs verified social
    # login both releasing the same held bonus).
    db.execute(
        update(User).where(User.id == user.id).values(
            token_balance=User.token_balance + float(pending)
        )
    )
    s.pop("pending_bonus", None)
    s["bonus_granted"] = True
    user.settings = json.dumps(s)
    db.commit()
    db.refresh(user)
    return True


@router.post("/api/auth/register")
@limiter.limit("5/hour")
async def register(req: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    try:
        if db.query(User).filter(User.email == req.email).first():
            # Generic message — do not confirm whether an email is registered
            # (prevents account enumeration via the register endpoint).
            _400("Registration failed. Please check your details and try again.")
        if len(req.password) < 8:
            _400("Password must be at least 8 characters")
        bonus = float(SIGNUP_BONUS_TOKENS or 0)
        user = User(
            name=req.name,
            email=req.email,
            password_hash=hash_password(req.password),
            country=req.country,
            # Anti-farming: hold the bonus until the email is verified; the
            # account starts with 0 spendable tokens (see _grant_pending_bonus).
            token_balance=0,
            settings=json.dumps({"pending_bonus": bonus}) if bonus > 0 else None,
            referred_by=_resolve_ref(db, req.ref),
            signup_ip=_client_ip(request),
            referral_source=_clean_src(req.src),
            is_admin=False,  # promoted to admin below if id == 1
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        # Deterministic first-user-admin: id==1 (no check-then-insert race)
        if user.id == 1:
            user.is_admin = True
            db.commit()
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
    
    auth = _issue_auth_response(user, db, request.headers.get("user-agent", ""))
    from common import ensure_public_id
    public_id = ensure_public_id(user)
    db.commit()
    result = {
        "user": {
            "id": user.id, "name": user.name, "email": user.email,
            "token_balance": user.token_balance,
            "public_id": public_id,
            "avatar": _user_setting(user, "avatar", ""),
        },
        "token": auth["token"],
        "refresh_token": auth["refresh_token"],
    }
    if newapi_token:
        result["newapi_token"] = newapi_token
        result["newapi_endpoint"] = NEW_API_BASE_URL
    
    # Record login event
    try:
        record_login_event(user.id, request, True, db)
    except Exception as e:
        print(f"⚠️ login event record failed: {e}")
    
    return result


@router.post("/api/auth/login")
@limiter.limit("10/minute")
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    # Lockout: 10 failed attempts per email+IP → 429 for 15 minutes.
    if _login_locked(req.email, ip):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not user.password_hash:
        record_login_event(0, request, False, db)
        _login_fail(req.email, ip)
        _401("Invalid credentials")
    if not verify_password(req.password, user.password_hash):
        record_login_event(0, request, False, db)
        _login_fail(req.email, ip)
        _401("Invalid credentials")
    _login_success(req.email, ip)
    record_login_event(user.id, request, True, db)
    # ── 2FA gate: if TOTP is enabled, don't hand out the real token yet ──
    if _totp_enabled(user):
        pre_token = create_access_token(
            {"sub": str(user.id), "scope": "2fa"}, expires_minutes=5
        )
        return {"requires_2fa": True, "pre_token": pre_token}
    # Login alert email (fire-and-forget, respects user prefs)
    if _user_setting(user, "login_alerts", True):
        try:
            ip = _client_ip(request)
            send_alert_email(
                user,
                "GlbTOKEN — new sign-in",
                f"Your GlbTOKEN account was just signed in from {ip}.\n\n"
                f"If this was you, no action needed. If not, reset your password immediately.",
            )
        except Exception as e:
            print(f"⚠️ Login alert failed: {e}")
    token = create_access_token({"sub": str(user.id)})
    auth = _issue_auth_response(user, db, request.headers.get("user-agent", ""))
    from common import ensure_public_id
    public_id = ensure_public_id(user)
    db.commit()
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance, "total_spent": user.total_spent, "country": user.country, "public_id": public_id, "avatar": _user_setting(user, "avatar", "")}, "token": auth["token"], "refresh_token": auth["refresh_token"]}


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
    info = {
        "sub": google_user.get("id") or "",
        "email": google_user.get("email") or "",
        "name": google_user.get("name") or "",
        "email_verified": google_user.get("email_verified", False),
    }
    user, _ = _resolve_social_user(db, info)
    record_login_event(user.id, request, True, db)
    if _totp_enabled(user):
        pre_token = create_access_token({"sub": str(user.id), "scope": "2fa"}, expires_minutes=5)
        return {"requires_2fa": True, "pre_token": pre_token}
    token = create_access_token({"sub": str(user.id)})
    auth = _issue_auth_response(user, db, request.headers.get("user-agent", ""))
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance, "total_spent": user.total_spent}, "token": auth["token"], "refresh_token": auth["refresh_token"]}


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
        _400("GitHub login failed. Please try again.")
    info = {
        "sub": github_user.get("id") or "",
        "email": github_user.get("email") or "",
        "name": github_user.get("name") or "",
        "email_verified": github_user.get("email_verified", False),
    }
    user, _ = _resolve_social_user(db, info, id_field="github_id")
    record_login_event(user.id, request, True, db)
    if _totp_enabled(user):
        pre_token = create_access_token({"sub": str(user.id), "scope": "2fa"}, expires_minutes=5)
        return {"requires_2fa": True, "pre_token": pre_token}
    token = create_access_token({"sub": str(user.id)})
    auth = _issue_auth_response(user, db, request.headers.get("user-agent", ""))
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance, "total_spent": user.total_spent}, "token": auth["token"], "refresh_token": auth["refresh_token"]}


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
        _400("Failed to send code. Please try again.")


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
        _400("Verification failed. Please try again.")
    
    # CRITICAL: cross-check the email claim in the verified id_token against the
    # client-supplied email. Never trust body.email alone for account lookup.
    claimed_email = (user_info.get("email") or "").lower().strip()
    if not claimed_email or claimed_email != email:
        _400("Email mismatch with verified token")
    
    # Find or create user
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            name=user_info.get("name", email.split("@")[0]),
            email=email,
            password_hash=None,
            token_balance=SIGNUP_BONUS_TOKENS,
            email_verified=True,
            referred_by=_resolve_ref(db, body.ref),
            signup_ip=_client_ip(request),
            referral_source=_clean_src(body.src),
            is_admin=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        # Deterministic first-user-admin: id==1 (no check-then-insert race)
        if user.id == 1:
            user.is_admin = True
            db.commit()
        
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
    # ── 2FA gate: if TOTP is enabled, don't hand out the real token yet ──
    if _totp_enabled(user):
        pre_token = create_access_token(
            {"sub": str(user.id), "scope": "2fa"}, expires_minutes=5
        )
        return {"requires_2fa": True, "pre_token": pre_token}
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
    # A synthetic phone address (phone@phone.glbtoken.io) is not a real mailbox —
    # it can never be email-verified. Only mark verified when Auth0 actually
    # reports a verified email for this phone user.
    email_verified = bool(user_info.get("email") and user_info.get("email_verified"))
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            name=user_info.get("name", phone),
            email=email,
            password_hash=None,
            token_balance=SIGNUP_BONUS_TOKENS,
            email_verified=email_verified,
            is_admin=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        # Deterministic first-user-admin: id==1 (no check-then-insert race)
        if user.id == 1:
            user.is_admin = True
            db.commit()
        try:
            newapi_user = await create_newapi_user(email=email, name=user.name, quota=0)
            if newapi_user and isinstance(newapi_user, dict) and newapi_user.get("id"):
                user.newapi_user_id = newapi_user["id"]
                db.commit()
        except Exception as e:
            print(f"⚠️ New API sync failed on verify-sms-code: {e}")
    else:
        # Don't force email_verified=True on phone logins — a synthetic
        # phone address cannot prove email ownership.
        db.commit()
    
    jwt_token = create_access_token({"sub": str(user.id)})
    record_login_event(user.id, request, True, db)
    # ── 2FA gate: if TOTP is enabled, don't hand out the real token yet ──
    if _totp_enabled(user):
        pre_token = create_access_token(
            {"sub": str(user.id), "scope": "2fa"}, expires_minutes=5
        )
        return {"requires_2fa": True, "pre_token": pre_token}
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
    user = db.query(User).filter(User.email == info["email"]).first()

    if not user and info.get("sub"):
        user = db.query(User).filter(User.google_id == info["sub"]).first()

    if not user and info["email"]:
        user = db.query(User).filter(User.email == info["email"]).first()

    if user:
        # SECURITY: only link an existing account when the provider has verified
        # the email. Otherwise an attacker could register the victim's email in
        # Auth0 (unverified) and take over the victim's GlbTOKEN account.
        if not info.get("email_verified"):
            _401("Email verification required to sign in with this account")
        if not user.google_id:
            user.google_id = info["sub"]
        user.email_verified = user.email_verified or info["email_verified"]
        db.commit()
        # Verified social login → release any held signup bonus.
        _grant_pending_bonus(user, db)
    else:
        user = User(
            name=info["name"],
            email=info["email"],
            google_id=info["sub"],
            token_balance=SIGNUP_BONUS_TOKENS,
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


def _resolve_social_user(db, info, id_field="google_id"):
    """Secure social-login identity resolution.

    Provider `sub` is the AUTHORITATIVE key (unique per user per provider).
    Email is used ONLY as a secondary link when: non-empty, verified, and the
    matching account is not already bound to a DIFFERENT provider identity.

    Critical: Apple omits `email` on repeat sign-ins when the user chose
    "Hide My Email" — matching by empty email would bucket ALL such users into
    one account (= account takeover, the reported bug). Empty email NEVER
    matches; users without an email get a deterministic synthetic address so
    the unique-email constraint holds and a later real email can replace it.

    id_field: "google_id" (default, used by Auth0 social + Google) or
    "github_id" (direct GitHub OAuth).

    Raises ValueError if the user cannot be safely identified/created.
    Returns (user, created).
    """
    sub = (info.get("sub") or "").strip()
    email = (info.get("email") or "").strip().lower()
    email_verified = bool(info.get("email_verified"))
    id_attr = User.github_id if id_field == "github_id" else User.google_id

    user = None
    # 1) Authoritative: provider identity (sub)
    if sub:
        user = db.query(User).filter(id_attr == sub).first()
    # 2) Secondary: verified email, only if the account is unclaimed OR belongs to this sub
    if not user and email and email_verified:
        existing = db.query(User).filter(User.email == email).first()
        if existing and (
            (not existing.google_id and not existing.github_id) or
            (id_field == "github_id" and existing.github_id == sub) or
            (id_field != "github_id" and existing.google_id == sub)
        ):
            user = existing
    # 3) Create a new account
    if not user:
        if not sub and not email:
            raise ValueError("Social login response missing both sub and email")
        db_email = email
        if not db_email and sub:
            db_email = "apple-" + hashlib.sha256(sub.encode()).hexdigest()[:16] + "@privaterelay.local"
        user = User(
            name=info.get("name") or (db_email.split("@")[0] if db_email else "User"),
            email=db_email,
            google_id=(sub or None) if id_field != "github_id" else None,
            github_id=(sub or None) if id_field == "github_id" else None,
            token_balance=SIGNUP_BONUS_TOKENS,
            email_verified=email_verified,
        )
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise ValueError("This email is linked to another account. Sign in with that method or contact support.")
        db.refresh(user)
        return user, True
    # Existing account: bind identity + verified email if missing
    if sub:
        if id_field == "github_id":
            if not user.github_id:
                user.github_id = sub
        elif not user.google_id:
            user.google_id = sub
    if email_verified and email and not user.email:
        user.email = email
    user.email_verified = user.email_verified or email_verified
    db.commit()
    # Verified social login → release any held signup bonus.
    _grant_pending_bonus(user, db)
    return user, False


@router.get("/api/auth/auth0/callback")
@limiter.limit("10/minute")
async def auth0_callback_redirect(request: Request, id_token: str = Query(...)):
    """Callback redirect endpoint for social login. Validates Auth0 id_token and redirects to frontend dashboard with JWT."""
    from starlette.responses import RedirectResponse
    if not is_auth0_configured():
        return RedirectResponse(url="https://glbtoken.com/login.html?error=Auth0+not+configured")
    try:
        payload = verify_auth0_token(id_token)
        info = get_user_info(payload)
    except ValueError as e:
        return RedirectResponse(url=f"https://glbtoken.com/login.html?error=Invalid+token:+{_safe_error(e)}")
    from database import User, get_db
    from sqlalchemy.orm import Session
    db = next(get_db())
    try:
        user, _ = _resolve_social_user(db, info)
    except ValueError as e:
        db.close()
        return RedirectResponse(url=f"https://glbtoken.com/login.html?error={_safe_error(e)}")
    except Exception as e:
        db.close()
        return RedirectResponse(url=f"https://glbtoken.com/login.html?error=Database+error:+{_safe_error(e)}")
    try:
        from newapi_integration import create_newapi_user
        await create_newapi_user(email=user.email, name=user.name, quota=0)
    except Exception as e:
        print(f"⚠️ New API sync failed for Auth0 callback: {e}")
    twofa_redirect = _social_2fa_redirect(user)
    if twofa_redirect:
        db.close()
        return twofa_redirect
    ua = request.headers.get("user-agent", "")
    jwt_token = create_access_token({"sub": str(user.id)})
    try:
        _revoke_same_device(user.id, ua, db)
    except Exception as e:
        print(f"⚠️ Same-device session cleanup failed: {e}")
    refresh_token = generate_refresh_token(user.id, db, ua=ua, device_type=_ua_device_type(ua))
    # Record this social login so Login History shows the browser (e.g. Firefox
    # signing in via Google) — was missing, so social logins never appeared.
    try:
        record_login_event(user.id, request, True, db)
    except Exception as e:
        print(f"⚠️ Auth0 callback login event failed: {e}")
    user_json = _url_quote(json.dumps({
        "id": user.id, "name": user.name, "email": user.email,
        "token_balance": user.token_balance, "picture": info.get("picture", ""),
    }))
    db.close()
    import time
    ts = int(time.time() * 1000)
    return RedirectResponse(url=f"https://glbtoken.com/dashboard.html?token={_url_quote(jwt_token, safe='')}&refresh={_url_quote(refresh_token, safe='')}&user={user_json}&_ts={ts}")


@router.get("/api/auth/auth0/pkce-callback")
@limiter.limit("10/minute")
async def auth0_pkce_callback(request: Request, code: str = Query(...), code_verifier: str = Query(...), state: str = Query(None)):
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
        user, _ = _resolve_social_user(db, info)
    except ValueError as e:
        db.close()
        return RedirectResponse(url=f"https://glbtoken.com/login.html?error={_safe_error(e)}")
    except Exception as e:
        db.close()
        return RedirectResponse(url=f"https://glbtoken.com/login.html?error=Database+error:+{_safe_error(e)}")
    try:
        from newapi_integration import create_newapi_user
        await create_newapi_user(email=user.email, name=user.name, quota=0)
    except Exception as e:
        print(f"⚠️ New API sync failed for Auth0 PKCE: {e}")
    twofa_redirect = _social_2fa_redirect(user)
    if twofa_redirect:
        db.close()
        return twofa_redirect
    ua = request.headers.get("user-agent", "")
    jwt_token = create_access_token({"sub": str(user.id)})
    try:
        _revoke_same_device(user.id, ua, db)
    except Exception as e:
        print(f"⚠️ Same-device session cleanup failed: {e}")
    refresh_token = generate_refresh_token(user.id, db, ua=ua, device_type=_ua_device_type(ua))
    # Record this social login so Login History shows the browser.
    try:
        record_login_event(user.id, request, True, db)
    except Exception as e:
        print(f"⚠️ Auth0 PKCE login event failed: {e}")
    user_json = _url_quote(json.dumps({
        "id": user.id, "name": user.name, "email": user.email,
        "token_balance": user.token_balance, "picture": info.get("picture", ""),
    }))
    db.close()
    import time
    ts = int(time.time() * 1000)
    return RedirectResponse(url=f"https://glbtoken.com/dashboard.html?token={_url_quote(jwt_token, safe='')}&refresh={_url_quote(refresh_token, safe='')}&user={user_json}&_ts={ts}")


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
            google_id=info["sub"], token_balance=SIGNUP_BONUS_TOKENS,
            email_verified=info["email_verified"],
        )
        db.add(user); db.commit(); db.refresh(user)
        try:
            await create_newapi_user(email=info["email"], name=info["name"], quota=0)
        except Exception as e:
            print(f"⚠️ New API sync failed for Auth0 password user: {e}")

    if _totp_enabled(user):
        pre_token = create_access_token({"sub": str(user.id), "scope": "2fa"}, expires_minutes=5)
        return {"requires_2fa": True, "pre_token": pre_token}
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
    if len(password) < 8:
        _400("Password must be at least 8 characters")

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
        # Use the name the user actually typed — reading it back from the
        # Auth0 id_token can yield the random `sub` when the token has no
        # name claim, which is what made "full name switch to random code".
        name=name or info["name"] or info["email"].split("@")[0],
        email=info["email"],
        google_id=info["sub"], token_balance=SIGNUP_BONUS_TOKENS,
        email_verified=info["email_verified"],
    )
    db.add(user); db.commit(); db.refresh(user)
    try:
        await create_newapi_user(email=info["email"], name=user.name, quota=0)
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
        "is_admin": bool(getattr(user, "is_admin", False)),
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "avatar": _user_setting(user, "avatar", ""),
    }


# ── Email Verification ──

# In-memory OTP guess limiter per account (resets when a new code is sent)
_email_otp_attempts = {}

# In-memory login failure lockout per email+IP: 5 failures → 429 for 15 min.
_login_failures = {}
_LOGIN_LOCKOUT_MAX = 5
_LOGIN_LOCKOUT_TTL = 900  # seconds

def _login_locked(email: str, ip: str) -> bool:
    key = f"{(email or '').lower()}:{ip}"
    now = time.time()
    rec = _login_failures.get(key)
    if not rec:
        return False
    if now - rec["ts"] > _LOGIN_LOCKOUT_TTL:
        _login_failures.pop(key, None)
        return False
    return rec["count"] >= _LOGIN_LOCKOUT_MAX

def _login_fail(email: str, ip: str):
    key = f"{(email or '').lower()}:{ip}"
    now = time.time()
    rec = _login_failures.get(key)
    if not rec or now - rec["ts"] > _LOGIN_LOCKOUT_TTL:
        rec = {"count": 0, "ts": now}
    rec["count"] += 1
    rec["ts"] = now
    _login_failures[key] = rec

def _login_success(email: str, ip: str):
    _login_failures.pop(f"{(email or '').lower()}:{ip}", None)

@router.post("/api/auth/send-verification")
@limiter.limit("5/minute")
def send_verification(req: OptionalEmailRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Only ever send to the account's OWN email — a logged-in user must not be
    # able to spam/verify arbitrary addresses.
    email = user.email
    if not email:
        _400("No email on this account")
    otp = str(random.randint(100000, 999999))
    user.email_otp = otp
    user.email_otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.commit()
    _email_otp_attempts.pop(f"otp:{user.id}", None)
    sent = send_email(email, "Verify your GlbTOKEN email",
        f"Your verification code is: {otp}\n\nIt expires in 10 minutes.\n\n- GlbTOKEN Team")
    return {"status": "sent" if sent else "email_unavailable", "email": email}


@router.post("/api/auth/verify-email")
@limiter.limit("10/minute")
def verify_email(req: VerifyEmailRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    # Cap OTP guesses per account to prevent brute-force of the 6-digit code
    key = f"otp:{user.id}"
    attempts = _email_otp_attempts.get(key, 0)
    if attempts >= 5:
        _400("Too many attempts. Request a new code.")
    if user.email_otp != req.otp:
        _email_otp_attempts[key] = attempts + 1
        _400("Invalid OTP")
    if not _aware(user.email_otp_expiry) or now > _aware(user.email_otp_expiry):
        _400("OTP expired")
    user.email_verified = True
    user.email_otp = None
    user.email_otp_expiry = None
    _email_otp_attempts.pop(key, None)
    db.commit()
    # Release the held signup bonus now that the email is verified.
    _grant_pending_bonus(user, db)
    return {"status": "verified"}


# ── Password Management ──

@router.put("/api/user/password")
@limiter.limit("5/minute")
def change_password(request: Request, req: ChangePasswordRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.password_hash or not verify_password(req.current_password, user.password_hash):
        _400("Current password is incorrect")
    if len(req.new_password) < 8:
        _400("New password must be at least 8 characters")
    user.password_hash = hash_password(req.new_password)
    db.commit()
    # SECURITY: revoke all refresh tokens so a stolen token can't outlive a password change
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).delete(synchronize_session=False)
    db.commit()
    return {"status": "password_updated"}


@router.post("/api/auth/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    # Uniform response for every outcome — never reveal whether an email is
    # registered (anti-enumeration). Distinctions are logged server-side only.
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        return {"status": "sent"}  # indistinguishable from a real reset
    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()
    try:
        sent = send_email(user.email, "Reset your GlbTOKEN password",
            f"Reset token: {token}\n\nGo to: https://glbtoken.com/reset-password\nPaste the token above.\nIt expires in 1 hour.\n\n- GlbTOKEN Team")
    except Exception as e:
        print(f"⚠️ Forgot-password email send failed (logged, not shown): {e}")
        sent = False
    if not sent:
        print(f"⚠️ Reset email could not be delivered to {user.email} (logged, not shown)")
    return {"status": "sent"}


@router.post("/api/auth/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, req: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == req.token).first()
    if not user:
        _400("Invalid or expired reset token")
    now = datetime.now(timezone.utc)
    if not _aware(user.reset_token_expiry) or now > _aware(user.reset_token_expiry):
        _400("Reset token expired")
    if len(req.new_password) < 8:
        _400("Password too short")
    user.password_hash = hash_password(req.new_password)
    user.reset_token = None
    user.reset_token_expiry = None
    db.commit()
    # SECURITY: revoke all refresh tokens after a password reset — a stolen
    # refresh token must not stay valid after credentials rotate.
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).delete(synchronize_session=False)
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

    # Lazy backfill: if any returned events still have NULL location, kick a
    # throttled background sweep so 'Unknown location' gets resolved on refresh.
    if any(e.location is None for e in events):
        try:
            threading.Thread(target=_backfill_login_locations, daemon=True).start()
        except Exception:
            pass

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
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from common import ensure_public_id
    public_id = ensure_public_id(user)
    db.commit()  # persist newly generated public_id
    return {
        "id": user.id,
        "public_id": public_id,
        "name": user.name,
        "email": user.email,
        "country": user.country,
        "token_balance": user.token_balance,
        "total_spent": user.total_spent,
        "email_verified": user.email_verified,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "avatar": _user_setting(user, "avatar", ""),
    }


@router.put("/api/user/profile")
def update_profile(req: ProfileUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if req.name is not None: user.name = req.name
    if req.country is not None: user.country = req.country
    db.commit()
    return {"status": "updated", "name": user.name, "country": user.country}

# ── Refresh Token ──
@router.post("/auth/refresh")
@limiter.limit("60/minute")
async def refresh_access_token(
    request: Request,
    body: RefreshRequest,
    db: Session = Depends(get_db)
):
    raw = body.refresh_token
    if not raw:
        _400("refresh_token is required")
    try:
        user_id = validate_refresh_token(raw, db)
    except HTTPException:
        _401("Session expired. Please log in again.")
    # ROTATE: revoke the old refresh token before minting the new one so each
    # active device holds exactly one valid token (prevents the table from
    # accumulating one row per silent page-load refresh). The frontend
    # shared.js handles the multi-tab race by retrying once with the token
    # that ended up in storage after this refresh.
    try:
        revoke_refresh_token(raw, db)
    except Exception as e:
        print(f"⚠️ Refresh-token rotation: failed to revoke old token: {e}")
    # If this refresh comes from a DIFFERENT browser/device than the last
    # recorded login event, log it — so a new browser that restores a saved
    # session (refresh token) still shows up in Login History instead of
    # silently appearing only in Active Sessions. Normal page-load refreshes
    # from the same browser keep the same UA and stay quiet.
    try:
        ua = request.headers.get("user-agent", "")
        last = db.query(LoginEvent).filter(
            LoginEvent.user_id == user_id,
            LoginEvent.success == True
        ).order_by(desc(LoginEvent.created_at)).first()
        if not last or (last.user_agent or "") != ua:
            record_login_event(user_id, request, True, db)
    except Exception as e:
        print(f"⚠️ Refresh UA-change login event failed: {e}")
    # Generate new access + refresh tokens
    ua = request.headers.get("user-agent", "")
    new_access = create_access_token({"sub": str(user_id)})
    new_refresh = generate_refresh_token(user_id, db, ua=ua, device_type=_ua_device_type(ua))
    return {"token": new_access, "refresh_token": new_refresh}

@router.post("/auth/logout")
@limiter.limit("60/minute")
async def logout(request: Request, body: LogoutRequest, db: Session = Depends(get_db)):
    """Revoke a refresh token server-side (industry-standard logout)."""
    raw = body.refresh_token
    if raw:
        revoke_refresh_token(raw, db)
    return {"status": "success"}

# ── Helper: send_email ──

def _email_html(title: str, text_body: str) -> str:
    """Branded HTML wrapper (GlbTOKEN dark theme, gold accent)."""
    import html as _html
    paragraphs = [p.strip() for p in text_body.split("\n") if p.strip()]
    body_html = "".join(f'<p style="margin:0 0 14px;line-height:1.6">{_html.escape(p)}</p>' for p in paragraphs)
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0A0B14;font-family:Inter,-apple-system,'Segoe UI',sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0B14;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#161822;border:1px solid #2A2B3D;border-radius:14px;overflow:hidden">
<tr><td style="padding:28px 32px 6px">
  <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em">
    <span style="color:#F4B400">Glb</span><span style="color:#E6E9F2">TOKEN</span>
  </div>
</td></tr>
<tr><td style="padding:18px 32px 6px">
  <h1 style="margin:0 0 12px;font-size:17px;font-weight:600;color:#E6E9F2">{_html.escape(title)}</h1>
  <div style="font-size:14px;color:#A9AEBF">{body_html}</div>
</td></tr>
<tr><td style="padding:20px 32px 28px">
  <div style="border-top:1px solid #2A2B3D;padding-top:16px;font-size:12px;color:#7F8490">
    <p style="margin:0 0 6px">GlbTOKEN — One balance. 340+ AI models. Pay-as-you-go.</p>
    <p style="margin:0">Questions? Reply to this email or visit <a href="https://glbtoken.com" style="color:#F4B400;text-decoration:none">glbtoken.com</a></p>
  </div>
</td></tr>
</table>
</td></tr>
</table></body></html>"""


def send_email(to: str, subject: str, body: str, html_body: str = None) -> bool:
    from common import _smtp_host, _smtp_port, _smtp_user, _smtp_pass, _from_addr
    smtp_host, smtp_port, smtp_user, smtp_pass, from_addr = _smtp_host, _smtp_port, _smtp_user, _smtp_pass, _from_addr
    if not smtp_host:
        print(f"📧 SMTP not configured. Would send email to {to}: {subject}")
        return False
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    import smtplib
    msg = MIMEMultipart("alternative")
    msg.attach(MIMEText(body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body or _email_html(subject, body), "html", "utf-8"))
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    try:
        import ssl
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as s:
            s.starttls(context=ssl.create_default_context())
            s.login(smtp_user, smtp_pass)
            s.send_message(msg)
        print(f"📧 Email sent to {to}: {subject}")
        return True
    except Exception as e:
        print(f"📧 SMTP FAILED to {to}: {e}")
        return False


# ── Two-Factor Auth (TOTP) ──

def _totp_settings(user):
    """Return the settings dict + totp fields safely."""
    import json
    try:
        s = json.loads(user.settings) if user.settings else {}
    except (json.JSONDecodeError, TypeError):
        s = {}
    return s


def _totp_enabled(user) -> bool:
    return bool(_totp_settings(user).get("totp_enabled"))


def _totp_secret(user) -> str:
    return _totp_settings(user).get("totp_secret", "")


# ── 2FA recovery codes (backup codes) ──
# Stored as SHA-256 hashes in user.settings["totp_backup_codes"] so a DB
# leak never exposes usable codes. Each code is consumed on first use.

_RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I

def _generate_recovery_codes(n: int = 10) -> list:
    """Return n random 10-char codes (plaintext — show ONCE to the user)."""
    import secrets
    return [
        "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(10))
        for _ in range(n)
    ]


def _hash_recovery_codes(codes) -> list:
    import hashlib
    return [hashlib.sha256(c.encode()).hexdigest() for c in codes]


def _verify_recovery_code(user, code: str, db) -> bool:
    """Consume a recovery code if it matches. Returns True on success."""
    import hashlib
    s = _totp_settings(user)
    hashes = s.get("totp_backup_codes") or []
    if not hashes:
        return False
    code = (code or "").strip().upper()
    h = hashlib.sha256(code.encode()).hexdigest()
    if h in hashes:
        hashes.remove(h)                      # one-time use
        s["totp_backup_codes"] = hashes
        user.settings = json.dumps(s)
        db.commit()
        return True
    return False


def _social_2fa_redirect(user):
    """If 2FA is enabled, redirect to the challenge page with a short-lived pre_token.

    Used by redirect-based social logins (Auth0 callback / PKCE) where the
    browser flow can't show an inline prompt. Returns None when 2FA is off.
    """
    if not _totp_enabled(user):
        return None
    from starlette.responses import RedirectResponse
    from urllib.parse import urlencode
    pre_token = create_access_token(
        {"sub": str(user.id), "scope": "2fa"}, expires_minutes=5
    )
    qs = urlencode({"pre": pre_token, "next": "/dashboard.html"})
    return RedirectResponse(url=f"https://glbtoken.com/2fa-challenge.html?{qs}")


@router.get("/api/auth/2fa/status")
def twofa_status(user: User = Depends(get_current_user)):
    """Whether TOTP 2FA is enabled for the current user."""
    return {"enabled": _totp_enabled(user)}


@router.post("/api/auth/2fa/setup")
@limiter.limit("5/minute")
def twofa_setup(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Generate a TOTP secret (staged, not enabled until verified)."""
    if _totp_enabled(user):
        _400("Two-factor auth is already enabled")
    from totp import generate_secret, otpauth_url
    secret = generate_secret()
    codes = _generate_recovery_codes(10)
    s = _totp_settings(user)
    s["totp_pending_secret"] = secret
    # Stage hashed recovery codes too — they become active on enable.
    s["totp_pending_backup_codes"] = _hash_recovery_codes(codes)
    user.settings = json.dumps(s)
    db.commit()
    return {
        "secret": secret,
        "otpauth_url": otpauth_url(secret, user.email),
        "backup_codes": codes,   # plaintext — shown once during setup
    }


@router.post("/api/auth/2fa/enable")
@limiter.limit("5/minute")
def twofa_enable(request: Request, req: TwoFactorCodeRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Verify a code from the staged secret, then enable 2FA."""
    from totp import verify
    s = _totp_settings(user)
    pending = s.get("totp_pending_secret", "")
    if not pending:
        _400("No pending 2FA setup — call setup first")
    if not verify(pending, req.code):
        _400("Invalid authenticator code")
    s["totp_secret"] = pending
    s["totp_enabled"] = True
    s.pop("totp_pending_secret", None)
    # Activate the staged recovery codes (hashed).
    if s.get("totp_pending_backup_codes"):
        s["totp_backup_codes"] = s.pop("totp_pending_backup_codes")
    user.settings = json.dumps(s)
    db.commit()
    return {"status": "enabled"}


@router.post("/api/auth/2fa/disable")
@limiter.limit("5/minute")
def twofa_disable(request: Request, req: TwoFactorCodeRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Verify a current code, then disable 2FA."""
    from totp import verify
    secret = _totp_secret(user)
    if not secret:
        _400("Two-factor auth is not enabled")
    if not verify(secret, req.code):
        _400("Invalid authenticator code")
    s = _totp_settings(user)
    s.pop("totp_secret", None)
    s.pop("totp_enabled", None)
    s.pop("totp_pending_secret", None)
    s.pop("totp_backup_codes", None)          # recovery codes die with 2FA
    s.pop("totp_pending_backup_codes", None)
    user.settings = json.dumps(s)
    db.commit()
    return {"status": "disabled"}


@router.post("/api/auth/2fa/confirm")
@limiter.limit("10/minute")
def twofa_confirm(req: TwoFactorConfirmRequest, request: Request, db: Session = Depends(get_db)):
    """Exchange a short-lived pre_token + TOTP code for a full auth response."""
    from totp import verify
    from auth import decode_token
    payload = decode_token(req.pre_token)
    if not payload or payload.get("scope") != "2fa":
        _401("Invalid or expired 2FA session")
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user:
        _401("User not found")
    if not verify(_totp_secret(user), req.code):
        # Fall back to a one-time recovery code (consumed on use).
        if not _verify_recovery_code(user, req.code, db):
            _401("Invalid authenticator code")
    token = create_access_token({"sub": str(user.id)})
    record_login_event(user.id, request, True, db)
    auth = _issue_auth_response(user, db, request.headers.get("user-agent", ""))
    return {
        "token": token,
        "refresh_token": auth["refresh_token"],
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "token_balance": user.token_balance,
            "country": user.country,
        },
    }


# ── Self-Serve Account Deletion ──
@router.delete("/api/user/account")
@limiter.limit("3/minute")
def delete_own_account(
    req: DeleteAccountRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete the authenticated user's account and all data.

    Requires the user's email to match (typing it confirms intent) and, when
    2FA is enabled, a valid TOTP code or one-time recovery code (recovery code
    is consumed). Mirrors the admin deletion order for FK safety.
    """
    if (req.email or "").strip().lower() != (user.email or "").strip().lower():
        _400("Email does not match your account")

    # Re-authentication: password-backed accounts must confirm the current
    # password — a stolen session token alone must not be enough to
    # permanently destroy an account. OAuth-only accounts (no password set)
    # fall through to the 2FA check below.
    if user.password_hash:
        if not req.password or not verify_password(req.password, user.password_hash):
            _401("Current password is required to delete your account")

    if _totp_enabled(user):
        from totp import verify
        code = (req.code or "").strip()
        ok = verify(_totp_secret(user), code) or _verify_recovery_code(user, code, db)
        if not ok:
            _401("Invalid authenticator or recovery code")

    from database import (
        RefreshToken, ApiKey, Transaction, Preset, Referral,
        ReferralRedemption, LoginEvent, Organization, OrgMember, Conversation,
    )

    uid = user.id
    # FK-safe deletion order: children first, then the user (same as admin).
    db.query(RefreshToken).filter(RefreshToken.user_id == uid).delete(synchronize_session=False)
    db.query(LoginEvent).filter(LoginEvent.user_id == uid).delete(synchronize_session=False)
    db.query(Conversation).filter(Conversation.user_id == uid).delete(synchronize_session=False)
    db.query(OrgMember).filter(OrgMember.user_id == uid).delete(synchronize_session=False)
    owned_org_ids = [
        oid for (oid,) in db.query(Organization.id).filter(Organization.owner_id == uid).all()
    ]
    if owned_org_ids:
        db.query(OrgMember).filter(OrgMember.org_id.in_(owned_org_ids)).delete(synchronize_session=False)
    db.query(Organization).filter(Organization.owner_id == uid).delete(synchronize_session=False)
    db.query(Preset).filter(Preset.user_id == uid).delete(synchronize_session=False)
    db.query(Transaction).filter(Transaction.user_id == uid).delete(synchronize_session=False)
    db.query(ApiKey).filter(ApiKey.user_id == uid).delete(synchronize_session=False)
    db.query(ReferralRedemption).filter(ReferralRedemption.referred_user_id == uid).delete(synchronize_session=False)
    db.query(Referral).filter(Referral.user_id == uid).delete(synchronize_session=False)
    db.delete(user)
    db.commit()

    try:
        send_alert_email(
            user.email,
            "GlbTOKEN account deleted",
            "Your GlbTOKEN account and all associated data have been permanently deleted.\n\nIf this was a mistake, please contact support@glbtoken.com.",
        )
    except Exception as e:
        print(f"⚠️ Account-deletion alert email failed for {user.email}: {e}")
    return {"status": "deleted"}


# ── Session Management (list active refresh tokens / revoke all) ──
@router.get("/api/auth/sessions")
@limiter.limit("30/minute")
def list_sessions(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List the user's active (non-revoked, non-expired) refresh sessions.

    Historical cleanup: before the refresh endpoint rotated tokens (it revokes
    the old one each refresh), every silent page-load refresh minted a new row
    without revoking the previous one — so one browser could accumulate 20+
    "sessions". We cap active tokens per user at MAX_ACTIVE_SESSIONS and revoke
    the oldest beyond that, so the count reflects real devices/sessions.
    """
    MAX_ACTIVE_SESSIONS = 8
    rows = db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.revoked == False,
        RefreshToken.expires_at > datetime.now(timezone.utc),
    ).order_by(desc(RefreshToken.created_at)).all()
    if len(rows) > MAX_ACTIVE_SESSIONS:
        # Revoke the oldest tokens beyond the cap (one-time historical cleanup;
        # rotation keeps new sessions at ~1 per device from here on).
        for stale in rows[MAX_ACTIVE_SESSIONS:]:
            stale.revoked = True
        db.commit()
        rows = rows[:MAX_ACTIVE_SESSIONS]
    # Collapse by browser family so legacy tokens (minted before same-device
    # rotation) don't inflate the count: 4×Safari shows as 1 session, but
    # Safari + Firefox stays 2. Newest token per family wins.
    seen_family = set()
    collapsed = []
    for r in rows:
        fam = _ua_family(r.user_agent or "")
        if fam in seen_family:
            continue
        seen_family.add(fam)
        collapsed.append(r)
    return {
        "sessions": [
            {
                "id": r.id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "expires_at": r.expires_at.isoformat() if r.expires_at else None,
                "user_agent": r.user_agent or "",
                "device_type": r.device_type or "",
            }
            for r in collapsed
        ]
    }


@router.post("/api/auth/sessions/revoke-all")
@limiter.limit("10/minute")
def revoke_all_sessions(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Revoke every active refresh token for the user (sign out all devices).

    The current access token remains valid until it expires (short-lived),
    but no refresh token can mint new ones — the next refresh forces re-login.
    """
    n = db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.revoked == False,
    ).update({"revoked": True}, synchronize_session=False)
    db.commit()
    return {"status": "revoked", "revoked": n}


# ── Avatar Upload (industry standard: multipart file → Pillow → small WebP data URL) ──
MAX_AVATAR_BYTES = 5 * 1024 * 1024   # 5 MB raw upload cap
MAX_AVATAR_DATA_URL = 200 * 1024     # ~200 KB stored data URL cap

@router.post("/api/user/avatar")
@limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload (or replace) the user's avatar image.

    Standard multipart/form-data upload. The server decodes the image with
    Pillow, center-crops to a square, resizes to ≤256×256 and re-encodes as
    WebP (quality 82), then stores the small data URL in the user's settings
    JSON. Client-side canvas/HEIC hacks are no longer needed.
    """
    if not file or not file.filename:
        _400("No file uploaded")
    ctype = (file.content_type or "").lower()
    if not ctype.startswith("image/"):
        _400("Upload must be an image file (JPG, PNG, WebP, GIF…)")
    raw = await file.read()
    if not raw:
        _400("Empty file")
    if len(raw) > MAX_AVATAR_BYTES:
        _400(f"Image too large (max {MAX_AVATAR_BYTES // (1024 * 1024)} MB)")
    try:
        from io import BytesIO
        from PIL import Image, UnidentifiedImageError
        img = Image.open(BytesIO(raw))
        img.load()
    except UnidentifiedImageError:
        _400("Could not read that image — try JPG, PNG or WebP")
    except Exception as e:
        print(f"⚠️ Avatar decode failed: {e}")
        _400("Could not read that image — try JPG, PNG or WebP")
    # Center-crop to square, then resize to ≤256 (small, crisp, uniform).
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    img = img.convert("RGB")
    img = img.resize((256, 256), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, "WEBP", quality=82)
    b64 = buf.getvalue()
    if len(b64) > MAX_AVATAR_DATA_URL:
        # Extremely unlikely at 256px q82, but keep the stored blob bounded.
        _400("Avatar image is too large after processing")
    import base64
    data_url = "data:image/webp;base64," + base64.b64encode(b64).decode()
    s = _totp_settings(user)
    s["avatar"] = data_url
    user.settings = json.dumps(s)
    db.commit()
    return {"status": "updated", "avatar": data_url}


@router.delete("/api/user/avatar")
@limiter.limit("10/minute")
def clear_avatar(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Remove the user's avatar (falls back to the username initial)."""
    s = _totp_settings(user)
    s.pop("avatar", None)
    user.settings = json.dumps(s)
    db.commit()
    return {"status": "updated", "avatar": ""}
