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
import { ZonePanel } from "./ZonePanel";

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

  // Drilling into a commune from ZonePanel crosses levels (e.g. clicking a commune row while
  // viewing a departement), unlike search/map-click selection which is always scoped to the
  // level already on screen: switch level too, so the map/legend follow the panel instead of
  // showing a commune detail over departement-level tiles.
  function handleDrillIntoCommune(entity: EntitySummary) {
    setLevel("commune");
    handleSelectEntity(entity);
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
          {selectedEntity !== null && selectedEntity.level !== "commune" && (
            <ZonePanel
              entity={selectedEntity}
              parameterId={parameterId}
              unit={unit}
              onSelectCommune={handleDrillIntoCommune}
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