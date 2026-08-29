import { useState } from "react";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";

import { NO_DATA_COLOR, PARAMETERS, formatRange, type ParameterId } from "./parameters";
import type { UnitId } from "./units";

type LegendProps = {
  parameterId: ParameterId;
  unitId: UnitId;
  onUnitChange: (unitId: UnitId) => void;
};

type SwatchProps = {
  color: string;
  label: string;
  range?: string;
};

function LegendRow({ color, label, range }: SwatchProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Box
        sx={{
          width: 14,
          height: 14,
          flexShrink: 0,
          borderRadius: 0.5,
          backgroundColor: color,
          border: 1,
          borderColor: "divider",
        }}
      />
      <Typography variant="caption" sx={{ flexGrow: 1 }}>
        {label}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
        {range}
      </Typography>
    </Stack>
  );
}

/** Legend for the choropleth, so the mapped value is never conveyed by color alone. */
export function Legend({ parameterId, unitId, onUnitChange }: LegendProps) {
  const parameter = PARAMETERS[parameterId];
  const unit = parameter.units[unitId] ?? parameter.units[parameter.defaultUnitId];

  // On a phone-sized screen a CommunePanel/ZonePanel bottom sheet takes the full width at
  // the bottom, so the legend moves to a compact bar near the top instead of overlapping it,
  // and starts collapsed since the class list would otherwise dominate a small viewport.
  const isMobile = useMediaQuery("(max-width:599.95px)");
  const [expanded, setExpanded] = useState(!isMobile);

  return (
    <Paper
      elevation={3}
      sx={{
        position: "absolute",
        top: { xs: 8, sm: "auto" },
        bottom: { xs: "auto", sm: 32 },
        left: 16,
        // clear the top-right NavigationControl on phones so the collapse button
        // does not tuck under the map zoom +/- buttons
        right: { xs: 56, sm: "auto" },
        zIndex: 1,
        p: { xs: 1, sm: 1.5 },
        minWidth: { xs: 0, sm: 250 },
      }}
    >
      <Box>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            {parameter.label}
          </Typography>
          {isMobile && (
            <IconButton
              size="small"
              onClick={() => setExpanded((current) => !current)}
              aria-label={expanded ? "Réduire la légende" : "Développer la légende"}
              sx={{ p: 0.25 }}
            >
              {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          )}
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <Typography variant="caption" color="text.secondary">
            en {unit.name}
          </Typography>
          <Tooltip
            arrow
            placement="top-start"
            title={
              <Box sx={{ p: 0.5, maxWidth: 260 }}>
                <Typography variant="caption" sx={{ display: "block", fontFamily: "monospace" }}>
                  {parameter.unitsHelp.lines[unit.id]}
                </Typography>
                <Typography variant="caption" sx={{ display: "block", mt: 1 }}>
                  Source :{" "}
                  <Link
                    href={parameter.unitsHelp.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    color="inherit"
                  >
                    {parameter.unitsHelp.sourceLabel}
                  </Link>
                </Typography>
              </Box>
            }
          >
            <HelpOutlineIcon sx={{ fontSize: 14, color: "text.secondary", cursor: "help" }} />
          </Tooltip>
        </Stack>
      </Box>

      <Collapse in={expanded}>
        <Stack spacing={0.25} sx={{ mt: 1 }}>
          {parameter.classes.map((entry, index) => (
            <LegendRow
              key={entry.min}
              color={entry.color}
              label={entry.label}
              range={formatRange(parameter.classes, index, unit)}
            />
          ))}
          <LegendRow color={NO_DATA_COLOR} label="Non renseignée" />
        </Stack>

        {parameter.unitOrder.length > 1 && (
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={unitId}
            // null arrives when the active button is clicked again: keep the current unit
            // rather than leaving the map with no unit at all.
            onChange={(_event, next: UnitId | null) => {
              if (next !== null) {
                onUnitChange(next);
              }
            }}
            aria-label="Unité"
            sx={{ mt: 1.5 }}
          >
            {parameter.unitOrder.map((id) => (
              <ToggleButton key={id} value={id} sx={{ py: 0.25, textTransform: "none" }}>
                <Typography variant="caption">{parameter.units[id].symbol}</Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}
      </Collapse>
    </Paper>
  );
}
