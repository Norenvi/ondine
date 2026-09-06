import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import { DataGrid, useGridApiRef, type GridColDef, type GridRowParams } from "@mui/x-data-grid";

import { CommuneDetail } from "./CommuneDetail";
import { EmptyState, PanelSkeleton } from "./PanelStates";
import { TimelineSlider } from "./Timeline";

import {
  fetchAggregation,
  fetchZoneCommunes,
  type AggregationOut,
  type NiveauZoom,
} from "./api";
import { communeLabel, departmentFromInseeCode } from "./communes";
import { loadEntityIndex, type EntitySummary } from "./entities";
import { formatDate } from "./format";
import { LEVEL_CONFIG } from "./levels";
import { classifyValue, contrastText, PARAMETERS, type ParameterId } from "./parameters";
import { convertFromBase, formatValue, type Unit } from "./units";

type LeaderboardProps = {
  /** The zoom level the map is on: the table compares entities at this level. */
  level: NiveauZoom;
  parameterId: ParameterId;
  unit: Unit;
  annee: number;
  annees: number[];
  onAnneeChange: (annee: number) => void;
  /** Select an entity at the board's own level (used by "Voir sur la carte" on a zone row). */
  onSelectEntity: (entity: EntitySummary) => void;
  /** Select a commune, switching the map down to commune level (the deepest drill). */
  onSelectCommune: (entity: EntitySummary) => void;
  /** Commune to open the drill on at mount (from a permalink); only the code is needed. */
  initialDrilledCommune?: string | null;
  /** Mirrors the drilled commune up so it can go in the URL. */
  onDrilledCommuneChange?: (code: string | null) => void;
  onClose: () => void;
};

type Row = AggregationOut & { departement: string };

/**
 * Full-screen data browser: every entity at the active zoom level, compared on the active
 * parameter. At commune level a row drills to that commune's full Bulletin (every parameter,
 * the row for the active one pre-expanded). Above commune level a row drills to the
 * per-commune breakdown of that zone (same /aggregation/{niveau}/{code}/communes endpoint as
 * ZonePanel), and a commune there drills one step further to its Bulletin. The top grid stays
 * mounted while drilled in, so its sort/filter/page survive "back".
 */
export function Leaderboard({
  level,
  parameterId,
  unit,
  annee,
  annees,
  onAnneeChange,
  onSelectEntity,
  onSelectCommune,
  initialDrilledCommune,
  onDrilledCommuneChange,
  onClose,
}: LeaderboardProps) {
  const parameter = PARAMETERS[parameterId];
  // A compliance parameter (E. coli) is ranked by its non-conformity rate, not the mean.
  const compliance = parameter.compliance;
  const valueField = compliance ? "taux_non_conformite" : "valeur_moyenne";
  const isCommuneLevel = level === "commune";
  const levelLabel = LEVEL_CONFIG[level].label;
  const apiRef = useGridApiRef();

  const [aggregation, setAggregation] = useState<AggregationOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Code -> EntitySummary (with bbox) for "Voir sur la carte": the board's own level, plus
  // commune for the deepest drill. Same index the map/search already loads and caches.
  const [levelIndex, setLevelIndex] = useState<Map<string, EntitySummary>>(new Map());
  const [communeIndex, setCommuneIndex] = useState<Map<string, EntitySummary>>(new Map());

  // Drill state: a zone (only above commune level), then a commune inside it (or, at commune
  // level, directly a commune from the top grid).
  const [zoneCode, setZoneCode] = useState<string | null>(null);
  const [communeCode, setCommuneCodeRaw] = useState<string | null>(initialDrilledCommune ?? null);
  const [zoneCommunes, setZoneCommunes] = useState<AggregationOut[] | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);

  // Keep the drilled commune reflected in the URL (see App / urlState). Not the zone
  // breadcrumb: a restored link jumps straight to the commune, back then goes to the list.
  function setCommuneCode(code: string | null) {
    setCommuneCodeRaw(code);
    onDrilledCommuneChange?.(code);
  }

  useEffect(() => {
    loadEntityIndex("commune").then((entities) => {
      setCommuneIndex(new Map(entities.map((entity) => [entity.code, entity])));
    });
  }, []);

  useEffect(() => {
    if (isCommuneLevel) {
      setLevelIndex(new Map());
      return;
    }
    let cancelled = false;
    loadEntityIndex(level).then((entities) => {
      if (!cancelled) {
        setLevelIndex(new Map(entities.map((entity) => [entity.code, entity])));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [level, isCommuneLevel]);

  useEffect(() => {
    let cancelled = false;
    setAggregation(null);
    setError(null);

    fetchAggregation(level, parameter.apiCode, annee)
      .then((result) => {
        if (!cancelled) {
          setAggregation(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Données indisponibles");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [level, parameter.apiCode, annee]);

  useEffect(() => {
    if (zoneCode === null || isCommuneLevel) {
      setZoneCommunes(null);
      setZoneError(null);
      return;
    }
    let cancelled = false;
    setZoneCommunes(null);
    setZoneError(null);

    fetchZoneCommunes(
      level as Exclude<NiveauZoom, "commune">,
      zoneCode,
      parameter.apiCode,
      annee,
    )
      .then((result) => {
        if (!cancelled) {
          setZoneCommunes(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setZoneError("Détail indisponible");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [zoneCode, isCommuneLevel, level, parameter.apiCode, annee]);

  const rows: Row[] = useMemo(
    () =>
      (aggregation ?? []).map((entry) => ({
        ...entry,
        departement: isCommuneLevel ? departmentFromInseeCode(entry.code) : "",
      })),
    [aggregation, isCommuneLevel],
  );

  // Value / class / count / last-date columns, identical for the top grid and the zone
  // breakdown grid.
  const metricColumns: GridColDef<AggregationOut>[] = useMemo(
    () => [
      {
        field: valueField,
        headerName: compliance
          ? "Non conformité (%)"
          : `Valeur (${unit.symbol || parameter.label})`,
        flex: 1,
        align: "right",
        headerAlign: "right",
        valueFormatter: (value: number | null) =>
          compliance
            ? (value ?? 0).toFixed(1)
            : formatValue(convertFromBase(value as number, unit), unit),
      },
      {
        field: "classe",
        headerName: "Classe",
        flex: 1,
        sortable: false,
        renderCell: (params) => {
          const valueClass = classifyValue(
            (compliance ? params.row.taux_non_conformite : params.row.valeur_moyenne) ?? 0,
            parameter.classes,
          );
          return (
            <Chip
              size="small"
              label={valueClass.label}
              sx={{
                borderRadius: 0.75,
                backgroundColor: valueClass.color,
                color: contrastText(valueClass.color),
              }}
            />
          );
        },
      },
      {
        field: "nb_mesures",
        headerName: "Mesures",
        width: 90,
        align: "right",
        headerAlign: "right",
      },
      {
        field: "derniere_mesure",
        headerName: "Dernière",
        width: 110,
        valueFormatter: (value: string) => formatDate(value),
      },
    ],
    [unit, parameter, compliance, valueField],
  );

  const columns: GridColDef<Row>[] = useMemo(() => {
    const head: GridColDef<Row>[] = [
      {
        field: "rank",
        headerName: "#",
        width: 72,
        sortable: false,
        filterable: false,
        renderCell: (params) => {
          const sortedIds = apiRef.current?.getSortedRowIds() ?? [];
          const index = sortedIds.indexOf(params.id);
          return index === -1 ? "?" : index + 1;
        },
      },
      { field: "nom", headerName: levelLabel, flex: 1.5 },
    ];
    if (isCommuneLevel) {
      head.push({ field: "departement", headerName: "Dépt.", width: 80 });
    }
    return [...head, ...(metricColumns as GridColDef<Row>[])];
  }, [apiRef, levelLabel, isCommuneLevel, metricColumns]);

  const zoneColumns: GridColDef<AggregationOut>[] = useMemo(
    () => [{ field: "nom", headerName: "Commune", flex: 1.5 }, ...metricColumns],
    [metricColumns],
  );

  function handleRowClick(params: GridRowParams<Row>) {
    if (isCommuneLevel) {
      setCommuneCode(params.row.code);
    } else {
      setZoneCode(params.row.code);
    }
  }

  const zoneEntity = zoneCode === null ? null : levelIndex.get(zoneCode) ?? null;
  const zoneRow = zoneCode === null ? null : rows.find((row) => row.code === zoneCode) ?? null;
  const zoneName = zoneEntity?.name ?? zoneRow?.nom ?? zoneCode ?? "";

  const communeEntity =
    communeCode === null ? null : communeIndex.get(communeCode) ?? null;
  const communeRow =
    communeCode === null
      ? null
      : (zoneCommunes ?? rows).find((row) => row.code === communeCode) ?? null;
  const communeName = communeEntity?.name ?? communeRow?.nom ?? communeCode ?? "";

  const view: "list" | "zone" | "commune" =
    communeCode !== null ? "commune" : zoneCode !== null ? "zone" : "list";

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
        // The content card below is fully opaque; this shell (a frame around it on larger
        // screens, edge to edge on a phone) darkens and blurs the map behind it.
        bgcolor: (theme) => alpha(theme.palette.background.default, 0.8),
        backdropFilter: "blur(10px)",
        p: { xs: 0, sm: 3 },
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 1100,
          mx: "auto",
          flexGrow: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          p: { xs: 2, sm: 3 },
          bgcolor: "background.paper",
          borderRadius: { xs: 0, sm: 1 },
          // border: { sm: "1px solid" },
          // borderColor: "divider",
          boxShadow: { sm: 16 },
          overflow: "hidden",
        }}
      >
        {view === "list" && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
          >
            <Box>
              <Typography variant="h6">
                Comparer les {LEVEL_CONFIG[level].pluralLabel}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {parameter.label} {annee}, triées par{" "}
                {compliance ? "part de prélèvements non conformes" : "valeur moyenne"}
              </Typography>
            </Box>
            <IconButton size="small" onClick={onClose} aria-label="Fermer">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        )}

        {view === "zone" && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
              <IconButton
                size="small"
                onClick={() => setZoneCode(null)}
                aria-label="Retour au tableau"
              >
                <ArrowBackIcon fontSize="small" />
              </IconButton>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" noWrap>
                  {zoneName}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                  Communes, {parameter.label} {annee}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
              <Button
                size="small"
                startIcon={<PlaceOutlinedIcon />}
                disabled={zoneEntity === null}
                onClick={() => {
                  if (zoneEntity !== null) {
                    onSelectEntity(zoneEntity);
                  }
                }}
              >
                Voir sur la carte
              </Button>
              <IconButton size="small" onClick={onClose} aria-label="Fermer">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        )}

        {view === "commune" && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
              <IconButton
                size="small"
                onClick={() => setCommuneCode(null)}
                aria-label="Retour"
              >
                <ArrowBackIcon fontSize="small" />
              </IconButton>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" noWrap>
                  {communeEntity !== null || communeRow !== null
                    ? communeLabel(communeName, communeCode ?? "")
                    : communeName}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
              <Button
                size="small"
                startIcon={<PlaceOutlinedIcon />}
                disabled={communeEntity === null}
                onClick={() => {
                  if (communeEntity !== null) {
                    onSelectCommune(communeEntity);
                  }
                }}
              >
                Voir sur la carte
              </Button>
              <IconButton size="small" onClick={onClose} aria-label="Fermer">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        )}

        {view === "list" && error !== null && (
          <EmptyState
            icon={<ReportGmailerrorredOutlinedIcon />}
            title={error}
            detail="Réessayez dans un instant"
            severity="error"
            sx={{ flexGrow: 1 }}
          />
        )}

        {view === "list" && error === null && aggregation === null && (
          <PanelSkeleton rows={14} sx={{ flexGrow: 1, mt: 2 }} />
        )}

        {/* Top grid stays mounted while drilled in (just hidden) so sort/filter/page persist. */}
        {aggregation !== null && (
          <Box
            sx={{
              flexGrow: 1,
              minHeight: 0,
              mt: 2,
              display: view === "list" ? "flex" : "none",
              flexDirection: "column",
            }}
          >
            <DataGrid
              apiRef={apiRef}
              rows={rows}
              columns={columns}
              getRowId={(row) => row.code}
              density="compact"
              onRowClick={handleRowClick}
              initialState={{
                sorting: { sortModel: [{ field: valueField, sort: "asc" }] },
                pagination: { paginationModel: { pageSize: 100 } },
              }}
              pageSizeOptions={[25, 50, 100]}
              sx={{ flexGrow: 1, "& .MuiDataGrid-row": { cursor: "pointer" } }}
            />
          </Box>
        )}

        {view === "zone" && (
          <Box sx={{ flexGrow: 1, minHeight: 0, mt: 2, display: "flex", flexDirection: "column" }}>
            {zoneError !== null && (
              <EmptyState
                icon={<ReportGmailerrorredOutlinedIcon />}
                title={zoneError}
                detail="Réessayez dans un instant"
                severity="error"
                sx={{ flexGrow: 1 }}
              />
            )}
            {zoneError === null && zoneCommunes === null && (
              <PanelSkeleton rows={12} sx={{ flexGrow: 1 }} />
            )}
            {zoneCommunes !== null && zoneCommunes.length === 0 && (
              <EmptyState
                icon={<InboxOutlinedIcon />}
                title="Aucune mesure disponible"
                detail="Ce paramètre n'est pas suivi dans cette zone"
                sx={{ flexGrow: 1 }}
              />
            )}
            {zoneCommunes !== null && zoneCommunes.length > 0 && (
              <DataGrid
                rows={zoneCommunes}
                columns={zoneColumns}
                getRowId={(row) => row.code}
                density="compact"
                onRowClick={(params) => setCommuneCode(params.row.code)}
                initialState={{
                  sorting: { sortModel: [{ field: valueField, sort: "asc" }] },
                  pagination: { paginationModel: { pageSize: 100 } },
                }}
                pageSizeOptions={[25, 50, 100]}
                sx={{ flexGrow: 1, "& .MuiDataGrid-row": { cursor: "pointer" } }}
              />
            )}
          </Box>
        )}

        {view === "commune" && communeCode !== null && (
          <Box
            sx={{ flexGrow: 1, minHeight: 0, mt: 1, display: "flex", flexDirection: "column" }}
          >
            <CommuneDetail
              commune={{ code: communeCode, name: communeName }}
              parameterId={parameterId}
              unit={unit}
              annee={annee}
              variant="full"
            />
          </Box>
        )}

        {/* Year picker under the table, so the comparison and drill-downs both stay navigable
            in time while the map (and its own Timeline) are covered by this full-screen view. */}
        <TimelineSlider
          annees={annees}
          annee={annee}
          onChange={onAnneeChange}
          sx={{
            alignSelf: "center",
            width: { xs: "100%", sm: 460 },
            maxWidth: "100%",
            px: 2.5,
            mt: 1,
          }}
        />
      </Box>
    </Paper>
  );
}
