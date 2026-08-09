# Railway + Cloudflare: Origin Hardening (network layer)

**Status:** The application-layer IP-trust rules (`common.real_client_ip`) no
longer trust a client-supplied `CF-Connecting-IP` on Railway's CGNAT peer, and
the origin guard rejects header-less direct hits. **However — the only way to
fully close the "origin is publicly reachable" gap is at the network layer.**
An attacker who can reach the Railway URL directly can still hammer auth
endpoints with rotating CGNAT peer keys (per-IP rate limits cannot stop that
without ingress restriction). This doc is the industry-standard closure.

---

## Recommended: Cloudflare Tunnel (no public origin) ⭐

The gold standard: the origin has **no public URL at all**. `cloudflared`
runs inside the Railway service and dials OUT to Cloudflare; Cloudflare routes
`api.glbtoken.com` traffic through the tunnel. The Railway origin is
unreachable from the public internet, so forged headers are moot.

### Steps

1. **Cloudflare dashboard** → Zero Trust → Networks → Tunnels → Create a
   tunnel (e.g. `glbtoken-origin`). Choose "Cloudflared" connector.
2. Copy the tunnel token (`eyJhIjoi...`).
3. **Railway** → your backend service → Variables → add:
   - `TUNNEL_TOKEN=<token from step 2>`
4. **Run cloudflared in the same service.** Add a second process to the
   Procfile / start command:

   ```
   # Procfile (Railway runs both processes)
   web: uvicorn main:app --host 0.0.0.0 --port $PORT
   tunnel: cloudflared tunnel --no-autoupdate run --token $TUNNEL_TOKEN
   ```

   (Railway natively supports multiple processes in a Procfile; if the image
   lacks `cloudflared`, add `RUN curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared` to the Dockerfile.)

5. **Cloudflare dashboard → tunnel → Public Hostnames** → add
   `api.glbtoken.com` → Service `http://localhost:8000` (or the app port).
6. **Railway → Networking → remove the public domain / disable public
   networking** for the backend service. Now `railway.app` URL is gone; only
   the tunnel reaches the app.
7. Verify: `curl https://api.glbtoken.com/api/health` works; the old Railway
   URL returns connection refused / DNS failure.

> Alternative if you keep the public Railway URL but want ingress control:
> some providers allow IP-restricted networking. Railway does not expose a
> UI firewall, so the Tunnel route (above) or Authenticated Origin Pulls
> (below) are the supported paths.

---

## Alternative: Authenticated Origin Pulls (mTLS)

Cloudflare presents a client certificate at the origin; the origin rejects
connections without it. Strong, but requires TLS termination where the app
can inspect client certs — on Railway, TLS terminates at Railway's edge, so
the app cannot verify certs directly. Only viable if you move TLS termination
to the app (uvicorn with `--ssl-certfile` + client CA verification) and set
the Cloudflare zone to "Full (strict)" with Authenticated Origin Pulls
enabled. More moving parts than the Tunnel; not recommended on Railway.

---

## Defense-in-depth you already have (keep these)

| Control | Where | What it does |
|---|---|---|
| `real_client_ip` CF-CIP trust | `common.py` | CF-CIP trusted **only** when direct peer is a genuine Cloudflare edge IP — never on Railway CGNAT. Forged CF-CIP (with/without forged cf-ray) is ignored. |
| CloudflareGuardMiddleware | `main.py` | 403 on sensitive auth endpoints with no cf-ray (stops naive direct hits). NOT a boundary — cf-ray is forgeable on a direct hit. |
| XFF first-public fallback | `common.py` | Real traffic via Cloudflare gets a stable client IP for rate limits (Cloudflare sets XFF to the visitor IP). |
| `uvicorn` forwarded-allow-ips | `main.py` | Empty by default — no proxy headers trusted at the ASGI layer. |
| Webhook signature checks | payments | Stripe webhooks verified by signature, not IP. |
| `/v1` gateway | API-key auth | Not IP-rate-limited; key auth is the boundary. |

---

## Verification after deployment

```bash
# 1. Real traffic through Cloudflare (should work)
curl -s https://api.glbtoken.com/api/health

# 2. Direct origin hit — no headers (guard should 403 after deploy)
curl -s -X POST https://<railway-url>/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@b.com","password":"x"}'
# expect: {"detail":"Direct origin access is not allowed..."}

# 3. Direct origin hit — forged CF-CIP + forged cf-ray (must NOT be trusted)
curl -s -X POST https://<railway-url>/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'CF-Connecting-IP: 93.3.3.3' -H 'cf-ray: deadbeef-SIN' \
  -d '{"email":"a@b.com","password":"x"}'
# expect: 401 (bad creds) AND the login-lockout key must NOT be 93.3.3.3

# 4. With Tunnel: the Railway URL no longer resolves / refuses connection.
```
