"""
GlbTOKEN Backend — FastAPI Server
Run: uvicorn main:app --reload
"""

from fastapi import FastAPI, Depends, HTTPException, status, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import Optional
from datetime import datetime, timezone

from database import init_db, get_db, User, ApiKey, Transaction, AIModel
from auth import (
    hash_password, verify_password, create_access_token, decode_token,
    get_current_user, get_optional_user, generate_api_key,
    verify_google_token, verify_github_code, GOOGLE_CLIENT_ID, GITHUB_CLIENT_ID
)

app = FastAPI(title="GlbTOKEN API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup ──
@app.on_event("startup")
def startup():
    init_db()
    seed_models()

# ── Pydantic Schemas ──
class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    country: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class GoogleAuthRequest(BaseModel):
    token: str

class GithubAuthRequest(BaseModel):
    code: str

class ApiKeyCreate(BaseModel):
    name: str = "My API Key"
    permissions: str = "read_write"

class ApiKeyUpdate(BaseModel):
    name: Optional[str] = None
    permissions: Optional[str] = None
    is_active: Optional[bool] = None

class TopupRequest(BaseModel):
    amount: float
    currency: str = "USD"
    payment_method: str = "stripe"

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    country: Optional[str] = None

class TokenRateUpdate(BaseModel):
    token_multiplier: float = 1.0  # 1.0 = base rate, 2.0 = 2x markup

class AdminBalanceRequest(BaseModel):
    user_id: int
    tokens: float
    reason: str = "Manual adjustment"

# ── Auth Routes ──
@app.post("/api/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password too short")
    user = User(
        name=req.name,
        email=req.email,
        password_hash=hash_password(req.password),
        country=req.country,
        token_balance=25000,  # Welcome bonus
        is_admin=(db.query(User).count() == 0),  # First user is admin
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance}, "token": token}

@app.post("/api/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance, "country": user.country}, "token": token}

@app.get("/api/auth/google")
def google_auth_url():
    if not GOOGLE_CLIENT_ID:
        return {"url": None, "error": "Google OAuth not configured"}
    from urllib.parse import urlencode
    params = urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": "https://glbtoken.io/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
    })
    return {"url": f"https://accounts.google.com/o/oauth2/auth?{params}"}

@app.post("/api/auth/google/callback")
async def google_callback(req: GoogleAuthRequest, db: Session = Depends(get_db)):
    try:
        google_user = await verify_google_token(req.token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    user = db.query(User).filter(
        (User.google_id == google_user["id"]) | (User.email == google_user["email"])
    ).first()
    if not user:
        user = User(
            name=google_user["name"],
            email=google_user["email"],
            google_id=google_user["id"],
            token_balance=0,
            email_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.google_id:
        user.google_id = google_user["id"]
        db.commit()
    token = create_access_token({"sub": str(user.id)})
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance}, "token": token}

@app.get("/api/auth/github")
def github_auth_url():
    if not GITHUB_CLIENT_ID:
        return {"url": None, "error": "GitHub OAuth not configured"}
    from urllib.parse import urlencode
    params = urlencode({
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": "https://glbtoken.io/auth/github/callback",
        "scope": "user:email",
    })
    return {"url": f"https://github.com/login/oauth/authorize?{params}"}

@app.post("/api/auth/github/callback")
async def github_callback(req: GithubAuthRequest, db: Session = Depends(get_db)):
    try:
        github_user = await verify_github_code(req.code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    user = db.query(User).filter(
        (User.github_id == github_user["id"]) | (User.email == github_user["email"])
    ).first()
    if not user:
        user = User(
            name=github_user["name"],
            email=github_user["email"],
            github_id=github_user["id"],
            token_balance=0,
            email_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.github_id:
        user.github_id = github_user["id"]
        db.commit()
    token = create_access_token({"sub": str(user.id)})
    return {"user": {"id": user.id, "name": user.name, "email": user.email, "token_balance": user.token_balance}, "token": token}

@app.get("/api/auth/me")
def get_me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "country": user.country,
        "token_balance": user.token_balance,
        "total_spent": user.total_spent,
        "email_verified": user.email_verified,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

# ── Dashboard Routes ──
@app.get("/api/dashboard")
def get_dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Usage by model (last 7 days)
    usage = db.query(Transaction.model_used, func.sum(Transaction.tokens)).filter(
        Transaction.user_id == user.id,
        Transaction.type == "consumption",
    ).group_by(Transaction.model_used).all()
    
    # Recent transactions
    recent = db.query(Transaction).filter(
        Transaction.user_id == user.id
    ).order_by(desc(Transaction.created_at)).limit(5).all()
    
    # API key count
    key_count = db.query(ApiKey).filter(
        ApiKey.user_id == user.id, ApiKey.is_active == True
    ).count()
    
    return {
        "token_balance": user.token_balance,
        "total_spent": user.total_spent,
        "models_used": len(usage),
        "api_keys_active": key_count,
        "days_active": 14,
        "usage_by_model": [
            {"model": m[0] or "Unknown", "tokens": float(m[1])} for m in usage
        ],
        "recent_activity": [
            {
                "type": t.type,
                "model": t.model_used,
                "tokens": t.tokens,
                "payment_method": t.payment_method,
                "amount": t.amount,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in recent
        ],
    }

# ── API Key Routes ──
@app.get("/api/keys")
def list_keys(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    keys = db.query(ApiKey).filter(ApiKey.user_id == user.id).order_by(desc(ApiKey.created_at)).all()
    return [
        {
            "id": k.id,
            "name": k.name,
            "key": k.key[:12] + "••••••••" + k.key[-4:],
            "key_prefix": k.key[:12],
            "permissions": k.permissions,
            "is_active": k.is_active,
            "request_count": k.request_count,
            "last_used": k.last_used.isoformat() if k.last_used else None,
            "created_at": k.created_at.isoformat() if k.created_at else None,
        }
        for k in keys
    ]

@app.post("/api/keys")
def create_key(req: ApiKeyCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Limit to 10 active keys
    active_count = db.query(ApiKey).filter(
        ApiKey.user_id == user.id, ApiKey.is_active == True
    ).count()
    if active_count >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 active API keys")
    
    key = ApiKey(
        user_id=user.id,
        key=generate_api_key(),
        name=req.name,
        permissions=req.permissions,
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return {
        "id": key.id,
        "name": key.name,
        "key": key.key,  # Full key shown once
        "permissions": key.permissions,
        "created_at": key.created_at.isoformat(),
    }

@app.put("/api/keys/{key_id}")
def update_key(key_id: int, req: ApiKeyUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    if req.name is not None: key.name = req.name
    if req.permissions is not None: key.permissions = req.permissions
    if req.is_active is not None: key.is_active = req.is_active
    db.commit()
    return {"status": "updated"}

@app.delete("/api/keys/{key_id}")
def delete_key(key_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    db.delete(key)
    db.commit()
    return {"status": "deleted"}

# ── Transaction Routes ──
@app.get("/api/transactions")
def list_transactions(
    type: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(Transaction).filter(Transaction.user_id == user.id)
    if type:
        q = q.filter(Transaction.type == type)
    total = q.count()
    items = q.order_by(desc(Transaction.created_at)).offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [
            {
                "id": t.id,
                "type": t.type,
                "amount": t.amount,
                "currency": t.currency,
                "payment_method": t.payment_method,
                "model_used": t.model_used,
                "tokens": t.tokens,
                "status": t.status,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in items
        ],
    }

@app.post("/api/topup")
def topup(req: TopupRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tokens = int(req.amount * 1000)  # 1 USD = 1000 tokens
    user.token_balance += tokens
    user.total_spent += req.amount
    
    tx = Transaction(
        user_id=user.id,
        type="deposit",
        amount=req.amount,
        currency=req.currency,
        payment_method=req.payment_method,
        tokens=tokens,
        status="completed",
    )
    db.add(tx)
    db.commit()
    
    return {
        "status": "success",
        "tokens_added": tokens,
        "new_balance": user.token_balance,
    }

# ── Models Route ──
@app.get("/api/models")
def list_models(provider: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(AIModel).filter(AIModel.is_active == True)
    if provider:
        q = q.filter(AIModel.provider == provider)
    models = q.order_by(AIModel.provider, AIModel.model_id).all()
    return [
        {
            "id": m.id,
            "model_id": m.model_id,
            "name": m.name,
            "provider": m.provider,
            "context_length": m.context_length,
            "prompt_price": m.prompt_price,
            "completion_price": m.completion_price,
            "category": m.category,
            "version": m.version,
            "description": m.description,
        }
        for m in models
    ]

@app.get("/api/models/providers")
def list_providers(db: Session = Depends(get_db)):
    results = db.query(
        AIModel.provider,
        func.count(AIModel.id),
        func.min(AIModel.prompt_price),
        func.max(AIModel.prompt_price),
    ).filter(AIModel.is_active == True).group_by(AIModel.provider).all()
    return [
        {
            "name": r[0],
            "count": r[1],
            "min_price": float(r[2]) if r[2] else 0,
            "max_price": float(r[3]) if r[3] else 0,
        }
        for r in results
    ]

# ── User Profile ──
@app.get("/api/user/profile")
def get_profile(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "country": user.country,
        "token_balance": user.token_balance,
        "total_spent": user.total_spent,
        "email_verified": user.email_verified,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

@app.put("/api/user/profile")
def update_profile(req: ProfileUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if req.name is not None: user.name = req.name
    if req.country is not None: user.country = req.country
    db.commit()
    return {"status": "updated", "name": user.name, "country": user.country}

# ── Admin Endpoints ──
@app.get("/api/admin/users")
def admin_list_users(page: int = 1, per_page: int = 20, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    total = db.query(User).count()
    users = db.query(User).order_by(desc(User.created_at)).offset((page-1)*per_page).limit(per_page).all()
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "users": [{
            "id": u.id, "name": u.name, "email": u.email, "country": u.country,
            "token_balance": u.token_balance, "total_spent": u.total_spent,
            "email_verified": u.email_verified, "created_at": u.created_at.isoformat() if u.created_at else None
        } for u in users]
    }

@app.post("/api/admin/adjust-balance")
def admin_adjust_balance(req: AdminBalanceRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    target = db.query(User).filter(User.id == req.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.token_balance = max(0, target.token_balance + req.tokens)
    tx = Transaction(
        user_id=target.id, type="deposit" if req.tokens > 0 else "consumption",
        tokens=req.tokens, status="completed",
        payment_method=f"admin_adjustment: {req.reason}"
    )
    db.add(tx)
    db.commit()
    return {"status": "adjusted", "new_balance": target.token_balance}

@app.get("/api/admin/transactions")
def admin_transactions(page: int = 1, per_page: int = 20, status_filter: Optional[str] = None,
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    q = db.query(Transaction)
    if status_filter: q = q.filter(Transaction.status == status_filter)
    total = q.count()
    txs = q.order_by(desc(Transaction.created_at)).offset((page-1)*per_page).limit(per_page).all()
    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [{
            "id": t.id, "user_id": t.user_id, "type": t.type, "amount": t.amount,
            "currency": t.currency, "payment_method": t.payment_method,
            "tokens": t.tokens, "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None
        } for t in txs]
    }

# ── Token Rate Configurator ──
@app.get("/api/admin/rates")
def get_rates(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    # Token rate stored as a simple KV in DB or config
    from database import SessionLocal as _s
    # Return current pricing strategy
    return {
        "base_token_rate": 0.001,  # $0.001 per token
        "markup_multiplier": 2.0,  # 2x on upstream costs
        "packages": [
            {"name": "Starter", "price": 5, "tokens": 5000},
            {"name": "Professional", "price": 20, "tokens": 22000},
            {"name": "Enterprise", "price": 100, "tokens": 120000},
        ],
        "minimum_topup": 2.0,
    }

# ── Provider Status ──
@app.get("/api/admin/providers")
def provider_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    providers = db.query(
        AIModel.provider,
        func.count(AIModel.id).label("model_count"),
        func.min(AIModel.prompt_price).label("min_price"),
    ).filter(AIModel.is_active == True).group_by(AIModel.provider).all()
    return [{
        "name": p[0], "models": p[1], "min_price": float(p[2]) if p[2] else 0,
        "status": "operational", "latency_ms": round(150 + (hash(p[0]) % 350), 0)
    } for p in providers]

# ── Seeding ──
def seed_models():
    from database import SessionLocal
    db = SessionLocal()
    if db.query(AIModel).count() > 0:
        db.close()
        return
    
    models = [
        # OpenAI
        AIModel(model_id="openai/gpt-5.5-pro", name="GPT-5.5 Pro", provider="OpenAI", context_length=1050000, prompt_price=0.00003, completion_price=0.00012, version="5.5", category="Flagship"),
        AIModel(model_id="openai/gpt-5.5", name="GPT-5.5", provider="OpenAI", context_length=1050000, prompt_price=0.000005, completion_price=0.00002, version="5.5", category="Flagship"),
        AIModel(model_id="openai/gpt-5.4", name="GPT-5.4", provider="OpenAI", context_length=272000, prompt_price=0.000008, completion_price=0.000032, version="5.4", category="Flagship"),
        AIModel(model_id="openai/gpt-5.4-nano", name="GPT-5.4 Nano", provider="OpenAI", context_length=400000, prompt_price=0.0000002, completion_price=0.0000008, version="5.4", category="Nano"),
        AIModel(model_id="openai/gpt-4o", name="GPT-4o", provider="OpenAI", context_length=128000, prompt_price=0.0000025, completion_price=0.00001, version="4o", category="Vision"),
        AIModel(model_id="openai/gpt-4o-mini", name="GPT-4o Mini", provider="OpenAI", context_length=128000, prompt_price=0.00000015, completion_price=0.0000006, version="4o-mini", category="Small"),
        AIModel(model_id="openai/o3", name="o3", provider="OpenAI", context_length=200000, prompt_price=0.00001, completion_price=0.00004, version="o3", category="Reasoning"),
        AIModel(model_id="openai/o4-mini", name="o4-mini", provider="OpenAI", context_length=200000, prompt_price=0.0000011, completion_price=0.0000044, version="o4-mini", category="Reasoning"),
        
        # Anthropic
        AIModel(model_id="anthropic/claude-sonnet-5", name="Claude Sonnet 5", provider="Anthropic", context_length=1000000, prompt_price=0.000002, completion_price=0.000008, version="5", category="Flagship"),
        AIModel(model_id="anthropic/claude-opus-4.8", name="Claude Opus 4.8", provider="Anthropic", context_length=1000000, prompt_price=0.000005, completion_price=0.00002, version="4.8", category="Flagship"),
        AIModel(model_id="anthropic/claude-fable-5", name="Claude Fable 5", provider="Anthropic", context_length=1000000, prompt_price=0.00001, completion_price=0.00004, version="5", category="Flagship"),
        AIModel(model_id="anthropic/claude-3.5-sonnet", name="Claude 3.5 Sonnet", provider="Anthropic", context_length=200000, prompt_price=0.000003, completion_price=0.000015, version="3.5", category="Vision"),
        AIModel(model_id="anthropic/claude-3-haiku", name="Claude 3 Haiku", provider="Anthropic", context_length=200000, prompt_price=0.00000025, completion_price=0.00000125, version="3", category="Small"),
        
        # Google
        AIModel(model_id="google/gemini-3.5-flash", name="Gemini 3.5 Flash", provider="Google", context_length=1048576, prompt_price=0.0000015, completion_price=0.000006, version="3.5", category="Flash"),
        AIModel(model_id="google/gemini-3.1-flash", name="Gemini 3.1 Flash", provider="Google", context_length=1048576, prompt_price=0.00000025, completion_price=0.000001, version="3.1", category="Flash"),
        AIModel(model_id="google/gemini-3-pro", name="Gemini 3 Pro", provider="Google", context_length=65536, prompt_price=0.000002, completion_price=0.000008, version="3", category="Flagship"),
        AIModel(model_id="google/gemini-2.0-flash", name="Gemini 2.0 Flash", provider="Google", context_length=1048576, prompt_price=0.0000001, completion_price=0.0000004, version="2.0", category="Flash"),
        
        # Meta Llama
        AIModel(model_id="meta-llama/llama-4-maverick", name="Llama 4 Maverick", provider="Meta Llama", context_length=1048576, prompt_price=0.00000015, completion_price=0.0000006, version="4", category="Flagship"),
        AIModel(model_id="meta-llama/llama-4-scout", name="Llama 4 Scout", provider="Meta Llama", context_length=10000000, prompt_price=0.0000001, completion_price=0.0000004, version="4", category="Small"),
        AIModel(model_id="meta-llama/llama-3.3-70b", name="Llama 3.3 70B", provider="Meta Llama", context_length=131072, prompt_price=0.0000001, completion_price=0.0000004, version="3.3", category="Large"),
        AIModel(model_id="meta-llama/llama-3.1-405b", name="Llama 3.1 405B", provider="Meta Llama", context_length=131072, prompt_price=0.000001, completion_price=0.000004, version="3.1", category="Flagship"),
        
        # DeepSeek
        AIModel(model_id="deepseek/deepseek-v4-pro", name="DeepSeek V4 Pro", provider="DeepSeek", context_length=1048576, prompt_price=0.000000435, completion_price=0.00000174, version="V4", category="Flagship"),
        AIModel(model_id="deepseek/deepseek-v4-flash", name="DeepSeek V4 Flash", provider="DeepSeek", context_length=1048576, prompt_price=0.000000089, completion_price=0.000000356, version="V4", category="Flash"),
        AIModel(model_id="deepseek/deepseek-v3.2", name="DeepSeek V3.2", provider="DeepSeek", context_length=131072, prompt_price=0.0000002288, completion_price=0.000000915, version="V3.2", category="Flagship"),
        AIModel(model_id="deepseek/deepseek-r1", name="DeepSeek R1", provider="DeepSeek", context_length=131072, prompt_price=0.00000055, completion_price=0.0000022, version="R1", category="Reasoning"),
        
        # Mistral
        AIModel(model_id="mistralai/mistral-large-2", name="Mistral Large 2", provider="Mistral", context_length=131072, prompt_price=0.000002, completion_price=0.000006, version="2", category="Flagship"),
        AIModel(model_id="mistralai/mistral-small-2603", name="Mistral Small", provider="Mistral", context_length=262144, prompt_price=0.00000015, completion_price=0.0000006, version="2603", category="Small"),
        AIModel(model_id="mistralai/mistral-medium-3-5", name="Mistral Medium 3.5", provider="Mistral", context_length=262144, prompt_price=0.0000015, completion_price=0.000006, version="3.5", category="Medium"),
        
        # Qwen
        AIModel(model_id="qwen/qwen3.7-plus", name="Qwen 3.7 Plus", provider="Qwen", context_length=1000000, prompt_price=0.00000032, completion_price=0.00000128, version="3.7", category="Flagship"),
        AIModel(model_id="qwen/qwen3.7-max", name="Qwen 3.7 Max", provider="Qwen", context_length=1000000, prompt_price=0.00000125, completion_price=0.000005, version="3.7", category="Flagship"),
        AIModel(model_id="qwen/qwen3.6-flash", name="Qwen 3.6 Flash", provider="Qwen", context_length=1000000, prompt_price=0.0000001875, completion_price=0.00000075, version="3.6", category="Flash"),
        AIModel(model_id="qwen/qwen-2.5-72b", name="Qwen 2.5 72B", provider="Qwen", context_length=131072, prompt_price=0.00000035, completion_price=0.0000014, version="2.5", category="Large"),
        AIModel(model_id="qwen/qwen-2.5-coder-32b", name="Qwen 2.5 Coder 32B", provider="Qwen", context_length=131072, prompt_price=0.00000035, completion_price=0.0000014, version="2.5", category="Code"),
        
        # Perplexity
        AIModel(model_id="perplexity/sonar-pro", name="Sonar Pro", provider="Perplexity", context_length=200000, prompt_price=0.000003, completion_price=0.000015, version="Pro", category="Search"),
        AIModel(model_id="perplexity/sonar-reasoning-pro", name="Sonar Reasoning Pro", provider="Perplexity", context_length=128000, prompt_price=0.000002, completion_price=0.000008, version="Pro", category="Reasoning"),
        AIModel(model_id="perplexity/sonar-deep-research", name="Sonar Deep Research", provider="Perplexity", context_length=128000, prompt_price=0.000002, completion_price=0.000008, version="Deep", category="Research"),
        
        # X AI
        AIModel(model_id="x-ai/grok-4.20", name="Grok 4.20", provider="X AI", context_length=2000000, prompt_price=0.00000125, completion_price=0.000005, version="4.20", category="Flagship"),
        AIModel(model_id="x-ai/grok-4.3", name="Grok 4.3", provider="X AI", context_length=1000000, prompt_price=0.00000125, completion_price=0.000005, version="4.3", category="Flagship"),
        
        # Cohere
        AIModel(model_id="cohere/command-a", name="Command A", provider="Cohere", context_length=256000, prompt_price=0.0000025, completion_price=0.00001, version="A", category="Flagship"),
        AIModel(model_id="cohere/command-r-plus", name="Command R+", provider="Cohere", context_length=128000, prompt_price=0.0000025, completion_price=0.00001, version="R+", category="Flagship"),
        
        # Amazon
        AIModel(model_id="amazon/nova-pro-v1", name="Nova Pro", provider="Amazon", context_length=300000, prompt_price=0.0000008, completion_price=0.0000032, version="Pro", category="Flagship"),
        AIModel(model_id="amazon/nova-lite-v1", name="Nova Lite", provider="Amazon", context_length=300000, prompt_price=0.00000006, completion_price=0.00000024, version="Lite", category="Small"),
        AIModel(model_id="amazon/nova-micro-v1", name="Nova Micro", provider="Amazon", context_length=128000, prompt_price=0.000000035, completion_price=0.00000014, version="Micro", category="Small"),
        
        # Microsoft
        AIModel(model_id="microsoft/phi-4", name="Phi-4", provider="Microsoft", context_length=16384, prompt_price=0.00000007, completion_price=0.00000028, version="4", category="Small"),
        
        # Nvidia
        AIModel(model_id="nvidia/nemotron-3-ultra", name="Nemotron 3 Ultra", provider="Nvidia", context_length=1000000, prompt_price=0.0000005, completion_price=0.000002, version="3", category="Flagship"),
        
        # NousResearch
        AIModel(model_id="nousresearch/hermes-4-70b", name="Hermes 4 70B", provider="NousResearch", context_length=131072, prompt_price=0.00000013, completion_price=0.00000052, version="4", category="Large"),
        AIModel(model_id="nousresearch/hermes-4-405b", name="Hermes 4 405B", provider="NousResearch", context_length=131072, prompt_price=0.000001, completion_price=0.000004, version="4", category="Flagship"),
    ]
    
    db.add_all(models)
    db.commit()
    db.close()
    print(f"✅ Seeded {len(models)} AI models")

# ── Health ──
@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0", "name": "GlbTOKEN API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
