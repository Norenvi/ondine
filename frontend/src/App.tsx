import { useState } from "react";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";

import { Legend } from "./Legend";
import { MapView } from "./MapView";
import { useColorMode } from "./theme";
import { DEFAULT_UNIT_ID, type HardnessUnitId } from "./units";

function App() {
  const { mode, theme, toggleMode } = useColorMode();
  const [unitId, setUnitId] = useState<HardnessUnitId>(DEFAULT_UNIT_ID);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ position: "relative", width: "100%", height: "100vh" }}>
        <MapView unitId={unitId} />
        <Legend
          mode={mode}
          onToggleMode={toggleMode}
          unitId={unitId}
          onUnitChange={setUnitId}
        />
      </Box>
    </ThemeProvider>
  );
}

export default App;