import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import MenuItem from "@mui/material/MenuItem";
import CloseIcon from "@mui/icons-material/Close";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import TableRowsIcon from "@mui/icons-material/TableRows";
import WaterDropOutlinedIcon from "@mui/icons-material/WaterDropOutlined";
import { LineChart } from "@mui/x-charts/LineChart";
import { DataGrid, type GridColDef, type GridRenderCellParams } from "@mui/x-data-grid";

import { fetchCommuneMesures, type MesureOut } from "./api";
import { communeLabel, type CommuneSummary } from "./communes";
import { formatDate } from "./format";
import { EmptyState, PanelSkeleton } from "./PanelStates";
import { classifyValue, contrastText, PARAMETERS, type ParameterId } from "./parameters";
import { convertFromBase, formatValueWithUnit, type Unit } from "./units";

type ViewMode = "table" | "chart";

const ALL_RESEAUX = "__all__";

type CommunePanelProps = {
  commune: CommuneSummary;
  parameterId: ParameterId;
  unit: Unit;
  onClose: () => void;
};

/** Bigger detail card shown for a commune selected via search. */
export function CommunePanel({ commune, parameterId, unit, onClose }: CommunePanelProps) {
  const { code, name } = commune;
  const parameter = PARAMETERS[parameterId];

  const [mesures, setMesures] = useState<MesureOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("table");
  const [reseauFilter, setReseauFilter] = useState<string>(ALL_RESEAUX);

  useEffect(() => {
    let cancelled = false;
    setMesures(null);
    setError(null);
    setReseauFilter(ALL_RESEAUX);

    fetchCommuneMesures(code, parameter.apiCode)
      .then((result) => {
        if (!cancelled) {
          setMesures(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Relevés indisponibles");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, parameter.apiCode]);

  // Derived from the same measurements the table below shows, rather than a second API
  // call: mean/count/latest generalize to any parameter without backend involvement.
  const summary = useMemo(() => {
    if (mesures === null || mesures.length === 0) {
      return null;
    }
    const mean = mesures.reduce((sum, m) => sum + m.valeur, 0) / mesures.length;
    const latest = mesures.reduce((max, m) => (m.date_prel > max ? m.date_prel : max), mesures[0].date_prel);
    return { mean, count: mesures.length, latest };
  }, [mesures]);

  const valueClass = summary === null ? null : classifyValue(summary.mean, parameter.classes);

  const rows = useMemo(
    () => (mesures ?? []).map((mesure, index) => ({ id: index, ...mesure })),
    [mesures],
  );

  const reseauOptions = useMemo(() => {
    const names = new Set<string>();
    for (const mesure of mesures ?? []) {
      if (mesure.nom_reseau !== null) {
        names.add(mesure.nom_reseau);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [mesures]);

  const chartData = useMemo(
    () =>
      (mesures ?? [])
        .filter((mesure) => reseauFilter === ALL_RESEAUX || mesure.nom_reseau === reseauFilter)
        .map((mesure) => ({
          date: new Date(mesure.date_prel),
          value: convertFromBase(mesure.valeur, unit),
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [mesures, unit, reseauFilter],
  );

  const columns: GridColDef<(typeof rows)[number]>[] = useMemo(
    () => [
      {
        field: "date_prel",
        headerName: "Date",
        flex: 1,
        valueFormatter: (value: string) => formatDate(value),
      },
      {
        field: "valeur",
        headerName: "Valeur",
        flex: 1,
        align: "right",
        headerAlign: "right",
        // valeur_libelle overrides the raw number for categorical parameters (conformity: a
        // relevé is really a C/N/D flag, not a percentage, "100%"/"0%" alone would mislead).
        renderCell: (params: GridRenderCellParams<(typeof rows)[number], number>) =>
          params.row.valeur_libelle ?? formatValueWithUnit(params.value ?? 0, unit),
      },
      {
        field: "nom_reseau",
        headerName: "Réseau",
        flex: 1.5,
        valueFormatter: (value: string | null) => value ?? "?",
      },
    ],
    [unit],
  );

  return (
    <Paper
      elevation={4}
      sx={{
        position: "absolute",
        // Full-width bottom sheet on a phone screen instead of a small corner card, so it
        // doesn't get squeezed into an unreadable sliver next to the map.
        bottom: { xs: 0, sm: 32 },
        right: { xs: 0, sm: 16 },
        left: { xs: 0, sm: "auto" },
        zIndex: 1,
        p: 0,
        width: { xs: "100%", sm: 600 },
        maxWidth: { xs: "100%", sm: "calc(90vw - 32px)" },
        maxHeight: { xs: "55vh", sm: "70vh" },
        borderRadius: { xs: 0, sm: 1 },
        overflowY: "auto",
      }}
    >
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 3,
          px: 2,
          pt: 2,
          pb: 1.5,
          bgcolor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
            {communeLabel(name, code)}
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Fermer" sx={{ mt: -0.5, mr: -0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        {summary === null || valueClass === null ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Aucune mesure disponible
          </Typography>
        ) : (
          <Box sx={{ mt: 0.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="h4" component="p" sx={{ lineHeight: 1.1 }}>
                {formatValueWithUnit(summary.mean, unit)}
              </Typography>
              <Chip
                size="small"
                label={valueClass.label}
                sx={{
                  borderRadius: 0.75,
                  backgroundColor: valueClass.color,
                  color: contrastText(valueClass.color),
                }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {summary.count} mesure(s), dernière le {formatDate(summary.latest)}
            </Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ px: 2, pt: 1.5, pb: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="subtitle2">
          Historique des relevés
          {unit.symbol !== "" && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
              ({unit.symbol})
            </Typography>
          )}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {view === "chart" && reseauOptions.length > 1 && (
            <Select
              size="small"
              value={reseauFilter}
              onChange={(event: SelectChangeEvent) => setReseauFilter(event.target.value)}
              sx={{ fontSize: "0.75rem", "& .MuiSelect-select": { py: 0.25 } }}
            >
              <MenuItem value={ALL_RESEAUX} dense>
                <Typography variant="caption">Tous les réseaux</Typography>
              </MenuItem>
              {reseauOptions.map((name) => (
                <MenuItem key={name} value={name} dense>
                  <Typography variant="caption">{name}</Typography>
                </MenuItem>
              ))}
            </Select>
          )}
          <ToggleButtonGroup
            exclusive
            size="small"
            value={view}
            onChange={(_event, next: ViewMode | null) => {
              if (next !== null) {
                setView(next);
              }
            }}
            aria-label="Affichage"
          >
            <ToggleButton value="table" aria-label="Tableau" sx={{ py: 0.25, px: 0.75 }}>
              <TableRowsIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="chart" aria-label="Graphique" sx={{ py: 0.25, px: 0.75 }}>
              <ShowChartIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Stack>
      {error !== null && (
        <EmptyState
          icon={<ReportGmailerrorredOutlinedIcon />}
          title={error}
          detail="Réessayez dans un instant"
          severity="error"
        />
      )}
      {error === null && mesures === null && <PanelSkeleton rows={5} />}
      {mesures !== null && mesures.length === 0 && (
        <EmptyState
          icon={<WaterDropOutlinedIcon />}
          title="Aucun relevé disponible"
          detail="Ce paramètre n'est pas suivi dans cette commune"
        />
      )}
      {mesures !== null && mesures.length > 0 && view === "table" && (
        <Box sx={{ height: 210, mt: 0.5 }}>
          <DataGrid
            rows={rows}
            columns={columns}
            density="compact"
            rowHeight={36}
            columnHeaderHeight={36}
            hideFooterSelectedRowCount
            initialState={{
              pagination: { paginationModel: { pageSize: 5 } },
              sorting: { sortModel: [{ field: "date_prel", sort: "desc" }] },
            }}
            pageSizeOptions={[5, 10, 25]}
            sx={{
              fontSize: "0.75rem",
              "& .MuiDataGrid-footerContainer": { minHeight: 32 },
              "& .MuiTablePagination-toolbar": { minHeight: 32, pl: 1 },
              "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
                fontSize: "0.7rem",
              },
            }}
          />
        </Box>
      )}
      {mesures !== null && mesures.length > 0 && view === "chart" && (
        <Box sx={{ height: 210, width: "100%", mt: 0.5 }}>
          <LineChart
            dataset={chartData}
            xAxis={[{ dataKey: "date", scaleType: "time", valueFormatter: (value: Date) => formatDate(value.toISOString()) }]}
            yAxis={[{ width: 40 }]}
            series={[
              {
                dataKey: "value",
                showMark: true,
                curve: "monotoneX",
                valueFormatter: (value: number | null) =>
                  value === null
                    ? ""
                    : unit.symbol === ""
                      ? value.toFixed(unit.decimals)
                      : `${value.toFixed(unit.decimals)} ${unit.symbol}`,
              },
            ]}
            margin={{ left: 8, right: 16, top: 16, bottom: 24 }}
            grid={{ horizontal: true }}
          />
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      <Typography variant="caption" color="text.secondary">
        Code INSEE : {commune.code}
      </Typography>
      </Box>
    </Paper>
  );
}
