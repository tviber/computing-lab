import { TestLabRuntime } from "../../test/lab-runtime";
import { renderHook } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  reconcileConflictedStage,
  useLabProject,
  type UseLabProjectOptions,
} from "./useLabProject";

type Payload = {
  labId: string;
  currentStage: number;
  passedStages: number[];
  drafts: Record<string, unknown>;
  projectGeneration?: number;
};

type Action = { type: string; project: Payload; isReset?: boolean };
type Params = UseLabProjectOptions<unknown, Record<string, never>, Action>;

const base = (over: Partial<Params> = {}): Params => ({
  scopeId: "class-1",
  labId: "lab",
  ready: true,
  stageIndex: 2,
  toAction: (project, meta) => ({
    type: "load",
    project,
    ...(meta?.isReset ? { isReset: true } : null),
  }),
  dispatch: vi.fn(),
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

const payload = (labId: string): Response =>
  new Response(JSON.stringify({ labId, currentStage: 2, passedStages: [1], drafts: {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function mountLabProject(initial: Params) {
  const [params, setParams] = createSignal(initial);
  const hook = renderHook(() => useLabProject(params), { wrapper: TestLabRuntime });
  flush();
  return {
    result: hook.result,
    rerender: (next: Params) => {
      setParams(next);
      flush();
    },
    unmount: () => hook.cleanup(),
  };
}

describe("useLabProject", () => {
  let calls: { url: string; done: ReturnType<typeof deferred<Response>> }[];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown, _init?: unknown) => {
        const done = deferred<Response>();
        calls.push({ url: String(input), done });
        return done.promise;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const settle = async () => {
    flush();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    flush();
  };

  it("dispatches the loaded project", async () => {
    const dispatch = vi.fn();
    mountLabProject(base({ dispatch }));
    expect(calls[0].url).toBe("/api/classes/class-1/labs/lab/project");
    calls[0].done.resolve(payload("lab"));
    await settle();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "load",
      project: expect.objectContaining({ labId: "lab" }),
    });
  });

  it("drops a stale response once a newer request has started", async () => {
    const dispatch = vi.fn();
    const { rerender } = mountLabProject(base({ dispatch }));
    rerender(base({ scopeId: "class-2", dispatch }));
    expect(calls).toHaveLength(2);

    calls[1].done.resolve(payload("lab"));
    await settle();
    expect(dispatch).toHaveBeenCalledTimes(1);

    calls[0].done.resolve(payload("lab"));
    await settle();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("drops the response of a request whose component unmounted", async () => {
    const dispatch = vi.fn();
    const { unmount } = mountLabProject(base({ dispatch }));
    unmount();
    calls[0].done.resolve(payload("lab"));
    await settle();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("fetchProject() refetches on a fresh ticket and returns the payload without dispatching", async () => {
    const dispatch = vi.fn();
    const { result } = mountLabProject(base({ dispatch }));
    calls[0].done.resolve(payload("lab"));
    await settle();
    expect(dispatch).toHaveBeenCalledTimes(1);

    const pending = result.fetchProject();
    calls[1].done.resolve(payload("lab"));
    const fetched = await pending;
    await settle();
    expect(calls[1].url).toBe("/api/classes/class-1/labs/lab/project");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(fetched).toMatchObject({ labId: "lab", currentStage: 2 });
  });

  it("a fetchProject supersedes an earlier in-flight request and resolves null for it", async () => {
    const dispatch = vi.fn();
    const { result } = mountLabProject(base({ dispatch }));
    const fetched = result.fetchProject();
    expect(calls).toHaveLength(2);

    calls[0].done.resolve(payload("lab"));
    await settle();
    expect(dispatch).not.toHaveBeenCalled();
    calls[1].done.resolve(payload("lab"));
    await settle();
    expect(dispatch).not.toHaveBeenCalled();
    await expect(fetched).resolves.toMatchObject({ labId: "lab" });

    const stale = result.fetchProject();
    void result.fetchProject();
    calls[2].done.resolve(payload("lab"));
    await settle();
    await expect(stale).resolves.toBeNull();
  });

  it("a failing fetchProject resolves null without touching loadError", async () => {
    const dispatch = vi.fn();
    const { result } = mountLabProject(base({ dispatch }));
    calls[0].done.resolve(payload("lab"));
    await settle();

    const pending = result.fetchProject();
    calls[1].done.resolve(new Response("boom", { status: 500 }));
    const fetched = await pending;
    await settle();
    expect(fetched).toBeNull();
    expect(result.loadError).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("surfaces load errors for the current request only", async () => {
    const dispatch = vi.fn();
    const { result, rerender } = mountLabProject(base({ dispatch }));
    rerender(base({ scopeId: "class-2", dispatch }));

    calls[0].done.resolve(new Response(JSON.stringify({ error: "not-a-member" }), { status: 403 }));
    await settle();
    expect(result.loadError).toBeNull();

    calls[1].done.resolve(new Response(JSON.stringify({ error: "not-a-member" }), { status: 403 }));
    await settle();
    expect(result.loadError).toBe("你不在这个班级里。");
  });

  it("enables reset once the project loads", async () => {
    const dispatch = vi.fn();
    const onResetSuccess = vi.fn();
    const { result } = mountLabProject(base({ dispatch, onResetSuccess }));
    expect(result.resetControls.canReset).toBe(false);
    calls[0].done.resolve(payload("lab"));
    await settle();

    expect(result.resetControls.canReset).toBe(true);
    expect(result.saveGeneration).toBe(0);

    const resetPromise = result.resetProject({ scope: "stage", stageIndex: 2 });
    flush();
    expect(result.resetting).toBe(true);
    expect(calls[1].url).toBe("/api/classes/class-1/labs/lab/reset");

    calls[1].done.resolve(
      new Response(
        JSON.stringify({ labId: "lab", currentStage: 1, passedStages: [], drafts: {} }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const ok = await resetPromise;
    await settle();
    expect(ok).toBe(true);
    expect(result.resetting).toBe(false);
    expect(result.saveGeneration).toBe(1);
    expect(onResetSuccess).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "load",
      project: expect.objectContaining({ currentStage: 1, passedStages: [] }),
      isReset: true,
    });
  });

  it("surfaces reset errors and leaves saveGeneration untouched when POST /reset fails", async () => {
    const dispatch = vi.fn();
    const onResetSuccess = vi.fn();
    const { result } = mountLabProject(base({ dispatch, onResetSuccess }));
    calls[0].done.resolve(payload("lab"));
    await settle();

    const resetPromise = result.resetProject({ scope: "lab" });
    calls[1].done.resolve(
      new Response(JSON.stringify({ error: "teacher-required" }), { status: 403 }),
    );
    const ok = await resetPromise;
    await settle();
    expect(ok).toBe(false);

    expect(result.resetting).toBe(false);
    expect(result.resetError).toBeTruthy();
    expect(result.saveGeneration).toBe(0);
    expect(onResetSuccess).not.toHaveBeenCalled();
  });

  it("attaches expectedGeneration on postJudge, drops stale judge responses on reset, and blocks submit during reset", async () => {
    const dispatch = vi.fn();
    const onResetSuccess = vi.fn();
    const { result } = mountLabProject(base({ dispatch, onResetSuccess }));
    calls[0].done.resolve(
      new Response(
        JSON.stringify({
          labId: "lab",
          currentStage: 3,
          passedStages: [1, 2],
          drafts: {},
          projectGeneration: 2,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await settle();
    expect(result.projectGeneration).toBe(2);

    const judgePromise = result.postJudge({ stageIndex: 3, draft: {} });
    flush();
    expect(result.submittingJudge).toBe(true);
    expect(calls[1].url).toBe("/api/classes/class-1/labs/lab/judge");

    const resetPromise = result.resetProject({ scope: "lab" });
    flush();
    expect(result.submittingJudge).toBe(false);
    expect(result.resetting).toBe(true);

    const blockedWhileResetting = await result.postJudge({ stageIndex: 1, draft: {} });
    expect(blockedWhileResetting).toEqual({ status: "stale" });
    expect(calls).toHaveLength(3);

    calls[2].done.resolve(
      new Response(
        JSON.stringify({
          labId: "lab",
          currentStage: 1,
          passedStages: [],
          drafts: {},
          projectGeneration: 3,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await resetPromise;
    await settle();
    expect(result.projectGeneration).toBe(3);

    calls[1].done.resolve(
      new Response(JSON.stringify({ passed: true, passedStages: [1, 2, 3] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const judgeResult = await judgePromise;
    expect(judgeResult).toEqual({ status: "stale" });
    expect(onResetSuccess).toHaveBeenCalledTimes(1);
  });

  it("syncs project on 409 stale-project-generation from another tab and via reconcileConflictedStage", async () => {
    const dispatch = vi.fn();
    const onResetSuccess = vi.fn();
    const { result } = mountLabProject(base({ dispatch, onResetSuccess }));
    calls[0].done.resolve(
      new Response(
        JSON.stringify({
          labId: "lab",
          currentStage: 4,
          passedStages: [1, 2, 3],
          drafts: { "4": { x: 1 } },
          projectGeneration: 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await settle();

    const judgePromise = result.postJudge({ stageIndex: 4 });
    calls[1].done.resolve(
      new Response(JSON.stringify({ error: "stale-project-generation" }), { status: 409 }),
    );
    await settle();
    expect(calls[2].url).toBe("/api/classes/class-1/labs/lab/project");
    calls[2].done.resolve(
      new Response(
        JSON.stringify({
          labId: "lab",
          currentStage: 1,
          passedStages: [],
          drafts: {},
          projectGeneration: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const judgeResult = await judgePromise;
    await settle();
    expect(judgeResult).toEqual({ status: "stale" });
    expect(result.projectGeneration).toBe(1);
    expect(result.saveGeneration).toBe(1);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "load",
      project: expect.objectContaining({ currentStage: 1, passedStages: [], projectGeneration: 1 }),
      isReset: true,
    });

    const onResolved = vi.fn();
    const onSyncError = vi.fn();
    reconcileConflictedStage({
      fetchProject: result.fetchProject,
      stageIndex: 2,
      onResolved,
      onSyncError,
    });
    calls[3].done.resolve(
      new Response(
        JSON.stringify({
          labId: "lab",
          currentStage: 1,
          passedStages: [],
          drafts: {},
          projectGeneration: 2,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await settle();
    expect(result.projectGeneration).toBe(2);
    expect(result.saveGeneration).toBe(2);
    expect(onResolved).not.toHaveBeenCalled();
    expect(onSyncError).not.toHaveBeenCalled();
    expect(onResetSuccess).toHaveBeenCalledTimes(2);
  });

  it("settles resetting even when a conflict refetch overlaps an in-flight reset", async () => {
    const dispatch = vi.fn();
    const { result } = mountLabProject(base({ dispatch }));
    const body = (gen: number) =>
      new Response(
        JSON.stringify({
          labId: "lab",
          currentStage: 1,
          passedStages: [],
          drafts: {},
          projectGeneration: gen,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    calls[0].done.resolve(body(0));
    await settle();

    const resetPromise = result.resetProject({ scope: "lab" });
    flush();
    expect(result.resetting).toBe(true);

    const onResolved = vi.fn();
    const onSyncError = vi.fn();
    reconcileConflictedStage({
      fetchProject: result.fetchProject,
      stageIndex: 1,
      onResolved,
      onSyncError,
    });
    expect(calls[2].url).toBe("/api/classes/class-1/labs/lab/project");

    calls[2].done.resolve(body(0));
    await settle();
    calls[1].done.resolve(body(1));
    expect(await resetPromise).toBe(true);
    await settle();
    expect(result.resetting).toBe(false);
    expect(result.projectGeneration).toBe(1);
    expect(onResolved).not.toHaveBeenCalled();
    expect(onSyncError).not.toHaveBeenCalled();
  });
});
