import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

import { CommuneDetail } from "./CommuneDetail";
import { communeLabel, type CommuneSummary } from "./communes";
import { type ParameterId } from "./parameters";
import { type Unit } from "./units";

type CommunePanelProps = {
  commune: CommuneSummary;
  parameterId: ParameterId;
  unit: Unit;
  annee: number;
  /** Opening a Bulletin row for another parameter recolours the choropleth to match. */
  onParameterChange: (id: ParameterId) => void;
  onClose: () => void;
};

/**
 * Map-side detail card for a commune selected via search or map click. Body is the shared
 * CommuneDetail (parameter tab + Bulletin tab); here the Bulletin drives the map, opening a
 * row switches the choropleth to that parameter.
 */
export function CommunePanel({
  commune,
  parameterId,
  unit,
  annee,
  onParameterChange,
  onClose,
}: CommunePanelProps) {
  const { code, name } = commune;

  return (
    <Paper
      elevation={4}
      sx={{
        position: "absolute",
        // Full-width bottom sheet on a phone screen instead of a small corner card, so it
        // doesn't get squeezed into an unreadable sliver next to the map. On desktop the
        // bottom offset clears the centered Timeline (bottom: 24, ~48px tall) so its year
        // ticks stay reachable while the panel is open.
        bottom: { xs: 0, sm: 88 },
        // Clears the MapLibre zoom control (top-right) so a tall panel doesn't sit under it.
        right: { xs: 0, sm: 56 },
        left: { xs: 0, sm: "auto" },
        zIndex: 1,
        p: 0,
        width: { xs: "100%", sm: 720 },
        maxWidth: { xs: "100%", sm: "calc(100vw - 72px)" },
        maxHeight: { xs: "58vh", sm: "78vh" },
        borderRadius: { xs: 0, sm: 1 },
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ flexShrink: 0, alignItems: "center", px: 2, pt: 1, pb: 0.5 }}
      >
        <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
          {communeLabel(name, code)}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Fermer" sx={{ mr: -0.5 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      <CommuneDetail
        commune={commune}
        parameterId={parameterId}
        unit={unit}
        annee={annee}
        variant="compact"
        onParameterChange={onParameterChange}
      />
    </Paper>
  );
}
