import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import AppBar from "@mui/material/AppBar";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import AirIcon from "@mui/icons-material/Air";
import BiotechIcon from "@mui/icons-material/Biotech";
import BlurOnIcon from "@mui/icons-material/BlurOn";
import BoltIcon from "@mui/icons-material/Bolt";
import BubbleChartIcon from "@mui/icons-material/BubbleChart";
import BuildIcon from "@mui/icons-material/Build";
import CloseIcon from "@mui/icons-material/Close";
import CompostIcon from "@mui/icons-material/Compost";
import CoronavirusIcon from "@mui/icons-material/Coronavirus";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import DiamondIcon from "@mui/icons-material/Diamond";
import FilterVintageIcon from "@mui/icons-material/FilterVintage";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import GrainIcon from "@mui/icons-material/Grain";
import GrassIcon from "@mui/icons-material/Grass";
import HardwareIcon from "@mui/icons-material/Hardware";
import HexagonIcon from "@mui/icons-material/Hexagon";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import OpacityIcon from "@mui/icons-material/Opacity";
import PestControlIcon from "@mui/icons-material/PestControl";
import PlumbingIcon from "@mui/icons-material/Plumbing";
import RecyclingIcon from "@mui/icons-material/Recycling";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import SanitizerIcon from "@mui/icons-material/Sanitizer";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";
import ScienceIcon from "@mui/icons-material/Science";
import SearchIcon from "@mui/icons-material/Search";
import SpaIcon from "@mui/icons-material/Spa";
import TableRowsIcon from "@mui/icons-material/TableRows";
import TerrainIcon from "@mui/icons-material/Terrain";
import TollIcon from "@mui/icons-material/Toll";
import WaterDropIcon from "@mui/icons-material/WaterDrop";
import WavesIcon from "@mui/icons-material/Waves";

import type { NiveauZoom } from "./api";
import { communeLabel } from "./communes";
import { loadEntityIndex, type EntitySummary } from "./entities";
import { LEVEL_CONFIG, LEVEL_ORDER } from "./levels";
import { PARAMETERS, PARAMETER_GROUPS, type ParameterId } from "./parameters";
import type { ColorMode } from "./theme";

type TopBarProps = {
  onSelectEntity: (entity: EntitySummary) => void;
  parameterId: ParameterId;
  onParameterChange: (parameterId: ParameterId) => void;
  mode: ColorMode;
  onToggleMode: () => void;
  onOpenLeaderboard: () => void;
  onOpenAbout: () => void;
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
  nitrites: <CompostIcon fontSize="small" />,
  ammonium: <AirIcon fontSize="small" />,
  conductivite: <BoltIcon fontSize="small" />,
  turbidite: <BlurOnIcon fontSize="small" />,
  chlore_libre: <SanitizerIcon fontSize="small" />,
  ecoli: <CoronavirusIcon fontSize="small" />,
  chlorures: <WavesIcon fontSize="small" />,
  sulfates: <GrainIcon fontSize="small" />,
  calcium: <FitnessCenterIcon fontSize="small" />,
  magnesium: <SpaIcon fontSize="small" />,
  fer: <BuildIcon fontSize="small" />,
  aluminium: <Inventory2Icon fontSize="small" />,
  manganese: <HexagonIcon fontSize="small" />,
  sodium: <RestaurantIcon fontSize="small" />,
  potassium: <ScatterPlotIcon fontSize="small" />,
  fluorures: <WaterDropIcon fontSize="small" />,
  bore: <FilterVintageIcon fontSize="small" />,
  plomb: <PlumbingIcon fontSize="small" />,
  cuivre: <HardwareIcon fontSize="small" />,
  arsenic: <TerrainIcon fontSize="small" />,
  selenium: <DiamondIcon fontSize="small" />,
  nickel: <TollIcon fontSize="small" />,
  bisphenol_a: <RecyclingIcon fontSize="small" />,
  thm: <BubbleChartIcon fontSize="small" />,
  pesticides: <PestControlIcon fontSize="small" />,
  pfas: <BiotechIcon fontSize="small" />,
};

/** App-wide top bar: title on the left, commune search + parameter picker on the right. */
export function TopBar({
  onSelectEntity,
  parameterId,
  onParameterChange,
  mode,
  onToggleMode,
  onOpenLeaderboard,
  onOpenAbout,
  level,
  onLevelChange,
}: TopBarProps) {
  const isDark = mode === "dark";
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useMediaQuery("(max-width:599.95px)");
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // Selecting a search result or opening the leaderboard both replace the map/panel content
  // the drawer was covering: closing it is what the user actually came here to do. Changing
  // level or parameter alone does not, those are often picked together before moving on.
  function handleSelectEntity(entity: EntitySummary) {
    setDrawerOpen(false);
    onSelectEntity(entity);
  }

  function handleOpenLeaderboard() {
    setDrawerOpen(false);
    onOpenLeaderboard();
  }

  function handleOpenAbout() {
    setDrawerOpen(false);
    onOpenAbout();
  }

  // Parameter picker: a compact Select in the toolbar on desktop, but the mobile drawer has
  // room to spare, so there it becomes a plain always-visible list (no extra tap to open a
  // menu, current parameter always in view).
  const parameterPicker: ReactNode = isMobile ? (
    <List
      dense
      disablePadding
      aria-label="Parametre"
      sx={{
        backgroundColor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
      }}
    >
      {PARAMETER_GROUPS.flatMap((group) => [
        <ListSubheader
          key={`group-${group.label}`}
          disableSticky
          sx={{ lineHeight: "28px", backgroundColor: "transparent" }}
        >
          {group.label}
        </ListSubheader>,
        ...group.ids.map((id) => (
          <ListItemButton
            key={id}
            dense
            selected={id === parameterId}
            onClick={() => onParameterChange(id)}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>{PARAMETER_ICONS[id]}</ListItemIcon>
            <ListItemText slotProps={{ primary: { variant: "body2" } }}>
              {PARAMETERS[id].label}
            </ListItemText>
          </ListItemButton>
        )),
      ])}
    </List>
  ) : (
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
        width: { xs: "100%", sm: "auto" },
        "& .MuiSelect-select": { py: 0.75, display: "flex", alignItems: "center" },
      }}
    >
      {PARAMETER_GROUPS.flatMap((group) => [
        <ListSubheader key={`group-${group.label}`}>{group.label}</ListSubheader>,
        ...group.ids.map((id) => (
          <MenuItem key={id} value={id} dense>
            <ListItemIcon sx={{ minWidth: 32 }}>{PARAMETER_ICONS[id]}</ListItemIcon>
            <ListItemText slotProps={{ primary: { variant: "body2" } }}>
              {PARAMETERS[id].label}
            </ListItemText>
          </MenuItem>
        )),
      ])}
    </Select>
  );

  // Same content either way, reused as-is inside the drawer on mobile (column direction/full
  // width already matches the xs styles below) and inline in the toolbar on larger screens.
  const controls: ReactNode = (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      sx={{
        ml: { xs: 0, sm: "auto" },
        width: { xs: "100%", sm: "auto" },
        alignItems: { xs: "stretch", sm: "center" },
      }}
    >
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
          <ToggleButton
            key={id}
            value={id}
            sx={{ py: 0.75, px: 1.25, textTransform: "none", flex: { xs: 1, sm: "initial" } }}
          >
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
            handleSelectEntity(value);
          }
        }}
        sx={{ width: { xs: "100%", sm: 340 } }}
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
                  fontSize: "0.75rem",
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
      {parameterPicker}
      {/* Leaderboard + theme toggle stay grouped in their own row, right-aligned, even
          when everything above them has stacked into a column. */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: { xs: "flex-end", sm: "flex-start" } }}>
        <Tooltip title={`Liste des ${LEVEL_CONFIG[level].pluralLabel}`}>
          <IconButton size="small" onClick={handleOpenLeaderboard}>
            <TableRowsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {/* Divider only separates within the row layout: on mobile the two controls are
            already visually grouped in their own row, so a divider would just be noise. */}
        <Divider orientation="vertical" flexItem sx={{ my: 1, display: { xs: "none", sm: "block" } }} />
        <Tooltip title="À propos">
          <IconButton size="small" onClick={handleOpenAbout}>
            <InfoOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
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
    </Stack>
  );

  return (
    <AppBar position="static" sx={{ zIndex: 2 }}>
      <Toolbar variant="dense" sx={{ gap: 1.5, minHeight: 48 }}>
        <Typography
          variant="h5"
          component="div"
          sx={{ flexShrink: 0, fontSize: "1.625rem", fontWeight: 200, letterSpacing: "0.12em" }}
        >
          Ondine
        </Typography>
        {isMobile ? (
          <IconButton
            size="small"
            onClick={() => setDrawerOpen(true)}
            aria-label="Ouvrir le menu"
            sx={{ ml: "auto" }}
          >
            <MenuIcon fontSize="small" />
          </IconButton>
        ) : (
          controls
        )}
      </Toolbar>
      <Drawer anchor="right" open={isMobile && drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box
          sx={{
            width: "85vw",
            maxWidth: 340,
            p: 2,
            height: "100%",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Typography variant="subtitle1">Réglages</Typography>
            <IconButton size="small" onClick={() => setDrawerOpen(false)} aria-label="Fermer">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
          {controls}
        </Box>
      </Drawer>
    </AppBar>
  );
}
