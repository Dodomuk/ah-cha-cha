"""Add backtest_strategy and strategy_like tables

Revision ID: ac35cf092141
Revises: 7a7adbcb34d1
Create Date: 2026-06-05 20:35:12.961980

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'ac35cf092141'
down_revision: Union[str, None] = '7a7adbcb34d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tables are already created by SQLAlchemy ORM, skip creation
    # This migration is a no-op since the tables exist
    pass


def downgrade() -> None:
    # Tables created by ORM, skip dropping
    pass
