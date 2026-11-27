/**
 * Main-thread handle for a lab's Pyodide worker. Lazily spawned; calls queue
 * through an id map, so one request at a time per call site is fine.
 *
 * Timeouts are two-phase: a generous budget while the Python runtime
 * (~13 MB) is still downloading, then `timeoutMs` once the worker acks that
 * student code is executing. An execution timeout terminates the worker —
 * dead Python can't be interrupted, so the runtime is discarded and cold-loads
 * on the next run; a load timeout only rejects that request, the download
 * continues in the background and a retry reuses it.
 *
 * An idle worker is released after `idleTimeoutMs`, and page-hide/hidden-tab
 * transitions release it immediately. The next `run()` or `warm()` cold-starts
 * a fresh runtime.
 */
import type { WorkerRequestBase, WorkerResponse } from "./workerProtocol.ts";
import {
  PYODIDE_LOAD_TIMEOUT_MESSAGE,
  PYODIDE_RUN_FAILED_MESSAGE,
  PYODIDE_RUN_TIMEOUT_MESSAGE,
  PYODIDE_WORKER_RELEASED_MESSAGE,
} from "./workerErrors.ts";

export const WORKER_RUN_TIMEOUT_MS = 15_000;
export const WORKER_LOAD_TIMEOUT_MS = 90_000;
export const WORKER_IDLE_TIMEOUT_MS = 90_000;

type Pending = {
  resolve: (payload: object) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  /** True once the worker acked it started running student code. */
  executing: boolean;
  /** Budget applied to the execution phase after the load phase. */
  timeoutMs: number;
};

export type WorkerClient = {
  /**
   * Post a request; resolves with the ok-payload (the lab-defined fields of
   * the worker's response) or rejects with the worker's error or a timeout.
   */
  run: <TPayload extends object = Record<string, unknown>>(
    message: Record<string, unknown>,
    timeoutMs?: number,
  ) => Promise<TPayload>;
  /** Spawn the worker now so the runtime download finishes before the first run. */
  warm: () => void;
};

export type WorkerClientOptions = {
  /** Release an unused runtime after this long. Defaults to 90 seconds. */
  idleTimeoutMs?: number;
  /** Release on pagehide / a hidden tab. Enabled by default in the browser. */
  pageLifecycle?: boolean;
};

export function createWorkerClient(
  spawn: () => Worker,
  options: WorkerClientOptions = {},
): WorkerClient {
  let worker: Worker | null = null;
  let seq = 0;
  const pending = new Map<number, Pending>();
  const idleTimeoutMs = options.idleTimeoutMs ?? WORKER_IDLE_TIMEOUT_MS;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function clearIdleTimer(): void {
    if (idleTimer === null) return;
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  function killWorker(message = PYODIDE_RUN_TIMEOUT_MESSAGE): void {
    clearIdleTimer();
    worker?.terminate();
    worker = null;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
    }
    pending.clear();
  }

  function scheduleIdleRelease(): void {
    clearIdleTimer();
    if (worker === null || pending.size > 0) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      killWorker(PYODIDE_WORKER_RELEASED_MESSAGE);
    }, idleTimeoutMs);
  }

  function onTimeout(id: number): void {
    const entry = pending.get(id);
    if (!entry) return;
    if (entry.executing) {
      killWorker();
      return;
    }
    pending.delete(id);
    entry.reject(new Error(PYODIDE_LOAD_TIMEOUT_MESSAGE));
    scheduleIdleRelease();
  }

  function ensureWorker(): Worker {
    if (worker) return worker;
    clearIdleTimer();
    worker = spawn();
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      const entry = pending.get(data.id);
      if (!entry) return;
      if ("phase" in data && data.phase === "executing") {
        entry.executing = true;
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => onTimeout(data.id), entry.timeoutMs);
        return;
      }
      pending.delete(data.id);
      clearTimeout(entry.timer);
      if ("ok" in data && data.ok) {
        const payload = { ...data } as Record<string, unknown>;
        delete payload.id;
        delete payload.ok;
        entry.resolve(payload);
      } else {
        entry.reject(new Error("error" in data ? data.error : PYODIDE_RUN_FAILED_MESSAGE));
      }
      scheduleIdleRelease();
    };
    worker.onerror = () => killWorker();
    return worker;
  }

  function releaseOnPageHide(): void {
    killWorker(PYODIDE_WORKER_RELEASED_MESSAGE);
  }

  function releaseOnVisibilityChange(): void {
    if (document.visibilityState === "hidden") {
      killWorker(PYODIDE_WORKER_RELEASED_MESSAGE);
    }
  }

  const canObservePage = typeof window !== "undefined" && typeof document !== "undefined";
  const pageLifecycle = canObservePage && (options.pageLifecycle ?? true);
  if (pageLifecycle) {
    window.addEventListener("pagehide", releaseOnPageHide);
    document.addEventListener("visibilitychange", releaseOnVisibilityChange);
  }

  return {
    run<TPayload extends object = Record<string, unknown>>(
      message: Record<string, unknown>,
      timeoutMs = WORKER_RUN_TIMEOUT_MS,
    ): Promise<TPayload> {
      clearIdleTimer();
      const w = ensureWorker();
      const id = (seq += 1);
      return new Promise((resolve, reject) => {
        pending.set(id, {
          resolve: resolve as (payload: object) => void,
          reject,
          timer: setTimeout(() => onTimeout(id), WORKER_LOAD_TIMEOUT_MS),
          executing: false,
          timeoutMs,
        });
        w.postMessage({ id, ...message } satisfies WorkerRequestBase);
      });
    },
    warm(): void {
      clearIdleTimer();
      ensureWorker();
      scheduleIdleRelease();
    },
  };
}
