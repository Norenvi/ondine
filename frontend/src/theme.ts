import { useCallback, useEffect, useMemo, useState } from "react";
import { createTheme, type Theme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

export type ColorMode = "light" | "dark";

const STORAGE_KEY = "ondine-color-mode";

function getStoredMode(): ColorMode | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

/**
 * Panel color mode: follows the system preference until the user picks a side,
 * after which the explicit choice wins and is remembered.
 */
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

  const theme = useMemo(() => createTheme({ palette: { mode } }), [mode]);

  return { mode, theme, toggleMode };
}