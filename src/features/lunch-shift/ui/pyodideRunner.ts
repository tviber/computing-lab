/**
 * Main-thread entry points for the lunch-shift Pyodide worker. Worker
 * lifecycle, the two-phase timeout policy and the wire envelope live in
 * shared/worker — this module only keeps the lab's request kinds and the
 * payload shape of its ok responses (`{ result }`).
 */
import {
  createWorkerClient,
  WORKER_RUN_TIMEOUT_MS,
} from "../../../shared/worker/createWorkerClient.ts";

export { PythonRunError } from "../../../shared/worker/workerErrors.ts";

const client = createWorkerClient(
  () => new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" }),
);

/** Spawn the worker now so the runtime download finishes before the first run. */
export const warmPyodide = client.warm;

/**
 * Run the word-table code and read back the four variables:
 * returns `[dishPairs, notePairs, calmWords, rushWords]` — raw JSON,
 * validated by the caller (checkIntakeTables).
 */
export async function runIntakeTables(
  code: string,
  timeoutMs = WORKER_RUN_TIMEOUT_MS,
): Promise<unknown> {
  const payload = await client.run<{ result: unknown }>({ kind: "tables", code }, timeoutMs);
  return payload.result;
}

/**
 * Evaluate priority(urgent, wait, cook) for all 124 input combinations.
 * Returns the raw result list — validated by the caller
 * (checkPriorityTable).
 */
export async function runPriorityTable(
  code: string,
  timeoutMs = WORKER_RUN_TIMEOUT_MS,
): Promise<unknown> {
  const payload = await client.run<{ result: unknown }>({ kind: "priority", code }, timeoutMs);
  return payload.result;
}

/**
 * Evaluate rush(urgent, wait, cook) for all 124 input combinations.
 * Returns the raw result list — validated by the caller
 * (checkPriorityTable, same shape as priority).
 */
export async function runRushTable(
  code: string,
  timeoutMs = WORKER_RUN_TIMEOUT_MS,
): Promise<unknown> {
  const payload = await client.run<{ result: unknown }>({ kind: "rush", code }, timeoutMs);
  return payload.result;
}

/**
 * Evaluate compensate(urgent, wait) for all 62 input combinations.
 * Returns the raw result list — validated by the caller
 * (checkCompensateTable).
 */
export async function runCompensateTable(
  code: string,
  timeoutMs = WORKER_RUN_TIMEOUT_MS,
): Promise<unknown> {
  const payload = await client.run<{ result: unknown }>({ kind: "compensate", code }, timeoutMs);
  return payload.result;
}
