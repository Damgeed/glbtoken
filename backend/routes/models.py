"""GlbTOKEN — Models Routes (list models, providers, available-models, auto-pull)"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import Optional
import os, json

from database import get_db, User, AIModel, SessionLocal
from auth import get_current_user
from newapi_integration import get_user_models
from common import _400, _403, _404, limiter, GLBTOKEN_SECRET, NEW_API_BASE_URL, FALLBACK_API_URL, FALLBACK_API_KEY

router = APIRouter()


# ── Seeding ──

def auto_pull_models():
    """Auto-fetch latest models from Fallback API and merge into DB."""
    import httpx
    print("🔄 Auto-pulling models from Fallback...")
    try:
        # Try New API's admin endpoint first, then fallback URL
        newapi_url = NEW_API_BASE_URL
        fallback_url = FALLBACK_API_URL
        models_url = ""
        headers = {"Content-Type": "application/json"}
        
        if newapi_url:
            # Use New API's model endpoint (no auth needed for public models)
            models_url = f"{newapi_url.rstrip('/')}/api/model"
        elif fallback_url:
            models_url = f"{fallback_url.rstrip('/')}/v1/models"
            admin_key = FALLBACK_API_KEY
            if admin_key:
                headers["Authorization"] = f"Bearer {admin_key}"
        else:
            print("⚠️ No Fallback API URL configured (set FALLBACK_API_URL or NEW_API_BASE_URL). Using seeded models only.")
            return
        
        resp = httpx.get(models_url, headers=headers, timeout=30)
        if resp.status_code != 200:
            print(f"⚠️ Fallback API returned {resp.status_code}")
            return
        data = resp.json()
        if not data.get("data"):
            print("⚠️ No models data from Fallback")
            return
        db = SessionLocal()
        count = 0
        for m in data["data"]:
            model_id = m.get("id", "")
            if not model_id:
                continue
            pricing = m.get("pricing", {}) or {}
            prompt_price = float(pricing.get("prompt", 0)) if pricing.get("prompt") else 0.0
            completion_price = float(pricing.get("completion", 0)) if pricing.get("completion") else 0.0
            context_length = int(m.get("context_length", 4096) or 4096)
            name = m.get("name", model_id.split("/")[-1] if "/" in model_id else model_id)
            provider = "Other"
            if "/" in model_id:
                company = model_id.split("/")[0]
                provider_map = {
                    "openai": "OpenAI", "anthropic": "Anthropic", "google": "Google",
                    "meta-llama": "Meta Llama", "deepseek": "DeepSeek", "mistralai": "Mistral",
                    "qwen": "Qwen", "cohere": "Cohere", "perplexity": "Perplexity",
                    "x-ai": "X AI", "amazon": "Amazon", "microsoft": "Microsoft",
                    "nvidia": "Nvidia", "nousresearch": "NousResearch"
                }
                provider = provider_map.get(company, company.title())
            # Check if model already exists
            existing = db.query(AIModel).filter(AIModel.model_id == model_id).first()
            if existing:
                # Update pricing/context in case they changed
                existing.prompt_price = prompt_price
                existing.completion_price = completion_price
                existing.context_length = context_length
            else:
                db.add(AIModel(
                    model_id=model_id, name=name, provider=provider,
                    context_length=context_length,
                    prompt_price=prompt_price, completion_price=completion_price,
                    version="", category="Auto"
                ))
                count += 1
        db.commit()
        db.close()
        print(f"✅ Auto-pull complete: {count} new models added")
    except Exception as e:
        print(f"❌ Auto-pull error: {e}")


def seed_models():
    db = SessionLocal()
    if db.query(AIModel).count() > 0:
        db.close()
        return
    json_path = os.path.join(os.path.dirname(__file__), "..", "models_seed.json")
    try:
        with open(json_path) as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"⚠️ Could not load models_seed.json: {e}")
        db.close()
        return
    models = [AIModel(**m) for m in data]
    db.add_all(models)
    db.commit()
    db.close()
    print(f"✅ Seeded {len(models)} AI models from models_seed.json")


# ── Models Route ──

@router.get("/api/models")
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


@router.get("/api/models/providers")
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


# ── Available Models from New API ──

@router.get("/api/available-models")
async def get_available_models(user: User = Depends(get_current_user)):
    """Get models accessible to the current user from New API."""
    if not user.newapi_user_id:
        return {"models": [], "message": "New API user not linked"}
    try:
        models = await get_user_models(user.newapi_user_id)
        return {"models": models, "count": len(models)}
    except Exception as e:
        print(f"⚠️ Failed to fetch available models: {e}")
        return {"models": [], "message": str(e)}


# ── Auto-Pull Models (manual trigger) ──

@router.post("/api/models/pull")
def trigger_model_pull(authorization: str = Header(None)):
    # Extract API key from Authorization: Bearer <token>
    api_key = ""
    if authorization and authorization.startswith("Bearer "):
        api_key = authorization.removeprefix("Bearer ")
    glbtoken_secret = GLBTOKEN_SECRET
    if not glbtoken_secret or api_key != glbtoken_secret:
        _403("Invalid API key")
    auto_pull_models()
    return {"status": "ok", "message": "Models refreshed from Fallback"}
