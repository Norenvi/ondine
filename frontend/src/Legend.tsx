import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";

import { HARDNESS_CLASSES, NO_DATA_COLOR, formatRange } from "./hardness";
import type { ColorMode } from "./theme";
import { HARDNESS_UNITS, UNIT_ORDER, type HardnessUnitId } from "./units";

type LegendProps = {
  mode: ColorMode;
  onToggleMode: () => void;
  unitId: HardnessUnitId;
  onUnitChange: (unitId: HardnessUnitId) => void;
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

/** Legend for the choropleth, so hardness is never conveyed by color alone. */
export function Legend({ mode, onToggleMode, unitId, onUnitChange }: LegendProps) {
  const isDark = mode === "dark";
  const unit = HARDNESS_UNITS[unitId];

  return (
    <Paper
      elevation={3}
      sx={{ position: "absolute", bottom: 32, left: 16, zIndex: 1, p: 1.5, minWidth: 250 }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="subtitle2">Dureté de l'eau</Typography>
          <Typography variant="caption" color="text.secondary">
            Titre hydrotimétrique, en {unit.name}
          </Typography>
        </Box>
        <Tooltip title={isDark ? "Passer en mode clair" : "Passer en mode sombre"}>
          <IconButton size="small" onClick={onToggleMode}>
            {isDark ? (
              <LightModeOutlinedIcon fontSize="small" />
            ) : (
              <DarkModeOutlinedIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack spacing={0.25} sx={{ mt: 1 }}>
        {HARDNESS_CLASSES.map((entry, index) => (
          <LegendRow
            key={entry.min}
            color={entry.color}
            label={entry.label}
            range={formatRange(index, unit)}
          />
        ))}
        <LegendRow color={NO_DATA_COLOR} label="Non renseignée" />
      </Stack>

      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={unitId}
        // null arrives when the active button is clicked again: keep the current unit
        // rather than leaving the map with no unit at all.
        onChange={(_event, next: HardnessUnitId | null) => {
          if (next !== null) {
            onUnitChange(next);
          }
        }}
        aria-label="Unité de dureté"
        sx={{ mt: 1.5 }}
      >
        {UNIT_ORDER.map((id) => (
          <ToggleButton key={id} value={id} sx={{ py: 0.25, textTransform: "none" }}>
            <Typography variant="caption">{HARDNESS_UNITS[id].symbol}</Typography>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Paper>
  );
}