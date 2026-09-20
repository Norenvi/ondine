# Ondine

Carte interactive de la qualité de l'eau potable en France, commune par commune : dureté (TH), pH, nitrates, E. coli et une trentaine d'autres paramètres, sous forme de choropleth avec sélecteur de paramètre et curseur temporel (2016-2026).

**Démo en ligne : [ondine-eau.fr](https://ondine-eau.fr)**

## Ce que ça fait

- Carte choropleth par commune, paramètre et année sélectionnables
- Recherche de commune, panneau de détail (historique des relevés, classe de conformité, distributeur)
- Bulletin par commune : tous les paramètres mesurés une année donnée, avec seuils réglementaires
- Classement (leaderboard) des communes par paramètre
- Permaliens : l'état de la carte (paramètre, année, commune, classement) est dans l'URL

## Sources et méthode

- **Hub'Eau** (contrôle sanitaire de l'eau distribuée) pour les mesures, **IGN Admin Express COG** pour les contours de communes, **INSEE COG** pour le suivi des fusions de communes.
- Une commune est rattachée à *tous* les réseaux de distribution (UDI) qui la desservent, pas seulement aux prélèvements physiquement situés sur son territoire : le comptage peut donc différer de ce que renvoie l'API Hub'Eau filtrée par `code_commune`.
- La statistique affichée est une **moyenne poolée** sur les mesures individuelles (pas une moyenne de moyennes). Exception : les paramètres à seuil réglementaire comme E. coli sont agrégés en **taux de non-conformité**.
- L'année en cours est toujours partielle (l'archive Hub'Eau de l'année n'est mise à jour qu'en janvier de l'année suivante).
- Fond de carte : OpenMapTiles via le flux [Etalab](https://www.etalab.gouv.fr/), données © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

## Architecture

```
pipeline/   pipeline Python offline (Hub'Eau + IGN -> GeoJSON/PMTiles + Postgres)
backend/    API FastAPI (agrégation par commune/EPCI/département/région)
frontend/   React + MapLibre GL JS
Caddyfile   reverse proxy + fichiers statiques
```

La géométrie des communes est servie en statique (GeoJSON/PMTiles, régénérés par le pipeline). Les valeurs (mesures, agrégations) sont interrogées dynamiquement dans Postgres via l'API, injectées dans la carte via `feature-state` MapLibre.

## Stack technique

- **Pipeline** : Python, pandas, geopandas/shapely, tippecanoe (tuiles vectorielles)
- **Backend** : FastAPI, SQLAlchemy, Postgres, Alembic
- **Frontend** : React 19, TypeScript, Vite, MapLibre GL JS, MUI
- **Déploiement** : Docker Compose, Caddy

## Lancer le projet en local

Prérequis : Docker, Docker Compose.

```bash
cp .env.example .env   # renseigner un mot de passe Postgres et un secret Umami
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d db backend caddy
```

L'app est servie sur `http://localhost`. Le GeoJSON/PMTiles de démonstration sont fournis dans `frontend/public/data/` ; pour régénérer les données depuis Hub'Eau/IGN ou peupler la base, voir `pipeline/`.

Pour le développement frontend avec rechargement à chaud :

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, proxy /api vers le backend
```

## Statut

Projet personnel, données mises à jour manuellement (pas de pipeline continu). Pas de couverture DROM pour l'instant, France métropolitaine uniquement.
