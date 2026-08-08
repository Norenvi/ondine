import { formatValue, type Unit } from "./units";

/**
 * Registry of monitored parameters. Adding one here (matching a "code" already seeded in the
 * backend's parametre table) is the whole frontend cost of a new metric: the map, legend,
 * popup and search panel all read through this definition rather than assuming hardness.
 */

export type ValueClass = {
  /** Lower bound in the parameter's base (stored) unit, inclusive. */
  min: number;
  label: string;
  color: string;
};

export type ParameterId = "durete" | "ph" | "nitrates";

export type ParameterDef = {
  id: ParameterId;
  /** Matches the backend parametre.code, used in API query params. */
  apiCode: string;
  label: string;
  classes: ValueClass[];
  units: Record<string, Unit>;
  unitOrder: string[];
  defaultUnitId: string;
};

/**
 * Sequential single-hue ramp, light to dark, so darker always reads as harder water.
 * Tuned for the light basemap: the map stays in day mode whatever the panel theme is.
 * The ramp starts mid-scale rather than at the palest step, which would be hard to
 * tell apart from the pale blue the basemap uses for the sea.
 */
const DURETE_CLASSES: ValueClass[] = [
  { min: 0, label: "Très douce", color: "#86b6ef" },
  { min: 7, label: "Douce", color: "#5598e7" },
  { min: 15, label: "Moyennement dure", color: "#2a78d6" },
  { min: 25, label: "Dure", color: "#1c5cab" },
  { min: 35, label: "Très dure", color: "#0d366b" },
];

const DURETE_UNITS: Record<string, Unit> = {
  f: {
    id: "f",
    symbol: "°f",
    name: "degrés français (°f)",
    fromBaseUnit: 1,
    decimals: 1,
  },
  ppm: {
    // ppm of CaCO3 equivalent, the usual international reading.
    id: "ppm",
    symbol: "ppm",
    name: "ppm (mg/L CaCO₃)",
    fromBaseUnit: 10,
    decimals: 0,
  },
  dH: {
    id: "dH",
    symbol: "°dH",
    name: "degrés allemands (°dH)",
    fromBaseUnit: 1 / 1.7848,
    decimals: 1,
  },
  mmolL: {
    // mmol/L of CaCO3 equivalent, 1 mmol/L = 5.6 °f.
    id: "mmolL",
    symbol: "mmol/L",
    name: "millimoles par litre (mmol/L)",
    fromBaseUnit: 1 / 5.6,
    decimals: 2,
  },
};

/**
 * Diverging scale centered on neutrality rather than the sequential ramp hardness uses:
 * pH has two directions of concern. Bounds follow the French drinking water regulation
 * (Code de la sante publique), which requires pH between 6.5 and 9 at the tap.
 */
const PH_CLASSES: ValueClass[] = [
  { min: 0, label: "Acide (hors norme)", color: "#d73027" },
  { min: 6.5, label: "Légèrement acide", color: "#fc8d59" },
  { min: 7, label: "Neutre", color: "#91cf60" },
  { min: 7.5, label: "Légèrement basique", color: "#91bfdb" },
  { min: 9, label: "Basique (hors norme)", color: "#4575b4" },
];

const PH_UNITS: Record<string, Unit> = {
  ph: {
    id: "ph",
    symbol: "",
    name: "pH",
    fromBaseUnit: 1,
    decimals: 2,
  },
};

/**
 * Sequential scale, low to high concern (unlike pH, more nitrates is never better).
 * Bounds: 50 mg/L is the French/EU regulatory limit for drinking water; 25 mg/L (half
 * the limit) is the precautionary threshold commonly flagged in public communication.
 */
const NITRATES_CLASSES: ValueClass[] = [
  { min: 0, label: "Faible", color: "#1a9850" },
  { min: 10, label: "Modérée", color: "#91cf60" },
  { min: 25, label: "Élevée", color: "#fee08b" },
  { min: 40, label: "Très élevée", color: "#fc8d59" },
  { min: 50, label: "Hors norme", color: "#d73027" },
];

const NITRATES_UNITS: Record<string, Unit> = {
  mgL: {
    id: "mgL",
    symbol: "mg/L",
    name: "milligrammes par litre (mg/L)",
    fromBaseUnit: 1,
    decimals: 1,
  },
};

export const PARAMETERS: Record<ParameterId, ParameterDef> = {
  durete: {
    id: "durete",
    apiCode: "durete",
    label: "Dureté de l'eau",
    classes: DURETE_CLASSES,
    units: DURETE_UNITS,
    unitOrder: ["f", "ppm", "dH", "mmolL"],
    defaultUnitId: "f",
  },
  ph: {
    id: "ph",
    apiCode: "ph",
    label: "pH de l'eau",
    classes: PH_CLASSES,
    units: PH_UNITS,
    unitOrder: ["ph"],
    defaultUnitId: "ph",
  },
  nitrates: {
    id: "nitrates",
    apiCode: "nitrates",
    label: "Nitrates",
    classes: NITRATES_CLASSES,
    units: NITRATES_UNITS,
    unitOrder: ["mgL"],
    defaultUnitId: "mgL",
  },
};

export const PARAMETER_ORDER: ParameterId[] = ["durete", "ph", "nitrates"];

/** Communes with no measurement stay visible on the map, in neutral gray. */
export const NO_DATA_COLOR = "#d6d5d1";

/**
 * Build the MapLibre step expression for fill-color, reading the value from feature-state
 * (set from the live aggregation API) rather than a baked-in GeoJSON property: the same
 * static geometry source is reused for every parameter.
 */
export function buildFillColorExpression(classes: ValueClass[]): unknown[] {
  const [first, ...rest] = classes;
  const steps = rest.flatMap((entry) => [entry.min, entry.color]);

  return [
    "case",
    ["==", ["feature-state", "value"], null],
    NO_DATA_COLOR,
    ["step", ["feature-state", "value"], first.color, ...steps],
  ];
}

/** The class a value (in the parameter's base unit) falls into. */
export function classifyValue(value: number, classes: ValueClass[]): ValueClass {
  // Walked from the top so the first match is the highest bound the value clears.
  return [...classes].reverse().find((entry) => value >= entry.min) ?? classes[0];
}

function relativeLuminance(hex: string): number {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((pair) => {
    const value = Number.parseInt(pair, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Pick the ink that contrasts best with a swatch, rather than assuming the ramp
 * is light enough for dark text or dark enough for light text.
 */
export function contrastText(background: string): string {
  const luminance = relativeLuminance(background);
  const onDark = 1.05 / (luminance + 0.05);
  const onLight = (luminance + 0.05) / 0.05;
  return onDark >= onLight ? "#ffffff" : "#101010";
}

/**
 * Range label for the legend, for example "7 - 15".
 * Class bounds are stored in the base unit and converted for display, so switching unit
 * relabels the same classes instead of reclassifying the data.
 */
export function formatRange(classes: ValueClass[], index: number, unit: Unit): string {
  const current = classes[index];
  const next = classes[index + 1];
  const from = formatValue(current.min, unit);
  return next ? `${from} - ${formatValue(next.min, unit)}` : `> ${from}`;
}
