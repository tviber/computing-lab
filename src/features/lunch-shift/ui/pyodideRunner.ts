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
  () => new Worker(new URL("../runtime/pyodide.worker.ts", import.meta.url), { type: "module" }),
);

/** Spawn the worker now so the runtime download finishes before the first run. */
export const warmPyodide = client.warm;

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
 * Evaluate compensate(urgent, overtime, delivered, price) for all 3844
 * input combinations. Returns the raw result list — validated by the
 * caller (checkCompensateTable).
 */
export async function runCompensateTable(
  code: string,
  timeoutMs = WORKER_RUN_TIMEOUT_MS,
): Promise<unknown> {
  const payload = await client.run<{ result: unknown }>({ kind: "compensate", code }, timeoutMs);
  return payload.result;
}

/**
 * AI intake: evaluate need_confirm(similarity, margin) once per
 * [similarity, margin] pair, in one run. Returns a raw list — the
 * caller validates it's all booleans.
 */
export async function runNeedConfirm(
  code: string,
  cases: [number, number][],
  timeoutMs = WORKER_RUN_TIMEOUT_MS,
): Promise<unknown> {
  const payload = await client.run<{ result: unknown }>(
    { kind: "confirm", code, cases },
    timeoutMs,
  );
  return payload.result;
}
