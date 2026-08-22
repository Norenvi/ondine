"""Filter (hardness, SANDRE parameter code 1345) and aggregate Hub'Eau data by commune."""

from __future__ import annotations

import argparse
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd

from join_geo import extract_commune_gpkg, find_admin_express_archive

RAW_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"
PROCESSED_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"

# SANDRE 1345 is TITRE HYDROTIMETRIQUE, reported in French degrees (of).
# Do not use 1340, which is nitrates in mg/L.
PARAMETER_CODE_HARDNESS = "1345"
EXPECTED_UNIT = "°f"


def load_hubeau_tables(zip_path: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load RESULT, PLV and COM_UDI from the DIS-{year}.zip archive, without extracting to disk."""
    with zipfile.ZipFile(zip_path) as archive:
        names = archive.namelist()
        result_name = next(n for n in names if "RESULT" in n)
        plv_name = next(n for n in names if "_PLV_" in n)
        com_udi_name = next(n for n in names if "COM_UDI" in n)

        with archive.open(result_name) as f:
            result = pd.read_csv(f, encoding="utf-8", dtype=str)
        with archive.open(plv_name) as f:
            plv = pd.read_csv(f, encoding="utf-8", dtype=str)
        with archive.open(com_udi_name) as f:
            com_udi = pd.read_csv(f, encoding="utf-8", dtype=str)

    return result, plv, com_udi


def load_current_commune_codes() -> set[str]:
    """Load just the code_insee column from Admin Express COG (no geometry), as ground truth
    for which codes are real, standalone communes today.
    """
    archive_path = find_admin_express_archive()
    gpkg_path = extract_commune_gpkg(archive_path)
    communes = gpd.read_file(gpkg_path, layer="commune", columns=["code_insee"], ignore_geometry=True)
    return set(communes["code_insee"])


def load_commune_movements(zip_path: Path, current_codes: set[str]) -> dict[str, str]:
    """Load the INSEE commune movements table (mergers, renamings) and build an old -> current
    code mapping, chain-resolved so a commune merged twice still points at its final code.

    Hub'Eau's COM_UDI does not get refreshed on every commune merger, so it can reference a
    code that no longer exists in the current Admin Express COG contours.

    A code's most recent movement can be a split (one old code fanning out to several new
    ones, e.g. a commune divided between two neighbours): there is no way to tell, from this
    table alone, which of the resulting communes a given water network now belongs to. Those
    are deliberately left unmapped rather than guessed. Codes also get reassociated and later
    reestablished as independent communes again (temporary "commune associee" arrangements),
    which produces old rows pointing at a code that is, today, still its own separate commune:
    a code that is currently standalone is never remapped away, whatever an old row claims.
    """
    with zipfile.ZipFile(zip_path) as archive:
        member = next(n for n in archive.namelist() if n.startswith("v_mvt_commune_"))
        with archive.open(member) as f:
            movements = pd.read_csv(f, dtype={"COM_AV": str, "COM_AP": str})

    # TYPECOM_AP=COMD rows record "commune déléguée" bookkeeping, an internal sub-unit that
    # keeps the old code alive inside the merged commune. It is not a real target commune,
    # and Admin Express COG's commune layer does not carry it: keeping it would map codes
    # backwards onto communes that themselves later moved on. Only real communes (COM) count.
    movements = movements[movements["TYPECOM_AP"] == "COM"]

    direct: dict[str, str] = {}
    for old_code, group in movements.groupby("COM_AV"):
        if old_code in current_codes:
            continue
        latest_date = group["DATE_EFF"].max()
        targets = set(group.loc[group["DATE_EFF"] == latest_date, "COM_AP"]) - {old_code}
        if len(targets) == 1:
            direct[old_code] = next(iter(targets))

    resolved: dict[str, str] = {}
    for old_code in direct:
        current = old_code
        seen = {current}
        while current in direct and direct[current] not in seen:
            current = direct[current]
            seen.add(current)
        resolved[old_code] = current

    return resolved


def remap_commune_codes(df: pd.DataFrame, movements: dict[str, str], column: str) -> pd.DataFrame:
    """Replace obsolete commune codes with their current equivalent, where known.

    Two distinct old codes can remap onto the same current one (both merged into a single
    commune), which can collide with join_commune's referenceprel/commune uniqueness: re-dedup
    after remapping rather than before.
    """
    df = df.copy()
    df[column] = df[column].map(lambda code: movements.get(code, code))
    return df.drop_duplicates(subset=["referenceprel", column])


# A handful of rows report a parameter in a different unit than the rest (e.g. 23 out of
# 26467 Aluminium rows in mg/L instead of µg/L, a lab-reporting quirk, not a code mix-up).
# Below this share, mismatched-unit rows are dropped rather than failing the whole parameter;
# a wrong SANDRE code would make the wrong unit the majority, not a fringe below this bound.
MISMATCHED_UNIT_TOLERANCE = 0.01


def filter_parameter(result: pd.DataFrame, cdparametre: str, expected_unit: str) -> pd.DataFrame:
    """Keep only measurements for the given SANDRE parameter code.

    The unit is asserted rather than assumed: picking the wrong parameter code yields
    numbers that still look plausible on a map, so it must fail here instead.
    """
    filtered = result[result["cdparametre"] == cdparametre].copy()
    if filtered.empty:
        raise ValueError(f"No measurement found for parameter {cdparametre}")

    unit_counts = filtered["cdunitereferencesiseeaux"].value_counts()
    mismatched_share = 1 - unit_counts.get(expected_unit, 0) / unit_counts.sum()
    if mismatched_share > MISMATCHED_UNIT_TOLERANCE:
        raise ValueError(
            f"Unexpected units for parameter {cdparametre}: {sorted(unit_counts.index)}, "
            f"expected only {expected_unit} ({mismatched_share:.1%} mismatched, "
            f"tolerance is {MISMATCHED_UNIT_TOLERANCE:.0%})"
        )
    filtered = filtered[filtered["cdunitereferencesiseeaux"] == expected_unit]

    filtered["valtraduite"] = pd.to_numeric(filtered["valtraduite"], errors="coerce")
    return filtered.dropna(subset=["valtraduite"])


def filter_hardness(result: pd.DataFrame) -> pd.DataFrame:
    """Keep only hardness measurements (Titre Hydrotimetrique, SANDRE code 1345)."""
    return filter_parameter(result, PARAMETER_CODE_HARDNESS, EXPECTED_UNIT)


def union_commune_sources(base: pd.DataFrame, com_udi: pd.DataFrame) -> pd.DataFrame:
    """Recover the commune code for each row of `base` (already carrying referenceprel/cdreseau/
    dateprel/inseecommuneprinc/valtraduite/conclusionprel), via COM_UDI and via PLV's own
    inseecommuneprinc.

    COM_UDI does not always declare every commune a shared network covers: a network named
    e.g. "LEDENON-SERNHAC" can be filed under Ledenon only, even though individual PLV rows
    for that same network report Sernhac as inseecommuneprinc for some of their samples. Both
    sources are unioned (deduplicated per referenceprel/commune pair) rather than picking one,
    so a commune stays covered whichever source happens to declare it.
    """
    via_com_udi = base.merge(
        com_udi[["cdreseau", "inseecommune"]],
        on="cdreseau",
        how="inner",
    ).drop(columns="inseecommuneprinc")

    via_plv_princ = base.rename(columns={"inseecommuneprinc": "inseecommune"})
    via_plv_princ = via_plv_princ.dropna(subset=["inseecommune"])

    joined = pd.concat([via_com_udi, via_plv_princ], ignore_index=True)
    joined = joined.drop_duplicates(subset=["referenceprel", "inseecommune"])
    return joined


def join_commune(hardness: pd.DataFrame, plv: pd.DataFrame, com_udi: pd.DataFrame) -> pd.DataFrame:
    """Join RESULT (hardness) -> PLV (referenceprel) -> COM_UDI (cdreseau) to get the commune code."""
    base = hardness.merge(
        plv[["referenceprel", "cdreseau", "dateprel", "inseecommuneprinc", "conclusionprel"]],
        on="referenceprel",
        how="inner",
    )
    return union_commune_sources(base, com_udi)


def aggregate_by_commune(joined: pd.DataFrame) -> pd.DataFrame:
    """Aggregate hardness by commune: mean, sample count, most recent sample date.

    A commune can be covered by several UDI (several networks): the mean smooths
    differences between networks instead of arbitrarily picking one of them.
    """
    return (
        joined.groupby("inseecommune")
        .agg(
            hardness_mean=("valtraduite", "mean"),
            sample_count=("valtraduite", "size"),
            latest_sample=("dateprel", "max"),
        )
        .reset_index()
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True, help="Year of Hub'Eau data to transform")
    args = parser.parse_args()

    zip_path = RAW_DIR / f"dis-{args.year}.zip"
    result, plv, com_udi = load_hubeau_tables(zip_path)

    hardness = filter_hardness(result)
    joined = join_commune(hardness, plv, com_udi)

    cog_zip_path = RAW_DIR / f"cog_ensemble_{args.year}_csv.zip"
    if cog_zip_path.exists():
        current_codes = load_current_commune_codes()
        movements = load_commune_movements(cog_zip_path, current_codes)
        joined = remap_commune_codes(joined, movements, "inseecommune")
    else:
        print(f"No commune movements file at {cog_zip_path}, skipping obsolete code remapping")

    agg = aggregate_by_commune(joined)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out_path = PROCESSED_DIR / f"durete_par_commune_{args.year}.csv"
    agg.to_csv(out_path, index=False)
    print(f"{len(agg)} communes written to {out_path}")


if __name__ == "__main__":
    main()