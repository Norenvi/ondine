import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import MenuItem from "@mui/material/MenuItem";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import TableRowsIcon from "@mui/icons-material/TableRows";
import WaterDropOutlinedIcon from "@mui/icons-material/WaterDropOutlined";
import { LineChart } from "@mui/x-charts/LineChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { DataGrid, type GridColDef, type GridRenderCellParams } from "@mui/x-data-grid";

import { fetchCommuneMesures, type MesureOut } from "./api";
import type { CommuneSummary } from "./communes";
import { formatDate } from "./format";
import { EmptyState, PanelSkeleton } from "./PanelStates";
import {
  classifyValue,
  contrastText,
  PARAMETERS,
  REGULATORY_LIMITS,
  type ParameterId,
} from "./parameters";
import { convertFromBase, formatValueWithUnit, type Unit } from "./units";

type ViewMode = "table" | "chart";

/**
 * "compact" (map-side CommunePanel, ~720px): date / valeur / réseau only, so the columns
 * stay readable. "full" (Leaderboard drill-down, full screen): adds the per-sample class
 * and the distributor, and is where future extra fields land.
 */
export type MesuresVariant = "compact" | "full";

const ALL_RESEAUX = "__all__";

type CommuneMesuresProps = {
  commune: Pick<CommuneSummary, "code" | "name">;
  parameterId: ParameterId;
  unit: Unit;
  annee: number;
  variant?: MesuresVariant;
};

// Presence/absence swatches for a compliance parameter, reusing the E. coli ramp ends.
const DETECTION_COLOR = "#d73027";
const NO_DETECTION_COLOR = "#1a9850";

/**
 * Summary (mean or non-conformity rate) + sortable table / time chart of every sample of
 * one commune for the active parameter and year. Shared by CommunePanel (map-side detail
 * card, compact) and Leaderboard (drill-down from the ranking, full), so the two stay in
 * sync; `variant` only widens what the table shows.
 */
export function CommuneMesures({
  commune,
  parameterId,
  unit,
  annee,
  variant = "compact",
}: CommuneMesuresProps) {
  const { code } = commune;
  const parameter = PARAMETERS[parameterId];
  const limit = REGULATORY_LIMITS[parameterId];

  const [mesures, setMesures] = useState<MesureOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("table");
  const [reseauFilter, setReseauFilter] = useState<string>(ALL_RESEAUX);

  useEffect(() => {
    let cancelled = false;
    setMesures(null);
    setError(null);
    setReseauFilter(ALL_RESEAUX);

    fetchCommuneMesures(code, parameter.apiCode, annee)
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
  }, [code, parameter.apiCode, annee]);

  const compliance = parameter.compliance;
  // Value shown in the summary header: a non-conformity rate (percent) for a compliance
  // parameter, in its own unit, otherwise the pooled mean in the selected unit.
  const summaryUnit = compliance ? compliance.unit : unit;

  // Derived from the same measurements the table below shows, rather than a second API
  // call: mean/rate/count/latest generalize to any parameter without backend involvement.
  const summary = useMemo(() => {
    if (mesures === null || mesures.length === 0) {
      return null;
    }
    const latest = mesures.reduce((max, m) => (m.date_prel > max ? m.date_prel : max), mesures[0].date_prel);
    if (compliance) {
      const nonCompliant = mesures.filter((m) => m.valeur > compliance.threshold).length;
      return {
        value: (nonCompliant / mesures.length) * 100,
        count: mesures.length,
        latest,
        nonCompliant,
      };
    }
    const mean = mesures.reduce((sum, m) => sum + m.valeur, 0) / mesures.length;
    return { value: mean, count: mesures.length, latest, nonCompliant: null as number | null };
  }, [mesures, compliance]);

  const valueClass = summary === null ? null : classifyValue(summary.value, parameter.classes);

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

  const columns: GridColDef<(typeof rows)[number]>[] = useMemo(() => {
    const base: GridColDef<(typeof rows)[number]>[] = [
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
    ];

    if (variant !== "full") {
      return base;
    }

    return [
      base[0],
      base[1],
      {
        // Same per-parameter class as the map/summary chip: "Hors norme" only where the
        // parameter has a threshold, purely informative (e.g. "Dure") where it does not.
        // Not the sample-wide conclusionprel, which judges every parameter of the sample at
        // once and would be misleading on a single-parameter row.
        field: "classe",
        headerName: "Classe",
        width: 150,
        sortable: false,
        renderCell: (params: GridRenderCellParams<(typeof rows)[number]>) => {
          if (compliance) {
            const detected = params.row.valeur > compliance.threshold;
            return (
              <Chip
                size="small"
                label={detected ? "Détection" : "Conforme"}
                sx={{
                  borderRadius: 0.75,
                  backgroundColor: detected ? DETECTION_COLOR : NO_DETECTION_COLOR,
                  color: "#fff",
                }}
              />
            );
          }
          // Classified on `valeur` even for a "<LQ" row: below the quantification limit
          // still lands in the lowest class, which is the honest reading. The qualifier
          // itself is already shown in the Valeur column.
          const cls = classifyValue(params.row.valeur, parameter.classes);
          return (
            <Chip
              size="small"
              label={cls.label}
              sx={{
                borderRadius: 0.75,
                backgroundColor: cls.color,
                color: contrastText(cls.color),
              }}
            />
          );
        },
      },
      base[2],
      {
        field: "distributeur",
        headerName: "Distributeur",
        flex: 1.5,
        valueFormatter: (value: string | null) => value ?? "?",
      },
    ];
  }, [unit, variant, compliance, parameter]);

  const limitLine = limit
    ? `${limit.binding ? "Limite de qualité" : "Référence de qualité"} : ${limit.label}`
    : null;

  // Direct link to the same rows straight from the upstream source (a one commune / one
  // parameter / one year query is exactly the one-off use the Hub'Eau API is meant for; bulk
  // loading goes through the offline pipeline instead). Scoped by `code_reseau` on the UDIs
  // actually feeding this commune, not `code_commune`: Hub'Eau's `code_commune` filter only
  // returns prelevements whose sampling point is physically in the commune, whereas this
  // panel (like the choropleth) shows every prelevement of the networks that distribute water
  // here, which is the honest evidence base for the commune. Falls back to `code_commune`
  // before the measurements load or if none carry a network (PLV-fallback rows).
  const hubeauUrl = useMemo(() => {
    const reseaux = [
      ...new Set((mesures ?? []).map((m) => m.cdreseau).filter((c): c is string => c !== null)),
    ];
    const scope =
      reseaux.length > 0 ? `code_reseau=${reseaux.join(",")}` : `code_commune=${code}`;
    return (
      `https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis` +
      `?${scope}&code_parametre=${parameter.sandreCode}` +
      `&date_min_prelevement=${annee}-01-01&date_max_prelevement=${annee}-12-31` +
      `&size=500&sort=desc`
    );
  }, [mesures, code, parameter.sandreCode, annee]);

  return (
    <>
      {summary === null || valueClass === null ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Aucune mesure disponible
        </Typography>
      ) : (
        <Box sx={{ mt: 0.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="h4" component="p" sx={{ lineHeight: 1.1 }}>
              {formatValueWithUnit(summary.value, summaryUnit)}
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
          <Stack
            direction="row"
            spacing={1}
            sx={{ justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", mt: 0.75 }}
          >
            <Typography variant="caption" color="text.secondary">
              {summary.nonCompliant !== null
                ? `${summary.nonCompliant} / ${summary.count} prélèvements non conformes, dernière le ${formatDate(summary.latest)}`
                : `${summary.count} mesure(s), dernière le ${formatDate(summary.latest)}`}
            </Typography>
            {limitLine !== null && (
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
                {limitLine}
              </Typography>
            )}
          </Stack>
        </Box>
      )}

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between", mt: 1 }}
      >
        <Typography variant="subtitle2">
          Relevés {annee}
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
        <Box sx={{ height: variant === "full" ? 360 : 210, mt: 0.5 }}>
          <DataGrid
            rows={rows}
            columns={columns}
            density="compact"
            rowHeight={36}
            columnHeaderHeight={36}
            hideFooterSelectedRowCount
            initialState={{
              pagination: { paginationModel: { pageSize: variant === "full" ? 10 : 5 } },
              sorting: { sortModel: [{ field: "date_prel", sort: "desc" }] },
            }}
            pageSizeOptions={[5, 10, 25, 50]}
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
        <Box sx={{ height: variant === "full" ? 320 : 210, width: "100%", mt: 0.5 }}>
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
          >
            {limit?.max !== undefined && (
              <ChartsReferenceLine
                y={convertFromBase(limit.max, unit)}
                label={limit.binding ? "Limite" : "Référence"}
                labelAlign="start"
                lineStyle={{ strokeDasharray: "5 4", stroke: "#d73027" }}
                labelStyle={{ fontSize: 10, fill: "#d73027" }}
              />
            )}
          </LineChart>
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap" }}
      >
        <Typography variant="caption" color="text.secondary">
          Code INSEE : {code}
        </Typography>
        <Link
          variant="caption"
          href={hubeauUrl}
          target="_blank"
          rel="noopener noreferrer"
          color="text.secondary"
          underline="hover"
          title="Relevés bruts Hub'Eau (JSON) : ce paramètre, cette année, sur les réseaux qui desservent la commune."
        >
          Source : Hub'Eau
        </Link>
      </Stack>
    </>
  );
}
