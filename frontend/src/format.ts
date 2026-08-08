/** Shared formatting helpers, so every value is displayed the same way across the app. */

const DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Format a date as dd/mm/yyyy.
 * Accepts what the pipeline emits (ISO yyyy-mm-dd) and returns the raw input
 * unchanged when it cannot be parsed, so a bad record never renders as "Invalid Date".
 */
export function formatDate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return DATE_FORMATTER.format(date);
}