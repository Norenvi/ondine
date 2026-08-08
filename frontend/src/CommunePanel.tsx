import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

import { communeLabel, type CommuneSummary } from "./communes";
import { classifyHardness, contrastText } from "./hardness";
import { formatDate } from "./format";
import { formatHardness, type HardnessUnit } from "./units";

type CommunePanelProps = {
  commune: CommuneSummary;
  unit: HardnessUnit;
  onClose: () => void;
};

/** Bigger detail card shown for a commune selected via search, placeholder content for now. */
export function CommunePanel({ commune, unit, onClose }: CommunePanelProps) {
  const { code, name, hardnessMean, sampleCount, latestSample } = commune;
  const hardnessClass = hardnessMean === null ? null : classifyHardness(hardnessMean);

  return (
    <Paper
      elevation={4}
      sx={{ position: "absolute", bottom: 32, right: 16, zIndex: 1, p: 2, minWidth: 300, maxWidth: 340 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
          {communeLabel(name, code)}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Fermer">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      {hardnessMean === null || hardnessClass === null ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Aucune mesure disponible
        </Typography>
      ) : (
        <Box sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="h4" component="p" sx={{ lineHeight: 1.2 }}>
              {formatHardness(hardnessMean, unit)}
            </Typography>
            <Chip
              size="small"
              label={hardnessClass.label}
              sx={{
                borderRadius: 0.75,
                backgroundColor: hardnessClass.color,
                color: contrastText(hardnessClass.color),
                fontWeight: 300,
              }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {sampleCount ?? "?"} mesure(s)
            {latestSample ? `, dernière le ${formatDate(latestSample)}` : ""}
          </Typography>
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      <Typography variant="caption" color="text.secondary">
        Code INSEE : {commune.code}
      </Typography>
    </Paper>
  );
}
