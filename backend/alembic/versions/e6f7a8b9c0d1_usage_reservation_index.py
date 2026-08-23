"""index usage reservation recovery

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-08-22
"""

from alembic import op


revision = "e6f7a8b9c0d1"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_transactions_status_created "
        "ON transactions (status, created_at)"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_transactions_status_created")
