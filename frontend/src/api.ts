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
};

export type AggregationOut = {
  code: string;
  nom: string;
  valeur_moyenne: number;
  nb_mesures: number;
  derniere_mesure: string;
};

export type NiveauZoom = "commune" | "epci" | "departement" | "region";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function fetchCommuneMesures(
  codeInsee: string,
  parametre: string,
): Promise<MesureOut[]> {
  const response = await fetch(
    `${API_BASE}/communes/${codeInsee}/mesures?parametre=${parametre}`,
  );
  if (!response.ok) {
    throw new Error(`Echec du chargement des releves (${response.status})`);
  }
  return response.json() as Promise<MesureOut[]>;
}

export async function fetchAggregation(
  niveau: NiveauZoom,
  parametre: string,
): Promise<AggregationOut[]> {
  const response = await fetch(`${API_BASE}/aggregation/${niveau}?parametre=${parametre}`);
  if (!response.ok) {
    throw new Error(`Echec du chargement de l'agregation (${response.status})`);
  }
  return response.json() as Promise<AggregationOut[]>;
}
