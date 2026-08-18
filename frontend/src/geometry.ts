/** Minimal GeoJSON geometry helpers, shared by anything that needs a feature's bbox
 * without pulling in a full GeoJSON parsing library for it.
 */

export type GeoJsonPosition = [number, number];
export type GeoJsonRing = GeoJsonPosition[];

export type GeoJsonGeometry =
  | { type: "Polygon"; coordinates: GeoJsonRing[] }
  | { type: "MultiPolygon"; coordinates: GeoJsonRing[][] };

export function computeBbox(geometry: GeoJsonGeometry): [number, number, number, number] {
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
