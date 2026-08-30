"""Available data years: the tick positions of the frontend timeline slider.

One year == one Hub'Eau archive (dis-{annee}.zip). The list is derived from the data itself
rather than a config, so it always reflects what was actually seeded. Read from the small
commune_valeur cache, not the ~100M-row mesure table, and memoised for the process lifetime:
the set of seeded years only changes on a reseed, which restarts the backend anyway.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from db import get_session
from models import CommuneValeur

router = APIRouter(prefix="/annees", tags=["annees"])

_annees_cache: list[int] | None = None


@router.get("", response_model=list[int])
def list_annees(session: Annotated[Session, Depends(get_session)]) -> list[int]:
    global _annees_cache
    if _annees_cache is None:
        rows = session.execute(
            select(CommuneValeur.annee).distinct().order_by(CommuneValeur.annee)
        ).scalars()
        _annees_cache = list(rows)
    return _annees_cache
