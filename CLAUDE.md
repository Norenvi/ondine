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

## Structure du repo (cible)

```
.
├── pipeline/                  # Pipeline Python offline
│   ├── src/
│   │   ├── download.py        # Téléchargement PLV/RESULT/UDI_COM + contours communes
│   │   ├── transform.py       # Filtrage dureté (code_parametre=1340), agrégation par commune
│   │   ├── join_geo.py        # Jointure données + GeoJSON (geopandas), gestion codes INSEE fusionnés
│   │   ├── simplify.py        # Simplification géométries (mapshaper ou shapely)
│   │   └── build_tiles.py     # Génération tuiles MVT via tippecanoe (subprocess)
│   ├── data/
│   │   ├── raw/                # Téléchargements bruts (gitignored)
│   │   └── processed/          # Sorties GeoJSON/mbtiles (gitignored, sauf sample)
│   ├── pyproject.toml / requirements.txt
│   └── Dockerfile
├── frontend/                   # App React + MapLibre GL JS
│   ├── src/
│   ├── public/
│   │   └── data/                # Fichiers statiques générés par le pipeline (GeoJSON/tuiles), copiés au build
│   ├── package.json
│   └── Dockerfile
├── Caddyfile
├── docker-compose.yml
├── docker-compose.override.yml (dev, optionnel)
└── CLAUDE.md
```

## Stack technique détaillée

### Pipeline (Python)
- **pandas** : jointure/agrégation des fichiers PLV, RESULT, UDI_COM
- **geopandas** + **shapely** : jointure géométrie ↔ données, manipulation GeoJSON
- **mapshaper** (CLI, via subprocess/npx) ou `shapely.simplify` : simplification des contours
- **tippecanoe** (binaire, via subprocess) : génération de tuiles vectorielles MVT à partir du GeoJSON final, pour la V2 multi-zoom
- Sources de données :
  - Dureté : dataset "Résultats du contrôle sanitaire de l'eau distribuée commune par commune" (data.gouv.fr), fichiers PLV/RESULT/UDI_COM. Filtrer `code_parametre = 1340` (TH/dureté). Jointure RESULT → PLV via `referenceprel`, PLV → UDI_COM via `cdreseau` pour obtenir le code commune.
  - API Hub'Eau (`https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis`) : réservée aux requêtes ponctuelles (détail au clic sur une commune côté frontend), PAS pour le chargement en masse.
  - Contours communes : IGN Admin Express (source of truth officielle) ou `france-geojson` (dérivé, plus simple pour prototyper). Croiser avec le Code Officiel Géographique (COG) INSEE pour gérer les fusions/créations de communes.
- Le pipeline tourne **offline / à la demande** (script manuel ou cron), pas en continu. Produit des fichiers versionnés dans `pipeline/data/processed/`, copiés ensuite vers `frontend/public/data/`.

### Frontend (React)
- **MapLibre GL JS** pour le rendu carte (WebGL, gère bien les gros volumes de polygones — contrairement à Leaflet)
- Démarrage en **source GeoJSON directe** (fichier statique servi par Caddy), migration vers **vector tiles (MVT)** quand le multi-zoom sera implémenté
- Fond de carte : style vectoriel **OpenMapTiles via le flux Etalab** (`https://openmaptiles.geo.data.gouv.fr/`, pas de clé requise) par défaut. Ne pas basculer sur IGN sans discussion (nécessite une clé Géoportail et est plus complexe à intégrer avec MapLibre).
- Coloration choropleth : expression MapLibre `fill-color` avec `interpolate`/`step` sur la valeur de dureté (°f)
- Pas de state management lourd (Redux etc.) sauf besoin avéré — état de la carte + panneau de détail suffisent avec des hooks React standards

### Serveur (Caddy)
- Sert le build React (fichiers statiques) et les fichiers GeoJSON/tuiles depuis `frontend/public/data/` (ou un volume dédié)
- Configurer la compression (gzip/zstd) et le cache-control pour les fichiers géo (potentiellement volumineux)
- Pas de reverse proxy vers un backend applicatif dans ce projet (il n'y en a pas)

### Docker Compose
- Service `frontend-build` ou étape multi-stage dans le Dockerfile frontend : build React → sortie servie par Caddy
- Service `caddy` : sert les fichiers statiques (frontend build + data géo)
- Le pipeline Python n'est PAS un service qui tourne en continu — c'est soit un `docker compose run pipeline ...` ponctuel, soit exécuté hors compose. Ne pas le mettre en `depends_on` d'un service qui doit rester up.

## Conventions de code

- Python : type hints partout, `pathlib` plutôt que manipulation de strings pour les chemins, pas de notebook dans le pipeline final (OK pour l'exploration, mais le pipeline livré doit être scriptable/reproductible)
- React : composants fonctionnels + hooks, TypeScript si le projet en utilise (à vérifier/décider au démarrage), pas de prop drilling excessif — extraire un contexte pour l'état de la carte si besoin
- Nommer clairement la distinction entre données **brutes** (raw, jamais modifiées) et **transformées** (processed, régénérables à tout moment par le pipeline) — ne jamais committer de données volumineuses transformées si elles sont régénérables

## Points d'attention métier (à ne pas casser)

- Le code paramètre SANDRE pour la dureté (Titre Hydrotimétrique) est **1340** — ne pas le confondre avec d'autres paramètres de qualité de l'eau
- Les données Hub'Eau sont à la granularité **UDI (unité de distribution)**, pas directement commune — la jointure via `UDI_COM` est nécessaire et une UDI peut couvrir plusieurs communes ou une commune plusieurs UDI
- Les codes commune peuvent être obsolètes (fusions) — toujours vérifier la cohérence entre le référentiel géo utilisé (Admin Express/COG) et les codes commune retournés par Hub'Eau
- Attribution obligatoire à OpenStreetMap si on utilise le fond OpenMapTiles/Etalab — ne pas l'oublier dans l'UI (mention légale sur la carte)

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
