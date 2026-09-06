/**
 * Shareable app state carried in the query string. There is no router: the app never
 * navigates, it just reads this once on load and `history.replaceState()`s it whenever the
 * state changes, so any view can be copied from the address bar.
 */

import type { NiveauZoom } from "./api";
import { LEVEL_CONFIG } from "./levels";
import { PARAMETERS, type ParameterId } from "./parameters";

export type UrlState = {
  parametre?: ParameterId;
  /** Only meaningful for durete (4 units); dropped if not one of the parameter's units. */
  unite?: string;
  niveau?: NiveauZoom;
  /** A selected entity code. Without `classement`: the map selection (commune / EPCI /
   * departement / region). With `classement`: the commune drilled inside the leaderboard. */
  entite?: string;
  annee?: number;
  /** Leaderboard ("Comparer les ...") open. */
  classement?: boolean;
};

export function readUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const state: UrlState = {};

  const parametre = params.get("parametre");
  if (parametre !== null && parametre in PARAMETERS) {
    state.parametre = parametre as ParameterId;
  }

  const niveau = params.get("niveau");
  if (niveau !== null && niveau in LEVEL_CONFIG) {
    state.niveau = niveau as NiveauZoom;
  }

  const unite = params.get("unite");
  if (unite !== null && unite !== "") {
    state.unite = unite;
  }

  const annee = params.get("annee");
  if (annee !== null && /^\d{4}$/.test(annee)) {
    state.annee = Number(annee);
  }

  if (params.get("classement") === "1") {
    state.classement = true;
  }

  const entite = params.get("entite");
  if (entite !== null && entite !== "") {
    state.entite = entite;
  }

  return state;
}

export function writeUrlState(state: UrlState): void {
  const params = new URLSearchParams();
  if (state.parametre) params.set("parametre", state.parametre);
  if (state.annee) params.set("annee", String(state.annee));
  if (state.unite) params.set("unite", state.unite);
  if (state.niveau && state.niveau !== "commune") params.set("niveau", state.niveau);
  if (state.classement) params.set("classement", "1");
  if (state.entite) params.set("entite", state.entite);

  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}
