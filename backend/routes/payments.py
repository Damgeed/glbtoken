"""GlbTOKEN — Payments Routes (topup, Paystack, Stripe, Crypto, transactions, billing)"""

from fastapi import APIRouter, Depends, Body, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone, timedelta
from typing import Optional
import secrets

from database import get_db, User, Transaction
from auth import get_current_user
from newapi_integration import add_user_quota
from common import _400, _401, _402, _403, _404, _500, _502, _503, _not_configured, limiter, \
    PAYSTACK_SECRET_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CRYPTO_WALLET_ADDRESSES
from schemas import TopupRequest, InitiatePaymentRequest

router = APIRouter()


# ── Transaction Routes ──

@router.get("/api/transactions")
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


@router.post("/api/topup")
async def topup(req: TopupRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
    
    # ── Sync quota to New API ──
    try:
        if user.newapi_user_id:
            await add_user_quota(user.newapi_user_id, tokens)
    except Exception as e:
        print(f"⚠️ New API quota sync failed: {e}")
    
    return {
        "status": "success",
        "tokens_added": tokens,
        "new_balance": user.token_balance,
    }


# ── Paystack Payment ──

@router.post("/api/payments/paystack/initialize")
def paystack_initialize(req: InitiatePaymentRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not PAYSTACK_SECRET_KEY:
        _not_configured("Paystack")
    import httpx
    amount_kobo = int(req.amount * 100)  # Paystack uses kobo (cents)
    resp = httpx.post(
        "https://api.paystack.co/transaction/initialize",
        json={
            "email": req.email or user.email,
            "amount": amount_kobo,
            "currency": "GHS" if req.currency == "GHS" else "USD",
            "metadata": {"user_id": user.id, "payment_method": "paystack"},
            "callback_url": "https://damgeed.github.io/glbtoken/#dashboard",
        },
        headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}", "Content-Type": "application/json"},
    )
    data = resp.json()
    if not data.get("status"):
        _400(data.get("message", "Paystack init failed"))
    # Create pending transaction
    tx = Transaction(
        user_id=user.id, type="deposit", amount=req.amount, currency=req.currency,
        payment_method="paystack", payment_ref=data["data"]["reference"],
        tokens=0, status="pending",
    )
    db.add(tx); db.commit()
    return {"authorization_url": data["data"]["authorization_url"], "reference": data["data"]["reference"]}


@router.post("/api/payments/paystack/verify")
def paystack_verify(reference: str = Body(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not PAYSTACK_SECRET_KEY:
        _not_configured("Paystack")
    import re
    if not re.match(r'^[a-zA-Z0-9_-]+$', reference):
        _400("Invalid reference format")
    import httpx
    resp = httpx.get(
        f"https://api.paystack.co/transaction/verify/{reference}",
        headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"},
    )
    data = resp.json()
    if not data.get("status") or data["data"]["status"] != "success":
        _400("Payment not successful")
    tx = db.query(Transaction).filter(
        Transaction.payment_ref == reference,
        Transaction.user_id == user.id
    ).first()
    if not tx:
        _404("Transaction not found")
    if tx.status == "completed":
        return {"status": "already_processed", "tokens_added": tx.tokens}
    amount = data["data"]["amount"] / 100  # Convert from kobo
    tokens = int(amount * 1000)
    tx.status = "completed"
    tx.tokens = tokens
    tx.amount = amount
    user.token_balance += tokens
    user.total_spent += amount
    db.commit()
    return {"status": "success", "tokens_added": tokens, "new_balance": user.token_balance}


# ── Stripe Payment ──

@router.post("/api/payments/stripe/create-checkout")
def stripe_create_checkout(req: InitiatePaymentRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not STRIPE_SECRET_KEY:
        _not_configured("Stripe")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    tokens = int(req.amount * 1000)
    session = stripe_lib.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": req.currency.lower(),
                "product_data": {"name": f"{tokens:,} GlbTOKEN"},
                "unit_amount": int(req.amount * 100),
            },
            "quantity": 1,
        }],
        customer_email=req.email or user.email,
        metadata={"user_id": str(user.id), "tokens": str(tokens)},
        success_url="https://damgeed.github.io/glbtoken/#dashboard?payment=success",
        cancel_url="https://damgeed.github.io/glbtoken/#plans",
    )
    tx = Transaction(
        user_id=user.id, type="deposit", amount=req.amount, currency=req.currency,
        payment_method="stripe", payment_ref=session.id,
        tokens=0, status="pending",
    )
    db.add(tx); db.commit()
    return {"url": session.url, "session_id": session.id}


@router.post("/api/payments/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    if not STRIPE_WEBHOOK_SECRET:
        _not_configured("Webhook secret")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe_lib.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        print(f"❌ Stripe webhook error: {e}")
        _400("Invalid signature")
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = int(session["metadata"]["user_id"])
        tokens = int(session["metadata"]["tokens"])
        amount = session["amount_total"] / 100
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.token_balance += tokens
            user.total_spent += amount
        tx = db.query(Transaction).filter(Transaction.payment_ref == session["id"]).first()
        if tx:
            tx.status = "completed"
            tx.tokens = tokens
            tx.amount = amount
        db.commit()
    return {"status": "ok"}


# ── Crypto Payment ──

@router.get("/api/payments/crypto/addresses")
def get_crypto_addresses(user: User = Depends(get_current_user)):
    if not any(CRYPTO_WALLET_ADDRESSES.values()):
        _500("Crypto payment not configured")
    return {
        "addresses": [
            {"asset": k, "network": k.split("_")[1] if "_" in k else k, "address": v}
            for k, v in CRYPTO_WALLET_ADDRESSES.items()
        ]
    }


@router.post("/api/payments/crypto/create")
def create_crypto_payment(req: InitiatePaymentRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    asset = req.payment_method.upper()  # USDT_TRC20, BTC, ETH
    address = CRYPTO_WALLET_ADDRESSES.get(asset)
    if not address:
        _400(f"Unsupported crypto: {asset}")
    ref = f"crypto_{user.id}_{secrets.token_hex(8)}"
    tokens = int(req.amount * 1000)
    tx = Transaction(
        user_id=user.id, type="deposit", amount=req.amount, currency=asset,
        payment_method=f"crypto_{asset.lower()}", payment_ref=ref,
        tokens=tokens, status="pending",
    )
    db.add(tx); db.commit()
    rate = {"USDT_TRC20": 1.0, "USDT_ERC20": 1.0, "BTC": 85000, "ETH": 3500}.get(asset, 1.0)
    crypto_amount = round(req.amount / rate, 6)
    return {
        "reference": ref,
        "address": address,
        "asset": asset,
        "crypto_amount": crypto_amount,
        "usd_amount": req.amount,
        "tokens": tokens,
        "instructions": f"Send exactly {crypto_amount} {asset} to the address above. Your tokens will be credited after 1 network confirmation.",
    }


# ── Billing / Invoices ──

@router.get("/api/billing/invoices")
def get_invoices(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Invoice/payment history — all deposit transactions."""
    invoices = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.type == "deposit",
        )
        .order_by(desc(Transaction.created_at))
        .all()
    )
    return {
        "invoices": [
            {
                "id": t.id,
                "amount": t.amount,
                "currency": t.currency or "USD",
                "payment_method": t.payment_method,
                "tokens_added": t.tokens,
                "status": t.status,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "receipt_url": None,  # Receipt URLs not stored currently
            }
            for t in invoices
        ],
        "total": len(invoices),
    }
