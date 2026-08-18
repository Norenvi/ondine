"""Extract EPCI/departement/region contours (IGN Admin Express COG) for the map's level switch.

Unlike join_geo.py (commune contours joined with hardness data for the legacy CSV/GeoJSON
path), these levels carry no baked-in values: MapView injects values via feature-state from
the aggregation API at runtime, the same way it already does for communes. Output columns are
just code/nom/geometry, code matching what /aggregation/{niveau} returns.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import geopandas as gpd

from join_geo import extract_commune_gpkg, find_admin_express_archive

PROCESSED_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"
TARGET_CRS = "EPSG:4326"

# Matches the code/nom columns seed_db.py's load_admin_hierarchy renames for the same
# layers, so the "code" property here lines up with the DB rows /aggregation/{niveau} returns.
LEVEL_COLUMNS: dict[str, tuple[str, str]] = {
    "epci": ("code_siren", "nom_officiel"),
    "departement": ("code_insee", "nom_officiel"),
    "region": ("code_insee", "nom_officiel"),
}


def load_level(gpkg_path: Path, level: str) -> gpd.GeoDataFrame:
    """Load one admin level's contours, renamed to the code/nom columns MapView expects."""
    code_col, nom_col = LEVEL_COLUMNS[level]
    layer = gpd.read_file(gpkg_path, layer=level, columns=[code_col, nom_col])
    layer = layer.rename(columns={code_col: "code", nom_col: "nom"})
    return layer.to_crs(TARGET_CRS)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True, help="Vintage of the Admin Express archive")
    parser.add_argument("--level", choices=sorted(LEVEL_COLUMNS), required=True)
    args = parser.parse_args()

    archive_path = find_admin_express_archive()
    gpkg_path = extract_commune_gpkg(archive_path)
    layer = load_level(gpkg_path, args.level)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out_path = PROCESSED_DIR / f"{args.level}_{args.year}.geojson"
    layer.to_file(out_path, driver="GeoJSON")
    print(f"{len(layer)} {args.level} written to {out_path}")


if __name__ == "__main__":
    main()
