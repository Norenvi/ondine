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

import { fetchAggregation, type NiveauZoom } from "./api";
import { loadEntityIndex, type EntitySummary } from "./entities";
import { LEVEL_CONFIG, type LevelConfig } from "./levels";
import { MapPopup, type CommuneDetails } from "./MapPopup";
import { buildFillColorExpression, PARAMETERS, type ParameterId } from "./parameters";
import type { Unit } from "./units";

/** Etalab OpenMapTiles flux, no API key required. The map stays in day mode. */
const BASEMAP_STYLE = "https://openmaptiles.geo.data.gouv.fr/styles/osm-bright/style.json";

const SOURCE_ID = "communes";
const FILL_LAYER_ID = "communes-fill";
const OUTLINE_LAYER_ID = "communes-outline";
const HOVER_LAYER_ID = "communes-hover";
const SELECTED_LAYER_ID = "communes-selected";
const LAYER_IDS = [FILL_LAYER_ID, OUTLINE_LAYER_ID, HOVER_LAYER_ID, SELECTED_LAYER_ID];

/** Marks the popup so its MapLibre chrome can be stripped, leaving only the MUI card. */
const POPUP_CLASS = "ondine-popup";

/** Mainland France, the current scope of the dataset. */
const INITIAL_CENTER: [number, number] = [2.5, 46.6];
const INITIAL_ZOOM = 5;

type FitBoundsPadding = { top: number; bottom: number; left: number; right: number };

/** Scales a fixed-pixel fitBounds padding down (preserving its left/right and top/bottom
 * ratios) so it never leaves zero or negative space inside the container. MapLibre only
 * guards against padding that already exceeds the container (it warns and no-ops); padding
 * that lands exactly on the container edge instead sends the target zoom to -Infinity, which
 * turns into a NaN center a few steps later. */
function clampFitBoundsPadding(padding: FitBoundsPadding, container: HTMLElement): FitBoundsPadding {
  const MIN_AVAILABLE = 40;
  const maxHorizontal = Math.max(container.clientWidth - MIN_AVAILABLE, 0);
  const maxVertical = Math.max(container.clientHeight - MIN_AVAILABLE, 0);
  const horizontalTotal = padding.left + padding.right;
  const verticalTotal = padding.top + padding.bottom;
  const hScale = horizontalTotal > 0 ? Math.min(maxHorizontal / horizontalTotal, 1) : 1;
  const vScale = verticalTotal > 0 ? Math.min(maxVertical / verticalTotal, 1) : 1;
  return {
    top: padding.top * vScale,
    bottom: padding.bottom * vScale,
    left: padding.left * hScale,
    right: padding.right * hScale,
  };
}

function readDetails(
  feature: MapGeoJSONFeature,
  state: Record<string, unknown>,
  config: LevelConfig,
): CommuneDetails {
  const props = feature.properties ?? {};
  return {
    code: typeof props[config.idProperty] === "string" ? (props[config.idProperty] as string) : "",
    name: typeof props[config.nameProperty] === "string" ? (props[config.nameProperty] as string) : "Zone",
    value: typeof state.value === "number" ? state.value : null,
    sampleCount: typeof state.sample_count === "number" ? state.sample_count : null,
    latestSample: typeof state.latest_sample === "string" ? state.latest_sample : null,
    nonCompliantCount: typeof state.non_compliant_count === "number" ? state.non_compliant_count : null,
  };
}

type MapViewProps = {
  parameterId: ParameterId;
  unit: Unit;
  level: NiveauZoom;
  annee: number;
  selectedEntity: EntitySummary | null;
  onSelectEntity: (entity: EntitySummary) => void;
};

export function MapView({ parameterId, unit, level, annee, selectedEntity, onSelectEntity }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const popup = useRef<Popup | null>(null);
  // Stable DOM node that the MapLibre popup owns and React portals into.
  const popupContent = useRef<HTMLDivElement>(document.createElement("div"));
  // Which feature currently carries the hover feature-state, so it can be cleared.
  const hoveredId = useRef<string | number | null>(null);
  // Which feature currently carries the selected feature-state, so it can be cleared.
  const selectedId = useRef<string | number | null>(null);
  // Same index search uses for the current level, keyed by code, so a click can resolve
  // the full EntitySummary (bbox included) without recomputing it from the feature.
  const entityByCode = useRef<Map<string, EntitySummary>>(new Map());
  // Read imperatively from the click handler, which is registered once on mount.
  const onSelectEntityRef = useRef(onSelectEntity);
  onSelectEntityRef.current = onSelectEntity;
  // Read from handlers registered once on mount (the "load" handler, and the click/hover
  // handlers below), so they always see whichever parameter/level is current.
  const parameterIdRef = useRef(parameterId);
  parameterIdRef.current = parameterId;
  const levelRef = useRef(level);
  levelRef.current = level;
  const anneeRef = useRef(annee);
  anneeRef.current = annee;
  const [details, setDetails] = useState<CommuneDetails | null>(null);
  // Flips true once the "load" handler has added the source/layers. The selection effect
  // waits on it: a permalink restores `selectedEntity` before the map is ready, and without
  // this the fitBounds would be skipped and never retried.
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadEntityIndex(level).then((entities) => {
      if (!cancelled) {
        entityByCode.current = new Map(entities.map((entity) => [entity.code, entity]));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [level]);

  // Fetches per-feature values for a parameter/level and pushes them into feature-state:
  // every known feature is visited so switching parameter also clears features that had a
  // value under the old parameter but have none under the new one, instead of leaving it stale.
  async function applyAggregation(
    instance: MapLibreMap,
    id: ParameterId,
    forLevel: NiveauZoom,
    forAnnee: number,
  ) {
    const param = PARAMETERS[id];
    const [entities, aggregation] = await Promise.all([
      loadEntityIndex(forLevel),
      fetchAggregation(forLevel, param.apiCode, forAnnee),
    ]);
    const byCode = new Map(aggregation.map((row) => [row.code, row]));

    for (const entity of entities) {
      const row = byCode.get(entity.code);
      // A compliance parameter (E. coli) maps its non-conformity rate, not the mean: one
      // high count would otherwise dominate a commune whose water is mostly clean.
      const value = row
        ? param.compliance
          ? row.taux_non_conformite
          : row.valeur_moyenne
        : null;
      instance.setFeatureState(
        { source: SOURCE_ID, id: entity.code },
        {
          value: value ?? null,
          sample_count: row?.nb_mesures ?? null,
          latest_sample: row?.derniere_mesure ?? null,
          non_compliant_count: row?.nb_non_conformes ?? null,
        },
      );
    }
  }

  function addLayersForLevel(instance: MapLibreMap, forLevel: NiveauZoom, id: ParameterId) {
    const config = LEVEL_CONFIG[forLevel];

    instance.addSource(SOURCE_ID, {
      type: "geojson",
      data: config.dataUrl,
      // Feature-state needs stable ids, and the source data has no numeric id field.
      promoteId: config.idProperty,
    });

    instance.addLayer({
      id: FILL_LAYER_ID,
      type: "fill",
      source: SOURCE_ID,
      paint: {
        "fill-color": buildFillColorExpression(PARAMETERS[id].classes) as ExpressionSpecification,
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
      addLayersForLevel(instance, levelRef.current, parameterIdRef.current);
      void applyAggregation(instance, parameterIdRef.current, levelRef.current, anneeRef.current);
      setMapReady(true);
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
      setDetails(readDetails(feature, state, LEVEL_CONFIG[levelRef.current]));
    });

    instance.on("click", FILL_LAYER_ID, (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const config = LEVEL_CONFIG[levelRef.current];
      const code = feature?.properties?.[config.idProperty];
      if (typeof code !== "string") {
        return;
      }

      const entity = entityByCode.current.get(code);
      if (entity !== undefined) {
        onSelectEntityRef.current(entity);
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
    void applyAggregation(instance, parameterId, levelRef.current, anneeRef.current);
  }, [parameterId]);

  // Timeline scrub: same parameter/level, just a different year of values. fetchAggregation
  // serves visited years from its cache, so scrubbing back is instant.
  useEffect(() => {
    const instance = map.current;
    if (instance === null || instance.getSource(SOURCE_ID) === undefined) {
      return;
    }
    void applyAggregation(instance, parameterIdRef.current, levelRef.current, annee);
  }, [annee]);

  useEffect(() => {
    const instance = map.current;
    if (instance === null || instance.getSource(SOURCE_ID) === undefined) {
      return;
    }

    if (hoveredId.current !== null) {
      hoveredId.current = null;
    }
    if (selectedId.current !== null) {
      selectedId.current = null;
    }
    setDetails(null);

    for (const layerId of LAYER_IDS) {
      if (instance.getLayer(layerId) !== undefined) {
        instance.removeLayer(layerId);
      }
    }
    instance.removeSource(SOURCE_ID);

    addLayersForLevel(instance, level, parameterIdRef.current);
    void applyAggregation(instance, parameterIdRef.current, level, anneeRef.current);
  }, [level]);

  useEffect(() => {
    const instance = map.current;
    // A selection made at a different level than the one currently shown (e.g. switching
    // level right after selecting) targets a source that no longer exists: skip rather than
    // outline/zoom against features that aren't on the map anymore.
    if (
      instance === null ||
      instance.getSource(SOURCE_ID) === undefined ||
      (selectedEntity !== null && selectedEntity.level !== level)
    ) {
      return;
    }

    if (selectedId.current !== null) {
      instance.setFeatureState({ source: SOURCE_ID, id: selectedId.current }, { selected: false });
      selectedId.current = null;
    }

    if (selectedEntity === null) {
      return;
    }

    selectedId.current = selectedEntity.code;
    instance.setFeatureState({ source: SOURCE_ID, id: selectedEntity.code }, { selected: true });

    const [minLon, minLat, maxLon, maxLat] = selectedEntity.bbox;
    // Padding clears whichever detail panel App.tsx renders for this selection. On a phone
    // width (matches the panels' own "sm" breakpoint switch to a bottom sheet) that panel
    // sits along the bottom edge instead of a side, so the padding moves from right to
    // bottom instead of shrinking the same side further.
    const isMobile = window.innerWidth < 600;
    const isCommune = selectedEntity.level === "commune";
    const padding = isMobile
      ? { top: 40, bottom: window.innerHeight * 0.55 + 20, left: 20, right: 20 }
      : isCommune
        ? { top: 80, bottom: 80, left: 90, right: 760 }
        : { top: 80, bottom: 80, left: 80, right: 800 };
    // These paddings are fixed pixel values sized for the ZonePanel/CommunePanel, not derived
    // from the container. On a narrow-enough window (ZonePanel's right:800 bites earlier than
    // CommunePanel's right:760) left+right can reach or exceed the container width, and
    // MapLibre's fitBounds degrades to a NaN center instead of throwing a catchable error
    // (zoom collapses to -Infinity, then a symmetric top/bottom padding offset multiplies out
    // to 0 * Infinity). Scale padding down proportionally so it always leaves real map space.
    const scaledPadding = clampFitBoundsPadding(padding, instance.getContainer());
    // Cap the zoom on a commune so it keeps some surrounding context instead of filling the
    // viewport; the wide right padding pushes it left of the detail panel. maxZoom is omitted
    // entirely rather than set to `undefined` for the other cases: MapLibre merges options over
    // its defaults with a `for...in` loop, which treats an explicit `maxZoom: undefined` as
    // "present" and overwrites its real default (the transform's own maxZoom) with undefined.
    // `Math.min(zoom, undefined)` is then always NaN, which is exactly the NaN LngLat crash.
    instance.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      {
        padding: scaledPadding,
        duration: 800,
        ...(!isMobile && isCommune ? { maxZoom: 10.5 } : {}),
      },
    );
  }, [selectedEntity, level, mapReady]);

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
          ".maplibregl-ctrl-attrib, .maplibregl-ctrl-attrib *": {
            color: "rgba(0, 0, 0, 0.75) !important",
          },
        }}
      />
      <Box ref={container} sx={{ position: "absolute", inset: 0 }} />
      {details !== null &&
        createPortal(
          <MapPopup
            details={details}
            classes={PARAMETERS[parameterId].classes}
            unit={PARAMETERS[parameterId].compliance?.unit ?? unit}
            compliance={PARAMETERS[parameterId].compliance !== undefined}
            level={level}
          />,
          popupContent.current,
        )}
    </>
  );
}
