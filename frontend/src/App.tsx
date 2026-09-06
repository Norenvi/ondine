import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";

import { fetchAnnees, type NiveauZoom } from "./api";
import { CommunePanel } from "./CommunePanel";
import { loadEntityIndex, type EntitySummary } from "./entities";
import { Leaderboard } from "./Leaderboard";
import { Legend } from "./Legend";
import { MapView } from "./MapView";
import { PARAMETERS, type ParameterId } from "./parameters";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";
import { useColorMode } from "./theme";
import type { UnitId } from "./units";
import { readUrlState, writeUrlState } from "./urlState";
import { ZonePanel } from "./ZonePanel";

const DEFAULT_PARAMETER_ID: ParameterId = "durete";
// Shown until GET /annees resolves and snaps the selection to the most recent year.
const FALLBACK_ANNEE = 2026;

function App() {
  const { mode, theme, toggleMode } = useColorMode();
  // Parsed once: the URL is our own replaceState output afterwards, never external navigation.
  const [initialUrl] = useState(readUrlState);

  const [parameterId, setParameterId] = useState<ParameterId>(
    initialUrl.parametre ?? DEFAULT_PARAMETER_ID,
  );
  const [unitId, setUnitId] = useState<UnitId>(() => {
    const pid = initialUrl.parametre ?? DEFAULT_PARAMETER_ID;
    return initialUrl.unite !== undefined && initialUrl.unite in PARAMETERS[pid].units
      ? initialUrl.unite
      : PARAMETERS[pid].defaultUnitId;
  });
  const [selectedEntity, setSelectedEntity] = useState<EntitySummary | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(initialUrl.classement ?? false);
  // Commune drilled inside the leaderboard, mirrored here only so it can go in the URL.
  const [leaderboardCommune, setLeaderboardCommune] = useState<string | null>(
    initialUrl.classement ? initialUrl.entite ?? null : null,
  );
  const [level, setLevel] = useState<NiveauZoom>(initialUrl.niveau ?? "commune");
  const [annees, setAnnees] = useState<number[]>([]);
  const [annee, setAnnee] = useState<number>(initialUrl.annee ?? FALLBACK_ANNEE);

  // Hold the first URL write until a URL-provided map selection has been resolved, so we
  // don't briefly rewrite the address bar without its ?entite= while the index loads. Not
  // needed for a leaderboard drill (?classement=1&entite=): that code is passed down as-is.
  const restorePendingRef = useRef(
    initialUrl.entite !== undefined && !initialUrl.classement,
  );

  // One fetch on mount: populate the timeline ticks and land on the most recent year, unless
  // the URL asked for a specific (and still available) year. On failure the fallback stays.
  useEffect(() => {
    fetchAnnees()
      .then((years) => {
        if (years.length === 0) {
          return;
        }
        setAnnees(years);
        setAnnee(
          initialUrl.annee !== undefined && years.includes(initialUrl.annee)
            ? initialUrl.annee
            : years[years.length - 1],
        );
      })
      .catch(() => undefined);
  }, [initialUrl]);

  // Restore a shared map selection: look the entity code up in its level's index, then select
  // it. A ?classement= link carries its commune differently (see leaderboardCommune), skip.
  useEffect(() => {
    if (initialUrl.entite === undefined || initialUrl.classement) {
      return;
    }
    let cancelled = false;
    loadEntityIndex(initialUrl.niveau ?? "commune")
      .then((entities) => {
        if (cancelled) {
          return;
        }
        const match = entities.find((entity) => entity.code === initialUrl.entite);
        if (match !== undefined) {
          setSelectedEntity(match);
        }
      })
      .finally(() => {
        if (!cancelled) {
          restorePendingRef.current = false;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialUrl]);

  // Mirror the shareable state into the query string on every change.
  useEffect(() => {
    if (restorePendingRef.current) {
      return;
    }
    writeUrlState({
      parametre: parameterId,
      annee,
      unite: unitId === PARAMETERS[parameterId].defaultUnitId ? undefined : unitId,
      niveau: level,
      entite: leaderboardOpen ? leaderboardCommune ?? undefined : selectedEntity?.code,
      classement: leaderboardOpen,
    });
  }, [parameterId, unitId, level, annee, selectedEntity, leaderboardOpen, leaderboardCommune]);

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
    setLeaderboardCommune(null);
    setLeaderboardOpen(true);
  }

  function handleCloseLeaderboard() {
    setLeaderboardCommune(null);
    setLeaderboardOpen(false);
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
            annee={annee}
            selectedEntity={selectedEntity}
            onSelectEntity={handleSelectEntity}
          />
          <Timeline annees={annees} annee={annee} onChange={setAnnee} />
          <Legend parameterId={parameterId} unitId={unitId} onUnitChange={setUnitId} />
          {selectedEntity !== null && selectedEntity.level === "commune" && (
            <CommunePanel
              commune={selectedEntity}
              parameterId={parameterId}
              unit={unit}
              annee={annee}
              onParameterChange={handleParameterChange}
              onClose={() => setSelectedEntity(null)}
            />
          )}
          {selectedEntity !== null && selectedEntity.level !== "commune" && (
            <ZonePanel
              entity={selectedEntity}
              parameterId={parameterId}
              unit={unit}
              annee={annee}
              onSelectCommune={handleDrillIntoCommune}
              onClose={() => setSelectedEntity(null)}
            />
          )}
          {leaderboardOpen && (
            <Leaderboard
              key={level}
              level={level}
              parameterId={parameterId}
              unit={unit}
              annee={annee}
              annees={annees}
              onAnneeChange={setAnnee}
              onSelectEntity={handleSelectEntity}
              onSelectCommune={handleDrillIntoCommune}
              initialDrilledCommune={leaderboardCommune}
              onDrilledCommuneChange={setLeaderboardCommune}
              onClose={handleCloseLeaderboard}
            />
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;