/**
 * Client for the FastAPI backend. Same-origin "/api" by default (Caddy's handle_path
 * strips the prefix and proxies to the backend, see Caddyfile), so no cross-origin request
 * to configure locally/in docker-compose. VITE_API_BASE_URL overrides this with a full,
 * cross-origin URL when the frontend and backend are deployed as separate services with no
 * shared reverse proxy in front (e.g. Render static site + Render web service): the backend
 * enables CORS for exactly this case (see backend/src/main.py).
 */

export type MesureOut = {
  date_prel: string;
  valeur: number;
  cdreseau: string | null;
  nom_reseau: string | null;
  distributeur: string | null;
  conclusion: string | null;
  valeur_libelle: string | null;
};

export type AggregationOut = {
  code: string;
  nom: string;
  valeur_moyenne: number;
  nb_mesures: number;
  derniere_mesure: string;
  // Non-null only for a parameter with a binding threshold (see PARAMETERS[...].compliance):
  // taux_non_conformite is the share of samples that failed it, in percent; nb_non_conformes
  // is the count. The frontend shows these instead of valeur_moyenne for such parameters.
  taux_non_conformite: number | null;
  nb_non_conformes: number | null;
};

/** One parameter's year for a single commune. `moyenne` is the same pooled mean the
 * choropleth colours by; min / max / derniere_valeur are real samples showing the spread.
 * `nb_non_conformes` is non-null only for a parameter with a binding threshold. */
export type BulletinParametreOut = {
  parametre: string;
  nb_mesures: number;
  minimum: number;
  maximum: number;
  moyenne: number;
  derniere_valeur: number;
  derniere_date: string;
  nb_non_conformes: number | null;
};

export type NiveauZoom = "commune" | "epci" | "departement" | "region";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

/** Timeline slider tick positions: the years (Hub'Eau archives) actually seeded. */
export async function fetchAnnees(): Promise<number[]> {
  const response = await fetch(`${API_BASE}/annees`);
  if (!response.ok) {
    throw new Error(`Echec du chargement des annees (${response.status})`);
  }
  return response.json() as Promise<number[]>;
}

export async function fetchCommuneMesures(
  codeInsee: string,
  parametre: string,
  annee: number,
): Promise<MesureOut[]> {
  const response = await fetch(
    `${API_BASE}/communes/${codeInsee}/mesures?parametre=${parametre}&annee=${annee}`,
  );
  if (!response.ok) {
    throw new Error(`Echec du chargement des releves (${response.status})`);
  }
  return response.json() as Promise<MesureOut[]>;
}

/** Every parameter measured in one commune during `annee`, one summary row each. Backs the
 * commune Bulletin. Cached per (commune, annee) so switching the focused parameter, or
 * reopening a bulletin, costs no request. */
const bulletinCache = new Map<string, BulletinParametreOut[]>();

export async function fetchCommuneBulletin(
  codeInsee: string,
  annee: number,
): Promise<BulletinParametreOut[]> {
  const key = `${codeInsee}:${annee}`;
  const cached = bulletinCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const response = await fetch(`${API_BASE}/communes/${codeInsee}/bulletin?annee=${annee}`);
  if (!response.ok) {
    throw new Error(`Echec du chargement du bulletin (${response.status})`);
  }
  const data = (await response.json()) as BulletinParametreOut[];
  bulletinCache.set(key, data);
  return data;
}

// The choropleth refetches on every parameter/level/year change, and scrubbing the timeline
// back and forth revisits the same (niveau, parametre, annee) triples: cache the full
// responses so a revisit is instant and costs no request.
const aggregationCache = new Map<string, AggregationOut[]>();

export async function fetchAggregation(
  niveau: NiveauZoom,
  parametre: string,
  annee: number,
): Promise<AggregationOut[]> {
  const key = `${niveau}:${parametre}:${annee}`;
  const cached = aggregationCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const response = await fetch(
    `${API_BASE}/aggregation/${niveau}?parametre=${parametre}&annee=${annee}`,
  );
  if (!response.ok) {
    throw new Error(`Echec du chargement de l'agregation (${response.status})`);
  }
  const data = (await response.json()) as AggregationOut[];
  aggregationCache.set(key, data);
  return data;
}

/** Per-commune breakdown of one EPCI/departement/region (see ZonePanel): the detail view for
 * zoom levels above commune, one row per commune inside the zone rather than a raw per-sample
 * table (which would run into tens of thousands of rows at region scale). */
export async function fetchZoneCommunes(
  niveau: Exclude<NiveauZoom, "commune">,
  code: string,
  parametre: string,
  annee: number,
): Promise<AggregationOut[]> {
  const response = await fetch(
    `${API_BASE}/aggregation/${niveau}/${code}/communes?parametre=${parametre}&annee=${annee}`,
  );
  if (!response.ok) {
    throw new Error(`Echec du chargement des communes (${response.status})`);
  }
  return response.json() as Promise<AggregationOut[]>;
}
