import Paper from "@mui/material/Paper";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type TimelineProps = {
  /** Years available, ascending. Comes from GET /annees (one entry per Hub'Eau archive). */
  annees: number[];
  annee: number;
  onChange: (annee: number) => void;
};

/**
 * Year picker for the choropleth. One tick per available year, snap only (step=null): the
 * map always shows a single year's data, never a cross-year average. Hidden when there is
 * only one year seeded, since then there is nothing to pick.
 */
export function Timeline({ annees, annee, onChange }: TimelineProps) {
  if (annees.length < 2) {
    return null;
  }

  const marks = annees.map((year) => ({ value: year, label: String(year) }));
  const latest = annees[annees.length - 1];
  // The archive for the running calendar year only covers the months elapsed so far.
  const isPartialYear = annee === new Date().getFullYear();

  return (
    <Paper
      elevation={4}
      sx={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1,
        px: 2.5,
        pt: 0.75,
        pb: 0.25,
        width: { xs: "calc(100% - 24px)", sm: 380 },
        maxWidth: "calc(100vw - 24px)",
        borderRadius: 1,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
        <Typography variant="caption" color="text.secondary">
          Annee des donnees
        </Typography>
        {isPartialYear && (
          <Typography variant="caption" color="text.secondary">
            annee en cours, partielle
          </Typography>
        )}
      </Stack>
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
        sx={{ mt: 0.5 }}
      />
    </Paper>
  );
}
