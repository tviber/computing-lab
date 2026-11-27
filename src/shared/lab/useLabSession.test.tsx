import { TestLabRuntime } from "../../test/lab-runtime";
import { renderHook } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useLabSession,
  type LabSessionAction,
  type LabSessionOptions,
  type LabSessionState,
} from "./useLabSession";

type Draft = { text: string };

type State = LabSessionState<Draft> & { conflictedComponents: boolean };

type Action =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<string, Draft>;
      draftRevisions?: Record<string, number>;
    }
  | LabSessionAction<Draft>;

type Params = LabSessionOptions<Draft, Record<string, never>, Action, State>;

const emptyState = (): State => ({
  stageIndex: 1,
  drafts: {},
  draftRevisions: {},
  saveStatusByStage: {},
  unresolvedSyncConflicts: {},
  conflictedLocalDrafts: {},
  conflictedComponents: false,
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

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function mountSession(initial: State, over: Partial<Params> = {}) {
  const [state, setState] = createSignal(initial);
  const dispatch = vi.fn();
  const hook = renderHook(
    () =>
      useLabSession<Draft, Record<string, never>, Action, State>(() => ({
        scopeId: () => "class-1",
        ready: () => true,
        labId: "lab",
        state,
        dispatch,
        dispatchSession: dispatch,
        draftOf: (stageIndex) => state().drafts[stageIndex],
        toAction: (project) => ({
          type: "load-project",
          currentStage: project.currentStage,
          passedStages: project.passedStages,
          drafts: project.drafts,
          draftRevisions: project.draftRevisions,
        }),
        ...over,
      })),
    { wrapper: TestLabRuntime },
  );
  flush();
  return {
    result: hook.result,
    dispatch,
    setState,
    cleanup: hook.cleanup,
  };
}

describe("useLabSession", () => {
  let calls: {
    url: string;
    method: string;
    body: Record<string, unknown> | null;
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
          method: init?.method ?? "GET",
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
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
    await vi.advanceTimersByTimeAsync(0);
    flush();
  };

  const loadProject = async () => {
    calls[0].done.resolve(
      json({
        labId: "lab",
        currentStage: 1,
        passedStages: [],
        drafts: {},
        projectGeneration: 0,
      }),
    );
    await settle();
  };

  const markDirty = (setState: ReturnType<typeof createSignal<State>>[1]) => {
    setState({
      ...emptyState(),
      drafts: { 1: { text: "hello" } },
      saveStatusByStage: { 1: "dirty" },
    });
    flush();
  };

  it("loads the project and dispatches the default save actions", async () => {
    const { result, dispatch, setState } = mountSession(emptyState());
    await loadProject();
    expect(result.project.projectLoaded).toBe(true);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "load-project", currentStage: 1 }),
    );

    markDirty(setState);
    vi.advanceTimersByTime(1500);
    await settle();
    const save = calls.find((call) => call.method === "PUT");
    expect(save?.body).toMatchObject({ stageIndex: 1, draft: { text: "hello" } });

    save?.done.resolve(json({ applied: true, revision: 4 }));
    await settle();
    expect(dispatch).toHaveBeenCalledWith({ type: "mark-saving", stageIndex: 1 });
    expect(dispatch).toHaveBeenCalledWith({ type: "mark-saved", stageIndex: 1, revision: 4 });
  });

  it("uses the page's saved action factory when supplied", async () => {
    const { dispatch, setState } = mountSession(emptyState(), {
      actions: {
        saved: (stageIndex, revision, componentsRevision, componentsSeq) => ({
          type: "mark-saved",
          stageIndex,
          revision,
          componentsRevision,
          componentsSeq,
        }),
      },
    });
    await loadProject();
    markDirty(setState);
    vi.advanceTimersByTime(1500);
    await settle();

    const save = calls.find((call) => call.method === "PUT");
    save?.done.resolve(json({ applied: true, revision: 5, componentsRevision: 8 }));
    await settle();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "mark-saved",
        stageIndex: 1,
        revision: 5,
        componentsRevision: 8,
      }),
    );
  });

  it("resolves a save conflict when the server project has no drafts", async () => {
    const { dispatch, setState } = mountSession(emptyState());
    await loadProject();
    markDirty(setState);
    vi.advanceTimersByTime(1500);
    await settle();

    const save = calls.find((call) => call.method === "PUT");
    save?.done.resolve(json({ applied: false, revision: 2 }));
    await settle();

    const reconcile = calls.filter((call) => call.method === "GET")[1];
    reconcile.done.resolve(
      json({
        labId: "lab",
        currentStage: 1,
        passedStages: [],
        draftRevisions: { 1: 2 },
        projectGeneration: 0,
      }),
    );
    await settle();

    expect(dispatch).toHaveBeenCalledWith({
      type: "resolve-save-conflict",
      stageIndex: 1,
      draft: undefined,
      revision: 2,
    });
  });

  it("honours hasConflictBackup for the save indicator controls", async () => {
    const { result, dispatch, setState } = mountSession(emptyState(), {
      hasConflictBackup: (current) => current.conflictedComponents,
    });
    await loadProject();
    expect(result.saveIndicator.onRestoreLocal()).toBeUndefined();

    setState((current) => ({ ...current, conflictedComponents: true }));
    flush();
    const restore = result.saveIndicator.onRestoreLocal();
    expect(typeof restore).toBe("function");
    restore?.();
    expect(dispatch).toHaveBeenCalledWith({
      type: "restore-conflict-draft",
      stageIndex: 1,
    });
  });

  it("holds autosave until the page's ready predicate is true", async () => {
    const [ready, setReady] = createSignal(false);
    const { setState } = mountSession(emptyState(), {
      autosave: {
        ready: (project) => project.projectLoaded && ready(),
      },
    });
    await loadProject();
    markDirty(setState);
    vi.advanceTimersByTime(1500);
    await settle();
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(0);

    setReady(true);
    flush();
    vi.advanceTimersByTime(1500);
    await settle();
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(1);
  });
});
