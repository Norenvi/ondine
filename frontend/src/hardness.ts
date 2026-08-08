import { formatHardnessValue, type HardnessUnit } from "./units";

/**
 * Water hardness scale (Titre Hydrotimetrique, TH) expressed in French degrees (of).
 * Classes follow the usual French readings of the TH scale.
 */

export type HardnessClass = {
  /** Lower bound in of, inclusive. */
  min: number;
  label: string;
  color: string;
};

/**
 * Sequential single-hue ramp, light to dark, so darker always reads as harder water.
 * Tuned for the light basemap: the map stays in day mode whatever the panel theme is.
 * The ramp starts mid-scale rather than at the palest step, which would be hard to
 * tell apart from the pale blue the basemap uses for the sea.
 */
export const HARDNESS_CLASSES: HardnessClass[] = [
  { min: 0, label: "Très douce", color: "#86b6ef" },
  { min: 7, label: "Douce", color: "#5598e7" },
  { min: 15, label: "Moyennement dure", color: "#2a78d6" },
  { min: 25, label: "Dure", color: "#1c5cab" },
  { min: 35, label: "Très dure", color: "#0d366b" },
];

/** Communes with no measurement stay visible on the map, in neutral gray. */
export const NO_DATA_COLOR = "#d6d5d1";

export const HARDNESS_PROPERTY = "hardness_mean";

/**
 * Build the MapLibre step expression for fill-color.
 * Communes without data hit the fallback branch and render as NO_DATA_COLOR.
 */
export function buildFillColorExpression(): unknown[] {
  const [first, ...rest] = HARDNESS_CLASSES;
  const steps = rest.flatMap((entry) => [entry.min, entry.color]);

  return [
    "case",
    ["==", ["get", HARDNESS_PROPERTY], null],
    NO_DATA_COLOR,
    ["step", ["get", HARDNESS_PROPERTY], first.color, ...steps],
  ];
}

/** The class a value in °f falls into. */
export function classifyHardness(value: number): HardnessClass {
  // Walked from the top so the first match is the highest bound the value clears.
  return (
    [...HARDNESS_CLASSES].reverse().find((entry) => value >= entry.min) ?? HARDNESS_CLASSES[0]
  );
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
 * Class bounds are stored in °f and converted for display, so switching unit
 * relabels the same classes instead of reclassifying the data.
 */
export function formatRange(index: number, unit: HardnessUnit): string {
  const current = HARDNESS_CLASSES[index];
  const next = HARDNESS_CLASSES[index + 1];
  const from = formatHardnessValue(current.min, unit);
  return next ? `${from} - ${formatHardnessValue(next.min, unit)}` : `> ${from}`;
}