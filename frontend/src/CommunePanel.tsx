import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

import { fetchCommuneMesures, type MesureOut } from "./api";
import { communeLabel, type CommuneSummary } from "./communes";
import { classifyHardness, contrastText } from "./hardness";
import { formatDate } from "./format";
import { formatHardness, formatHardnessValue, type HardnessUnit } from "./units";

// Only parameter tracked so far; will become a prop once more are seeded.
const PARAMETRE_CODE = "durete";

type CommunePanelProps = {
  commune: CommuneSummary;
  unit: HardnessUnit;
  onClose: () => void;
};

/** Bigger detail card shown for a commune selected via search, placeholder content for now. */
export function CommunePanel({ commune, unit, onClose }: CommunePanelProps) {
  const { code, name, hardnessMean, sampleCount, latestSample } = commune;
  const hardnessClass = hardnessMean === null ? null : classifyHardness(hardnessMean);

  const [mesures, setMesures] = useState<MesureOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMesures(null);
    setError(null);

    fetchCommuneMesures(code, PARAMETRE_CODE)
      .then((result) => {
        if (!cancelled) {
          setMesures(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Releves indisponibles");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  const rows = useMemo(
    () => (mesures ?? []).map((mesure, index) => ({ id: index, ...mesure })),
    [mesures],
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
        valueFormatter: (value: number) => `${formatHardnessValue(value, unit)} ${unit.symbol}`,
      },
      {
        field: "nom_reseau",
        headerName: "Reseau",
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
        bottom: 32,
        right: 16,
        zIndex: 1,
        p: 2,
        minWidth: 300,
        maxWidth: 480,
        maxHeight: "70vh",
        overflowY: "auto",
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
          {communeLabel(name, code)}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Fermer">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      {hardnessMean === null || hardnessClass === null ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Aucune mesure disponible
        </Typography>
      ) : (
        <Box sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="h4" component="p" sx={{ lineHeight: 1.2 }}>
              {formatHardness(hardnessMean, unit)}
            </Typography>
            <Chip
              size="small"
              label={hardnessClass.label}
              sx={{
                borderRadius: 0.75,
                backgroundColor: hardnessClass.color,
                color: contrastText(hardnessClass.color),
                fontWeight: 300,
              }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {sampleCount ?? "?"} mesure(s)
            {latestSample ? `, dernière le ${formatDate(latestSample)}` : ""}
          </Typography>
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      <Typography variant="subtitle2">Historique des relevés</Typography>
      {error !== null && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
      {error === null && mesures === null && (
        <Stack sx={{ alignItems: "center", py: 2 }}>
          <CircularProgress size={20} />
        </Stack>
      )}
      {mesures !== null && mesures.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          Aucun releve disponible
        </Typography>
      )}
      {mesures !== null && mesures.length > 0 && (
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

      <Divider sx={{ my: 1.5 }} />

      <Typography variant="caption" color="text.secondary">
        Code INSEE : {commune.code}
      </Typography>
    </Paper>
  );
}
