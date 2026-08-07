"""GlbTOKEN — OpenAI-compatible /v1 API gateway.

This is the core product surface: users call
    base_url="https://api.glbtoken.com/v1"
with their GlbTOKEN API key and standard OpenAI/Anthropic SDKs.

Authenticates via the user's API key (gtk_... / sk-...), routes to the
New API gateway (or fallback), and bills the user's token balance from the
REAL usage reported by the model provider.
"""

import ipaddress
import json
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import update

from common import (
    _400, _401, _402, _403, _429, _502, limiter,
    NEW_API_BASE_URL, FALLBACK_API_KEY, FALLBACK_API_URL,
)
from routes.referrals import grant_referral_reward
from database import get_db, User, ApiKey, Transaction, AIModel

router = APIRouter()


# ── Request Schemas ──

class ChatCompletionRequest(BaseModel):
    model: str
    messages: list
    max_tokens: int = 4096
    temperature: float = 1.0
    top_p: float = 1.0
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0
    stream: bool = False
    stop: object = None
    user: str = ""


class ResponsesRequest(BaseModel):
    model: str
    input: object = None
    instructions: str = ""
    max_output_tokens: int = 4096
    stream: bool = False


class MessagesRequest(BaseModel):
    model: str
    messages: list
    max_tokens: int = 4096
    temperature: float = 1.0
    stream: bool = False


# ── Helpers ──

# In-memory per-key rate limiting (sliding 60s window). Per-process; fine for
# single-replica deployments, and the global slowapi limiter still applies too.
_key_rate = {}


def _check_key_rate(key_id: int, rpm: int):
    now = time.time()
    arr = _key_rate.setdefault(key_id, [])
    while arr and arr[0] < now - 60:
        arr.pop(0)
    if len(arr) >= rpm:
        _429("Rate limit exceeded for this API key")
    arr.append(now)
    if len(arr) > 2000:  # prevent unbounded growth
        _key_rate[key_id] = arr[-1000:]


def _ip_allowed(client_ip: str, allowlist: str) -> bool:
    if not client_ip:
        return False
    for entry in allowlist.split(","):
        entry = entry.strip()
        if not entry:
            continue
        if "/" in entry:
            try:
                if ipaddress.ip_address(client_ip) in ipaddress.ip_network(entry, strict=False):
                    return True
            except Exception as e:
                print(f"⚠️ IP allowlist entry skipped (invalid): {entry} — {e}")
                continue
        elif entry == client_ip:
            return True
    return False


def _auth_user(db: Session, authorization: str, request: Request = None, require_write: bool = False):
    """Resolve a GlbTOKEN API key (Bearer gtk_... / sk-...) to (user, api_key).

    Enforces per-key expiry, IP allowlist, rate limit, and read-only permission.
    """
    raw = (authorization or "").strip()
    if raw.lower().startswith("bearer "):
        raw = raw[7:].strip()
    if not raw:
        _401("Not authenticated")
    api_key = db.query(ApiKey).filter(
        ApiKey.key == raw, ApiKey.is_active == True
    ).first()
    if not api_key:
        _401("Invalid API key")

    # Read-only keys may only call read endpoints (e.g. GET /v1/models)
    if require_write and api_key.permissions == "read_only":
        _403("This API key is read-only")

    # Expiry
    if api_key.expires_at is not None:
        exp = api_key.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > exp:
            _403("API key expired")

    # IP allowlist
    if api_key.ip_allowlist:
        client_ip = request.client.host if (request and request.client) else ""
        if not _ip_allowed(client_ip, api_key.ip_allowlist):
            _403("IP not allowed for this API key")

    # Per-key rate limit
    if api_key.rate_limit_rpm and api_key.rate_limit_rpm > 0:
        _check_key_rate(api_key.id, api_key.rate_limit_rpm)

    user = db.query(User).filter(User.id == api_key.user_id).first()
    if not user:
        _401("Invalid API key")
    return user, api_key


def _estimate_tokens(texts: list) -> int:
    total = 0
    for t in texts:
        if isinstance(t, str):
            total += len(t)
        elif isinstance(t, (list, dict)):
            try:
                total += len(json.dumps(t))
            except Exception as e:
                print(f"⚠️ token estimate failed for item: {e}")
                total += 0
    return max(1, total // 4)


def _bill(db: Session, user: User, api_key: ApiKey, model: str,
          cost_est: int, result: dict, payment_method: str = "api_key"):
    """Deduct REAL usage from the response; fall back to estimate. Records tx.

    Atomic: decrements balance only if sufficient (prevents concurrent overdraft).
    """
    usage = result.get("usage") or {}
    real = int(usage.get("total_tokens") or 0)
    cost = max(1, real or cost_est)
    # Atomic decrement — fails (rowcount 0) when balance < cost, even under concurrency.
    res = db.execute(
        update(User)
        .where(User.id == user.id, User.token_balance >= cost)
        .values(token_balance=User.token_balance - cost)
    )
    if res.rowcount == 0:
        db.rollback()
        _402("Insufficient balance")
    db.refresh(user)
    api_key.request_count = (api_key.request_count or 0) + 1
    api_key.last_used = datetime.now(timezone.utc)
    tx = Transaction(
        user_id=user.id, type="consumption", amount=0,
        payment_method=payment_method, model_used=model,
        tokens=cost, status="completed", key_id=api_key.id,
    )
    db.add(tx)
    db.commit()
    # Referral: reward the referrer on the referred user's FIRST paid call
    grant_referral_reward(db, user)
    result["tokens_used"] = cost
    result["balance_remaining"] = user.token_balance
    return result


async def _route(endpoint_path: str, user: User, payload: dict, timeout: int = 120):
    """POST to New API (user token) or fallback. Returns httpx.Response."""
    newapi_key = user.newapi_token
    newapi_url = NEW_API_BASE_URL
    headers = {"Content-Type": "application/json"}
    if newapi_key and newapi_url:
        headers["Authorization"] = f"Bearer {newapi_key}"
        url = f"{newapi_url.rstrip('/')}{endpoint_path}"
    else:
        fallback_key = FALLBACK_API_KEY
        if not fallback_key:
            _400("No AI routing configured. Set NEW_API_BASE_URL or FALLBACK_API_KEY")
        headers = {
            "Authorization": f"Bearer {fallback_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://glbtoken.com",
            "X-Title": "GlbTOKEN",
        }
        fallback_url = FALLBACK_API_URL
        if not fallback_url:
            _400("No AI routing configured")
        url = f"{fallback_url.rstrip('/')}{endpoint_path}"
    async with httpx.AsyncClient(timeout=timeout) as client:
        return await client.post(url, headers=headers, json=payload)


# ── Endpoints ──

@router.post("/v1/chat/completions")
@limiter.limit("120/minute")
async def chat_completions(
    request: Request,
    req: ChatCompletionRequest,
    authorization: str = Header("", alias="Authorization"),
    db: Session = Depends(get_db),
):
    user, api_key = _auth_user(db, authorization, request, require_write=True)

    # Pre-flight balance check (estimate)
    texts = []
    for m in req.messages:
        if isinstance(m, dict):
            c = m.get("content", "")
            texts.append(c)
    cost_est = int(_estimate_tokens(texts) + min(req.max_tokens, 4096)) * 2 // 1000
    cost_est = max(1, cost_est)
    if user.token_balance < cost_est:
        _402(f"Insufficient balance. Need {cost_est} tokens, have {user.token_balance}")

    payload = {
        "model": req.model,
        "messages": req.messages,
        "max_tokens": req.max_tokens,
        "temperature": req.temperature,
        "top_p": req.top_p,
        "frequency_penalty": req.frequency_penalty,
        "presence_penalty": req.presence_penalty,
        "stream": req.stream,
    }
    resp = await _route("/v1/chat/completions", user, payload)
    if resp.status_code != 200:
        _502("AI API error. Please try again later.")
    result = resp.json()
    return _bill(db, user, api_key, req.model, cost_est, result)


@router.get("/v1/models")
@limiter.limit("120/minute")
async def list_models(
    request: Request,
    authorization: str = Header("", alias="Authorization"),
    db: Session = Depends(get_db),
):
    user, api_key = _auth_user(db, authorization, request)
    models = db.query(AIModel).filter(
        AIModel.is_active == True
    ).order_by(AIModel.provider, AIModel.model_id).all()
    return {
        "object": "list",
        "data": [
            {
                "id": m.model_id,
                "object": "model",
                "created": 0,
                "owned_by": m.provider,
            }
            for m in models
        ],
    }


@router.post("/v1/responses")
@limiter.limit("60/minute")
async def responses_api(
    request: Request,
    req: ResponsesRequest,
    authorization: str = Header("", alias="Authorization"),
    db: Session = Depends(get_db),
):
    """OpenAI Responses API passthrough (billed on real usage)."""
    user, api_key = _auth_user(db, authorization, request, require_write=True)
    inp = req.input if isinstance(req.input, list) else [req.input] if req.input else []
    cost_est = max(1, int(_estimate_tokens([inp]) + min(req.max_output_tokens, 4096)) * 2 // 1000)
    if user.token_balance < cost_est:
        _402(f"Insufficient balance. Need {cost_est} tokens, have {user.token_balance}")
    payload = {
        "model": req.model,
        "input": req.input,
        "instructions": req.instructions,
        "max_output_tokens": req.max_output_tokens,
        "stream": req.stream,
    }
    resp = await _route("/v1/responses", user, payload)
    if resp.status_code != 200:
        _502("AI API error. Please try again later.")
    return _bill(db, user, api_key, req.model, cost_est, resp.json())


@router.post("/v1/messages")
@limiter.limit("60/minute")
async def messages_api(
    request: Request,
    req: MessagesRequest,
    authorization: str = Header("", alias="Authorization"),
    db: Session = Depends(get_db),
):
    """Anthropic Messages API passthrough (billed on real usage)."""
    user, api_key = _auth_user(db, authorization, request, require_write=True)
    texts = [m.get("content", "") for m in req.messages if isinstance(m, dict)]
    cost_est = max(1, int(_estimate_tokens(texts) + min(req.max_tokens, 4096)) * 2 // 1000)
    if user.token_balance < cost_est:
        _402(f"Insufficient balance. Need {cost_est} tokens, have {user.token_balance}")
    payload = {
        "model": req.model,
        "messages": req.messages,
        "max_tokens": req.max_tokens,
        "temperature": req.temperature,
        "stream": req.stream,
    }
    resp = await _route("/v1/messages", user, payload)
    if resp.status_code != 200:
        _502("AI API error. Please try again later.")
    return _bill(db, user, api_key, req.model, cost_est, resp.json())
