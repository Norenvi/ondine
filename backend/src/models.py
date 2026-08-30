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
    # carry no conclusion text.
    conclusion: Mapped[str | None] = mapped_column(Text)
    # Human-readable form of `valeur`, for a future parametre where the number itself would
    # not be the natural reading (a categorical Hub'Eau flag rather than a measurement).
    # NULL for every parametre currently seeded, where `valeur` already reads directly in
    # its unit.
    valeur_libelle: Mapped[str | None] = mapped_column(Text)

    parametre: Mapped[Parametre] = relationship(back_populates="mesures")
    commune: Mapped[Commune] = relationship(back_populates="mesures")
    reseau: Mapped[Reseau | None] = relationship(back_populates="mesures")
