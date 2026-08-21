"""add request telemetry and API-key monthly budgets

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-08-21 11:00:00.000000

Persists provider-reported token details and measured latency so analytics no
longer have to fabricate response times or blend all tokens together. Adds an
optional calendar-month token cap to API keys.
"""
from alembic import op
import sqlalchemy as sa


revision = 'c4d5e6f7a8b9'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('api_keys', sa.Column('monthly_token_limit', sa.Float(), nullable=True))
    op.add_column('transactions', sa.Column('status_code', sa.Integer(), nullable=True))
    op.add_column('transactions', sa.Column('requested_model', sa.String(), nullable=True, server_default=''))
    op.add_column('transactions', sa.Column('provider', sa.String(), nullable=True, server_default=''))
    op.add_column('transactions', sa.Column('request_id', sa.String(), nullable=True))
    op.add_column('transactions', sa.Column('prompt_tokens', sa.Float(), nullable=True, server_default='0'))
    op.add_column('transactions', sa.Column('completion_tokens', sa.Float(), nullable=True, server_default='0'))
    op.add_column('transactions', sa.Column('reasoning_tokens', sa.Float(), nullable=True, server_default='0'))
    op.add_column('transactions', sa.Column('cached_tokens', sa.Float(), nullable=True, server_default='0'))
    op.add_column('transactions', sa.Column('latency_ms', sa.Float(), nullable=True))
    op.add_column('transactions', sa.Column('upstream_cost', sa.Float(), nullable=True))
    op.create_index('ix_transactions_request_id', 'transactions', ['request_id'])


def downgrade() -> None:
    op.drop_index('ix_transactions_request_id', table_name='transactions')
    op.drop_column('transactions', 'upstream_cost')
    op.drop_column('transactions', 'latency_ms')
    op.drop_column('transactions', 'cached_tokens')
    op.drop_column('transactions', 'reasoning_tokens')
    op.drop_column('transactions', 'completion_tokens')
    op.drop_column('transactions', 'prompt_tokens')
    op.drop_column('transactions', 'request_id')
    op.drop_column('transactions', 'provider')
    op.drop_column('transactions', 'requested_model')
    op.drop_column('transactions', 'status_code')
    op.drop_column('api_keys', 'monthly_token_limit')
