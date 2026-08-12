"""hash API keys — add key_hash, key_prefix, key_suffix; make key nullable

Revision ID: a1b2c3d4e5f6
Revises: 5f2a9c41e7b0
Create Date: 2026-08-12 13:00:00.000000

Security: stop storing API keys in plaintext. New keys store only a SHA-256
hash (key_hash) plus masked prefix/suffix for display. Existing plaintext keys
are backfilled — their hashes are computed so the hash-based lookup works.
The legacy `key` column is kept (nullable) for migration safety and will be
dropped in a future migration after verifying no fallback is needed.
"""
from alembic import op
import sqlalchemy as sa
import hashlib

revision = 'a1b2c3d4e5f6'
down_revision = '5f2a9c41e7b0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add new columns (nullable — backfilled below)
    op.add_column('api_keys', sa.Column('key_hash', sa.String(), nullable=True))
    op.add_column('api_keys', sa.Column('key_prefix', sa.String(), nullable=True))
    op.add_column('api_keys', sa.Column('key_suffix', sa.String(), nullable=True))
    op.create_index('ix_api_keys_key_hash', 'api_keys', ['key_hash'], unique=True)

    # 2. Make legacy `key` column nullable (was NOT NULL)
    op.alter_column('api_keys', 'key',
                     existing_type=sa.String(),
                     nullable=True)

    # 3. Backfill: compute hash + prefix + suffix from existing plaintext keys
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, key FROM api_keys WHERE key IS NOT NULL AND key_hash IS NULL"
    )).fetchall()
    for row in rows:
        raw_key = row[1]
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        key_prefix = raw_key[:12]
        key_suffix = raw_key[-4:]
        conn.execute(sa.text(
            "UPDATE api_keys SET key_hash = :kh, key_prefix = :kp, key_suffix = :ks WHERE id = :id"
        ), {"kh": key_hash, "kp": key_prefix, "ks": key_suffix, "id": row[0]})


def downgrade() -> None:
    # Restore: make key NOT NULL again (will fail if any key is NULL — that's OK,
    # it means new keys were created post-migration and can't be downgraded)
    op.alter_column('api_keys', 'key',
                     existing_type=sa.String(),
                     nullable=False)
    op.drop_index('ix_api_keys_key_hash', table_name='api_keys')
    op.drop_column('api_keys', 'key_suffix')
    op.drop_column('api_keys', 'key_prefix')
    op.drop_column('api_keys', 'key_hash')
