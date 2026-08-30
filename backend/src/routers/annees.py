"""Available data years: the tick positions of the frontend timeline slider.

One year == one Hub'Eau archive (dis-{annee}.zip). The list is derived from the mesure
table itself rather than a config, so it always reflects what was actually seeded.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from db import get_session
from models import Mesure

router = APIRouter(prefix="/annees", tags=["annees"])


@router.get("", response_model=list[int])
def list_annees(session: Annotated[Session, Depends(get_session)]) -> list[int]:
    rows = session.execute(select(Mesure.annee).distinct().order_by(Mesure.annee)).scalars()
    return list(rows)
