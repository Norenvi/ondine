"""Single-commune detail: its administrative record, and the raw measurement history used
for the search-result detail panel/table (see frontend CommunePanel).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db import get_session
from deps import get_parametre
from models import Commune, CommuneValeur, Mesure, Parametre, Reseau
from schemas import BulletinParametreOut, CommuneOut, MesureOut

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


@router.get("/{code_insee}/bulletin", response_model=list[BulletinParametreOut])
def get_commune_bulletin(
    code_insee: str,
    session: Annotated[Session, Depends(get_session)],
    annee: Annotated[int, Query(description="Annee (archive Hub'Eau) a resumer")],
) -> list[BulletinParametreOut]:
    """Every parameter measured in this commune during `annee`, one summary row each. Scoped
    to one commune, so it reads `mesure` directly (a few hundred rows) instead of the
    choropleth's commune_valeur cache: that lets it return real min / max / latest values
    alongside the mean, which the cache (sum + count only) cannot.
    """
    if session.get(Commune, code_insee) is None:
        raise HTTPException(status_code=404, detail=f"Commune inconnue: {code_insee}")

    stats = session.execute(
        select(
            Parametre.code.label("parametre"),
            func.count().label("nb_mesures"),
            func.min(Mesure.valeur).label("minimum"),
            func.max(Mesure.valeur).label("maximum"),
            func.avg(Mesure.valeur).label("moyenne"),
            func.max(Mesure.date_prel).label("derniere_date"),
        )
        .join(Parametre, Parametre.id == Mesure.parametre_id)
        .where(Mesure.code_insee == code_insee, Mesure.annee == annee)
        .group_by(Parametre.code)
    ).all()

    # The value of the most recent sample per parameter (not derivable from min/max/median).
    last_value = dict(
        session.execute(
            select(Parametre.code, Mesure.valeur)
            .join(Parametre, Parametre.id == Mesure.parametre_id)
            .where(Mesure.code_insee == code_insee, Mesure.annee == annee)
            .distinct(Parametre.code)
            .order_by(Parametre.code, Mesure.date_prel.desc())
        ).all()
    )

    # Threshold breach counts already computed by the pipeline; NULL for non-threshold params.
    non_conformes = dict(
        session.execute(
            select(Parametre.code, CommuneValeur.nb_non_conformes)
            .join(Parametre, Parametre.id == CommuneValeur.parametre_id)
            .where(
                CommuneValeur.code_insee == code_insee,
                CommuneValeur.annee == annee,
            )
        ).all()
    )

    return [
        BulletinParametreOut(
            parametre=row.parametre,
            nb_mesures=row.nb_mesures,
            minimum=row.minimum,
            maximum=row.maximum,
            moyenne=row.moyenne,
            derniere_valeur=last_value[row.parametre],
            derniere_date=row.derniere_date,
            nb_non_conformes=non_conformes.get(row.parametre),
        )
        for row in stats
    ]
