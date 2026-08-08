"""Download Hub'Eau (drinking water quality control) data and commune contours."""

from __future__ import annotations

import argparse
from pathlib import Path

import requests

RAW_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"

HUBEAU_DATASET_SLUG = "resultats-du-controle-sanitaire-de-leau-distribuee-commune-par-commune"
DATAGOUV_API = "https://www.data.gouv.fr/api/1/datasets"

CONTOURS_REPO_ZIP = "https://github.com/france-geojson/france-geojson/archive/refs/heads/master.zip"


def download_dis(year: int, dest_dir: Path = RAW_DIR) -> Path:
    """Download the national DIS-{year} archive (PLV/RESULT/COM_UDI) from data.gouv.fr."""
    resources = _get_dataset_resources(HUBEAU_DATASET_SLUG)
    target = f"dis-{year}"
    match = next(
        (
            r
            for r in resources
            if target in r["title"].lower() and "dept" not in r["title"].lower()
        ),
        None,
    )
    if match is None:
        raise ValueError(f"No national resource found for {target} on data.gouv.fr")

    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / f"dis-{year}.zip"
    _download_file(match["url"], dest_path)
    return dest_path


def download_contours(dest_dir: Path = RAW_DIR) -> Path:
    """Download commune contours (france-geojson) as an archive."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / "france-geojson.zip"
    _download_file(CONTOURS_REPO_ZIP, dest_path)
    return dest_path


def _get_dataset_resources(slug: str) -> list[dict]:
    response = requests.get(f"{DATAGOUV_API}/{slug}/", timeout=30)
    response.raise_for_status()
    return response.json()["resources"]


def _download_file(url: str, dest_path: Path) -> None:
    with requests.get(url, stream=True, timeout=60) as response:
        response.raise_for_status()
        with dest_path.open("wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True, help="Year of Hub'Eau data to download")
    parser.add_argument(
        "--skip-contours", action="store_true", help="Do not download commune contours"
    )
    args = parser.parse_args()

    dis_path = download_dis(args.year)
    print(f"Hub'Eau DIS-{args.year} downloaded: {dis_path}")

    if not args.skip_contours:
        contours_path = download_contours()
        print(f"Commune contours downloaded: {contours_path}")


if __name__ == "__main__":
    main()