# GlbTOKEN — Global Token for Premium AI Models

**One balance. 340+ AI models. Pay-as-you-go.**

## Architecture

```
├── *.html / *.js        # Frontend (GitHub Pages — 35 pages, static SPA)
├── backend/
│   ├── main.py          # FastAPI server (app factory, CORS, /v1 gateway)
│   ├── database.py      # SQLAlchemy models (PostgreSQL on Railway, SQLite fallback)
│   ├── auth.py          # JWT (1h access + 30d refresh, hashed at rest)
│   ├── auth0.py         # Auth0 passwordless email/SMS + social OAuth
│   ├── totp.py          # TOTP 2FA (RFC 6238, stdlib only — zero deps)
│   ├── newapi_integration.py  # New API routing engine sync (users, quota, pricing)
│   ├── routes/          # auth_routes, chat, payments, api_keys, models, presets,
│   │                    # referrals, organizations, analytics, admin, misc, v1_gateway
│   └── requirements.txt
```

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
python3 -m http.server 8080   # open http://localhost:8080
```

Frontend defaults to `http://localhost:8000` for the API — set `API_BASE_URL`
to your deployed backend (see `shared.js`).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GLBTOKEN_SECRET` | JWT signing secret (auto-generated if missing) |
| `DATABASE_URL` | PostgreSQL URL (Railway provides `postgres://`; SQLite fallback locally) |
| `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | Auth0 passwordless email/SMS + social login |
| `NEW_API_BASE_URL` / `NEW_API_ADMIN_TOKEN` | New API routing engine (users, quota, model pricing) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Card payments |
| `PAYSTACK_SECRET_KEY` | Paystack payments (emerging markets) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Transactional email (verify, reset, invites, **login & low-balance alerts**) |
| `PORT` | Server port (default: 8000) |

## API Groups (108 routes)

| Group | Description |
|-------|-------------|
| `/api/auth/*` | Register, passwordless email/SMS, social OAuth, password reset, **2FA (TOTP setup/enable/disable/confirm)** |
| `/api/keys` | API key CRUD (per-key usage + rate limits) |
| `/api/chat` + `/api/playground/*` | Proxied model chat (atomic billing, max_tokens clamp, 402 on insufficient balance) |
| `/api/models` | Model list, providers, pricing (auto-synced from New API every 6h) |
| `/api/topup` + `/api/payments/*` | Stripe / Paystack / crypto top-up (provider-verified, idempotent webhooks) |
| `/api/dashboard` / `/api/transactions` / `/api/analytics` | Usage, billing, per-key analytics (TTL-cached) |
| `/api/orgs/*` | Teams, invites, roles |
| `/api/referrals` | Referral program (double-claim race guarded) |
| `/api/admin/*` | Admin: users, balance adjust, rates, providers, sync (admin-only + rate-limited) |
| `/v1/*` | OpenAI-compatible gateway for user API keys (CORS open, key-authenticated) |

## Security Highlights

- bcrypt password hashing; JWT 1h access + 30d refresh (SHA-256 hashed in DB)
- Atomic balance deduction — cannot go negative under concurrency
- Provider-verified top-up crediting (webhook + idempotency, no client-minted tokens)
- Rate limiting (slowapi) on auth, payments, key creation; admin routes locked down
- XSS: all dynamic HTML escaped; CSV export guarded against formula injection
- SSRF / open-redirect: all outbound URLs and redirects are hardcoded allowlists
- Login history records real client IP (XFF spoof-proof)
- Optional TOTP two-factor auth per user

## Deploy

### Railway (backend)

```bash
# Build:  cd backend && pip install -r requirements.txt
# Start:  uvicorn main:app --host 0.0.0.0 --port $PORT
```

### GitHub Pages (frontend)

Push to the repo; Pages serves the static site. Hard-refresh after deploys
(asset versions are bumped per change to bust cache).
