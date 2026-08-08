import { useState } from "react";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";

import { CommunePanel } from "./CommunePanel";
import type { CommuneSummary } from "./communes";
import { Legend } from "./Legend";
import { MapView } from "./MapView";
import { PARAMETERS, type ParameterId } from "./parameters";
import { TopBar } from "./TopBar";
import { useColorMode } from "./theme";
import type { UnitId } from "./units";

const DEFAULT_PARAMETER_ID: ParameterId = "durete";

function App() {
  const { mode, theme, toggleMode } = useColorMode();
  const [parameterId, setParameterId] = useState<ParameterId>(DEFAULT_PARAMETER_ID);
  const [unitId, setUnitId] = useState<UnitId>(PARAMETERS[DEFAULT_PARAMETER_ID].defaultUnitId);
  const [selectedCommune, setSelectedCommune] = useState<CommuneSummary | null>(null);

  function handleParameterChange(next: ParameterId) {
    setParameterId(next);
    // Units are parameter-specific (e.g. ppm makes no sense for pH): switch to the new
    // parameter's default rather than carrying over an id it doesn't recognise.
    setUnitId(PARAMETERS[next].defaultUnitId);
  }

  const unit = PARAMETERS[parameterId].units[unitId] ?? PARAMETERS[parameterId].units[PARAMETERS[parameterId].defaultUnitId];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", flexDirection: "column", width: "100%", height: "100vh" }}>
        <TopBar
          onSelectCommune={setSelectedCommune}
          parameterId={parameterId}
          onParameterChange={handleParameterChange}
        />
        <Box sx={{ position: "relative", flexGrow: 1, minHeight: 0 }}>
          <MapView
            parameterId={parameterId}
            unit={unit}
            selectedCommune={selectedCommune}
            onSelectCommune={setSelectedCommune}
          />
          <Legend
            mode={mode}
            onToggleMode={toggleMode}
            parameterId={parameterId}
            unitId={unitId}
            onUnitChange={setUnitId}
          />
          {selectedCommune !== null && (
            <CommunePanel
              commune={selectedCommune}
              parameterId={parameterId}
              unit={unit}
              onClose={() => setSelectedCommune(null)}
            />
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;