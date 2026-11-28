export type DateTimeInput = string | Date | null | undefined;

function toValidDate(value: DateTimeInput): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Format an ISO timestamp or Date in the browser's local timezone:
 * `MM-DD HH:mm` within the current year, `YYYY-MM-DD HH:mm` across years,
 * and `—` for missing or invalid values.
 */
export function formatDateTime(value: DateTimeInput, now: Date = new Date()): string {
  const date = toValidDate(value);
  if (!date) return "—";
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  if (date.getFullYear() === now.getFullYear()) {
    return `${month}-${day} ${hour}:${minute}`;
  }
  return `${date.getFullYear()}-${month}-${day} ${hour}:${minute}`;
}

/**
 * Full local timestamp with seconds (`YYYY-MM-DD HH:mm:ss`) for tooltip
 * `title` attributes, or `undefined` when the input is missing or invalid.
 */
export function formatFullDateTime(value: DateTimeInput): string | undefined {
  const date = toValidDate(value);
  if (!date) return undefined;
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  const second = pad2(date.getSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
