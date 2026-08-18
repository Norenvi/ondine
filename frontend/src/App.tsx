import { useState } from "react";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";

import type { NiveauZoom } from "./api";
import { CommunePanel } from "./CommunePanel";
import type { EntitySummary } from "./entities";
import { Leaderboard } from "./Leaderboard";
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
  const [selectedEntity, setSelectedEntity] = useState<EntitySummary | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [level, setLevel] = useState<NiveauZoom>("commune");

  function handleSelectEntity(entity: EntitySummary) {
    setLeaderboardOpen(false);
    setSelectedEntity(entity);
  }

  function handleOpenLeaderboard() {
    setSelectedEntity(null);
    setLeaderboardOpen(true);
  }

  function handleParameterChange(next: ParameterId) {
    setParameterId(next);
    setUnitId(PARAMETERS[next].defaultUnitId);
  }

  const unit = PARAMETERS[parameterId].units[unitId] ?? PARAMETERS[parameterId].units[PARAMETERS[parameterId].defaultUnitId];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", flexDirection: "column", width: "100%", height: "100vh" }}>
        <TopBar
          onSelectEntity={handleSelectEntity}
          parameterId={parameterId}
          onParameterChange={handleParameterChange}
          mode={mode}
          onToggleMode={toggleMode}
          onOpenLeaderboard={handleOpenLeaderboard}
          level={level}
          onLevelChange={setLevel}
        />
        <Box sx={{ position: "relative", flexGrow: 1, minHeight: 0 }}>
          <MapView
            parameterId={parameterId}
            unit={unit}
            level={level}
            selectedEntity={selectedEntity}
            onSelectEntity={handleSelectEntity}
          />
          <Legend parameterId={parameterId} unitId={unitId} onUnitChange={setUnitId} />
          {selectedEntity !== null && selectedEntity.level === "commune" && (
            <CommunePanel
              commune={selectedEntity}
              parameterId={parameterId}
              unit={unit}
              onClose={() => setSelectedEntity(null)}
            />
          )}
          {leaderboardOpen && (
            <Leaderboard
              parameterId={parameterId}
              unit={unit}
              onSelectCommune={handleSelectEntity}
              onClose={() => setLeaderboardOpen(false)}
            />
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;