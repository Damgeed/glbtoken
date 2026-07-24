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
    try:
        auto_pull_models()
    except Exception as e:
        print(f"⚠️ Auto-pull error (non-critical): {e}")
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
            response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://glbtoken-backend-production.up.railway.app; frame-src 'self' https://www.google.com; object-src 'none'"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), midi=(), sync-xhr=(), accelerometer=(), gyroscope=(), magnetometer=(), fullscreen=(self)"
        return response


app.add_middleware(SecurityHeadersMiddleware)


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


# ── Startup check ──

if not _smtp_host:
    print("⚠️  SMTP not configured — password reset and email verification will silently fail.")


if __name__ == "__main__":
    import uvicorn
    import sys
    port = int(os.getenv("PORT", "8000"))
    sys.stdout.flush()
    uvicorn.run(app, host="0.0.0.0", port=port)
