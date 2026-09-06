import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import { DataGrid, useGridApiRef, type GridColDef, type GridRowParams } from "@mui/x-data-grid";

import { CommuneMesures } from "./CommuneMesures";
import { EmptyState, PanelSkeleton } from "./PanelStates";
import { TimelineSlider } from "./Timeline";

import { fetchAggregation, type AggregationOut } from "./api";
import { communeLabel, departmentFromInseeCode } from "./communes";
import { loadEntityIndex, type EntitySummary } from "./entities";
import { formatDate } from "./format";
import { classifyValue, contrastText, PARAMETERS, type ParameterId } from "./parameters";
import { convertFromBase, formatValue, type Unit } from "./units";

type LeaderboardProps = {
  parameterId: ParameterId;
  unit: Unit;
  annee: number;
  annees: number[];
  onAnneeChange: (annee: number) => void;
  onSelectCommune: (entity: EntitySummary) => void;
  onClose: () => void;
};

type Row = AggregationOut & { departement: string };

/**
 * Full-screen two-level data browser: every commune ranked by the active parameter, then
 * (on row click) that commune's individual samples via the shared CommuneMesures view. The
 * ranking grid stays mounted while drilled in, so its sort/filter/page survive "back".
 */
export function Leaderboard({
  parameterId,
  unit,
  annee,
  annees,
  onAnneeChange,
  onSelectCommune,
  onClose,
}: LeaderboardProps) {
  const parameter = PARAMETERS[parameterId];
  // A compliance parameter (E. coli) is ranked by its non-conformity rate, not the mean.
  const compliance = parameter.compliance;
  const valueField = compliance ? "taux_non_conformite" : "valeur_moyenne";
  const apiRef = useGridApiRef();

  const [aggregation, setAggregation] = useState<AggregationOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [communeIndex, setCommuneIndex] = useState<Map<string, EntitySummary>>(new Map());
  const [drilledCode, setDrilledCode] = useState<string | null>(null);

  useEffect(() => {
    loadEntityIndex("commune").then((entities) => {
      setCommuneIndex(new Map(entities.map((entity) => [entity.code, entity])));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAggregation(null);
    setError(null);

    fetchAggregation("commune", parameter.apiCode, annee)
      .then((result) => {
        if (!cancelled) {
          setAggregation(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Classement indisponible");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [parameter.apiCode, annee]);

  const rows: Row[] = useMemo(
    () =>
      (aggregation ?? []).map((entry) => ({
        ...entry,
        departement: departmentFromInseeCode(entry.code),
      })),
    [aggregation],
  );

  const columns: GridColDef<Row>[] = useMemo(
    () => [
      {
        field: "rank",
        headerName: "#",
        width: 56,
        sortable: false,
        filterable: false,
        renderCell: (params) => {
          const sortedIds = apiRef.current?.getSortedRowIds() ?? [];
          const index = sortedIds.indexOf(params.id);
          return index === -1 ? "?" : index + 1;
        },
      },
      {
        field: "nom",
        headerName: "Commune",
        flex: 1.5,
      },
      {
        field: "departement",
        headerName: "Dépt.",
        width: 80,
      },
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
    [unit, parameter, compliance, valueField, apiRef],
  );

  function handleRowClick(params: GridRowParams<Row>) {
    setDrilledCode(params.row.code);
  }

  const drilledEntity = drilledCode === null ? null : communeIndex.get(drilledCode) ?? null;
  const drilledRow = drilledCode === null ? null : rows.find((row) => row.code === drilledCode) ?? null;
  const drilledName = drilledEntity?.name ?? drilledRow?.nom ?? drilledCode ?? "";

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
        bgcolor: "background.default",
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
        }}
      >
        {drilledCode === null ? (
          <>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
            >
              <Box>
                <Typography variant="h6">Classement des communes</Typography>
                <Typography variant="caption" color="text.secondary">
                  {parameter.label} {annee}, triées par{" "}
                  {compliance ? "part de prélèvements non conformes" : "valeur moyenne"}
                </Typography>
              </Box>
              <IconButton size="small" onClick={onClose} aria-label="Fermer">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>

            {error !== null && (
              <EmptyState
                icon={<ReportGmailerrorredOutlinedIcon />}
                title={error}
                detail="Réessayez dans un instant"
                severity="error"
                sx={{ flexGrow: 1 }}
              />
            )}

            {error === null && aggregation === null && (
              <PanelSkeleton rows={14} sx={{ flexGrow: 1, mt: 2 }} />
            )}
          </>
        ) : (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
              <IconButton
                size="small"
                onClick={() => setDrilledCode(null)}
                aria-label="Retour au classement"
              >
                <ArrowBackIcon fontSize="small" />
              </IconButton>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" noWrap>
                  {drilledEntity !== null || drilledRow !== null
                    ? communeLabel(drilledName, drilledCode)
                    : drilledName}
                </Typography>
                <Link
                  component="button"
                  variant="caption"
                  color="text.secondary"
                  underline="hover"
                  onClick={() => setDrilledCode(null)}
                >
                  Classement des communes
                </Link>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
              <Button
                size="small"
                startIcon={<PlaceOutlinedIcon />}
                disabled={drilledEntity === null}
                onClick={() => {
                  if (drilledEntity !== null) {
                    onSelectCommune(drilledEntity);
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

        {/* Grid stays mounted while drilled in (just hidden) so sort/filter/page persist. */}
        {aggregation !== null && (
          <Box
            sx={{
              flexGrow: 1,
              minHeight: 0,
              mt: 2,
              display: drilledCode === null ? "flex" : "none",
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

        {drilledCode !== null && (
          <Box sx={{ flexGrow: 1, minHeight: 0, mt: 1, overflowY: "auto" }}>
            <CommuneMesures
              commune={{ code: drilledCode, name: drilledName }}
              parameterId={parameterId}
              unit={unit}
              annee={annee}
              variant="full"
            />
          </Box>
        )}

        {/* Year picker under the table, so ranking and drill-down both stay navigable in
            time while the map (and its own Timeline) are covered by this full-screen view. */}
        <TimelineSlider
          annees={annees}
          annee={annee}
          onChange={onAnneeChange}
          sx={{ alignSelf: "center", width: { xs: "100%", sm: 460 }, maxWidth: "100%", px: 2.5, mt: 1 }}
        />
      </Box>
    </Paper>
  );
}
