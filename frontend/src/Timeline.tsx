import Box, { type BoxProps } from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Slider from "@mui/material/Slider";

type TimelineSliderProps = {
  /** Years available, ascending. Comes from GET /annees (one entry per Hub'Eau archive). */
  annees: number[];
  annee: number;
  onChange: (annee: number) => void;
  sx?: BoxProps["sx"];
};

/**
 * Bare year slider: one tick per available year, snap only (step=null), so a view always
 * shows a single year's data and never a cross-year average. Renders nothing with fewer
 * than two years. Used inline (Leaderboard, under the table) and inside the floating
 * `Timeline` container (over the map).
 */
export function TimelineSlider({ annees, annee, onChange, sx }: TimelineSliderProps) {
  if (annees.length < 2) {
    return null;
  }

  const marks = annees.map((year) => ({ value: year, label: String(year) }));

  return (
    <Box sx={sx}>
      <Slider
        size="small"
        value={annee}
        min={annees[0]}
        max={annees[annees.length - 1]}
        marks={marks}
        step={null}
        valueLabelDisplay="auto"
        onChange={(_event, value) => {
          if (typeof value === "number") {
            onChange(value);
          }
        }}
        aria-label="Annee des donnees"
        sx={{
          mt: 0,
          "& .MuiSlider-markLabel": {
            fontSize: "0.625rem",
            fontVariantNumeric: "tabular-nums",
          },
          "& .MuiSlider-markLabelActive": {
            color: "text.primary",
          },
        }}
      />
    </Box>
  );
}

/** Floating year picker over the choropleth (bottom-centre of the map). */
export function Timeline({ annees, annee, onChange }: Omit<TimelineSliderProps, "sx">) {
  if (annees.length < 2) {
    return null;
  }

  return (
    <Paper
      elevation={4}
      sx={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1,
        px: 2.5,
        width: { xs: "calc(100% - 24px)", sm: 460 },
        maxWidth: "calc(100vw - 24px)",
        borderRadius: 1,
      }}
    >
      <TimelineSlider annees={annees} annee={annee} onChange={onChange} />
    </Paper>
  );
}
