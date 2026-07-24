"""GlbTOKEN — Chat Routes (proxy chat, playground models, playground chat, conversations)"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc
import json

from database import get_db, User, AIModel, Conversation, Transaction
from auth import get_current_user
from newapi_integration import get_user_models
from common import _400, _402, _404, _502, limiter, NEW_API_BASE_URL, FALLBACK_API_KEY, FALLBACK_API_URL
from schemas import ProxyChatRequest, PlaygroundChatRequest, SaveConversationRequest

router = APIRouter()


# ── API Proxy (via New API) ──

@router.post("/api/proxy/chat")
async def proxy_chat(req: ProxyChatRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Estimate cost
    input_chars = sum(len(m.get("content", "")) for m in req.messages)
    input_tokens = max(1, input_chars // 4)
    output_tokens = min(req.max_tokens, 4096)
    cost_tokens = int((input_tokens + output_tokens) * 0.002)  # ~$0.002/1K tokens
    if user.token_balance < cost_tokens:
        _402(f"Insufficient balance. Need {cost_tokens} tokens, have {user.token_balance}")
    
    # Route through New API if configured, otherwise fallback to Fallback
    newapi_key = user.newapi_token
    newapi_url = NEW_API_BASE_URL
    
    import httpx
    headers = {"Content-Type": "application/json"}
    
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
    
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            api_endpoint,
            headers=headers,
            json={
                "model": req.model,
                "messages": req.messages,
                "max_tokens": req.max_tokens,
                "temperature": req.temperature,
            },
        )
        if resp.status_code != 200:
            _502("AI API error. Please try again later.")
        result = resp.json()
    
    # Deduct tokens
    actual_tokens_cost = max(1, cost_tokens)
    user.token_balance -= actual_tokens_cost
    tx = Transaction(
        user_id=user.id, type="consumption", amount=0,
        payment_method="api_proxy", model_used=req.model,
        tokens=actual_tokens_cost, status="completed",
    )
    db.add(tx)
    db.commit()
    result["tokens_used"] = actual_tokens_cost
    result["balance_remaining"] = user.token_balance
    return result


# ── Model Playground ──

PLAYGROUND_MODELS = [
    "gpt-4o-mini", "gpt-4o", "claude-3-haiku-20240307", "claude-3-sonnet-20240229",
    "gemini-1.5-flash", "gemini-1.5-pro", "mistral-small-latest", "mistral-medium-latest",
    "llama-3.1-8b-instant", "llama-3.1-70b-versatile",
]


@router.get("/api/playground/models")
@limiter.limit("60/minute")
def get_playground_models(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Returns models available for playground (faster, cheaper ones filtered)."""
    models = db.query(AIModel).filter(
        AIModel.is_active == True,
        AIModel.model_id.in_(PLAYGROUND_MODELS),
    ).all()
    
    if not models:
        # Fallback: return all active models sorted by prompt_price
        models = db.query(AIModel).filter(
            AIModel.is_active == True
        ).order_by(AIModel.prompt_price).limit(20).all()
    
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
    """Similar to proxy/chat but with additional parameters."""
    # Estimate cost
    input_chars = sum(len(m.get("content", "")) for m in req.messages)
    input_tokens = max(1, input_chars // 4)
    output_tokens = min(req.max_tokens, 4096)
    cost_tokens = int((input_tokens + output_tokens) * 0.002)
    
    if user.token_balance < cost_tokens:
        _402(f"Insufficient balance. Need {cost_tokens} tokens, have {user.token_balance}")
    
    newapi_key = user.newapi_token
    newapi_url = NEW_API_BASE_URL
    
    import httpx
    headers = {"Content-Type": "application/json"}
    
    if newapi_key and newapi_url:
        headers["Authorization"] = f"Bearer {newapi_key}"
        api_endpoint = f"{newapi_url}/v1/chat/completions"
    else:
        fallback_key = FALLBACK_API_KEY
        if not fallback_key:
            _400("No AI routing configured")
        headers = {
            "Authorization": f"Bearer {fallback_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://glbtoken.com",
            "X-Title": "GlbTOKEN",
        }
        fallback_url = FALLBACK_API_URL
        if not fallback_url:
            _400("No AI routing configured")
        api_endpoint = f"{fallback_url.rstrip('/')}/v1/chat/completions"
    
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
    
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(api_endpoint, headers=headers, json=payload)
        if resp.status_code != 200:
            _502("AI API error. Please try again later.")
        result = resp.json()
    
    # Deduct tokens
    actual_tokens_cost = max(1, cost_tokens)
    user.token_balance -= actual_tokens_cost
    tx = Transaction(
        user_id=user.id, type="consumption", amount=0,
        payment_method="playground", model_used=req.model,
        tokens=actual_tokens_cost, status="completed",
    )
    db.add(tx)
    db.commit()
    result["tokens_used"] = actual_tokens_cost
    result["balance_remaining"] = user.token_balance
    return result


# ── Conversations ──

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
    conversation = Conversation(
        user_id=user.id,
        title=req.title or "New Conversation",
        messages=json.dumps(req.messages),
        model=req.model,
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
