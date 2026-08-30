"""add mesure annee column

Revision ID: a1c2e3f40506
Revises: 79065f11cc10
Create Date: 2026-08-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c2e3f40506'
down_revision: Union[str, Sequence[str], None] = '79065f11cc10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Any rows already in the table predate multi-year seeding: they are the 2026 archive.
    # Backfill them with a temporary server_default, then drop it so the pipeline (which
    # always sets the column explicitly) is the only writer.
    op.add_column(
        "mesure",
        sa.Column("annee", sa.Integer(), nullable=False, server_default="2026"),
    )
    op.alter_column("mesure", "annee", server_default=None)
    op.create_index(op.f("ix_mesure_annee"), "mesure", ["annee"], unique=False)
    op.create_index(
        "ix_mesure_parametre_annee", "mesure", ["parametre_id", "annee"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_mesure_parametre_annee", table_name="mesure")
    op.drop_index(op.f("ix_mesure_annee"), table_name="mesure")
    op.drop_column("mesure", "annee")
