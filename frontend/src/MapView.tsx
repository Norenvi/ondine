import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Box from "@mui/material/Box";
import GlobalStyles from "@mui/material/GlobalStyles";
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  type ExpressionSpecification,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { HARDNESS_PROPERTY, buildFillColorExpression } from "./hardness";
import { MapPopup, type CommuneDetails } from "./MapPopup";
import { HARDNESS_UNITS, type HardnessUnitId } from "./units";

/** Etalab OpenMapTiles flux, no API key required. The map stays in day mode. */
const BASEMAP_STYLE = "https://openmaptiles.geo.data.gouv.fr/styles/osm-bright/style.json";

const DATA_URL = "/data/communes_durete.geojson";
const SOURCE_ID = "communes";
const FILL_LAYER_ID = "communes-fill";
const OUTLINE_LAYER_ID = "communes-outline";
const HOVER_LAYER_ID = "communes-hover";

/** Marks the popup so its MapLibre chrome can be stripped, leaving only the MUI card. */
const POPUP_CLASS = "ondine-popup";

/** Mainland France, the current scope of the dataset. */
const INITIAL_CENTER: [number, number] = [2.5, 46.6];
const INITIAL_ZOOM = 5;

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function readDetails(feature: MapGeoJSONFeature): CommuneDetails {
  const props = feature.properties ?? {};
  return {
    name: typeof props.nom_officiel === "string" ? props.nom_officiel : "Commune",
    hardness: toNumberOrNull(props[HARDNESS_PROPERTY]),
    sampleCount: toNumberOrNull(props.sample_count),
    latestSample: typeof props.latest_sample === "string" ? props.latest_sample : null,
  };
}

export function MapView({ unitId }: { unitId: HardnessUnitId }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const popup = useRef<Popup | null>(null);
  // Stable DOM node that the MapLibre popup owns and React portals into.
  const popupContent = useRef<HTMLDivElement>(document.createElement("div"));
  // Which commune currently carries the hover feature-state, so it can be cleared.
  const hoveredId = useRef<string | number | null>(null);
  const [details, setDetails] = useState<CommuneDetails | null>(null);

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
          "fill-color": buildFillColorExpression() as ExpressionSpecification,
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
      setDetails(readDetails(feature));
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
          <MapPopup details={details} unit={HARDNESS_UNITS[unitId]} />,
          popupContent.current,
        )}
    </>
  );
}