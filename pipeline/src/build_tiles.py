"""Build PMTiles vector tiles from a simplified GeoJSON, via tippecanoe.

Serves the same four levels as simplify.py (commune/epci/departement/region), one
PMTiles archive each. PMTiles is a single static file MapLibre reads with HTTP range
requests, so Caddy serves it exactly like the current GeoJSON, no tile server needed.

This only replaces how the map *renders* geometry: the frontend still fetches the
matching level's plain GeoJSON separately for entities.ts (search index / bbox lookup).
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

PROCESSED_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"

# The tippecanoe source-layer name the frontend's vector source must reference.
# "durete" is the legacy commune+hardness GeoJSON stem, but the tiles carry only
# geometry now: name the layer for what it is on the map.
LEVEL_LAYER_NAME = {
    "durete": "communes",
    "epci": "epci",
    "departement": "departement",
    "region": "region",
}


def build_tiles(input_path: Path, output_path: Path, layer_name: str) -> Path:
    """Run tippecanoe on input_path, writing a single PMTiles archive to output_path.

    --no-tile-size-limit / --no-feature-limit: a choropleth must never silently drop a
    polygon to satisfy tippecanoe's default tile budget, a missing commune reads as a
    data gap, not a size optimization.
    --detect-shared-borders: keeps adjacent polygon edges aligned across zoom levels,
    the mapshaper-simplified input already avoided gaps, tippecanoe's own per-zoom
    simplification could otherwise reintroduce them at the shared border.
    -zg: guess min/maxzoom from feature density rather than hardcode one, the four
    levels differ enough in polygon count/size that a single fixed range would either
    waste tiles on the smallest level or under-resolve the largest.
    """
    tippecanoe = shutil.which("tippecanoe")
    if tippecanoe is None:
        raise FileNotFoundError("tippecanoe not found on PATH (apt install tippecanoe)")

    command = [
        tippecanoe,
        "-o",
        str(output_path),
        "-l",
        layer_name,
        "-zg",
        "--no-tile-size-limit",
        "--no-feature-limit",
        "--detect-shared-borders",
        "--force",
        str(input_path),
    ]
    subprocess.run(command, check=True)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True, help="Year of the simplified GeoJSON to tile")
    parser.add_argument(
        "--level",
        default="durete",
        choices=["durete", "epci", "departement", "region"],
        help="Same level naming as simplify.py",
    )
    args = parser.parse_args()

    stem = f"communes_durete_{args.year}" if args.level == "durete" else f"{args.level}_{args.year}"
    input_path = PROCESSED_DIR / f"{stem}_simplified.geojson"
    output_stem = "communes_durete" if args.level == "durete" else args.level
    output_path = PROCESSED_DIR / f"{output_stem}.pmtiles"

    build_tiles(input_path, output_path, LEVEL_LAYER_NAME[args.level])

    input_mb = input_path.stat().st_size / 1e6
    output_mb = output_path.stat().st_size / 1e6
    print(f"{input_mb:.1f} MB -> {output_mb:.1f} MB ({output_mb / input_mb:.1%}) : {output_path}")


if __name__ == "__main__":
    main()
