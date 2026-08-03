"""GlbTOKEN — Referral Routes (code, stats, rewards, claim)"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
import random, string
from datetime import datetime, timezone, timedelta

from database import get_db, User, Referral, ReferralRedemption, Transaction
from auth import get_current_user
from common import _400, _500, limiter, REFERRAL_REWARD_GT

router = APIRouter()


def grant_referral_reward(db: Session, user: User):
    """Grant the referrer a reward when `user` (who signed up via a ref) makes
    their FIRST real consumption. Idempotent — one redemption per referred user.
    Never raises: a reward failure must not break the chat response."""
    try:
        code = user.referred_by
        if not code:
            return
        if db.query(ReferralRedemption).filter(ReferralRedemption.referred_user_id == user.id).first():
            return  # already rewarded
        referrer = db.query(User).filter(User.referral_code == code).first()
        if not referrer:
            ref_row = db.query(Referral).filter(Referral.code == code).first()
            if ref_row:
                referrer = db.query(User).filter(User.id == ref_row.user_id).first()
        if not referrer or referrer.id == user.id:
            return
        if REFERRAL_REWARD_GT <= 0:
            return
        db.add(ReferralRedemption(
            referred_user_id=user.id,
            referrer_code=code,
            amount=REFERRAL_REWARD_GT,
        ))
        referrer.referral_earnings = (referrer.referral_earnings or 0.0) + REFERRAL_REWARD_GT
        ref_row = db.query(Referral).filter(Referral.code == code).first()
        if ref_row:
            ref_row.total_earned = (ref_row.total_earned or 0.0) + REFERRAL_REWARD_GT
        db.commit()
        print(f"🎁 Referral reward: {REFERRAL_REWARD_GT} GT → user {referrer.id} (referred user {user.id})")
    except Exception as e:
        db.rollback()
        print(f"⚠️ grant_referral_reward failed: {e}")


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
    # Lifetime earned = sum of ALL redemptions; pending = unclaimed balance
    lifetime_earned = 0.0
    if code:
        lifetime_earned = float(db.query(func.coalesce(func.sum(ReferralRedemption.amount), 0.0)).filter(
            ReferralRedemption.referrer_code == code
        ).scalar() or 0.0)
    pending_earnings = user.referral_earnings or 0.0
    
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

    # Reward history merged into stats so the frontend needs ONE request
    # (previously the client serialized stats → rewards = 2 round-trips on
    # every load, making generate + table populate feel slow).
    rewards = []
    if code:
        redemptions = db.query(ReferralRedemption).filter(
            ReferralRedemption.referrer_code == code
        ).order_by(desc(ReferralRedemption.created_at)).all()
        for r in redemptions:
            referred_user = db.query(User).filter(User.id == r.referred_user_id).first()
            rewards.append({
                "amount": r.amount,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "referred_user_name": referred_user.name if referred_user else "Unknown",
            })

    return {
        "referral_code": code,
        "total_referrals": total_referrals,
        "total_earned": lifetime_earned,
        "pending_earnings": pending_earnings,
        "recent_referrals": recent,
        "history": history,
        "rewards": rewards,
        "rewards_total": float(sum(r["amount"] for r in rewards)),
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
    
    # Row lock to prevent double-claim race (two concurrent claims both passing the >=1 check)
    locked = db.query(User).filter(User.id == user.id).with_for_update().first()
    if not locked:
        _400("User not found")
    
    pending_earnings = locked.referral_earnings or 0.0
    if pending_earnings < 1.0:
        _400(f"Minimum claim is 1.0 token. You have {pending_earnings:.2f}")
    
    # Transfer to balance
    locked.token_balance += pending_earnings
    locked.referral_earnings = 0.0
    
    # Create transaction record
    tx = Transaction(
        user_id=locked.id, type="deposit", amount=0,
        payment_method="referral_reward", tokens=pending_earnings,
        status="completed",
    )
    db.add(tx)
    db.commit()
    
    return {
        "status": "claimed",
        "amount": pending_earnings,
        "new_balance": locked.token_balance,
    }
