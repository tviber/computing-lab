import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkerClient,
  WORKER_HIDDEN_IDLE_TIMEOUT_MS,
  WORKER_IDLE_TIMEOUT_MS,
  WORKER_LOAD_TIMEOUT_MS,
  type WorkerClient,
  type WorkerClientOptions,
} from "./createWorkerClient.ts";
import {
  PYODIDE_LOAD_TIMEOUT_MESSAGE,
  PYODIDE_RUN_TIMEOUT_MESSAGE,
  PYODIDE_WORKER_RELEASED_MESSAGE,
} from "./workerErrors.ts";

type Message = Record<string, unknown> & { id: number };

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  posted: Message[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: Message) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: Record<string, unknown>) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const spawn = () => new FakeWorker() as unknown as Worker;
let clients: WorkerClient[] = [];
const initialVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");

function makeClient(options: WorkerClientOptions = {}): WorkerClient {
  const client = createWorkerClient(spawn, options);
  clients.push(client);
  return client;
}

function setVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWorker.instances = [];
});
afterEach(() => {
  for (const client of clients) client.dispose();
  clients = [];
  if (initialVisibility) Object.defineProperty(document, "visibilityState", initialVisibility);
  else Reflect.deleteProperty(document, "visibilityState");
  vi.useRealTimers();
});

describe("createWorkerClient", () => {
  it("resolves with the ok-payload fields, stripped of the envelope", async () => {
    const client = makeClient();
    const run = client.run<{ results: number[] }>({ kind: "cell", code: "x" });
    const worker = FakeWorker.instances[0];
    expect(worker.posted[0]).toMatchObject({ id: 1, kind: "cell", code: "x" });
    worker.emit({ id: 1, phase: "executing" });
    worker.emit({ id: 1, ok: true, results: [1, 2], helperFailed: true });
    await expect(run).resolves.toEqual({ results: [1, 2], helperFailed: true });
  });

  it("rejects with the worker's error string", async () => {
    const client = makeClient();
    const run = client.run({ code: "x" });
    FakeWorker.instances[0].emit({ id: 1, phase: "executing" });
    FakeWorker.instances[0].emit({ id: 1, ok: false, error: "需要一个函数 decode" });
    await expect(run).rejects.toThrow("需要一个函数 decode");
  });

  it("switches from the load budget to timeoutMs on the executing ack", async () => {
    const client = makeClient();
    const run = client.run({ code: "x" }, 5000);
    vi.advanceTimersByTime(WORKER_LOAD_TIMEOUT_MS - 1);
    FakeWorker.instances[0].emit({ id: 1, phase: "executing" });
    // Load budget is gone; the run now has its own 5 s budget.
    vi.advanceTimersByTime(4999);
    expect(FakeWorker.instances[0].terminated).toBe(false);
    FakeWorker.instances[0].emit({ id: 1, ok: true, result: 1 });
    await expect(run).resolves.toEqual({ result: 1 });
  });

  it("a load timeout rejects the request but keeps the worker alive", async () => {
    const client = makeClient();
    const run = client.run({ code: "x" });
    vi.advanceTimersByTime(WORKER_LOAD_TIMEOUT_MS);
    await expect(run).rejects.toThrow(PYODIDE_LOAD_TIMEOUT_MESSAGE);
    expect(FakeWorker.instances[0].terminated).toBe(false);
  });

  it("an executing timeout kills the worker and rejects everything pending", async () => {
    const client = makeClient();
    const runA = client.run({ code: "a" });
    const runB = client.run({ code: "b" });
    FakeWorker.instances[0].emit({ id: 1, phase: "executing" });
    // id 2 still in its load phase — killing rejects it too.
    vi.advanceTimersByTime(15_000);
    await expect(runA).rejects.toThrow(PYODIDE_RUN_TIMEOUT_MESSAGE);
    await expect(runB).rejects.toThrow(PYODIDE_RUN_TIMEOUT_MESSAGE);
    expect(FakeWorker.instances[0].terminated).toBe(true);

    // Next run spawns a fresh worker.
    const next = client.run({ code: "c" });
    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1].emit({ id: 3, ok: true, result: 9 });
    await expect(next).resolves.toEqual({ result: 9 });
  });

  it("an onerror kills the worker and rejects pending runs", async () => {
    const client = makeClient();
    const run = client.run({ code: "x" });
    FakeWorker.instances[0].onerror?.();
    await expect(run).rejects.toThrow(PYODIDE_RUN_TIMEOUT_MESSAGE);
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  it("releases an idle worker and cold-starts on the next run", async () => {
    const client = makeClient({ pageLifecycle: false });
    client.warm();
    expect(FakeWorker.instances).toHaveLength(1);
    vi.advanceTimersByTime(WORKER_IDLE_TIMEOUT_MS);
    expect(FakeWorker.instances[0].terminated).toBe(true);

    const next = client.run({ code: "again" });
    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1].emit({ id: 1, ok: true, result: 2 });
    await expect(next).resolves.toEqual({ result: 2 });
  });

  it("lets warm() respawn after an idle release", () => {
    const client = makeClient({ pageLifecycle: false });
    client.warm();
    vi.advanceTimersByTime(WORKER_IDLE_TIMEOUT_MS);
    expect(FakeWorker.instances[0].terminated).toBe(true);

    client.warm();
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[1].terminated).toBe(false);
  });

  it("starts the idle countdown only after the last run settles", async () => {
    const client = makeClient({ idleTimeoutMs: 1000, pageLifecycle: false });
    const run = client.run({ code: "x" });
    const worker = FakeWorker.instances[0];
    worker.emit({ id: 1, phase: "executing" });
    vi.advanceTimersByTime(999);
    expect(worker.terminated).toBe(false);
    worker.emit({ id: 1, ok: true, result: 1 });
    await expect(run).resolves.toEqual({ result: 1 });
    vi.advanceTimersByTime(999);
    expect(worker.terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(worker.terminated).toBe(true);
  });

  it("cancels a scheduled idle release when a run starts", async () => {
    const client = makeClient({ idleTimeoutMs: 1000, pageLifecycle: false });
    client.warm();
    const worker = FakeWorker.instances[0];
    vi.advanceTimersByTime(500);

    const run = client.run({ code: "x" });
    vi.advanceTimersByTime(500);
    expect(worker.terminated).toBe(false);
    worker.emit({ id: 1, ok: true, result: 1 });
    await expect(run).resolves.toEqual({ result: 1 });
  });

  it("does not let the idle countdown interrupt an executing timeout", async () => {
    const client = makeClient({ idleTimeoutMs: 1000, pageLifecycle: false });
    const run = client.run({ code: "x" });
    const worker = FakeWorker.instances[0];
    worker.emit({ id: 1, phase: "executing" });
    vi.advanceTimersByTime(1000);
    expect(worker.terminated).toBe(false);
    vi.advanceTimersByTime(14_000);
    await expect(run).rejects.toThrow(PYODIDE_RUN_TIMEOUT_MESSAGE);
    expect(worker.terminated).toBe(true);
  });

  it("releases on pagehide and rejects the in-flight run", async () => {
    const client = makeClient({ pageLifecycle: true });
    const run = client.run({ code: "x" });
    FakeWorker.instances[0].emit({ id: 1, phase: "executing" });
    window.dispatchEvent(new Event("pagehide"));
    await expect(run).rejects.toThrow(PYODIDE_WORKER_RELEASED_MESSAGE);
    expect(FakeWorker.instances[0].terminated).toBe(true);

    const next = client.run({ code: "again" });
    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1].emit({ id: 2, ok: true, result: 3 });
    await expect(next).resolves.toEqual({ result: 3 });
  });

  it("keeps an idle worker through a brief hidden-tab switch", () => {
    const client = makeClient({
      idleTimeoutMs: 90_000,
      hiddenIdleTimeoutMs: 1000,
      pageLifecycle: true,
    });
    client.warm();
    const worker = FakeWorker.instances[0];
    setVisibility("hidden");
    vi.advanceTimersByTime(500);
    setVisibility("visible");
    vi.advanceTimersByTime(1000);
    expect(worker.terminated).toBe(false);
  });

  it("releases an idle worker after the hidden-tab grace period", () => {
    const client = makeClient({ pageLifecycle: true });
    client.warm();
    const worker = FakeWorker.instances[0];
    setVisibility("hidden");
    vi.advanceTimersByTime(WORKER_HIDDEN_IDLE_TIMEOUT_MS - 1);
    expect(worker.terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(worker.terminated).toBe(true);
  });

  it("does not interrupt a run when the tab becomes hidden", async () => {
    const client = makeClient({ hiddenIdleTimeoutMs: 1000, pageLifecycle: true });
    const run = client.run({ code: "x" });
    const worker = FakeWorker.instances[0];
    worker.emit({ id: 1, phase: "executing" });
    setVisibility("hidden");
    vi.advanceTimersByTime(5000);
    expect(worker.terminated).toBe(false);

    worker.emit({ id: 1, ok: true, result: 7 });
    await expect(run).resolves.toEqual({ result: 7 });
    vi.advanceTimersByTime(999);
    expect(worker.terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(worker.terminated).toBe(true);
  });

  it("dispose releases the worker and removes page listeners", () => {
    const client = makeClient({ pageLifecycle: true });
    client.warm();
    const worker = FakeWorker.instances[0];
    client.dispose();
    expect(worker.terminated).toBe(true);

    window.dispatchEvent(new Event("pagehide"));
    expect(FakeWorker.instances).toHaveLength(1);
  });
});
