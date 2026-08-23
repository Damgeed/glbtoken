"""Idempotent startup cleanup for sensitive and short-lived database data."""

import hashlib
import json
from datetime import datetime, timezone

from database import ApiKey, OrgInvite, RefreshToken, SessionLocal, User
from secret_store import SecretStoreUnavailable, encrypt_secret, is_encrypted


_SECRET_SETTING_FIELDS = (
    "webhook_secret",
    "totp_secret",
    "totp_pending_secret",
)


def _is_expired(value, now: datetime) -> bool:
    if not value:
        return False
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value < now


def clean_security_data(delete_expired: bool = False) -> dict[str, int]:
    """Clean sensitive legacy values and expired ephemeral rows.

    This intentionally preserves users, financial transactions, conversations,
    model catalog data, login history, and active sessions.  It is safe to run
    on every process start.
    """
    now = datetime.now(timezone.utc)
    counts = {
        "api_keys_purged": 0,
        "user_secrets_encrypted": 0,
        "expired_auth_fields_cleared": 0,
        "refresh_tokens_deleted": 0,
        "org_invites_deleted": 0,
        "refresh_tokens_pending_delete": 0,
        "org_invites_pending_delete": 0,
    }
    db = SessionLocal()
    try:
        # Hash every legacy API key before irreversibly clearing its plaintext.
        for key in db.query(ApiKey).filter(ApiKey.key.isnot(None)).all():
            raw = key.key or ""
            if not key.key_hash:
                key.key_hash = hashlib.sha256(raw.encode()).hexdigest()
            if not key.key_prefix:
                key.key_prefix = raw[:12]
            if not key.key_suffix:
                key.key_suffix = raw[-4:]
            key.key = None
            counts["api_keys_purged"] += 1

        for user in db.query(User).all():
            if user.newapi_token and not is_encrypted(user.newapi_token):
                try:
                    user.newapi_token = encrypt_secret(user.newapi_token)
                    counts["user_secrets_encrypted"] += 1
                except SecretStoreUnavailable:
                    # Never destroy the only copy if encryption is not configured.
                    pass

            try:
                settings = json.loads(user.settings) if user.settings else {}
            except (json.JSONDecodeError, TypeError):
                settings = {}
            changed = False
            for field in _SECRET_SETTING_FIELDS:
                value = settings.get(field)
                if value and not is_encrypted(value):
                    try:
                        settings[field] = encrypt_secret(value)
                        counts["user_secrets_encrypted"] += 1
                        changed = True
                    except SecretStoreUnavailable:
                        pass
            if changed:
                user.settings = json.dumps(settings)

            if _is_expired(user.email_otp_expiry, now):
                user.email_otp = None
                user.email_otp_expiry = None
                counts["expired_auth_fields_cleared"] += 1
            if _is_expired(user.reset_token_expiry, now):
                user.reset_token = None
                user.reset_token_expiry = None
                counts["expired_auth_fields_cleared"] += 1

        refresh_query = db.query(RefreshToken).filter(
            (RefreshToken.expires_at < now) | (RefreshToken.revoked.is_(True))
        )
        invite_query = db.query(OrgInvite).filter(
            (OrgInvite.expires_at < now) | (OrgInvite.used.is_(True))
        )
        if delete_expired:
            counts["refresh_tokens_deleted"] = refresh_query.delete(synchronize_session=False)
            counts["org_invites_deleted"] = invite_query.delete(synchronize_session=False)
        else:
            counts["refresh_tokens_pending_delete"] = refresh_query.count()
            counts["org_invites_pending_delete"] = invite_query.count()

        db.commit()
        return counts
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
