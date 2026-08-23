"""purge legacy plaintext API keys

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-22 00:00:00.000000

Hashes and masks any remaining legacy keys, then irreversibly clears the
plaintext column.  The nullable column remains temporarily for rolling deploy
compatibility with older application instances.
"""

import hashlib

from alembic import op
import sqlalchemy as sa


revision = "d5e6f7a8b9c0"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, key, key_hash, key_prefix, key_suffix "
        "FROM api_keys WHERE key IS NOT NULL"
    )).fetchall()
    for row in rows:
        raw = row[1] or ""
        conn.execute(sa.text(
            "UPDATE api_keys SET key_hash = :kh, key_prefix = :kp, "
            "key_suffix = :ks, key = NULL WHERE id = :id"
        ), {
            "kh": row[2] or hashlib.sha256(raw.encode()).hexdigest(),
            "kp": row[3] or raw[:12],
            "ks": row[4] or raw[-4:],
            "id": row[0],
        })


def downgrade() -> None:
    # Plaintext credentials cannot and must not be reconstructed.
    pass
