"""Join commune contours (IGN Admin Express COG) with hardness data by commune."""

from __future__ import annotations

import argparse
from pathlib import Path

import geopandas as gpd
import pandas as pd
import py7zr

RAW_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"
PROCESSED_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"

TARGET_CRS = "EPSG:4326"


def find_admin_express_archive(raw_dir: Path = RAW_DIR) -> Path:
    """Find the most recent Admin Express COG 7z archive in raw_dir."""
    matches = sorted(raw_dir.glob("ADMIN-EXPRESS-COG*.7z"))
    if not matches:
        raise FileNotFoundError(
            f"No ADMIN-EXPRESS-COG*.7z archive in {raw_dir}. "
            "Download the COG GeoPackage from geoservices.ign.fr/adminexpress."
        )
    return matches[-1]


def extract_commune_gpkg(archive_path: Path, raw_dir: Path = RAW_DIR) -> Path:
    """Extract the GeoPackage from the IGN 7z archive if needed (idempotent), return its path."""
    with py7zr.SevenZipFile(archive_path, mode="r") as archive:
        gpkg_member = next(n for n in archive.getnames() if n.endswith(".gpkg"))
        dest_path = raw_dir / gpkg_member
        if not dest_path.exists():
            archive.extract(path=raw_dir, targets=[gpkg_member])
    return dest_path


def load_communes(gpkg_path: Path) -> gpd.GeoDataFrame:
    """Load the commune layer (code, name, geometry) and reproject to EPSG:4326."""
    communes = gpd.read_file(gpkg_path, layer="commune", columns=["code_insee", "nom_officiel"])
    return communes.to_crs(TARGET_CRS)


def join_hardness(communes: gpd.GeoDataFrame, hardness_csv: Path) -> gpd.GeoDataFrame:
    """Join commune contours with hardness data aggregated by commune.

    Left join from contours: a commune with no hardness data stays on the map
    (visible but unfilled) instead of being silently dropped.
    """
    hardness = pd.read_csv(hardness_csv, dtype={"inseecommune": str})
    merged = communes.merge(hardness, left_on="code_insee", right_on="inseecommune", how="left").drop(
        columns="inseecommune"
    )

    missing = int(merged["hardness_mean"].isna().sum())
    print(f"{missing} communes without hardness data (out of {len(merged)})")

    unmatched = sorted(set(hardness["inseecommune"]) - set(communes["code_insee"]))
    if unmatched:
        print(
            f"{len(unmatched)} commune codes present in hardness data but missing from contours "
            f"(likely mergers/obsolete codes), e.g.: {unmatched[:5]}"
        )

    return merged


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True, help="Year of hardness data to join")
    args = parser.parse_args()

    archive_path = find_admin_express_archive()
    gpkg_path = extract_commune_gpkg(archive_path)
    communes = load_communes(gpkg_path)

    hardness_csv = PROCESSED_DIR / f"durete_par_commune_{args.year}.csv"
    merged = join_hardness(communes, hardness_csv)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out_path = PROCESSED_DIR / f"communes_durete_{args.year}.geojson"
    merged.to_file(out_path, driver="GeoJSON")
    print(f"{len(merged)} communes written to {out_path}")


if __name__ == "__main__":
    main()