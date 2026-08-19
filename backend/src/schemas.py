"""Pydantic response models. Kept separate from the ORM models: what the API returns is a
choice about the contract with the frontend, not a mirror of the storage schema.
"""

import datetime

from pydantic import BaseModel


class ParametreOut(BaseModel):
    code: str
    nom: str
    unite: str

    model_config = {"from_attributes": True}


class AggregationOut(BaseModel):
    """One row of a choropleth at a given zoom level."""

    code: str
    nom: str
    valeur_moyenne: float
    nb_mesures: int
    derniere_mesure: datetime.date


class MesureOut(BaseModel):
    """One row of the per-commune measurement detail table."""

    date_prel: datetime.date
    valeur: float
    cdreseau: str | None
    nom_reseau: str | None
    conclusion: str | None
    valeur_libelle: str | None


class CommuneOut(BaseModel):
    code_insee: str
    nom: str
    code_departement: str
    code_epci: str | None

    model_config = {"from_attributes": True}
