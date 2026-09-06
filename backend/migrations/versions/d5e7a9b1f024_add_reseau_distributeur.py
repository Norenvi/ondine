"""add reseau distributeur and maitre_ouvrage columns

Revision ID: d5e7a9b1f024
Revises: c4f6a8b0d135
Create Date: 2026-09-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5e7a9b1f024'
down_revision: Union[str, Sequence[str], None] = 'c4f6a8b0d135'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('reseau', sa.Column('distributeur', sa.String(), nullable=True))
    op.add_column('reseau', sa.Column('maitre_ouvrage', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('reseau', 'maitre_ouvrage')
    op.drop_column('reseau', 'distributeur')
