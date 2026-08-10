"""GlbTOKEN Backend — FastAPI Server
Run: uvicorn main:app --reload

Clean orchestrator that imports and includes all route modules.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
import asyncio
import os

from database import init_db
from common import limiter, _smtp_host

# ── Import all routers ──
from routes.auth_routes import router as auth_router
from routes.payments import router as payments_router
from routes.organizations import router as orgs_router
from routes.presets import router as presets_router
from routes.admin import router as admin_router
from routes.chat import router as chat_router
from routes.models import router as models_router, seed_models, auto_pull_models
from routes.analytics import router as analytics_router
from routes.api_keys import router as api_keys_router
from routes.referrals import router as referrals_router
from routes.misc import router as misc_router
from routes.v1_gateway import router as v1_router


# ── Lifespan ──

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    seed_models()
    # Auto-migrate: add all potentially missing columns
    try:
        from database import engine, User
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        existing_columns = {c['name'] for c in inspector.get_columns('users')}
        all_columns = {
            'newapi_user_id': 'INTEGER',
            'newapi_token': 'VARCHAR',
            'settings': "TEXT DEFAULT '{}'",
            'referral_code': 'VARCHAR',
            'referral_earnings': "FLOAT DEFAULT 0.0",
            'referred_by': 'VARCHAR',
            'signup_ip': "VARCHAR DEFAULT ''",
            'referral_source': "VARCHAR DEFAULT ''",
            'default_payment_method_id': 'VARCHAR',
            'public_id': 'VARCHAR',
        }
        with engine.connect() as conn:
            for col_name, col_type in all_columns.items():
                if col_name not in existing_columns:
                    sql = text(f'ALTER TABLE users ADD COLUMN IF NOT EXISTS "{col_name}" {col_type}')
                    conn.execute(sql)
                    print(f"✅ Added missing column: {col_name}")
            conn.commit()
        # Backfill public_id for existing users (u_xxx format)
        try:
            from common import ensure_public_id
            from database import SessionLocal
            from sqlalchemy import select
            s = SessionLocal()
            try:
                users = s.execute(select(User)).scalars().all()
                changed = 0
                for u in users:
                    if not getattr(u, "public_id", None):
                        ensure_public_id(u)
                        changed += 1
                if changed:
                    s.commit()
                    print(f"✅ Backfilled public_id for {changed} existing users")
            finally:
                s.close()
        except Exception as e:
            print(f"⚠️ public_id backfill error (non-critical): {e}")
    except Exception as e:
        print(f"⚠️ Migration error (non-critical): {e}")
    # Auto-migrate: API key + transaction new columns
    try:
        from database import engine
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        key_cols = {c['name'] for c in inspector.get_columns('api_keys')}
        key_add = {
            'expires_at': 'TIMESTAMP',
            'rate_limit_rpm': 'INTEGER',
            'ip_allowlist': 'TEXT',
        }
        tx_cols = {c['name'] for c in inspector.get_columns('transactions')}
        tx_add = {'key_id': 'INTEGER'}
        with engine.connect() as conn:
            for col_name, col_type in key_add.items():
                if col_name not in key_cols:
                    conn.execute(text(f'ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS "{col_name}" {col_type}'))
                    print(f"✅ Added missing column: api_keys.{col_name}")
            for col_name, col_type in tx_add.items():
                if col_name not in tx_cols:
                    conn.execute(text(f'ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "{col_name}" {col_type}'))
                    print(f"✅ Added missing column: transactions.{col_name}")
            conn.commit()
    except Exception as e:
        print(f"⚠️ Migration error (api keys, non-critical): {e}")
    # Auto-migrate: refresh_tokens device columns (sessions list shows browser names)
    try:
        from database import engine
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        rt_cols = {c['name'] for c in inspector.get_columns('refresh_tokens')}
        rt_add = {
            'user_agent': "VARCHAR DEFAULT ''",
            'device_type': "VARCHAR DEFAULT ''",
        }
        with engine.connect() as conn:
            for col_name, col_type in rt_add.items():
                if col_name not in rt_cols:
                    conn.execute(text(f'ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS "{col_name}" {col_type}'))
                    print(f"✅ Added missing column: refresh_tokens.{col_name}")
            conn.commit()
    except Exception as e:
        print(f"⚠️ Migration error (refresh_tokens, non-critical): {e}")
    # Auto-migrate: org capacity — bump existing orgs to the current default
    try:
        from database import engine, MAX_ORG_MEMBERS
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text(
                f'UPDATE organizations SET max_members = {MAX_ORG_MEMBERS} '
                f'WHERE max_members < {MAX_ORG_MEMBERS}'
            ))
            conn.commit()
            print(f"✅ Org capacity bumped to {MAX_ORG_MEMBERS}")
    except Exception as e:
        print(f"⚠️ Org capacity migration error (non-critical): {e}")
    try:
        auto_pull_models()
    except Exception as e:
        print(f"⚠️ Auto-pull error (non-critical): {e}")
    # Auto-migrate: performance indexes (idempotent — safe on existing DBs)
    try:
        from database import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_user_id ON transactions (user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_user_type_created ON transactions (user_id, type, created_at)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_login_events_user_id ON login_events (user_id)"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_redemption_referred_user ON referral_redemptions (referred_user_id)"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_org_member ON org_members (org_id, user_id)"))
            conn.commit()
            print("✅ Performance + integrity indexes ensured")
    except Exception as e:
        print(f"⚠️ Index migration error (non-critical): {e}")

    # Periodic model/pricing sync — New API prices change without redeploys, so
    # re-pull every 6h to keep AIModel.prompt_price/completion_price in sync.
    async def _periodic_model_sync():
        while True:
            await asyncio.sleep(6 * 3600)
            try:
                await asyncio.to_thread(auto_pull_models)
                print("🔄 Periodic model/pricing sync completed")
            except Exception as e:
                print(f"⚠️ Periodic model sync failed: {e}")

    sync_task = asyncio.create_task(_periodic_model_sync())

    yield
    # Shutdown
    sync_task.cancel()


# ── App Creation ──

app = FastAPI(title="GlbTOKEN API", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

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
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    max_age=60,  # Low max-age to prevent stale preflight cache
)


# ── Security Headers ──

# ── Request Body Size Limit ──
# Reject oversized JSON bodies before parsing (auth'd DoS guard: chat/completion
# payloads and conversation saves are the only large-JSON endpoints, and none
# legitimately exceed 2 MB). Multipart uploads (avatar) are exempt — the avatar
# endpoint enforces its own 5 MB cap.
MAX_JSON_BODY_BYTES = 2 * 1024 * 1024

class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        ctype = request.headers.get("content-type", "")
        if ctype.startswith("application/json"):
            cl = request.headers.get("content-length")
            if cl and cl.isdigit() and int(cl) > MAX_JSON_BODY_BYTES:
                return JSONResponse(status_code=413, content={"detail": "Request body too large"})
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        try:
            response = await call_next(request)
        except Exception as e:
            from starlette.responses import JSONResponse
            response = JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"}
            )
            print(f"⚠️ Unhandled exception: {e}")
        # Always add CORS headers, even on 500 errors
        origin = request.headers.get("origin")
        if origin:
            # Only echo back allowed origins (prevents credential abuse)
            allowed = ["https://glbtoken.com", "https://www.glbtoken.com",
                       "https://damgeed.github.io",
                       "http://localhost:5500", "http://localhost:8000",
                       "http://127.0.0.1:5500"]
            if origin in allowed:
                response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.glbtoken.com; frame-src 'self' https://www.google.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), midi=(), sync-xhr=(), accelerometer=(), gyroscope=(), magnetometer=(), fullscreen=(self), interest-cohort=()"
        return response


app.add_middleware(SecurityHeadersMiddleware)


# ── /v1 Gateway CORS: public API-key endpoints must work from ANY origin ──
# (users call api.glbtoken.com from their own apps / browser SDKs; auth is via
# Bearer API key, not cookies, so a wildcard origin is safe here).

class V1CORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        is_v1 = path.startswith("/v1")
        if is_v1 and request.method == "OPTIONS":
            from starlette.responses import Response
            resp = Response(status_code=204)
            resp.headers["Access-Control-Allow-Origin"] = "*"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Requested-With"
            resp.headers["Access-Control-Max-Age"] = "600"
            resp.headers["Access-Control-Allow-Credentials"] = "false"
            return resp
        response = await call_next(request)
        if is_v1:
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Credentials"] = "false"
        return response


app.add_middleware(V1CORSMiddleware)
app.add_middleware(BodySizeLimitMiddleware)


# ── Rate Limiting ──

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# SlowAPIMiddleware is what ACTUALLY enforces the @limiter.limit(...)
# decorators — without it they only register limit metadata and no request is
# ever rate limited (register 5/hour, login 10/min etc. silently no-oped).
# Added last so it is the outermost middleware and rejects before anything else.
from slowapi.middleware import SlowAPIMiddleware
app.add_middleware(SlowAPIMiddleware)


# ── Cloudflare Origin Guard ──
# DEFENSE-IN-DEPTH heuristic, NOT a security boundary.
#
# The Railway origin is DIRECTLY reachable (public URL), and rate limits that
# key on CF-Connecting-IP are bypassable by forging that header (watchdog
# Round 6/7). This middleware rejects sensitive auth endpoints that present NO
# cf-ray header at all — a cheap barrier against naive direct-origin hits.
#
# IMPORTANT (honest limitation): cf-ray is client-controlled when the origin
# is hit directly — an attacker can simply send a forged cf-ray and pass this
# guard. The REAL closure is network-layer: make the origin unreachable except
# through Cloudflare (Cloudflare Tunnel, or restrict Railway ingress to
# Cloudflare IP ranges / Authenticated Origin Pulls). See
# docs/railway-cloudflare-hardening.md. The app-layer IP trust rules in
# common.real_client_ip are the actual anti-bypass control: CF-Connecting-IP
# is only trusted when the direct peer is a genuine Cloudflare edge IP.
#
# Exemptions (checked before the guard):
#   - non-sensitive paths (health, /v1 gateway, webhooks, static) — /v1 uses
#     API-key auth, Stripe webhook uses signature verification
#   - loopback / private peers (local dev: uvicorn on localhost)
#   - test environment (limiter disabled in conftest)

_CF_GUARD_PREFIXES = (
    "/api/auth/", "/auth/", "/api/user/",
    "/api/payments/paystack/initialize", "/api/payments/stripe/create-checkout",
    "/api/payments/stripe/quick-recharge", "/api/payments/cards/setup",
    "/api/payments/cards/confirm", "/api/topup",
)
_CF_GUARD_ALWAYS_ALLOW = (
    "/api/auth/auth0/config", "/api/auth/auth0/social-url", "/api/auth/me",
)


class CloudflareGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path

        # Only guard sensitive prefixes
        if not path.startswith(_CF_GUARD_PREFIXES) or path in _CF_GUARD_ALWAYS_ALLOW:
            return await call_next(request)

        # Local dev / tests: loopback or private peer is never a forged origin
        # hit — it's the developer's machine. (Production peer behind Railway
        # is CGNAT 100.64.0.0/10, which is NOT loopback/private-10 in the
        # is_private sense on py3.11 — handled below by the cf-ray check.)
        from common import _is_local_peer
        if _is_local_peer(request):
            return await call_next(request)

        # Test environment: conftest disables the limiter; honor that so the
        # test suite (which uses TestClient without Cloudflare headers) keeps
        # working, while production always enforces the guard.
        if getattr(limiter, "enabled", True) is False:
            return await call_next(request)

        # Fail-closed: require proof the request came through Cloudflare.
        cf_ray = (request.headers.get("cf-ray", "") or "").strip()
        direct = (getattr(getattr(request, "client", None), "host", None)) or ""
        from common import _is_cloudflare_peer
        if cf_ray or _is_cloudflare_peer(direct):
            return await call_next(request)

        from starlette.responses import JSONResponse
        return JSONResponse(
            status_code=403,
            content={"detail": "Direct origin access is not allowed. Use https://api.glbtoken.com"}
        )


app.add_middleware(CloudflareGuardMiddleware)


# ── Root Health ──

@app.get("/")
def root():
    return {"status": "ok", "name": "GlbTOKEN API", "version": "1.0.0"}


# ── Include All Routers ──

app.include_router(auth_router)
app.include_router(payments_router)
app.include_router(orgs_router)
app.include_router(presets_router)
app.include_router(admin_router)
app.include_router(chat_router)
app.include_router(models_router)
app.include_router(analytics_router)
app.include_router(api_keys_router)
app.include_router(referrals_router)
app.include_router(misc_router)
app.include_router(v1_router)  # OpenAI-compatible /v1 gateway (api.glbtoken.com)


# ── Startup check ──

if not _smtp_host:
    print("⚠️  SMTP not configured — password reset and email verification will silently fail.")


if __name__ == "__main__":
    import uvicorn
    import sys
    port = int(os.getenv("PORT", "8000"))
    sys.stdout.flush()
    # proxy_headers=True: trust X-Forwarded-For from the Railway ingress proxy so
    # request.client.host (and the slowapi rate limiter) see the REAL client IP.
    # forwarded_allow_ips: DO NOT use "*" — it lets clients forge X-Forwarded-For
    # and bypass rate limits. Default to empty (trust no proxy headers) unless
    # FORWARDED_ALLOW_IPS is explicitly set to the ingress proxy IPs.
    forwarded_ips = os.getenv("FORWARDED_ALLOW_IPS", "").strip()
    uvicorn.run(app, host="0.0.0.0", port=port, proxy_headers=True, forwarded_allow_ips=forwarded_ips)
