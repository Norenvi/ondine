import { useEffect, useState, type ReactElement } from "react";
import AppBar from "@mui/material/AppBar";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import InputAdornment from "@mui/material/InputAdornment";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import BlurOnIcon from "@mui/icons-material/BlurOn";
import BoltIcon from "@mui/icons-material/Bolt";
import GrassIcon from "@mui/icons-material/Grass";
import OpacityIcon from "@mui/icons-material/Opacity";
import SanitizerIcon from "@mui/icons-material/Sanitizer";
import ScienceIcon from "@mui/icons-material/Science";
import SearchIcon from "@mui/icons-material/Search";

import { communeLabel, loadCommuneIndex, type CommuneSummary } from "./communes";
import { PARAMETERS, PARAMETER_ORDER, type ParameterId } from "./parameters";

type TopBarProps = {
  onSelectCommune: (commune: CommuneSummary) => void;
  parameterId: ParameterId;
  onParameterChange: (parameterId: ParameterId) => void;
};

// Matching against 34000+ communes on every keystroke is fine, but capping the
// rendered list keeps the dropdown itself cheap to paint.
const filterOptions = createFilterOptions<CommuneSummary>({
  limit: 50,
  stringify: (option) => option.name,
});

const PARAMETER_ICONS: Record<ParameterId, ReactElement> = {
  durete: <OpacityIcon fontSize="small" />,
  ph: <ScienceIcon fontSize="small" />,
  nitrates: <GrassIcon fontSize="small" />,
  conductivite: <BoltIcon fontSize="small" />,
  turbidite: <BlurOnIcon fontSize="small" />,
  chlore_libre: <SanitizerIcon fontSize="small" />,
};

/** App-wide top bar: title on the left, commune search + parameter picker on the right. */
export function TopBar({ onSelectCommune, parameterId, onParameterChange }: TopBarProps) {
  const [communes, setCommunes] = useState<CommuneSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCommuneIndex()
      .then(setCommunes)
      .finally(() => setLoading(false));
  }, []);

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
          <Autocomplete
            size="small"
            options={communes}
            loading={loading}
            filterOptions={filterOptions}
            getOptionLabel={(option) => communeLabel(option.name, option.code)}
            isOptionEqualToValue={(option, value) => option.code === value.code}
            value={null}
            blurOnSelect
            clearOnBlur
            onChange={(_event, value) => {
              if (value !== null) {
                onSelectCommune(value);
              }
            }}
            sx={{ width: { xs: "45vw", sm: 260 } }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Rechercher une commune"
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
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
