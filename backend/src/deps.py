"""Shared FastAPI dependencies."""

from typing import Annotated

from fastapi import Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from db import get_session
from models import Parametre


def get_parametre(
    parametre: Annotated[str, Query(description="Code du parametre, ex: durete")],
    session: Annotated[Session, Depends(get_session)],
) -> Parametre:
    result = session.execute(select(Parametre).where(Parametre.code == parametre)).scalar_one_or_none()
    if result is None:
        raise HTTPException(status_code=404, detail=f"Parametre inconnu: {parametre}")
    return result
