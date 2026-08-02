"""GlbTOKEN — Referral Routes (code, stats, rewards, claim)"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
import random, string
from datetime import datetime, timezone, timedelta

from database import get_db, User, Referral, ReferralRedemption, Transaction
from auth import get_current_user
from common import _400, _500, limiter

router = APIRouter()


@router.post("/api/referral/code")
@limiter.limit("10/minute")
def generate_referral_code(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Generate a unique referral code for the current user (if none exists)."""
    if user.referral_code:
        return {"referral_code": user.referral_code}
    
    # Check if user already has a Referral record
    existing = db.query(Referral).filter(Referral.user_id == user.id).first()
    if existing:
        user.referral_code = existing.code
        db.commit()
        return {"referral_code": existing.code}
    
    # Generate a unique code
    for _ in range(10):
        code = "GLB" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if not db.query(Referral).filter(Referral.code == code).first():
            break
    else:
        _500("Failed to generate unique code")
    
    referral = Referral(user_id=user.id, code=code)
    db.add(referral)
    user.referral_code = code
    db.commit()
    return {"referral_code": code}


@router.get("/api/referral/stats")
@limiter.limit("30/minute")
def get_referral_stats(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Returns referral stats for the current user."""
    code = user.referral_code
    total_earned = user.referral_earnings or 0.0
    
    # Count referrals (users who used this user's code)
    total_referrals = db.query(User).filter(User.referred_by == code).count() if code else 0
    
    # Recent referrals
    recent = []
    redemptions = {}
    if code:
        for r in db.query(ReferralRedemption).filter(ReferralRedemption.referrer_code == code).all():
            redemptions[r.referred_user_id] = r.amount
        recent_users = db.query(User).filter(
            User.referred_by == code
        ).order_by(desc(User.created_at)).limit(10).all()
        recent = [{
            "id": u.id, "name": u.name, "email": u.email,
            "joined_at": u.created_at.isoformat() if u.created_at else None,
            "status": "active",
            "reward": float(redemptions.get(u.id, 0) or 0),
        } for u in recent_users]
    
    # History for charts (last 14 days: referrals + earnings per day)
    history = []
    if code:
        hist_start = datetime.now(timezone.utc) - timedelta(days=13)
        ref_by_day = dict(db.query(func.date(User.created_at), func.count(User.id)).filter(
            User.referred_by == code, User.created_at >= hist_start
        ).group_by(func.date(User.created_at)).all())
        earn_by_day = dict(db.query(func.date(ReferralRedemption.created_at), func.sum(ReferralRedemption.amount)).filter(
            ReferralRedemption.referrer_code == code, ReferralRedemption.created_at >= hist_start
        ).group_by(func.date(ReferralRedemption.created_at)).all())
        for i in range(13, -1, -1):
            d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
            history.append({
                "date": d,
                "referrals": int(ref_by_day.get(d, 0) or 0),
                "earnings": float(earn_by_day.get(d, 0) or 0),
            })
    
    return {
        "referral_code": code,
        "total_referrals": total_referrals,
        "total_earned": total_earned,
        "pending_earnings": total_earned,
        "recent_referrals": recent,
        "history": history,
    }


@router.get("/api/referral/rewards")
@limiter.limit("30/minute")
def get_referral_rewards(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Returns list of referral rewards for the current user."""
    if not user.referral_code:
        return {"rewards": [], "total": 0.0}
    
    redemptions = db.query(ReferralRedemption).filter(
        ReferralRedemption.referrer_code == user.referral_code
    ).order_by(desc(ReferralRedemption.created_at)).all()
    
    rewards = []
    for r in redemptions:
        referred_user = db.query(User).filter(User.id == r.referred_user_id).first()
        rewards.append({
            "amount": r.amount,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "referred_user_name": referred_user.name if referred_user else "Unknown",
        })
    
    total = sum(r.amount for r in redemptions)
    return {"rewards": rewards, "total": total}


@router.post("/api/referral/claim")
@limiter.limit("5/minute")
def claim_referral_reward(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Claim referral earnings (transfer to token balance)."""
    if not user.referral_code:
        _400("No referral code created yet")
    
    pending_earnings = user.referral_earnings or 0.0
    if pending_earnings < 1.0:
        _400(f"Minimum claim is 1.0 token. You have {pending_earnings:.2f}")
    
    # Transfer to balance
    user.token_balance += pending_earnings
    user.referral_earnings = 0.0
    
    # Create transaction record
    tx = Transaction(
        user_id=user.id, type="deposit", amount=0,
        payment_method="referral_reward", tokens=pending_earnings,
        status="completed",
    )
    db.add(tx)
    db.commit()
    
    return {
        "status": "claimed",
        "amount": pending_earnings,
        "new_balance": user.token_balance,
    }
