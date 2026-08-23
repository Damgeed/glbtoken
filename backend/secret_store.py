"""Encryption helpers for application secrets stored in the database.

The encryption key is derived from ``GLBTOKEN_SECRET``.  Ciphertext is tagged
so existing plaintext values can be migrated without changing database
columns.  Callers may read legacy plaintext during the migration window, but
all writes are encrypted and fail closed when the server secret is missing.
"""

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken


PREFIX = "enc:v1:"


class SecretStoreUnavailable(RuntimeError):
    """Raised when persistent encryption is not configured."""


def _fernet() -> Fernet:
    material = os.getenv("GLBTOKEN_SECRET", "")
    if not material:
        raise SecretStoreUnavailable(
            "GLBTOKEN_SECRET is required to encrypt database secrets"
        )
    key = base64.urlsafe_b64encode(hashlib.sha256(material.encode()).digest())
    return Fernet(key)


def is_encrypted(value: str) -> bool:
    return bool(value and value.startswith(PREFIX))


def encrypt_secret(raw: str) -> str:
    """Return tagged Fernet ciphertext; never fall back to plaintext."""
    if not raw:
        return ""
    if is_encrypted(raw):
        return raw
    return PREFIX + _fernet().encrypt(raw.encode()).decode()


def decrypt_secret(stored: str) -> str:
    """Decrypt tagged ciphertext; pass legacy plaintext through for migration."""
    if not stored:
        return ""
    if not is_encrypted(stored):
        return stored
    try:
        return _fernet().decrypt(stored[len(PREFIX):].encode()).decode()
    except (InvalidToken, ValueError, TypeError) as exc:
        raise SecretStoreUnavailable("Stored secret could not be decrypted") from exc
