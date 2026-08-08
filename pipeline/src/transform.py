"""Filter (hardness, SANDRE parameter code 1345) and aggregate Hub'Eau data by commune."""

from __future__ import annotations

import argparse
import zipfile
from pathlib import Path

import pandas as pd

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


def filter_hardness(result: pd.DataFrame) -> pd.DataFrame:
    """Keep only hardness measurements (Titre Hydrotimetrique, SANDRE code 1345).

    The unit is asserted rather than assumed: picking the wrong parameter code yields
    numbers that still look plausible on a map, so it must fail here instead.
    """
    hardness = result[result["cdparametre"] == PARAMETER_CODE_HARDNESS].copy()
    if hardness.empty:
        raise ValueError(f"No measurement found for parameter {PARAMETER_CODE_HARDNESS}")

    units = set(hardness["cdunitereferencesiseeaux"].dropna().unique())
    if units != {EXPECTED_UNIT}:
        raise ValueError(
            f"Unexpected units for parameter {PARAMETER_CODE_HARDNESS}: {sorted(units)}, "
            f"expected only {EXPECTED_UNIT}"
        )

    hardness["valtraduite"] = pd.to_numeric(hardness["valtraduite"], errors="coerce")
    return hardness.dropna(subset=["valtraduite"])


def join_commune(hardness: pd.DataFrame, plv: pd.DataFrame, com_udi: pd.DataFrame) -> pd.DataFrame:
    """Join RESULT (hardness) -> PLV (referenceprel) -> COM_UDI (cdreseau) to get the commune code."""
    joined = hardness.merge(
        plv[["referenceprel", "cdreseau", "dateprel"]],
        on="referenceprel",
        how="inner",
    )
    joined = joined.merge(
        com_udi[["cdreseau", "inseecommune"]],
        on="cdreseau",
        how="inner",
    )
    return joined


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
    agg = aggregate_by_commune(joined)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out_path = PROCESSED_DIR / f"durete_par_commune_{args.year}.csv"
    agg.to_csv(out_path, index=False)
    print(f"{len(agg)} communes written to {out_path}")


if __name__ == "__main__":
    main()