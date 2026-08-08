/**
 * Lightweight commune index for the search box, built once from the same GeoJSON
 * the map already loads. Only the fields the UI needs are kept; full geometries
 * are discarded right after their bounding box is computed, so the in-memory
 * index stays small even though the source file is close to 40 MB.
 */

export type CommuneSummary = {
  code: string;
  name: string;
  /** [minLon, minLat, maxLon, maxLat], used to fit the map to the commune. */
  bbox: [number, number, number, number];
};

type GeoJsonPosition = [number, number];
type GeoJsonRing = GeoJsonPosition[];

type CommuneGeometry =
  | { type: "Polygon"; coordinates: GeoJsonRing[] }
  | { type: "MultiPolygon"; coordinates: GeoJsonRing[][] };

type CommuneFeature = {
  geometry: CommuneGeometry;
  properties: {
    nom_officiel?: string;
    code_insee?: string;
  };
};

type CommuneFeatureCollection = {
  features: CommuneFeature[];
};

const DATA_URL = "/data/communes_durete.geojson";

/**
 * Derives the department number from an INSEE commune code: the first 2 digits,
 * except Corse (2A/2B, already letters in the code) and DOM codes (971-976,
 * out of scope for now since the dataset covers FXX only).
 */
export function departmentFromInseeCode(code: string): string {
  return code.startsWith("97") ? code.slice(0, 3) : code.slice(0, 2);
}

/** "Commune - (departement)", the shared label format for search results and popups. */
export function communeLabel(name: string, code: string): string {
  return `${name} - (${departmentFromInseeCode(code)})`;
}

function computeBbox(geometry: CommuneGeometry): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  const rings: GeoJsonRing[] =
    geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();

  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }

  return [minLon, minLat, maxLon, maxLat];
}

let indexPromise: Promise<CommuneSummary[]> | null = null;

/** Fetches and indexes the commune dataset once, then serves the cached result. */
export function loadCommuneIndex(): Promise<CommuneSummary[]> {
  if (indexPromise === null) {
    indexPromise = fetch(DATA_URL)
      .then((response) => response.json() as Promise<CommuneFeatureCollection>)
      .then((collection) =>
        collection.features.map((feature) => ({
          code: feature.properties.code_insee ?? "",
          name: feature.properties.nom_officiel ?? "Commune",
          bbox: computeBbox(feature.geometry),
        })),
      );
  }
  return indexPromise;
}
