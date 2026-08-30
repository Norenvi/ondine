import Paper from "@mui/material/Paper";
import Slider from "@mui/material/Slider";

type TimelineProps = {
  /** Years available, ascending. Comes from GET /annees (one entry per Hub'Eau archive). */
  annees: number[];
  annee: number;
  onChange: (annee: number) => void;
};

/**
 * Year picker for the choropleth. One tick per available year, snap only (step=null): the
 * map always shows a single year's data, never a cross-year average. Hidden when there is
 * only one year seeded, since then there is nothing to pick. The year labels under the
 * track are the only affordance, no header text.
 */
export function Timeline({ annees, annee, onChange }: TimelineProps) {
  if (annees.length < 2) {
    return null;
  }

  const marks = annees.map((year) => ({ value: year, label: String(year) }));
  const latest = annees[annees.length - 1];

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
      <Slider
        size="small"
        value={annee}
        min={annees[0]}
        max={latest}
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
    </Paper>
  );
}
