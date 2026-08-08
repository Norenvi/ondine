"""Parameter catalogue: what the frontend can even ask to aggregate/display."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from db import get_session
from models import Parametre
from schemas import ParametreOut

router = APIRouter(prefix="/parametres", tags=["parametres"])


@router.get("", response_model=list[ParametreOut])
def list_parametres(session: Annotated[Session, Depends(get_session)]) -> list[Parametre]:
    return list(session.execute(select(Parametre)).scalars())
