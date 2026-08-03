"""GlbTOKEN — Referral Routes (code, stats, rewards, claim)"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
import random, string
from datetime import datetime, timezone, timedelta

from database import get_db, User, Referral, ReferralRedemption, Transaction
from auth import get_current_user
from common import _400, _500, limiter, REFERRAL_REWARD_GT, REFERRAL_MIN_SPEND_TOKENS, DISPOSABLE_EMAIL_DOMAINS

router = APIRouter()


def _aware(dt):
    """Ensure a datetime is timezone-aware (SQLite returns naive, Postgres aware)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _build_rewards(db: Session, code: str):
    """Build reward-history rows for a referral code (shared by stats + rewards endpoints).
    Batch-fetches referred users to avoid N+1 queries."""
    if not code:
        return []
    redemptions = db.query(ReferralRedemption).filter(
        ReferralRedemption.referrer_code == code
    ).order_by(desc(ReferralRedemption.created_at)).all()
    referred_ids = {r.referred_user_id for r in redemptions}
    referred_names = {}
    if referred_ids:
        for u in db.query(User).filter(User.id.in_(referred_ids)).all():
            referred_names[u.id] = u.name
    return [{
        "amount": r.amount,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "referred_user_name": referred_names.get(r.referred_user_id, "Unknown"),
    } for r in redemptions]


def grant_referral_reward(db: Session, user: User):
    """Grant the referrer a reward when `user` (who signed up via a ref) makes
    their FIRST real consumption. Idempotent — one redemption per referred user.

    Anti-fraud gates (all must pass before a reward is granted):
      1. Referred user must not have a disposable/temp-mail domain
      2. Referred user must not share a signup IP with an already-rewarded
         referral of the same referrer (blocks multi-account self-farming)
      3. Referred user's cumulative paid consumption must meet the minimum
         spend threshold (blocks signup-and-abandon farming)

    Never raises: a reward failure must not break the chat response.
    """
    try:
        code = user.referred_by
        if not code:
            return
        if db.query(ReferralRedemption).filter(ReferralRedemption.referred_user_id == user.id).first():
            return  # already rewarded

        # ── Gate 1: disposable email domain ──
        email_domain = (user.email or "").split("@")[-1].lower() if user.email and "@" in user.email else ""
        if email_domain and email_domain in DISPOSABLE_EMAIL_DOMAINS:
            print(f"🚫 Referral reward blocked: disposable email {user.email}")
            return

        referrer = db.query(User).filter(User.referral_code == code).first()
        if not referrer:
            ref_row = db.query(Referral).filter(Referral.code == code).first()
            if ref_row:
                referrer = db.query(User).filter(User.id == ref_row.user_id).first()
        if not referrer or referrer.id == user.id:
            return
        if REFERRAL_REWARD_GT <= 0:
            return

        # ── Gate 2: same-IP farming detection ──
        if user.signup_ip:
            already_rewarded_ids = [
                r.referred_user_id for r in db.query(ReferralRedemption).filter(
                    ReferralRedemption.referrer_code == code
                ).all()
            ]
            if already_rewarded_ids:
                same_ip_users = db.query(User).filter(
                    User.id.in_(already_rewarded_ids),
                    User.signup_ip == user.signup_ip,
                ).first()
                if same_ip_users:
                    print(f"🚫 Referral reward blocked: same signup IP {user.signup_ip} as user {same_ip_users.id}")
                    return

        # ── Gate 3: minimum spend threshold (cumulative consumption) ──
        if REFERRAL_MIN_SPEND_TOKENS > 0:
            consumed = float(db.query(func.coalesce(func.sum(Transaction.tokens), 0.0)).filter(
                Transaction.user_id == user.id,
                Transaction.type == "consumption",
                Transaction.status == "completed",
            ).scalar() or 0.0)
            if consumed < REFERRAL_MIN_SPEND_TOKENS:
                return  # not enough real usage yet — wait for next paid call

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
    
    # Recent referrals — with lifecycle status for the funnel (v1131):
    #   rewarded = already triggered a referral reward
    #   active   = has paid consumption but not yet rewarded
    #   pending  = signed up, no consumption yet
    #   idle     = signed up >30d ago, never consumed (churn risk)
    recent = []
    redemptions = {}
    consumed_ids = set()
    if code:
        for r in db.query(ReferralRedemption).filter(ReferralRedemption.referrer_code == code).all():
            redemptions[r.referred_user_id] = r.amount
        recent_users = db.query(User).filter(
            User.referred_by == code
        ).order_by(desc(User.created_at)).limit(50).all()
        # Batch: which referred users have ANY completed consumption tx?
        referred_ids = [u.id for u in recent_users]
        if referred_ids:
            consumed_ids = set(x[0] for x in db.query(Transaction.user_id).filter(
                Transaction.user_id.in_(referred_ids),
                Transaction.type == "consumption",
                Transaction.status == "completed",
            ).distinct().all())
        now = datetime.now(timezone.utc)
        recent = []
        for u in recent_users:
            has_reward = u.id in redemptions
            has_consumed = u.id in consumed_ids
            if has_reward:
                st = "rewarded"
            elif has_consumed:
                st = "active"
            elif _aware(u.created_at) and (now - _aware(u.created_at)) > timedelta(days=30):
                st = "idle"
            else:
                st = "pending"
            recent.append({
                "id": u.id, "name": u.name, "email": u.email,
                "joined_at": u.created_at.isoformat() if u.created_at else None,
                "status": st,
                "reward": float(redemptions.get(u.id, 0) or 0),
            })

    # Conversion funnel — all referred users (not just recent 50)
    funnel = {"total": 0, "rewarded": 0, "active": 0, "pending": 0, "idle": 0}
    if code:
        all_referred = db.query(User).filter(User.referred_by == code).all()
        all_ids = [u.id for u in all_referred]
        funnel["total"] = len(all_ids)
        funnel["rewarded"] = len(redemptions)
        if all_ids:
            consumed_all = set(x[0] for x in db.query(Transaction.user_id).filter(
                Transaction.user_id.in_(all_ids),
                Transaction.type == "consumption",
                Transaction.status == "completed",
            ).distinct().all())
            funnel["active"] = len(consumed_all - set(redemptions.keys()))
            now2 = datetime.now(timezone.utc)
            pending_cnt = 0
            idle_cnt = 0
            for u in all_referred:
                if u.id in redemptions or u.id in consumed_all:
                    continue
                if _aware(u.created_at) and (now2 - _aware(u.created_at)) > timedelta(days=30):
                    idle_cnt += 1
                else:
                    pending_cnt += 1
            funnel["pending"] = pending_cnt
            funnel["idle"] = idle_cnt
    
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

    # Channel attribution — count referred signups by source (src=twitter etc.)
    sources = []
    if code:
        src_counts = db.query(User.referral_source, func.count(User.id)).filter(
            User.referred_by == code
        ).group_by(User.referral_source).all()
        total_src = sum(c for _, c in src_counts)
        for src, cnt in sorted(src_counts, key=lambda x: -x[1]):
            label = src or "direct"
            sources.append({
                "source": label,
                "count": cnt,
                "pct": round(100.0 * cnt / total_src, 1) if total_src else 0,
            })

    # Reward history merged into stats so the frontend needs ONE request
    # (previously the client serialized stats → rewards = 2 round-trips on
    # every load, making generate + table populate feel slow).
    rewards = _build_rewards(db, code)

    return {
        "referral_code": code,
        "total_referrals": total_referrals,
        "total_earned": lifetime_earned,
        "pending_earnings": pending_earnings,
        "recent_referrals": recent,
        "history": history,
        "rewards": rewards,
        "rewards_total": float(sum(r["amount"] for r in rewards)),
        "sources": sources,
        "funnel": funnel,
        "claim_threshold": 1.0,
        "min_spend_tokens": REFERRAL_MIN_SPEND_TOKENS,
    }


@router.get("/api/referral/rewards")
@limiter.limit("30/minute")
def get_referral_rewards(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Returns list of referral rewards for the current user."""
    if not user.referral_code:
        return {"rewards": [], "total": 0.0}
    
    rewards = _build_rewards(db, user.referral_code)
    total = float(sum(r["amount"] for r in rewards))
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
