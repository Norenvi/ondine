import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

import type { NiveauZoom } from "./api";
import { communeLabel } from "./communes";
import { formatDate } from "./format";
import { classifyValue, contrastText, type ValueClass } from "./parameters";
import { formatValueWithUnit, type Unit } from "./units";

/** Only commune and departement codes mean anything to a reader alongside the name: a
 * commune's dash-department suffix from communeLabel, a departement's own code in
 * parentheses (e.g. "Ain (01)"). EPCI/region codes aren't meaningful shown this way. */
function entityTitle(level: NiveauZoom, name: string, code: string): string {
  if (level === "commune") {
    return communeLabel(name, code);
  }
  if (level === "departement") {
    return `${name} (${code})`;
  }
  return name;
}

export type CommuneDetails = {
  code: string;
  name: string;
  value: number | null;
  sampleCount: number | null;
  latestSample: string | null;
  nonCompliantCount: number | null;
};

type MapPopupProps = {
  details: CommuneDetails;
  classes: ValueClass[];
  unit: Unit;
  level: NiveauZoom;
  /** The mapped value is a non-conformity rate (percent), not a measurement: change the
   * caption from "N mesures" to "N / M prélèvements non conformes". */
  compliance?: boolean;
  onClose?: () => void;
};

/** Detail card shown for the hovered feature, themed like the rest of the UI. */
export function MapPopup({ details, classes, unit, level, compliance = false, onClose }: MapPopupProps) {
  const { code, name, value, sampleCount, latestSample, nonCompliantCount } = details;
  // Classification always runs on the stored base-unit value, whatever unit is displayed.
  const valueClass = value === null ? null : classifyValue(value, classes);

  return (
    <Paper elevation={4} sx={{ p: 1.5, minWidth: 200, maxWidth: 260 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          {entityTitle(level, name, code)}
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
              }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {compliance
              ? `${nonCompliantCount ?? 0} / ${sampleCount ?? "?"} prélèvement(s) non conforme(s)`
              : `${sampleCount ?? "?"} mesure(s)`}
            {latestSample ? `, dernière le ${formatDate(latestSample)}` : ""}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}