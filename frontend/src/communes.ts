/** Commune-specific helpers, layered on the generic entity index (entities.ts). Kept
 * separate because communeLabel/departmentFromInseeCode only make sense for a commune's
 * 5-digit INSEE code, not for an EPCI/departement/region code.
 */

import { loadEntityIndex, type EntitySummary } from "./entities";

export type CommuneSummary = Omit<EntitySummary, "level">;

/**
 * Derives the department number from an INSEE commune code: the first 2 digits,
 * except Corse (2A/2B, already letters in the code) and DOM codes (971-976,
 * out of scope for now since the dataset covers FXX only).
 */
export function departmentFromInseeCode(code: string): string {
  return code.startsWith("97") ? code.slice(0, 3) : code.slice(0, 2);
}

/** "Commune - (departement)", the shared label format for search results and popups. */
export function communeLabel(name: string, code: string): string {
  return `${name} - (${departmentFromInseeCode(code)})`;
}

let indexPromise: Promise<CommuneSummary[]> | null = null;

/** Fetches and indexes the commune dataset once, then serves the cached result. */
export function loadCommuneIndex(): Promise<CommuneSummary[]> {
  if (indexPromise === null) {
    indexPromise = loadEntityIndex("commune");
  }
  return indexPromise;
}
