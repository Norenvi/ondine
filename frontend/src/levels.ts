/** Registry of the four zoom levels: one static GeoJSON per level, sharing the same
 * layer/property shape everywhere the level appears (map source, search, level switch).
 * idProperty/nameProperty must match the columns pipeline/src/build_admin_geojson.py (and
 * join_geo.py for commune) wrote into that level's GeoJSON, and idProperty's values must
 * match the "code" /aggregation/{niveau} returns for that level.
 */

import type { NiveauZoom } from "./api";

export type LevelConfig = {
  dataUrl: string;
  idProperty: string;
  nameProperty: string;
  label: string;
  /** For the search placeholder, e.g. "une commune", "un EPCI": gender/article vary by level. */
  searchLabel: string;
};

export const LEVEL_CONFIG: Record<NiveauZoom, LevelConfig> = {
  commune: {
    dataUrl: "/data/communes_durete.geojson",
    idProperty: "code_insee",
    nameProperty: "nom_officiel",
    label: "Commune",
    searchLabel: "une commune",
  },
  epci: {
    dataUrl: "/data/epci.geojson",
    idProperty: "code",
    nameProperty: "nom",
    label: "EPCI",
    searchLabel: "un EPCI",
  },
  departement: {
    dataUrl: "/data/departement.geojson",
    idProperty: "code",
    nameProperty: "nom",
    label: "Département",
    searchLabel: "un département",
  },
  region: {
    dataUrl: "/data/region.geojson",
    idProperty: "code",
    nameProperty: "nom",
    label: "Région",
    searchLabel: "une région",
  },
};

export const LEVEL_ORDER: NiveauZoom[] = ["commune", "epci", "departement", "region"];
