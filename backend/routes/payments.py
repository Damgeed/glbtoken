"""GlbTOKEN — Payments Routes (topup, Paystack, Stripe, Crypto, transactions, billing)"""

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, update
from datetime import datetime, timezone
from typing import Optional
import json
import secrets
import time as _time

from database import get_db, User, Transaction
from auth import get_current_user
from newapi_integration import add_user_quota
from common import _400, _404, _500, _not_configured, limiter, \
    PAYSTACK_SECRET_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CRYPTO_WALLET_ADDRESSES, GHS_TO_USD_RATE
from schemas import TopupRequest, InitiatePaymentRequest, CardConfirmRequest, CardRemoveRequest, CardDefaultRequest, PaystackVerifyRequest

router = APIRouter()


@router.get("/api/config/payments")
def payment_methods_config():
    """Which payment rails are actually wired (public — no auth needed).

    Lets the frontend hide e.g. the Paystack card when the secret key is
    missing, so users never get stuck on a 'not configured' rail.
    """
    return {
        "stripe": bool(STRIPE_SECRET_KEY),
        "paystack": bool(PAYSTACK_SECRET_KEY),
        "crypto": bool(CRYPTO_WALLET_ADDRESSES),
    }


def _emit_topup_webhook(user, tokens: int, method: str):
    """Fire-and-forget topup.success webhook (no-op when unconfigured)."""
    try:
        from webhooks import send_webhook, event_enabled
        if user and event_enabled(user, "topup.success"):
            send_webhook(user, "topup.success", {
                "tokens_added": tokens,
                "new_balance": user.token_balance,
                "method": method,
            })
    except Exception as e:
        print(f"⚠️ topup.success webhook failed: {e}")

# 10s TTL cache for the transactions list (overview + billing poll it every 30s)
_TXN_CACHE: dict = {}


# ── Transaction Routes ──

@router.get("/api/transactions")
def list_transactions(
    type: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 10s TTL cache (keyed by user+type+limit+offset) — overview polls this every
    # 30s; caching keeps the transaction tables fast without going stale.
    try:
        cache_key = f"txns:{user.id}:{type or ''}:{limit}:{offset}"
        hit = _TXN_CACHE.get(cache_key)
        if hit and _time.time() - hit[0] < 10:
            return hit[1]
    except Exception as e:
        print(f"⚠️ TXN cache read failed: {e}")
    q = db.query(Transaction).filter(Transaction.user_id == user.id)
    if type:
        q = q.filter(Transaction.type == type)
    total = q.count()
    items = q.order_by(desc(Transaction.created_at)).offset(offset).limit(limit).all()
    result = {
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
    try:
        _TXN_CACHE[cache_key] = (_time.time(), result)
        # Bound the cache: evict stale entries once it grows large so a
        # long-running process with many users can't leak memory unboundedly.
        if len(_TXN_CACHE) > 2000:
            _now = _time.time()
            for _k in [k for k, (_ts, _v) in _TXN_CACHE.items() if _now - _ts > 10]:
                del _TXN_CACHE[_k]
    except Exception as e:
        print(f"⚠️ TXN cache write failed: {e}")
    return result


@router.post("/api/topup")
@limiter.limit("10/minute")
async def topup(req: TopupRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # SECURITY: never mint tokens from a bare client amount. A credit is only
    # allowed against a PENDING deposit transaction created by a real payment
    # provider (Stripe/Paystack/crypto). This closes the free-token-mint hole.
    amount = float(req.amount or 0)
    import math
    if not math.isfinite(amount):
        _400("Amount must be a valid number")
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
    # SECURITY: verify with the payment provider that the payment ACTUALLY
    # succeeded before crediting. A pending tx alone is NOT proof of payment.
    method = (tx.payment_method or "").lower()
    if method == "paystack":
        if not PAYSTACK_SECRET_KEY:
            _not_configured("Paystack")
        import httpx as _httpx
        _r = _httpx.get(
            f"https://api.paystack.co/transaction/verify/{ref}",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"},
            timeout=15,
        )
        _d = _r.json()
        if not _d.get("status") or _d.get("data", {}).get("status") != "success":
            _400("Payment not confirmed by Paystack")
    elif method == "stripe":
        if not STRIPE_SECRET_KEY:
            _not_configured("Stripe")
        import stripe as _stripe
        _stripe.api_key = STRIPE_SECRET_KEY
        try:
            _s = _stripe.checkout.Session.retrieve(ref)
        except Exception:
            _400("Payment not confirmed by Stripe")
        if getattr(_s, "payment_status", "") != "paid":
            _400("Payment not confirmed by Stripe")
    elif method.startswith("crypto"):
        _400("Crypto payments require manual on-chain verification — contact support")
    else:
        _400("Unsupported payment method")
    # SECURITY: tokens are priced in USD (1000/USD). Paystack charges in the
    # local currency (GHS), so convert before minting — otherwise a small GHS
    # payment mints far more tokens than its USD value.
    usd_amount = amount / GHS_TO_USD_RATE if (tx.currency or "").upper() == "GHS" else amount
    tokens = int(usd_amount * 1000)
    # Atomic credit: conditional UPDATE on the pending tx prevents double-credit
    # from concurrent requests (same ref), and SQL-side balance increment
    # prevents lost updates from concurrent payments on the same user.
    db.execute(
        update(User).where(User.id == user.id).values(
            token_balance=User.token_balance + tokens,
            total_spent=User.total_spent + amount,
        )
    )
    res = db.execute(
        update(Transaction)
        .where(Transaction.payment_ref == ref, Transaction.status == "pending")
        .values(status="completed", tokens=tokens, amount=amount)
    )
    if res.rowcount == 0:
        db.rollback()
        _400("Payment already processed")
    db.commit()
    db.refresh(user)
    _emit_topup_webhook(user, tokens, "topup")

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
@limiter.limit("10/minute")
def paystack_initialize(req: InitiatePaymentRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not PAYSTACK_SECRET_KEY:
        _not_configured("Paystack")
    import math
    if req.amount is None or not math.isfinite(float(req.amount)) or float(req.amount) < 2.0 or float(req.amount) > 2000.0:
        _400("Amount must be between $2 and $2000")
    import httpx
    amount_kobo = int(float(req.amount) * 100)  # Paystack uses kobo (cents)
    resp = httpx.post(
        "https://api.paystack.co/transaction/initialize",
        json={
            "email": req.email or user.email,
            "amount": amount_kobo,
            "currency": "GHS" if req.currency == "GHS" else "USD",
            "metadata": {"user_id": user.id, "payment_method": "paystack"},
            "callback_url": "https://glbtoken.com/topup.html?payment=success&reference={reference}",
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
@limiter.limit("10/minute")
def paystack_verify(body: PaystackVerifyRequest, request: Request = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not PAYSTACK_SECRET_KEY:
        _not_configured("Paystack")
    import re
    reference = body.reference
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
    # SECURITY: tokens are priced in USD (1000/USD). Paystack reports the
    # charged currency — convert non-USD (GHS) to USD before minting, otherwise
    # a small local-currency payment mints far more tokens than its USD value.
    charged_currency = (data["data"].get("currency") or "").upper()
    usd_amount = amount / GHS_TO_USD_RATE if charged_currency == "GHS" else amount
    tokens = int(usd_amount * 1000)
    # Atomic credit: conditional UPDATE prevents double-credit when this endpoint
    # and a concurrent retry/duplicate request race on the same reference.
    res = db.execute(
        update(Transaction)
        .where(Transaction.payment_ref == reference, Transaction.status == "pending")
        .values(status="completed", tokens=tokens, amount=amount)
    )
    if res.rowcount == 0:
        db.rollback()
        db.refresh(tx)
        if tx.status == "completed":
            return {"status": "already_processed", "tokens_added": tx.tokens}
        _400("Payment already processed")
    db.execute(
        update(User).where(User.id == user.id).values(
            token_balance=User.token_balance + tokens,
            total_spent=User.total_spent + amount,
        )
    )
    db.commit()
    db.refresh(user)
    _emit_topup_webhook(user, tokens, "paystack")
    return {"status": "success", "tokens_added": tokens, "new_balance": user.token_balance}


# ── Stripe Payment ──

@router.post("/api/payments/stripe/create-checkout")
@limiter.limit("10/minute")
def stripe_create_checkout(req: InitiatePaymentRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not STRIPE_SECRET_KEY:
        _not_configured("Stripe")
    import math
    if req.amount is None or not math.isfinite(float(req.amount)) or float(req.amount) < 2.0 or float(req.amount) > 2000.0:
        _400("Amount must be between $2 and $2000")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    tokens = int(req.amount * 1000)
    cus = _stripe_customer_for(user)
    try:
        session = stripe_lib.checkout.Session.create(
            mode="payment",
            line_items=[{
                "price_data": {
                    # SECURITY: tokens are priced in USD — force USD so a
                    # client-supplied cheap currency (e.g. JPY) can't mint
                    # tokens at a fraction of their USD value.
                    "currency": "usd",
                    "product_data": {"name": f"{tokens:,} GlbTOKEN"},
                    "unit_amount": int(req.amount * 100),
                },
                "quantity": 1,
            }],
            customer=cus.id,
            # Save-card support: newer Stripe API versions moved the "save my card"
            # checkbox out of payment_method_options[card][save_payment_method].
            # Use the top-level allow_promotion_codes-free, version-agnostic approach:
            # omit the checkbox entirely (saved cards still work via the Cards page
            # setup flow + quick-recharge PaymentIntents).
            metadata={"user_id": str(user.id), "tokens": str(tokens)},
            success_url="https://glbtoken.com/topup.html?payment=success&session_id={CHECKOUT_SESSION_ID}",
            cancel_url="https://glbtoken.com/topup.html?payment=cancelled",
        )
    except stripe_lib.error.StripeError as e:
        _400(f"Checkout failed: {getattr(e, 'user_message', None) or 'Payment provider error'}")
    tx = Transaction(
        user_id=user.id, type="deposit", amount=req.amount, currency=req.currency,
        payment_method="stripe", payment_ref=session.id,
        tokens=0, status="pending",
    )
    db.add(tx); db.commit()
    return {"url": session.url, "session_id": session.id}


@router.post("/api/payments/stripe/quick-recharge")
@limiter.limit("10/minute")
def stripe_quick_recharge(req: InitiatePaymentRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """One-click recharge with a saved card (PaymentIntent, off_session)."""
    if not STRIPE_SECRET_KEY:
        _not_configured("Stripe")
    if not req.payment_method_id:
        _400("payment_method_id is required")
    import math
    if req.amount is None or not math.isfinite(float(req.amount)) or float(req.amount) < 1.0:
        _400("Minimum recharge is $1")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    cus = _stripe_customer_for(user)
    tokens = int(req.amount * 1000)
    try:
        pi = stripe_lib.PaymentIntent.create(
            amount=int(req.amount * 100),
            # SECURITY: tokens are priced in USD — force USD (same reasoning
            # as stripe_create_checkout).
            currency="usd",
            customer=cus.id,
            payment_method=req.payment_method_id,
            off_session=True,
            confirm=True,
            metadata={"user_id": str(user.id), "tokens": str(tokens)},
        )
    except stripe_lib.error.CardError as e:
        _400(f"Card declined: {e.error.message}")
    except stripe_lib.error.StripeError as e:
        _400(f"Payment failed: {getattr(e, 'user_message', None) or 'Payment provider error'}")

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
    # SQL-side increment avoids lost updates from concurrent recharges.
    db.execute(
        update(User).where(User.id == user.id).values(
            token_balance=User.token_balance + tokens,
            total_spent=User.total_spent + req.amount,
        )
    )
    db.commit()
    db.refresh(user)
    _emit_topup_webhook(user, tokens, "stripe")
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
        # stripe-python v15+ returns StripeObject (not dict) — it has no .get()
        # and raises AttributeError on missing attrs. Normalize to a plain dict
        # so optional-field reads (setup_future_usage / payment_method) are safe.
        session = session.to_dict() if hasattr(session, "to_dict") else session
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
        # Atomic credit: conditional UPDATE on the pending tx makes webhook
        # retries / concurrent deliveries idempotent (no double-credit).
        res = db.execute(
            update(Transaction)
            .where(Transaction.payment_ref == session["id"], Transaction.status == "pending")
            .values(status="completed", tokens=tokens, amount=amount)
        )
        if res.rowcount == 0:
            db.rollback()
            return {"status": "ok"}
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            db.execute(
                update(User).where(User.id == user_id).values(
                    token_balance=User.token_balance + tokens,
                    total_spent=User.total_spent + amount,
                )
            )
        db.commit()
        if user:
            db.refresh(user)
        _emit_topup_webhook(user, tokens, "stripe_webhook")
    if event["type"] == "payment_intent.succeeded":
        # Safety net for one-click recharge — endpoint already credits, so skip if present.
        pi = event["data"]["object"]
        tx = db.query(Transaction).filter(Transaction.payment_ref == pi["id"]).first()
        if tx and tx.status != "completed":
            user_id = int(pi["metadata"]["user_id"])
            amount = pi["amount"] / 100
            tokens = int(amount * 1000)
            # Conditional UPDATE guards against racing the quick-recharge endpoint.
            res = db.execute(
                update(Transaction)
                .where(Transaction.payment_ref == pi["id"], Transaction.status == "pending")
                .values(status="completed", tokens=tokens, amount=amount)
            )
            if res.rowcount == 0:
                db.rollback()
                return {"status": "ok"}
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                db.execute(
                    update(User).where(User.id == user_id).values(
                        token_balance=User.token_balance + tokens,
                        total_spent=User.total_spent + amount,
                    )
                )
            db.commit()
            if user:
                db.refresh(user)
            _emit_topup_webhook(user, tokens, "stripe_webhook")
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
@limiter.limit("10/minute")
def create_crypto_payment(req: InitiatePaymentRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    asset = req.payment_method.upper()  # USDT_TRC20, BTC, ETH
    address = CRYPTO_WALLET_ADDRESSES.get(asset)
    if not address:
        _400(f"Unsupported crypto: {asset}")
    ref = f"crypto_{user.id}_{secrets.token_hex(8)}"
    import math
    if req.amount is None or not math.isfinite(float(req.amount)) or float(req.amount) < 2.0 or float(req.amount) > 2000.0:
        _400("Amount must be between $2 and $2000")
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
                "pdf_url": f"/api/billing/invoices/{t.id}/pdf",
            }
            for t in invoices
        ],
        "total": len(invoices),
    }


@router.get("/api/billing/summary")
def billing_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Current balance, monthly spend/usage, and low-balance flag for the billing page."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    spent_month = db.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
        Transaction.user_id == user.id,
        Transaction.type == "deposit",
        Transaction.status == "completed",
        Transaction.created_at >= month_start,
    ).scalar() or 0.0
    tokens_month = db.query(func.coalesce(func.sum(Transaction.tokens), 0.0)).filter(
        Transaction.user_id == user.id,
        Transaction.type == "consumption",
        Transaction.created_at >= month_start,
    ).scalar() or 0.0
    try:
        settings = json.loads(user.settings) if user.settings else {}
    except (json.JSONDecodeError, TypeError):
        settings = {}
    balance = float(user.token_balance or 0)
    threshold = 1000.0  # tokens (1 USD) — matches the notification page wording
    return {
        "balance": round(balance, 2),
        "balance_usd": round(balance / 1000.0, 2),
        "spent_this_month": round(float(spent_month), 2),
        "tokens_this_month": round(float(tokens_month), 2),
        "low_balance": balance < threshold,
        "low_balance_threshold": threshold,
        "low_balance_alert_enabled": settings.get("low_balance_alert", True),
    }


@router.get("/api/billing/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Download a clean one-page PDF for a deposit invoice (ownership-checked)."""
    tx = db.query(Transaction).filter(
        Transaction.id == invoice_id,
        Transaction.user_id == user.id,
        Transaction.type == "deposit",
    ).first()
    if not tx:
        _404("Invoice not found")
    pdf = _make_invoice_pdf(tx, user)
    filename = f"invoice-{tx.id}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/api/billing/statement")
def billing_statement(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Download a combined PDF statement of ALL the user's deposit invoices."""
    txs = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.type == "deposit",
    ).order_by(desc(Transaction.created_at)).all()
    if not txs:
        _404("No invoices to export")
    pdf = _make_statement_pdf(txs, user)
    filename = "glbtoken-statement.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_pdf(pages):
    """Build a PDF from a list of content-stream strings (one per page)."""
    n = len(pages)
    f1_num = 3 + 2 * n
    f2_num = f1_num + 1
    kids = b" ".join(b"%d 0 R" % (3 + 2 * i) for i in range(n))
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [" + kids + b"] /Count %d >>" % n,
    ]
    for i, content in enumerate(pages):
        page_num = 3 + 2 * i
        content_num = page_num + 1
        data = content.encode("latin-1", "replace")
        objs.append(
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>"
            % (f1_num, f2_num, content_num)
        )
        objs.append(b"<< /Length %d >>\nstream\n" % len(data) + data + b"\nendstream")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i
        out += obj + b"\nendobj\n"
    xref_pos = len(out)
    m = len(objs) + 1
    out += b"xref\n0 %d\n" % m
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (m, xref_pos)
    return bytes(out)


def _make_statement_pdf(txs, user):
    """Generate a combined multi-page statement PDF (stdlib only)."""
    name = (user.name or "").strip() or "GlbTOKEN Customer"
    email = (user.email or "").strip()
    total_amount = sum(float(t.amount or 0) for t in txs)
    total_tokens = sum(int(t.tokens or 0) for t in txs)

    def esc(s):
        return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    def width_est(s, size):
        # Helvetica: digits are 0.556em wide, most other chars ~0.5em
        return sum(0.556 if c.isdigit() else 0.5 for c in str(s)) * size

    rows_per_page = 25
    total_pages = max(1, (len(txs) + rows_per_page - 1) // rows_per_page)
    pages = []
    for p in range(total_pages):
        ops = []

        def text(x, y, s, font="F1", size=10, color="0 0 0"):
            ops.append(f"BT /{font} {size} Tf {color} rg {x:.1f} {y:.1f} Td ({esc(s)}) Tj ET")

        ops.append("q 0.957 0.706 0 rg 50 742 512 3 re f Q")
        text(50, 700, "GlbTOKEN", "F2", 22)
        text(50, 680, "PAYMENT STATEMENT", "F2", 12, "0.71 0.47 0.02")
        ops.append("q 0.85 0.85 0.88 rg 50 668 512 0.8 re f Q")
        text(50, 648, f"Billed to: {name}" + (f"  ({email})" if email else ""))
        text(50, 634, f"Generated: {datetime.now(timezone.utc).strftime('%B %d, %Y')}  |  {len(txs)} payment(s)")
        # Table header (Tokens/Status/Amount right-aligned to match values)
        text(50, 600, "#", "F2", 9)
        text(80, 600, "Date", "F2", 9)
        text(165, 600, "Description", "F2", 9)
        text(390 - width_est("Tokens", 9), 600, "Tokens", "F2", 9)
        text(470 - width_est("Status", 9), 600, "Status", "F2", 9)
        text(512 - width_est("Amount", 9), 600, "Amount", "F2", 9)
        ops.append("q 0.85 0.85 0.88 rg 50 592 512 0.8 re f Q")
        start = p * rows_per_page
        chunk = txs[start:start + rows_per_page]
        y = 574
        for i, t in enumerate(chunk):
            sym = "NGN " if (t.currency or "USD") == "NGN" else "$"
            created = t.created_at or datetime.now(timezone.utc)
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            date_str = created.strftime("%Y-%m-%d")
            method = (t.payment_method or "-").title()
            status = (t.status or "completed").title()
            amt = f"{sym}{float(t.amount or 0):,.2f}"
            toks = f"{int(t.tokens or 0):,}"
            text(50, y, str(start + i + 1), "F1", 9)
            text(80, y, date_str, "F1", 9)
            text(165, y, f"{method} #{t.id}", "F1", 9)
            text(390 - width_est(toks, 9), y, toks, "F1", 9)
            text(470 - width_est(status, 9), y, status, "F1", 9)
            text(512 - width_est(amt, 9), y, amt, "F1", 9)
            y -= 18
        # TOTAL row on last page
        if p == total_pages - 1:
            amt_total = f"${total_amount:,.2f}"
            toks_total = f"{int(total_tokens):,}"
            ops.append("q 0.957 0.706 0 rg 50 126 512 0.8 re f Q")
            text(50, 108, "TOTAL", "F2", 11)
            text(390 - width_est(toks_total, 11), 108, toks_total, "F2", 11)
            text(512 - width_est(amt_total, 11), 108, amt_total, "F2", 11)
        # Footer
        ops.append("q 0.85 0.85 0.88 rg 50 90 512 0.8 re f Q")
        text(50, 70, f"Page {p + 1} of {total_pages}", "F1", 9, "0.45 0.45 0.5")
        text(50, 54, "Generated by GlbTOKEN - glbtoken.com", "F1", 8, "0.6 0.6 0.65")
        pages.append("\n".join(ops))
    return _build_pdf(pages)


def _make_invoice_pdf(tx, user):
    """Generate a minimal clean invoice PDF using only the Python stdlib."""
    sym = "NGN " if (tx.currency or "USD") == "NGN" else "$"
    amount_str = f"{sym}{float(tx.amount or 0):,.2f}"
    tokens_str = f"{int(tx.tokens or 0):,}"
    created = tx.created_at or datetime.now(timezone.utc)
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    date_str = created.strftime("%B %d, %Y")
    status = (tx.status or "completed").title()
    method = (tx.payment_method or "-").title()
    name = (user.name or "").strip() or "GlbTOKEN Customer"
    email = (user.email or "").strip()

    def esc(s):
        return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    def width_est(s, size):
        # Rough Helvetica advance (~0.5em per char) — good enough for alignment
        return len(s) * size * 0.5

    # content stream: gold accent bar, header, meta rows, table, total, footer
    ops = []
    def text(x, y, s, font="F1", size=10, color="0 0 0"):
        ops.append(f"BT /{font} {size} Tf {color} rg {x:.1f} {y:.1f} Td ({esc(s)}) Tj ET")

    # Gold top rule
    ops.append("q 0.957 0.706 0 rg 50 742 512 3 re f Q")
    # Header
    text(50, 700, "GlbTOKEN", "F2", 22)
    text(50, 680, "INVOICE", "F2", 12, "0.71 0.47 0.02")
    ops.append("q 0.85 0.85 0.88 rg 50 668 512 0.8 re f Q")
    # Meta
    text(50, 648, f"Invoice #{tx.id}", "F1", 10)
    text(50, 634, f"Date: {date_str}")
    text(50, 620, f"Status: {status}")
    text(50, 600, f"Billed to: {name}" + (f"  ({email})" if email else ""))
    # Table header
    text(50, 566, "Description", "F2", 10)
    amt_x = 512 - width_est(amount_str, 10)
    text(amt_x, 566, "Amount", "F2", 10)
    ops.append("q 0.85 0.85 0.88 rg 50 558 512 0.8 re f Q")
    # Rows
    text(50, 538, f"GlbTOKEN tokens ({tokens_str} GT)")
    text(amt_x, 538, amount_str)
    text(50, 522, f"Payment method: {method}")
    text(50, 506, f"Tokens credited: {tokens_str}")
    # Total
    ops.append("q 0.957 0.706 0 rg 50 492 512 0.8 re f Q")
    text(50, 474, "TOTAL", "F2", 11)
    text(amt_x, 474, amount_str, "F2", 11)
    # Footer
    ops.append("q 0.85 0.85 0.88 rg 50 90 512 0.8 re f Q")
    text(50, 70, "Thank you for your business!", "F1", 9, "0.45 0.45 0.5")
    text(50, 54, "Generated by GlbTOKEN - glbtoken.com", "F1", 8, "0.6 0.6 0.65")

    content = "\n".join(ops)
    return _build_pdf([content])


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
@limiter.limit("10/minute")
def cards_setup(request: Request, user: User = Depends(get_current_user)):
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
        success_url="https://glbtoken.com/billing.html?card=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url="https://glbtoken.com/billing.html",
    )
    return {"url": session.url, "session_id": session.id}


@router.get("/api/payments/cards")
@limiter.limit("10/minute")
def list_cards(request: Request, user: User = Depends(get_current_user)):
    """List the user's saved cards from Stripe."""
    if not STRIPE_SECRET_KEY:
        _not_configured("Stripe")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    cus = _stripe_customer_for(user)
    pms = stripe_lib.PaymentMethod.list(customer=cus.id, type="card")
    default_id = user.default_payment_method_id
    return {
        "cards": [
            {
                "id": pm.id,
                "brand": pm.card.brand,
                "last4": pm.card.last4,
                "exp_month": pm.card.exp_month,
                "exp_year": pm.card.exp_year,
                "is_default": pm.id == default_id,
            }
            for pm in pms.data
        ]
    }


@router.post("/api/payments/cards/default")
@limiter.limit("10/minute")
def set_default_card(request: Request, req: CardDefaultRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mark a saved card as the default for one-click recharge."""
    if not STRIPE_SECRET_KEY:
        _not_configured("Stripe")
    if not req.payment_method_id:
        _400("payment_method_id is required")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    cus = _stripe_customer_for(user)
    try:
        pm = stripe_lib.PaymentMethod.retrieve(req.payment_method_id)
    except stripe_lib.error.StripeError as e:
        _400(f"Invalid payment method: {getattr(e, 'user_message', None) or 'Payment provider error'}")
    if pm.customer != cus.id:
        _400("Payment method does not belong to this account")
    user.default_payment_method_id = req.payment_method_id
    db.commit()
    return {"status": "default_set", "payment_method_id": req.payment_method_id}


@router.post("/api/payments/cards/confirm")
@limiter.limit("10/minute")
def confirm_card(request: Request, req: CardConfirmRequest, user: User = Depends(get_current_user)):
    """Confirm a card saved via the Stripe Setup session."""
    if not STRIPE_SECRET_KEY:
        _not_configured("Stripe")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    session = stripe_lib.checkout.Session.retrieve(req.session_id)
    # stripe ≥15 returns StripeObject (no .get()); normalize like the webhook handler
    session = session.to_dict() if hasattr(session, "to_dict") else session
    # Ownership check: the Setup session must belong to THIS user's Stripe customer.
    meta_user = session.get("metadata", {}).get("user_id")
    cus = _stripe_customer_for(user)
    if str(meta_user or "") != str(user.id):
        _400("Session does not belong to this account")
    pm = session.get("payment_method")
    if not pm:
        _400("No payment method on session")
    stripe_lib.PaymentMethod.attach(pm, customer=cus.id)
    return {"status": "card_saved"}


@router.delete("/api/payments/cards")
@limiter.limit("10/minute")
def remove_card(request: Request, req: CardRemoveRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Remove a saved card from the user's Stripe customer."""
    if not STRIPE_SECRET_KEY:
        _not_configured("Stripe")
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    cus = _stripe_customer_for(user)
    # Ownership check (mirrors set_default_card): never detach a payment method
    # that belongs to another user's Stripe customer (IDOR / billing DoS).
    try:
        pm = stripe_lib.PaymentMethod.retrieve(req.payment_method_id)
    except stripe_lib.error.StripeError as e:
        _400(f"Invalid payment method: {getattr(e, 'user_message', None) or 'Payment provider error'}")
    if pm.customer != cus.id:
        _400("Payment method does not belong to this account")
    stripe_lib.PaymentMethod.detach(req.payment_method_id)
    if user.default_payment_method_id == req.payment_method_id:
        user.default_payment_method_id = None
        db.commit()
    return {"status": "removed"}
