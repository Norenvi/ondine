"""Single-commune detail: its administrative record, and the raw measurement history used
for the search-result detail panel/table (see frontend CommunePanel).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from db import get_session
from deps import get_parametre
from models import Commune, Mesure, Parametre, Reseau
from schemas import CommuneOut, MesureOut

router = APIRouter(prefix="/communes", tags=["communes"])


@router.get("/{code_insee}", response_model=CommuneOut)
def get_commune(code_insee: str, session: Annotated[Session, Depends(get_session)]) -> Commune:
    commune = session.get(Commune, code_insee)
    if commune is None:
        raise HTTPException(status_code=404, detail=f"Commune inconnue: {code_insee}")
    return commune


@router.get("/{code_insee}/mesures", response_model=list[MesureOut])
def get_commune_mesures(
    code_insee: str,
    session: Annotated[Session, Depends(get_session)],
    parametre: Annotated[Parametre, Depends(get_parametre)],
    annee: Annotated[int | None, Query(description="Annee (archive Hub'Eau) a afficher")] = None,
) -> list[MesureOut]:
    if session.get(Commune, code_insee) is None:
        raise HTTPException(status_code=404, detail=f"Commune inconnue: {code_insee}")

    query = (
        select(
            Mesure.date_prel,
            Mesure.valeur,
            Mesure.cdreseau,
            Reseau.nom.label("nom_reseau"),
            Reseau.distributeur,
            Mesure.conclusion,
            Mesure.valeur_libelle,
        )
        .outerjoin(Reseau, Reseau.cdreseau == Mesure.cdreseau)
        .where(Mesure.code_insee == code_insee, Mesure.parametre_id == parametre.id)
        .order_by(Mesure.date_prel.desc())
    )
    if annee is not None:
        query = query.where(Mesure.annee == annee)
    rows = session.execute(query).all()
    return [MesureOut.model_validate(row, from_attributes=True) for row in rows]
