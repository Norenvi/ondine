"""add commune_valeur.nb_non_conformes

Revision ID: c4f6a8b0d135
Revises: b2d4f6a8c012
Create Date: 2026-09-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4f6a8b0d135'
down_revision: Union[str, Sequence[str], None] = 'b2d4f6a8c012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Count of the commune's samples that failed the parameter's binding threshold this year
    # (E. coli: any detection, valeur > 0). Nullable: only parameters that declare a
    # seuil_conformite in the pipeline registry get a value, every other parameter stays NULL
    # and /aggregation keeps serving valeur_moyenne for it. Populated by the pipeline seed
    # (full recompute from `mesure`, same as the rest of commune_valeur); NULL until the next
    # seed or `seed_db.py --recompute-cache`.
    op.add_column(
        "commune_valeur",
        sa.Column("nb_non_conformes", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("commune_valeur", "nb_non_conformes")
