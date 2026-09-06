"""Relational model: administrative hierarchy, parameter catalogue, and raw measurements.

Geometry stays out of this schema entirely: contours are served as static GeoJSON/MVT
(see pipeline/), this database only holds the values and the commune -> EPCI -> departement
-> region hierarchy needed to aggregate them at any zoom level.

Adding a new monitored parameter (nitrates, bacteriology...) never requires a migration:
it is a new row in `parametre` plus new rows in `mesure`.
"""

from __future__ import annotations

import datetime

from sqlalchemy import ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Region(Base):
    __tablename__ = "region"

    code: Mapped[str] = mapped_column(primary_key=True)
    nom: Mapped[str]

    departements: Mapped[list[Departement]] = relationship(back_populates="region")


class Departement(Base):
    __tablename__ = "departement"

    code: Mapped[str] = mapped_column(primary_key=True)
    nom: Mapped[str]
    code_region: Mapped[str] = mapped_column(ForeignKey("region.code"), index=True)

    region: Mapped[Region] = relationship(back_populates="departements")
    communes: Mapped[list[Commune]] = relationship(back_populates="departement")


class Epci(Base):
    """SIREN-coded intercommunality. Not nested under a single departement: an EPCI can
    straddle several of them.
    """

    __tablename__ = "epci"

    code: Mapped[str] = mapped_column(primary_key=True)
    nom: Mapped[str]

    communes: Mapped[list[Commune]] = relationship(back_populates="epci")


class Commune(Base):
    __tablename__ = "commune"

    code_insee: Mapped[str] = mapped_column(primary_key=True)
    nom: Mapped[str]
    code_departement: Mapped[str] = mapped_column(ForeignKey("departement.code"), index=True)
    # Nullable: a handful of communes (Paris/Lyon/Marseille arrondissements aside) sit
    # outside any EPCI, and pipeline join gaps should not block a commune's own insert.
    code_epci: Mapped[str | None] = mapped_column(ForeignKey("epci.code"), index=True)

    departement: Mapped[Departement] = relationship(back_populates="communes")
    epci: Mapped[Epci | None] = relationship(back_populates="communes")
    mesures: Mapped[list[Mesure]] = relationship(back_populates="commune")


class Parametre(Base):
    """Catalogue of monitored parameters. cdparametre_sandre is the SANDRE code Hub'Eau
    uses (1345 = durete/TH, 1340 = nitrates...); code/nom/unite are the display-friendly form.
    """

    __tablename__ = "parametre"

    id: Mapped[int] = mapped_column(primary_key=True)
    cdparametre_sandre: Mapped[str] = mapped_column(unique=True)
    code: Mapped[str] = mapped_column(unique=True)
    nom: Mapped[str]
    unite: Mapped[str]

    mesures: Mapped[list[Mesure]] = relationship(back_populates="parametre")


class Reseau(Base):
    """Distribution network (UDI), Hub'Eau's actual measurement granularity: a commune
    can be served by several, and a network can serve several communes.
    """

    __tablename__ = "reseau"

    cdreseau: Mapped[str] = mapped_column(primary_key=True)
    nom: Mapped[str]
    # Water distributor (DIS_PLV.distrlib) and infrastructure owner (moalib), the entities a
    # resident would contact. Held here rather than on `mesure` (a ~60-char string over 114M
    # rows) since both are near-constant per network; the pipeline stores the most recent
    # year's value seen for the cdreseau. Nullable: PLV-fallback measurements carry no
    # network, and a few networks never appear in PLV.
    distributeur: Mapped[str | None]
    maitre_ouvrage: Mapped[str | None]

    mesures: Mapped[list[Mesure]] = relationship(back_populates="reseau")


class Mesure(Base):
    """One measurement: a single (parametre, prelevement) pair. Grain matches DIS_RESULT,
    not pre-aggregated, so the pipeline seeds this table with the raw Hub'Eau records.
    """

    __tablename__ = "mesure"
    __table_args__ = (
        # A prelevement/network/parameter combination should not be seeded twice, whichever
        # source (COM_UDI vs PLV.inseecommuneprinc) it was recovered through.
        UniqueConstraint("referenceprel", "parametre_id", "code_insee"),
        # Choropleth hot path: filter one parameter + one year, then join up to the target level.
        Index("ix_mesure_parametre_annee", "parametre_id", "annee"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    referenceprel: Mapped[str]
    parametre_id: Mapped[int] = mapped_column(ForeignKey("parametre.id"), index=True)
    code_insee: Mapped[str] = mapped_column(ForeignKey("commune.code_insee"), index=True)
    # Source archive year (dis-{annee}.zip). One archive is one calendar year of sampling
    # (the current year's archive is partial until the year ends). Drives the timeline
    # slider: the choropleth shows exactly one year, never a cross-year pooled average.
    annee: Mapped[int] = mapped_column(index=True)
    cdreseau: Mapped[str | None] = mapped_column(ForeignKey("reseau.cdreseau"))
    date_prel: Mapped[datetime.date]
    valeur: Mapped[float]
    # Hub'Eau's own human-readable verdict for the sampling event (conclusionprel), shared by
    # every parametre measured on that same referenceprel. Nullable: a handful of PLV rows
    # carry no conclusion text. No longer shown in the UI (it judges the whole sample, not
    # this parameter row); kept for a future per-sample detail view.
    conclusion: Mapped[str | None] = mapped_column(Text)
    # Raw analytical result string (DIS_RESULT.rqana) when it carries a qualifier the number
    # loses: "<0,5" / ">100" (below/above the quantification limit, which `valeur` flattens
    # to a plain figure) or free text ("N.M." not measured, "traces"). NULL when rqana is a
    # plain number, i.e. for the bulk-mineral parameters; mostly set for trace contaminants
    # (pesticides, metals, PFAS) where most samples read "<LQ". The frontend shows it in
    # place of the formatted number.
    valeur_libelle: Mapped[str | None] = mapped_column(Text)

    parametre: Mapped[Parametre] = relationship(back_populates="mesures")
    commune: Mapped[Commune] = relationship(back_populates="mesures")
    reseau: Mapped[Reseau | None] = relationship(back_populates="mesures")


class CommuneValeur(Base):
    """Pre-aggregated choropleth values: one row per (parametre, annee, commune), holding the
    sum and count of that commune's individual `mesure` rows plus the latest sampling date.

    Derived data, not a source: recomputed from scratch on every reseed, exactly like the
    rest of the pipeline. It exists only because a live GROUP BY over ~100M `mesure` rows is
    too slow to serve interactively on a small box; `mesure` stays the source of truth and
    the per-commune detail-panel source.

    The choropleth reads this at every zoom level. Commune level is a straight PK range scan
    on (parametre_id, annee). EPCI/departement/region roll up as
    SUM(valeur_somme) / SUM(nb_mesures) grouped by the target level, which is the pooled mean
    over individual measurements (identical to a direct AVG(mesure.valeur)), not a mean of
    commune means. `valeur` is non-nullable on `mesure`, so nb_mesures counts every row that
    fed the sum.

    For a parameter with a binding threshold (E. coli: any detection is out of norm), the
    pooled mean is meaningless: one high count skews a commune's figure while the regulatory
    question is binary per sample. `nb_non_conformes` carries the count of samples that failed
    the threshold, so /aggregation can roll up SUM(nb_non_conformes) / SUM(nb_mesures) as a
    non-compliance rate instead. NULL for every parameter with no threshold (the pipeline only
    fills it for those declaring a seuil_conformite).
    """

    __tablename__ = "commune_valeur"

    parametre_id: Mapped[int] = mapped_column(ForeignKey("parametre.id"), primary_key=True)
    annee: Mapped[int] = mapped_column(primary_key=True)
    code_insee: Mapped[str] = mapped_column(ForeignKey("commune.code_insee"), primary_key=True)
    valeur_somme: Mapped[float]
    nb_mesures: Mapped[int]
    derniere_mesure: Mapped[datetime.date]
    nb_non_conformes: Mapped[int | None]
