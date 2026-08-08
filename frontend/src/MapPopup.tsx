import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

import { communeLabel } from "./communes";
import { formatDate } from "./format";
import { classifyValue, contrastText, type ValueClass } from "./parameters";
import { formatValueWithUnit, type Unit } from "./units";

export type CommuneDetails = {
  code: string;
  name: string;
  value: number | null;
  sampleCount: number | null;
  latestSample: string | null;
};

type MapPopupProps = {
  details: CommuneDetails;
  classes: ValueClass[];
  unit: Unit;
  /** Omitted in hover mode, where the card follows the cursor and closes on its own. */
  onClose?: () => void;
};

/** Detail card shown for the hovered commune, themed like the rest of the UI. */
export function MapPopup({ details, classes, unit, onClose }: MapPopupProps) {
  const { code, name, value, sampleCount, latestSample } = details;
  // Classification always runs on the stored base-unit value, whatever unit is displayed.
  const valueClass = value === null ? null : classifyValue(value, classes);

  return (
    <Paper elevation={4} sx={{ p: 1.5, minWidth: 200, maxWidth: 260 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          {communeLabel(name, code)}
        </Typography>
        {onClose !== undefined && (
          <IconButton size="small" onClick={onClose} aria-label="Fermer">
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {value === null || valueClass === null ? (
        <Typography variant="caption" color="text.secondary">
          Aucune mesure disponible
        </Typography>
      ) : (
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="h6" component="p" sx={{ lineHeight: 1.2 }}>
              {formatValueWithUnit(value, unit)}
            </Typography>
            <Chip
              size="small"
              label={valueClass.label}
              sx={{
                height: 20,
                borderRadius: 0.75,
                backgroundColor: valueClass.color,
                color: contrastText(valueClass.color),
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