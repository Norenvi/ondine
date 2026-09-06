import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

import { CommuneMesures } from "./CommuneMesures";
import { communeLabel, type CommuneSummary } from "./communes";
import { type ParameterId } from "./parameters";
import { type Unit } from "./units";

type CommunePanelProps = {
  commune: CommuneSummary;
  parameterId: ParameterId;
  unit: Unit;
  annee: number;
  onClose: () => void;
};

/** Map-side detail card shown for a commune selected via search or map click. */
export function CommunePanel({ commune, parameterId, unit, annee, onClose }: CommunePanelProps) {
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
        right: { xs: 0, sm: 16 },
        left: { xs: 0, sm: "auto" },
        zIndex: 1,
        p: 0,
        width: { xs: "100%", sm: 600 },
        maxWidth: { xs: "100%", sm: "calc(90vw - 32px)" },
        maxHeight: { xs: "55vh", sm: "70vh" },
        borderRadius: { xs: 0, sm: 1 },
        overflowY: "auto",
      }}
    >
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 3,
          px: 2,
          pt: 2,
          pb: 1.5,
          bgcolor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
            {communeLabel(name, code)}
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Fermer" sx={{ mt: -0.5, mr: -0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      <Box sx={{ px: 2, pt: 1, pb: 2 }}>
        <CommuneMesures commune={commune} parameterId={parameterId} unit={unit} annee={annee} />
      </Box>
    </Paper>
  );
}
