import { useEffect, useMemo, useState } from "react";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import { DataGrid, useGridApiRef, type GridColDef, type GridRowParams } from "@mui/x-data-grid";

import { EmptyState, PanelSkeleton } from "./PanelStates";

import { fetchAggregation, type AggregationOut } from "./api";
import { departmentFromInseeCode } from "./communes";
import { loadEntityIndex, type EntitySummary } from "./entities";
import { formatDate } from "./format";
import { classifyValue, contrastText, PARAMETERS, type ParameterId } from "./parameters";
import { convertFromBase, formatValue, type Unit } from "./units";

type LeaderboardProps = {
  parameterId: ParameterId;
  unit: Unit;
  annee: number;
  onSelectCommune: (entity: EntitySummary) => void;
  onClose: () => void;
};

type Row = AggregationOut & { departement: string };

/**
 * Every commune ranked by the active parameter, in the same visual language as
 * CommunePanel but much bigger: this is a browsing tool, not a detail card.
 */
export function Leaderboard({ parameterId, unit, annee, onSelectCommune, onClose }: LeaderboardProps) {
  const parameter = PARAMETERS[parameterId];
  // A compliance parameter (E. coli) is ranked by its non-conformity rate, not the mean.
  const compliance = parameter.compliance;
  const valueField = compliance ? "taux_non_conformite" : "valeur_moyenne";
  const apiRef = useGridApiRef();

  const [aggregation, setAggregation] = useState<AggregationOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [communeIndex, setCommuneIndex] = useState<Map<string, EntitySummary>>(new Map());

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
    const commune = communeIndex.get(params.row.code);
    if (commune !== undefined) {
      onSelectCommune(commune);
    }
  }

  return (
    <Paper
      elevation={4}
      sx={{
        position: "absolute",
        // Full-width bottom sheet on a phone screen (fixed height instead of top+bottom
        // pinning, which would otherwise cover the whole viewport) rather than the desktop
        // side panel.
        top: { xs: "auto", sm: 16 },
        // Desktop bottom offset clears the centered Timeline (bottom: 24, ~48px tall).
        bottom: { xs: 0, sm: 88 },
        right: { xs: 0, sm: 56 },
        left: { xs: 0, sm: "auto" },
        height: { xs: "55vh", sm: "auto" },
        zIndex: 1,
        p: 2,
        width: { xs: "100%", sm: 800 },
        maxWidth: { xs: "100%", sm: "calc(100vw - 72px)" },
        borderRadius: { xs: 0, sm: 1 },
        display: "flex",
        flexDirection: "column",
      }}
    >
      <IconButton
        size="small"
        onClick={onClose}
        aria-label="Fermer"
        sx={{ position: "absolute", top: 8, right: 8 }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
      <Typography variant="subtitle1" sx={{ pr: 4 }}>
        Classement des communes
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {parameter.label} {annee}, triées par{" "}
        {compliance ? "part de prélèvements non conformes" : "valeur moyenne"}
      </Typography>

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
        <PanelSkeleton rows={12} sx={{ flexGrow: 1 }} />
      )}

      {aggregation !== null && (
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
          sx={{
            mt: 1.5,
            flexGrow: 1,
            "& .MuiDataGrid-row": { cursor: "pointer" },
          }}
        />
      )}
    </Paper>
  );
}
