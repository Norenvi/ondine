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
    {"cdparametre_sandre": "1337", "code": "chlorures", "nom": "Chlorures", "unite": "mg/L"},
    {"cdparametre_sandre": "1338", "code": "sulfates", "nom": "Sulfates", "unite": "mg/L"},
    {"cdparametre_sandre": "1374", "code": "calcium", "nom": "Calcium", "unite": "mg/L"},
    {"cdparametre_sandre": "1372", "code": "magnesium", "nom": "Magnésium", "unite": "mg(Mg)/L"},
    {"cdparametre_sandre": "1393", "code": "fer", "nom": "Fer total", "unite": "µg/L"},
    {"cdparametre_sandre": "1370", "code": "aluminium", "nom": "Aluminium total", "unite": "µg/L"},
    {"cdparametre_sandre": "1394", "code": "manganese", "nom": "Manganèse total", "unite": "µg/L"},
    {"cdparametre_sandre": "1375", "code": "sodium", "nom": "Sodium", "unite": "mg/L"},
    {"cdparametre_sandre": "1367", "code": "potassium", "nom": "Potassium", "unite": "mg/L"},
    {"cdparametre_sandre": "7073", "code": "fluorures", "nom": "Fluorures", "unite": "mg/L"},
    {"cdparametre_sandre": "1362", "code": "bore", "nom": "Bore", "unite": "mg/L"},
    {"cdparametre_sandre": "1449", "code": "ecoli", "nom": "Escherichia coli", "unite": "n/(100mL)"},
    {"cdparametre_sandre": "1382", "code": "plomb", "nom": "Plomb", "unite": "µg/L"},
    {"cdparametre_sandre": "1392", "code": "cuivre", "nom": "Cuivre", "unite": "mg(Cu)/L"},
    {"cdparametre_sandre": "1369", "code": "arsenic", "nom": "Arsenic", "unite": "µg/L"},
    {"cdparametre_sandre": "2766", "code": "bisphenol_a", "nom": "Bisphénol A", "unite": "µg/L"},
    {
        "cdparametre_sandre": "2036",
        "code": "thm",
        "nom": "Trihalométhanes (4 substances)",
        "unite": "µg/L",
    },
    {
        "cdparametre_sandre": "6276",
        "code": "pesticides",
        "nom": "Total des pesticides analysés",
        "unite": "µg/L",
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


MESURE_COPY_COLUMNS = (
    "referenceprel",
    "parametre_id",
    "code_insee",
    "cdreseau",
    "date_prel",
    "valeur",
    "conclusion",
    "valeur_libelle",
)


def drop_mesure_indexes(session: Session) -> list[str]:
    """Drop mesure's secondary indexes and its unique / foreign-key constraints before a
    bulk load, and return the DDL to rebuild them. Maintaining an index per row and checking
    three FKs per row is the dominant cost of the seed; rebuilding once over the finished
    table (with a validating scan) is far cheaper. Safe here because the load is a full
    truncate + reload of trusted, already-deduplicated pipeline output.
    """
    rebuild: list[str] = []

    cons = session.execute(
        text(
            "SELECT conname, pg_get_constraintdef(oid), contype FROM pg_constraint "
            "WHERE conrelid = 'mesure'::regclass AND contype IN ('u', 'f')"
        )
    ).all()
    fks = [(n, d) for n, d, t in cons if t == "f"]
    uniques = [(n, d) for n, d, t in cons if t == "u"]
    # drop FKs first (they can depend on the unique index), rebuild them last
    for conname, _ in fks + uniques:
        session.execute(text(f"ALTER TABLE mesure DROP CONSTRAINT {conname}"))
    for conname, condef in uniques + fks:
        rebuild.append(f"ALTER TABLE mesure ADD CONSTRAINT {conname} {condef}")

    idx = session.execute(
        text(
            "SELECT indexname, indexdef FROM pg_indexes "
            "WHERE tablename = 'mesure' AND indexname LIKE 'ix_%'"
        )
    ).all()
    for indexname, indexdef in idx:
        rebuild.append(indexdef)
        session.execute(text(f"DROP INDEX {indexname}"))

    return rebuild


def copy_mesures(session: Session, frame: pd.DataFrame) -> int:
    """Bulk-load a mesure DataFrame via Postgres COPY (one order of magnitude faster than
    parametrised INSERT for millions of rows). The raw psycopg cursor runs inside the
    session's transaction, so the surrounding truncate/load/commit stays atomic.

    The frame is serialised to a CSV buffer by pandas (C code) rather than iterated row by
    row in Python: at ~5M rows the per-cell Python overhead of write_row dominates otherwise.
    In CSV mode an unquoted empty field is read as NULL, which is exactly what pandas emits
    for NaN/None, so nullable columns need no special handling.
    """
    frame = frame[list(MESURE_COPY_COLUMNS)]
    raw_conn = session.connection().connection.driver_connection
    copy_sql = (
        f"COPY mesure ({', '.join(MESURE_COPY_COLUMNS)}) FROM STDIN WITH (FORMAT csv)"
    )
    buffer = frame.to_csv(index=False, header=False)
    with raw_conn.cursor() as cur, cur.copy(copy_sql) as copy:
        copy.write(buffer)
    return len(frame)


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

    all_parameters = PARAMETERS
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

    # Shrink RESULT to the monitored parameters once (6M rows -> ~1M), so the per-parameter
    # filter_parameter calls below scan a small frame instead of the full file each time.
    wanted_sandre = {p["cdparametre_sandre"] for p in parameters}
    result = result[result["cdparametre"].isin(wanted_sandre)].copy()

    joined_by_parameter = {}
    for param in parameters:
        filtered = transform.filter_parameter(result, param["cdparametre_sandre"], param["unite"])
        joined = transform.join_commune(filtered, plv, com_udi)
        if movements is not None:
            joined = transform.remap_commune_codes(joined, movements, "inseecommune")
        joined_by_parameter[param["code"]] = joined
        print(f"{param['code']}: {len(joined)} mesures after join")

    with Session(engine) as session:
        # This whole load is one transaction reloaded from scratch each run: durability of
        # intermediate writes buys nothing, and turning it off removes a fsync per statement.
        session.execute(text("SET LOCAL synchronous_commit = off"))
        # Bigger sort/build memory + parallel workers for the index rebuilds at the end
        # (defaults 64 MB / 2 spill a 5M-row build to a disk merge sort). Session-scoped,
        # not a server change; 512 MB is safe transient on the 7 GB box.
        session.execute(text("SET LOCAL maintenance_work_mem = '512MB'"))
        session.execute(text("SET LOCAL max_parallel_maintenance_workers = 4"))
        truncate_all(session)

        session.execute(insert(Region), region.to_dict("records"))
        session.execute(insert(Departement), departement.to_dict("records"))
        session.execute(insert(Epci), epci.to_dict("records"))
        session.execute(insert(Commune), commune.to_dict("records"))
        session.execute(insert(Parametre), parameters)
        session.execute(insert(Reseau), reseaux.to_dict("records"))

        parametre_ids = dict(session.execute(text("SELECT code, id FROM parametre")).all())
        known_codes = set(commune["code_insee"])

        rebuild_ddl = drop_mesure_indexes(session)

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
            mesures["valeur_libelle"] = None

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

            # Missing cdreseau/conclusion/date_prel (PLV fallback rows) stay as NaN here:
            # copy_mesures serialises via CSV where an empty field already means NULL.
            total_mesures += copy_mesures(session, mesures)

        for ddl in rebuild_ddl:
            session.execute(text(ddl))

        session.commit()

    print(
        f"Seeded {len(region)} regions, {len(departement)} departements, {len(epci)} EPCI, "
        f"{len(commune)} communes, {len(reseaux)} reseaux, {total_mesures} mesures"
    )


if __name__ == "__main__":
    main()
