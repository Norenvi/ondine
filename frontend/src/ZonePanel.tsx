import { useEffect, useMemo, useState } from "react";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import { DataGrid, type GridColDef, type GridRowParams } from "@mui/x-data-grid";

import { EmptyState, PanelSkeleton } from "./PanelStates";

import { fetchZoneCommunes, type AggregationOut, type NiveauZoom } from "./api";
import { loadEntityIndex, type EntitySummary } from "./entities";
import { formatDate } from "./format";
import { LEVEL_CONFIG } from "./levels";
import { classifyValue, contrastText, PARAMETERS, type ParameterId } from "./parameters";
import { convertFromBase, formatValue, type Unit } from "./units";

type ZonePanelProps = {
  /** Never "commune": App.tsx renders CommunePanel instead in that case. */
  entity: EntitySummary;
  parameterId: ParameterId;
  unit: Unit;
  onSelectCommune: (entity: EntitySummary) => void;
  onClose: () => void;
};

/**
 * Per-commune breakdown for an EPCI/departement/region selection, the detail view for zoom
 * levels above commune. A raw per-sample table (CommunePanel's own approach at commune level)
 * does not scale here, a region can carry 60k+ individual mesures for a single parameter, so
 * this stays at "one row per commune", same shape/DataGrid pattern as Leaderboard but scoped
 * to the clicked zone instead of all of France.
 */
export function ZonePanel({ entity, parameterId, unit, onSelectCommune, onClose }: ZonePanelProps) {
  const parameter = PARAMETERS[parameterId];
  const niveau = entity.level as Exclude<NiveauZoom, "commune">;

  const [aggregation, setAggregation] = useState<AggregationOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [communeIndex, setCommuneIndex] = useState<Map<string, EntitySummary>>(new Map());

  useEffect(() => {
    loadEntityIndex("commune").then((entities) => {
      setCommuneIndex(new Map(entities.map((e) => [e.code, e])));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAggregation(null);
    setError(null);

    fetchZoneCommunes(niveau, entity.code, parameter.apiCode)
      .then((result) => {
        if (!cancelled) {
          setAggregation(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Détail indisponible");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [niveau, entity.code, parameter.apiCode]);

  const columns: GridColDef<AggregationOut>[] = useMemo(
    () => [
      {
        field: "nom",
        headerName: "Commune",
        flex: 1.5,
      },
      {
        field: "valeur_moyenne",
        headerName: `Valeur (${unit.symbol || parameter.label})`,
        flex: 1,
        align: "right",
        headerAlign: "right",
        valueFormatter: (value: number) => formatValue(convertFromBase(value, unit), unit),
      },
      {
        field: "classe",
        headerName: "Classe",
        flex: 1,
        sortable: false,
        renderCell: (params) => {
          const valueClass = classifyValue(params.row.valeur_moyenne, parameter.classes);
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
    [unit, parameter],
  );

  function handleRowClick(params: GridRowParams<AggregationOut>) {
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
        bottom: { xs: 0, sm: 16 },
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
        {entity.name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {parameter.label} - Moyenne des relevés par commune ({LEVEL_CONFIG[entity.level].label.toLowerCase()})
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

      {aggregation !== null && aggregation.length === 0 && (
        <EmptyState
          icon={<InboxOutlinedIcon />}
          title="Aucune mesure disponible"
          detail="Ce paramètre n'est pas suivi dans cette zone"
          sx={{ flexGrow: 1 }}
        />
      )}

      {aggregation !== null && aggregation.length > 0 && (
        <DataGrid
          rows={aggregation}
          columns={columns}
          getRowId={(row) => row.code}
          density="compact"
          onRowClick={handleRowClick}
          initialState={{
            sorting: { sortModel: [{ field: "valeur_moyenne", sort: "asc" }] },
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
