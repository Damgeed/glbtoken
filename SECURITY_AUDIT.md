# GlbTOKEN Security & Data-Hygiene Review

Date: 2026-08-22

## Current result

This pass removes plaintext legacy API-key authentication, encrypts stored
upstream/TOTP/webhook secrets, replaces implicit first-user admin promotion
with a verified-email allowlist, disables implicit OAuth, keeps the PKCE
verifier out of URLs, bounds JSON request bodies, separates the admin bearer
key from the data-encryption key, upgrades vulnerable dependencies, and
replaces unsupported model-count/compliance claims with factual copy. It also
reserves a conservative worst-case token amount atomically before every model
request crosses the upstream boundary, including streamed requests.

The startup cleanup preserves users, financial transactions, model catalog
records, conversations, login history, and active sessions. It always hashes
and purges legacy plaintext API keys and encrypts legacy application secrets.
Expired/revoked refresh tokens and used/expired organization invites are only
deleted when `SECURITY_CLEANUP_DELETE_EXPIRED=true`.

## Usage reservation behavior

- The user balance and a `reserved` consumption-ledger row are committed in one
  transaction before upstream dispatch. Concurrent calls serialize on the user
  balance, and in-flight holds count toward account and API-key monthly limits.
- Immediately before the provider call, the row becomes `dispatched`. Provider
  failures and invalid responses mark that same row failed and refund the hold.
- Successful calls replace the hold with measured provider usage and refund the
  remainder. When a provider omits usage (including an interrupted stream), the
  worst-case hold remains charged and JSON responses include
  `usage_estimated: true`.
- Holds older than 15 minutes are crash-recovered on startup and before the
  user's next request. Pre-dispatch holds refund; dispatched holds retain the
  conservative charge because upstream cost may already have been incurred.
- Dashboard, billing, organization, and API-key usage aggregates exclude
  in-flight holds; the budget gate deliberately includes them.

## Required production sequence

1. Take and verify a PostgreSQL backup or Railway snapshot.
2. Set separate high-entropy values for `JWT_SECRET`, `GLBTOKEN_SECRET`, and
   `ADMIN_API_KEY`. Do not reuse any of them. If `GLBTOKEN_SECRET` already
   protects `enc:v1:` values, preserve it during this deploy; rotating it
   requires a deliberate decrypt/re-encrypt migration or secret re-entry.
3. Set `BOOTSTRAP_ADMIN_EMAILS` only to verified owner addresses. Existing
   admin rows are preserved; there is no longer an automatic “user ID 1” admin.
4. Set `TUNNEL_TOKEN`, route `api.glbtoken.com` through the Cloudflare Tunnel,
   and then remove the Railway public domain/disable public networking.
5. Confirm payment mode before deploy. Keep Stripe on an `sk_test_...` key until
   live-money acceptance is intentional, and rotate any secret that may have
   appeared in logs, tickets, screenshots, or chat.
6. Deploy once with `SECURITY_CLEANUP_DELETE_EXPIRED=false`. Review startup
   counts ending in `_pending_delete` and verify sign-in, API-key use, 2FA,
   model routing, and webhook signing.
7. After the backup and smoke test, set
   `SECURITY_CLEANUP_DELETE_EXPIRED=true` for one restart. It deletes only
   revoked/expired refresh tokens and used/expired organization invites.
8. If this database already uses Alembic, run `alembic upgrade head`. Revision
   `d5e6f7a8b9c0` purges plaintext keys and cannot reconstruct them on downgrade;
   `e6f7a8b9c0d1` adds the stale-reservation recovery index.

## Remaining risks, in priority order

| Priority | Risk | Required next change |
|---|---|---|
| P0 | A publicly reachable Railway origin permits forged edge headers and weakens per-IP abuse controls. | Complete the Cloudflare Tunnel cutover and disable Railway public networking. |
| P1 | Browser refresh tokens remain readable by JavaScript and the site CSP still permits inline script. | Move refresh tokens to Secure, HttpOnly, SameSite cookies with token-family reuse detection; then remove `unsafe-inline` using nonces/hashes. |
| P1 | OAuth-only account deletion does not require a fresh provider reauthentication when 2FA is off. | Require a short-lived deletion challenge delivered through a verified channel or recent OAuth reauth. |
| P1 | Webhook hostname validation has a DNS rebinding/TOCTOU window. | Pin the validated IP for the connection or use an outbound proxy with network policy. |
| P2 | The historical Alembic baseline assumes an already-created application schema. | Replace it with a complete baseline or add a documented bootstrap/stamp command before relying on Alembic for empty databases. |

## Verification performed

- Backend tests: `119 passed`; the suite uses a fresh temporary SQLite database
  on every run to avoid stale-journal false failures.
- Dependency audit: no known vulnerabilities in the pinned backend set.
- Migration check: existing-schema upgrade to `d5e6f7a8b9c0` verified that the
  plaintext key becomes null while hash and masked metadata remain usable.
- Static checks: no unsupported fixed catalog counts remain outside
  `how.html`, whose wording is intentionally preserved for a separate content
  decision.
