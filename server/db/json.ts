/**
 * Parse a JSON column, returning `fallback` when the stored text is missing or
 * corrupt. Route code must never let one bad row fail a whole request.
 */
export function parseJsonColumn<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
