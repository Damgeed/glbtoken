"""GlbTOKEN — Organization Routes (CRUD, invite, join, members, usage)"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone, timedelta
import secrets
import os
import re

from database import get_db, User, Organization, OrgMember, OrgInvite, Transaction
from auth import get_current_user
from common import _400, _403, _404, _500, limiter
from schemas import CreateOrgRequest, UpdateOrgRequest, InviteMemberRequest, JoinOrgRequest, ChangeRoleRequest, TransferOwnerRequest
from routes.auth_routes import send_email

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

    # Pending invites — strictly scoped to THIS org and only visible to owner/admin.
    # Invite tokens/join links are sensitive: regular members must never receive them.
    pending_invites = []
    if membership.role in ("owner", "admin"):
        pending = db.query(OrgInvite).filter(
            OrgInvite.org_id == org_id,
            OrgInvite.used == False,  # noqa: E712
        ).order_by(desc(OrgInvite.created_at)).all()
        base_url = os.getenv("FRONTEND_URL", "https://glbtoken.com").rstrip("/")
        pending_invites = [{
            "id": inv.id,
            "email": inv.email,
            "role": inv.role or "member",
            "invite_token": inv.token,
            "join_link": f"{base_url}/join.html?org={org_id}&token={inv.token}",
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
            "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
        } for inv in pending]

    return {
        "id": org.id,
        "name": org.name,
        "owner_id": org.owner_id,
        "max_members": org.max_members,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "members": member_list,
        "pending_invites": pending_invites,
        "my_role": membership.role,
    }


@router.put("/api/orgs/{org_id}")
@limiter.limit("10/minute")
def update_org(org_id: int, req: UpdateOrgRequest, request: Request,
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Rename an organization (owner or admin only)."""
    if not req.name or not req.name.strip():
        _400("Organization name is required")

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        _404("Organization not found")

    membership = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == user.id
    ).first()
    if not membership:
        _403("You are not a member of this organization")
    if membership.role not in ("owner", "admin"):
        _403("Only the owner or an admin can edit the organization")

    org.name = req.name.strip()
    db.commit()

    return {
        "status": "updated",
        "id": org.id,
        "name": org.name,
    }


@router.delete("/api/orgs/{org_id}")
@limiter.limit("5/minute")
def delete_org(org_id: int, request: Request,
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete an organization permanently (owner only). Cascades to all memberships."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        _404("Organization not found")

    membership = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == user.id
    ).first()
    if not membership:
        _403("You are not a member of this organization")
    if membership.role != "owner":
        _403("Only the owner can delete the organization")

    # Clean up pending invites first (no FK cascade on org_invites)
    db.query(OrgInvite).filter(OrgInvite.org_id == org_id).delete()
    db.delete(org)  # cascade="all, delete-orphan" removes OrgMember rows
    db.commit()

    return {"status": "deleted", "org_id": org_id}


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
    
    email = (req.email or "").strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$", email):
        _400("Please enter a valid email address")

    # Already a member? (only relevant if the email belongs to a registered user)
    invited_user = db.query(User).filter(User.email == email).first()
    if invited_user:
        existing = db.query(OrgMember).filter(
            OrgMember.org_id == org_id, OrgMember.user_id == invited_user.id
        ).first()
        if existing:
            _400("User is already a member of this organization")

    if req.role not in ("admin", "member"):
        _400("Role must be 'admin' or 'member'")

    base_url = os.getenv("FRONTEND_URL", "https://glbtoken.com").rstrip("/")
    inviter_name = user.name or user.email or "Someone"
    subject = f"You're invited to join {org.name} on GlbTOKEN"

    def _send(invite_token):
        """Build the join link + email body and attempt delivery (best-effort)."""
        join_link = f"{base_url}/join.html?org={org_id}&token={invite_token}"
        body = (
            f"Hello,\n\n"
            f"{inviter_name} invited you to join the organization \"{org.name}\" "
            f"on GlbTOKEN as {req.role}.\n\n"
            f"Accept the invitation:\n{join_link}\n\n"
            f"If the link doesn't work, sign in with {email} and use this invite code: {invite_token}\n\n"
            f"This invitation expires in 7 days."
        )
        email_sent = send_email(email, subject, body)
        return join_link, email_sent

    now = datetime.now(timezone.utc)

    # ── Duplicate invite guard: if an active (unused, unexpired) invite already
    #    exists for this org + email, DON'T create another one. Inform the caller
    #    and offer a resend (reuses the same token/link).
    existing_invite = db.query(OrgInvite).filter(
        OrgInvite.org_id == org_id,
        OrgInvite.email == email,
        OrgInvite.used == False,  # noqa: E712
        (OrgInvite.expires_at.is_(None)) | (OrgInvite.expires_at > now),
    ).first()

    if existing_invite:
        if req.resend:
            # Resend the SAME invite — refresh role if the inviter changed it, keep token
            if req.role != existing_invite.role:
                existing_invite.role = req.role
                db.commit()
            join_link, email_sent = _send(existing_invite.token)
            return {
                "status": "resent",
                "id": existing_invite.id,
                "invite_token": existing_invite.token,
                "join_link": join_link,
                "org_name": org.name,
                "invited_email": email,
                "role": existing_invite.role or req.role,
                "created_at": existing_invite.created_at.isoformat() if existing_invite.created_at else None,
                "expires_at": existing_invite.expires_at.isoformat() if existing_invite.expires_at else None,
                "email_sent": email_sent,
                "invited_user_exists": invited_user is not None,
                "message": f"Invite resent to {email}." + (" Email delivered." if email_sent else " Share the invite link with them."),
            }
        # No duplicate creation — surface the existing invite so the owner can resend or share
        return {
            "status": "already_invited",
            "id": existing_invite.id,
            "invite_token": existing_invite.token,
            "join_link": f"{base_url}/join.html?org={org_id}&token={existing_invite.token}",
            "org_name": org.name,
            "invited_email": email,
            "role": existing_invite.role or req.role,
            "created_at": existing_invite.created_at.isoformat() if existing_invite.created_at else None,
            "expires_at": existing_invite.expires_at.isoformat() if existing_invite.expires_at else None,
            "invited_user_exists": invited_user is not None,
            "message": f"An active invite already exists for {email}. Resend it instead of creating a duplicate?",
        }

    # No active invite — clean up any leftover expired invites for this org + email,
    # then persist a fresh token with a 7-day expiry (join validates against the DB)
    db.query(OrgInvite).filter(
        OrgInvite.org_id == org_id,
        OrgInvite.email == email,
        OrgInvite.used == False,  # noqa: E712
    ).delete(synchronize_session=False)

    invite_token = secrets.token_urlsafe(32)
    invite = OrgInvite(
        org_id=org_id,
        email=email,
        token=invite_token,
        role=req.role,
        expires_at=now + timedelta(days=7),
    )
    db.add(invite)
    db.commit()

    join_link, email_sent = _send(invite_token)

    return {
        "status": "invited",
        "id": invite.id,
        "invite_token": invite_token,
        "join_link": join_link,
        "org_name": org.name,
        "invited_email": email,
        "role": req.role,
        "created_at": invite.created_at.isoformat() if invite.created_at else None,
        "expires_at": invite.expires_at.isoformat() if invite.expires_at else None,
        "email_sent": email_sent,
        "invited_user_exists": invited_user is not None,
        "message": f"Invite sent to {email}." + (" Email delivered." if email_sent else " Share the invite link with them."),
    }


@router.post("/api/orgs/{org_id}/join")
@limiter.limit("10/minute")
def join_org(org_id: int, req: JoinOrgRequest, request: Request,
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Accept an invite and join the organization."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        _404("Organization not found")
    
    # Validate token against persisted invites (org + token must match, not expired, not used)
    invite = db.query(OrgInvite).filter(
        OrgInvite.org_id == org_id,
        OrgInvite.token == req.token,
    ).first()
    if not invite:
        _400("Invalid invite token")
    if invite.used:
        _400("Invite token has already been used")
    if invite.expires_at:
        exp = invite.expires_at
        # SQLite returns naive datetimes — normalize before comparing with aware now
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            _400("Invite token has expired")

    # The invite is bound to a specific email — only that user may join
    if invite.email.lower() != (user.email or "").lower():
        _403("This invite was issued for a different email address")

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
    
    try:
        member = OrgMember(org_id=org_id, user_id=user.id, role=invite.role or "member")
        db.add(member)
        invite.used = True
        db.commit()
    except IntegrityError:
        # Unique (org_id, user_id) index — concurrent/double join is a no-op
        db.rollback()
        _400("You are already a member of this organization")
    
    return {"status": "joined", "org_id": org_id, "org_name": org.name}


@router.delete("/api/orgs/{org_id}/invites/{invite_id}")
@limiter.limit("10/minute")
def revoke_invite(org_id: int, invite_id: int, request: Request,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Revoke a pending invite (owner or admin only). Deletes the invite row so the token dies."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        _404("Organization not found")

    membership = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == user.id
    ).first()
    if not membership or membership.role not in ("owner", "admin"):
        _403("Only owner or admin can revoke invites")

    invite = db.query(OrgInvite).filter(
        OrgInvite.org_id == org_id, OrgInvite.id == invite_id
    ).first()
    if not invite:
        _404("Invite not found")
    if invite.used:
        _400("Invite has already been used")

    db.delete(invite)
    db.commit()
    return {"status": "revoked", "invite_id": invite_id, "email": invite.email}


@router.put("/api/orgs/{org_id}/owner")
@limiter.limit("10/minute")
def transfer_ownership(org_id: int, req: TransferOwnerRequest, request: Request,
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Transfer organization ownership to another member (owner only). The previous owner becomes an admin."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        _404("Organization not found")

    membership = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == user.id
    ).first()
    if not membership or membership.role != "owner":
        _403("Only the owner can transfer ownership")

    target = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == req.user_id
    ).first()
    if not target:
        _404("Target member not found in this organization")
    if target.role == "owner":
        _400("Target is already the owner")

    target.role = "owner"
    membership.role = "admin"
    org.owner_id = req.user_id
    db.commit()
    return {"status": "transferred", "org_id": org_id, "new_owner_id": req.user_id, "new_owner_email": target.user.email if target.user else None}


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


@router.delete("/api/orgs/{org_id}/members/me")
@limiter.limit("10/minute")
def leave_org(org_id: int, request: Request,
              user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Current user leaves an organization (removes own membership)."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        _404("Organization not found")

    membership = db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id == user.id
    ).first()
    if not membership:
        _404("You are not a member of this organization")

    if membership.role == "owner":
        # Owner cannot leave — must delete the org or transfer ownership first
        _400("Owner cannot leave. Delete the organization instead.")

    db.delete(membership)
    db.commit()
    return {"status": "left", "org_id": org_id}


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
    
    # Per-member breakdown (batch queries — no N+1)
    users = {u.id: u for u in db.query(User).filter(User.id.in_(member_ids)).all()}
    memberships = {m.user_id: m for m in db.query(OrgMember).filter(
        OrgMember.org_id == org_id, OrgMember.user_id.in_(member_ids)
    ).all()}
    token_rows = db.query(Transaction.user_id, func.sum(Transaction.tokens)).filter(
        Transaction.user_id.in_(member_ids),
        Transaction.type == "consumption",
    ).group_by(Transaction.user_id).all()
    tokens_map = {uid: float(t) for uid, t in token_rows}

    member_breakdown = []
    for m_id in member_ids:
        u = users.get(m_id)
        m = memberships.get(m_id)
        member_breakdown.append({
            "user_id": m_id,
            "name": u.name if u else "Unknown",
            "role": m.role if m else "member",
            "tokens_used": tokens_map.get(m_id, 0.0),
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
