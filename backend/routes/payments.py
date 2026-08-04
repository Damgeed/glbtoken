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
from schemas import TopupRequest, InitiatePaymentRequest, CardConfirmRequest, CardRemoveRequest

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
    # SECURITY: never mint tokens from a bare client amount. A credit is only
    # allowed against a PENDING deposit transaction created by a real payment
    # provider (Stripe/Paystack/crypto). This closes the free-token-mint hole.
    amount = float(req.amount or 0)
    if amount < 2.0 or amount > 2000.0:
        _400("Amount must be between $2 and $2000")
    ref = (req.payment_ref or "").strip()
    if not ref:
        _400("A verified payment reference is required")
    tx = db.query(Transaction).filter(
        Transaction.payment_ref == ref,
        Transaction.user_id == user.id,
        Transaction.type == "deposit",
        Transaction.status == "pending",
    ).first()
    if not tx:
        _400("No pending payment found for this reference")
    if abs((tx.amount or 0) - amount) > 0.01:
        _400("Amount does not match the pending payment")
    tokens = int(amount * 1000)
    tx.status = "completed"
    tx.tokens = tokens
    tx.amount = amount
    user.token_balance += tokens
    user.total_spent += amount
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
            "callback_url": "https://glbtoken.com/dashboard.html",
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
    cus = _stripe_customer_for(user)
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
        customer=cus.id,
        # Shows a "Save my card for future purchases" checkbox on the hosted page.
        payment_method_options={"card": {"save_payment_method": True}},
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


@router.post("/api/payments/stripe/quick-recharge")
def stripe_quick_recharge(req: InitiatePaymentRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """One-click recharge with a saved card (PaymentIntent, off_session)."""
    if not STRIPE_SECRET_KEY:
        _not_configured("Stripe")
    if not req.payment_method_id:
        _400("payment_method_id is required")
    if req.amount < 1:
        _400("Minimum recharge is $1")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    cus = _stripe_customer_for(user)
    tokens = int(req.amount * 1000)
    try:
        pi = stripe_lib.PaymentIntent.create(
            amount=int(req.amount * 100),
            currency=req.currency.lower(),
            customer=cus.id,
            payment_method=req.payment_method_id,
            off_session=True,
            confirm=True,
            metadata={"user_id": str(user.id), "tokens": str(tokens)},
        )
    except stripe_lib.error.CardError as e:
        _400(f"Card declined: {e.error.message}")
    except stripe_lib.error.StripeError as e:
        _400(f"Payment failed: {getattr(e, 'user_message', None) or str(e)}")

    if pi.status == "requires_action":
        return {"status": "requires_action", "client_secret": pi.client_secret,
                "message": "Card requires 3D Secure verification — please use the normal top-up flow for this card."}
    if pi.status != "succeeded":
        _400(f"Payment not completed (status: {pi.status})")

    # Idempotency: a webhook (payment_intent.succeeded) may also arrive — never credit twice.
    existing = db.query(Transaction).filter(Transaction.payment_ref == pi.id).first()
    if existing and existing.status == "completed":
        return {"status": "success", "tokens_added": existing.tokens, "new_balance": user.token_balance}
    tx = Transaction(
        user_id=user.id, type="deposit", amount=req.amount, currency=req.currency,
        payment_method="stripe", payment_ref=pi.id,
        tokens=tokens, status="completed",
    )
    db.add(tx)
    user.token_balance += tokens
    user.total_spent += req.amount
    db.commit()
    return {"status": "success", "tokens_added": tokens, "new_balance": user.token_balance}


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
        # Save the card if the user checked "Save my card for future purchases".
        if session.get("setup_future_usage") == "off_session" and session.get("payment_method"):
            try:
                stripe_lib.PaymentMethod.attach(session["payment_method"], customer=session.get("customer"))
            except Exception as e:
                print(f"⚠️ Could not attach saved card: {e}")
        # Idempotency: Stripe retries webhooks — never credit twice.
        tx = db.query(Transaction).filter(Transaction.payment_ref == session["id"]).first()
        if not tx or tx.status == "completed":
            return {"status": "ok"}
        user_id = int(session["metadata"]["user_id"])
        # Derive tokens from the REAL charged amount, not client-supplied metadata.
        amount = session["amount_total"] / 100
        tokens = int(amount * 1000)
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.token_balance += tokens
            user.total_spent += amount
        tx.status = "completed"
        tx.tokens = tokens
        tx.amount = amount
        db.commit()
    if event["type"] == "payment_intent.succeeded":
        # Safety net for one-click recharge — endpoint already credits, so skip if present.
        pi = event["data"]["object"]
        tx = db.query(Transaction).filter(Transaction.payment_ref == pi["id"]).first()
        if tx and tx.status != "completed":
            user_id = int(pi["metadata"]["user_id"])
            amount = pi["amount"] / 100
            tokens = int(amount * 1000)
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                user.token_balance += tokens
                user.total_spent += amount
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


# ── Saved Payment Methods (cards) ──

def _stripe_customer_for(user):
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    email = (user.email or "").strip()
    if email:
        existing = stripe_lib.Customer.list(email=email, limit=1)
        if existing.data:
            return existing.data[0]
    return stripe_lib.Customer.create(
        email=email or None,
        metadata={"user_id": str(user.id)},
    )


@router.post("/api/payments/cards/setup")
def cards_setup(user: User = Depends(get_current_user)):
    """Start a Stripe Setup session so the user can save a card (hosted page)."""
    if not STRIPE_SECRET_KEY:
        _not_configured("Stripe")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    cus = _stripe_customer_for(user)
    session = stripe_lib.checkout.Session.create(
        mode="setup",
        customer=cus.id,
        payment_method_types=["card"],
        metadata={"user_id": str(user.id)},
        success_url="https://damgeed.github.io/glbtoken/billing.html?card=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url="https://damgeed.github.io/glbtoken/billing.html",
    )
    return {"url": session.url, "session_id": session.id}


@router.get("/api/payments/cards")
def list_cards(user: User = Depends(get_current_user)):
    """List the user's saved cards from Stripe."""
    if not STRIPE_SECRET_KEY:
        _not_configured("Stripe")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    cus = _stripe_customer_for(user)
    pms = stripe_lib.PaymentMethod.list(customer=cus.id, type="card")
    return {
        "cards": [
            {
                "id": pm.id,
                "brand": pm.card.brand,
                "last4": pm.card.last4,
                "exp_month": pm.card.exp_month,
                "exp_year": pm.card.exp_year,
            }
            for pm in pms.data
        ]
    }


@router.post("/api/payments/cards/confirm")
def confirm_card(req: CardConfirmRequest, user: User = Depends(get_current_user)):
    """Confirm a card saved via the Stripe Setup session."""
    if not STRIPE_SECRET_KEY:
        _not_configured("Stripe")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    session = stripe_lib.checkout.Session.retrieve(req.session_id)
    pm = session.get("payment_method")
    if not pm:
        _400("No payment method on session")
    cus = _stripe_customer_for(user)
    stripe_lib.PaymentMethod.attach(pm, customer=cus.id)
    return {"status": "card_saved"}


@router.delete("/api/payments/cards")
def remove_card(req: CardRemoveRequest, user: User = Depends(get_current_user)):
    """Remove a saved card from the user's Stripe customer."""
    if not STRIPE_SECRET_KEY:
        _not_configured("Stripe")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    stripe_lib.PaymentMethod.detach(req.payment_method_id)
    return {"status": "removed"}
