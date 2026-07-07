#!/usr/bin/env python3
"""
GlbTOKEN — Production User Sync Script
========================================
Syncs all existing users from the local database to New API.
Idempotent: safe to run multiple times. Skips users already synced.

Usage:
    # Dry-run (no changes):
    python sync_users.py --dry-run

    # Live sync:
    python sync_users.py

    # Live sync with progress (default):
    python sync_users.py --verbose

    # Run via Railway:
    railway run python backend/sync_users.py

Environment:
    DATABASE_URL          — PostgreSQL or SQLite URL
    NEW_API_BASE_URL      — New API gateway URL
    NEW_API_ADMIN_TOKEN   — Admin token for New API
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

# ── DB Setup (mirrors database.py) ──
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./glbtoken.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)
    country = Column(String, default="")
    token_balance = Column(Float, default=0.0)
    total_spent = Column(Float, default=0.0)
    email_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_admin = Column(Boolean, default=False)
    newapi_user_id = Column(Integer, nullable=True)
    newapi_token = Column(String, nullable=True)


# ── HTTP Client ──
import httpx

NEW_API_BASE = os.getenv("NEW_API_BASE_URL", "")
ADMIN_TOKEN = os.getenv("NEW_API_ADMIN_TOKEN", "")
HEADERS = {"Authorization": f"Bearer {ADMIN_TOKEN}"} if ADMIN_TOKEN else {}
ADMIN_HEADERS = {**HEADERS, "New-Api-User": "1"} if ADMIN_TOKEN else {}


def newapi_get(path: str) -> dict:
    """Synchronous GET to New API."""
    if not NEW_API_BASE or not ADMIN_TOKEN:
        return {"error": "New API not configured"}
    url = f"{NEW_API_BASE.rstrip('/')}{path}"
    try:
        with httpx.Client(timeout=30) as client:
            r = client.get(url, headers=ADMIN_HEADERS)
            if r.status_code >= 400:
                return {"error": f"HTTP {r.status_code}", "detail": r.text[:500]}
            return r.json()
    except httpx.TimeoutException:
        return {"error": "timeout"}
    except Exception as e:
        return {"error": str(e)}

def newapi_post(path: str, data: dict = None) -> dict:
    """Synchronous POST to New API (sync script, no async needed)."""
    if not NEW_API_BASE or not ADMIN_TOKEN:
        return {"error": "New API not configured"}
    url = f"{NEW_API_BASE.rstrip('/')}{path}"
    try:
        with httpx.Client(timeout=30) as client:
            r = client.post(url, json=data, headers=HEADERS)
            if r.status_code >= 400:
                body = r.text[:500]
                return {"error": f"HTTP {r.status_code}", "detail": body}
            return r.json()
    except httpx.TimeoutException:
        return {"error": "timeout"}
    except Exception as e:
        return {"error": str(e)}


def health_check() -> bool:
    """Quick New API connectivity check."""
    if not NEW_API_BASE:
        return False
    try:
        with httpx.Client(timeout=5) as client:
            r = client.get(f"{NEW_API_BASE.rstrip('/')}/api/status", headers=HEADERS)
            return r.status_code < 500
    except Exception:
        return False


# ── Sync Logic ──

class SyncResult:
    """Tracks sync results for reporting."""
    def __init__(self):
        self.total = 0
        self.skipped = 0
        self.created = 0
        self.failed = 0
        self.errors: List[Dict[str, Any]] = []
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None

    def start(self):
        self.start_time = datetime.now(timezone.utc)

    def finish(self):
        self.end_time = datetime.now(timezone.utc)

    @property
    def elapsed(self) -> str:
        if not self.start_time or not self.end_time:
            return "N/A"
        delta = self.end_time - self.start_time
        return f"{delta.total_seconds():.1f}s"

    def print_summary(self):
        print(f"\n{'='*60}")
        print(f"  SYNC SUMMARY")
        print(f"{'='*60}")
        print(f"  Total users in DB:  {self.total}")
        print(f"  Already synced:     {self.skipped}")
        print(f"  Newly created:      {self.created}")
        print(f"  Failed:             {self.failed}")
        print(f"  Duration:           {self.elapsed}")
        if self.errors:
            print(f"\n  ERRORS ({len(self.errors)}):")
            for err in self.errors[:10]:
                print(f"    - [{err['user_id']}] {err['email']}: {err['error']}")
            if len(self.errors) > 10:
                print(f"    ... and {len(self.errors) - 10} more")
        print(f"{'='*60}\n")


def sync_user(user: User, dry_run: bool = False) -> Optional[str]:
    """
    Sync a single user to New API.
    Returns None on success, error string on failure.
    """
    if dry_run:
        print(f"  [DRY-RUN] Would sync: {user.email} (balance: {user.token_balance})")
        return None

    # Step 1: Create user in New API
    import secrets
    auto_password = "Gt" + secrets.token_hex(6)  # 14 chars — fits New API's validation
    username = (user.email.split("@")[0] + "_" + secrets.token_hex(4))[:32]

    resp = newapi_post("/api/user/register", {
        "username": username,
        "password": auto_password,
        "display_name": user.name or user.email.split("@")[0],
        "email": user.email,
    })

    if not resp or not resp.get("success"):
        return resp.get("detail", resp.get("message", "unknown error")) if resp else "no response"

    # Register returns success without user ID — query list to find it
    list_resp = newapi_get("/api/user/?page=1&page_size=100")
    newapi_user_id = None
    if list_resp and "items" in list_resp.get("data", {}):
        for u in list_resp["data"]["items"]:
            if u.get("email") == user.email or u.get("username") == username:
                newapi_user_id = u["id"]
                break

    if not newapi_user_id:
        return f"Could not find user in New API after registration"

    # Step 2: Create API token
    token_resp = newapi_post(f"/api/user/{newapi_user_id}/key", {
        "name": f"GlbTOKEN Key - {user.name}"
    })

    newapi_token = ""
    if token_resp and not token_resp.get("error"):
        newapi_token = token_resp.get("key", "")

    # Step 3: Update local DB
    user.newapi_user_id = newapi_user_id
    user.newapi_token = newapi_token

    return None  # success


def run_sync(dry_run: bool = False, batch_size: int = 50, verbose: bool = False) -> SyncResult:
    """
    Sync all unsynced users to New API.
    Process in batches for memory efficiency on large user bases.
    """
    result = SyncResult()
    result.start()

    db: Session = SessionLocal()
    try:
        # Count totals
        total_users = db.query(User).count()
        unsynced = db.query(User).filter(User.newapi_user_id.is_(None)).count()
        result.total = total_users
        result.skipped = total_users - unsynced

        if unsynced == 0:
            print("  ✅ All users already synced to New API. Nothing to do.")
            result.finish()
            return result

        print(f"  📊 Found {unsynced} unsynced user(s) out of {total_users} total")
        if dry_run:
            print(f"  🔍 DRY-RUN MODE — no changes will be made\n")

        # Process in batches
        offset = 0
        while offset < unsynced:
            batch = (
                db.query(User)
                .filter(User.newapi_user_id.is_(None))
                .order_by(User.id)
                .offset(offset)
                .limit(batch_size)
                .all()
            )
            if not batch:
                break

            for user in batch:
                err = sync_user(user, dry_run=dry_run)
                if err:
                    result.failed += 1
                    result.errors.append({
                        "user_id": user.id,
                        "email": user.email,
                        "error": err,
                    })
                    if verbose:
                        print(f"  ❌ [{user.id}] {user.email}: FAILED — {err}")
                else:
                    result.created += 1
                    if verbose:
                        token_preview = user.newapi_token[:12] + "..." if user.newapi_token else "no-token"
                        print(f"  ✅ [{user.id}] {user.email} → newapi_id={user.newapi_user_id} token={token_preview}")

            # Commit batch
            if not dry_run:
                try:
                    db.commit()
                    if verbose:
                        print(f"  💾 Batch committed ({len(batch)} users)")
                except Exception as e:
                    db.rollback()
                    print(f"  ❌ BATCH COMMIT FAILED: {e}")
                    for user in batch:
                        result.failed += 1
                        result.errors.append({
                            "user_id": user.id,
                            "email": user.email,
                            "error": f"DB commit: {e}",
                        })

            offset += len(batch)

    except Exception as e:
        print(f"  ❌ FATAL: {e}")
        raise
    finally:
        db.close()
        result.finish()

    return result


# ── CLI Entrypoint ──

def main():
    parser = argparse.ArgumentParser(
        description="GlbTOKEN — Sync existing users to New API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python sync_users.py --dry-run
  python sync_users.py --verbose
  python sync_users.py --batch 100
        """,
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would be done without making changes"
    )
    parser.add_argument(
        "--batch", type=int, default=50,
        help="Users per DB commit batch (default: 50)"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Print per-user progress"
    )
    parser.add_argument(
        "--check", action="store_true",
        help="Only check New API connectivity and unsynced count, don't sync"
    )

    args = parser.parse_args()

    print(f"{'='*60}")
    print(f"  GlbTOKEN — User Sync to New API")
    print(f"{'='*60}")
    print(f"  DB:        {DATABASE_URL[:60]}...")
    print(f"  New API:   {NEW_API_BASE or 'NOT CONFIGURED'}")
    print(f"  Admin key: {'✅ configured' if ADMIN_TOKEN else '❌ MISSING'}")
    print()

    # Health check
    if NEW_API_BASE and ADMIN_TOKEN:
        ok = health_check()
        if not ok:
            print("  ❌ New API health check FAILED. Check NEW_API_BASE_URL and connectivity.")
            sys.exit(1)
        print("  ✅ New API reachable\n")
    else:
        print("  ⚠️  New API not fully configured. Set NEW_API_BASE_URL and NEW_API_ADMIN_TOKEN.\n")
        if not args.check:
            sys.exit(1)

    # Count unsynced
    db = SessionLocal()
    try:
        total = db.query(User).count()
        unsynced = db.query(User).filter(User.newapi_user_id.is_(None)).count()
    finally:
        db.close()

    print(f"  Users: {total} total, {unsynced} unsynced\n")

    if args.check:
        print("  Check complete. Run without --check to perform sync.")
        return

    if unsynced == 0:
        print("  ✅ All users already synced. Nothing to do.")
        return

    # Confirm for non-dry-run
    if not args.dry_run:
        print(f"  ⚠️  This will create {unsynced} user(s) in New API.")
        print(f"  Pass --dry-run to preview first.\n")

    # Run sync
    result = run_sync(dry_run=args.dry_run, batch_size=args.batch, verbose=args.verbose)
    result.print_summary()

    # Exit code
    if result.failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
