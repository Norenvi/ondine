/** Generic per-level index: code/name/bbox for every feature of a given zoom level, built
 * once from the same static GeoJSON MapView renders. Powers search and click-to-select at
 * any level without a second network round-trip beyond what the map already fetches.
 */

import type { NiveauZoom } from "./api";
import { computeBbox, type GeoJsonGeometry } from "./geometry";
import { LEVEL_CONFIG } from "./levels";

export type EntitySummary = {
  level: NiveauZoom;
  code: string;
  name: string;
  /** [minLon, minLat, maxLon, maxLat], used to fit the map to the feature. */
  bbox: [number, number, number, number];
};

type EntityFeature = {
  geometry: GeoJsonGeometry;
  properties: Record<string, unknown>;
};

type EntityFeatureCollection = {
  features: EntityFeature[];
};

const indexCache = new Map<NiveauZoom, Promise<EntitySummary[]>>();

/** Fetches and indexes one level's GeoJSON once, then serves the cached result. Full
 * geometries are discarded right after each feature's bbox is computed. */
export function loadEntityIndex(level: NiveauZoom): Promise<EntitySummary[]> {
  let cached = indexCache.get(level);
  if (cached === undefined) {
    const config = LEVEL_CONFIG[level];
    cached = fetch(config.dataUrl)
      .then((response) => response.json() as Promise<EntityFeatureCollection>)
      .then((collection) =>
        collection.features.map((feature) => ({
          level,
          code:
            typeof feature.properties[config.idProperty] === "string"
              ? (feature.properties[config.idProperty] as string)
              : "",
          name:
            typeof feature.properties[config.nameProperty] === "string"
              ? (feature.properties[config.nameProperty] as string)
              : "Zone",
          bbox: computeBbox(feature.geometry),
        })),
      );
    indexCache.set(level, cached);
  }
  return cached;
}
