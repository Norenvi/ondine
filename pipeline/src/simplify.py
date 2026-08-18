"""Simplify commune geometries with mapshaper (topology-aware, shared borders stay watertight)."""

from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

PROCESSED_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"

# Visvalingam weighted area, the mapshaper default, keeps shapes more natural than
# Douglas-Peucker on administrative boundaries.
DEFAULT_PERCENTAGE = 5.0

# Roughly 1 metre at French latitudes. Commune borders do not need more than that
# on a web map, and rounding coordinates cuts the output size substantially.
DEFAULT_PRECISION = 0.00001

# Node heap ceiling for mapshaper-xl. Sized to stay under typical physical RAM.
DEFAULT_MEMORY = "5gb"


def resolve_mapshaper_command(memory: str = DEFAULT_MEMORY) -> list[str]:
    """Return the mapshaper invocation, preferring a local install over npx.

    mapshaper-xl raises the node heap limit, which the full-resolution national file needs.
    The limit is passed explicitly: the 8gb default exceeds physical RAM on smaller machines
    and sends them swapping instead of failing fast.
    """
    path = shutil.which("mapshaper-xl")
    if path is not None:
        return [path, memory]
    return ["npx", "--yes", "mapshaper-xl", memory]


def simplify_geojson(
    input_path: Path,
    output_path: Path,
    percentage: float = DEFAULT_PERCENTAGE,
    precision: float = DEFAULT_PRECISION,
    memory: str = DEFAULT_MEMORY,
) -> Path:
    """Simplify input_path to output_path, keeping every polygon present.

    keep-shapes prevents small communes from collapsing entirely at high simplification.
    """
    command = [
        *resolve_mapshaper_command(memory),
        str(input_path),
        "-simplify",
        f"{percentage}%",
        "keep-shapes",
        "-clean",
        "-o",
        str(output_path),
        f"precision={precision}",
    ]
    subprocess.run(command, check=True)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True, help="Year of the joined GeoJSON to simplify")
    parser.add_argument(
        "--level",
        default="durete",
        choices=["durete", "epci", "departement", "region"],
        help="'durete' is the legacy commune+hardness GeoJSON from join_geo.py; the other "
        "levels are the plain contours from build_admin_geojson.py",
    )
    parser.add_argument(
        "--percentage",
        type=float,
        default=DEFAULT_PERCENTAGE,
        help="Share of points to keep, lower means smaller output",
    )
    parser.add_argument(
        "--precision", type=float, default=DEFAULT_PRECISION, help="Coordinate rounding precision"
    )
    parser.add_argument(
        "--memory", default=DEFAULT_MEMORY, help="Node heap limit for mapshaper-xl, e.g. 5gb"
    )
    args = parser.parse_args()

    stem = f"communes_durete_{args.year}" if args.level == "durete" else f"{args.level}_{args.year}"
    input_path = PROCESSED_DIR / f"{stem}.geojson"
    output_path = PROCESSED_DIR / f"{stem}_simplified.geojson"

    simplify_geojson(input_path, output_path, args.percentage, args.precision, args.memory)

    input_mb = input_path.stat().st_size / 1e6
    output_mb = output_path.stat().st_size / 1e6
    print(f"{input_mb:.1f} MB -> {output_mb:.1f} MB ({output_mb / input_mb:.1%}) : {output_path}")


if __name__ == "__main__":
    main()