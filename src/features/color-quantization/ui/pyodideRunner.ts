/**
 * Main-thread entry points for the color-quantization lab's Pyodide worker.
 * Worker lifecycle, the two-phase timeout policy and the wire envelope live
 * in shared/worker — this module only keeps the lab's request kinds and the
 * payload shape of its ok responses (`{ results, helperFailed? }`).
 */
import {
  createWorkerClient,
  WORKER_RUN_TIMEOUT_MS,
} from "../../../shared/worker/createWorkerClient.ts";

export { PythonRunError } from "../../../shared/worker/workerErrors.ts";

const client = createWorkerClient(
  () => new Worker(new URL("../runtime/pyodide.worker.ts", import.meta.url), { type: "module" }),
);

/** Spawn the worker now so the runtime download finishes before the first run. */
export const warmPyodide = client.warm;

type RunPayload = { results: unknown[]; helperFailed?: boolean };

/**
 * Run the student's nearest_toner(r, g, b, toners) over the source palette.
 * `toners` is the candidate list as [r,g,b] rows (index 0 = paper).
 */
export async function runNearestToner(
  code: string,
  colors: number[][],
  toners: number[][],
  timeoutMs = WORKER_RUN_TIMEOUT_MS,
): Promise<unknown[]> {
  const payload = await client.run<RunPayload>({ kind: "toner", code, colors, toners }, timeoutMs);
  return payload.results;
}

export type HelperRunResult = {
  results: unknown[];
  /** True when the injected earlier-stage code failed and the built-in
   *  reference helpers ran instead — the UI must tell the student whose
   *  code actually executed. */
  helperFailed: boolean;
};

/**
 * Run choose_toners(toners, palette, images, k) — images is the public
 * gallery as palette-index nested lists. `helpers` is the student's
 * earlier-stage code (their nearest_toner), injected so it stays callable.
 */
export async function runChooseToners(
  code: string,
  toners: number[][],
  palette: number[][],
  images: number[][][],
  k: number,
  helpers?: string,
  timeoutMs = WORKER_RUN_TIMEOUT_MS,
): Promise<HelperRunResult> {
  const payload = await client.run<RunPayload>(
    { kind: "pick", code, toners, palette, images, k, helpers },
    timeoutMs,
  );
  return { results: payload.results, helperFailed: payload.helperFailed ?? false };
}

/**
 * Run map_color(r, g, b) over every source color — returns the raw table
 * (toner index or -1 per source color, validated by the caller).
 */
export async function runMapAll(
  code: string,
  colors: number[][],
  toners: number[][],
  palette: number[][],
  helpers?: string,
  timeoutMs = WORKER_RUN_TIMEOUT_MS,
): Promise<HelperRunResult> {
  const payload = await client.run<RunPayload>(
    { kind: "mapall", code, colors, toners, palette, helpers },
    timeoutMs,
  );
  return { results: payload.results, helperFailed: payload.helperFailed ?? false };
}
