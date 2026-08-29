import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type PanelSkeletonProps = {
  rows?: number;
  sx?: SxProps<Theme>;
};

/** Row-shaped placeholder for a table/list area that is still loading. */
export function PanelSkeleton({ rows = 6, sx }: PanelSkeletonProps) {
  return (
    <Stack spacing={0.75} sx={{ mt: 1, ...sx }}>
      <Skeleton variant="rounded" height={26} />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} variant="rounded" height={22} />
      ))}
    </Stack>
  );
}

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  detail?: string;
  severity?: "info" | "error";
  sx?: SxProps<Theme>;
};

/** Centered icon + message for the empty and error states inside a panel. */
export function EmptyState({ icon, title, detail, severity = "info", sx }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 0.5,
        py: 4,
        px: 2,
        ...sx,
      }}
    >
      {icon !== undefined && (
        <Box
          sx={{
            display: "flex",
            opacity: 0.65,
            color: severity === "error" ? "error.main" : "text.secondary",
            "& svg": { fontSize: 28 },
          }}
        >
          {icon}
        </Box>
      )}
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, color: severity === "error" ? "error.main" : "text.primary" }}
      >
        {title}
      </Typography>
      {detail !== undefined && (
        <Typography variant="caption" color="text.secondary">
          {detail}
        </Typography>
      )}
    </Box>
  );
}
