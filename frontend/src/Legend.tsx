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

import { NO_DATA_COLOR, PARAMETERS, formatRange, type ParameterId } from "./parameters";
import type { ColorMode } from "./theme";
import type { UnitId } from "./units";

type LegendProps = {
  mode: ColorMode;
  onToggleMode: () => void;
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
export function Legend({ mode, onToggleMode, parameterId, unitId, onUnitChange }: LegendProps) {
  const isDark = mode === "dark";
  const parameter = PARAMETERS[parameterId];
  const unit = parameter.units[unitId] ?? parameter.units[parameter.defaultUnitId];

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
          <Typography variant="subtitle2">{parameter.label}</Typography>
          <Typography variant="caption" color="text.secondary">
            en {unit.name}
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
    </Paper>
  );
}
