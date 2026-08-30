"""Choropleth data at any zoom level: commune, EPCI, departement, region.

One code path for all four levels: aggregating is always "take the per-commune values from
the commune_valeur cache, join them up the commune -> EPCI/departement -> region hierarchy,
group by the target level's code". Adding a zoom level later means adding an entry to LEVELS,
not a new endpoint. The cache is built by the pipeline seed (see pipeline/src/seed_db.py):
a live GROUP BY over the ~100M-row mesure table is too slow to serve interactively.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db import get_session
from deps import get_parametre
from models import Commune, CommuneValeur, Departement, Epci, Parametre, Region
from schemas import AggregationOut

router = APIRouter(prefix="/aggregation", tags=["aggregation"])

NiveauZoom = Literal["commune", "epci", "departement", "region"]
# EPCI/departement/region only: a commune has no further level below it to break down.
NiveauParent = Literal["epci", "departement", "region"]

# For each level: which column carries its code/name, and how to join mesure up to it from
# commune. "commune" needs no extra join, the others walk the FK chain one hop at a time.
_LEVELS: dict[NiveauZoom, dict] = {
    "commune": {"code": Commune.code_insee, "nom": Commune.nom, "joins": []},
    "epci": {
        "code": Epci.code,
        "nom": Epci.nom,
        "joins": [(Epci, Epci.code == Commune.code_epci)],
    },
    "departement": {
        "code": Departement.code,
        "nom": Departement.nom,
        "joins": [(Departement, Departement.code == Commune.code_departement)],
    },
    "region": {
        "code": Region.code,
        "nom": Region.nom,
        "joins": [
            (Departement, Departement.code == Commune.code_departement),
            (Region, Region.code == Departement.code_region),
        ],
    },
}


@router.get("/{niveau}", response_model=list[AggregationOut])
def get_aggregation(
    niveau: NiveauZoom,
    session: Annotated[Session, Depends(get_session)],
    parametre: Annotated[Parametre, Depends(get_parametre)],
    annee: Annotated[int | None, Query(description="Annee (archive Hub'Eau) a afficher")] = None,
) -> list[AggregationOut]:
    level = _LEVELS[niveau]

    # Read the pre-aggregated commune_valeur cache, not the ~100M-row mesure table. Rolling
    # up as SUM(valeur_somme) / SUM(nb_mesures) is the pooled mean over individual
    # measurements, identical to a direct AVG(mesure.valeur) at any level, not a mean of
    # commune means. Commune level groups one row per key, so it just echoes the stored pair.
    query = (
        select(
            level["code"].label("code"),
            level["nom"].label("nom"),
            (func.sum(CommuneValeur.valeur_somme) / func.sum(CommuneValeur.nb_mesures)).label(
                "valeur_moyenne"
            ),
            func.sum(CommuneValeur.nb_mesures).label("nb_mesures"),
            func.max(CommuneValeur.derniere_mesure).label("derniere_mesure"),
        )
        .join(Commune, Commune.code_insee == CommuneValeur.code_insee)
        .where(CommuneValeur.parametre_id == parametre.id)
    )
    if annee is not None:
        query = query.where(CommuneValeur.annee == annee)
    for join_target, on_clause in level["joins"]:
        query = query.join(join_target, on_clause)

    query = query.group_by(level["code"], level["nom"])

    rows = session.execute(query).all()
    return [AggregationOut.model_validate(row, from_attributes=True) for row in rows]


@router.get("/{niveau}/{code}/communes", response_model=list[AggregationOut])
def get_zone_communes(
    niveau: NiveauParent,
    code: str,
    session: Annotated[Session, Depends(get_session)],
    parametre: Annotated[Parametre, Depends(get_parametre)],
    annee: Annotated[int | None, Query(description="Annee (archive Hub'Eau) a afficher")] = None,
) -> list[AggregationOut]:
    """Per-commune breakdown of one EPCI/departement/region, same row shape as the top-level
    aggregation but grouped by commune and scoped to the zone: the detail view for zoom levels
    above commune. A raw per-sample table (the commune-level CommunePanel's own approach) does
    not scale here, a region can hold 60k+ individual mesures for a single parameter, so this
    stays at the same "one row per commune" grain the choropleth itself uses.
    """
    level = _LEVELS[niveau]

    # Same commune_valeur cache and same SUM(somme)/SUM(nb) rollup as the top-level
    # aggregation, just grouped by commune and scoped to the one zone.
    query = (
        select(
            Commune.code_insee.label("code"),
            Commune.nom.label("nom"),
            (func.sum(CommuneValeur.valeur_somme) / func.sum(CommuneValeur.nb_mesures)).label(
                "valeur_moyenne"
            ),
            func.sum(CommuneValeur.nb_mesures).label("nb_mesures"),
            func.max(CommuneValeur.derniere_mesure).label("derniere_mesure"),
        )
        .join(Commune, Commune.code_insee == CommuneValeur.code_insee)
        .where(CommuneValeur.parametre_id == parametre.id)
    )
    if annee is not None:
        query = query.where(CommuneValeur.annee == annee)
    for join_target, on_clause in level["joins"]:
        query = query.join(join_target, on_clause)
    query = query.where(level["code"] == code)

    query = query.group_by(Commune.code_insee, Commune.nom)

    rows = session.execute(query).all()
    return [AggregationOut.model_validate(row, from_attributes=True) for row in rows]
