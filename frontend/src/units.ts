/**
 * Hardness units. The pipeline stores French degrees (°f); everything else is a
 * display-time conversion of the same measurement, not a different metric.
 */

export type HardnessUnitId = "f" | "ppm" | "dH" | "mmolL";

export type HardnessUnit = {
  id: HardnessUnitId;
  /** Short label for the unit switch and for values. */
  symbol: string;
  /** Spelled out for the legend subtitle. */
  name: string;
  /** Multiplier applied to a value in °f. */
  fromFrenchDegrees: number;
  decimals: number;
};

export const HARDNESS_UNITS: Record<HardnessUnitId, HardnessUnit> = {
  f: {
    id: "f",
    symbol: "°f",
    name: "degrés français (°f)",
    fromFrenchDegrees: 1,
    decimals: 1,
  },
  ppm: {
    // ppm of CaCO3 equivalent, the usual international reading.
    id: "ppm",
    symbol: "ppm",
    name: "ppm (mg/L CaCO₃)",
    fromFrenchDegrees: 10,
    decimals: 0,
  },
  dH: {
    id: "dH",
    symbol: "°dH",
    name: "degrés allemands (°dH)",
    fromFrenchDegrees: 1 / 1.7848,
    decimals: 1,
  },
  mmolL: {
    // mmol/L of CaCO3 equivalent, 1 mmol/L = 5.6 °f.
    id: "mmolL",
    symbol: "mmol/L",
    name: "millimoles par litre (mmol/L)",
    fromFrenchDegrees: 1 / 5.6,
    decimals: 2,
  },
};

export const DEFAULT_UNIT_ID: HardnessUnitId = "f";

/** Ordered for the unit switch. */
export const UNIT_ORDER: HardnessUnitId[] = ["f", "ppm", "dH", "mmolL"];

/** Convert a value expressed in °f to the given unit. */
export function convertFromFrenchDegrees(value: number, unit: HardnessUnit): number {
  return value * unit.fromFrenchDegrees;
}

/** Convert and round a value in °f for display, without the unit symbol. */
export function formatHardnessValue(value: number, unit: HardnessUnit): string {
  return convertFromFrenchDegrees(value, unit).toFixed(unit.decimals);
}

/** Convert and round a value in °f for display, with the unit symbol. */
export function formatHardness(value: number, unit: HardnessUnit): string {
  return `${formatHardnessValue(value, unit)} ${unit.symbol}`;
}