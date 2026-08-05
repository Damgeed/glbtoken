"""add announcements table

Revision ID: 5f2a9c41e7b0
Revises: 0993578ae4bd
Create Date: 2026-08-05 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '5f2a9c41e7b0'
down_revision = '0993578ae4bd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'announcements',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(), nullable=False, server_default=''),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default=sa.text('1')),
        sa.Column('priority', sa.String(), nullable=True, server_default='info'),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_announcements_id', 'announcements', ['id'])


def downgrade() -> None:
    op.drop_index('ix_announcements_id', table_name='announcements')
    op.drop_table('announcements')
