import { useState } from "react";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";

import { Bulletin } from "./Bulletin";
import { CommuneMesures, type MesuresVariant } from "./CommuneMesures";
import type { CommuneSummary } from "./communes";
import { PARAMETERS, type ParameterId } from "./parameters";
import type { Unit } from "./units";

type DetailTab = "parametre" | "bulletin";

type CommuneDetailProps = {
  commune: Pick<CommuneSummary, "code" | "name">;
  parameterId: ParameterId;
  unit: Unit;
  annee: number;
  /** "compact" (map-side CommunePanel) or "full" (Leaderboard drill-down). */
  variant: MesuresVariant;
  /** Map-side only: opening a Bulletin row for another parameter recolours the choropleth. */
  onParameterChange?: (id: ParameterId) => void;
};

/**
 * Shared body of both commune detail surfaces (map-side CommunePanel, Leaderboard drill).
 * A tab for the active parameter (CommuneMesures) and a tab for the full Bulletin. Own flex
 * column: fixed tabs, scrolling content, so the Bulletin's sticky table header has a scroll
 * container to attach to. The host renders its own title / breadcrumb / close above this.
 */
export function CommuneDetail({
  commune,
  parameterId,
  unit,
  annee,
  variant,
  onParameterChange,
}: CommuneDetailProps) {
  const [tab, setTab] = useState<DetailTab>("parametre");

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", px: 2 }}>
      <Tabs
        value={tab}
        onChange={(_event, next: DetailTab) => setTab(next)}
        variant="fullWidth"
        sx={{
          flexShrink: 0,
          minHeight: 36,
          borderBottom: "1px solid",
          borderColor: "divider",
          "& .MuiTab-root": { minHeight: 36, textTransform: "none" },
        }}
      >
        <Tab value="parametre" label={PARAMETERS[parameterId].label} />
        <Tab value="bulletin" label="Bulletin" />
      </Tabs>
      {/* pt is on the inner content, not this scroll box, so the Bulletin's sticky table
          header pins flush against the tabs (top: 0) instead of leaving a blank strip. */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", pb: 2 }}>
        {tab === "parametre" ? (
          <Box sx={{ pt: 1 }}>
            <CommuneMesures
              commune={commune}
              parameterId={parameterId}
              unit={unit}
              annee={annee}
              variant={variant}
            />
          </Box>
        ) : (
          <Bulletin
            commune={commune}
            annee={annee}
            variant={variant}
            initialExpanded={parameterId}
            onParameterChange={onParameterChange}
          />
        )}
      </Box>
    </Box>
  );
}
