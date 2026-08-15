"""GlbTOKEN — Models Routes (list models, providers, available-models, auto-pull)"""

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
import os, json, secrets

from database import get_db, User, AIModel, SessionLocal
from auth import get_current_user
from newapi_integration import get_user_models
from common import _403, GLBTOKEN_SECRET, ADMIN_API_KEY, NEW_API_BASE_URL, FALLBACK_API_URL, FALLBACK_API_KEY, limiter

router = APIRouter()


# ── Seeding ──

def auto_pull_models():
    """Auto-fetch latest models from the New API gateway's /api/pricing and merge into DB.

    The gateway's authoritative sellable list is `/api/pricing` (public, no auth) — it
    lists every model with its `model_ratio` / `completion_ratio` and the groups that can
    serve it. We use it to keep the glbtoken catalog in sync with the models the gateway
    can actually proxy (e.g. kimi-k3, gpt-5.x, glm-5, deepseek-v4).
    """
    import httpx
    print("🔄 Auto-pulling models from New API gateway...")
    newapi_url = NEW_API_BASE_URL
    if not newapi_url:
        print("⚠️ No NEW_API_BASE_URL configured. Using seeded models only.")
        return
    models_url = f"{newapi_url.rstrip('/')}/api/pricing"
    try:
        resp = httpx.get(models_url, timeout=30)
    except Exception as e:
        print(f"❌ Auto-pull request failed: {e}")
        return
    if resp.status_code != 200:
        print(f"⚠️ New API gateway returned {resp.status_code} for {models_url}")
        return
    data = resp.json()
    items = data.get("data", [])
    if not items:
        print("⚠️ No models data from gateway pricing")
        return
    db = SessionLocal()
    count = 0
    try:
        seen = set()
        for m in items:
            model_id = (m.get("model_name") or "").strip()
            if not model_id:
                continue
            seen.add(model_id)
            # Display pricing: ratio × $2 = $/1M tokens → per-token.
            mr = float(m.get("model_ratio") or 0)
            cr = float(m.get("completion_ratio") or 0)
            prompt_price = mr * 2.0 / 1_000_000.0 if mr else 0.0
            completion_price = prompt_price * cr if cr else prompt_price
            name = model_id
            provider = "Other"
            prefix = model_id.split("-")[0].lower()
            known = {
                "gpt": "OpenAI", "claude": "Anthropic", "deepseek": "DeepSeek",
                "glm": "Zhipu", "kimi": "Moonshot", "doubao": "Volcengine",
                "seedance": "Volcengine", "seedream": "Volcengine", "volc": "Volcengine",
            }
            provider = known.get(prefix, model_id.split("-")[0].title())
            existing = db.query(AIModel).filter(AIModel.model_id == model_id).first()
            if existing:
                existing.prompt_price = prompt_price
                existing.completion_price = completion_price
                existing.provider = provider
                existing.is_active = True
            else:
                db.add(AIModel(
                    model_id=model_id, name=name, provider=provider,
                    context_length=4096,
                    prompt_price=prompt_price, completion_price=completion_price,
                    version="", category="Auto"
                ))
                count += 1
        # Deactivate catalog models that no longer exist on the gateway, so users
        # never see/select a model the gateway can't proxy.
        from sqlalchemy import update as _upd
        inactive = db.execute(
            _upd(AIModel)
            .where(AIModel.is_active == True, AIModel.model_id.notin_(list(seen)))
            .values(is_active=False)
        )
        db.commit()
        print(f"✅ Auto-pull complete: {count} new, {inactive.rowcount or 0} hidden (not on gateway); catalog mirrors the gateway")
    except Exception as e:
        print(f"❌ Auto-pull DB error: {e}")
        db.rollback()
    finally:
        db.close()


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
@limiter.limit("60/minute")
def list_models(request: Request, provider: Optional[str] = None, db: Session = Depends(get_db)):
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
@limiter.limit("60/minute")
def list_providers(request: Request, db: Session = Depends(get_db)):
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
        return {"models": [], "message": "Failed to load models"}


# ── Auto-Pull Models (manual trigger) ──

@router.post("/api/models/pull")
@limiter.limit("1/minute")
def trigger_model_pull(request: Request, authorization: str = Header(None)):
    # Extract API key from Authorization: Bearer <token>
    api_key = ""
    if authorization and authorization.startswith("Bearer "):
        api_key = authorization.removeprefix("Bearer ")
    glbtoken_secret = ADMIN_API_KEY or GLBTOKEN_SECRET
    if not glbtoken_secret or not secrets.compare_digest(api_key or "", glbtoken_secret):
        _403("Invalid API key")
    auto_pull_models()
    return {"status": "ok", "message": "Models refreshed from Fallback"}
