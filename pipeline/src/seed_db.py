"""Seed the Postgres database from Hub'Eau + Admin Express COG, replacing the CSV/GeoJSON
static output for anything that needs to be queried/aggregated dynamically (multi-zoom,
multi-parameter). Idempotent: truncates and reloads every table on each run, matching the
rest of the pipeline (a monthly full reseed, not an incremental update).

The ORM models live in backend/src/models.py, not here: the schema is the API's concern,
this script only fills it in.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from sqlalchemy import create_engine, insert, text
from sqlalchemy.orm import Session

import transform
from join_geo import extract_commune_gpkg, find_admin_express_archive

BACKEND_SRC = Path(__file__).resolve().parents[2] / "backend" / "src"
sys.path.insert(0, str(BACKEND_SRC))

from models import Base, Commune, Departement, Epci, Mesure, Parametre, Region, Reseau

RAW_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"

DEFAULT_DATABASE_URL = "postgresql+psycopg://ondine:ondine@localhost:5432/ondine"

# Registry of monitored parameters. Adding one here is the entire cost of tracking a new
# metric end to end: "unite" doubles as the expected SANDRE unit, asserted while filtering
# (see transform.filter_parameter) so a wrong SANDRE code fails loudly instead of quietly
# producing a plausible-looking but wrong map.
PARAMETERS = [
    {"cdparametre_sandre": "1345", "code": "durete", "nom": "Titre Hydrotimetrique", "unite": "°f"},
    {"cdparametre_sandre": "1302", "code": "ph", "nom": "pH", "unite": "unité pH"},
    {"cdparametre_sandre": "1340", "code": "nitrates", "nom": "Nitrates (en NO3)", "unite": "mg/L"},
    {"cdparametre_sandre": "1303", "code": "conductivite", "nom": "Conductivite a 25C", "unite": "µS/cm"},
    {"cdparametre_sandre": "1295", "code": "turbidite", "nom": "Turbidite nephelometrique", "unite": "NFU"},
    {"cdparametre_sandre": "1398", "code": "chlore_libre", "nom": "Chlore libre", "unite": "mg(Cl2)/L"},
]

# Sample-level conformity, derived from DIS_PLV's plvconformitebacterio/plvconformitechimique
# rather than a SANDRE-coded RESULT measurement: no real SANDRE code exists for "was this
# sampling event compliant", so these use a synthetic cdparametre_sandre and are extracted
# via transform.build_conformity instead of transform.filter_parameter. AVG over the seeded
# 0/100 values is exactly the compliance rate, reusing the same aggregation as every other
# parameter with zero extra backend code (see backend/src/routers/aggregation.py).
CONFORMITY_PARAMETERS = [
    {
        "cdparametre_sandre": "CONF_BACT",
        "code": "conformite_bacterio",
        "nom": "Conformité bactériologique",
        "unite": "%",
    },
    {
        "cdparametre_sandre": "CONF_CHIM",
        "code": "conformite_chimique",
        "nom": "Conformité chimique",
        "unite": "%",
    },
]


def load_admin_hierarchy(
    gpkg_path: Path,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load region/departement/epci/commune reference data (no geometry) from Admin Express COG.

    A commune can carry two EPCI codes in a handful of Grand Paris cases (a metropole and a
    local etablissement public territorial layered on top): only the first is kept, since the
    model tracks a single EPCI per commune and this is a display feature, not a legal record.
    """
    region = gpd.read_file(gpkg_path, layer="region", columns=["code_insee", "nom_officiel"], ignore_geometry=True)
    region = region.rename(columns={"code_insee": "code", "nom_officiel": "nom"})

    departement = gpd.read_file(
        gpkg_path,
        layer="departement",
        columns=["code_insee", "nom_officiel", "code_insee_de_la_region"],
        ignore_geometry=True,
    )
    departement = departement.rename(
        columns={
            "code_insee": "code",
            "nom_officiel": "nom",
            "code_insee_de_la_region": "code_region",
        }
    )

    epci = gpd.read_file(gpkg_path, layer="epci", columns=["code_siren", "nom_officiel"], ignore_geometry=True)
    epci = epci.rename(columns={"code_siren": "code", "nom_officiel": "nom"})

    commune = gpd.read_file(
        gpkg_path,
        layer="commune",
        columns=["code_insee", "nom_officiel", "code_insee_du_departement", "codes_siren_des_epci"],
        ignore_geometry=True,
    )
    commune["code_epci"] = commune["codes_siren_des_epci"].str.split("/").str[0]
    commune.loc[commune["code_epci"] == "NR", "code_epci"] = None
    commune = commune.rename(
        columns={
            "code_insee": "code_insee",
            "nom_officiel": "nom",
            "code_insee_du_departement": "code_departement",
        }
    ).drop(columns="codes_siren_des_epci")

    return region, departement, epci, commune


def load_reseaux(com_udi: pd.DataFrame) -> pd.DataFrame:
    """One row per distribution network (cdreseau/nomreseau are consistently 1:1 in the data)."""
    reseaux = com_udi[["cdreseau", "nomreseau"]].drop_duplicates(subset="cdreseau")
    return reseaux.rename(columns={"nomreseau": "nom"})


def truncate_all(session: Session) -> None:
    session.execute(
        text(
            "TRUNCATE TABLE mesure, reseau, parametre, commune, epci, departement, region "
            "RESTART IDENTITY CASCADE"
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True, help="Year of Hub'Eau data to seed")
    parser.add_argument(
        "--parametres",
        type=str,
        default=None,
        help=(
            "Comma-separated subset of parameter codes to seed (e.g. 'durete,ph,nitrates'). "
            "Defaults to all of PARAMETERS. Useful when the target database has a storage "
            "quota too small for every parameter (e.g. Neon's free tier, 512 MB)."
        ),
    )
    args = parser.parse_args()

    all_parameters = PARAMETERS + CONFORMITY_PARAMETERS
    parameters = all_parameters
    if args.parametres is not None:
        wanted = {code.strip() for code in args.parametres.split(",")}
        parameters = [p for p in all_parameters if p["code"] in wanted]
        missing = wanted - {p["code"] for p in parameters}
        if missing:
            raise ValueError(f"Unknown parameter code(s): {sorted(missing)}")

    database_url = os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    engine = create_engine(database_url)
    Base.metadata.create_all(engine, checkfirst=True)

    archive_path = find_admin_express_archive(RAW_DIR)
    gpkg_path = extract_commune_gpkg(archive_path, RAW_DIR)
    region, departement, epci, commune = load_admin_hierarchy(gpkg_path)

    zip_path = RAW_DIR / f"dis-{args.year}.zip"
    result, plv, com_udi = transform.load_hubeau_tables(zip_path)
    reseaux = load_reseaux(com_udi)

    cog_zip_path = RAW_DIR / f"cog_ensemble_{args.year}_csv.zip"
    movements: dict[str, str] | None = None
    if cog_zip_path.exists():
        current_codes = transform.load_current_commune_codes()
        movements = transform.load_commune_movements(cog_zip_path, current_codes)

    conformity_codes = {p["code"] for p in CONFORMITY_PARAMETERS}

    joined_by_parameter = {}
    for param in parameters:
        if param["code"] in conformity_codes:
            flag_column = transform.CONFORMITY_FLAG_COLUMNS[param["code"]]
            base = transform.build_conformity(plv, flag_column)
            joined = transform.union_commune_sources(base, com_udi)
        else:
            filtered = transform.filter_parameter(result, param["cdparametre_sandre"], param["unite"])
            joined = transform.join_commune(filtered, plv, com_udi)
        if movements is not None:
            joined = transform.remap_commune_codes(joined, movements, "inseecommune")
        joined_by_parameter[param["code"]] = joined
        print(f"{param['code']}: {len(joined)} mesures after join")

    with Session(engine) as session:
        truncate_all(session)

        session.execute(insert(Region), region.to_dict("records"))
        session.execute(insert(Departement), departement.to_dict("records"))
        session.execute(insert(Epci), epci.to_dict("records"))
        session.execute(insert(Commune), commune.to_dict("records"))
        session.execute(insert(Parametre), parameters)
        session.execute(insert(Reseau), reseaux.to_dict("records"))

        parametre_ids = dict(session.execute(text("SELECT code, id FROM parametre")).all())
        known_codes = set(commune["code_insee"])

        total_mesures = 0
        for param in parameters:
            joined = joined_by_parameter[param["code"]]
            mesures = joined.rename(
                columns={
                    "inseecommune": "code_insee",
                    "dateprel": "date_prel",
                    "valtraduite": "valeur",
                    "conclusionprel": "conclusion",
                }
            )
            mesures["parametre_id"] = parametre_ids[param["code"]]
            # Only conformity parameters carry a valeur_libelle (see transform.build_conformity):
            # every other parameter's valeur already reads directly in its own unit.
            if "valeur_libelle" not in mesures.columns:
                mesures["valeur_libelle"] = None
            mesures = mesures[
                [
                    "referenceprel",
                    "parametre_id",
                    "code_insee",
                    "cdreseau",
                    "date_prel",
                    "valeur",
                    "conclusion",
                    "valeur_libelle",
                ]
            ]

            # DOM/TOM communes (97x) have no FXX contour and therefore no commune row (see
            # CLAUDE.md: current scope is metropolitan France only), and a handful of codes
            # remain genuinely unmatched (mergers Admin Express's own movements table can't
            # resolve). The FK would reject them anyway: drop and report rather than fail loudly.
            unmatched = mesures.loc[~mesures["code_insee"].isin(known_codes), "code_insee"].nunique()
            if unmatched:
                print(
                    f"{param['code']}: {unmatched} distinct commune codes have no matching "
                    "commune row, dropped"
                )
            mesures = mesures[mesures["code_insee"].isin(known_codes)]

            # cdreseau can be missing for measurements only recovered via the PLV fallback
            # path, and NaN is not a valid FK value: NULL is the correct "unknown network".
            mesures = mesures.where(pd.notna(mesures), None)

            chunk_size = 20_000
            records = mesures.to_dict("records")
            for start in range(0, len(records), chunk_size):
                session.execute(insert(Mesure), records[start : start + chunk_size])
            total_mesures += len(records)

        session.commit()

    print(
        f"Seeded {len(region)} regions, {len(departement)} departements, {len(epci)} EPCI, "
        f"{len(commune)} communes, {len(reseaux)} reseaux, {total_mesures} mesures"
    )


if __name__ == "__main__":
    main()
