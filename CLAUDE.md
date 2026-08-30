# CLAUDE.md

Ce fichier donne le contexte du projet à Claude Code. Le lire en entier avant toute modification.

## Objectif du projet

Carte web interactive affichant des indicateurs de qualité de l'eau (dureté/TH, pH, nitrates, et d'autres à venir) par commune en France, sous forme de **choropleth** avec sélecteur de paramètre. Objectif à terme : plusieurs niveaux de zoom (commune → EPCI → département → région) sur la carte elle-même (l'agrégation multi-niveaux existe déjà côté API, pas encore côté rendu carte).

## Principe d'architecture : statique pour la géométrie, DB+API pour les valeurs

Le projet a évolué depuis la version initiale "tout statique". Architecture actuelle :

1. Un **pipeline Python offline** (`pipeline/`) qui télécharge/transforme les données Hub'Eau et IGN, et alimente deux sorties : des fichiers statiques (GeoJSON de contours, pour la géométrie et la recherche) et une base Postgres (pour les valeurs, interrogeables dynamiquement).
2. Un **backend FastAPI** (`backend/`) qui expose la base Postgres : agrégation par niveau de zoom, détail par commune, catalogue des paramètres. Introduit sur demande explicite (voir historique de discussion : le choix initial "tout statique" ne tenait plus avec le multi-paramètres).
3. Un **frontend React + MapLibre GL JS** qui consomme le GeoJSON pour la géométrie/recherche et l'API FastAPI pour les valeurs (injectées via `feature-state` MapLibre, pas des propriétés GeoJSON figées).
4. **Caddy** qui sert le frontend buildé, les fichiers statiques, et fait reverse-proxy vers le backend sous `/api/*`.
5. **Docker Compose** pour orchestrer `db` (Postgres), `backend`, `caddy`, et `pipeline` (à la demande) en local et en déploiement.

La géométrie ne va PAS dans Postgres (pas de PostGIS) : elle reste dans des fichiers statiques/tuiles, générés par le pipeline. Postgres ne contient que la hiérarchie administrative (pour les jointures d'agrégation) et les mesures.

## Structure du repo (état réel)

```
.
├── pipeline/                   # Pipeline Python offline (venv local : pipeline/.venv)
│   ├── src/
│   │   ├── download.py         # Résout l'URL via l'API data.gouv.fr, télécharge DIS-{year}.zip
│   │   ├── transform.py        # Filtre un paramètre (filter_parameter), jointure commune, remap codes obsolètes, agrège -> CSV (dureté uniquement, pour le GeoJSON)
│   │   ├── join_geo.py         # Extrait le gpkg IGN du 7z, joint contours + dureté -> GeoJSON
│   │   ├── simplify.py         # Simplification via mapshaper (subprocess) -> GeoJSON allégé
│   │   └── seed_db.py          # Seed Postgres : hiérarchie admin + mesures multi-paramètres, multi-années (--year accepte plusieurs années, chaque mesure taguée mesure.annee)
│   │   # build_tiles.py (tuiles MVT via tippecanoe) : PAS encore écrit, prévu pour le multi-zoom carte
│   ├── data/
│   │   ├── raw/                # dis-2026.zip, ADMIN-EXPRESS-COG_*.7z, cog_ensemble_2026_csv.zip (gitignored)
│   │   └── processed/          # CSV + GeoJSON régénérables (gitignored)
│   ├── requirements.txt        # pandas, geopandas, shapely, requests, py7zr, sqlalchemy, psycopg
│   ├── pyproject.toml          # config ruff uniquement (pas de packaging)
│   └── Dockerfile
├── backend/                     # API FastAPI (Poetry, venv local : backend/.venv)
│   ├── src/
│   │   ├── main.py             # App FastAPI, root_path="/api" (Caddy strip le prefixe avant de proxy-er)
│   │   ├── settings.py         # Config (DATABASE_URL) via pydantic-settings
│   │   ├── db.py               # Engine SQLAlchemy + get_session (dependency FastAPI)
│   │   ├── models.py           # ORM : region/departement/epci/commune/parametre/reseau/mesure + commune_valeur (cache d'agrégation)
│   │   ├── deps.py             # get_parametre (resout ?parametre=code -> objet Parametre ou 404)
│   │   ├── schemas.py          # Pydantic : ParametreOut, AggregationOut, MesureOut, CommuneOut
│   │   └── routers/
│   │       ├── parametres.py   # GET /parametres
│   │       ├── annees.py       # GET /annees (distinct sur commune_valeur.annee, mémoïsé par process : ticks du slider timeline)
│   │       ├── aggregation.py  # GET /aggregation/{commune|epci|departement|region}?parametre=code[&annee=YYYY] (lit commune_valeur, pas mesure)
│   │       └── communes.py     # GET /communes/{code_insee}, GET /communes/{code_insee}/mesures?parametre=code[&annee=YYYY]
│   ├── migrations/              # Alembic (env.py branche sur settings.database_url et models.Base.metadata)
│   ├── alembic.ini
│   ├── pyproject.toml           # Poetry : fastapi, uvicorn, sqlalchemy, psycopg, alembic, pydantic-settings
│   └── Dockerfile                # poetry install --no-root --only main, puis alembic upgrade head && uvicorn au démarrage
├── frontend/                   # Vite + React 19 + TypeScript + MapLibre GL JS + MUI v9 (+ MUI X DataGrid v9)
│   ├── src/
│   │   ├── App.tsx             # Etat parametre/unite/theme/commune selectionnee, compose TopBar/MapView/Legend/CommunePanel
│   │   ├── TopBar.tsx          # Titre + recherche commune (Autocomplete) + selecteur de parametre (Select icone+libelle)
│   │   ├── MapView.tsx         # Carte MapLibre, couches choropleth pilotees par feature-state, survol, popup, clic
│   │   ├── MapPopup.tsx        # Carte de detail MUI au survol (portail React dans le popup MapLibre)
│   │   ├── CommunePanel.tsx    # Panneau au clic/recherche : resume + DataGrid des releves (fetch API)
│   │   ├── Legend.tsx          # Legende (classes + plages du parametre actif) + switch unite + switch theme
│   │   ├── Timeline.tsx        # Slider année (haut-centre carte), un tick par année de /annees, snap only ; masqué si une seule année seedée
│   │   ├── parameters.ts       # Registre PARAMETERS (durete/ph/nitrates) : classes de couleur, unites, expression fill-color
│   │   ├── units.ts            # Types/convertisseurs generiques (Unit, formatValue...), plus specifique a la durete
│   │   ├── communes.ts         # Index commune (nom/code/bbox) charge une fois depuis le GeoJSON, pour la recherche
│   │   ├── api.ts              # Client fetch vers /api (fetchAggregation, fetchCommuneMesures)
│   │   ├── format.ts           # formatDate (dd/mm/yyyy), a reutiliser pour toute date
│   │   └── theme.ts            # useColorMode : mode clair/sombre MUI, persiste en localStorage
│   ├── public/data/            # GeoJSON servi au frontend (gitignored, copie depuis le pipeline)
│   ├── vite.config.ts          # server.proxy /api -> localhost:8000 (dev) + plugin custom qui copie le worker maplibre-gl (voir Pieges connus)
│   └── Dockerfile              # Multi-stage : build Vite -> image Caddy
├── Caddyfile                    # /api/* -> reverse_proxy backend:8000 (handle_path, dans un bloc handle{} explicite), sinon SPA statique
├── docker-compose.yml           # services db (Postgres), backend, caddy, pipeline (profil "tools")
└── CLAUDE.md
```

## Stack technique détaillée

### Pipeline (Python)
- **pandas** : jointure/agrégation des fichiers PLV, RESULT, UDI_COM
- **geopandas** + **shapely** : jointure géométrie ↔ données, manipulation GeoJSON
- **mapshaper** (CLI, via subprocess/npx) ou `shapely.simplify` : simplification des contours
- **sqlalchemy** + **psycopg** : seed de la base Postgres depuis `seed_db.py` (importe les modèles ORM directement depuis `backend/src/models.py` via `sys.path.insert`, pour ne pas dupliquer le schéma)
- **tippecanoe** (binaire, via subprocess) : génération de tuiles vectorielles MVT à partir du GeoJSON final, pour la V2 multi-zoom carte (pas encore fait)
- Sources de données :
  - Hub'Eau, dataset "Résultats du contrôle sanitaire de l'eau distribuée commune par commune" (data.gouv.fr), archive nationale `dis-{année}.zip`. Contient 3 fichiers CSV UTF-8 : `DIS_RESULT_{année}.txt` (~938 Mo), `DIS_PLV_{année}.txt` (~51 Mo), `DIS_COM_UDI_{année}.txt` (~4 Mo). Jointure RESULT → PLV via `referenceprel`, PLV → COM_UDI via `cdreseau` pour obtenir `inseecommune`.
  - **INSEE, table des mouvements de communes** (`cog_ensemble_{année}_csv.zip`, fichier `v_mvt_commune_{année}.csv`) : nécessaire pour remapper les codes commune obsolètes que Hub'Eau utilise encore après une fusion (voir Pièges connus). Téléchargé manuellement comme le reste, dans `pipeline/data/raw/`.
  - API Hub'Eau (`https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis`) : réservée aux requêtes ponctuelles, PAS pour le chargement en masse.
  - Contours communes : **IGN Admin Express COG**, `ADMIN-EXPRESS-COG_4-0__GPKG_LAMB93_FXX_2026-01-01.7z`, GeoPackage, Lambert 93 (EPSG:2154), reprojeté en EPSG:4326. Layers `commune` (34 746), `epci`, `departement`, `region` : tous utilisés (le GeoJSON carte n'utilise que `commune`, mais `seed_db.py` charge les quatre pour peupler la hiérarchie Postgres).
  - Périmètre actuel : **France métropolitaine uniquement** (`FXX`).
- Deux sorties distinctes, générées par des chemins de code différents :
  - **CSV/GeoJSON dureté uniquement** (`transform.py` + `join_geo.py` + `simplify.py`), pour la géométrie et l'index de recherche du frontend. N'a pas besoin d'être multi-paramètres puisqu'il ne sert plus à afficher les valeurs.
  - **Base Postgres multi-paramètres** (`seed_db.py`), pour toutes les valeurs affichées (choropleth, popup, panneau de détail).
- Le pipeline tourne **offline / à la demande**, pas en continu.

### Backend (FastAPI)
- **Modèle relationnel** (`backend/src/models.py`) : `region` / `departement` / `epci` / `commune` (hiérarchie admin, sans géométrie) + `parametre` (catalogue, `code`/`cdparametre_sandre`/`unite`) + `reseau` (UDI) + `mesure` (grain = une ligne par mesure individuelle, FK vers `parametre`/`commune`/`reseau`, contrainte d'unicité `(referenceprel, parametre_id, code_insee)`, colonne `annee` = année de l'archive Hub'Eau source, index composite `(parametre_id, annee)`).
- **Axe temporel** : une archive `dis-{annee}.zip` = une année civile de prélèvements (l'archive de l'année en cours est partielle). Le choropleth affiche **une seule année à la fois** (jamais une moyenne inter-années), pilotée par `?annee=` sur les endpoints d'agrégation/mesures et par le slider `Timeline.tsx`. `?annee=` omis = toutes années confondues (utile pour du debug, l'UI passe toujours une année explicite).
- Ajouter un paramètre = une ligne dans `parametre` + des lignes dans `mesure` (+ la ligne correspondante recalculée dans `commune_valeur` au prochain seed), **zéro migration**.
- **Cache d'agrégation `commune_valeur`** (table dérivée, une ligne par `(parametre_id, annee, code_insee)` : `valeur_somme` / `nb_mesures` / `derniere_mesure`). Recalculée intégralement à chaque seed depuis `mesure` (`seed_db.populate_commune_valeur`, un `GROUP BY` par `parametre_id` pour tenir la RAM du box WSL). `mesure` reste la source de vérité et la source du panneau de détail ; `commune_valeur` n'existe que parce qu'un `GROUP BY` live sur ~114M lignes `mesure` mettait 8 s (24 s pour `/annees`) sur ce box (35 Go de table, 8 Go de RAM). Après cache : ~0,4 s au niveau commune, instantané ailleurs.
- Agrégation à n'importe quel niveau de zoom = `commune_valeur -> JOIN commune -> [epci|departement|(departement->region)]` + `GROUP BY`. Le rollup EPCI/dept/région est `SUM(valeur_somme) / SUM(nb_mesures)` : exactement la moyenne poolée sur les mesures individuelles qu'un `AVG(mesure.valeur)` direct donnerait (pas une moyenne de moyennes communales), vérifié au chiffre près.
- Index sur les colonnes de jointure/filtre (`mesure.code_insee`, `mesure.parametre_id`, `commune.code_departement`, `commune.code_epci`, `departement.code_region`).
- `root_path="/api"` sur l'app FastAPI : nécessaire pour que Swagger (`/api/docs`) génère les bonnes URLs, puisque Caddy strip `/api` avant de transmettre la requête (le backend ne sait pas qu'il est monté sous ce préfixe sans cette config).
- Alembic pointe sur `models.Base.metadata` et `settings.database_url`, donc `--autogenerate` fonctionne directement contre les modèles.

### Frontend (React)
- **MapLibre GL JS v6** pour le rendu carte.
- **Material UI v9** + **MUI X DataGrid v9** (v8 de DataGrid ne supportait pas MUI v9, migration faite dans cette session). Pas de CSS custom, tout passe par `sx`/`GlobalStyles`.
- Géométrie : **GeoJSON statique** (`communes_durete.geojson`, nom historique mais sert pour tous les paramètres désormais : il ne contient plus que `code_insee`/`nom_officiel`/géométrie, pas de valeurs).
- Valeurs : fetch de `/api/aggregation/commune?parametre=<code>&annee=<YYYY>` (au chargement, puis à chaque changement de paramètre / niveau / année), injectées dans MapLibre via `setFeatureState` sur toutes les communes connues (celles absentes de la réponse API reçoivent `value: null` explicitement, pour ne pas garder l'ancienne valeur affichée). `fetchAggregation` a un cache module `(niveau, parametre, annee) -> réponse` pour que le va-et-vient sur le slider timeline soit instantané.
- Année : `App.tsx` fetch `/annees` une fois au montage, part sur `2026` (fallback) puis se cale sur l'année la plus récente disponible. `Timeline.tsx` n'est rendu que s'il y a au moins deux années.
- Fond de carte : **OpenMapTiles via le flux Etalab**, pas de clé requise. Reste en mode jour quel que soit le thème MUI.
- Coloration choropleth : expression MapLibre `step` sur `["feature-state", "value"]` (pas `["get", ...]`), construite par `buildFillColorExpression()` dans `parameters.ts` à partir des classes du paramètre actif.
- Chaque paramètre a ses propres classes de couleur dans `parameters.ts` : **séquentielle** pour dureté et nitrates (une extrémité = préoccupant), **divergente** pour le pH (centrée sur la neutralité, deux extrémités = préoccupantes, bornes réglementaires françaises 6,5/9).
- Pas de state management lourd. L'état (paramètre, unité, thème, commune sélectionnée) vit dans `App.tsx` et descend en props.

#### Composants et responsabilités
- `MapView.tsx` : instancie la carte une fois. Couches sur la source `communes` : `communes-fill` (choropleth via feature-state), `communes-outline`, `communes-hover`, `communes-selected` (contour noir, commune sélectionnée via recherche/clic). `applyAggregation()` fait le fetch + la passe `setFeatureState` complète à chaque changement de paramètre. Le clic résout la commune via un index `code -> CommuneSummary` construit depuis `communes.ts`.
- `TopBar.tsx` : recherche (`Autocomplete` MUI, limité à 50 résultats par frappe) + sélecteur de paramètre (`Select` avec icône + libellé par paramètre, remplace l'ancien `ToggleButtonGroup` qui était dans `Legend.tsx`).
- `CommunePanel.tsx` : résumé (moyenne/nb mesures/dernière date) calculé **côté client** à partir des relevés déjà fetchés pour le tableau (pas un second appel API), donc générique à n'importe quel paramètre. Tableau via `DataGrid` (density compact, `rowHeight`/`columnHeaderHeight` réduits, footer réduit via `sx` ciblant les classes `MuiDataGrid-footerContainer`/`MuiTablePagination-*`).
- `Legend.tsx` : classes + plages du paramètre actif (converties dans l'unité choisie), switch d'unité (masqué si le paramètre n'a qu'une seule unité, ex. pH/nitrates), switch de thème. Le switch de paramètre a été retiré d'ici et déplacé dans `TopBar.tsx`.
- `parameters.ts` : `PARAMETERS: Record<ParameterId, ParameterDef>`, `PARAMETER_ORDER`, `classifyValue`, `buildFillColorExpression`, `contrastText`, `formatRange`. Source de vérité pour tout ce qui distingue un paramètre d'un autre.
- `units.ts` : générique (`Unit`, `convertFromBase`, `formatValue`, `formatValueWithUnit`), ne connaît aucun paramètre spécifique. Les registres d'unités par paramètre vivent dans `parameters.ts`.
- `api.ts` : `fetchAggregation(niveau, parametre)`, `fetchCommuneMesures(codeInsee, parametre)`.

### Serveur (Caddy)
- Sert le build React, les fichiers GeoJSON/tuiles, et reverse-proxy `/api/*` vers `backend:8000`.
- **`handle_path /api/*` doit être dans un bloc `handle {}` explicite** avec le reste (voir Pièges connus) : sans ça, `try_files` intercepte tout avant que `handle_path` s'applique, à cause de l'ordre de priorité par défaut des directives Caddy (indépendant de l'ordre textuel dans le fichier).

### Docker Compose
- `db` : Postgres 17, volume nommé `db-data`, healthcheck `pg_isready`, port 5432 exposé sur l'hôte (pratique pour Alembic/scripts locaux).
- `backend` : build `./backend`, `DATABASE_URL` pointant sur `db`, port 8000 exposé sur l'hôte (pour que `npm run dev` en local, hors docker, puisse le proxy-er via `vite.config.ts`), `depends_on: db (condition: service_healthy)`. Migrations Alembic appliquées automatiquement au démarrage du conteneur.
- `caddy` : sert le frontend + proxy vers `backend`.
- `pipeline` : PAS un service permanent, `docker compose run --rm pipeline ...` ponctuel, profil `tools`.

## État actuel (mis à jour août 2026)

Ce qui tourne de bout en bout, sur les données 2026 :

1. Pipeline CSV/GeoJSON (dureté, pour la carte) : `transform.py` -> `join_geo.py` -> `simplify.py` -> copie dans `frontend/public/data/communes_durete.geojson` (39,5 Mo). **34 746 communes**, dont 81 sans mesure de dureté (contre 104 avant les correctifs de codes obsolètes/fallback PLV appliqués cette session).
2. Base Postgres (`seed_db.py`) : 13 régions, 96 départements, 1241 EPCI, 34 746 communes, ~24 442 réseaux, **~114,5M mesures** (`mesure`, 35 Go) sur les **24 paramètres** de `PARAMETERS` (durete/ph/nitrates/conductivite/turbidite/chlore_libre/chlorures/sulfates/calcium/magnesium/fer/aluminium/manganese/sodium/potassium/fluorures/bore/ecoli/plomb/cuivre/arsenic/bisphenol_a/thm/pesticides), plus le cache `commune_valeur` (~7,6M lignes, 736 Mo).
3. API FastAPI opérationnelle : `/parametres`, `/annees`, `/aggregation/{commune|epci|departement|region}?parametre=code[&annee=YYYY]`, `/aggregation/{niveau}/{code}/communes` (détail d'une zone), `/communes/{code_insee}`, `/communes/{code_insee}/mesures?parametre=code[&annee=YYYY]`, `/health`, Swagger sur `/api/docs`.
4. Frontend : carte + légende + recherche + panneau de détail + slider timeline (en bas de la carte), tous branchés sur les paramètres via le sélecteur dans la TopBar.

Axe temporel : schéma + API + UI multi-années en place (colonne `mesure.annee`, `/annees`, `Timeline.tsx`). **2016 à 2026 seedées en local** (~114,5M mesures, 2026 étant une demi-année). Archives `dis-2016.zip` à `dis-2026.zip` et `cog_ensemble_2020..2026` dans `pipeline/data/raw/` (le `ADMIN-EXPRESS-COG*.7z` IGN et `dis-*.zip` sont gitignored et re-téléchargeables : `download.py --year YYYY` pour les DIS, URL directe `data.geopf.fr/telechargement/download/ADMIN-EXPRESS-COG/...` pour le 7z IGN, ~228 Mo). `seed_db.py --year ...` fait toujours un TRUNCATE + reload complet en **une transaction** (crash en cours de route = rollback propre, base vide, pas d'état partiel), donc passer toutes les années voulues en un seul run.

Non fait / connu : pas de tuiles MVT, pas de multi-zoom sur la carte elle-même (l'API le permet déjà), pas de DROM, pas de tests. Le cache d'agrégation `commune_valeur` **existe** désormais (mesuré nécessaire : voir plus haut). Valeur aberrante connue côté dureté : un max à 610 °f, non investiguée.

Pour ajouter un nouveau paramètre (ex. bactériologie, plomb) : voir la discussion archivée sur les indicateurs candidats (nitrates/pH/pesticides faciles, bactériologie nécessite un mode d'agrégation différent — taux de conformité plutôt que moyenne, car les valeurs sont quasi binaires présence/absence).

## Réflexions en attente (à rediscuter avant implémentation)

**Pertinence statistique de la moyenne aux niveaux EPCI/département/région.** La moyenne actuelle (`AVG` SQL sur les mesures individuelles, pas une moyenne de moyennes par commune) peut masquer une forte hétérogénéité intra-niveau : un département moitié eau très douce, moitié eau très dure, affiche "moyen" sans représenter aucune des deux réalités. Pour la dureté (paramètre informatif, pas de seuil réglementaire), une moyenne reste défendable. Pour le pH et les nitrates (paramètres à seuil réglementaire), c'est plus problématique : une moyenne dans les clous peut cacher des communes hors norme, le même raisonnement que celui déjà retenu pour la bactériologie (voir paragraphe ci-dessus) s'applique, dans une moindre mesure, à tout paramètre à seuil.

Pistes envisagées, par ordre de coût croissant :
1. Ajouter min/max (voire écart-type) à la réponse d'agrégation existante (un `func.min`/`func.max` SQL en plus, pas de migration) et les afficher dans le popup/tooltip aux niveaux non-commune, pour signaler que le chiffre affiché masque de la variation, sans changer la statistique elle-même.
2. Pour pH/nitrates spécifiquement, calculer un taux de conformité (part des mesures ou des communes hors seuil réglementaire) plutôt que ou en complément de la moyenne. Change la sémantique de l'agrégation, probablement une colonne ou un endpoint séparé plutôt qu'un ajout mineur.

Piste 1 recommandée comme premier pas si le sujet est repris : coût faible, ne nécessite pas de trancher sur "la bonne" statistique, et communique déjà l'essentiel (le chiffre est une moyenne sur un ensemble hétérogène).

**Niveau de zoom UDI (unité de distribution) sur la carte, en plus de commune/EPCI/dept/région.** Ce serait le meilleur asset possible : l'UDI est la granularité réelle des prélèvements Hub'Eau, un niveau UDI afficherait la qualité de l'eau distribuée sans le lissage inter-réseaux que l'agrégation commune introduit (le point soulevé juste au-dessus). Techniquement pas lourd côté données : l'UDI est **orthogonale** à la chaîne commune -> EPCI -> dept -> région (pas un cran de plus dessus), donc il faut un cache parallèle `reseau_valeur` `(parametre_id, annee, cdreseau) -> valeur_somme/nb_mesures/derniere_mesure` (miroir exact de `commune_valeur`, peuplé pareil dans `seed_db.py` en agrégeant `mesure` directement par `cdreseau`) + un chemin dédié dans `aggregation.py` pour `niveau=udi` qui lit ce cache sans jointure hiérarchie. Caveat : `mesure.cdreseau` est nullable (les lignes de fallback PLV via `inseecommuneprinc` n'ont pas de réseau), une part des mesures ne peut pas être placée sur une UDI.
**Bloqueur = la géométrie.** Le contour des UDI n'est pas librement diffusable : le seul jeu national identifié (atlasante.fr, "DGS Métropole UDI 2023", `4e35f55a-e09f-4f92-9428-1d8c8ddc9c14`) est en **accès restreint** ("données sensibles pour la sécurité publique, ayants droit uniquement après signature d'une convention"), couvre 10 régions métro sur 13 d'après la fiche, millésime 2023, et pas de table de mouvements des `cdreseau` (les UDI bougent plus que les communes, donc les années anciennes seraient très trouées au niveau UDI). Reprendre le sujet si une source de contours UDI redistribuable apparaît (certaines ARS publient la leur en open data pour leur région).

**Idée de classement général, toutes communes confondues sur tous les paramètres (`Leaderboard.tsx`).** Actuellement le classement est par paramètre (un seul `apiCode` à la fois). Idée soumise : un classement composite, une seule note par commune combinant tous les paramètres présents, pour répondre à "quelle commune a la meilleure eau, tout confondu".

Deux difficultés avant de s'y lancer, pas juste un choix d'implémentation :
- Les paramètres actuels ne sont pas tous comparables sur l'axe "meilleur/moins bon" de la même façon. Nitrates/turbidité/chlore libre sont des paramètres de qualité/santé à sens unique (plus bas = mieux, dans les limites du raisonnable). Le pH et la conductivité sont divergents (un extrême dans un sens ou l'autre est hors norme, le centre est le mieux). La dureté, elle, n'a pas de seuil réglementaire ni de "mieux" objectif : c'est une préférence (eau douce ou dure ont chacune leurs inconvénients, entartrage vs corrosion). Recommandation si le sujet est repris : composer le score sur les paramètres à seuil réglementaire (pH, nitrates, conductivité, turbidité, chlore libre), laisser la dureté hors du score composite ou l'afficher à part, plutôt que de l'agréger avec les autres comme si "plus doux" était toujours "mieux".
- Couverture inégale : toutes les communes n'ont pas de mesure pour tous les paramètres (voir la répartition dans "État actuel"). Un score composite doit décider quoi faire d'une commune avec seulement 2 paramètres sur 5 mesurés : l'exclure, la noter sur les seuls paramètres disponibles (au risque de favoriser les communes les moins mesurées), ou exiger une couverture minimale avant de l'inclure au classement.

Piste de mise en oeuvre si retenu : convertir chaque valeur en index de classe (`classifyValue`, déjà utilisé pour la couleur choropleth) plutôt qu'en score brut, ça évite d'avoir à normaliser des unités hétérogènes (°f, mg/L, µS/cm, NFU) et donne directement une échelle commune (0 = meilleure classe, 4 = pire) à moyenner ou sommer.

**Pass de refonte visuelle "premium" (en cours, par sections).** Objectif : sortir l'app du rendu "MUI par défaut + MapLibre par défaut". Sections déjà faites : (1) couleurs et thème (palette teal custom, neutres teintés, échelle d'ombres douce, bordures hairline, tokens de rayon/typo dans `theme.ts`), (3) typographie (Inter auto-hébergé via `@fontsource-variable/inter`, échelle typo explicite, chiffres tabulaires globaux, ripple désactivé globalement), (4) layout/espacement (`PanelStates.tsx` avec `PanelSkeleton`/`EmptyState`, skeletons au lieu de spinners, en-tête collant dans `CommunePanel`). Sections restantes non faites :

- **Section 2, la carte elle-même** (plus grosse surface visuelle encore "par défaut") :
  - Fond de carte tamisé : forker le style JSON Etalab/OpenMapTiles et atténuer les couches routes/labels (moins de bruit, terres/eau désaturées) pour faire ressortir le choropleth. Ne PAS basculer sur IGN (friction clés Géoportail, déjà tranché).
  - Auditer et lisser les rampes de couleur dans `parameters.ts` contre une référence perceptuellement uniforme (ColorBrewer/CARTO/viridis) : garder séquentiel pour dureté/nitrates, divergent pour pH (voir "Points d'attention métier").
  - Survol/sélection : liseré blanc + halo léger, transition animée `fill-color-transition`, easing sur le `flyTo`.
  - Restyler les contrôles MapLibre (zoom, attribution) pour matcher les panneaux MUI (même rayon, même fond, même ombre). Ne pas retirer l'attribution OpenStreetMap.
- **Section 5, animation** : micro-transitions (slide-in des panneaux, easing du collapse de légende, crossfade au changement de paramètre sur la carte), un seul token de courbe d'easing partagé, réserver l'espace pour le contenu async pour éviter le jank.
- **Section 6, détails** : vrai jeu de favicon + `<title>` par vue + meta/OG, scrollbars custom themées dans les panneaux, focus-visible aux couleurs de la marque, panneau "À propos / sources" (Hub'Eau, IGN, caveat année partielle 2026).

## Commandes utiles

```bash
# Pipeline (venv déjà créé dans pipeline/.venv)
cd pipeline
.venv/bin/python src/transform.py --year 2026     # CSV dureté seul, pour le GeoJSON
.venv/bin/python src/join_geo.py --year 2026      # lent : reprojection de 34 746 polygones
.venv/bin/python src/simplify.py --year 2026      # mapshaper
cp data/processed/communes_durete_2026_simplified.geojson ../frontend/public/data/communes_durete.geojson
.venv/bin/python src/seed_db.py --year 2026            # seed Postgres, tous paramètres de PARAMETERS, idempotent (TRUNCATE + reload)
.venv/bin/python src/seed_db.py --year 2024 2025 2026  # plusieurs années à la fois (chaque année = une position du slider timeline) ; toujours un TRUNCATE + reload complet, donc passer toutes les années voulues à chaque run

# Backend (Poetry, venv dans backend/.venv)
cd backend
export PATH="$HOME/.local/bin:$PATH"   # poetry installe via pip --user
poetry install
poetry run alembic revision --autogenerate -m "..."
poetry run alembic upgrade head
poetry run uvicorn main:app --app-dir src --reload --port 8000

# Frontend
cd frontend
npm run dev          # http://localhost:5173, proxy /api -> localhost:8000 (voir vite.config.ts)
npx tsc -b           # typecheck seul
npm run lint         # oxlint
npm run build

# Docker (stack complete)
docker compose up -d db backend caddy             # http://localhost:8080
docker compose --profile tools run --rm pipeline src/seed_db.py --year 2026   # pas de "python" : ENTRYPOINT du Dockerfile pipeline le fournit deja
```

## Déploiement sur la VM Oracle (ondine-vm)

Une instance Oracle Cloud (`VM.Standard.A1.Flex`, 2 OCPU/12 Go, Ubuntu, région `eu-marseille-1`) héberge une copie de la stack complète, créée via le workflow GitHub Actions `.github/workflows/oci-capacity-retry.yml` (déclenché manuellement désormais, le `schedule` cron a été retiré une fois l'instance obtenue : OCI Free Tier a régulièrement une pénurie de capacité A1.Flex, d'où le pattern retry).

- Accès SSH : alias `ondine` dans `~/.ssh/config` (`Host ondine`, `HostName <ip publique>`, `User ubuntu`, `IdentityFile ~/.ssh/id_ed25519`). `ssh ondine` suffit.
- La stack tourne dans `~/ondine` sur la VM, lancée avec `docker compose up -d db backend caddy` comme en local. Caddy écoute sur le port hôte **8080** (pas 80), convention reprise de l'usage local.
- Deux couches de pare-feu à ouvrir pour un port publiquement accessible, **les deux sont nécessaires** :
  1. iptables sur la VM elle-même (images Ubuntu Oracle avec un jeu de règles restrictif par défaut, `FORWARD` en `DROP` par défaut pour le trafic Docker-NAT). Insérer la règle ACCEPT **avant** la règle `REJECT` catch-all (repérer son numéro de ligne avec `sudo iptables -L INPUT -n --line-numbers`, insérer juste avant), puis `sudo netfilter-persistent save` pour la rendre persistante au reboot.
  2. La security list OCI (niveau cloud, en amont d'iptables) : n'autorise par défaut que 22/80/443 en ingress. Ajouter une règle TCP pour le port utilisé (8080 ici) via la console (Networking > VCN > Security Lists > Add Ingress Rules) ou `oci network security-list update --security-list-id <id> --ingress-security-rules '[...]'`. **Modifier une security list est une action infra partagée, sensible : demander confirmation avant de le faire par CLI, la console est plus sûre et plus transparente pour l'utilisateur.**
- Le repo étant privé, cloner sur la VM nécessite une **deploy key** générée sur place (`ssh-keygen` sur la VM, clé publique ajoutée dans GitHub Settings > Deploy keys, lecture seule) plutôt que copier une clé personnelle sur la VM ou utiliser un PAT large.
- Le GeoJSON (`frontend/public/data/communes_durete.geojson`) est gitignored : le copier séparément sur la VM (`scp`) avant le build du frontend, sinon la carte n'a pas de géométrie.

### Seeder la base Postgres de la VM (depuis le poste local, sans copier les données brutes sur la VM)

Les données brutes (`pipeline/data/raw/`, ~1 Go) restent en local. Plutôt que de les transférer sur la VM pour y lancer le pipeline, on tunnelise le port Postgres de la VM et on lance `seed_db.py` localement contre ce tunnel :

```bash
# 1. tunnel SSH vers le Postgres de la VM (port local 5433 -> port distant 5432)
ssh -f -N -L 5433:localhost:5432 ondine

# 2. seed depuis le pipeline local, DATABASE_URL pointe sur le tunnel
cd pipeline
DATABASE_URL=postgresql+psycopg://ondine:ondine@localhost:5433/ondine .venv/bin/python src/seed_db.py --year 2026

# 3. fermer le tunnel une fois termine
pkill -f "ssh -f -N -L 5433:localhost:5432 ondine"
```

`seed_db.py` est idempotent (TRUNCATE + reload), donc relancer la commande en cas de problème ne duplique rien. Le job traite ~5,4M lignes (24 paramètres) par année en ~2-3 min : compter ~N fois ça pour `--year` avec N années (les années sont traitées séquentiellement, une seule archive RESULT résidente à la fois). Le lancer en arrière-plan plutôt que d'attendre en bloquant le terminal.

Optimisations en place dans le chemin CSV -> Postgres (le seed était ~14 min avant, ~2,5 min après, l'INSERT ORM ligne par ligne pesait 90% du temps) :
- `transform.load_hubeau_tables` ne parse que les colonnes utiles (`RESULT_USECOLS` etc.), pas les 17 colonnes du fichier RESULT.
- `seed_db.main` pré-filtre RESULT sur les codes SANDRE monitorés une seule fois avant la boucle par paramètre.
- `copy_mesures` : chargement de la table `mesure` via `COPY ... FORMAT csv` Postgres (buffer CSV sérialisé par pandas en C, curseur psycopg brut dans la transaction de la session), pas `insert(Mesure)` chunké ligne par ligne. En CSV un champ vide = NULL, donc les colonnes nullables (cdreseau/conclusion/date_prel) n'ont pas besoin de traitement NaN.
- `drop_mesure_indexes` : drop des index secondaires + contrainte unique + FK de `mesure` avant le load, rebuild après (DDL réfléchie via `pg_get_constraintdef`/`pg_indexes`). Justifié car le load est un TRUNCATE + reload complet de données déjà dédupliquées côté pandas.
- `SET LOCAL synchronous_commit = off` + `maintenance_work_mem = '256MB'` sur la transaction de load (portée session, pas une config serveur).

Vérifier après coup que la base a bien des données (pas juste le schéma migré à vide) :
```bash
ssh ondine "curl -s http://localhost:8080/api/parametres"                                    # doit lister les parametres, pas []
ssh ondine "curl -s 'http://localhost:8080/api/aggregation/commune?parametre=durete'" | head  # doit renvoyer des lignes, pas 404 "Parametre inconnu"
```
Un `/parametres` vide ou un 404 `Parametre inconnu` sur `/aggregation` signifie une base migrée (schéma Alembic à jour) mais jamais seedée, c'est le symptôme observé côté frontend sous la forme `Erreur : Echec du chargement de l'agregation (404)`.

## Pièges connus (déjà rencontrés, ne pas re-déboguer)

Environnement :
- WSL2 avec ~7 Go de RAM. `simplify.py` passe un plafond de heap explicite à `mapshaper-xl` (défaut 8 Go = swap garanti ici).
- **`seed_db.py` sur une année complète = ~2 Go de RESULT brut** (2x l'archive 2026 partielle). Un `pd.read_csv` global de ce fichier fait gonfler le tas pandas à plusieurs Go et a déjà fait tomber WSL (reboot, VS Code coupé en 1006). Deux garde-fous en place, ne pas les retirer : `transform.load_hubeau_tables(zip, result_sandre_filter=...)` lit RESULT par chunks et ne garde que les codes SANDRE monitorés (6M lignes -> ~1M) ; `seed_db.iter_year` est un générateur qui `yield` un paramètre à la fois pour que le consommateur COPY-e et libère chaque frame avant de construire la suivante.
- **Un `GROUP BY` Postgres sur toute la table `mesure` (35 Go / ~114M lignes) fait tomber le box** (reboot, deux fois de suite en août 2026 en construisant `commune_valeur` d'un coup : scan IO soutenu + hash aggregate, le host Hyper-V tue la VM). Garde-fou en place : `seed_db.populate_commune_valeur` découpe le recalcul du cache **par `parametre_id`** (24 requêtes, bitmap scan via `ix_mesure_parametre_id`, `work_mem` 96 Mo, `ON CONFLICT DO NOTHING` = reprenable). Ne jamais réécrire ça en un seul `INSERT ... SELECT ... GROUP BY` global. Même principe pour toute future requête analytique full-table : la chunker.
- Les fichiers `cog_ensemble_{annee}` ont changé de nom 5 fois (`mvtcommune2020-csv.csv` -> `v_mvt_commune_2026.csv`) et la vintage 2020 utilise `ID_COMMUNE_AVANT`/`TYPE_COMMUNE_AVANT` au lieu de `COM_AV`/`TYPECOM_AV`. `transform.load_commune_movements` gère les deux. `seed_db.py` fusionne toutes les vintages disponibles (les plus récentes gagnent sur conflit) puis re-résout les chaînes via `resolve_movement_chains` : couverture de remap maximale plutôt qu'une seule table.
- Outils installés hors pip/npm : `docker.io`, `docker-compose-v2`, `tippecanoe`, `python3.12-venv`, `python3-pip` (via apt, nécessite le mot de passe utilisateur), `mapshaper` (via npm global), `poetry` (via `pip install --user`, PATH à inclure `~/.local/bin`).
- Pas de `unzip` ni de `7z` en ligne de commande : utiliser `zipfile` (stdlib) et `py7zr`.
- L'image `backend` copie le code au build (pas de bind mount) et applique `alembic upgrade head` au démarrage : après avoir ajouté une migration ou modifié le code backend, faire `docker compose up -d --build backend`, pas un simple `restart` (sinon le conteneur tourne sur l'ancien code et, si la base a déjà été montée à la nouvelle révision par un alembic local, il boucle sur `Can't locate revision`).
- **`pipeline/Dockerfile` a `ENTRYPOINT ["python"]`** : `docker compose run --rm pipeline python src/seed_db.py ...` fait donc tourner `python python src/seed_db.py ...` (erreur `python: can't open file '/app/python'`). Ne pas répéter `python` dans la commande, l'ENTRYPOINT le fournit déjà.

Données :
- Inspecter les gros fichiers sans les charger : `zipfile.namelist()`, `pyogrio.list_layers()` / `read_info()`, `read_dataframe(..., max_features=3)`. Ne jamais lire un CSV/GeoJSON complet pour "voir à quoi il ressemble".
- `fiona` n'est pas installé : geopandas 1.x utilise **pyogrio**.
- Un mauvais `cdparametre` produit une carte crédible mais fausse. `filter_parameter()` **vérifie l'unité attendue** : lève uniquement si l'unité attendue est minoritaire (< 50 %, signature d'un mauvais code SANDRE) ; au-dessus de `MISMATCHED_UNIT_TOLERANCE` (1 %) mais en dessous de 50 %, elle droppe les lignes hors-unité avec un WARNING plutôt que d'abandonner (les années anciennes sont plus sales que 2026, un seuil dur de 1 % ne tenait pas sur 10 ans). `allow_empty=True` (passé par `seed_db.py`) renvoie un frame vide au lieu de lever quand un paramètre est absent d'une année (molécule pas encore recherchée).
- **Codes commune obsolètes après fusion** : Hub'Eau (`DIS_COM_UDI`) ne se resynchronise pas systématiquement avec le COG INSEE. Un même code peut avoir été réutilisé pour une commune totalement différente des décennies plus tôt (cas réel rencontré : `12218`/`12076`, Conques-en-Rouergue vs Saint-Cyprien-sur-Dourdou). `transform.py` (`load_commune_movements`, `remap_commune_codes`) ne remappe **que** les codes qui ne sont plus, aujourd'hui, un code commune valide (`load_current_commune_codes()`), et exclut les lignes `TYPECOM_AP=COMD` (communes déléguées, pas de vraie cible) et les scissions ambiguës (un code qui se scinde en plusieurs cibles distinctes n'est pas remappé, faute de pouvoir savoir laquelle est correcte). Le remap doit être re-déduppliqué après application (deux anciens codes peuvent converger vers le même code actuel).
- **Trous de couverture `DIS_COM_UDI`** : un réseau peut être déclaré sous une seule commune alors qu'il en dessert plusieurs (cas réel : réseau "LEDENON-SERNHAC" déclaré seulement sous Ledenon). `join_commune()` dans `transform.py` union les résultats de `COM_UDI` avec `PLV.inseecommuneprinc` (dédupliqué par `referenceprel`+commune) pour récupérer ces cas.
- Sur `dis-2026.zip` : `DIS_PLV` peut avoir plusieurs lignes pour le même `referenceprel` (un prélèvement partagé entre plusieurs réseaux interconnectés) ; sans dédup après jointure, une même mesure peut être comptée plusieurs fois pour une commune.

Frontend :
- `maplibre-gl` v6 n'a **pas d'export par défaut** : imports nommés (`Map as MapLibreMap`, etc.).
- Vite dev : `optimizeDeps.exclude: ['maplibre-gl']` reste nécessaire (le worker maplibre est servi tel quel depuis `node_modules`, son import.meta.url relatif fonctionne alors).
- **Build de production, worker maplibre cassé** (piège sérieux, déjà re-débogué une fois) : Vite bundle le code de maplibre-gl dans notre chunk, donc `import.meta.url` à l'intérieur ne pointe plus vers le vrai fichier du package, et le worker (`maplibre-gl-worker.mjs`) référence lui-même en interne un import relatif vers `maplibre-gl-shared.mjs` qu'un simple `?url` ne copie pas. Solution en place dans `vite.config.ts` : un plugin custom (`copyMaplibreWorker`, `apply: 'build'` uniquement) copie les deux fichiers tels quels vers `dist/maplibre-gl/`, et `MapView.tsx` appelle `setWorkerUrl(...)` vers ce chemin fixe **uniquement en prod** (`import.meta.env.PROD`), sinon le dev server (qui n'a pas ce plugin) casse à son tour.
- **Caddy, ordre des directives** : `handle_path /api/*` placé au même niveau que `file_server`/`try_files` ne suffit pas, `try_files` (priorité par défaut plus haute) intercepte tout avant. Il faut wrapper le fallback SPA dans son propre bloc `handle {}` explicite, pour que Caddy respecte l'ordre textuel entre blocs `handle`/`handle_path`.
- FastAPI derrière un reverse proxy qui strip le préfixe : mettre `root_path="/api"` sur l'app, sinon Swagger référence `/openapi.json` sans le préfixe et tombe sur le fallback SPA (erreur "no valid version field", en fait du HTML servi comme si c'était du JSON).
- `@mui/x-data-grid` v8 ne supporte pas MUI v9 (peer dep plafonné à v7) ; v9 le supporte. Vérifier la version avant d'ajouter la dépendance.
- MUI v9 : `Stack`/`Box` n'acceptent plus les props système (`alignItems`, `justifyContent`) en direct, tout passe par `sx`. `ListItemText` n'a plus `primaryTypographyProps`, utiliser `slotProps={{ primary: {...} }}`.
- Le survol exige des ids de features stables : la source GeoJSON utilise `promoteId: "code_insee"` pour que `setFeatureState` fonctionne.
- Le popup est en `pointer-events: none`, sinon il se place sous le curseur et fait clignoter le survol.
- La position du popup est mise à jour **impérativement** à chaque `mousemove` ; l'état React ne change que quand on entre dans une autre commune (sinon re-render continu).
- La rampe de bleus (dureté) démarre volontairement à mi-échelle : les teintes les plus pâles se confondent avec la mer du fond de carte.

## Conventions de code

- Python : type hints partout, `pathlib` plutôt que manipulation de strings pour les chemins, pas de notebook dans le pipeline final
- React : composants fonctionnels + hooks, **TypeScript**, pas de prop drilling excessif ; extraire un contexte pour l'état de la carte si la profondeur augmente
- Nommer clairement la distinction entre données **brutes** (raw, jamais modifiées) et **transformées** (processed, régénérables à tout moment par le pipeline) — ne jamais committer de données volumineuses transformées si elles sont régénérables
- Un paramètre monitoré = une entrée dans `PARAMETERS` (frontend `parameters.ts`) + une entrée dans `PARAMETERS` (pipeline `seed_db.py`), rien d'autre à toucher pour que l'API/carte/légende/panneau le supportent

## Style de rédaction

- Jamais d'emojis, nulle part (code, commits, messages, UI).
- Jamais de tiret cadratin (—) ni demi-cadratin (–) dans le texte ou les commentaires ; utiliser une virgule, des parenthèses, ou reformuler la phrase.
- Code, docstrings et commentaires toujours en anglais, y compris les noms de variables/fonctions. La documentation projet (ce fichier, README) reste en français.

## Points d'attention métier (à ne pas casser)

- Codes SANDRE des paramètres : **1345** = dureté/Titre Hydrotimétrique (°f), **1302** = pH (unité pH), **1340** = nitrates en NO3 (mg/L). Ne pas confondre 1345 et 1340 (erreur présente dans une version antérieure de ce fichier). La liste complète (24 paramètres) est dans `PARAMETERS` de `pipeline/src/seed_db.py`, avec le pendant `PARAMETERS` de `frontend/src/parameters.ts` (les 24 y ont une échelle de couleur).
- Les données Hub'Eau sont à la granularité **UDI (unité de distribution)**, pas directement commune. Une UDI peut couvrir plusieurs communes ou une commune plusieurs UDI. L'agrégation actuelle est une **moyenne** des mesures de la commune (lisse les écarts entre réseaux plutôt que d'en privilégier un), aussi bien côté CSV pipeline que côté API (`AVG` SQL).
- Les codes commune peuvent être obsolètes (fusions) ou mal couverts par `DIS_COM_UDI` (réseau partagé déclaré sous une seule commune) : voir la section Pièges connus, deux correctifs distincts et non redondants dans `transform.py`.
- Attribution obligatoire à OpenStreetMap avec le fond OpenMapTiles/Etalab (déjà en place via `customAttribution` dans `MapView.tsx`, ne pas la retirer).
- Les échelles d'unités par paramètre (`parameters.ts`) sont de **simples conversions de la valeur stockée**, jamais un recalcul : changer d'unité ne doit jamais reclasser une commune. Le pH et les nitrates n'ont chacun qu'une seule unité (pas de conversion), la dureté en a quatre (°f/ppm/°dH/mmol-L).
- L'archive de l'année en cours est partielle (2026 = janvier à juin) ; les valeurs varient un peu avec la saison (dilution par les pluies, activité agricole pour les nitrates). Pertinent quand le slider timeline compare l'année en cours à une année complète : `Timeline.tsx` affiche "annee en cours, partielle" quand l'année sélectionnée est l'année civile courante.
- Le choropleth affiche **une année à la fois** (`AVG` SQL des mesures de cette année-là uniquement), jamais une moyenne inter-années. Défaut de l'UI = année la plus récente disponible.
- Classes de couleur : **séquentielles** (une extrémité = préoccupant) pour dureté et nitrates, **divergentes** (deux extrémités = préoccupantes, centre = neutre/bon) pour le pH. Respecter cette distinction pour tout nouveau paramètre plutôt que réutiliser une rampe par défaut.

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

- Remplacer MapLibre par Leaflet ou une autre lib carto
- Basculer le fond de carte sur IGN sans discussion (friction technique connue avec les clés Géoportail)
- Committer des fichiers de données bruts ou volumineux (> quelques Mo) dans le repo
- Ajouter PostGIS ou stocker de la géométrie en base sans discussion (la géométrie reste dans des fichiers statiques/tuiles par choix d'architecture)
- Supprimer ou contourner le cache d'agrégation `commune_valeur` (il a été mesuré nécessaire : 8 s -> 0,4 s au niveau commune sur ~114M lignes). Toute nouvelle table dérivée / vue matérialisée au-delà de celle-ci reste soumise à la même règle : mesurer d'abord que la requête directe est réellement un problème.
