/**
 * Generic display units: a value stored in a parameter's base unit (whatever Hub'Eau reports
 * it in) converted and formatted for display. Parameter-specific unit registries live in
 * parameters.ts; this file only knows how to convert/format, not which units exist.
 */

export type UnitId = string;

export type Unit = {
  id: UnitId;
  /** Short label for the unit switch and for values. */
  symbol: string;
  /** Spelled out for the legend subtitle. */
  name: string;
  /** Multiplier applied to a value in the parameter's base (stored) unit. */
  fromBaseUnit: number;
  decimals: number;
};

/** Convert a value expressed in the parameter's base unit to the given unit. */
export function convertFromBase(value: number, unit: Unit): number {
  return value * unit.fromBaseUnit;
}

/** Convert and round a value for display, without the unit symbol. */
export function formatValue(value: number, unit: Unit): string {
  return convertFromBase(value, unit).toFixed(unit.decimals);
}

/** Convert and round a value for display, with the unit symbol. */
export function formatValueWithUnit(value: number, unit: Unit): string {
  const formatted = formatValue(value, unit);
  return unit.symbol === "" ? formatted : `${formatted} ${unit.symbol}`;
}
