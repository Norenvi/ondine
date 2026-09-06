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
    # Share of samples that failed the parameter's binding threshold, in percent (E. coli:
    # any detection). None for parameters with no threshold: the frontend shows valeur_moyenne
    # for those and taux_non_conformite for the others. nb_non_conformes is the numerator,
    # surfaced alongside so a small-sample commune (1 of 2) is not read like a large one.
    taux_non_conformite: float | None = None
    nb_non_conformes: int | None = None


class MesureOut(BaseModel):
    """One row of the per-commune measurement detail table."""

    date_prel: datetime.date
    valeur: float
    cdreseau: str | None
    nom_reseau: str | None
    distributeur: str | None
    conclusion: str | None
    valeur_libelle: str | None


class BulletinParametreOut(BaseModel):
    """One parameter's year for a single commune, summarised from the raw `mesure` rows.
    `moyenne` is the same pooled mean the choropleth colours by (identical to SUM/SUM over
    commune_valeur for this commune), kept consistent across map, bulletin and detail panel;
    min / max / derniere_valeur are actual readings that show the spread it hides. The
    frontend colours the row from `moyenne` (or, for a threshold parameter, from
    nb_non_conformes / nb_mesures).
    """

    parametre: str
    nb_mesures: int
    minimum: float
    maximum: float
    moyenne: float
    derniere_valeur: float
    derniere_date: datetime.date
    # From commune_valeur: count of samples over the parameter's binding threshold, already
    # computed by the pipeline. None for every parameter with no threshold.
    nb_non_conformes: int | None = None


class CommuneOut(BaseModel):
    code_insee: str
    nom: str
    code_departement: str
    code_epci: str | None

    model_config = {"from_attributes": True}
