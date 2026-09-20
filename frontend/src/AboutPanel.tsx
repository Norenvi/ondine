import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";

type AboutPanelProps = {
  onClose: () => void;
};

type Section = {
  id: string;
  navLabel: string;
  title: string;
  body: React.ReactNode;
};

type SandreParametre = {
  code: string;
  nom: string;
  unite: string;
  description: string;
};

/** Mirrors PARAMETERS in pipeline/src/seed_db.py (cdparametre_sandre/nom/unite). Description is
 * the official Sandre definition (field DfParametre, https://api.sandre.eaufrance.fr/referentiels/v1/par/{code}.json),
 * trimmed for long entries (substance enumerations, full microbiological characterization) but
 * not reworded otherwise, so it matches what the linked fiche states. Reference link is the
 * Sandre identifier URI for the parameter, https://id.eaufrance.fr/par/{code}. */
const SANDRE_PARAMETRES: SandreParametre[] = [
  { code: "1345", nom: "Dureté de l'eau", unite: "°f", description: "Somme des concentrations calciques (en sels de calcium) et magnésiennes (en sels de magnésium)." },
  { code: "1302", nom: "pH", unite: "unité pH", description: "pH du support considéré (activité des ions H+ selon la loi de Nernst)." },
  { code: "1340", nom: "Nitrates", unite: "mg/L", description: "Substance chimique de formule brute NO3-." },
  { code: "1339", nom: "Nitrites", unite: "mg/L", description: "Substance chimique de formule brute NO2-." },
  { code: "1335", nom: "Ammonium", unite: "mg/L", description: "Teneur en formes ammoniacales dans l'eau (ion ammonium NH4+ et ammoniac non ionisé NH3)." },
  { code: "1303", nom: "Conductivité", unite: "µS/cm", description: "Conductivité électrique de l'eau mesurée ou corrigée à 25°C." },
  { code: "1295", nom: "Turbidité", unite: "NFU", description: "Réduction de la transparence d'un liquide due à la présence de matières non dissoutes, mesurée à un angle de 90° par rapport à la lumière incidente." },
  { code: "1398", nom: "Chlore libre", unite: "mg(Cl2)/L", description: "Chlore présent dans l'eau sous la forme d'acide hypochloreux (HOCl), d'ion hypochlorite (ClO-) ou de chlore élémentaire dissous (Cl2d)." },
  { code: "1337", nom: "Chlorures", unite: "mg/L", description: "Teneur en ions chlorures Cl de tous les chlorures dissous dans l'eau." },
  { code: "1338", nom: "Sulfates", unite: "mg/L", description: "Teneur en ions sulfates SO4-- dissous dans l'eau." },
  { code: "1374", nom: "Calcium", unite: "mg/L", description: "Quantification de l'élément Calcium pour tout ou partie de ses états (dissous, solide, etc.)." },
  { code: "1372", nom: "Magnésium", unite: "mg(Mg)/L", description: "Élément chimique de symbole Mg et de numéro atomique 12." },
  { code: "1393", nom: "Fer total", unite: "µg/L", description: "Quantification de l'élément Fer pour tous ses états (dissous, solide, etc.)." },
  { code: "1370", nom: "Aluminium total", unite: "µg/L", description: "Élément chimique de symbole Al et de numéro atomique 13." },
  { code: "1394", nom: "Manganèse total", unite: "µg/L", description: "Quantification de l'élément Manganèse pour tous ses états (dissous, solide, etc.)." },
  { code: "1375", nom: "Sodium", unite: "mg/L", description: "Quantification de l'élément Sodium pour tous ses états (dissous, solide, etc.)." },
  { code: "1367", nom: "Potassium", unite: "mg/L", description: "Élément chimique de symbole K et de numéro atomique 19." },
  { code: "7073", nom: "Fluorures", unite: "mg/L", description: "Élément chimique de formule brute F-." },
  { code: "1362", nom: "Bore", unite: "mg/L", description: "Élément chimique de symbole B et de numéro atomique 5." },
  { code: "1449", nom: "Escherichia coli", unite: "n/(100mL)", description: "Entérobactérie appartenant au groupe des coliformes thermotolérants, capable de croître en aérobiose à 44°C et d'hydrolyser le MUG." },
  { code: "1382", nom: "Plomb", unite: "µg/L", description: "Quantification de l'élément Plomb pour tout ou partie de ses états (dissous, solide, etc.)." },
  { code: "1392", nom: "Cuivre", unite: "mg(Cu)/L", description: "Quantification de l'élément Cuivre pour tous ses états (dissous, solide, etc.)." },
  { code: "1369", nom: "Arsenic", unite: "µg/L", description: "Élément chimique de symbole As et de numéro atomique 33." },
  { code: "1385", nom: "Sélénium", unite: "µg/L", description: "Quantification de l'élément Sélénium pour tout ou partie de ses états (dissous, solide, etc.)." },
  { code: "1386", nom: "Nickel", unite: "µg/L", description: "Quantification de l'élément Nickel pour tout ou partie de ses états (dissous, solide, etc.)." },
  { code: "2766", nom: "Bisphénol A", unite: "µg/L", description: "Substance chimique de formule brute C15H16O2, comportant deux fonctions alcool sur deux cycles aromatiques." },
  { code: "2036", nom: "Trihalométhanes (4 substances)", unite: "µg/L", description: "Somme de 4 paramètres : chloroforme, bromoforme, dibromochlorométhane et bromodichlorométhane." },
  { code: "6276", nom: "Pesticides (total)", unite: "µg/L", description: "Somme de l'ensemble des pesticides analysés." },
  { code: "8847", nom: "PFAS (somme de 20)", unite: "µg/L", description: "Somme des 20 PFAS de la directive européenne Eau potable 2020/2184." },
];

const SECTIONS: Section[] = [
  {
    id: "presentation",
    navLabel: "Présentation",
    title: "",
    body: (
      <Typography variant="body2">
        Ondine cartographie des indicateurs de qualité de l'eau du robinet (dureté, pH,
        nitrates, et d'autres paramètres physico-chimiques) commune par commune, en France
        métropolitaine. Il s'agit de la visualisation de données publiques mises à disposition
        par le Ministière des Solidarités et de la Santé. Plus précisément, d'après data.gouv.fr il est question de :{" "}
        <em>
          "prélèvements et résultats des analyses réalisées dans le cadre du contrôle
          sanitaire réglementaire sur les unités de distribution ou les installations
          directement en amont, et liens entre communes et unités de distribution."
        </em>
      </Typography>
    ),
  },
  {
    id: "sources",
    navLabel: "Sources des données",
    title: "Sources des données",
    body: (
      <>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Les résultats des paramètres proviennent du jeu de données{" "}
          <Link
            href="https://www.data.gouv.fr/datasets/resultats-du-controle-sanitaire-de-leau-distribuee-commune-par-commune"
            target="_blank"
            rel="noopener"
          >
            "Résultats du contrôle sanitaire de l'eau distribuée commune par commune"
          </Link>{" "}
          sur data.gouv.fr (Ministère des Solidarités et de la Santé, producteur du jeu de
          données ; sa{" "}
          <Link
            href="https://sante.gouv.fr/ministere/organisation/organisation-des-directions-et-services/article/organisation-de-la-direction-generale-de-la-sante-dgs"
            target="_blank"
            rel="noopener"
          >
            direction générale de la santé
          </Link>{" "}
          pilote le contrôle sanitaire, via les Agences Régionales de Santé). Les mêmes
          données sont aussi consultables prélèvement par prélèvement sur{" "}
          <Link
            href="https://hubeau.eaufrance.fr/page/api-qualite-eau-potable"
            target="_blank"
            rel="noopener"
          >
            Hub'Eau
          </Link>
          . 
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Les données brutes de relevés sont accessibles pour toute commune en sélectionnant "Voir les données brutes
          sur Hub'Eau" en bas à droite de la fenêtre des relevés (après avoir cliqué sur une commune ou suite à une recherche).
          Le lien ouvre un nouvel onglet avec une requête URL donnant les relevés concernant cette commune pour une année donnée 
          (paramétrable sur la timeline en bas de la page) et un paramètre donné (affiché et modifiable dans la barre en haut de la page).
        </Typography>
        <Box sx={{ mb: 2, textAlign: "center" }}>
          <Box
            component="img"
            src="/donnees-brutes.png"
            alt="Lien 'Voir les données brutes sur Hub'Eau' en bas de la fenêtre des relevés"
            sx={{
              maxWidth: "100%",
              width: 420,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            Le lien "Voir les données brutes sur Hub'Eau", en bas de la fenêtre des relevés
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Les contours des communes, EPCI, départements et régions viennent de l'
          <Link
            href="https://geoservices.ign.fr/adminexpress"
            target="_blank"
            rel="noopener"
          >
            IGN, Admin Express COG
          </Link>
          . Les changements de code commune d'une année sur l'autre (fusions, communes déléguées) sont résolus via la{" "}
          <Link
            href="https://www.insee.fr/fr/information/2560452"
            target="_blank"
            rel="noopener"
          >
            table des mouvements de communes de l'INSEE
          </Link>
          .
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Toutes ces données sont publiées sous Licence Ouverte / Open Licence par leurs
          auteurs respectifs (Ministère des Solidarités et de la Santé pour le contrôle
          sanitaire, IGN pour les contours, INSEE pour le COG). Le fond de carte est un flux{" "}
          <Link href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
            OpenStreetMap
          </Link>{" "}
          distribué par Etalab (OpenMapTiles).
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }} color="text.secondary">
          Données à jour jusqu'en 2026 (année en cours, partielle). Les nouvelles années sont
          intégrées au fil de la publication des archives Hub'Eau, sans fréquence fixe.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Ondine est un projet indépendant, non affilié à Hub'Eau, au Ministère des
          Solidarités et de la Santé, à l'IGN ni à l'INSEE. Comme les données sources
          elles-mêmes, les valeurs
          affichées sont fournies sans garantie d'exactitude ni d'exhaustivité et peuvent contenir des erreurs d'unité par exemple. En cas de
          doute sur un relevé, se référer directement à Hub'Eau via le lien fourni sur chaque
          commune.
        </Typography>
      </>
    ),
  },
  {
    id: "commune",
    navLabel: "Ce que représente une commune",
    title: "Ce que représente une commune",
    body: (
      <>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Hub'Eau (et data.gouv.fr) publient leurs résultats à la granularité de l'UDI (unité
          de distribution), pas directement par commune : une même UDI peut desservir
          plusieurs communes. La valeur affichée pour une commune, au-dessus du tableau de
          relevés ou au survol de la carte, est donc la moyenne de tous les prélèvements des
          réseaux qui la desservent, et pas seulement des prélèvements physiquement situés
          dans son périmètre. Cela signifie que le nombre de relevés compté ici peut différer,
          parfois nettement, de celui que renvoie l'API Hub'Eau filtrée par{" "}
          <code>code_commune</code>. Le lien "Voir les données brutes sur Hub'Eau" de chaque
          paramètre, dans le panneau d'une commune, pointe vers ce même jeu de réseaux pour
          vérification.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Exemple concret : sur l'année 2025, Ondine compte 1412 relevés d'E. coli pour Vanves
          (92075), contre seulement 46 renvoyés par l'API Hub'Eau filtrée sur{" "}
          <code>code_commune=92075</code> pour la même période. L'écart vient du fait qu'Hub'Eau
          retourne les relevés physiquement effectués à Vanves, tandis qu'Ondine affiche tous
          les relevés du réseau SEDIF Sud, qui alimente 19 communes des Hauts-de-Seine en eau
          traitée par le même syndicat. Vanves étant desservie par ce réseau, elle reçoit cette
          même eau, d'où son décompte à 1412 relevés côté Ondine.
        </Typography>
      </>
    ),
  },
  {
    id: "udi",
    navLabel: "Pourquoi pas l'UDI ?",
    title: "Pourquoi ne pas afficher un niveau UDI, plus pertinent que la commune ?",
    body: (
      <Typography variant="body2">
        L'UDI (unité de distribution) est la granularité réelle des prélèvements Hub'Eau : un
        niveau de zoom UDI éviterait justement le lissage entre réseaux que l'attribution par
        commune introduit (voir ci-dessus), et serait donc l'indicateur le plus juste. Cependant, le seul jeu de contours UDI à l'échelle
        nationale identifié à ce jour est diffusé en accès restreint. Ce niveau sera ajouté si une source de
        contours UDI librement redistribuable devient disponible.
      </Typography>
    ),
  },
  {
    id: "methode",
    navLabel: "Méthode de calcul",
    title: "Méthode de calcul",
    body: (
      <>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Sauf mention contraire, la valeur affichée au survol de la carte et en haut de chaque tableau de relevé 
          est une moyenne combinée : elle est calculée sur l'ensemble des relevés individuels de la zone, et non une moyenne de
          moyennes (qui donnerait autant de poids à une commune avec 2 relevés qu'à une
          commune avec 10 000). Cela vaut aussi bien au niveau commune qu'aux niveaux EPCI,
          département et région.
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Exception : les paramètres bactériologiques comme E. coli sont affichés en taux de
          non-conformité (part des prélèvements où le paramètre a été détecté), pas en
          moyenne. Une seule détection isolée serait diluée par une majorité de
          prélèvements propres.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Ce taux reste un pourcentage sur un petit nombre de prélèvements : sur une commune
          avec seulement 4 relevés dans l'année, une seule détection donne déjà 25 %. Ondine
          n'a pas l'expertise pour juger si une eau est bonne ou non, seulement pour afficher
          la donnée publique telle quelle. En dessous de 10 prélèvements sur la période, la
          carte, le panneau commune et le classement l'indiquent ("échantillon réduit, taux à
          interpréter avec prudence").
        </Typography>
      </>
    ),
  },
  {
    id: "sans-seuil",
    navLabel: "Paramètres sans seuil",
    title: "Paramètres sans seuil sanitaire",
    body: (
      <Typography variant="body2">
        La plupart des paramètres affichés ont une limite ou une référence de qualité fixée
        par la réglementation française (
        <Link
          href="https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000046890189"
          target="_blank"
          rel="noopener"
        >
          arrêté du 11 janvier 2007 relatif aux limites et références de qualité des eaux
          destinées à la consommation humaine
        </Link>
        ), ce qui permet de qualifier une valeur de conforme ou non. Cinq paramètres
        n'en ont pas : Dureté de l'eau, Calcium, Magnésium, Potassium et Chlore libre. Leurs
        classes de couleur sur la carte sont donc purement informatives (une préférence de
        confort, pas un jugement sanitaire) et ne signifient jamais qu'une valeur est hors
        norme.
      </Typography>
    ),
  },
  {
    id: "limites",
    navLabel: "Limites connues",
    title: "Limites connues",
    body: (
      <>
        <Typography variant="body2" sx={{ mb: 2 }}>
          La carte affiche une seule année à la fois, jamais une moyenne sur plusieurs années.
          L'archive de l'année civile en cours est partielle (elle ne couvre que les mois déjà
          écoulés, jusqu'à juin pour l'année 2026) : les valeurs qu'elle montre peuvent varier davantage qu'une année complète,
          notamment pour les paramètres sensibles aux saisons (nitrates, dureté).
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Le périmètre couvert est la France métropolitaine uniquement, les départements et
          régions d'outre-mer ne sont pas encore intégrés.
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Tous les paramètres ne sont pas prélevés chaque année pour chaque commune. La
          fréquence du contrôle sanitaire est fixée par réseau, en fonction de la population
          desservie et du débit distribué (
          <Link
            href="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000466614/"
            target="_blank"
            rel="noopener"
          >
            arrêté du 11 janvier 2007 relatif au programme de prélèvements et d'analyses du
            contrôle sanitaire
          </Link>
          ) : les paramètres de routine (bactériologie, pH, dureté) reviennent plusieurs fois
          par an sur les grands réseaux, tandis que des paramètres complémentaires (pesticides,
          métaux, certains micropolluants) n'y sont recherchés que tous les quelques années,
          moins souvent encore sur les petits réseaux. Une commune peut donc apparaître sans
          donnée sur la carte pour un paramètre et une année donnés simplement parce
          qu'aucun prélèvement n'y a été analysé sur ce paramètre cette année-là, sans que cela
          signifie que l'eau n'y est pas surveillée.
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          La liste des pesticides et métabolites recherchés a par ailleurs été révisée
          courant 2021, à la faveur du renouvellement des marchés d'analyses des ARS suite à
          une{" "}
          <Link
            href="https://sante.gouv.fr/IMG/pdf/2022_qualite_edch_pesticides.pdf"
            target="_blank"
            rel="noopener"
          >
            instruction ministérielle du 18 décembre 2020
          </Link>
          . Le total des pesticides quantifiés peut donc apparaître en forte hausse dans
          certaines régions entre 2020 et 2021 sans que l'eau s'y soit réellement dégradée,
          simplement parce que davantage de molécules y sont recherchées depuis cette date.
          De même, la recherche des PFAS ("polluants éternels") n'est devenue{" "}
          <Link
            href="https://www.auvergne-rhone-alpes.ars.sante.fr/pfas-surveillance-dans-leau-de-consommation"
            target="_blank"
            rel="noopener"
          >
            obligatoire qu'à partir du 12 janvier 2026
          </Link>{" "}
          (transposition de la directive européenne 2020/2184), ce qui explique leur quasi-absence
          dans les relevés avant 2023, date à partir de laquelle certaines ARS ont commencé à
          les rechercher par anticipation.
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Les contours des communes affichés sont ceux d'aujourd'hui, pas ceux de l'année
          sélectionnée. La timeline change l'année des relevés mais pas le découpage
          communal. Cela signifie qu'un relevé de 2016 dans une commune depuis fusionnée est donc rattaché à sa
          commune de rattachement actuelle et dessiné dans son contour actuel, et non pas dans celui
          de la commune telle qu'elle existait en 2016.
        </Typography>
      </>
    ),
  },
  {
    id: "sandre",
    navLabel: "Codes SANDRE",
    title: "Codes SANDRE des paramètres",
    body: (
      <>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Chaque paramètre est identifié dans les données Hub'Eau par un code SANDRE
          (Service d'Administration Nationale des Données et Référentiels sur l'Eau), le
          référentiel national qui normalise la codification des données sur l'eau en France.
          Le lien "Référence" pointe vers la fiche officielle du paramètre sur{" "}
          <Link href="https://id.eaufrance.fr" target="_blank" rel="noopener">
            id.eaufrance.fr
          </Link>{" "}
          (Sandre), qui en donne la définition normalisée et les méthodes d'analyse.
        </Typography>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Paramètre</TableCell>
                <TableCell>Code SANDRE</TableCell>
                <TableCell>Unité</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Référence</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {SANDRE_PARAMETRES.map((param) => (
                <TableRow key={param.code}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{param.nom}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    <code>{param.code}</code>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{param.unite}</TableCell>
                  <TableCell>{param.description}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    <Link
                      href={`https://id.eaufrance.fr/par/${param.code}`}
                      target="_blank"
                      rel="noopener"
                    >
                      Fiche Sandre
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </>
    ),
  },
  {
    id: "contact",
    navLabel: "Contact",
    title: "Contact",
    body: (
      <>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Pour signaler une erreur ou proposer une suggestion, vous pouvez envoyer un mail à{" "}
          <Link href="mailto:ondine-contact@proton.me">
            ondine-contact@proton.me
          </Link>
        </Typography>
      </>
    ),
  },
];

export function AboutPanel({ onClose }: AboutPanelProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sectionElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        setActiveId(topmost.target.id);
      },
      { root: container, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    sectionElsRef.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    sectionElsRef.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Paper
      elevation={0}
      square
      sx={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        bgcolor: (theme) => alpha(theme.palette.background.default, 0.8),
        backdropFilter: "blur(10px)",
        p: { xs: 0, sm: 3 },
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 1200,
          mx: "auto",
          flexGrow: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          p: { xs: 2, sm: 3 },
          bgcolor: "background.paper",
          borderRadius: { xs: 0, sm: 1 },
          boxShadow: { sm: 16 },
          overflow: "hidden",
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
        >
          <Typography variant="h6">À propos</Typography>
          <IconButton size="small" onClick={onClose} aria-label="Fermer">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Box
          sx={{
            mt: 2,
            flexGrow: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            gap: { md: 3 },
            overflow: "hidden",
          }}
        >
          <Box
            component="nav"
            aria-label="Sommaire"
            sx={{
              display: { xs: "none", md: "block" },
              width: 240,
              flexShrink: 0,
              borderRight: 1,
              borderColor: "divider",
              pr: 1,
              overflowY: "auto",
            }}
          >
            <List dense disablePadding>
              {SECTIONS.map((section) => (
                <ListItemButton
                  key={section.id}
                  selected={activeId === section.id}
                  onClick={() => scrollToSection(section.id)}
                  sx={{ borderRadius: 1, py: 0.5, mb: 0.25 }}
                >
                  <ListItemText
                    slotProps={{
                      primary: {
                        variant: "body2",
                        sx: { lineHeight: 1.3 },
                      },
                    }}
                  >
                    {section.navLabel}
                  </ListItemText>
                </ListItemButton>
              ))}
            </List>
          </Box>

          <Box ref={contentRef} sx={{ overflowY: "auto", flexGrow: 1, minHeight: 0 }}>
            <Box sx={{ maxWidth: 900, mx: "auto", px: { xs: 0, sm: 3 } }}>
              <Typography
                variant="h5"
                component="div"
                sx={{
                  fontSize: "1.625rem",
                  fontWeight: 200,
                  letterSpacing: "0.12em",
                  mb: 2,
                  textAlign: "center",
                }}
              >
                Ondine
              </Typography>
              {SECTIONS.map((section, index) => (
                <Box
                  key={section.id}
                  id={section.id}
                  ref={(el: HTMLElement | null) => {
                    if (el) sectionElsRef.current.set(section.id, el);
                    else sectionElsRef.current.delete(section.id);
                  }}
                  sx={{ mb: index < SECTIONS.length - 1 ? 3 : 0, scrollMarginTop: 1 }}
                >
                  {section.title && (
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      {section.title}
                    </Typography>
                  )}
                  {section.body}
                  {index < SECTIONS.length - 1 && <Divider sx={{ mt: 3 }} />}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
