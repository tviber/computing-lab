/**
 * The priority result table — stage 3 (修排队). The student writes
 * `priority(urgent, wait, cook)`; the browser evaluates all 2×31×2 = 124
 * input combinations in Pyodide and submits the resulting value table.
 * The server then simulates queue picks by table lookup — it never runs
 * student code. Bigger value = picked first; equal values fall back to
 * first-come-first-served.
 */

export const PRIORITY_WAITS = 31; // wait ∈ 0..30
export const PRIORITY_COOKS = [1, 3] as const;
export const PRIORITY_TABLE_SIZE = 2 * PRIORITY_WAITS * PRIORITY_COOKS.length; // 124

/** Canonical cell index: urgent × wait × cook, urgent outermost. */
export function priorityIndex(urgent: boolean, wait: number, cook: number): number {
  const urgentIndex = urgent ? 1 : 0;
  const cookIndex = cook === 3 ? 1 : 0;
  return urgentIndex * PRIORITY_WAITS * PRIORITY_COOKS.length + wait * 2 + cookIndex;
}

/** Table lookup with the same clamping the UI promises (wait 0–30, cook 1|3). */
export function priorityValue(
  table: readonly number[],
  urgent: boolean,
  wait: number,
  cook: number,
): number {
  const clampedWait = Math.max(0, Math.min(PRIORITY_WAITS - 1, Math.trunc(wait)));
  return table[priorityIndex(urgent, clampedWait, cook === 3 ? 3 : 1)];
}

/** Code snapshot bound for teacher review — same policy as other labs. */
export const MAX_CODE_CHARS = 8000;

/**
 * Validate a submitted/restored priority table: exactly 124 finite numbers.
 * Anything else is rejected whole — a partial table would silently reorder
 * the queue, which is worse than an explicit error.
 */
export function checkPriorityTable(raw: unknown): { table: number[] | null; errors: string[] } {
  if (!Array.isArray(raw) || raw.length !== PRIORITY_TABLE_SIZE) {
    return {
      table: null,
      errors: ["还没有可用的结果表——先运行 priority，让程序算完全部 124 种情况。"],
    };
  }
  const table: number[] = [];
  for (const [index, value] of raw.entries()) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { table: null, errors: [`结果表第 ${index + 1} 个值不是有限数字。`] };
    }
    table.push(value);
  }
  return { table, errors: [] };
}

export function sanitizePriorityTable(raw: unknown): number[] | null {
  return checkPriorityTable(raw).table;
}
