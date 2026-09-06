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
from collections.abc import Iterator
from pathlib import Path

import geopandas as gpd
import pandas as pd
from sqlalchemy import create_engine, func, insert, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
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
    {"cdparametre_sandre": "1339", "code": "nitrites", "nom": "Nitrites (en NO2)", "unite": "mg/L"},
    {"cdparametre_sandre": "1335", "code": "ammonium", "nom": "Ammonium (en NH4)", "unite": "mg/L"},
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
    # seuil_conformite: a sample with valeur strictly above this fails the parameter's binding
    # threshold. Set only where a pooled mean is the wrong summary (E. coli: any detection is a
    # non-conformity, one high count would otherwise dominate the commune's figure). Drives
    # commune_valeur.nb_non_conformes; the API then rolls up a non-compliance rate for it
    # instead of the mean. Absent = mean, like every other parameter.
    {"cdparametre_sandre": "1449", "code": "ecoli", "nom": "Escherichia coli", "unite": "n/(100mL)", "seuil_conformite": 0.0},
    {"cdparametre_sandre": "1382", "code": "plomb", "nom": "Plomb", "unite": "µg/L"},
    {"cdparametre_sandre": "1392", "code": "cuivre", "nom": "Cuivre", "unite": "mg(Cu)/L"},
    {"cdparametre_sandre": "1369", "code": "arsenic", "nom": "Arsenic", "unite": "µg/L"},
    {"cdparametre_sandre": "1385", "code": "selenium", "nom": "Sélénium", "unite": "µg/L"},
    {"cdparametre_sandre": "1386", "code": "nickel", "nom": "Nickel", "unite": "µg/L"},
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
    {
        "cdparametre_sandre": "8847",
        "code": "pfas",
        "nom": "Somme des 20 PFAS",
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


def resolve_movement_chains(direct: dict[str, str]) -> dict[str, str]:
    """Collapse a merged old -> new code map so a code that moved twice across different COG
    vintages (X -> Y in one, Y -> Z in a later one) resolves straight to its final code.
    Same walk transform.load_commune_movements does within a single table, re-applied over
    the union of several. Cycles are broken by the visited set.
    """
    resolved: dict[str, str] = {}
    for old_code in direct:
        current = old_code
        seen = {current}
        while current in direct and direct[current] not in seen:
            current = direct[current]
            seen.add(current)
        resolved[old_code] = current
    return resolved


def _dominant_by_reseau(plv: pd.DataFrame, column: str) -> pd.Series:
    """Most frequent non-null value of `column` per cdreseau. distrlib/moalib are near, but
    not perfectly, constant per network (~13% of cdreseau carry more than one distrlib over a
    year), so pick the modal one rather than an arbitrary row."""
    subset = plv.loc[plv[column].notna(), ["cdreseau", column]]
    counts = subset.groupby(["cdreseau", column]).size().reset_index(name="n")
    counts = counts.sort_values("n", ascending=False).drop_duplicates(subset="cdreseau")
    return counts.set_index("cdreseau")[column]


def load_reseaux(com_udi: pd.DataFrame, plv: pd.DataFrame) -> pd.DataFrame:
    """One row per distribution network (cdreseau/nomreseau are consistently 1:1 in the data),
    enriched with the modal distributor (distrlib) and infrastructure owner (moalib) seen for
    that network in PLV. Both stay NULL for networks absent from PLV."""
    reseaux = com_udi[["cdreseau", "nomreseau"]].drop_duplicates(subset="cdreseau")
    reseaux = reseaux.rename(columns={"nomreseau": "nom"})
    reseaux["distributeur"] = reseaux["cdreseau"].map(_dominant_by_reseau(plv, "distrlib"))
    reseaux["maitre_ouvrage"] = reseaux["cdreseau"].map(_dominant_by_reseau(plv, "moalib"))
    return reseaux.astype(object).where(reseaux.notna(), None)


def truncate_all(session: Session) -> None:
    session.execute(
        text(
            "TRUNCATE TABLE commune_valeur, mesure, reseau, parametre, commune, epci, "
            "departement, region RESTART IDENTITY CASCADE"
        )
    )


def populate_commune_valeur(
    session: Session,
    parametre_ids: list[int],
    seuil_by_id: dict[int, float] | None = None,
) -> int:
    """Recompute the commune_valeur choropleth cache from the freshly loaded mesure rows:
    one row per (parametre, annee, commune) with the sum, count and latest date, plus the
    count of non-compliant samples for any parametre_id present in seuil_by_id (a sample is
    non-compliant when valeur > the parametre's seuil_conformite); NULL for the rest.

    Done one parametre_id at a time, not in a single GROUP BY over the whole table: on the
    small WSL box a full-table aggregate of ~100M rows drove the machine into an
    out-of-memory reboot (same failure mode the chunked mesure load already guards against).
    Each per-parametre slice is a bitmap scan of a few million rows via ix_mesure_parametre_id,
    with a modest work_mem so the hash aggregate never spills large.
    """
    seuil_by_id = seuil_by_id or {}
    session.execute(text("SET LOCAL work_mem = '96MB'"))
    total = 0
    for parametre_id in parametre_ids:
        params = {"pid": parametre_id}
        if parametre_id in seuil_by_id:
            non_conf_expr = "COUNT(*) FILTER (WHERE valeur > :seuil)"
            params["seuil"] = seuil_by_id[parametre_id]
        else:
            non_conf_expr = "NULL::integer"
        result = session.execute(
            text(
                "INSERT INTO commune_valeur "
                "(parametre_id, annee, code_insee, valeur_somme, nb_mesures, derniere_mesure, "
                "nb_non_conformes) "
                "SELECT parametre_id, annee, code_insee, "
                f"SUM(valeur), COUNT(*), MAX(date_prel), {non_conf_expr} "
                "FROM mesure WHERE parametre_id = :pid "
                "GROUP BY parametre_id, annee, code_insee"
            ),
            params,
        )
        total += result.rowcount
    return total


def seuil_by_parametre_id(parameters: list[dict], parametre_ids: dict[str, int]) -> dict[int, float]:
    """Map parametre_id -> seuil_conformite for the parameters that declare one and are present
    in the target database. Passed to populate_commune_valeur so it fills nb_non_conformes.
    """
    return {
        parametre_ids[p["code"]]: p["seuil_conformite"]
        for p in parameters
        if p.get("seuil_conformite") is not None and p["code"] in parametre_ids
    }


def recompute_cache(engine, parameters: list[dict]) -> None:
    """Rebuild commune_valeur from the mesure rows already in the database, without touching
    mesure itself: no Hub'Eau archive, no COPY, just the per-parametre GROUP BY. For rolling
    out a new derived column (nb_non_conformes) or a changed seuil_conformite onto a database
    that is already seeded, local or the Oracle VM (via the SSH tunnel, see CLAUDE.md).
    """
    with Session(engine) as session:
        session.execute(text("SET LOCAL synchronous_commit = off"))
        session.execute(text("SET LOCAL maintenance_work_mem = '256MB'"))
        has_column = session.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 'commune_valeur' AND column_name = 'nb_non_conformes'"
            )
        ).first()
        if has_column is None:
            raise SystemExit(
                "commune_valeur.nb_non_conformes is missing: apply the Alembic migration first "
                "(alembic upgrade head, or redeploy the backend container)"
            )
        parametre_ids = dict(session.execute(text("SELECT code, id FROM parametre")).all())
        if not parametre_ids:
            raise SystemExit("parametre table is empty: run a full --year seed first")
        seuil_by_id = seuil_by_parametre_id(parameters, parametre_ids)
        session.execute(text("TRUNCATE TABLE commune_valeur"))
        total = populate_commune_valeur(session, list(parametre_ids.values()), seuil_by_id)
        session.commit()
    print(
        f"Rebuilt commune_valeur cache: {total} (parametre, annee, commune) rows, "
        f"non-conformity counts for {sorted(seuil_by_id)}"
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
    "annee",
)


_PLAIN_NUMBER_RE = r"\s*[+-]?\d+(?:[.,]\d+)?\s*"


def derive_valeur_libelle(rqana: pd.Series) -> pd.Series:
    """Keep the raw analytical string only when it carries something the number does not:
    a "<" / ">" qualifier or free text ("N.M.", "traces"). A plain number is redundant with
    `valeur` and stays NULL, so the column only grows for the qualified minority of rows.
    """
    text = rqana.astype("string").str.strip()
    informative = (
        text.notna() & (text != "") & ~text.str.fullmatch(_PLAIN_NUMBER_RE)
    ).fillna(False)
    out = text.where(informative).astype(object)
    return out.where(out.notna(), None)


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
    parser.add_argument(
        "--year",
        type=int,
        nargs="+",
        help=(
            "One or more years of Hub'Eau data to seed (e.g. '--year 2026' or "
            "'--year 2024 2025 2026'). Each year is a dis-{year}.zip archive; every year "
            "given is loaded into the same database, tagged with mesure.annee, and becomes a "
            "position on the frontend timeline slider. The load is still a full truncate + "
            "reload, so pass every year you want present on each run."
        ),
    )
    parser.add_argument(
        "--recompute-cache",
        action="store_true",
        help=(
            "Rebuild only the commune_valeur aggregation cache from the mesure rows already "
            "in the database (no Hub'Eau archive needed), then exit. Use it to roll out a "
            "changed commune_valeur schema or seuil_conformite onto an already-seeded "
            "database. Mutually exclusive with --year."
        ),
    )
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

    if bool(args.year) == bool(args.recompute_cache):
        parser.error("pass exactly one of --year or --recompute-cache")

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

    if args.recompute_cache:
        # Threshold lookup uses the full registry, not the --parametres subset: the cache is
        # rebuilt for every parametre already in the database regardless.
        recompute_cache(engine, all_parameters)
        return

    years = sorted(set(args.year))
    wanted_sandre = {p["cdparametre_sandre"] for p in parameters}

    archive_path = find_admin_express_archive(RAW_DIR)
    gpkg_path = extract_commune_gpkg(archive_path, RAW_DIR)
    region, departement, epci, commune = load_admin_hierarchy(gpkg_path)

    # Obsolete commune code remapping. Hub'Eau keeps using pre-merger codes for years after a
    # merger, and each archive year's codes reflect the COG of its own era, so a single COG
    # vintage cannot resolve every year: 2020 data needs 2020-era movements, 2025 data needs
    # 2025-era ones, and both still have to land on a code that exists in today's Admin Express.
    # v_mvt_commune is cumulative within a vintage, so merging every available cog_ensemble
    # (newer rows winning on conflict) and chain-resolving once gives the widest coverage.
    cog_zips = sorted(RAW_DIR.glob("cog_ensemble_*_csv.zip"))
    movements: dict[str, str] | None = None
    if cog_zips:
        current_codes = transform.load_current_commune_codes()
        merged: dict[str, str] = {}
        for cog_zip in cog_zips:
            merged.update(transform.load_commune_movements(cog_zip, current_codes))
        movements = resolve_movement_chains(merged)
        print(
            f"Merged commune movements from {[z.name for z in cog_zips]}: "
            f"{len(movements)} remaps"
        )
    else:
        print("No cog_ensemble_*_csv.zip found, obsolete commune codes will not be remapped")

    def iter_year(year: int) -> Iterator[tuple[str, pd.DataFrame]]:
        """Yield ("__reseaux__", reseaux) then (parameter_code, joined_mesures) for one
        dis-{year}.zip. A generator, not a dict: the consumer copies and drops each frame
        before the next is built, so only one parameter's joined frame is resident at a time
        on top of the shared (already SANDRE-filtered) RESULT/PLV for the year.
        """
        zip_path = RAW_DIR / f"dis-{year}.zip"
        result, plv, com_udi = transform.load_hubeau_tables(zip_path, wanted_sandre)
        yield "__reseaux__", load_reseaux(com_udi, plv)

        for param in parameters:
            filtered = transform.filter_parameter(
                result, param["cdparametre_sandre"], param["unite"], allow_empty=True
            )
            if filtered.empty:
                print(f"{year} {param['code']}: no measurement, skipped")
                continue
            joined = transform.join_commune(filtered, plv, com_udi)
            if movements is not None:
                joined = transform.remap_commune_codes(joined, movements, "inseecommune")
            print(f"{year} {param['code']}: {len(joined)} mesures after join")
            yield param["code"], joined

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

        parametre_ids = dict(session.execute(text("SELECT code, id FROM parametre")).all())
        known_codes = set(commune["code_insee"])

        rebuild_ddl = drop_mesure_indexes(session)

        _reseau_base = pg_insert(Reseau)
        # A network reappears in every archive it serves water in. `years` is ascending, so
        # updating on conflict lets the most recent archive win for nom/distributeur; COALESCE
        # keeps an earlier non-null value when the later archive has none for that field.
        reseau_stmt = _reseau_base.on_conflict_do_update(
            index_elements=["cdreseau"],
            set_={
                "nom": _reseau_base.excluded.nom,
                "distributeur": func.coalesce(
                    _reseau_base.excluded.distributeur, Reseau.distributeur
                ),
                "maitre_ouvrage": func.coalesce(
                    _reseau_base.excluded.maitre_ouvrage, Reseau.maitre_ouvrage
                ),
            },
        )
        total_mesures = 0
        for year in years:
            for code, frame in iter_year(year):
                if code == "__reseaux__":
                    session.execute(reseau_stmt, frame.to_dict("records"))
                    continue

                mesures = frame.rename(
                    columns={
                        "inseecommune": "code_insee",
                        "dateprel": "date_prel",
                        "valtraduite": "valeur",
                        "conclusionprel": "conclusion",
                    }
                )
                mesures["parametre_id"] = parametre_ids[code]
                mesures["valeur_libelle"] = derive_valeur_libelle(mesures["rqana"])
                mesures["annee"] = year

                # DOM/TOM communes (97x) have no FXX contour and therefore no commune row (see
                # CLAUDE.md: current scope is metropolitan France only), and a handful of codes
                # remain genuinely unmatched (mergers the movements tables can't resolve). The
                # FK would reject them anyway: drop and report rather than fail loudly.
                unmatched = mesures.loc[~mesures["code_insee"].isin(known_codes), "code_insee"].nunique()
                if unmatched:
                    print(
                        f"{year} {code}: {unmatched} distinct commune codes have no "
                        "matching commune row, dropped"
                    )
                mesures = mesures[mesures["code_insee"].isin(known_codes)]

                # Missing cdreseau/conclusion/date_prel (PLV fallback rows) stay as NaN here:
                # copy_mesures serialises via CSV where an empty field already means NULL.
                total_mesures += copy_mesures(session, mesures)

        for ddl in rebuild_ddl:
            session.execute(text(ddl))

        total_valeurs = populate_commune_valeur(
            session,
            list(parametre_ids.values()),
            seuil_by_parametre_id(parameters, parametre_ids),
        )
        print(f"Built commune_valeur cache: {total_valeurs} (parametre, annee, commune) rows")

        total_reseaux = session.execute(text("SELECT count(*) FROM reseau")).scalar_one()

        session.commit()

    print(
        f"Seeded {len(region)} regions, {len(departement)} departements, {len(epci)} EPCI, "
        f"{len(commune)} communes, {total_reseaux} reseaux, {total_mesures} mesures "
        f"({total_valeurs} commune_valeur rows) across years {years}"
    )


if __name__ == "__main__":
    main()
