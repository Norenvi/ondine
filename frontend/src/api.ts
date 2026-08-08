/**
 * Client for the FastAPI backend, reverse-proxied by Caddy under /api so there is no
 * cross-origin request to configure.
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

const API_BASE = "/api";

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
