"""add unique index on transactions.payment_ref

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-08-12 14:00:00.000000

Defense-in-depth: prevent double-credit at the DB layer. All current code
paths use conditional UPDATE (WHERE status='pending') which is correct, but
a partial unique index ensures that even a future code path that inserts
without the guard cannot create duplicate payment_ref values.
"""
from alembic import op

revision = 'b3c4d5e6f7a8'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Partial unique index — only enforces uniqueness when payment_ref IS NOT NULL.
    # Allows multiple NULL payment_ref rows (non-payment transactions).
    op.create_index(
        'uq_transactions_payment_ref',
        'transactions',
        ['payment_ref'],
        unique=True,
        postgresql_where='payment_ref IS NOT NULL',
    )


def downgrade() -> None:
    op.drop_index('uq_transactions_payment_ref', table_name='transactions')
