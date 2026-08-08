import { useState } from "react";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";

import { CommunePanel } from "./CommunePanel";
import type { CommuneSummary } from "./communes";
import { Legend } from "./Legend";
import { MapView } from "./MapView";
import { TopBar } from "./TopBar";
import { useColorMode } from "./theme";
import { DEFAULT_UNIT_ID, HARDNESS_UNITS, type HardnessUnitId } from "./units";

function App() {
  const { mode, theme, toggleMode } = useColorMode();
  const [unitId, setUnitId] = useState<HardnessUnitId>(DEFAULT_UNIT_ID);
  const [selectedCommune, setSelectedCommune] = useState<CommuneSummary | null>(null);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", flexDirection: "column", width: "100%", height: "100vh" }}>
        <TopBar onSelectCommune={setSelectedCommune} />
        <Box sx={{ position: "relative", flexGrow: 1, minHeight: 0 }}>
          <MapView
            unitId={unitId}
            selectedCommune={selectedCommune}
            onSelectCommune={setSelectedCommune}
          />
          <Legend
            mode={mode}
            onToggleMode={toggleMode}
            unitId={unitId}
            onUnitChange={setUnitId}
          />
          {selectedCommune !== null && (
            <CommunePanel
              commune={selectedCommune}
              unit={HARDNESS_UNITS[unitId]}
              onClose={() => setSelectedCommune(null)}
            />
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;