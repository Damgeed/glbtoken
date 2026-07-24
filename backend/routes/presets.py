"""GlbTOKEN — Presets CRUD Routes"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone

from database import get_db, User, Preset
from auth import get_current_user
from common import _400, _404
from schemas import CreatePresetRequest, UpdatePresetRequest

router = APIRouter()


@router.post("/api/presets")
def create_preset(req: CreatePresetRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a new preset for the current user."""
    if not req.name or not req.name.strip():
        _400("Preset name is required")
    if not req.model or not req.model.strip():
        _400("Model is required")
    preset = Preset(
        user_id=user.id,
        name=req.name.strip(),
        model=req.model.strip(),
        system_prompt=req.system_prompt,
        temperature=req.temperature if req.temperature is not None else 0.7,
        max_tokens=req.max_tokens,
        top_p=req.top_p if req.top_p is not None else 1.0,
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return {
        "id": preset.id,
        "name": preset.name,
        "model": preset.model,
        "system_prompt": preset.system_prompt,
        "temperature": preset.temperature,
        "max_tokens": preset.max_tokens,
        "top_p": preset.top_p,
        "created_at": preset.created_at.isoformat() if preset.created_at else None,
        "updated_at": preset.updated_at.isoformat() if preset.updated_at else None,
    }


@router.get("/api/presets")
def list_presets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all presets for the current user."""
    presets = db.query(Preset).filter(Preset.user_id == user.id).order_by(desc(Preset.updated_at)).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "model": p.model,
            "system_prompt": p.system_prompt,
            "temperature": p.temperature,
            "max_tokens": p.max_tokens,
            "top_p": p.top_p,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in presets
    ]


@router.get("/api/presets/{preset_id}")
def get_preset(preset_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get a single preset by ID."""
    preset = db.query(Preset).filter(Preset.id == preset_id, Preset.user_id == user.id).first()
    if not preset:
        _404("Preset not found")
    return {
        "id": preset.id,
        "name": preset.name,
        "model": preset.model,
        "system_prompt": preset.system_prompt,
        "temperature": preset.temperature,
        "max_tokens": preset.max_tokens,
        "top_p": preset.top_p,
        "created_at": preset.created_at.isoformat() if preset.created_at else None,
        "updated_at": preset.updated_at.isoformat() if preset.updated_at else None,
    }


@router.put("/api/presets/{preset_id}")
def update_preset(preset_id: int, req: UpdatePresetRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update an existing preset."""
    preset = db.query(Preset).filter(Preset.id == preset_id, Preset.user_id == user.id).first()
    if not preset:
        _404("Preset not found")
    if req.name is not None:
        if not req.name.strip():
            _400("Preset name cannot be empty")
        preset.name = req.name.strip()
    if req.model is not None:
        if not req.model.strip():
            _400("Model cannot be empty")
        preset.model = req.model.strip()
    if req.system_prompt is not None:
        preset.system_prompt = req.system_prompt
    if req.temperature is not None:
        preset.temperature = req.temperature
    if req.max_tokens is not None:
        preset.max_tokens = req.max_tokens
    if req.top_p is not None:
        preset.top_p = req.top_p
    preset.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(preset)
    return {
        "id": preset.id,
        "name": preset.name,
        "model": preset.model,
        "system_prompt": preset.system_prompt,
        "temperature": preset.temperature,
        "max_tokens": preset.max_tokens,
        "top_p": preset.top_p,
        "created_at": preset.created_at.isoformat() if preset.created_at else None,
        "updated_at": preset.updated_at.isoformat() if preset.updated_at else None,
    }


@router.delete("/api/presets/{preset_id}")
def delete_preset(preset_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a preset."""
    preset = db.query(Preset).filter(Preset.id == preset_id, Preset.user_id == user.id).first()
    if not preset:
        _404("Preset not found")
    db.delete(preset)
    db.commit()
    return {"status": "deleted"}
