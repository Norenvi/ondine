import { useEffect, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import SearchIcon from "@mui/icons-material/Search";

import { communeLabel, loadCommuneIndex, type CommuneSummary } from "./communes";

type TopBarProps = {
  onSelectCommune: (commune: CommuneSummary) => void;
};

// Matching against 34000+ communes on every keystroke is fine, but capping the
// rendered list keeps the dropdown itself cheap to paint.
const filterOptions = createFilterOptions<CommuneSummary>({
  limit: 50,
  stringify: (option) => option.name,
});

/** App-wide top bar: title on the left, commune search on the right. */
export function TopBar({ onSelectCommune }: TopBarProps) {
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
          sx={{ ml: "auto", width: { xs: "45%", sm: 260 } }}
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
      </Toolbar>
    </AppBar>
  );
}
