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

export type ParameterId =
  | "durete"
  | "ph"
  | "nitrates"
  | "conductivite"
  | "turbidite"
  | "chlore_libre"
  | "ecoli"
  | "chlorures"
  | "sulfates"
  | "calcium"
  | "magnesium"
  | "fer"
  | "aluminium"
  | "manganese"
  | "sodium"
  | "potassium"
  | "fluorures"
  | "bore"
  | "plomb"
  | "cuivre"
  | "arsenic"
  | "bisphenol_a"
  | "thm"
  | "pesticides";

export type UnitsHelp = {
  /** Keyed by unit id: only the currently selected unit's line is shown in the tooltip. */
  lines: Record<string, string>;
  sourceLabel: string;
  sourceUrl: string;
};

export type ParameterDef = {
  id: ParameterId;
  /** Matches the backend parametre.code, used in API query params. */
  apiCode: string;
  label: string;
  /** SANDRE code for the underlying measurement (cdparametre), shown in the UI so a reading
   * can always be traced back to the Hub'Eau/SISE-Eaux source data. */
  sandreCode: string;
  classes: ValueClass[];
  units: Record<string, Unit>;
  unitOrder: string[];
  defaultUnitId: string;
  unitsHelp: UnitsHelp;
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

/**
 * Diverging scale like pH, not sequential: French regulation requires conductivity
 * between 200 and 1100 µS/cm at the tap, and both a too-low (very soft, poorly
 * mineralised) and too-high (over-mineralised) reading are flagged as out of range.
 * Colors mirror PH_CLASSES for visual consistency across "bounded range" parameters.
 */
const CONDUCTIVITE_CLASSES: ValueClass[] = [
  { min: 0, label: "Très faible (hors norme)", color: "#d73027" },
  { min: 200, label: "Faible", color: "#fc8d59" },
  { min: 400, label: "Normale", color: "#91cf60" },
  { min: 700, label: "Élevée", color: "#91bfdb" },
  { min: 1100, label: "Très élevée (hors norme)", color: "#4575b4" },
];

const CONDUCTIVITE_UNITS: Record<string, Unit> = {
  uScm: {
    id: "uScm",
    symbol: "µS/cm",
    name: "microsiemens par centimètre (µS/cm)",
    fromBaseUnit: 1,
    decimals: 0,
  },
};

/**
 * Sequential, low to high concern: clearer water is always the better reading.
 */
const TURBIDITE_CLASSES: ValueClass[] = [
  { min: 0, label: "Très claire", color: "#1a9850" },
  { min: 0.5, label: "Claire", color: "#91cf60" },
  { min: 1, label: "Trouble", color: "#fee08b" },
  { min: 2, label: "Très trouble", color: "#fc8d59" },
  { min: 5, label: "Hors norme", color: "#d73027" },
];

const TURBIDITE_UNITS: Record<string, Unit> = {
  nfu: {
    id: "nfu",
    symbol: "NFU",
    name: "unités néphélométriques de formazine (NFU)",
    fromBaseUnit: 1,
    decimals: 2,
  },
};

/**
 * Sequential: a low residual is normal (and needed for disinfection), a high one signals
 * an increasingly noticeable taste/odour complaint threshold, hence "concern" reads the
 * same left-to-right direction as nitrates/turbidity despite chlorine being intentional.
 */
const CHLORE_LIBRE_CLASSES: ValueClass[] = [
  { min: 0, label: "Faible", color: "#1a9850" },
  { min: 0.1, label: "Normale", color: "#91cf60" },
  { min: 0.3, label: "Élevée", color: "#fee08b" },
  { min: 0.5, label: "Très élevée", color: "#fc8d59" },
  { min: 1, label: "Hors norme (goût)", color: "#d73027" },
];

const CHLORE_LIBRE_UNITS: Record<string, Unit> = {
  mgL: {
    id: "mgL",
    symbol: "mg(Cl2)/L",
    name: "milligrammes de chlore par litre (mg(Cl2)/L)",
    fromBaseUnit: 1,
    decimals: 2,
  },
};

/**
 * E. coli is a fecal-contamination indicator with a strict binding limit: <=0 n/100mL,
 * any detection at all is out of norm (SANDRE 1449, see Hub'Eau libelle_qualite_parametre).
 * The value here is the commune's AVG across its measurements this year, like every other
 * parameter (not a compliance rate), so it is almost always 0 and any positive average
 * already means at least one sample detected E. coli. Bounds above 0 are set from the
 * actual distribution of non-zero detections in the 2026 dataset (median 2, p90 20 n/100mL),
 * to separate an isolated low-count detection from a larger contamination event, rather than
 * treating "any detection" as one undifferentiated class.
 */
const ECOLI_CLASSES: ValueClass[] = [
  { min: 0, label: "Non détectée", color: "#1a9850" },
  { min: 0.01, label: "Détection ponctuelle (hors norme)", color: "#fee08b" },
  { min: 0.5, label: "Détections répétées (hors norme)", color: "#fc8d59" },
  { min: 2, label: "Contamination significative (hors norme)", color: "#d73027" },
  { min: 10, label: "Contamination majeure (hors norme)", color: "#7f0000" },
];

const ECOLI_UNITS: Record<string, Unit> = {
  n100ml: {
    id: "n100ml",
    symbol: "n/100mL",
    name: "nombre pour 100 mL",
    fromBaseUnit: 1,
    decimals: 2,
  },
};

/**
 * Sequential, regulatory-anchored scales for minerals with a French "reference de qualite"
 * (non-binding, aesthetic/informative) or "limite de qualite" (binding, health-based) value:
 * bounds are set at 20%/40%/70%/100% of that value, mirroring the nitrates/turbidite pattern,
 * so "Hors norme" always starts exactly at the regulatory figure.
 */
const CHLORURES_CLASSES: ValueClass[] = [
  { min: 0, label: "Faible", color: "#1a9850" },
  { min: 50, label: "Modérée", color: "#91cf60" },
  { min: 100, label: "Élevée", color: "#fee08b" },
  { min: 175, label: "Très élevée", color: "#fc8d59" },
  { min: 250, label: "Hors norme", color: "#d73027" },
];

const CHLORURES_UNITS: Record<string, Unit> = {
  mgL: { id: "mgL", symbol: "mg/L", name: "milligrammes par litre (mg/L)", fromBaseUnit: 1, decimals: 0 },
};

/** Same shape and bounds as chlorures: both share the 250 mg/L reference de qualite. */
const SULFATES_CLASSES: ValueClass[] = CHLORURES_CLASSES;
const SULFATES_UNITS: Record<string, Unit> = CHLORURES_UNITS;

/**
 * Informative, not regulatory: calcium has no French drinking-water threshold (it is one of
 * the two ions durete already sums into a single CaCO3-equivalent number). Bounds are set
 * from the actual quartile distribution of the 2026 dataset (median ~69 mg/L) rather than an
 * invented "norm", same spirit as durete's own bounds.
 */
const CALCIUM_CLASSES: ValueClass[] = [
  { min: 0, label: "Très faible", color: "#86b6ef" },
  { min: 30, label: "Faible", color: "#5598e7" },
  { min: 70, label: "Moyenne", color: "#2a78d6" },
  { min: 100, label: "Élevée", color: "#1c5cab" },
  { min: 130, label: "Très élevée", color: "#0d366b" },
];

const CALCIUM_UNITS: Record<string, Unit> = {
  mgL: { id: "mgL", symbol: "mg/L", name: "milligrammes par litre (mg/L)", fromBaseUnit: 1, decimals: 0 },
};

/** Informative like calcium: no French threshold. Bounds from the dataset's own quartiles
 * (median ~5 mg/L), the other half of what durete sums together. */
const MAGNESIUM_CLASSES: ValueClass[] = [
  { min: 0, label: "Très faible", color: "#86b6ef" },
  { min: 3, label: "Faible", color: "#5598e7" },
  { min: 6, label: "Moyenne", color: "#2a78d6" },
  { min: 12, label: "Élevée", color: "#1c5cab" },
  { min: 20, label: "Très élevée", color: "#0d366b" },
];

const MAGNESIUM_UNITS: Record<string, Unit> = {
  mgL: { id: "mgL", symbol: "mg/L", name: "milligrammes par litre (mg/L)", fromBaseUnit: 1, decimals: 1 },
};

/** Reference de qualite (non-binding) of 200 µg/L, same bound-fraction scheme as chlorures. */
const FER_CLASSES: ValueClass[] = [
  { min: 0, label: "Faible", color: "#1a9850" },
  { min: 50, label: "Modérée", color: "#91cf60" },
  { min: 100, label: "Élevée", color: "#fee08b" },
  { min: 150, label: "Très élevée", color: "#fc8d59" },
  { min: 200, label: "Hors norme", color: "#d73027" },
];

const FER_UNITS: Record<string, Unit> = {
  ugL: { id: "ugL", symbol: "µg/L", name: "microgrammes par litre (µg/L)", fromBaseUnit: 1, decimals: 0 },
};

/** Same reference de qualite (200 µg/L) and shape as fer. */
const ALUMINIUM_CLASSES: ValueClass[] = FER_CLASSES;
const ALUMINIUM_UNITS: Record<string, Unit> = FER_UNITS;

/** Limite de qualite (binding) of 50 µg/L. */
const MANGANESE_CLASSES: ValueClass[] = [
  { min: 0, label: "Faible", color: "#1a9850" },
  { min: 10, label: "Modérée", color: "#91cf60" },
  { min: 20, label: "Élevée", color: "#fee08b" },
  { min: 35, label: "Très élevée", color: "#fc8d59" },
  { min: 50, label: "Hors norme", color: "#d73027" },
];

const MANGANESE_UNITS: Record<string, Unit> = {
  ugL: { id: "ugL", symbol: "µg/L", name: "microgrammes par litre (µg/L)", fromBaseUnit: 1, decimals: 0 },
};

/** Reference de qualite (non-binding) of 200 mg/L. */
const SODIUM_CLASSES: ValueClass[] = [
  { min: 0, label: "Faible", color: "#1a9850" },
  { min: 50, label: "Modérée", color: "#91cf60" },
  { min: 100, label: "Élevée", color: "#fee08b" },
  { min: 150, label: "Très élevée", color: "#fc8d59" },
  { min: 200, label: "Hors norme", color: "#d73027" },
];

const SODIUM_UNITS: Record<string, Unit> = {
  mgL: { id: "mgL", symbol: "mg/L", name: "milligrammes par litre (mg/L)", fromBaseUnit: 1, decimals: 0 },
};

/** Informative like calcium/magnesium: no French threshold, bounds from the dataset's own
 * quartiles (median ~1.4 mg/L). */
const POTASSIUM_CLASSES: ValueClass[] = [
  { min: 0, label: "Très faible", color: "#86b6ef" },
  { min: 1, label: "Faible", color: "#5598e7" },
  { min: 2, label: "Moyenne", color: "#2a78d6" },
  { min: 4, label: "Élevée", color: "#1c5cab" },
  { min: 6, label: "Très élevée", color: "#0d366b" },
];

const POTASSIUM_UNITS: Record<string, Unit> = {
  mgL: { id: "mgL", symbol: "mg/L", name: "milligrammes par litre (mg/L)", fromBaseUnit: 1, decimals: 2 },
};

/** Limite de qualite (binding) of 1.5 mg/L. */
const FLUORURES_CLASSES: ValueClass[] = [
  { min: 0, label: "Faible", color: "#1a9850" },
  { min: 0.3, label: "Modérée", color: "#91cf60" },
  { min: 0.7, label: "Élevée", color: "#fee08b" },
  { min: 1.2, label: "Très élevée", color: "#fc8d59" },
  { min: 1.5, label: "Hors norme", color: "#d73027" },
];

const FLUORURES_UNITS: Record<string, Unit> = {
  mgL: { id: "mgL", symbol: "mg/L", name: "milligrammes par litre (mg/L)", fromBaseUnit: 1, decimals: 2 },
};

/** Limite de qualite (binding) of 1 mg/L. */
const BORE_CLASSES: ValueClass[] = [
  { min: 0, label: "Faible", color: "#1a9850" },
  { min: 0.2, label: "Modérée", color: "#91cf60" },
  { min: 0.5, label: "Élevée", color: "#fee08b" },
  { min: 0.8, label: "Très élevée", color: "#fc8d59" },
  { min: 1, label: "Hors norme", color: "#d73027" },
];

const BORE_UNITS: Record<string, Unit> = {
  mgL: { id: "mgL", symbol: "mg/L", name: "milligrammes par litre (mg/L)", fromBaseUnit: 1, decimals: 2 },
};

/**
 * Toxic heavy metal, limite de qualite (binding) of 10 µg/L, same 20/40/70/100% bound-fraction
 * scheme as the mineral parameters above. Main real-world source is old lead service pipes/
 * plumbing rather than the raw resource itself.
 */
const PLOMB_CLASSES: ValueClass[] = [
  { min: 0, label: "Faible", color: "#1a9850" },
  { min: 2, label: "Modérée", color: "#91cf60" },
  { min: 4, label: "Élevée", color: "#fee08b" },
  { min: 7, label: "Très élevée", color: "#fc8d59" },
  { min: 10, label: "Hors norme", color: "#d73027" },
];

const PLOMB_UNITS: Record<string, Unit> = {
  ugL: { id: "ugL", symbol: "µg/L", name: "microgrammes par litre (µg/L)", fromBaseUnit: 1, decimals: 1 },
};

/**
 * Same limite de qualite (10 µg/L) and bound-fraction shape as plomb, but geologically driven
 * rather than pipe-corrosion driven: naturally occurring in some subsoils (volcanic/granitic
 * terrain, legacy mining areas), so unlike plomb/cuivre this one is expected to show real
 * geographic clustering rather than scattered noise.
 */
const ARSENIC_CLASSES: ValueClass[] = PLOMB_CLASSES;
const ARSENIC_UNITS: Record<string, Unit> = PLOMB_UNITS;

/**
 * Binding limite de qualite is 2 mg/L, but a non-binding reference de qualite already flags
 * 1 mg/L: bounds are set to cross both figures rather than only the binding one, since copper
 * (like plomb) is mostly a pipe-corrosion signal, where the softer reference value already
 * matters for taste/staining before the health limit is reached.
 */
const CUIVRE_CLASSES: ValueClass[] = [
  { min: 0, label: "Faible", color: "#1a9850" },
  { min: 0.5, label: "Modérée", color: "#91cf60" },
  { min: 1, label: "Élevée (au-delà de la référence)", color: "#fee08b" },
  { min: 1.5, label: "Très élevée", color: "#fc8d59" },
  { min: 2, label: "Hors norme", color: "#d73027" },
];

const CUIVRE_UNITS: Record<string, Unit> = {
  mgCuL: { id: "mgCuL", symbol: "mg(Cu)/L", name: "milligrammes de cuivre par litre (mg(Cu)/L)", fromBaseUnit: 1, decimals: 2 },
};

/** Limite de qualite (binding) of 2.5 µg/L, same bound-fraction scheme as plomb/arsenic. */
const BISPHENOL_A_CLASSES: ValueClass[] = [
  { min: 0, label: "Faible", color: "#1a9850" },
  { min: 0.5, label: "Modérée", color: "#91cf60" },
  { min: 1, label: "Élevée", color: "#fee08b" },
  { min: 1.75, label: "Très élevée", color: "#fc8d59" },
  { min: 2.5, label: "Hors norme", color: "#d73027" },
];

const BISPHENOL_A_UNITS: Record<string, Unit> = {
  ugL: { id: "ugL", symbol: "µg/L", name: "microgrammes par litre (µg/L)", fromBaseUnit: 1, decimals: 2 },
};

/**
 * Trihalomethanes (sum of 4 substances: chloroforme, bromoforme, dichloromonobromomethane,
 * chlorodibromomethane), a chlorination disinfection byproduct rather than a raw contaminant.
 * Limite de qualite (binding) of 100 µg/L, same bound-fraction scheme as the other metals.
 */
const THM_CLASSES: ValueClass[] = [
  { min: 0, label: "Faible", color: "#1a9850" },
  { min: 20, label: "Modérée", color: "#91cf60" },
  { min: 40, label: "Élevée", color: "#fee08b" },
  { min: 70, label: "Très élevée", color: "#fc8d59" },
  { min: 100, label: "Hors norme", color: "#d73027" },
];

const THM_UNITS: Record<string, Unit> = {
  ugL: { id: "ugL", symbol: "µg/L", name: "microgrammes par litre (µg/L)", fromBaseUnit: 1, decimals: 0 },
};

/**
 * Total of all pesticide molecules quantified in a sample (SANDRE 6276), not a single
 * substance: France/EU cap the cumulative sum at 0.5 µg/L regardless of which molecules make
 * it up. Distribution is heavily skewed (2026 dataset: 93% of screened samples read exactly 0,
 * but the non-zero tail reaches 15.5 µg/L, 31x the limit), so bounds below the limit separate
 * an isolated low-level detection from a build-up approaching it, and a second band above the
 * limit (unlike the single "Hors norme" class used elsewhere) separates a marginal exceedance
 * from a severe one, mirroring ecoli's extra top class for the same reason.
 */
const PESTICIDES_CLASSES: ValueClass[] = [
  { min: 0, label: "Non détectés", color: "#1a9850" },
  { min: 0.05, label: "Détection faible", color: "#91cf60" },
  { min: 0.15, label: "Détection modérée", color: "#fee08b" },
  { min: 0.5, label: "Hors norme", color: "#d73027" },
  { min: 1, label: "Fortement hors norme", color: "#7f0000" },
];

const PESTICIDES_UNITS: Record<string, Unit> = {
  ugL: { id: "ugL", symbol: "µg/L", name: "microgrammes par litre (µg/L)", fromBaseUnit: 1, decimals: 3 },
};

export const PARAMETERS: Record<ParameterId, ParameterDef> = {
  durete: {
    id: "durete",
    apiCode: "durete",
    label: "Dureté de l'eau",
    sandreCode: "1345",
    classes: DURETE_CLASSES,
    units: DURETE_UNITS,
    unitOrder: ["f", "ppm", "dH", "mmolL"],
    defaultUnitId: "f",
    unitsHelp: {
      lines: {
        f: "°f (degré français) : unité de référence ici, 1 °f = 10 mg/L de CaCO₃",
        ppm: "ppm (mg/L CaCO₃) : 1 ppm = 0,1 °f",
        dH: "°dH (degré allemand) : 1 °dH ≈ 1,7848 °f",
        mmolL: "mmol/L : 1 mmol/L = 5,6 °f",
      },
      sourceLabel: "Wikipédia : Dureté de l'eau",
      sourceUrl: "https://fr.wikipedia.org/wiki/Duret%C3%A9_de_l%27eau",
    },
  },
  ph: {
    id: "ph",
    apiCode: "ph",
    label: "pH de l'eau",
    sandreCode: "1302",
    classes: PH_CLASSES,
    units: PH_UNITS,
    unitOrder: ["ph"],
    defaultUnitId: "ph",
    unitsHelp: {
      lines: {
        ph: "pH = -log₁₀[H⁺], sans unité, échelle de 0 (acide) à 14 (basique), 7 = neutre",
      },
      sourceLabel: "Wikipédia : Potentiel hydrogène",
      sourceUrl: "https://fr.wikipedia.org/wiki/Potentiel_hydrog%C3%A8ne",
    },
  },
  nitrates: {
    id: "nitrates",
    apiCode: "nitrates",
    label: "Nitrates",
    sandreCode: "1340",
    classes: NITRATES_CLASSES,
    units: NITRATES_UNITS,
    unitOrder: ["mgL"],
    defaultUnitId: "mgL",
    unitsHelp: {
      lines: {
        mgL: "mg/L : milligrammes de nitrates (NO₃⁻) par litre d'eau",
      },
      sourceLabel: "Wikipédia : Nitrate",
      sourceUrl: "https://fr.wikipedia.org/wiki/Nitrate",
    },
  },
  conductivite: {
    id: "conductivite",
    apiCode: "conductivite",
    label: "Conductivité",
    sandreCode: "1303",
    classes: CONDUCTIVITE_CLASSES,
    units: CONDUCTIVITE_UNITS,
    unitOrder: ["uScm"],
    defaultUnitId: "uScm",
    unitsHelp: {
      lines: {
        uScm:
          "µS/cm : microsiemens par centimètre, capacité de l'eau à conduire le courant électrique, liée à sa minéralisation",
      },
      sourceLabel: "Wikipédia : Conductivité électrique",
      sourceUrl: "https://fr.wikipedia.org/wiki/Conductivit%C3%A9_%C3%A9lectrique",
    },
  },
  turbidite: {
    id: "turbidite",
    apiCode: "turbidite",
    label: "Turbidité",
    sandreCode: "1295",
    classes: TURBIDITE_CLASSES,
    units: TURBIDITE_UNITS,
    unitOrder: ["nfu"],
    defaultUnitId: "nfu",
    unitsHelp: {
      lines: {
        nfu: "NFU (unité néphélométrique de formazine) : trouble de l'eau, mesuré par diffusion de la lumière",
      },
      sourceLabel: "Wikipédia : Turbidité",
      sourceUrl: "https://fr.wikipedia.org/wiki/Turbidit%C3%A9",
    },
  },
  chlore_libre: {
    id: "chlore_libre",
    apiCode: "chlore_libre",
    label: "Chlore libre",
    sandreCode: "1398",
    classes: CHLORE_LIBRE_CLASSES,
    units: CHLORE_LIBRE_UNITS,
    unitOrder: ["mgL"],
    defaultUnitId: "mgL",
    unitsHelp: {
      lines: {
        mgL: "mg(Cl₂)/L : milligrammes de chlore libre actif par litre d'eau",
      },
      sourceLabel: "Wikipédia : Chlore",
      sourceUrl: "https://fr.wikipedia.org/wiki/Chlore",
    },
  },
  ecoli: {
    id: "ecoli",
    apiCode: "ecoli",
    label: "Escherichia coli",
    sandreCode: "1449",
    classes: ECOLI_CLASSES,
    units: ECOLI_UNITS,
    unitOrder: ["n100ml"],
    defaultUnitId: "n100ml",
    unitsHelp: {
      lines: {
        n100ml:
          "n/100 mL : nombre de bactéries E. coli détectées, limite de qualité (contraignante) 0/100 mL, indicateur de contamination fécale",
      },
      sourceLabel: "Wikipédia : Escherichia coli",
      sourceUrl: "https://fr.wikipedia.org/wiki/Escherichia_coli",
    },
  },
  chlorures: {
    id: "chlorures",
    apiCode: "chlorures",
    label: "Chlorures",
    sandreCode: "1337",
    classes: CHLORURES_CLASSES,
    units: CHLORURES_UNITS,
    unitOrder: ["mgL"],
    defaultUnitId: "mgL",
    unitsHelp: {
      lines: {
        mgL: "mg/L : référence de qualité (non contraignante) 250 mg/L, goût perceptible au-delà",
      },
      sourceLabel: "Wikipédia : Chlorure",
      sourceUrl: "https://fr.wikipedia.org/wiki/Chlorure",
    },
  },
  sulfates: {
    id: "sulfates",
    apiCode: "sulfates",
    label: "Sulfates",
    sandreCode: "1338",
    classes: SULFATES_CLASSES,
    units: SULFATES_UNITS,
    unitOrder: ["mgL"],
    defaultUnitId: "mgL",
    unitsHelp: {
      lines: {
        mgL: "mg/L : référence de qualité (non contraignante) 250 mg/L, effet laxatif possible au-delà",
      },
      sourceLabel: "Wikipédia : Sulfate",
      sourceUrl: "https://fr.wikipedia.org/wiki/Sulfate",
    },
  },
  calcium: {
    id: "calcium",
    apiCode: "calcium",
    label: "Calcium",
    sandreCode: "1374",
    classes: CALCIUM_CLASSES,
    units: CALCIUM_UNITS,
    unitOrder: ["mgL"],
    defaultUnitId: "mgL",
    unitsHelp: {
      lines: {
        mgL: "mg/L : pas de seuil réglementaire, l'un des deux ions qui composent la dureté (avec le magnésium)",
      },
      sourceLabel: "Wikipédia : Calcium",
      sourceUrl: "https://fr.wikipedia.org/wiki/Calcium",
    },
  },
  magnesium: {
    id: "magnesium",
    apiCode: "magnesium",
    label: "Magnésium",
    sandreCode: "1372",
    classes: MAGNESIUM_CLASSES,
    units: MAGNESIUM_UNITS,
    unitOrder: ["mgL"],
    defaultUnitId: "mgL",
    unitsHelp: {
      lines: {
        mgL: "mg/L : pas de seuil réglementaire, l'autre ion qui compose la dureté (avec le calcium)",
      },
      sourceLabel: "Wikipédia : Magnésium",
      sourceUrl: "https://fr.wikipedia.org/wiki/Magn%C3%A9sium",
    },
  },
  fer: {
    id: "fer",
    apiCode: "fer",
    label: "Fer",
    sandreCode: "1393",
    classes: FER_CLASSES,
    units: FER_UNITS,
    unitOrder: ["ugL"],
    defaultUnitId: "ugL",
    unitsHelp: {
      lines: {
        ugL: "µg/L : référence de qualité (non contraignante) 200 µg/L, goût et coloration au-delà",
      },
      sourceLabel: "Wikipédia : Fer",
      sourceUrl: "https://fr.wikipedia.org/wiki/Fer",
    },
  },
  aluminium: {
    id: "aluminium",
    apiCode: "aluminium",
    label: "Aluminium",
    sandreCode: "1370",
    classes: ALUMINIUM_CLASSES,
    units: ALUMINIUM_UNITS,
    unitOrder: ["ugL"],
    defaultUnitId: "ugL",
    unitsHelp: {
      lines: {
        ugL: "µg/L : référence de qualité (non contraignante) 200 µg/L, résidu du traitement de floculation",
      },
      sourceLabel: "Wikipédia : Aluminium",
      sourceUrl: "https://fr.wikipedia.org/wiki/Aluminium",
    },
  },
  manganese: {
    id: "manganese",
    apiCode: "manganese",
    label: "Manganèse",
    sandreCode: "1394",
    classes: MANGANESE_CLASSES,
    units: MANGANESE_UNITS,
    unitOrder: ["ugL"],
    defaultUnitId: "ugL",
    unitsHelp: {
      lines: {
        ugL: "µg/L : limite de qualité (contraignante) 50 µg/L",
      },
      sourceLabel: "Wikipédia : Manganèse",
      sourceUrl: "https://fr.wikipedia.org/wiki/Mangan%C3%A8se",
    },
  },
  sodium: {
    id: "sodium",
    apiCode: "sodium",
    label: "Sodium",
    sandreCode: "1375",
    classes: SODIUM_CLASSES,
    units: SODIUM_UNITS,
    unitOrder: ["mgL"],
    defaultUnitId: "mgL",
    unitsHelp: {
      lines: {
        mgL: "mg/L : référence de qualité (non contraignante) 200 mg/L",
      },
      sourceLabel: "Wikipédia : Sodium",
      sourceUrl: "https://fr.wikipedia.org/wiki/Sodium",
    },
  },
  potassium: {
    id: "potassium",
    apiCode: "potassium",
    label: "Potassium",
    sandreCode: "1367",
    classes: POTASSIUM_CLASSES,
    units: POTASSIUM_UNITS,
    unitOrder: ["mgL"],
    defaultUnitId: "mgL",
    unitsHelp: {
      lines: {
        mgL: "mg/L : pas de seuil réglementaire en eau potable",
      },
      sourceLabel: "Wikipédia : Potassium",
      sourceUrl: "https://fr.wikipedia.org/wiki/Potassium",
    },
  },
  fluorures: {
    id: "fluorures",
    apiCode: "fluorures",
    label: "Fluorures",
    sandreCode: "7073",
    classes: FLUORURES_CLASSES,
    units: FLUORURES_UNITS,
    unitOrder: ["mgL"],
    defaultUnitId: "mgL",
    unitsHelp: {
      lines: {
        mgL: "mg/L : limite de qualité (contraignante) 1,5 mg/L",
      },
      sourceLabel: "Wikipédia : Fluorure",
      sourceUrl: "https://fr.wikipedia.org/wiki/Fluorure",
    },
  },
  bore: {
    id: "bore",
    apiCode: "bore",
    label: "Bore",
    sandreCode: "1362",
    classes: BORE_CLASSES,
    units: BORE_UNITS,
    unitOrder: ["mgL"],
    defaultUnitId: "mgL",
    unitsHelp: {
      lines: {
        mgL: "mg/L : limite de qualité (contraignante) 1 mg/L",
      },
      sourceLabel: "Wikipédia : Bore (chimie)",
      sourceUrl: "https://fr.wikipedia.org/wiki/Bore_(chimie)",
    },
  },
  plomb: {
    id: "plomb",
    apiCode: "plomb",
    label: "Plomb",
    sandreCode: "1382",
    classes: PLOMB_CLASSES,
    units: PLOMB_UNITS,
    unitOrder: ["ugL"],
    defaultUnitId: "ugL",
    unitsHelp: {
      lines: {
        ugL: "µg/L : limite de qualité (contraignante) 10 µg/L, provient surtout de canalisations/branchements en plomb encore en place",
      },
      sourceLabel: "Wikipédia : Plomb",
      sourceUrl: "https://fr.wikipedia.org/wiki/Plomb",
    },
  },
  cuivre: {
    id: "cuivre",
    apiCode: "cuivre",
    label: "Cuivre",
    sandreCode: "1392",
    classes: CUIVRE_CLASSES,
    units: CUIVRE_UNITS,
    unitOrder: ["mgCuL"],
    defaultUnitId: "mgCuL",
    unitsHelp: {
      lines: {
        mgCuL:
          "mg(Cu)/L : limite de qualité (contraignante) 2 mg/L, référence de qualité (non contraignante) 1 mg/L, provient surtout de canalisations en cuivre",
      },
      sourceLabel: "Wikipédia : Cuivre",
      sourceUrl: "https://fr.wikipedia.org/wiki/Cuivre",
    },
  },
  arsenic: {
    id: "arsenic",
    apiCode: "arsenic",
    label: "Arsenic",
    sandreCode: "1369",
    classes: ARSENIC_CLASSES,
    units: ARSENIC_UNITS,
    unitOrder: ["ugL"],
    defaultUnitId: "ugL",
    unitsHelp: {
      lines: {
        ugL: "µg/L : limite de qualité (contraignante) 10 µg/L, le plus souvent d'origine géologique (sous-sol) plutôt que liée à la distribution",
      },
      sourceLabel: "Wikipédia : Arsenic",
      sourceUrl: "https://fr.wikipedia.org/wiki/Arsenic",
    },
  },
  bisphenol_a: {
    id: "bisphenol_a",
    apiCode: "bisphenol_a",
    label: "Bisphénol A",
    sandreCode: "2766",
    classes: BISPHENOL_A_CLASSES,
    units: BISPHENOL_A_UNITS,
    unitOrder: ["ugL"],
    defaultUnitId: "ugL",
    unitsHelp: {
      lines: {
        ugL: "µg/L : limite de qualité (contraignante) 2,5 µg/L, perturbateur endocrinien d'origine plastique/industrielle",
      },
      sourceLabel: "Wikipédia : Bisphénol A",
      sourceUrl: "https://fr.wikipedia.org/wiki/Bisph%C3%A9nol_A",
    },
  },
  thm: {
    id: "thm",
    apiCode: "thm",
    label: "Trihalométhanes",
    sandreCode: "2036",
    classes: THM_CLASSES,
    units: THM_UNITS,
    unitOrder: ["ugL"],
    defaultUnitId: "ugL",
    unitsHelp: {
      lines: {
        ugL: "µg/L : somme de 4 substances (chloroforme, bromoforme, dichloromonobromométhane, chlorodibromométhane), limite de qualité (contraignante) 100 µg/L, sous-produit de la désinfection au chlore",
      },
      sourceLabel: "Wikipédia : Trihalométhane",
      sourceUrl: "https://fr.wikipedia.org/wiki/Trihalom%C3%A9thane",
    },
  },
  pesticides: {
    id: "pesticides",
    apiCode: "pesticides",
    label: "Pesticides (total)",
    sandreCode: "6276",
    classes: PESTICIDES_CLASSES,
    units: PESTICIDES_UNITS,
    unitOrder: ["ugL"],
    defaultUnitId: "ugL",
    unitsHelp: {
      lines: {
        ugL: "µg/L : somme de tous les pesticides quantifiés dans le prélèvement, limite de qualité (contraignante) 0,5 µg/L au total quelles que soient les molécules",
      },
      sourceLabel: "Wikipédia : Pesticide",
      sourceUrl: "https://fr.wikipedia.org/wiki/Pesticide",
    },
  },
};

export type ParameterGroup = {
  label: string;
  ids: ParameterId[];
};

/** Grouping for the parameter dropdown, source of truth for both its order and its
 * subsection headers (see TopBar.tsx). */
export const PARAMETER_GROUPS: ParameterGroup[] = [
  {
    label: "Général",
    ids: ["ph", "conductivite", "turbidite", "chlore_libre"],
  },
  {
    label: "Bactériologie",
    ids: ["ecoli"],
  },
  {
    label: "Azote",
    ids: ["nitrates"],
  },
  {
    label: "Minéraux et dureté",
    ids: ["durete", "calcium", "magnesium", "sodium", "potassium", "chlorures", "sulfates"],
  },
  {
    label: "Oligo-éléments",
    ids: ["fer", "aluminium", "manganese", "fluorures", "bore"],
  },
  {
    label: "Métaux lourds",
    ids: ["plomb", "cuivre", "arsenic"],
  },
  {
    label: "Composés organiques",
    ids: ["thm", "bisphenol_a"],
  },
  {
    label: "Pesticides",
    ids: ["pesticides"],
  },
];

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
