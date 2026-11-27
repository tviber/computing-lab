import { TestLabRuntime } from "../../test/lab-runtime";
import { renderHook } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosaveDraft, type AutosaveDraftOptions } from "./useAutosaveDraft";

type Draft = { text: string };
type Params = AutosaveDraftOptions<Draft>;

const base = (over: Partial<Params> = {}): Params => ({
  scopeId: "class-1",
  labId: "lab",
  saveStatus: "dirty",
  stageIndex: 1,
  draftOf: (s) => ({ text: `stage-${s}` }),
  expectedRevisionOf: () => 0,
  onSaving: vi.fn(),
  onSaved: vi.fn(),
  onError: vi.fn(),
  ...over,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ok = (
  applied = true,
  revision?: number,
  componentsRevision?: number,
  projectGeneration?: number,
) =>
  new Response(
    JSON.stringify({ ok: true, applied, revision, componentsRevision, projectGeneration }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );

function mountAutosave(initial: Params) {
  const [params, setParams] = createSignal(initial);
  const hook = renderHook(() => useAutosaveDraft(params), { wrapper: TestLabRuntime });
  flush();
  return {
    rerender: (next: Params) => {
      setParams(next);
      flush();
    },
    unmount: () => hook.cleanup(),
  };
}

describe("useAutosaveDraft", () => {
  let calls: {
    url: string;
    body: Record<string, unknown>;
    done: ReturnType<typeof deferred<Response>>;
  }[];

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown, init?: RequestInit) => {
        const done = deferred<Response>();
        calls.push({
          url: String(input),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
          done,
        });
        return done.promise;
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const settle = async () => {
    flush();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    flush();
  };

  it("debounces continuous edits into one PUT carrying the expected revision", async () => {
    const { rerender } = mountAutosave(base({ deps: [1] }));
    vi.advanceTimersByTime(800);
    rerender(base({ deps: [2] }));
    vi.advanceTimersByTime(800);
    expect(fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.stageIndex).toBe(1);
    expect(calls[0].body.expectedRevision).toBe(0);

    calls[0].done.resolve(ok());
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("settles every stage's flag on its own response, whatever order they return", async () => {
    const events: string[] = [];
    const listeners = {
      onSaving: (s: number) => events.push(`saving:${s}`),
      onSaved: (s: number) => events.push(`saved:${s}`),
      onError: (s: number) => events.push(`error:${s}`),
    };
    const { rerender } = mountAutosave(base({ ...listeners, deps: [1] }));
    vi.advanceTimersByTime(1500);
    await settle();
    rerender(base({ ...listeners, stageIndex: 2, deps: [2] }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[0].body.stageIndex).toBe(1);
    expect(calls[1].body.stageIndex).toBe(2);

    calls[1].done.resolve(ok());
    await settle();
    calls[0].done.resolve(ok());
    await settle();
    expect(events).toEqual(["saving:1", "saving:2", "saved:2", "saved:1"]);
  });

  it("serializes same-stage saves behind the in-flight one, never racing itself", async () => {
    const onSaved = vi.fn();
    const onError = vi.fn();
    const { rerender } = mountAutosave(base({ deps: [1], onSaved, onError }));
    vi.advanceTimersByTime(1500);
    await settle();
    rerender(base({ deps: [2], onSaved, onError }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.expectedRevision).toBe(0);

    calls[0].done.resolve(ok(true, 5));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedRevision).toBe(5);

    calls[1].done.resolve(ok(true, 6));
    await settle();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(1, 6, undefined, undefined);
    expect(onError).not.toHaveBeenCalled();
  });

  it("sends the bumped components revision on a queued component save, never self-conflicting", async () => {
    const onSaved = vi.fn();
    const onConflict = vi.fn();
    let stateRev = 0;
    const props = (over: Partial<Params> = {}) =>
      base({
        bodyFor: (s, draft) => ({
          stageIndex: s,
          graph: draft,
          components: [{ name: "MyGate", graph: { nodes: [], edges: [] }, custom: true }],
        }),
        expectedComponentsRevisionOf: () => stateRev,
        onSaved,
        onConflict,
        ...over,
      });
    const { rerender } = mountAutosave(props({ deps: [1] }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.expectedRevision).toBe(0);
    expect(calls[0].body.expectedComponentsRevision).toBe(0);

    rerender(props({ deps: [2] }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    calls[0].done.resolve(ok(true, 5, 1));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedRevision).toBe(5);
    expect(calls[1].body.expectedComponentsRevision).toBe(1);

    calls[1].done.resolve(ok(true, 6, 2));
    await settle();
    expect(onConflict).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(1, 6, 2, undefined);
    expect(stateRev).toBe(0);
  });

  it("serializes component saves across stages, never racing two library writes", async () => {
    const onConflict = vi.fn();
    let stateRev = 0;
    const lib = [{ name: "MyGate", graph: { nodes: [], edges: [] }, custom: true }];
    const props = (over: Partial<Params> = {}) =>
      base({
        bodyFor: (s, draft) => ({ stageIndex: s, graph: draft, components: lib }),
        expectedComponentsRevisionOf: () => stateRev,
        onConflict,
        ...over,
      });
    const { rerender } = mountAutosave(props({ stageIndex: 1, deps: [1] }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.stageIndex).toBe(1);
    expect(calls[0].body.expectedComponentsRevision).toBe(0);

    rerender(props({ stageIndex: 2, deps: [2] }));
    vi.advanceTimersByTime(5000);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    calls[0].done.resolve(ok(true, 5, 1));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.stageIndex).toBe(2);
    expect(calls[1].body.expectedComponentsRevision).toBe(1);

    calls[1].done.resolve(ok(true, 6, 2));
    await settle();
    expect(onConflict).not.toHaveBeenCalled();
  });

  it("fences every component write project-wide until the library resyncs", async () => {
    const onConflict = vi.fn();
    let stateRev = 0;
    const lib = [{ name: "MyGate", graph: { nodes: [], edges: [] }, custom: true }];
    const props = (over: Partial<Params> = {}) =>
      base({
        bodyFor: (s, draft) => ({ stageIndex: s, graph: draft, components: lib }),
        expectedComponentsRevisionOf: () => stateRev,
        onConflict,
        ...over,
      });
    const { rerender } = mountAutosave(props({ stageIndex: 1, deps: [1] }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.stageIndex).toBe(1);
    expect(calls[0].body.expectedComponentsRevision).toBe(0);

    calls[0].done.resolve(ok(false, 5, 1));
    await settle();
    expect(onConflict).toHaveBeenCalledWith(1);

    rerender(props({ stageIndex: 2, deps: [2] }));
    vi.advanceTimersByTime(5000);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    stateRev = 1;
    rerender(props({ stageIndex: 2, saveStatus: "conflict", deps: [2] }));
    rerender(props({ stageIndex: 2, deps: [3] }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.stageIndex).toBe(2);
    expect(calls[1].body.expectedComponentsRevision).toBe(1);
  });

  it("never reports a server-dropped stale write as saved", async () => {
    const onSaved = vi.fn();
    mountAutosave(base({ onSaved }));
    vi.advanceTimersByTime(1500);
    await settle();
    calls[0].done.resolve(ok(false));
    await settle();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("clears armed timers and in-flight reporting on unmount", async () => {
    const onSaved = vi.fn();
    const first = mountAutosave(base({ onSaved }));
    first.unmount();
    vi.advanceTimersByTime(3000);
    await settle();
    expect(fetch).not.toHaveBeenCalled();

    const second = mountAutosave(base({ onSaved }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    second.unmount();
    calls[0].done.resolve(ok());
    await settle();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("drops in-flight reporting when the class changes", async () => {
    const onSaved = vi.fn();
    const { rerender } = mountAutosave(base({ onSaved }));
    vi.advanceTimersByTime(1500);
    await settle();
    rerender(base({ scopeId: "class-2", saveStatus: "idle", onSaved }));
    calls[0].done.resolve(ok());
    await settle();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("never arms the stale dirty flag that survives a class switch", async () => {
    const { rerender } = mountAutosave(base({ deps: [1] }));
    rerender(base({ scopeId: "class-2", deps: [1] }));
    vi.advanceTimersByTime(3000);
    await settle();
    expect(fetch).not.toHaveBeenCalled();

    rerender(base({ scopeId: "class-2", deps: [2] }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe("/api/classes/class-2/labs/lab/draft");
  });

  it("drops an in-flight write on class switch even while the screen is still dirty", async () => {
    const onSaved = vi.fn();
    const { rerender } = mountAutosave(base({ onSaved }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    rerender(base({ scopeId: "class-2", onSaved }));
    calls[0].done.resolve(ok());
    vi.advanceTimersByTime(3000);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("fences a rejected stage: its queued arm never sends, onConflict fires once", async () => {
    const onSaved = vi.fn();
    const onError = vi.fn();
    const onConflict = vi.fn();
    const { rerender } = mountAutosave(base({ deps: [1], onSaved, onError, onConflict }));
    vi.advanceTimersByTime(1500);
    await settle();
    rerender(base({ deps: [2], onSaved, onError, onConflict }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    calls[0].done.resolve(ok(false, 7));
    await settle();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledWith(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("kills a still-debouncing arm when the stage's in-flight write is rejected", async () => {
    const onConflict = vi.fn();
    const { rerender } = mountAutosave(base({ deps: [1], onConflict }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    rerender(base({ deps: [2], onConflict }));
    vi.advanceTimersByTime(800);
    calls[0].done.resolve(ok(false, 7));
    await settle();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledWith(1);

    vi.advanceTimersByTime(5000);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a losing tab fenced until the stage reconciles, then saves with the new revision", async () => {
    const onConflict = vi.fn();
    const drafts: Record<number, Draft> = { 1: { text: "A1" } };
    let serverRev = 0;
    const props = (over: Partial<Params> = {}) =>
      base({
        draftOf: (s) => drafts[s],
        expectedRevisionOf: () => serverRev,
        onConflict,
        ...over,
      });
    const { rerender } = mountAutosave(props({ deps: [1] }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.expectedRevision).toBe(0);

    drafts[1] = { text: "A2" };
    rerender(props({ deps: [2] }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    calls[0].done.resolve(ok(false, 1));
    await settle();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);

    drafts[1] = { text: "A3-before-reconcile" };
    rerender(props({ deps: [3] }));
    vi.advanceTimersByTime(5000);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    serverRev = 1;
    rerender(props({ saveStatus: "conflict", deps: [3] }));
    drafts[1] = { text: "A3-after-reconcile" };
    rerender(props({ deps: [4] }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedRevision).toBe(1);
    expect(calls[1].body.draft).toEqual({ text: "A3-after-reconcile" });
  });

  it("carries expectedRevision — the project seed first, then the applied response", async () => {
    const { rerender } = mountAutosave(base({ deps: [1], expectedRevisionOf: () => 2 }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(calls[0].body.expectedRevision).toBe(2);

    calls[0].done.resolve(ok(true, 4));
    await settle();
    rerender(base({ deps: [2], expectedRevisionOf: () => 2 }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedRevision).toBe(4);

    calls[1].done.resolve(ok(true, 4));
    await settle();
    rerender(base({ deps: [3], expectedRevisionOf: () => 9 }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(calls[2].body.expectedRevision).toBe(9);
  });

  it("drops a stale response from an earlier lifecycle of the same class (A→B→A)", async () => {
    const onSaved = vi.fn();
    const onConflict = vi.fn();
    const { rerender } = mountAutosave(
      base({ scopeId: "class-A", deps: [1], onSaved, onConflict }),
    );
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    rerender(base({ scopeId: "class-B", saveStatus: "idle", deps: [2], onSaved, onConflict }));
    rerender(base({ scopeId: "class-A", deps: [9], onSaved, onConflict }));
    rerender(base({ scopeId: "class-A", deps: [10], onSaved, onConflict }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);

    calls[0].done.resolve(ok(false, 7));
    await settle();
    expect(onConflict).not.toHaveBeenCalled();

    calls[1].done.resolve(ok(true, 3));
    await settle();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(1, 3, undefined, undefined);
  });

  it("reports a rejection only while its arm is still current", async () => {
    const onError = vi.fn();
    const { rerender } = mountAutosave(base({ deps: [1], onError }));
    vi.advanceTimersByTime(1500);
    await settle();
    rerender(base({ deps: [2], onError }));
    vi.advanceTimersByTime(1500);
    await settle();
    const [first] = calls;
    first.done.reject(new Error("offline"));
    await settle();
    expect(onError).not.toHaveBeenCalled();

    calls[1].done.reject(new Error("offline"));
    await settle();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(1);
  });

  it("cancels timers, drops in-flight saves, and forgets stale revisions when resetVersion bumps", async () => {
    const onSaved = vi.fn();
    const { rerender } = mountAutosave(base({ deps: [1], resetVersion: 0, onSaved }));
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    calls[0].done.resolve(ok(true, 4));
    await settle();
    expect(onSaved).toHaveBeenCalledTimes(1);

    rerender(base({ deps: [2], saveStatus: "dirty", resetVersion: 0, onSaved }));
    rerender(base({ deps: [2], saveStatus: "idle", resetVersion: 1, onSaved }));
    vi.advanceTimersByTime(3000);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    rerender(
      base({
        deps: [3],
        saveStatus: "dirty",
        resetVersion: 1,
        expectedRevisionOf: () => 0,
        onSaved,
      }),
    );
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedRevision).toBe(0);
  });

  it("sends expectedGeneration and fences cross-tab generation conflicts until synced", async () => {
    const onConflict = vi.fn();
    const { rerender } = mountAutosave(
      base({
        deps: [1],
        expectedGeneration: 0,
        expectedRevisionOf: () => 0,
        onConflict,
      }),
    );
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.expectedGeneration).toBe(0);

    calls[0].done.resolve(ok(false, 0, undefined, 1));
    await settle();
    expect(onConflict).toHaveBeenCalledWith(1);

    rerender(
      base({
        deps: [2],
        expectedGeneration: 0,
        expectedRevisionOf: () => 0,
        onConflict,
      }),
    );
    vi.advanceTimersByTime(3000);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    rerender(
      base({
        deps: [2],
        saveStatus: "idle",
        expectedGeneration: 1,
        resetVersion: 1,
        expectedRevisionOf: () => 0,
        onConflict,
      }),
    );
    rerender(
      base({
        deps: [3],
        saveStatus: "dirty",
        expectedGeneration: 1,
        resetVersion: 1,
        expectedRevisionOf: () => 0,
        onConflict,
      }),
    );
    vi.advanceTimersByTime(1500);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedGeneration).toBe(1);
    expect(calls[1].body.expectedRevision).toBe(0);
  });
});
