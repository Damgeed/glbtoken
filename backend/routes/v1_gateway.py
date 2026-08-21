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
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, update

from common import (
    _400, _401, _402, _403, _429, _502, limiter,
    NEW_API_BASE_URL, FALLBACK_API_KEY, FALLBACK_API_URL, real_client_ip,
)
from routes.referrals import grant_referral_reward
from database import get_db, SessionLocal, User, ApiKey, Transaction, AIModel
from metering import budget_snapshot, provider_for_model, usage_metrics
from newapi_integration import get_gateway_token

router = APIRouter()


# ── Request Schemas ──

class GatewayRequest(BaseModel):
    # Preserve OpenAI/Anthropic-compatible fields we do not explicitly model
    # yet (tools, response_format, seed, metadata, system, and future fields).
    model_config = ConfigDict(extra="allow")


class ChatCompletionRequest(GatewayRequest):
    model: str = ""
    models: list[str] = Field(default_factory=list)
    messages: list
    max_tokens: int = 4096
    temperature: float = 1.0
    top_p: float = 1.0
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0
    stream: bool = False
    stop: object = None
    user: str = ""


class ResponsesRequest(GatewayRequest):
    model: str = ""
    models: list[str] = Field(default_factory=list)
    input: object = None
    instructions: str = ""
    max_output_tokens: int = 4096
    stream: bool = False


class MessagesRequest(GatewayRequest):
    model: str = ""
    models: list[str] = Field(default_factory=list)
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
    if len(_key_rate) > 10000:
        # Evict idle keys (no activity in the last 60s) to bound memory growth
        # as the key population grows over time.
        cutoff = now - 60
        for k in [k for k, v in _key_rate.items() if not v or v[-1] < cutoff]:
            del _key_rate[k]
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
    from sqlalchemy import or_
    from auth import hash_api_key
    key_hash = hash_api_key(raw)
    api_key = db.query(ApiKey).filter(
        or_(ApiKey.key_hash == key_hash, ApiKey.key == raw),
        ApiKey.is_active == True
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
        # Use the real client IP (validated proxy header) — request.client.host
        # is the ingress proxy IP behind Railway/Cloudflare and would block
        # every allowlisted key.
        client_ip = real_client_ip(request) if request else ""
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


def _candidate_models(db: Session, primary: str, fallbacks: list[str]) -> list[str]:
    """Return up to five unique, active catalog models in client order."""
    candidates = []
    for value in [primary] + list(fallbacks or []):
        model = str(value or "").strip()
        if model and model not in candidates:
            candidates.append(model)
    if not candidates:
        _400("model or models is required")
    if len(candidates) > 5:
        _400("At most 5 fallback models are allowed")
    active = {
        row[0] for row in db.query(AIModel.model_id).filter(
            AIModel.model_id.in_(candidates), AIModel.is_active == True
        ).all()
    }
    unavailable = [model for model in candidates if model not in active]
    if unavailable:
        _400("Unknown or inactive model: " + unavailable[0])
    return candidates


def _enforce_monthly_budgets(db: Session, user: User, api_key: ApiKey):
    snapshot = budget_snapshot(db, user, api_key)
    if snapshot.get("account_exhausted"):
        _402("Monthly account token budget reached")
    if snapshot.get("key_exhausted"):
        _402("Monthly API key token budget reached")


def _request_id(result: dict, response: httpx.Response = None) -> str:
    value = (result or {}).get("id")
    if not value and response is not None:
        value = response.headers.get("x-request-id") or response.headers.get("request-id")
    return str(value)[:200] if value else None


def _bill(db: Session, user: User, api_key: ApiKey, model: str,
          cost_est: int, result: dict, payment_method: str = "api_key",
          requested_model: str = "", latency_ms: float = None,
          response: httpx.Response = None):
    """Deduct REAL usage from the response; fall back to estimate. Records tx.

    Atomic: decrements balance only if sufficient (prevents concurrent overdraft).
    """
    metrics = usage_metrics(result)
    real = int(metrics["total_tokens"] or 0)
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
    # Atomic SQL-side increment — a Python read-modify-write would lose counts
    # under concurrent /v1 calls (the row is shared across all of a user's keys).
    db.execute(
        update(ApiKey).where(ApiKey.id == api_key.id).values(
            request_count=func.coalesce(ApiKey.request_count, 0) + 1
        )
    )
    api_key.last_used = datetime.now(timezone.utc)
    tx = Transaction(
        user_id=user.id, type="consumption", amount=0,
        payment_method=payment_method, model_used=model,
        requested_model=requested_model or model,
        provider=provider_for_model(db, model, result),
        request_id=_request_id(result, response),
        prompt_tokens=metrics["prompt_tokens"],
        completion_tokens=metrics["completion_tokens"],
        reasoning_tokens=metrics["reasoning_tokens"],
        cached_tokens=metrics["cached_tokens"],
        latency_ms=latency_ms,
        upstream_cost=metrics["upstream_cost"],
        status_code=response.status_code if response is not None else 200,
        tokens=cost, status="completed", key_id=api_key.id,
    )
    db.add(tx)
    db.commit()
    # Referral: reward the referrer on the referred user's FIRST paid call
    grant_referral_reward(db, user)
    result["tokens_used"] = cost
    result["balance_remaining"] = user.token_balance
    return result


def _record_failure(db: Session, user: User, api_key: ApiKey, model: str,
                    requested_model: str, status_code: int,
                    latency_ms: float, response: httpx.Response = None):
    db.execute(
        update(ApiKey).where(ApiKey.id == api_key.id).values(
            request_count=func.coalesce(ApiKey.request_count, 0) + 1
        )
    )
    api_key.last_used = datetime.now(timezone.utc)
    db.add(Transaction(
        user_id=user.id,
        type="consumption",
        amount=0,
        payment_method="api_key",
        model_used=model,
        requested_model=requested_model or model,
        provider=provider_for_model(db, model),
        request_id=_request_id({}, response),
        tokens=0,
        status="failed",
        status_code=status_code,
        latency_ms=latency_ms,
        key_id=api_key.id,
    ))
    db.commit()


def _upstream_config(user: User, endpoint_path: str):
    """Resolve NewAPI first, falling back only when it is not configured."""
    newapi_key = user.newapi_token or (get_gateway_token() if NEW_API_BASE_URL else "")
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
    return url, headers


async def _route(endpoint_path: str, user: User, payload: dict, timeout: int = 120):
    """POST to NewAPI (shared/user token) or the configured fallback."""
    url, headers = _upstream_config(user, endpoint_path)
    async with httpx.AsyncClient(timeout=timeout) as client:
        return await client.post(url, headers=headers, json=payload)


def _retryable_upstream_status(status_code: int) -> bool:
    return status_code in (408, 409, 429) or status_code >= 500


async def _route_with_model_fallbacks(endpoint_path: str, user: User,
                                      payload: dict, candidates: list[str],
                                      timeout: int = 120):
    """Try the next model only for transient upstream failures."""
    started = time.perf_counter()
    last_response = None
    selected = candidates[0]
    for index, model in enumerate(candidates):
        selected = model
        attempt = dict(payload)
        attempt["model"] = model
        try:
            last_response = await _route(endpoint_path, user, attempt, timeout=timeout)
        except httpx.RequestError:
            last_response = httpx.Response(
                502,
                json={"error": "upstream unavailable"},
                request=httpx.Request("POST", "https://gateway.invalid" + endpoint_path),
            )
        if last_response.status_code < 400:
            break
        if index == len(candidates) - 1 or not _retryable_upstream_status(last_response.status_code):
            break
    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    return last_response, selected, latency_ms


async def _open_stream_with_model_fallbacks(endpoint_path: str, user: User,
                                            payload: dict, candidates: list[str],
                                            timeout: int = 120):
    """Open an SSE response, retrying only before any response body is sent."""
    started = time.perf_counter()
    last_client = None
    last_response = None
    selected = candidates[0]
    for index, model in enumerate(candidates):
        selected = model
        attempt = dict(payload)
        attempt["model"] = model
        url, headers = _upstream_config(user, endpoint_path)
        client = httpx.AsyncClient(timeout=timeout)
        request = client.build_request("POST", url, headers=headers, json=attempt)
        try:
            response = await client.send(request, stream=True)
        except httpx.RequestError:
            await client.aclose()
            response = httpx.Response(
                502,
                json={"error": "upstream unavailable"},
                request=request,
            )
        last_client, last_response = client, response
        if response.status_code < 400:
            break
        if index == len(candidates) - 1 or not _retryable_upstream_status(response.status_code):
            break
        await response.aclose()
        await client.aclose()
    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    return last_client, last_response, selected, latency_ms, started


def _streaming_response(client: httpx.AsyncClient, response: httpx.Response,
                        user_id: int, key_id: int, model: str,
                        requested_model: str, cost_est: int, started: float):
    """Forward SSE bytes and persist usage after the upstream stream closes."""
    async def body_iter():
        buffered = ""
        metering_result = {}
        try:
            async for chunk in response.aiter_bytes():
                if chunk:
                    yield chunk
                    buffered += chunk.decode("utf-8", errors="ignore")
                    lines = buffered.split("\n")
                    buffered = lines.pop()
                    for raw_line in lines:
                        line = raw_line.strip()
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if not payload or payload == "[DONE]":
                            continue
                        try:
                            event = json.loads(payload)
                        except (json.JSONDecodeError, TypeError):
                            continue
                        if not isinstance(event, dict):
                            continue
                        if event.get("usage"):
                            metering_result["usage"] = event["usage"]
                        if event.get("id"):
                            metering_result["id"] = event["id"]
                        if event.get("provider"):
                            metering_result["provider"] = event["provider"]
        finally:
            await response.aclose()
            await client.aclose()
            session = SessionLocal()
            try:
                fresh_user = session.query(User).filter(User.id == user_id).first()
                fresh_key = session.query(ApiKey).filter(ApiKey.id == key_id).first()
                if fresh_user and fresh_key:
                    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
                    _bill(
                        session, fresh_user, fresh_key, model, cost_est,
                        metering_result, requested_model=requested_model,
                        latency_ms=elapsed_ms, response=response,
                    )
            except Exception as exc:
                session.rollback()
                print(f"⚠️ Streaming usage persistence failed: {exc}")
            finally:
                session.close()

    headers = {}
    request_id = response.headers.get("x-request-id") or response.headers.get("request-id")
    if request_id:
        headers["x-request-id"] = request_id
    return StreamingResponse(
        body_iter(),
        status_code=response.status_code,
        media_type="text/event-stream",
        headers=headers,
    )


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
    candidates = _candidate_models(db, req.model, req.models)
    requested_model = candidates[0]
    _enforce_monthly_budgets(db, user, api_key)

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

    payload = req.model_dump(exclude={"models"}, exclude_none=True)
    payload["model"] = requested_model
    if req.stream:
        payload["stream_options"] = {"include_usage": True}
        client, resp, selected_model, latency_ms, started = await _open_stream_with_model_fallbacks(
            "/v1/chat/completions", user, payload, candidates
        )
        if resp.status_code >= 400:
            await resp.aread()
            _record_failure(db, user, api_key, selected_model, requested_model, resp.status_code, latency_ms, resp)
            await resp.aclose()
            await client.aclose()
            _502("AI API error. Please try again later.")
        return _streaming_response(
            client, resp, user.id, api_key.id, selected_model,
            requested_model, cost_est, started,
        )

    resp, selected_model, latency_ms = await _route_with_model_fallbacks(
        "/v1/chat/completions", user, payload, candidates
    )
    if not 200 <= resp.status_code < 300:
        _record_failure(db, user, api_key, selected_model, requested_model, resp.status_code, latency_ms, resp)
        _502("AI API error. Please try again later.")
    try:
        result = resp.json()
    except Exception:
        _record_failure(db, user, api_key, selected_model, requested_model, 502, latency_ms, resp)
        _502("AI API returned an invalid response")
    if not isinstance(result, dict):
        _record_failure(db, user, api_key, selected_model, requested_model, 502, latency_ms, resp)
        _502("AI API returned an invalid response")
    return _bill(
        db, user, api_key, selected_model, cost_est, result,
        requested_model=requested_model, latency_ms=latency_ms, response=resp,
    )


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
    candidates = _candidate_models(db, req.model, req.models)
    requested_model = candidates[0]
    _enforce_monthly_budgets(db, user, api_key)
    if req.stream:
        _400("Streaming is currently supported on /v1/chat/completions only")
    inp = req.input if isinstance(req.input, list) else [req.input] if req.input else []
    cost_est = max(1, int(_estimate_tokens([inp]) + min(req.max_output_tokens, 4096)) * 2 // 1000)
    if user.token_balance < cost_est:
        _402(f"Insufficient balance. Need {cost_est} tokens, have {user.token_balance}")
    payload = req.model_dump(exclude={"models"}, exclude_none=True)
    payload["model"] = requested_model
    resp, selected_model, latency_ms = await _route_with_model_fallbacks(
        "/v1/responses", user, payload, candidates
    )
    if not 200 <= resp.status_code < 300:
        _record_failure(db, user, api_key, selected_model, requested_model, resp.status_code, latency_ms, resp)
        _502("AI API error. Please try again later.")
    try:
        result = resp.json()
    except Exception:
        _record_failure(db, user, api_key, selected_model, requested_model, 502, latency_ms, resp)
        _502("AI API returned an invalid response")
    if not isinstance(result, dict):
        _record_failure(db, user, api_key, selected_model, requested_model, 502, latency_ms, resp)
        _502("AI API returned an invalid response")
    return _bill(
        db, user, api_key, selected_model, cost_est, result,
        requested_model=requested_model, latency_ms=latency_ms, response=resp,
    )


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
    candidates = _candidate_models(db, req.model, req.models)
    requested_model = candidates[0]
    _enforce_monthly_budgets(db, user, api_key)
    if req.stream:
        _400("Streaming is currently supported on /v1/chat/completions only")
    texts = [m.get("content", "") for m in req.messages if isinstance(m, dict)]
    cost_est = max(1, int(_estimate_tokens(texts) + min(req.max_tokens, 4096)) * 2 // 1000)
    if user.token_balance < cost_est:
        _402(f"Insufficient balance. Need {cost_est} tokens, have {user.token_balance}")
    payload = req.model_dump(exclude={"models"}, exclude_none=True)
    payload["model"] = requested_model
    resp, selected_model, latency_ms = await _route_with_model_fallbacks(
        "/v1/messages", user, payload, candidates
    )
    if not 200 <= resp.status_code < 300:
        _record_failure(db, user, api_key, selected_model, requested_model, resp.status_code, latency_ms, resp)
        _502("AI API error. Please try again later.")
    try:
        result = resp.json()
    except Exception:
        _record_failure(db, user, api_key, selected_model, requested_model, 502, latency_ms, resp)
        _502("AI API returned an invalid response")
    if not isinstance(result, dict):
        _record_failure(db, user, api_key, selected_model, requested_model, 502, latency_ms, resp)
        _502("AI API returned an invalid response")
    return _bill(
        db, user, api_key, selected_model, cost_est, result,
        requested_model=requested_model, latency_ms=latency_ms, response=resp,
    )
