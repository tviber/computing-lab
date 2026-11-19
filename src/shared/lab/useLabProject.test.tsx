import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileConflictedStage, useLabProject } from "./useLabProject";

type Payload = {
  labId: string;
  currentStage: number;
  passedStages: number[];
  drafts: Record<string, unknown>;
  projectGeneration?: number;
};

type Params = {
  classId: string | undefined;
  labId: string;
  ready: boolean;
  staff?: boolean;
  onResetSuccess?: () => void;
  toAction: (
    project: Payload,
    meta?: { isReset?: boolean },
  ) => { type: string; project: Payload; isReset?: boolean };
  dispatch: (action: { type: string; project: Payload; isReset?: boolean }) => void;
};

const base = (over: Partial<Params> = {}): Params => ({
  classId: "class-1",
  labId: "lab",
  ready: true,
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

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("dispatches the loaded project", async () => {
    const dispatch = vi.fn();
    renderHook((p: Params) => useLabProject(p), { initialProps: base({ dispatch }) });
    expect(calls[0].url).toBe("/api/classes/class-1/labs/lab/project");
    calls[0].done.resolve(payload("lab"));
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "load",
      project: expect.objectContaining({ labId: "lab" }),
    });
  });

  it("drops a stale response once a newer request has started", async () => {
    const dispatch = vi.fn();
    const { rerender } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch }),
    });
    rerender(base({ classId: "class-2", dispatch }));
    expect(calls).toHaveLength(2);

    // 新请求先回来。
    calls[1].done.resolve(payload("lab"));
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);

    // 旧 classId 的迟到响应被丢弃，不得覆盖新班级状态。
    calls[0].done.resolve(payload("lab"));
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("drops the response of a request whose component unmounted", async () => {
    const dispatch = vi.fn();
    const { unmount } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch }),
    });
    unmount();
    calls[0].done.resolve(payload("lab"));
    await flush();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("fetchProject() refetches on a fresh ticket and returns the payload without dispatching", async () => {
    const dispatch = vi.fn();
    const { result } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch }),
    });
    calls[0].done.resolve(payload("lab"));
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);

    let fetched: unknown;
    await act(async () => {
      const pending = result.current.fetchProject();
      calls[1].done.resolve(payload("lab"));
      fetched = await pending;
    });
    expect(calls[1].url).toBe("/api/classes/class-1/labs/lab/project");
    // 冲突调和只把原始 payload 交给调用方 —— 不重复 dispatch load-project，
    // 其他关卡的本地状态因此不受影响。
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(fetched).toMatchObject({ labId: "lab", currentStage: 2 });
  });

  it("a fetchProject supersedes an earlier in-flight request and resolves null for it", async () => {
    const dispatch = vi.fn();
    const { result } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch }),
    });
    let fetched: Promise<unknown> = Promise.resolve();
    await act(async () => {
      fetched = result.current.fetchProject();
    });
    expect(calls).toHaveLength(2);

    // 重取发起后，先发的那个响应作废。
    calls[0].done.resolve(payload("lab"));
    await flush();
    expect(dispatch).not.toHaveBeenCalled();
    calls[1].done.resolve(payload("lab"));
    await flush();
    // fetchProject 不 dispatch；迟到或失败时resolve为 null。
    expect(dispatch).not.toHaveBeenCalled();
    await expect(fetched).resolves.toMatchObject({ labId: "lab" });

    // 再发一次 fetchProject 把它顶掉：被取代的请求响应到达时 resolve null。
    let stale: Promise<unknown> = Promise.resolve();
    await act(async () => {
      stale = result.current.fetchProject();
      void result.current.fetchProject();
    });
    calls[2].done.resolve(payload("lab"));
    await flush();
    await expect(stale).resolves.toBeNull();
  });

  it("a failing fetchProject resolves null without touching loadError", async () => {
    const dispatch = vi.fn();
    const { result } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch }),
    });
    calls[0].done.resolve(payload("lab"));
    await flush();

    let fetched: unknown;
    await act(async () => {
      const pending = result.current.fetchProject();
      calls[1].done.resolve(new Response("boom", { status: 500 }));
      fetched = await pending;
    });
    expect(fetched).toBeNull();
    expect(result.current.loadError).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("surfaces load errors for the current request only", async () => {
    const dispatch = vi.fn();
    const { result, rerender } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch }),
    });
    rerender(base({ classId: "class-2", dispatch }));

    calls[0].done.resolve(new Response(JSON.stringify({ error: "not-a-member" }), { status: 403 }));
    await flush();
    expect(result.current.loadError).toBeNull();

    calls[1].done.resolve(new Response(JSON.stringify({ error: "not-a-member" }), { status: 403 }));
    await flush();
    expect(result.current.loadError).toBe("你不在这个班级里。");
  });

  it("exposes staffControls only when staff=true and resets via POST /reset", async () => {
    const dispatch = vi.fn();
    const onResetSuccess = vi.fn();
    const { result, rerender } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch, staff: false, onResetSuccess }),
    });
    expect(result.current.staffControls).toBeUndefined();
    calls[0].done.resolve(payload("lab"));
    await flush();

    rerender(base({ dispatch, staff: true, onResetSuccess }));
    expect(result.current.staffControls?.freeNavigation).toBe(true);
    expect(result.current.saveGeneration).toBe(0);

    let resetPromise!: Promise<boolean>;
    await act(async () => {
      resetPromise = result.current.resetProject();
    });
    expect(result.current.resetting).toBe(true);
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
    let ok = false;
    await act(async () => {
      ok = await resetPromise;
    });
    expect(ok).toBe(true);
    expect(result.current.resetting).toBe(false);
    expect(result.current.saveGeneration).toBe(1);
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
    const { result } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch, staff: true, onResetSuccess }),
    });
    calls[0].done.resolve(payload("lab"));
    await flush();

    let resetPromise!: Promise<boolean>;
    await act(async () => {
      resetPromise = result.current.resetProject();
    });
    calls[1].done.resolve(
      new Response(JSON.stringify({ error: "teacher-required" }), { status: 403 }),
    );
    let ok = true;
    await act(async () => {
      ok = await resetPromise;
    });
    expect(ok).toBe(false);

    expect(result.current.resetting).toBe(false);
    expect(result.current.resetError).toBeTruthy();
    expect(result.current.saveGeneration).toBe(0);
    expect(onResetSuccess).not.toHaveBeenCalled();
  });

  it("attaches expectedGeneration on postJudge, drops stale judge responses on reset, and blocks submit during reset", async () => {
    const dispatch = vi.fn();
    const onResetSuccess = vi.fn();
    const { result } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch, staff: true, onResetSuccess }),
    });
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
    await flush();
    expect(result.current.projectGeneration).toBe(2);

    // Start judge request (sends expectedGeneration: 2), then start reset mid-flight.
    let judgePromise!: ReturnType<typeof result.current.postJudge>;
    await act(async () => {
      judgePromise = result.current.postJudge({ stageIndex: 3, draft: {} });
    });
    expect(result.current.submittingJudge).toBe(true);
    expect(calls[1].url).toBe("/api/classes/class-1/labs/lab/judge");

    let resetPromise!: Promise<boolean>;
    await act(async () => {
      resetPromise = result.current.resetProject();
    });
    expect(result.current.submittingJudge).toBe(false);
    expect(result.current.resetting).toBe(true);

    // Submitting while reset is in-flight is rejected synchronously as stale.
    let blockedWhileResetting!: Awaited<ReturnType<typeof result.current.postJudge>>;
    await act(async () => {
      blockedWhileResetting = await result.current.postJudge({ stageIndex: 1, draft: {} });
    });
    expect(blockedWhileResetting).toEqual({ status: "stale" });
    expect(calls).toHaveLength(3); // no extra fetch issued

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
    await act(async () => {
      await resetPromise;
    });
    expect(result.current.projectGeneration).toBe(3);

    // Pre-reset judge response finally lands with passedStages=[1,2,3] — must return stale!
    calls[1].done.resolve(
      new Response(JSON.stringify({ passed: true, passedStages: [1, 2, 3] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    let judgeResult!: Awaited<ReturnType<typeof result.current.postJudge>>;
    await act(async () => {
      judgeResult = await judgePromise;
    });
    expect(judgeResult).toEqual({ status: "stale" });
    expect(onResetSuccess).toHaveBeenCalledTimes(1);
  });

  it("syncs project on 409 stale-project-generation from another tab and via reconcileConflictedStage", async () => {
    const dispatch = vi.fn();
    const onResetSuccess = vi.fn();
    const { result } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch, staff: true, onResetSuccess }),
    });
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
    await flush();

    // Another tab reset the project (generation 0 -> 1); this tab posts judge and gets 409.
    let judgePromise!: ReturnType<typeof result.current.postJudge>;
    await act(async () => {
      judgePromise = result.current.postJudge({ stageIndex: 4 });
    });
    calls[1].done.resolve(
      new Response(JSON.stringify({ error: "stale-project-generation" }), { status: 409 }),
    );
    await flush();
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
    let judgeResult!: Awaited<ReturnType<typeof result.current.postJudge>>;
    await act(async () => {
      judgeResult = await judgePromise;
    });
    expect(judgeResult.status).toBe("error");
    expect(result.current.projectGeneration).toBe(1);
    expect(result.current.saveGeneration).toBe(1);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "load",
      project: expect.objectContaining({ currentStage: 1, passedStages: [], projectGeneration: 1 }),
      isReset: true,
    });

    // Cross-tab reset also reconciles cleanly inside reconcileConflictedStage (generation 1 -> 2).
    const onResolved = vi.fn();
    const onSyncError = vi.fn();
    await act(async () => {
      reconcileConflictedStage({
        fetchProject: result.current.fetchProject,
        stageIndex: 2,
        onResolved,
        onSyncError,
      });
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
    await flush();
    expect(result.current.projectGeneration).toBe(2);
    expect(result.current.saveGeneration).toBe(2);
    expect(onResolved).not.toHaveBeenCalled();
    expect(onSyncError).not.toHaveBeenCalled();
    expect(onResetSuccess).toHaveBeenCalledTimes(2);
  });
});
