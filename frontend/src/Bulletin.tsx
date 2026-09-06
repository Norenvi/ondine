import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import WaterDropOutlinedIcon from "@mui/icons-material/WaterDropOutlined";

import { fetchCommuneBulletin, type BulletinParametreOut } from "./api";
import { CommuneMesures, type MesuresVariant } from "./CommuneMesures";
import type { CommuneSummary } from "./communes";
import { formatDate } from "./format";
import { EmptyState, PanelSkeleton } from "./PanelStates";
import {
  classifyValue,
  contrastText,
  defaultUnit,
  PARAMETER_BY_API_CODE,
  PARAMETER_GROUPS,
  PARAMETERS,
  REGULATORY_LIMITS,
  type ParameterId,
} from "./parameters";
import { formatValue } from "./units";

type BulletinProps = {
  commune: Pick<CommuneSummary, "code" | "name">;
  annee: number;
  /** Only changes the nested CommuneMesures variant and the parameter column width. */
  variant?: MesuresVariant;
  /** Row to open (and scroll to): the parameter the user was looking at. */
  initialExpanded?: ParameterId;
  /** Called when the user opens a row, so the host can follow (e.g. recolour the map). */
  onParameterChange?: (id: ParameterId) => void;
};

const COLSPAN = 7;

/**
 * Every parameter measured in the commune during the year, one table row each. The Moyenne
 * column and the Classe chip use the same pooled mean the choropleth colours by (kept
 * consistent map <-> bulletin <-> detail panel); the Plage and Dernier columns show the
 * spread it hides. For a threshold parameter the chip uses the non-conformity rate instead.
 * A row opens in place (Collapse) to that parameter's full CommuneMesures and scrolls itself
 * into view. Used by CommuneDetail in both the map-side panel (compact) and the Leaderboard
 * drill-down (full).
 */
export function Bulletin({
  commune,
  annee,
  variant = "compact",
  initialExpanded,
  onParameterChange,
}: BulletinProps) {
  const [rows, setRows] = useState<BulletinParametreOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ParameterId | null>(initialExpanded ?? null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    setExpanded(initialExpanded ?? null);

    fetchCommuneBulletin(commune.code, annee)
      .then((result) => {
        if (!cancelled) {
          setRows(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Bulletin indisponible");
        }
      });

    return () => {
      cancelled = true;
    };
    // initialExpanded is intentionally not a dependency: a row opened here can bubble a
    // parameter change back down as a new initialExpanded, which would re-trigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commune.code, annee]);

  // Follow initialExpanded when the host changes it (e.g. the map's parameter selector).
  useEffect(() => {
    if (initialExpanded !== undefined) {
      setExpanded(initialExpanded);
    }
  }, [initialExpanded]);

  function handleToggle(id: ParameterId) {
    const opening = expanded !== id;
    setExpanded(opening ? id : null);
    if (opening) {
      onParameterChange?.(id);
    }
  }

  const byId = useMemo(() => {
    const map = new Map<ParameterId, BulletinParametreOut>();
    for (const row of rows ?? []) {
      const id = PARAMETER_BY_API_CODE[row.parametre];
      if (id !== undefined) {
        map.set(id, row);
      }
    }
    return map;
  }, [rows]);

  if (error !== null) {
    return (
      <EmptyState
        icon={<ReportGmailerrorredOutlinedIcon />}
        title={error}
        detail="Réessayez dans un instant"
        severity="error"
      />
    );
  }

  if (rows === null) {
    return <PanelSkeleton rows={10} />;
  }

  if (byId.size === 0) {
    return (
      <EmptyState
        icon={<WaterDropOutlinedIcon />}
        title="Aucune donnée pour cette année"
        detail="Aucun paramètre n'a de relevé dans cette commune pour l'année sélectionnée"
      />
    );
  }

  return (
    // No top padding: the sticky table header should sit flush against the tabs, both at
    // rest and pinned.
    <Box>
      {/* overflow: visible so the panel's own scroll container (not this one) drives the
          sticky header; horizontal overflow on a narrow panel is handled by that ancestor. */}
      <TableContainer sx={{ overflow: "visible" }}>
        <Table
          size="small"
          stickyHeader
          sx={{
            "& td, & th": { px: 1, whiteSpace: "nowrap" },
            "& td:first-of-type, & th:first-of-type": { pl: 0 },
            "& td:last-of-type, & th:last-of-type": { pr: 0 },
            "& thead th": { top: 0, backgroundColor: "background.paper" },
            // Parameter column: let long labels wrap instead of stretching the table.
            "& td:nth-of-type(2), & th:nth-of-type(2)": {
              whiteSpace: "normal",
              width: variant === "full" ? 190 : 130,
              minWidth: 110,
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 28 }} />
              <TableCell>Paramètre</TableCell>
              <TableCell>Plage</TableCell>
              <TableCell align="right">Moyenne</TableCell>
              <TableCell>Limite</TableCell>
              <TableCell align="right">Dernier</TableCell>
              <TableCell>Classe</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {PARAMETER_GROUPS.map((group) => {
              const ids = group.ids.filter((id) => byId.has(id));
              if (ids.length === 0) {
                return null;
              }
              return (
                <Fragment key={group.label}>
                  <TableRow>
                    <TableCell colSpan={COLSPAN} sx={{ border: 0, pt: 1.5, pb: 0.25 }}>
                      <Typography variant="overline" color="text.secondary">
                        {group.label}
                      </Typography>
                    </TableCell>
                  </TableRow>
                  {ids.map((id) => (
                    <BulletinRow
                      key={id}
                      id={id}
                      data={byId.get(id)!}
                      commune={commune}
                      annee={annee}
                      variant={variant}
                      expanded={expanded === id}
                      onToggle={() => handleToggle(id)}
                    />
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

type BulletinRowProps = {
  id: ParameterId;
  data: BulletinParametreOut;
  commune: Pick<CommuneSummary, "code" | "name">;
  annee: number;
  variant: MesuresVariant;
  expanded: boolean;
  onToggle: () => void;
};

function BulletinRow({ id, data, commune, annee, variant, expanded, onToggle }: BulletinRowProps) {
  const parameter = PARAMETERS[id];
  const unit = defaultUnit(id);
  const limit = REGULATORY_LIMITS[id];
  const compliance = parameter.compliance;
  const rowRef = useRef<HTMLTableRowElement>(null);

  // Bring a freshly opened row (a user click, or the initial one) under the panel header.
  useEffect(() => {
    if (expanded) {
      const frame = requestAnimationFrame(() => {
        rowRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [expanded]);

  const rate =
    compliance && data.nb_mesures > 0
      ? ((data.nb_non_conformes ?? 0) / data.nb_mesures) * 100
      : null;
  const headline = compliance ? rate ?? 0 : data.moyenne;
  const valueClass = classifyValue(headline, parameter.classes);

  const overMax = limit?.max !== undefined && data.maximum > limit.max;
  const underMin = limit?.min !== undefined && data.minimum < limit.min;
  const outOfLimit = compliance ? (data.nb_non_conformes ?? 0) > 0 : overMax || underMin;

  let alert: string | null = null;
  if (compliance && (data.nb_non_conformes ?? 0) > 0) {
    alert = `${data.nb_non_conformes} / ${data.nb_mesures} prélèvement(s) non conforme(s)`;
  } else if (outOfLimit && limit) {
    alert = `Un relevé hors ${limit.binding ? "limite" : "référence"} (${limit.label})`;
  }

  const unitSuffix = unit.symbol === "" ? "" : ` ${unit.symbol}`;

  let limitText = "N/A";
  if (compliance) {
    limitText = "0";
  } else if (limit?.min !== undefined && limit?.max !== undefined) {
    limitText = `${formatValue(limit.min, unit)} à ${formatValue(limit.max, unit)}`;
  } else if (limit?.max !== undefined) {
    limitText = `≤ ${formatValue(limit.max, unit)}`;
  } else if (limit?.min !== undefined) {
    limitText = `≥ ${formatValue(limit.min, unit)}`;
  }

  return (
    <Fragment>
      <TableRow
        ref={rowRef}
        hover
        selected={expanded}
        onClick={onToggle}
        sx={{
          cursor: "pointer",
          // Clear the sticky table header when a row scrolls itself into view.
          scrollMarginTop: 44,
          "& > td": { borderBottom: expanded ? 0 : undefined },
        }}
      >
        <TableCell sx={{ width: 28 }}>
          <IconButton size="small" tabIndex={-1} sx={{ p: 0.25 }}>
            {expanded ? (
              <KeyboardArrowDownIcon fontSize="small" />
            ) : (
              <KeyboardArrowRightIcon fontSize="small" />
            )}
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {parameter.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {data.nb_mesures} relevé(s){unitSuffix ? ` ·${unitSuffix}` : ""}
          </Typography>
          {alert !== null && (
            <Typography variant="caption" color="error" sx={{ display: "block", fontWeight: 600 }}>
              {alert}
            </Typography>
          )}
        </TableCell>
        <TableCell>
          {formatValue(data.minimum, unit)} à {formatValue(data.maximum, unit)}
        </TableCell>
        <TableCell align="right" sx={{ fontWeight: 600 }}>
          {formatValue(data.moyenne, unit)}
        </TableCell>
        <TableCell sx={{ color: "text.secondary" }}>{limitText}</TableCell>
        <TableCell align="right">
          {formatValue(data.derniere_valeur, unit)}
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {formatDate(data.derniere_date)}
          </Typography>
        </TableCell>
        <TableCell>
          <Chip
            size="small"
            label={valueClass.label}
            sx={{
              borderRadius: 0.75,
              backgroundColor: valueClass.color,
              color: contrastText(valueClass.color),
            }}
          />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={COLSPAN} sx={{ py: 0, border: 0 }}>
          <Collapse in={expanded} unmountOnExit>
            <Box sx={{ py: 1 }}>
              <CommuneMesures
                commune={commune}
                parameterId={id}
                unit={unit}
                annee={annee}
                variant={variant}
              />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}
