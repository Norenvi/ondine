"""add commune_valeur pre-aggregation table

Revision ID: b2d4f6a8c012
Revises: a1c2e3f40506
Create Date: 2026-08-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2d4f6a8c012'
down_revision: Union[str, Sequence[str], None] = 'a1c2e3f40506'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Derived choropleth cache: one row per (parametre, annee, commune). Populated by the
    # pipeline seed (a full recompute from `mesure`), read by /aggregation at every zoom
    # level. Empty until the next reseed; the aggregation endpoint simply returns nothing
    # for a parametre/annee with no rows, same as before.
    op.create_table(
        "commune_valeur",
        sa.Column("parametre_id", sa.Integer(), nullable=False),
        sa.Column("annee", sa.Integer(), nullable=False),
        sa.Column("code_insee", sa.String(), nullable=False),
        sa.Column("valeur_somme", sa.Float(), nullable=False),
        sa.Column("nb_mesures", sa.Integer(), nullable=False),
        sa.Column("derniere_mesure", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["parametre_id"], ["parametre.id"]),
        sa.ForeignKeyConstraint(["code_insee"], ["commune.code_insee"]),
        sa.PrimaryKeyConstraint("parametre_id", "annee", "code_insee"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("commune_valeur")
