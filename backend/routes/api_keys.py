"""GlbTOKEN — API Keys Routes (CRUD)"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db, User, ApiKey
from auth import get_current_user, generate_api_key
from common import _400, _404
from schemas import ApiKeyCreate, ApiKeyUpdate

router = APIRouter()


@router.get("/api/keys")
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


@router.post("/api/keys")
def create_key(req: ApiKeyCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Limit to 10 active keys
    active_count = db.query(ApiKey).filter(
        ApiKey.user_id == user.id, ApiKey.is_active == True
    ).count()
    if active_count >= 10:
        _400("Maximum 10 active API keys")
    
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


@router.put("/api/keys/{key_id}")
def update_key(key_id: int, req: ApiKeyUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        _404("API key not found")
    if req.name is not None: key.name = req.name
    if req.permissions is not None: key.permissions = req.permissions
    if req.is_active is not None: key.is_active = req.is_active
    db.commit()
    return {"status": "updated"}


@router.delete("/api/keys/{key_id}")
def delete_key(key_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        _404("API key not found")
    db.delete(key)
    db.commit()
    return {"status": "deleted"}
