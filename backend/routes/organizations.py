"""GlbTOKEN — Organization Routes (CRUD, invite, join, members, usage)"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timezone
import secrets

from database import get_db, User, Organization, OrgMember, Transaction
from auth import get_current_user
from common import _400, _403, _404, _500, limiter
from schemas import CreateOrgRequest, InviteMemberRequest, JoinOrgRequest, ChangeRoleRequest

router = APIRouter()


@router.post("/api/orgs")
@limiter.limit("10/minute")
def create_org(req: CreateOrgRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a new organization."""
    if not req.name or not req.name.strip():
        _400("Organization name is required")
    
    org = Organization(name=req.name.strip(), owner_id=user.id)
    db.add(org)
    db.commit()
    db.refresh(org)
    
    # Add creator as owner member
    member = OrgMember(org_id=org.id, user_id=user.id, role="owner")
    db.add(member)
    db.commit()
    
    return {
        "id": org.id,
        "name": org.name,
        "owner_id": org.owner_id,
        "max_members": org.max_members,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "member_count": 1,
    }


@router.get("/api/orgs")
@limiter.limit("30/minute")
def list_orgs(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List user's organizations."""
    memberships = db.query(OrgMember).filter(OrgMember.user_id == user.id).all()
    org_ids = [m.org_id for m in memberships]
    orgs = db.query(Organization).filter(Organization.id.in_(org_ids)).all() if org_ids else []
    
    result = []
    for org in orgs:
        member_count = db.query(OrgMember).filter(OrgMember.org_id == org.id).count()
        membership = db.query(OrgMember).filter(
            OrgMember.org_id == org.id, OrgMember.user_id == user.id
        ).first()
        result.append({
            "id": org.id,
            "name": org.name,
            "owner_id": org.owner_id,
            "max_members": org.max_members,
            "member_count": member_count,
            "role": membership.role if membership else "member",
            "created_at": org.created_at.isoformat() if org.created_at else None,
        })
    
    return {"organizations": result}


@router.get("/api/orgs/{org_id}")
@limiter.limit("30/minute")
def get_org(org_id: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get org details including members."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        _404("Organization not found")
    
    # Verify user is a member
    membership = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == user.id
    ).first()
    if not membership:
        _403("You are not a member of this organization")
    
    members = db.query(OrgMember).filter(OrgMember.org_id == org_id).all()
    member_list = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        member_list.append({
            "user_id": m.user_id,
            "name": u.name if u else "Unknown",
            "email": u.email if u else "",
            "role": m.role,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
        })
    
    return {
        "id": org.id,
        "name": org.name,
        "owner_id": org.owner_id,
        "max_members": org.max_members,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "members": member_list,
        "my_role": membership.role,
    }


@router.post("/api/orgs/{org_id}/invite")
@limiter.limit("10/minute")
def invite_to_org(org_id: int, req: InviteMemberRequest, request: Request,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Invite a user by email to join the organization. Generates an invite token."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        _404("Organization not found")
    
    # Check permission (owner or admin)
    membership = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == user.id
    ).first()
    if not membership or membership.role not in ("owner", "admin"):
        _403("Only owner or admin can invite members")
    
    # Check max members
    current_count = db.query(OrgMember).filter(OrgMember.org_id == org_id).count()
    if current_count >= org.max_members:
        _400("Organization has reached maximum member capacity")
    
    # Find invited user
    invited_user = db.query(User).filter(User.email == req.email).first()
    if not invited_user:
        _404("User with this email not found")
    
    # Check if already a member
    existing = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == invited_user.id
    ).first()
    if existing:
        _400("User is already a member of this organization")
    
    # Generate invite token (simple random string; stored in a real system would be a separate table)
    invite_token = secrets.token_urlsafe(32)
    
    return {
        "invite_token": invite_token,
        "org_name": org.name,
        "invited_email": req.email,
        "message": f"Invite sent to {req.email}. Share the token with them to join.",
    }


@router.post("/api/orgs/{org_id}/join")
@limiter.limit("10/minute")
def join_org(org_id: int, req: JoinOrgRequest, request: Request,
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Accept an invite and join the organization."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        _404("Organization not found")
    
    # Verify token (in production, validate against stored tokens)
    if not req.token or len(req.token) < 10:
        _400("Invalid invite token")
    
    # Check if already a member
    existing = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == user.id
    ).first()
    if existing:
        _400("You are already a member of this organization")
    
    # Check max members
    current_count = db.query(OrgMember).filter(OrgMember.org_id == org_id).count()
    if current_count >= org.max_members:
        _400("Organization has reached maximum member capacity")
    
    member = OrgMember(org_id=org_id, user_id=user.id, role="member")
    db.add(member)
    db.commit()
    
    return {"status": "joined", "org_id": org_id, "org_name": org.name}


@router.put("/api/orgs/{org_id}/members/{member_id}/role")
@limiter.limit("10/minute")
def change_member_role(org_id: int, member_id: int, req: ChangeRoleRequest, request: Request,
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Change a member's role (owner only)."""
    if req.role not in ("admin", "member"):
        _400("Role must be 'admin' or 'member'")
    
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        _404("Organization not found")
    
    # Only owner can change roles
    membership = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == user.id
    ).first()
    if not membership or membership.role != "owner":
        _403("Only the owner can change member roles")
    
    target = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == member_id
    ).first()
    if not target:
        _404("Member not found in this organization")
    
    if target.role == "owner":
        _400("Cannot change the owner's role")
    
    target.role = req.role
    db.commit()
    
    return {"status": "updated", "user_id": member_id, "new_role": req.role}


@router.delete("/api/orgs/{org_id}/members/{member_id}")
@limiter.limit("10/minute")
def remove_member(org_id: int, member_id: int, request: Request,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Remove a member from the organization (owner or admin only)."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        _404("Organization not found")
    
    # Check permission
    membership = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == user.id
    ).first()
    if not membership or membership.role not in ("owner", "admin"):
        _403("Only owner or admin can remove members")
    
    # Admins cannot remove other admins or the owner
    target = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == member_id
    ).first()
    if not target:
        _404("Member not found")
    
    if target.role == "owner":
        _400("Cannot remove the owner")
    if membership.role == "admin" and target.role == "admin":
        _403("Admins cannot remove other admins")
    
    db.delete(target)
    db.commit()
    
    return {"status": "removed", "user_id": member_id}


@router.get("/api/orgs/{org_id}/usage")
@limiter.limit("30/minute")
def get_org_usage(org_id: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get aggregated org usage stats."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        _404("Organization not found")
    
    # Verify user is a member
    membership = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == user.id
    ).first()
    if not membership:
        _403("You are not a member of this organization")
    
    # Get all member IDs
    member_ids = [m.user_id for m in db.query(OrgMember).filter(OrgMember.org_id == org_id).all()]
    
    if not member_ids:
        return {
            "total_members": 0,
            "total_tokens_used": 0,
            "total_transactions": 0,
            "total_spent": 0.0,
            "member_breakdown": [],
        }
    
    # Aggregate stats
    total_tokens_used = db.query(func.sum(Transaction.tokens)).filter(
        Transaction.user_id.in_(member_ids),
        Transaction.type == "consumption",
    ).scalar() or 0
    
    total_transactions = db.query(Transaction).filter(
        Transaction.user_id.in_(member_ids)
    ).count()
    
    total_spent = db.query(func.sum(Transaction.amount)).filter(
        Transaction.user_id.in_(member_ids),
        Transaction.type == "deposit",
    ).scalar() or 0.0
    
    # Per-member breakdown
    member_breakdown = []
    for m_id in member_ids:
        u = db.query(User).filter(User.id == m_id).first()
        m = db.query(OrgMember).filter(
            OrgMember.org_id == org_id, OrgMember.user_id == m_id
        ).first()
        tokens = db.query(func.sum(Transaction.tokens)).filter(
            Transaction.user_id == m_id, Transaction.type == "consumption"
        ).scalar() or 0
        member_breakdown.append({
            "user_id": m_id,
            "name": u.name if u else "Unknown",
            "role": m.role if m else "member",
            "tokens_used": float(tokens),
            "token_balance": u.token_balance if u else 0,
        })
    
    return {
        "org_id": org_id,
        "org_name": org.name,
        "total_members": len(member_ids),
        "total_tokens_used": float(total_tokens_used),
        "total_transactions": total_transactions,
        "total_spent": float(total_spent),
        "member_breakdown": member_breakdown,
    }
