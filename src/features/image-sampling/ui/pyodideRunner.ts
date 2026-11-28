/**
 * Main-thread entry points for the image-sampling lab's Pyodide worker.
 * Worker lifecycle, the two-phase timeout policy and the wire envelope live
 * in shared/worker — this module only keeps the lab's request kinds and the
 * payload shape of its ok responses (`{ results }`).
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

/** Run the student's cell_value(region) over test regions; returns raw outputs. */
export async function runCellValue(
  code: string,
  regions: number[][][],
  timeoutMs = WORKER_RUN_TIMEOUT_MS,
): Promise<unknown[]> {
  const payload = await client.run<{ results: unknown[] }>(
    { kind: "cell", code, regions },
    timeoutMs,
  );
  return payload.results;
}

/**
 * Run choose_size(images) — images is the public gallery as 0/1 nested lists.
 * `helpers` is the student's earlier-stage code (their cell_value), injected
 * so later stages can call it. Returns the raw pair (validated by the caller).
 */
export async function runChooseSize(
  code: string,
  images: number[][][],
  helpers?: string,
  timeoutMs = WORKER_RUN_TIMEOUT_MS,
): Promise<unknown[]> {
  const payload = await client.run<{ results: unknown[] }>(
    { kind: "size", code, images, helpers },
    timeoutMs,
  );
  return payload.results;
}
