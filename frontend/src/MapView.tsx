import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Box from "@mui/material/Box";
import GlobalStyles from "@mui/material/GlobalStyles";
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type ExpressionSpecification,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Only needed for the production build: Vite bundles maplibre-gl's own code into our chunk
// there, so its default worker URL (computed from its own import.meta.url at runtime)
// resolves next to our bundle instead of next to the actual worker files. vite.config.ts
// copies maplibre-gl-worker.mjs and its sibling maplibre-gl-shared.mjs (which the worker
// itself imports by relative path) to this fixed location for that build only. In dev,
// maplibre-gl is served unbundled straight from node_modules (see optimizeDeps.exclude
// below), so its own self-resolved worker URL already works and must be left alone.
if (import.meta.env.PROD) {
  setWorkerUrl("/maplibre-gl/maplibre-gl-worker.mjs");
}

import { fetchAggregation } from "./api";
import { loadCommuneIndex, type CommuneSummary } from "./communes";
import { MapPopup, type CommuneDetails } from "./MapPopup";
import { buildFillColorExpression, PARAMETERS, type ParameterId } from "./parameters";
import type { Unit } from "./units";

/** Etalab OpenMapTiles flux, no API key required. The map stays in day mode. */
const BASEMAP_STYLE = "https://openmaptiles.geo.data.gouv.fr/styles/osm-bright/style.json";

const DATA_URL = "/data/communes_durete.geojson";
const SOURCE_ID = "communes";
const FILL_LAYER_ID = "communes-fill";
const OUTLINE_LAYER_ID = "communes-outline";
const HOVER_LAYER_ID = "communes-hover";
const SELECTED_LAYER_ID = "communes-selected";

/** Marks the popup so its MapLibre chrome can be stripped, leaving only the MUI card. */
const POPUP_CLASS = "ondine-popup";

/** Mainland France, the current scope of the dataset. */
const INITIAL_CENTER: [number, number] = [2.5, 46.6];
const INITIAL_ZOOM = 5;

function readDetails(
  feature: MapGeoJSONFeature,
  state: Record<string, unknown>,
): CommuneDetails {
  const props = feature.properties ?? {};
  return {
    code: typeof props.code_insee === "string" ? props.code_insee : "",
    name: typeof props.nom_officiel === "string" ? props.nom_officiel : "Commune",
    value: typeof state.value === "number" ? state.value : null,
    sampleCount: typeof state.sample_count === "number" ? state.sample_count : null,
    latestSample: typeof state.latest_sample === "string" ? state.latest_sample : null,
  };
}

type MapViewProps = {
  parameterId: ParameterId;
  unit: Unit;
  selectedCommune: CommuneSummary | null;
  onSelectCommune: (commune: CommuneSummary) => void;
};

export function MapView({ parameterId, unit, selectedCommune, onSelectCommune }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const popup = useRef<Popup | null>(null);
  // Stable DOM node that the MapLibre popup owns and React portals into.
  const popupContent = useRef<HTMLDivElement>(document.createElement("div"));
  // Which commune currently carries the hover feature-state, so it can be cleared.
  const hoveredId = useRef<string | number | null>(null);
  // Which commune currently carries the selected feature-state, so it can be cleared.
  const selectedId = useRef<string | number | null>(null);
  // Same index the search box uses, keyed by code, so a click can resolve the
  // full CommuneSummary (bbox included) without recomputing it from the feature.
  const communeByCode = useRef<Map<string, CommuneSummary>>(new Map());
  // Read imperatively from the click handler, which is registered once on mount.
  const onSelectCommuneRef = useRef(onSelectCommune);
  onSelectCommuneRef.current = onSelectCommune;
  // Read from the map's "load" handler (registered once on mount) so it always applies
  // whichever parameter is current by the time the style has actually finished loading.
  const parameterIdRef = useRef(parameterId);
  parameterIdRef.current = parameterId;
  const [details, setDetails] = useState<CommuneDetails | null>(null);

  useEffect(() => {
    loadCommuneIndex().then((communes) => {
      communeByCode.current = new Map(communes.map((commune) => [commune.code, commune]));
    });
  }, []);

  // Fetches per-commune values for a parameter and pushes them into feature-state: every
  // known commune is visited so switching parameter also clears communes that had a value
  // under the old parameter but have none under the new one, instead of leaving it stale.
  async function applyAggregation(instance: MapLibreMap, id: ParameterId) {
    const [communes, aggregation] = await Promise.all([
      loadCommuneIndex(),
      fetchAggregation("commune", PARAMETERS[id].apiCode),
    ]);
    const byCode = new Map(aggregation.map((row) => [row.code, row]));

    for (const commune of communes) {
      const row = byCode.get(commune.code);
      instance.setFeatureState(
        { source: SOURCE_ID, id: commune.code },
        {
          value: row?.valeur_moyenne ?? null,
          sample_count: row?.nb_mesures ?? null,
          latest_sample: row?.derniere_mesure ?? null,
        },
      );
    }
  }

  useEffect(() => {
    if (container.current === null || map.current !== null) {
      return;
    }

    const instance = new MapLibreMap({
      container: container.current,
      style: BASEMAP_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      // OpenStreetMap attribution is mandatory for the OpenMapTiles/Etalab basemap.
      attributionControl: {
        customAttribution:
          '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Donnees: Hub\'Eau, IGN Admin Express',
      },
    });
    map.current = instance;

    instance.addControl(new NavigationControl(), "top-right");

    popup.current = new Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: "none",
      className: POPUP_CLASS,
      offset: 12,
    }).setDOMContent(popupContent.current);

    const clearHover = () => {
      if (hoveredId.current !== null) {
        instance.setFeatureState(
          { source: SOURCE_ID, id: hoveredId.current },
          { hover: false },
        );
        hoveredId.current = null;
      }
    };

    instance.on("load", () => {
      instance.addSource(SOURCE_ID, {
        type: "geojson",
        data: DATA_URL,
        // Feature-state needs stable ids, and the source data has no numeric id field.
        promoteId: "code_insee",
      });

      instance.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": buildFillColorExpression(
            PARAMETERS[parameterIdRef.current].classes,
          ) as ExpressionSpecification,
          "fill-opacity": 0.75,
        },
      });

      instance.addLayer({
        id: OUTLINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: { "line-color": "#ffffff", "line-width": 0.3, "line-opacity": 0.6 },
      });

      // Drawn above the plain outline: width collapses to 0 unless the feature is hovered.
      instance.addLayer({
        id: HOVER_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "#0b1b33",
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0],
        },
      });

      // Drawn above hover: the commune selected via search, outlined in solid black.
      instance.addLayer({
        id: SELECTED_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "#000000",
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 0],
        },
      });

      void applyAggregation(instance, parameterIdRef.current);
    });

    instance.on("mousemove", FILL_LAYER_ID, (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (feature === undefined || feature.id === undefined) {
        return;
      }

      // The card tracks the cursor imperatively: going through React state on every
      // mousemove would re-render the tree continuously.
      popup.current?.setLngLat(event.lngLat);

      if (feature.id === hoveredId.current) {
        return;
      }

      clearHover();
      hoveredId.current = feature.id;
      instance.setFeatureState({ source: SOURCE_ID, id: feature.id }, { hover: true });
      const state = instance.getFeatureState({ source: SOURCE_ID, id: feature.id });
      setDetails(readDetails(feature, state));
    });

    instance.on("click", FILL_LAYER_ID, (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const code = feature?.properties?.code_insee;
      if (typeof code !== "string") {
        return;
      }

      const commune = communeByCode.current.get(code);
      if (commune !== undefined) {
        onSelectCommuneRef.current(commune);
      }
    });

    instance.on("mouseenter", FILL_LAYER_ID, () => {
      instance.getCanvas().style.cursor = "pointer";
    });

    instance.on("mouseleave", FILL_LAYER_ID, () => {
      instance.getCanvas().style.cursor = "";
      clearHover();
      setDetails(null);
    });

    return () => {
      popup.current?.remove();
      popup.current = null;
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    const popupInstance = popup.current;
    if (instance === null || popupInstance === null) {
      return;
    }

    if (details === null) {
      popupInstance.remove();
      return;
    }

    popupInstance.addTo(instance);
  }, [details]);

  useEffect(() => {
    const instance = map.current;
    // On mount this runs before the map has finished loading its style: the "load"
    // handler above already applies parameterIdRef.current once it does, so skip here.
    if (instance === null || instance.getSource(SOURCE_ID) === undefined) {
      return;
    }

    instance.setPaintProperty(
      FILL_LAYER_ID,
      "fill-color",
      buildFillColorExpression(PARAMETERS[parameterId].classes) as ExpressionSpecification,
    );
    void applyAggregation(instance, parameterId);
  }, [parameterId]);

  useEffect(() => {
    const instance = map.current;
    if (instance === null || instance.getSource(SOURCE_ID) === undefined) {
      return;
    }

    if (selectedId.current !== null) {
      instance.setFeatureState({ source: SOURCE_ID, id: selectedId.current }, { selected: false });
      selectedId.current = null;
    }

    if (selectedCommune === null) {
      return;
    }

    selectedId.current = selectedCommune.code;
    instance.setFeatureState({ source: SOURCE_ID, id: selectedCommune.code }, { selected: true });

    const [minLon, minLat, maxLon, maxLat] = selectedCommune.bbox;
    instance.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      { padding: 80, duration: 800 },
    );
  }, [selectedCommune]);

  return (
    <>
      {/*
        MapLibre paints its own white card and tip around the popup content.
        Both are neutralised here so the themed MUI Paper is the only surface.
        pointer-events stay off: the card follows the cursor and must never
        intercept the hover it is reacting to.
      */}
      <GlobalStyles
        styles={{
          [`.${POPUP_CLASS}`]: {
            pointerEvents: "none",
          },
          [`.${POPUP_CLASS} .maplibregl-popup-content`]: {
            padding: 0,
            background: "transparent",
            boxShadow: "none",
          },
          [`.${POPUP_CLASS} .maplibregl-popup-tip`]: {
            display: "none",
          },
        }}
      />
      <Box ref={container} sx={{ position: "absolute", inset: 0 }} />
      {details !== null &&
        createPortal(
          <MapPopup details={details} classes={PARAMETERS[parameterId].classes} unit={unit} />,
          popupContent.current,
        )}
    </>
  );
}