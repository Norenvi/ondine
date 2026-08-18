import { useEffect, useState, type ReactElement } from "react";
import AppBar from "@mui/material/AppBar";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import BlurOnIcon from "@mui/icons-material/BlurOn";
import BoltIcon from "@mui/icons-material/Bolt";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import GrassIcon from "@mui/icons-material/Grass";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import OpacityIcon from "@mui/icons-material/Opacity";
import SanitizerIcon from "@mui/icons-material/Sanitizer";
import ScienceIcon from "@mui/icons-material/Science";
import SearchIcon from "@mui/icons-material/Search";

import type { NiveauZoom } from "./api";
import { communeLabel } from "./communes";
import { loadEntityIndex, type EntitySummary } from "./entities";
import { LEVEL_CONFIG, LEVEL_ORDER } from "./levels";
import { PARAMETERS, PARAMETER_ORDER, type ParameterId } from "./parameters";
import type { ColorMode } from "./theme";

type TopBarProps = {
  onSelectEntity: (entity: EntitySummary) => void;
  parameterId: ParameterId;
  onParameterChange: (parameterId: ParameterId) => void;
  mode: ColorMode;
  onToggleMode: () => void;
  onOpenLeaderboard: () => void;
  level: NiveauZoom;
  onLevelChange: (level: NiveauZoom) => void;
};

// Matching against 34000+ communes on every keystroke is fine, but capping the
// rendered list keeps the dropdown itself cheap to paint.
const filterOptions = createFilterOptions<EntitySummary>({
  limit: 50,
  stringify: (option) => option.name,
});

/** Only commune and departement codes mean anything to a reader alongside the name:
 * a commune's dash-department suffix from communeLabel, a departement's own code in
 * parentheses (e.g. "Ain (01)"). EPCI/region codes (SIREN, or a 2-digit code that would be
 * mistaken for a departement) aren't meaningful shown this way. */
function entityOptionLabel(level: NiveauZoom, entity: EntitySummary): string {
  if (level === "commune") {
    return communeLabel(entity.name, entity.code);
  }
  if (level === "departement") {
    return `${entity.name} (${entity.code})`;
  }
  return entity.name;
}

const PARAMETER_ICONS: Record<ParameterId, ReactElement> = {
  durete: <OpacityIcon fontSize="small" />,
  ph: <ScienceIcon fontSize="small" />,
  nitrates: <GrassIcon fontSize="small" />,
  conductivite: <BoltIcon fontSize="small" />,
  turbidite: <BlurOnIcon fontSize="small" />,
  chlore_libre: <SanitizerIcon fontSize="small" />,
};

/** App-wide top bar: title on the left, commune search + parameter picker on the right. */
export function TopBar({
  onSelectEntity,
  parameterId,
  onParameterChange,
  mode,
  onToggleMode,
  onOpenLeaderboard,
  level,
  onLevelChange,
}: TopBarProps) {
  const isDark = mode === "dark";
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Reloads (from cache after the first fetch per level) whenever the level switch changes,
  // so the search box always matches whatever the map is currently showing.
  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    loadEntityIndex(level)
      .then((result) => {
        if (!cancelled) {
          setEntities(result);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [level]);

  return (
    <AppBar position="static" color="default" elevation={1} sx={{ zIndex: 2 }}>
      <Toolbar variant="dense" sx={{ gap: 2, minHeight: 48 }}>
        <Typography
          variant="h5"
          component="div"
          sx={{ flexShrink: 0, fontWeight: 100, letterSpacing: "0.1em" }}
        >
          Ondine
        </Typography>
        <Stack direction="row" spacing={1} sx={{ ml: "auto", alignItems: "center" }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={level}
            // null arrives when the active button is clicked again: keep the current level
            // rather than leaving the map with nothing selected.
            onChange={(_event, next: NiveauZoom | null) => {
              if (next !== null) {
                onLevelChange(next);
              }
            }}
            aria-label="Niveau"
            sx={{ backgroundColor: "background.paper" }}
          >
            {LEVEL_ORDER.map((id) => (
              <ToggleButton key={id} value={id} sx={{ py: 0.75, px: 1.25, textTransform: "none" }}>
                <Typography variant="caption">{LEVEL_CONFIG[id].label}</Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Autocomplete
            key={level}
            size="small"
            options={entities}
            loading={loading}
            filterOptions={filterOptions}
            getOptionLabel={(option) => entityOptionLabel(level, option)}
            isOptionEqualToValue={(option, value) => option.code === value.code}
            value={null}
            blurOnSelect
            clearOnBlur
            onChange={(_event, value) => {
              if (value !== null) {
                onSelectEntity(value);
              }
            }}
            sx={{ width: { xs: "45vw", sm: 260 } }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={`Rechercher ${LEVEL_CONFIG[level].searchLabel}`}
                slotProps={{
                  ...params.slotProps,
                  input: {
                    ...params.slotProps.input,
                    startAdornment: (
                      <>
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                        {params.slotProps.input.startAdornment}
                      </>
                    ),
                    sx: {
                      fontSize: "0.8125rem",
                      py: 0.5,
                      alignItems: "center",
                      "& input": { py: 0.25 },
                      "& .MuiInputAdornment-root": { marginTop: "0 !important" },
                    },
                  },
                }}
                sx={{ backgroundColor: "background.paper" }}
              />
            )}
          />
          <Select<ParameterId>
            size="small"
            value={parameterId}
            onChange={(event: SelectChangeEvent) => onParameterChange(event.target.value as ParameterId)}
            renderValue={(value) => (
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                {PARAMETER_ICONS[value]}
                <Typography variant="caption">{PARAMETERS[value].label}</Typography>
              </Stack>
            )}
            sx={{
              backgroundColor: "background.paper",
              fontSize: "0.8125rem",
              "& .MuiSelect-select": { py: 0.75, display: "flex", alignItems: "center" },
            }}
          >
            {PARAMETER_ORDER.map((id) => (
              <MenuItem key={id} value={id} dense>
                <ListItemIcon sx={{ minWidth: 32 }}>{PARAMETER_ICONS[id]}</ListItemIcon>
                <ListItemText slotProps={{ primary: { variant: "body2" } }}>
                  {PARAMETERS[id].label}
                </ListItemText>
              </MenuItem>
            ))}
          </Select>
          <Tooltip title="Classement des communes">
            <IconButton size="small" onClick={onOpenLeaderboard}>
              <LeaderboardIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        {/* Separated from the search/parameter/leaderboard group above: those are data
            features, the theme toggle is an app setting and reads as unrelated to them. */}
        <Divider orientation="vertical" flexItem sx={{ mx: 2, my: 1 }} />
        <Tooltip title={isDark ? "Passer en mode clair" : "Passer en mode sombre"}>
          <IconButton size="small" onClick={onToggleMode}>
            {isDark ? (
              <LightModeOutlinedIcon fontSize="small" />
            ) : (
              <DarkModeOutlinedIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
