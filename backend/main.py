"""GlbTOKEN Backend — FastAPI Server
Run: uvicorn main:app --reload

Clean orchestrator that imports and includes all route modules.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
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
        }
        with engine.connect() as conn:
            for col_name, col_type in all_columns.items():
                if col_name not in existing_columns:
                    sql = text(f'ALTER TABLE users ADD COLUMN IF NOT EXISTS "{col_name}" {col_type}')
                    conn.execute(sql)
                    print(f"✅ Added missing column: {col_name}")
            conn.commit()
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
            conn.commit()
            print("✅ Performance indexes ensured (transactions.user_id, transactions(user_id,type,created_at), login_events.user_id)")
    except Exception as e:
        print(f"⚠️ Index migration error (non-critical): {e}")
    yield
    # Shutdown (nothing to clean up yet)


# ── App Creation ──

app = FastAPI(title="GlbTOKEN API", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None)

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
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://glbtoken-backend-production.up.railway.app; frame-src 'self' https://www.google.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
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


# ── Rate Limiting ──

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


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
    uvicorn.run(app, host="0.0.0.0", port=port)
