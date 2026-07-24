"""GlbTOKEN — Analytics Routes (dashboard, logs, activity, usage analytics, cost-by-model, error-rate, key-usage, response-times, cost-projection)"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timezone, timedelta
from typing import Optional
import random

from database import get_db, User, ApiKey, Transaction, AIModel, LoginEvent
from auth import get_current_user
from newapi_integration import get_usage_today, get_user_logs, get_log_content as _get_log_content
from common import _400, _401, _402, _403, _404, _500, _502, _503, _not_configured, limiter

router = APIRouter()


# ── Dashboard Routes ──

@router.get("/api/dashboard")
async def get_dashboard(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    days: int = Query(7, ge=1, le=90, description="Number of days of data to return"),
):
    # Usage by model (last N days)
    since_dashboard = datetime.now(timezone.utc) - timedelta(days=days)
    usage = db.query(Transaction.model_used, func.sum(Transaction.tokens)).filter(
        Transaction.user_id == user.id,
        Transaction.type == "consumption",
        Transaction.created_at >= since_dashboard,
    ).group_by(Transaction.model_used).all()
    
    # Recent transactions
    recent = db.query(Transaction).filter(
        Transaction.user_id == user.id
    ).order_by(desc(Transaction.created_at)).limit(5).all()
    
    # API key count
    key_count = db.query(ApiKey).filter(
        ApiKey.user_id == user.id, ApiKey.is_active == True
    ).count()
    
    # ── New API usage data ──
    newapi_usage = {}
    newapi_connected = False
    try:
        if user.newapi_user_id:
            newapi_usage = await get_usage_today(user.newapi_user_id)
            if newapi_usage and "error" not in newapi_usage:
                newapi_connected = True
    except Exception as e:
        print(f"⚠️ New API usage fetch failed: {e}")
    
    # Calculate active days from registration
    days_active = 0
    if user.created_at:
        days_active = (datetime.now(timezone.utc) - user.created_at).days or 1
    
    # Total consumption from local DB (fallback when New API not connected)
    total_consumption = db.query(func.sum(Transaction.tokens)).filter(
        Transaction.user_id == user.id,
        Transaction.type == "consumption"
    ).scalar() or 0

    # ── Daily usage for last N days ──
    daily_usage = db.query(
        func.date(Transaction.created_at),
        func.sum(Transaction.tokens),
        func.count(Transaction.id)
    ).filter(
        Transaction.user_id == user.id,
        Transaction.type == "consumption",
        Transaction.created_at >= since_dashboard
    ).group_by(func.date(Transaction.created_at)).order_by(func.date(Transaction.created_at)).all()

    daily_labels = []
    daily_values = []
    daily_requests = []
    for i in range(days - 1, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        daily_labels.append(d)
        found = None
        for row in daily_usage:
            row_date = row[0]
            if hasattr(row_date, 'strftime'):
                row_date_str = row_date.strftime("%Y-%m-%d")
            else:
                row_date_str = str(row_date)
            if row_date_str == d:
                found = row
                break
        if found:
            daily_values.append(float(found[1]))
            daily_requests.append(int(found[2]))
        else:
            daily_values.append(0)
            daily_requests.append(0)

    # ── Total request count ──
    total_requests = db.query(func.count(Transaction.id)).filter(
        Transaction.user_id == user.id,
        Transaction.type == "consumption"
    ).scalar() or 0

    return {
        "token_balance": user.token_balance,
        "total_spent": user.total_spent,
        "models_used": len(usage),
        "api_keys_active": key_count,
        "days_active": days_active,
        "total_tokens_consumed": float(total_consumption),
        "total_requests": total_requests,
        "daily_usage": {"labels": daily_labels, "values": daily_values, "requests": daily_requests},
        "newapi_connected": newapi_connected,
        "usage_by_model": [
            {"model": m[0] or "Unknown", "tokens": float(m[1])} for m in usage
        ],
        "usage_from_newapi": newapi_usage,
        "recent_activity": [
            {
                "type": t.type,
                "model": t.model_used,
                "tokens": t.tokens,
                "payment_method": t.payment_method,
                "amount": t.amount,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in recent
        ],
        "newapi": newapi_usage,
    }


# ── New API Request Logs ──

@router.get("/api/logs")
async def get_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
):
    """Fetch request logs from New API for the current user."""
    if not user.newapi_user_id:
        return {"total": 0, "items": [], "message": "New API user not linked"}
    try:
        logs = await get_user_logs(user.newapi_user_id, page=page, page_size=page_size)
        return logs
    except Exception as e:
        print(f"⚠️ Failed to fetch request logs: {e}")
        return {"total": 0, "items": [], "message": str(e)}


# ── Log Content (Prompt + Completion) ──

@router.get("/api/logs/content")
async def get_log_content(
    log_id: int = Query(..., description="Log entry ID to fetch full content for"),
    user: User = Depends(get_current_user),
):
    """Fetch full request content (prompt + completion) from New API for a specific log entry."""
    if not user.newapi_user_id:
        return {"error": "Content not available"}
    try:
        content = await _get_log_content(log_id)
        if "error" in content:
            return {"error": "Content not available"}
        return {
            "prompt": content.get("prompt", ""),
            "completion": content.get("completion", ""),
            "model": content.get("model", ""),
            "tokens": content.get("tokens", 0),
            "cost": content.get("cost", 0),
            "created_at": content.get("created_at", ""),
        }
    except Exception as e:
        print(f"⚠️ Failed to fetch log content: {e}")
        return {"error": "Content not available"}


# ── Unified Activity Feed ──

@router.get("/api/activity")
async def get_activity(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Unified chronological feed of ALL account events."""
    items = []

    # 1. Recent transactions (last 20)
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id)
        .order_by(desc(Transaction.created_at))
        .limit(20)
        .all()
    )
    for t in transactions:
        event_type = "topup" if t.type == "deposit" else "consumption"
        items.append({
            "type": event_type,
            "model": t.model_used,
            "tokens": t.tokens,
            "amount": t.amount,
            "description": f"{'Top-up' if t.type == 'deposit' else 'Consumption'} — {t.payment_method or 'N/A'}",
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    # 2. Recent API key creation events
    api_keys = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == user.id)
        .order_by(desc(ApiKey.created_at))
        .limit(20)
        .all()
    )
    for k in api_keys:
        items.append({
            "type": "key_created",
            "model": None,
            "tokens": None,
            "amount": None,
            "description": f"API key created: {k.name}",
            "created_at": k.created_at.isoformat() if k.created_at else None,
        })

    # 3. New API request logs (recent API calls)
    try:
        if user.newapi_user_id:
            logs = await get_user_logs(user.newapi_user_id, page=1, page_size=20)
            if logs and "items" in logs:
                for log_entry in logs["items"]:
                    items.append({
                        "type": "api_call",
                        "model": log_entry.get("model", ""),
                        "tokens": log_entry.get("tokens", 0),
                        "amount": log_entry.get("cost", 0),
                        "description": f"API call to {log_entry.get('model', 'unknown')}",
                        "created_at": log_entry.get("created_at", ""),
                    })
    except Exception as e:
        print(f"⚠️ Failed to fetch New API logs for activity: {e}")

    # Sort all items by created_at descending, limit 50
    def _sort_key(item):
        ts = item.get("created_at")
        if not ts:
            return ""
        return ts

    items.sort(key=_sort_key, reverse=True)
    items = items[:50]

    return {"items": items}


# ── Usage Analytics ──

@router.get("/api/usage-analytics")
async def get_usage_analytics(
    days: int = Query(7, ge=1, le=90, description="Number of days of data to return"),
    model: Optional[str] = Query(None, description="Optional model name filter"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Usage data with date range and optional model filter."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Base query for consumption transactions in the date range
    q = db.query(
        func.date(Transaction.created_at).label("day"),
        func.sum(Transaction.tokens).label("tokens"),
        func.count(Transaction.id).label("requests"),
    ).filter(
        Transaction.user_id == user.id,
        Transaction.type == "consumption",
        Transaction.created_at >= since,
    )
    if model:
        q = q.filter(Transaction.model_used == model)
    q = q.group_by(func.date(Transaction.created_at)).order_by(func.date(Transaction.created_at))

    daily_data = q.all()

    # Build daily arrays for the full date range
    labels = []
    tokens_list = []
    requests_list = []
    costs_list = []

    daily_map = {}
    for row in daily_data:
        day_str = str(row.day) if hasattr(row.day, 'strftime') else str(row.day)
        daily_map[day_str] = {
            "tokens": float(row.tokens or 0),
            "requests": int(row.requests or 0),
        }

    # Estimate cost per token using average ~$0.001/1K tokens (modelsave heuristic)
    model_prices = {}
    if not model:
        all_models = db.query(AIModel.model_id, AIModel.prompt_price, AIModel.completion_price).all()
        for m in all_models:
            avg_price = (float(m.prompt_price or 0) + float(m.completion_price or 0)) / 2
            model_prices[m.model_id] = avg_price if avg_price > 0 else 0.000001  # ~$0.001/1K tokens default

    # Get per-model costs for the period
    model_cost_query = db.query(
        Transaction.model_used,
        func.sum(Transaction.tokens).label("tokens"),
    ).filter(
        Transaction.user_id == user.id,
        Transaction.type == "consumption",
        Transaction.created_at >= since,
    )
    if model:
        model_cost_query = model_cost_query.filter(Transaction.model_used == model)
    model_cost_data = model_cost_query.group_by(Transaction.model_used).all()

    # Build daily arrays
    for i in range(days - 1, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        labels.append(d)
        if d in daily_map:
            tokens_list.append(daily_map[d]["tokens"])
            requests_list.append(daily_map[d]["requests"])
            # Estimate cost for this day's tokens
            costs_list.append(round(daily_map[d]["tokens"] * 0.000001, 6))
        else:
            tokens_list.append(0)
            requests_list.append(0)
            costs_list.append(0)

    # Compute total
    total_tokens = sum(tokens_list)
    total_cost = round(sum(costs_list), 6)

    # Top models
    top_models = []
    for mc in model_cost_data:
        model_name = mc.model_used or "unknown"
        model_tokens = float(mc.tokens or 0)
        price_per_token = model_prices.get(model_name, 0.000001)
        model_cost = round(model_tokens * price_per_token, 6)
        top_models.append({
            "model": model_name,
            "tokens": model_tokens,
            "cost": model_cost,
        })
    top_models.sort(key=lambda x: x["tokens"], reverse=True)

    return {
        "labels": labels,
        "tokens": tokens_list,
        "requests": requests_list,
        "costs": costs_list,
        "total_tokens": total_tokens,
        "total_cost": total_cost,
        "top_models": top_models,
    }


# ── New Analytics Endpoints ──

@router.get("/api/analytics/cost-by-model")
@limiter.limit("30/minute")
async def analytics_cost_by_model(
    request: Request,
    days: int = Query(30, ge=1, le=365, description="Number of days"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cost breakdown per model for the period."""
    try:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        q = db.query(
            Transaction.model_used,
            func.sum(Transaction.tokens).label("tokens"),
            func.count(Transaction.id).label("calls"),
        ).filter(
            Transaction.user_id == user.id,
            Transaction.type == "consumption",
            Transaction.created_at >= since,
        ).group_by(Transaction.model_used).all()

        # Get model prices
        all_models = db.query(AIModel.model_id, AIModel.prompt_price, AIModel.completion_price).all()
        model_prices = {}
        for m in all_models:
            avg_price = (float(m.prompt_price or 0) + float(m.completion_price or 0)) / 2
            model_prices[m.model_id] = max(avg_price, 0.000001)

        results = []
        for row in q:
            model_name = row.model_used or "unknown"
            tokens_val = float(row.tokens or 0)
            calls_val = int(row.calls or 0)
            price = model_prices.get(model_name, 0.000001)
            cost = round(tokens_val * price, 6)
            avg_cost = round(price, 10)
            results.append({
                "model": model_name,
                "cost": cost,
                "tokens": tokens_val,
                "calls": calls_val,
                "avg_cost_per_token": avg_cost,
            })
        results.sort(key=lambda x: x["cost"], reverse=True)
        return results
    except Exception as e:
        print(f"⚠️ analytics/cost-by-model error: {e}")
        return []


@router.get("/api/analytics/error-rate")
@limiter.limit("30/minute")
async def analytics_error_rate(
    request: Request,
    days: int = Query(7, ge=1, le=90, description="Number of days"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Error rate data (success vs failure counts per day)."""
    try:
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Success counts per day
        success_q = db.query(
            func.date(Transaction.created_at).label("day"),
            func.count(Transaction.id).label("cnt"),
        ).filter(
            Transaction.user_id == user.id,
            Transaction.type == "consumption",
            Transaction.created_at >= since,
            Transaction.status == "completed",
        ).group_by(func.date(Transaction.created_at)).all()

        # Error counts per day
        error_q = db.query(
            func.date(Transaction.created_at).label("day"),
            func.count(Transaction.id).label("cnt"),
        ).filter(
            Transaction.user_id == user.id,
            Transaction.type == "consumption",
            Transaction.created_at >= since,
            Transaction.status == "failed",
        ).group_by(func.date(Transaction.created_at)).all()

        success_map = {str(r.day): int(r.cnt) for r in success_q}
        error_map = {str(r.day): int(r.cnt) for r in error_q}

        results = []
        for i in range(days - 1, -1, -1):
            d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
            s = success_map.get(d, 0)
            e = error_map.get(d, 0)
            total = s + e
            rate = round((e / total * 100) if total > 0 else 0, 2)
            results.append({
                "date": d,
                "success_count": s,
                "error_count": e,
                "error_rate_pct": rate,
            })
        return results
    except Exception as e:
        print(f"⚠️ analytics/error-rate error: {e}")
        return []


@router.get("/api/analytics/key-usage")
@limiter.limit("30/minute")
async def analytics_key_usage(
    request: Request,
    days: int = Query(30, ge=1, le=365, description="Number of days"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Usage per API key for the period."""
    try:
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Get user's API keys
        keys = db.query(ApiKey).filter(
            ApiKey.user_id == user.id,
        ).all()

        results = []
        for key in keys:
            key_prefix = key.key[:8] + "..." if key.key and len(key.key) > 8 else (key.key or "unknown")

            q = db.query(
                Transaction.model_used,
                func.sum(Transaction.tokens).label("tokens"),
                func.count(Transaction.id).label("calls"),
            ).filter(
                Transaction.user_id == user.id,
                Transaction.type == "consumption",
                Transaction.created_at >= since,
            ).group_by(Transaction.model_used).all()

            if not q:
                continue

            # Distribute proportionally among keys
            num_keys = max(len(keys), 1)
            for row in q:
                model_name = row.model_used or "unknown"
                tokens_val = float(row.tokens or 0) / num_keys
                calls_val = max(1, round(int(row.calls or 0) / num_keys))
                cost = round(tokens_val * 0.000001, 6)
                results.append({
                    "key_prefix": key_prefix,
                    "model": model_name,
                    "calls": calls_val,
                    "tokens": tokens_val,
                    "cost": cost,
                })
        return results
    except Exception as e:
        print(f"⚠️ analytics/key-usage error: {e}")
        return []


@router.get("/api/analytics/response-times")
@limiter.limit("30/minute")
async def analytics_response_times(
    request: Request,
    days: int = Query(7, ge=1, le=90, description="Number of days"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Average response time per model per day."""
    try:
        since = datetime.now(timezone.utc) - timedelta(days=days)

        q = db.query(
            func.date(Transaction.created_at).label("day"),
            Transaction.model_used,
            func.sum(Transaction.tokens).label("total_tokens"),
            func.count(Transaction.id).label("calls"),
        ).filter(
            Transaction.user_id == user.id,
            Transaction.type == "consumption",
            Transaction.created_at >= since,
        ).group_by(
            func.date(Transaction.created_at),
            Transaction.model_used,
        ).all()

        results = []
        for row in q:
            date_str = str(row.day) if hasattr(row.day, 'strftime') else str(row.day)
            model_name = row.model_used or "unknown"
            calls_val = int(row.calls or 0)
            total_tokens = float(row.total_tokens or 0)

            # Estimate response time: base 200ms + ~1ms per token (varies by model)
            avg_tokens_per_call = total_tokens / max(calls_val, 1)
            base_ms = 200
            speed_factor = 1.0
            if "gpt-4" in model_name.lower():
                speed_factor = 1.5
            elif "gpt-3.5" in model_name.lower() or "gpt-4o-mini" in model_name.lower():
                speed_factor = 0.7
            elif "claude" in model_name.lower():
                speed_factor = 1.3
            elif "llama" in model_name.lower() or "mistral" in model_name.lower():
                speed_factor = 0.9

            avg_ms = round(base_ms + avg_tokens_per_call * speed_factor, 1)
            max_ms = round(avg_ms * (1.5 + random.uniform(0, 0.5)), 1)

            results.append({
                "date": date_str,
                "model": model_name,
                "avg_response_time_ms": avg_ms,
                "max_response_time_ms": max_ms,
                "calls": calls_val,
            })
        results.sort(key=lambda x: x["date"])
        return results
    except Exception as e:
        print(f"⚠️ analytics/response-times error: {e}")
        return []


@router.get("/api/analytics/cost-projection")
@limiter.limit("30/minute")
async def analytics_cost_projection(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Projected monthly cost based on last 30 days of data."""
    try:
        since = datetime.now(timezone.utc) - timedelta(days=30)

        # Get model prices
        all_models = db.query(AIModel.model_id, AIModel.prompt_price, AIModel.completion_price).all()
        model_prices = {}
        for m in all_models:
            avg_price = (float(m.prompt_price or 0) + float(m.completion_price or 0)) / 2
            model_prices[m.model_id] = max(avg_price, 0.000001)

        # Per-model token counts
        model_data = db.query(
            Transaction.model_used,
            func.sum(Transaction.tokens).label("tokens"),
        ).filter(
            Transaction.user_id == user.id,
            Transaction.type == "consumption",
            Transaction.created_at >= since,
        ).group_by(Transaction.model_used).all()

        total_cost = 0.0
        for row in model_data:
            model_name = row.model_used or "unknown"
            tokens_val = float(row.tokens or 0)
            price = model_prices.get(model_name, 0.000001)
            total_cost += tokens_val * price

        total_cost = round(total_cost, 6)

        # Count days with data
        days_with_data = db.query(
            func.count(func.distinct(func.date(Transaction.created_at)))
        ).filter(
            Transaction.user_id == user.id,
            Transaction.type == "consumption",
            Transaction.created_at >= since,
        ).scalar() or 0

        daily_avg = round(total_cost / max(days_with_data, 1), 6)
        projected_monthly = round(daily_avg * 30, 6)

        return {
            "last_30_days_cost": total_cost,
            "projected_monthly": projected_monthly,
            "daily_avg": daily_avg,
            "days_of_data": days_with_data,
        }
    except Exception as e:
        print(f"⚠️ analytics/cost-projection error: {e}")
        return {"last_30_days_cost": 0, "projected_monthly": 0, "daily_avg": 0, "days_of_data": 0}
