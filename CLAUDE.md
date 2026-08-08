# CLAUDE.md

Ce fichier donne le contexte du projet à Claude Code. Le lire en entier avant toute modification.

## Objectif du projet

Carte web interactive affichant la **dureté de l'eau (Titre Hydrotimétrique, TH)** par commune en France, sous forme de **choropleth**. Objectif à terme : plusieurs niveaux de zoom (commune → EPCI → département → région).

## Principe d'architecture : tout est statique (pas de backend applicatif, pas de DB)

Les données Hub'Eau sont mises à jour mensuellement — pas besoin d'infra temps réel. Le projet repose sur :

1. Un **pipeline Python offline** qui transforme les données brutes en fichiers statiques (GeoJSON / tuiles vectorielles MVT).
2. Un **frontend React + MapLibre GL JS** qui consomme ces fichiers statiques.
3. **Caddy** qui sert le frontend buildé et les fichiers statiques (GeoJSON/tuiles), avec les bons headers (compression, cache, CORS si besoin).
4. **Docker Compose** pour orchestrer le tout en local et en déploiement.

Ne pas introduire de base de données (PostGIS ou autre) ni de backend API sauf demande explicite — ce n'est pas nécessaire tant que les données sont pré-agrégées à la génération et mises à jour mensuellement. Si un besoin de requêtes dynamiques apparaît (recherche full-text, filtrage à la volée, données temps réel), en discuter avant d'implémenter.

## Structure du repo (état réel)

```
.
├── pipeline/                   # Pipeline Python offline (venv local : pipeline/.venv)
│   ├── src/
│   │   ├── download.py         # Résout l'URL via l'API data.gouv.fr, télécharge DIS-{year}.zip
│   │   ├── transform.py        # Filtre dureté (cdparametre=1345), agrège par commune -> CSV
│   │   ├── join_geo.py         # Extrait le gpkg IGN du 7z, joint contours + dureté -> GeoJSON
│   │   └── simplify.py         # Simplification via mapshaper (subprocess) -> GeoJSON allégé
│   │   # build_tiles.py (tuiles MVT via tippecanoe) : PAS encore écrit, prévu pour le multi-zoom
│   ├── data/
│   │   ├── raw/                # dis-2026.zip, ADMIN-EXPRESS-COG_*.7z (gitignored)
│   │   └── processed/          # CSV + GeoJSON régénérables (gitignored)
│   ├── requirements.txt        # pandas, geopandas, shapely, requests, py7zr
│   ├── requirements-dev.txt
│   ├── pyproject.toml          # config ruff uniquement (pas de packaging)
│   └── Dockerfile
├── frontend/                   # Vite + React 19 + TypeScript + MapLibre GL JS + MUI
│   ├── src/
│   │   ├── App.tsx             # ThemeProvider MUI + état unité, compose MapView et Legend
│   │   ├── MapView.tsx         # Carte MapLibre, couches choropleth, survol, popup
│   │   ├── MapPopup.tsx        # Carte de détail MUI (portail React dans le popup MapLibre)
│   │   ├── Legend.tsx          # Légende MUI + switch thème + switch d'unité
│   │   ├── hardness.ts         # Classes TH, rampe de couleurs, expression fill-color, contraste
│   │   ├── units.ts            # Unités (°f / ppm / °dH) et conversions
│   │   ├── format.ts           # formatDate (dd/mm/yyyy), à réutiliser pour toute date
│   │   └── theme.ts            # useColorMode : mode clair/sombre MUI, persisté en localStorage
│   ├── public/data/            # GeoJSON servi au frontend (gitignored, copié depuis le pipeline)
│   ├── vite.config.ts
│   └── Dockerfile              # Multi-stage : build Vite -> image Caddy
├── Caddyfile
├── docker-compose.yml          # service caddy + service pipeline (profil "tools", à la demande)
└── CLAUDE.md
```

## Stack technique détaillée

### Pipeline (Python)
- **pandas** : jointure/agrégation des fichiers PLV, RESULT, UDI_COM
- **geopandas** + **shapely** : jointure géométrie ↔ données, manipulation GeoJSON
- **mapshaper** (CLI, via subprocess/npx) ou `shapely.simplify` : simplification des contours
- **tippecanoe** (binaire, via subprocess) : génération de tuiles vectorielles MVT à partir du GeoJSON final, pour la V2 multi-zoom
- Sources de données :
  - Dureté : dataset "Résultats du contrôle sanitaire de l'eau distribuée commune par commune" (data.gouv.fr), archive nationale `dis-{année}.zip` (préférée à la variante `dis-{année}-dept.zip` : même volume, mais un seul téléchargement et un instantané cohérent). Contient 3 fichiers CSV séparés par des virgules, en **UTF-8** : `DIS_RESULT_{année}.txt` (~938 Mo), `DIS_PLV_{année}.txt` (~51 Mo), `DIS_COM_UDI_{année}.txt` (~4 Mo). Filtrer `cdparametre = 1345`. Jointure RESULT → PLV via `referenceprel`, PLV → COM_UDI via `cdreseau` pour obtenir `inseecommune`.
  - API Hub'Eau (`https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis`) : réservée aux requêtes ponctuelles (détail au clic sur une commune côté frontend), PAS pour le chargement en masse.
  - Contours communes : **IGN Admin Express COG** (retenu ; `france-geojson` écarté, dernier commit il y a 8 ans donc contours potentiellement obsolètes). Édition utilisée : `ADMIN-EXPRESS-COG_4-0__GPKG_LAMB93_FXX_2026-01-01.7z`, GeoPackage, **Lambert 93 (EPSG:2154)**, à reprojeter en EPSG:4326. Prendre la variante **COG** (alignée sur le COG INSEE), surtout pas CARTO/CARTOPLUS (DROM repositionnés artificiellement, incompatible avec une carte zoomable). Le gpkg contient les layers `commune` (34 746), `epci`, `departement`, `region` : tout est déjà là pour le multi-zoom.
  - Périmètre actuel : **France métropolitaine uniquement** (`FXX`). Les DROM nécessitent les packages IGN séparés ; les ajouter revient à concaténer les GeoDataFrames avant la jointure, sans changement d'architecture.
- Le pipeline tourne **offline / à la demande** (script manuel ou cron), pas en continu. Produit des fichiers versionnés dans `pipeline/data/processed/`, copiés ensuite vers `frontend/public/data/`.

### Frontend (React)
- **MapLibre GL JS v6** pour le rendu carte (WebGL, gère bien les gros volumes de polygones, contrairement à Leaflet)
- **Material UI v9** pour toute l'UI (panneaux, boutons, popup). Ne pas écrire de CSS custom ni de fichier `.css` : utiliser les composants MUI, `sx`, et `GlobalStyles` quand il faut neutraliser du style de librairie tierce.
- Source **GeoJSON directe** (fichier statique servi par Caddy), migration vers **vector tiles (MVT)** quand le multi-zoom sera implémenté
- Fond de carte : style vectoriel **OpenMapTiles via le flux Etalab** (`https://openmaptiles.geo.data.gouv.fr/styles/osm-bright/style.json`, pas de clé requise). Ne pas basculer sur IGN sans discussion (nécessite une clé Géoportail et est plus complexe à intégrer avec MapLibre).
- Coloration choropleth : expression MapLibre `step` sur `hardness_mean`, construite dans `hardness.ts`. Les bornes de classes sont stockées en °f et converties à l'affichage : changer d'unité ne doit jamais reclasser les communes.
- **Le fond de carte reste en mode jour**, quel que soit le thème des panneaux. Le mode sombre ne concerne que l'UI MUI (légende, futur bandeau).
- Pas de state management lourd (Redux etc.) sauf besoin avéré. L'état (unité, thème) vit dans `App.tsx` et descend en props.

#### Composants et responsabilités
- `MapView.tsx` : instancie la carte une seule fois (effet à dépendances vides), ajoute 3 couches sur la même source : `communes-fill` (choropleth), `communes-outline` (limites fines), `communes-hover` (contour épais piloté par `feature-state`). Gère le survol et positionne le popup.
- `MapPopup.tsx` : contenu du popup, rendu via `createPortal` dans le nœud DOM du popup MapLibre. Permet d'utiliser MUI (donc le thème) tout en gardant l'ancrage géographique de MapLibre.
- `Legend.tsx` : légende (couleur + libellé + plage), toggle de thème, et `ToggleButtonGroup exclusive` pour l'unité.
- `hardness.ts` : source de vérité des classes TH, de la rampe de couleurs, de la classification (`classifyHardness`) et du choix d'encre lisible (`contrastText`, calculé par luminance relative, pas codé en dur).
- `units.ts` : °f (stockage), ppm (×10), °dH (÷1.7848). Ajouter une unité = une entrée dans `HARDNESS_UNITS` + `UNIT_ORDER`.
- `format.ts` : `formatDate` en dd/mm/yyyy. Toute nouvelle date passe par là.

### Serveur (Caddy)
- Sert le build React (fichiers statiques) et les fichiers GeoJSON/tuiles depuis `frontend/public/data/` (ou un volume dédié)
- Configurer la compression (gzip/zstd) et le cache-control pour les fichiers géo (potentiellement volumineux)
- Pas de reverse proxy vers un backend applicatif dans ce projet (il n'y en a pas)

### Docker Compose
- Service `frontend-build` ou étape multi-stage dans le Dockerfile frontend : build React → sortie servie par Caddy
- Service `caddy` : sert les fichiers statiques (frontend build + data géo)
- Le pipeline Python n'est PAS un service qui tourne en continu — c'est soit un `docker compose run pipeline ...` ponctuel, soit exécuté hors compose. Ne pas le mettre en `depends_on` d'un service qui doit rester up.

## État actuel (mis à jour août 2026)

Ce qui tourne de bout en bout, sur les données 2026 :

1. `dis-2026.zip` et l'archive IGN sont déjà dans `pipeline/data/raw/` (téléchargés manuellement ; l'IGN n'expose pas d'URL stable scriptable, il faut passer par le formulaire de geoservices.ign.fr).
2. `transform.py` produit `durete_par_commune_2026.csv` : **34 782 communes**, colonnes `inseecommune, hardness_mean, sample_count, latest_sample`. Médiane nationale ~23,4 °f.
3. `join_geo.py` produit `communes_durete_2026.geojson` : **34 746 communes, 1,1 Go** (pleine résolution). Signale 104 communes sans mesure et 140 codes commune présents côté dureté mais absents des contours (fusions probables, non traitées pour l'instant).
4. `simplify.py` produit `communes_durete_2026_simplified.geojson` : **39,5 Mo (3,4 % de l'original), ~11 Mo gzippé**, 0 feature perdue.
5. Ce fichier est copié en `frontend/public/data/communes_durete.geojson` et consommé par la carte.

Non fait / connu : pas de tuiles MVT, pas de multi-zoom (EPCI/département/région), pas de DROM, pas de tests, rien n'est encore committé côté git. Valeur aberrante à investiguer : un max à 610 °f.

## Commandes utiles

```bash
# Pipeline (venv déjà créé dans pipeline/.venv)
cd pipeline
.venv/bin/python src/transform.py --year 2026     # ~1-2 min (lit 938 Mo de CSV)
.venv/bin/python src/join_geo.py --year 2026      # lent : reprojection de 34 746 polygones pleine résolution
.venv/bin/python src/simplify.py --year 2026      # mapshaper, options --percentage / --memory
cp data/processed/communes_durete_2026_simplified.geojson ../frontend/public/data/communes_durete.geojson

# Frontend
cd frontend
npm run dev          # http://localhost:5173
npx tsc -b           # typecheck seul
npm run build

# Docker
docker compose up -d caddy                        # http://localhost:8080
docker compose --profile tools build pipeline     # le pipeline est à la demande, pas un service permanent
```

## Pièges connus (déjà rencontrés, ne pas re-déboguer)

Environnement :
- WSL2 avec ~7 Go de RAM. `simplify.py` passe un plafond de heap explicite à `mapshaper-xl` (défaut 8 Go = swap garanti ici).
- Outils installés hors pip/npm : `docker.io`, `docker-compose-v2`, `tippecanoe`, `python3.12-venv`, `python3-pip` (via apt, nécessite le mot de passe utilisateur), `mapshaper` (via npm global).
- Pas de `unzip` ni de `7z` en ligne de commande : utiliser `zipfile` (stdlib) et `py7zr`.

Données :
- Inspecter les gros fichiers sans les charger : `zipfile.namelist()`, `pyogrio.list_layers()` / `read_info()`, `read_dataframe(..., max_features=3)`. Ne jamais lire un CSV/GeoJSON complet pour "voir à quoi il ressemble".
- `fiona` n'est pas installé : geopandas 1.x utilise **pyogrio**.
- Un mauvais `cdparametre` produit une carte crédible mais fausse. `transform.py` **vérifie que l'unité est bien °f** et lève sinon : garder ce garde-fou.

Frontend :
- `maplibre-gl` v6 n'a **pas d'export par défaut** : imports nommés (`Map as MapLibreMap`, etc.).
- Vite : `optimizeDeps.exclude: ['maplibre-gl']` est obligatoire, sinon le worker MapLibre n'est pas émis et le dev server casse. Si le cache est déjà pollué : `rm -rf node_modules/.vite`.
- MUI v9 : `Stack`/`Box` n'acceptent plus les props système (`alignItems`, `justifyContent`) en direct, tout passe par `sx`.
- Le survol exige des ids de features stables : la source GeoJSON utilise `promoteId: "code_insee"` pour que `setFeatureState` fonctionne.
- Le popup est en `pointer-events: none`, sinon il se place sous le curseur et fait clignoter le survol.
- La position du popup est mise à jour **impérativement** à chaque `mousemove` ; l'état React ne change que quand on entre dans une autre commune (sinon re-render continu).
- La rampe de bleus démarre volontairement à mi-échelle : les teintes les plus pâles se confondent avec la mer du fond de carte.

## Conventions de code

- Python : type hints partout, `pathlib` plutôt que manipulation de strings pour les chemins, pas de notebook dans le pipeline final (OK pour l'exploration, mais le pipeline livré doit être scriptable/reproductible)
- React : composants fonctionnels + hooks, **TypeScript** (le projet en utilise), pas de prop drilling excessif ; extraire un contexte pour l'état de la carte si la profondeur augmente
- Nommer clairement la distinction entre données **brutes** (raw, jamais modifiées) et **transformées** (processed, régénérables à tout moment par le pipeline) — ne jamais committer de données volumineuses transformées si elles sont régénérables

## Style de rédaction

- Jamais d'emojis, nulle part (code, commits, messages, UI).
- Jamais de tiret cadratin (—) ni demi-cadratin (–) dans le texte ou les commentaires ; utiliser une virgule, des parenthèses, ou reformuler la phrase.
- Code, docstrings et commentaires toujours en anglais, y compris les noms de variables/fonctions. La documentation projet (ce fichier, README) reste en français.

## Points d'attention métier (à ne pas casser)

- Le code paramètre SANDRE pour la dureté (Titre Hydrotimétrique, TH) est **1345**, unité **°f**. Vérifié dans les données SISE-Eaux : `cdparametre=1345`, `libmajparametre="TITRE HYDROTIMÉTRIQUE"`. Ne pas le confondre avec **1340 qui est les NITRATES (en NO3), en mg/L** (erreur présente dans une version antérieure de ce fichier).
- Les données Hub'Eau sont à la granularité **UDI (unité de distribution)**, pas directement commune. La jointure via `COM_UDI` est nécessaire, et une UDI peut couvrir plusieurs communes ou une commune plusieurs UDI. L'agrégation actuelle est une **moyenne** des mesures de la commune (lisse les écarts entre réseaux plutôt que d'en privilégier un).
- Les codes commune peuvent être obsolètes (fusions). Toujours vérifier la cohérence entre le référentiel géo (Admin Express COG) et les codes commune Hub'Eau ; `join_geo.py` fait un left join depuis les contours pour qu'une commune sans donnée reste visible, et logue les codes non appariés.
- Attribution obligatoire à OpenStreetMap avec le fond OpenMapTiles/Etalab (déjà en place via `customAttribution` dans `MapView.tsx`, ne pas la retirer).
- Les échelles d'unités (ppm, °dH...) sont de **simples conversions du °f**, pas d'autres mesures : il n'existe qu'un seul paramètre de dureté dans les données. Convertir à l'affichage, jamais reclasser.
- Les données ne couvrent qu'une année partielle (2026 = janvier à juin) ; le TH varie un peu avec la saison (dilution par les pluies). Pertinent si on compare des millésimes.

## Guidelines pour limiter la consommation de tokens

- **Préférer `grep`/`rg`/`find` en bash plutôt que de lire des fichiers entiers** pour localiser du code. N'ouvrir en lecture complète que le(s) fichier(s) réellement pertinent(s) une fois identifié(s).
- **Ne jamais lire les fichiers de données volumineux** (`pipeline/data/raw/*`, `*.geojson`, `*.mbtiles`, `*.csv` de PLV/RESULT/UDI_COM) en entier. Utiliser `head`, `wc -l`, ou des échantillons (`pandas.read_csv(..., nrows=5)`) pour inspecter leur structure.
- **Déléguer les tâches mécaniques/répétitives à un modèle plus léger** (Haiku) plutôt que Sonnet/Opus quand la tâche ne demande pas de raisonnement complexe : recherche de motif dans le code, listing de fichiers, résumé de logs, renommage en masse, vérifications de syntaxe simples. Réserver Sonnet/Opus aux tâches qui demandent de la conception, du debugging non trivial, ou des décisions d'architecture.
- **Éviter de faire relire l'intégralité d'un gros fichier après une petite modification** — utiliser des diffs ciblés (édition par patch/remplacement) plutôt que réécrire un fichier entier quand seule une portion change.
- **Ne pas dumper des réponses d'API volumineuses dans le contexte** (ex. réponse brute Hub'Eau ou GeoJSON complet) — extraire et n'afficher que les champs/lignes utiles au diagnostic en cours.
- **Résumer plutôt que citer** quand il s'agit de rendre compte d'un long fichier de logs, d'un stacktrace verbeux, ou d'une sortie de build — ne coller le détail brut que si c'est nécessaire pour comprendre une erreur précise.
- **Réutiliser les résultats déjà obtenus dans la session** (ex. structure d'un CSV déjà inspectée) plutôt que de relancer les mêmes commandes d'exploration plusieurs fois.
- **Pour les tâches de génération de code répétitives et bien cadrées** (ex. générer les mêmes composants React pour plusieurs types de couches carto, écrire des tests unitaires similaires), envisager de traiter par lot avec un prompt court et réutilisable plutôt que des allers-retours multiples.

## Ce que Claude Code ne doit PAS faire sans demande explicite

- Ajouter une base de données ou un backend API
- Remplacer MapLibre par Leaflet ou une autre lib carto
- Basculer le fond de carte sur IGN sans discussion (friction technique connue avec les clés Géoportail)
- Committer des fichiers de données bruts ou volumineux (> quelques Mo) dans le repo
