import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

import { classifyHardness, contrastText } from "./hardness";
import { formatDate } from "./format";
import { formatHardness, type HardnessUnit } from "./units";

export type CommuneDetails = {
  name: string;
  hardness: number | null;
  sampleCount: number | null;
  latestSample: string | null;
};

type MapPopupProps = {
  details: CommuneDetails;
  unit: HardnessUnit;
  /** Omitted in hover mode, where the card follows the cursor and closes on its own. */
  onClose?: () => void;
};

/** Detail card shown for the hovered commune, themed like the rest of the UI. */
export function MapPopup({ details, unit, onClose }: MapPopupProps) {
  const { name, hardness, sampleCount, latestSample } = details;
  // Classification always runs on the stored °f value, whatever unit is displayed.
  const hardnessClass = hardness === null ? null : classifyHardness(hardness);

  return (
    <Paper elevation={4} sx={{ p: 1.5, minWidth: 200, maxWidth: 260 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          {name}
        </Typography>
        {onClose !== undefined && (
          <IconButton size="small" onClick={onClose} aria-label="Fermer">
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {hardness === null || hardnessClass === null ? (
        <Typography variant="caption" color="text.secondary">
          Aucune mesure disponible
        </Typography>
      ) : (
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="h6" component="p" sx={{ lineHeight: 1.2 }}>
              {formatHardness(hardness, unit)}
            </Typography>
            <Chip
              size="small"
              label={hardnessClass.label}
              sx={{
                height: 20,
                borderRadius: 0.75,
                backgroundColor: hardnessClass.color,
                color: contrastText(hardnessClass.color),
                fontSize: 11,
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
    </Paper>
  );
}