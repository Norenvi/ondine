import { useCallback, useEffect, useMemo, useState } from "react";
import { createTheme, type Theme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

export type ColorMode = "light" | "dark";

const STORAGE_KEY = "ondine-color-mode";

const FONT_FAMILY = [
  '"Inter Variable"',
  '"Inter"',
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI"',
  "Roboto",
  '"Helvetica Neue"',
  "Arial",
  "sans-serif",
].join(",");


const PALETTE = {
  light: {
    primary: { main: "#0f6e78", light: "#4ca7b0", dark: "#0a4c53", contrastText: "#ffffff" },
    secondary: { main: "#8a5a2b", contrastText: "#ffffff" },
    background: { default: "#f3f5f6", paper: "#ffffff" },
    text: { primary: "#1a2327", secondary: "#586268" },
    divider: "rgba(26, 35, 39, 0.10)",
  },
  dark: {
    primary: { main: "#54b9c6", light: "#82d0da", dark: "#2f8f9c", contrastText: "#052a2f" },
    secondary: { main: "#d1a06a", contrastText: "#2a1c0c" },
    background: { default: "#0e1417", paper: "#161d21" },
    text: { primary: "#e6edef", secondary: "#98a5aa" },
    divider: "rgba(230, 237, 239, 0.12)",
  },
} as const;


function buildShadows(mode: ColorMode): Theme["shadows"] {
  const rgb = mode === "dark" ? "0, 0, 0" : "15, 23, 27";
  const base = mode === "dark" ? 0.44 : 0.06;
  const shadows: string[] = ["none"];
  for (let i = 1; i < 25; i += 1) {
    const y = Math.round(i * 0.9) + 1;
    const blur = Math.round(i * 1.7) + 3;
    const ambient = (base + i * 0.006).toFixed(3);
    const contact = (base * 0.7 + i * 0.003).toFixed(3);
    shadows.push(
      `0 ${Math.max(1, Math.round(y / 2))}px ${Math.round(blur / 2)}px rgba(${rgb}, ${contact}), ` +
        `0 ${y}px ${blur}px rgba(${rgb}, ${ambient})`,
    );
  }
  return shadows as Theme["shadows"];
}

function buildTheme(mode: ColorMode): Theme {
  const palette = PALETTE[mode];
  return createTheme({
    palette: { mode, ...palette },
    shape: { borderRadius: 10 },
    shadows: buildShadows(mode),
    typography: {
      fontFamily: FONT_FAMILY,
      // Explicit screen-tuned scale: smaller headings than the MUI print-derived
      // defaults, negative tracking that tightens as size grows, tabular figures on
      // the "big number" ranks so digits never reflow between values.
      h1: { fontSize: "2.5rem", lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.021em" },
      h2: { fontSize: "2rem", lineHeight: 1.2, fontWeight: 700, letterSpacing: "-0.02em" },
      h3: {
        fontSize: "1.5rem",
        lineHeight: 1.25,
        fontWeight: 700,
        letterSpacing: "-0.016em",
        fontFeatureSettings: '"tnum"',
      },
      h4: {
        fontSize: "1.375rem",
        lineHeight: 1.3,
        fontWeight: 700,
        letterSpacing: "-0.012em",
        fontFeatureSettings: '"tnum"',
      },
      h5: { fontSize: "1.125rem", lineHeight: 1.4, fontWeight: 600, letterSpacing: "-0.01em" },
      h6: {
        fontSize: "1rem",
        lineHeight: 1.5,
        fontWeight: 600,
        letterSpacing: "-0.006em",
        fontFeatureSettings: '"tnum"',
      },
      subtitle1: { fontSize: "1rem", lineHeight: 1.45, fontWeight: 600, letterSpacing: "-0.006em" },
      subtitle2: { fontSize: "0.8125rem", lineHeight: 1.5, fontWeight: 600, letterSpacing: 0 },
      body1: { fontSize: "0.9375rem", lineHeight: 1.55 },
      body2: { fontSize: "0.8125rem", lineHeight: 1.55 },
      caption: { fontSize: "0.75rem", lineHeight: 1.5, letterSpacing: 0 },
      overline: {
        fontSize: "0.6875rem",
        lineHeight: 2,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      },
      button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
    },
    components: {
      // No touch ripple anywhere: the diffusion animation reads as louder/cheaper than
      // the crisp state changes we want. Covers Button, IconButton, ToggleButton, MenuItem, Tab, etc.
      MuiButtonBase: {
        defaultProps: { disableRipple: true },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
            textRendering: "optimizeLegibility",
            // inherited, so every number in the UI (legend ranges, grids, popup) aligns
            fontVariantNumeric: "tabular-nums",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            // kill the dark-mode elevation overlay that washes surfaces toward gray
            backgroundImage: "none",
            border: `1px solid ${palette.divider}`,
          },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: "default" },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            borderLeft: "none",
            borderRight: "none",
            borderTop: "none",
            borderBottom: `1px solid ${palette.divider}`,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { borderRadius: 8, fontSize: "0.75rem", fontWeight: 500 },
        },
      },
      MuiChip: {
        styleOverrides: {
          label: { fontWeight: 500, letterSpacing: "0.01em" },
        },
      },
    },
  });
}

function getStoredMode(): ColorMode | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}


export function useColorMode(): { mode: ColorMode; theme: Theme; toggleMode: () => void } {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [override, setOverride] = useState<ColorMode | null>(getStoredMode);

  const mode: ColorMode = override ?? (prefersDark ? "dark" : "light");

  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  // Derived from the effective mode, not from the override: with no override stored
  // the first click must still flip what the user currently sees.
  const toggleMode = useCallback(() => {
    const next: ColorMode = mode === "dark" ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, next);
    setOverride(next);
  }, [mode]);

  const theme = useMemo(() => buildTheme(mode), [mode]);

  return { mode, theme, toggleMode };
}
