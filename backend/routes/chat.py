"""GlbTOKEN — Chat Routes (proxy chat, playground models, playground chat, conversations)"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, update
import json
import time

from database import get_db, User, AIModel, Conversation, Transaction
from auth import get_current_user
from common import _400, _402, _404, _502, limiter, NEW_API_BASE_URL, FALLBACK_API_KEY, FALLBACK_API_URL, _user_setting, send_alert_email
from newapi_integration import get_gateway_token
from routes.referrals import grant_referral_reward
from routes.v1_gateway import _candidate_models, _route_with_model_fallbacks
from schemas import ProxyChatRequest, PlaygroundChatRequest, SaveConversationRequest
from metering import budget_snapshot, provider_for_model, usage_metrics

router = APIRouter()

# Hard cap on output tokens forwarded to the provider. The pre-flight estimate
# is based on this cap, so unbounded max_tokens would let a caller burn far more
# than the estimate while the (atomic) deduction only covers what was billed.
MAX_OUTPUT_TOKENS = 4096


def _enforce_account_budget(db: Session, user: User):
    if budget_snapshot(db, user).get("account_exhausted"):
        _402("Monthly account token budget reached")


def _active_model(db: Session, model: str):
    if not db.query(AIModel.id).filter(AIModel.model_id == model, AIModel.is_active == True).first():
        _400("Unknown or inactive model")


def _site_transaction(db: Session, user: User, model: str, result: dict,
                      tokens: float, payment_method: str, latency_ms: float,
                      status: str = "completed", status_code: int = 200,
                      response=None, requested_model: str = ""):
    metrics = usage_metrics(result)
    request_id = (result or {}).get("id")
    if not request_id and response is not None:
        request_id = response.headers.get("x-request-id") or response.headers.get("request-id")
    db.add(Transaction(
        user_id=user.id,
        type="consumption",
        amount=0,
        payment_method=payment_method,
        model_used=model,
        requested_model=requested_model or model,
        provider=provider_for_model(db, model, result),
        request_id=str(request_id)[:200] if request_id else None,
        prompt_tokens=metrics["prompt_tokens"],
        completion_tokens=metrics["completion_tokens"],
        reasoning_tokens=metrics["reasoning_tokens"],
        cached_tokens=metrics["cached_tokens"],
        upstream_cost=metrics["upstream_cost"],
        latency_ms=latency_ms,
        status_code=status_code,
        tokens=tokens,
        status=status,
    ))


def _atomic_deduct(db: Session, user: User, cost: int):
    """Atomically deduct `cost` tokens — fails (rowcount 0) when balance < cost,
    even under concurrent requests. Prevents negative balance / free usage."""
    res = db.execute(
        update(User)
        .where(User.id == user.id, User.token_balance >= cost)
        .values(token_balance=User.token_balance - cost)
    )
    if res.rowcount == 0:
        db.rollback()
        _402("Insufficient balance")
    db.refresh(user)
    _maybe_low_balance_alert(user, db)


LOW_BALANCE_THRESHOLD = 1000  # 1000 tokens = $1 (GLOBTOKEN_TOKENS_PER_USD)
LOW_BALANCE_REARM = 2000      # re-arm alert only after balance recovers above this


def _maybe_low_balance_alert(user: User, db: Session):
    """Email once when balance drops below $1; re-arm after user tops up.

    Dedup flag lives in user.settings (`low_balance_sent`) so a burst of
    messages can't spam the inbox — one alert per low-balance episode.
    """
    try:
        if not _user_setting(user, "low_balance_alert", True):
            return
        balance = user.token_balance or 0
        import json
        try:
            s = json.loads(user.settings) if user.settings else {}
        except (json.JSONDecodeError, TypeError):
            s = {}
        sent = s.get("low_balance_sent", False)
        if balance < LOW_BALANCE_THRESHOLD and not sent:
            s["low_balance_sent"] = True
            user.settings = json.dumps(s)
            db.commit()
            usd = balance / 1000.0
            send_alert_email(
                user,
                "GlbTOKEN — low balance",
                f"Your GlbTOKEN balance is {balance} tokens (${usd:.2f}).\n\n"
                f"Top up soon to avoid interrupted API calls.\n"
                f"https://glbtoken.com/topup.html",
            )
            try:
                from webhooks import send_webhook, event_enabled
                if event_enabled(user, "low_balance"):
                    send_webhook(user, "low_balance", {"balance": balance, "usd": usd, "threshold": LOW_BALANCE_THRESHOLD})
            except Exception as e:
                print(f"⚠️ Low-balance webhook failed: {e}")
        elif balance >= LOW_BALANCE_REARM and sent:
            s["low_balance_sent"] = False
            user.settings = json.dumps(s)
            db.commit()
    except Exception as e:
        print(f"⚠️ Low-balance alert failed: {e}")
        db.rollback()


# ── API Proxy (via New API) ──

@router.post("/api/proxy/chat")
@limiter.limit("30/minute")
async def proxy_chat(req: ProxyChatRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _active_model(db, req.model)
    _enforce_account_budget(db, user)
    # Estimate cost (capped output — matches what we forward)
    if not all(isinstance(m, dict) for m in req.messages):
        _400("Each message must be an object with role and content")
    input_chars = sum(len(m.get("content", "")) for m in req.messages)
    input_tokens = max(1, input_chars // 4)
    max_out = min(req.max_tokens or MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS)
    output_tokens = max_out
    cost_tokens = int((input_tokens + output_tokens) * 0.002)  # ~$0.002/1K tokens
    if user.token_balance < cost_tokens:
        _402(f"Insufficient balance. Need {cost_tokens} tokens, have {user.token_balance}")
    
    # Route through the New API gateway when we have a key; otherwise fall back
    # to FALLBACK_API_URL. A user's own `newapi_token` takes priority; otherwise
    # use the shared gateway token so every user reaches the upstream models.
    import httpx
    headers = {"Content-Type": "application/json"}
    user_key = user.newapi_token or ""
    gw_token = get_gateway_token() if NEW_API_BASE_URL else ""
    newapi_key = user_key or gw_token
    newapi_url = NEW_API_BASE_URL
    
    if newapi_key and newapi_url:
        # Route via New API
        headers["Authorization"] = f"Bearer {newapi_key}"
        api_endpoint = f"{newapi_url}/v1/chat/completions"
    else:
        # Fallback: route via Fallback directly
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
            _400("No AI routing configured. Set NEW_API_BASE_URL or FALLBACK_API_URL")
        api_endpoint = f"{fallback_url.rstrip('/')}/v1/chat/completions"
    
    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            resp = await client.post(
                api_endpoint,
                headers=headers,
                json={
                    "model": req.model,
                    "messages": req.messages,
                    "max_tokens": max_out,
                    "temperature": req.temperature,
                },
            )
        except httpx.RequestError:
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            _site_transaction(db, user, req.model, {}, 0, "api_proxy", latency_ms, "failed", 502)
            db.commit()
            _502("AI API unavailable. Please try again later.")
        if not 200 <= resp.status_code < 300:
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            _site_transaction(db, user, req.model, {}, 0, "api_proxy", latency_ms, "failed", resp.status_code, resp)
            db.commit()
            _502("AI API error. Please try again later.")
        try:
            result = resp.json()
        except Exception:
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            _site_transaction(db, user, req.model, {}, 0, "api_proxy", latency_ms, "failed", 502, resp)
            db.commit()
            _502("AI API returned an invalid response")
        if not isinstance(result, dict):
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            _site_transaction(db, user, req.model, {}, 0, "api_proxy", latency_ms, "failed", 502, resp)
            db.commit()
            _502("AI API returned an invalid response")
    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    
    # Deduct tokens — use the REAL usage reported by the model provider,
    # falling back to the pre-flight estimate only if usage is missing.
    metrics = usage_metrics(result)
    real_tokens = int(metrics["total_tokens"] or 0)
    actual_tokens_cost = max(1, real_tokens or cost_tokens)
    # Atomic decrement — cannot go negative even under concurrency
    _atomic_deduct(db, user, actual_tokens_cost)
    _site_transaction(db, user, req.model, result, actual_tokens_cost, "api_proxy", latency_ms, response=resp)
    db.commit()
    # Referral: reward the referrer on the referred user's FIRST paid call
    grant_referral_reward(db, user)
    result["tokens_used"] = actual_tokens_cost
    result["balance_remaining"] = user.token_balance
    return result


# ── Model Playground ──

@router.get("/api/playground/models")
@limiter.limit("60/minute")
def get_playground_models(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the live, active gateway catalog used by the Playground."""
    models = db.query(AIModel).filter(
        AIModel.is_active == True
    ).order_by(AIModel.provider, AIModel.name, AIModel.model_id).all()
    
    return [
        {
            "model_id": m.model_id,
            "name": m.name,
            "provider": m.provider,
            "context_length": m.context_length,
            "prompt_price": m.prompt_price,
            "completion_price": m.completion_price,
            "category": m.category,
        }
        for m in models
    ]


@router.post("/api/playground/chat")
@limiter.limit("30/minute")
async def playground_chat(req: PlaygroundChatRequest, request: Request,
                          user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Run a session-authenticated chat through the same model fallback policy as /v1."""
    candidates = _candidate_models(db, req.model, req.models)
    requested_model = candidates[0]
    _enforce_account_budget(db, user)
    if req.stream:
        _400("Playground streaming is not available yet; use /v1/chat/completions for SSE")
    # Estimate cost (capped output — matches what we forward)
    if not all(isinstance(m, dict) for m in req.messages):
        _400("Each message must be an object with role and content")
    input_chars = sum(len(m.get("content", "")) for m in req.messages)
    input_tokens = max(1, input_chars // 4)
    max_out = min(req.max_tokens or MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS)
    output_tokens = max_out
    cost_tokens = int((input_tokens + output_tokens) * 0.002)
    
    if user.token_balance < cost_tokens:
        _402(f"Insufficient balance. Need {cost_tokens} tokens, have {user.token_balance}")
    
    payload = {
        "model": requested_model,
        "messages": req.messages,
        "max_tokens": max_out,
        "temperature": req.temperature,
        "top_p": req.top_p,
        "frequency_penalty": req.frequency_penalty,
        "presence_penalty": req.presence_penalty,
        "stream": req.stream,
    }
    
    resp, selected_model, latency_ms = await _route_with_model_fallbacks(
        "/v1/chat/completions", user, payload, candidates
    )
    if not 200 <= resp.status_code < 300:
        _site_transaction(
            db, user, selected_model, {}, 0, "playground", latency_ms,
            "failed", resp.status_code, resp, requested_model=requested_model,
        )
        db.commit()
        _502("AI API error. Please try again later.")
    try:
        result = resp.json()
    except Exception:
        _site_transaction(
            db, user, selected_model, {}, 0, "playground", latency_ms,
            "failed", 502, resp, requested_model=requested_model,
        )
        db.commit()
        _502("AI API returned an invalid response")
    if not isinstance(result, dict):
        _site_transaction(
            db, user, selected_model, {}, 0, "playground", latency_ms,
            "failed", 502, resp, requested_model=requested_model,
        )
        db.commit()
        _502("AI API returned an invalid response")
    
    # Deduct tokens — use the REAL usage reported by the model provider,
    # falling back to the pre-flight estimate only if usage is missing.
    metrics = usage_metrics(result)
    real_tokens = int(metrics["total_tokens"] or 0)
    actual_tokens_cost = max(1, real_tokens or cost_tokens)
    # Atomic decrement — cannot go negative even under concurrency
    _atomic_deduct(db, user, actual_tokens_cost)
    _site_transaction(
        db, user, selected_model, result, actual_tokens_cost, "playground",
        latency_ms, response=resp, requested_model=requested_model,
    )
    db.commit()
    # Referral: reward the referrer on the referred user's FIRST paid call
    grant_referral_reward(db, user)
    result["tokens_used"] = actual_tokens_cost
    result["balance_remaining"] = user.token_balance
    result["requested_model"] = requested_model
    result["selected_model"] = selected_model
    result["fallback_used"] = selected_model != requested_model
    result["attempted_models"] = candidates[:candidates.index(selected_model) + 1]
    return result


# ── Conversations ──

def _conversation_values(req: SaveConversationRequest):
    if not isinstance(req.messages, list):
        _400("Conversation messages must be a list")
    if len(req.messages) > 200:
        _400("A saved run can contain at most 200 messages")
    try:
        messages_json = json.dumps(req.messages)
    except (TypeError, ValueError):
        _400("Conversation messages must be JSON serializable")
    if len(messages_json.encode("utf-8")) > 1_000_000:
        _400("Saved run is too large")
    title = (req.title or "New Conversation").strip()[:120] or "New Conversation"
    model = (req.model or "").strip()[:200]
    return title, messages_json, model

@router.get("/api/playground/conversations")
@limiter.limit("30/minute")
def list_conversations(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List saved conversation titles for the current user."""
    conversations = db.query(Conversation).filter(
        Conversation.user_id == user.id
    ).order_by(desc(Conversation.updated_at)).all()
    
    return [
        {
            "id": c.id,
            "title": c.title,
            "model": c.model,
            "message_count": len(json.loads(c.messages)) if c.messages else 0,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in conversations
    ]


@router.post("/api/playground/conversations")
@limiter.limit("20/minute")
def save_conversation(req: SaveConversationRequest, request: Request,
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Save current conversation."""
    title, messages_json, model = _conversation_values(req)
    conversation = Conversation(
        user_id=user.id,
        title=title,
        messages=messages_json,
        model=model,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    
    return {
        "id": conversation.id,
        "title": conversation.title,
        "model": conversation.model,
        "message_count": len(req.messages),
        "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
        "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
    }


@router.put("/api/playground/conversations/{conv_id}")
@limiter.limit("30/minute")
def update_conversation(conv_id: int, req: SaveConversationRequest, request: Request,
                        user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update a saved conversation without creating duplicate history entries."""
    conversation = db.query(Conversation).filter(
        Conversation.id == conv_id, Conversation.user_id == user.id
    ).first()
    if not conversation:
        _404("Conversation not found")
    title, messages_json, model = _conversation_values(req)
    conversation.title = title
    conversation.messages = messages_json
    conversation.model = model
    db.commit()
    db.refresh(conversation)
    return {
        "id": conversation.id,
        "title": conversation.title,
        "model": conversation.model,
        "message_count": len(req.messages),
        "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
        "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
    }


@router.get("/api/playground/conversations/{conv_id}")
@limiter.limit("30/minute")
def get_conversation(conv_id: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get full conversation by ID."""
    conversation = db.query(Conversation).filter(
        Conversation.id == conv_id, Conversation.user_id == user.id
    ).first()
    if not conversation:
        _404("Conversation not found")
    
    messages = json.loads(conversation.messages) if conversation.messages else []
    
    return {
        "id": conversation.id,
        "title": conversation.title,
        "model": conversation.model,
        "messages": messages,
        "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
        "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
    }


@router.delete("/api/playground/conversations/{conv_id}")
@limiter.limit("20/minute")
def delete_conversation(conv_id: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a saved conversation."""
    conversation = db.query(Conversation).filter(
        Conversation.id == conv_id, Conversation.user_id == user.id
    ).first()
    if not conversation:
        _404("Conversation not found")
    
    db.delete(conversation)
    db.commit()
    return {"status": "deleted"}
