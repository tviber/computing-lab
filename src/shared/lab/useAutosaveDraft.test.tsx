import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosaveDraft } from "./useAutosaveDraft";

type Draft = { text: string };

type Params = {
  classId: string | undefined;
  labId: string;
  saveStatus: string;
  stageIndex: number;
  draftOf: (stageIndex: number) => Draft | undefined;
  expectedRevisionOf: (stageIndex: number) => number;
  expectedComponentsRevisionOf?: () => number;
  bodyFor?: (stageIndex: number, draft: Draft) => Record<string, unknown>;
  deps?: unknown[];
  resetVersion?: number;
  onSaving: (stageIndex: number) => void;
  onSaved: (stageIndex: number, revision?: number, componentsRevision?: number) => void;
  onError: (stageIndex: number) => void;
  onConflict?: (stageIndex: number) => void;
};

const base = (over: Partial<Params> = {}): Params => ({
  classId: "class-1",
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

const ok = (applied = true, revision?: number, componentsRevision?: number) =>
  new Response(JSON.stringify({ ok: true, applied, revision, componentsRevision }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

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

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("debounces continuous edits into one PUT carrying the expected revision", async () => {
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1] }),
    });
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    rerender(base({ deps: [2] }));
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.stageIndex).toBe(1);
    expect(calls[0].body.expectedRevision).toBe(0);

    calls[0].done.resolve(ok());
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("settles every stage's flag on its own response, whatever order they return", async () => {
    const events: string[] = [];
    const listeners = {
      onSaving: (s: number) => events.push(`saving:${s}`),
      onSaved: (s: number) => events.push(`saved:${s}`),
      onError: (s: number) => events.push(`error:${s}`),
    };
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ ...listeners, deps: [1] }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    rerender(base({ ...listeners, stageIndex: 2, deps: [2] }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[0].body.stageIndex).toBe(1);
    expect(calls[1].body.stageIndex).toBe(2);

    // 乱序返回：stage 2 的响应先到。
    calls[1].done.resolve(ok());
    await flush();
    calls[0].done.resolve(ok());
    await flush();
    expect(events).toEqual(["saving:1", "saving:2", "saved:2", "saved:1"]);
  });

  it("serializes same-stage saves behind the in-flight one, never racing itself", async () => {
    const onSaved = vi.fn();
    const onError = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1], onSaved, onError }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    rerender(base({ deps: [2], onSaved, onError }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    // 同关卡的第二臂在上一次保存未完成时只能排队 —— 同一设备的两笔写入
    // 若并发携带相同的 expectedRevision 必然自相冲突，绝不能放出去。
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.expectedRevision).toBe(0);

    // 第一笔落地（服务器分配 revision 5）：排队臂立即以新期望号重发。
    calls[0].done.resolve(ok(true, 5));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedRevision).toBe(5);

    calls[1].done.resolve(ok(true, 6));
    await flush();
    // 被取代的旧臂不回报；只有最终臂的 applied 结果落到 saved。
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(1, 6, undefined, undefined);
    expect(onError).not.toHaveBeenCalled();
  });

  it("sends the bumped components revision on a queued component save, never self-conflicting", async () => {
    // 同一标签页连续两次组件编辑：第一笔带 expectedComponentsRevision 0 在途，
    // 第二笔排队。第一笔把组件库计数推进到 1 后，排队臂必须在发送时刻重新
    // 读取最新计数 —— 若仍发 arm 时刻的 0，就被自己的上一笔顶回（伪冲突）。
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
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: props({ deps: [1] }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.expectedRevision).toBe(0);
    expect(calls[0].body.expectedComponentsRevision).toBe(0);

    // 继续编辑组件 → 第二臂在第一笔仍在途时排队。
    rerender(props({ deps: [2] }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    // 第一笔落地（服务端 revision 5、组件库计数 1）：排队臂立即以最新
    // 期望号重发 —— 包括 reducer 还没来得及记下的 componentsRevision。
    calls[0].done.resolve(ok(true, 5, 1));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedRevision).toBe(5);
    expect(calls[1].body.expectedComponentsRevision).toBe(1);

    calls[1].done.resolve(ok(true, 6, 2));
    await flush();
    expect(onConflict).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(1, 6, 2, undefined);
    expect(stateRev).toBe(0);
  });

  it("serializes component saves across stages, never racing two library writes", async () => {
    // Stage-1 的组件写入在途时 stage-2 的组件保存只能排队 —— 同一客户端的
    // 两笔库写入并发必有一笔带着对方签发前的 expectedComponentsRevision
    // 出去，被服务器顶成伪冲突。放行后重算期望值。
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
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: props({ stageIndex: 1, deps: [1] }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.stageIndex).toBe(1);
    expect(calls[0].body.expectedComponentsRevision).toBe(0);

    // stage-2 的组件保存在 stage-1 在途时不得发出。
    rerender(props({ stageIndex: 2, deps: [2] }));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    // stage-1 落地：排队臂带着它签发的组件计数重发。
    calls[0].done.resolve(ok(true, 5, 1));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.stageIndex).toBe(2);
    expect(calls[1].body.expectedComponentsRevision).toBe(1);

    calls[1].done.resolve(ok(true, 6, 2));
    await flush();
    expect(onConflict).not.toHaveBeenCalled();
  });

  it("fences every component write project-wide until the library resyncs", async () => {
    // Stage-1 的组件保存被拒（服务端组件库已被另一标签推进到 1）：拒绝
    // 只报数不交付快照，appliedComponentsRev 不得吸收这个 revision ——
    // 在整库调和落地前，任何关卡都不得携带陈旧组件表 + 新期望号发出。
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
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: props({ stageIndex: 1, deps: [1] }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.stageIndex).toBe(1);
    expect(calls[0].body.expectedComponentsRevision).toBe(0);

    calls[0].done.resolve(ok(false, 5, 1));
    await flush();
    expect(onConflict).toHaveBeenCalledWith(1);

    // 调和未落前 stage-2 的组件保存：栅栏挡住，绝不能带着陈旧库发出 —
    // 旧实现会把拒绝回报的 1 当成已采用计数放它出去，静默顶掉另一标签。
    rerender(props({ stageIndex: 2, deps: [2] }));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    // 调和落地（reducer 记下服务端库及其 revision 1）→ 栅栏解除，下一笔
    // 以正确的期望号合法续写。
    stateRev = 1;
    rerender(props({ stageIndex: 2, saveStatus: "conflict", deps: [2] }));
    rerender(props({ stageIndex: 2, deps: [3] }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.stageIndex).toBe(2);
    expect(calls[1].body.expectedComponentsRevision).toBe(1);
  });

  it("never reports a server-dropped stale write as saved", async () => {
    const onSaved = vi.fn();
    renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ onSaved }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    calls[0].done.resolve(ok(false));
    await flush();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("clears armed timers and in-flight reporting on unmount", async () => {
    const onSaved = vi.fn();
    const first = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ onSaved }),
    });
    // 定时器还未触发就卸载：请求根本不该发出。
    first.unmount();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetch).not.toHaveBeenCalled();

    // 请求已发出时卸载：迟到的响应被丢弃。
    const second = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ onSaved }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    second.unmount();
    calls[0].done.resolve(ok());
    await flush();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("drops in-flight reporting when the class changes", async () => {
    const onSaved = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ onSaved }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    rerender(base({ classId: "class-2", saveStatus: "idle", onSaved }));
    calls[0].done.resolve(ok());
    await flush();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("never arms the stale dirty flag that survives a class switch", async () => {
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1] }),
    });
    // 切班瞬间旧班级关卡仍是 dirty（旧 lesson state 还在屏幕上）：
    // 此时不得在新 classId 下重建定时器、更不能把旧快照 PUT 过去。
    rerender(base({ classId: "class-2", deps: [1] }));
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetch).not.toHaveBeenCalled();

    // 新上下文里真正产生的 dirty 仍会正常排程。
    rerender(base({ classId: "class-2", deps: [2] }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe("/api/classes/class-2/labs/lab/draft");
  });

  it("drops an in-flight write on class switch even while the screen is still dirty", async () => {
    const onSaved = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ onSaved }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    // 请求已发出、响应未回就切班，且旧 dirty 仍留在屏幕上：
    // 既不得重排定时器，也不得把迟到的响应记成 saved。
    rerender(base({ classId: "class-2", onSaved }));
    calls[0].done.resolve(ok());
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await flush();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("fences a rejected stage: its queued arm never sends, onConflict fires once", async () => {
    const onSaved = vi.fn();
    const onError = vi.fn();
    const onConflict = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1], onSaved, onError, onConflict }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    rerender(base({ deps: [2], onSaved, onError, onConflict }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    // 同关卡第二臂在首个保存未完成时排队 —— 只有一个请求在途。
    expect(fetch).toHaveBeenCalledTimes(1);

    // 另一标签页先写入了服务端（revision 7）：本机写入被拒。排队臂携带的
    // 是冲突发生前的内容 —— 若带着调和后的 expectedRevision 放出去，就等于
    // 静默覆盖胜出的写入。拒绝之后该关卡一切待发路径全部作废。
    calls[0].done.resolve(ok(false, 7));
    await flush();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledWith(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("kills a still-debouncing arm when the stage's in-flight write is rejected", async () => {
    const onConflict = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1], onConflict }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    // A2 已武装但 debounce 未满 —— 拒绝到达时它的定时器必须连快照一起
    // 死掉，否则到点后它会带着调和后的 expectedRevision 发出冲突前的内容。
    rerender(base({ deps: [2], onConflict }));
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    calls[0].done.resolve(ok(false, 7));
    await flush();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledWith(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a losing tab fenced until the stage reconciles, then saves with the new revision", async () => {
    // 两个标签页竞争同一关卡：本机 A1 在途、A2 已排队；另一标签的 B1 先落地
    // （服务端 revision 1），A1 被拒 —— A2 绝不能带着新 expectedRevision 悄悄
    // 盖掉 B1；直到调和落地后新产生的 dirty 才能合法地以 revision 1 续写。
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
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: props({ deps: [1] }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.expectedRevision).toBe(0);

    // 学习者继续编辑 → A2 在 A1 在途时排队。
    drafts[1] = { text: "A2" };
    rerender(props({ deps: [2] }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    // B1 先落地：A1 被拒，A2 的排队项与快照一并作废。
    calls[0].done.resolve(ok(false, 1));
    await flush();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);

    // 调和未落之前继续编辑：仍然拦截 —— 这些改动早于服务端写入，无权胜出。
    drafts[1] = { text: "A3-before-reconcile" };
    rerender(props({ deps: [3] }));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    // fetchProject 调和落地：expectedRevisionOf 读到服务端 revision 1。之后
    // 新产生的 dirty（或找回的本地版本）以 revision 1 为期望合法续写。
    serverRev = 1;
    rerender(props({ saveStatus: "conflict", deps: [3] }));
    drafts[1] = { text: "A3-after-reconcile" };
    rerender(props({ deps: [4] }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedRevision).toBe(1);
    expect(calls[1].body.draft).toEqual({ text: "A3-after-reconcile" });
  });

  it("carries expectedRevision — the project seed first, then the applied response", async () => {
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1], expectedRevisionOf: () => 2 }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    // 项目载入时种下的 lastAppliedRevision 是第一笔的期望值。
    expect(calls[0].body.expectedRevision).toBe(2);

    calls[0].done.resolve(ok(true, 4));
    await flush();
    rerender(base({ deps: [2], expectedRevisionOf: () => 2 }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    // 之后以最近一次 applied 响应���配��的 revision 为期望 —— expectedRevision
    // 在发送时刻计算，arm 与 send 之间落地的保存也会算进来。
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedRevision).toBe(4);

    // reducer 侧读到更高的 seed（如项目重载）时以它为准。
    calls[1].done.resolve(ok(true, 4));
    await flush();
    rerender(base({ deps: [3], expectedRevisionOf: () => 9 }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(calls[2].body.expectedRevision).toBe(9);
  });

  it("drops a stale response from an earlier lifecycle of the same class (A→B→A)", async () => {
    const onSaved = vi.fn();
    const onConflict = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ classId: "class-A", deps: [1], onSaved, onConflict }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    // A 生命周期 1 的请求在途。
    expect(fetch).toHaveBeenCalledTimes(1);

    // 切到 B 再切回 A —— classId 又等于 A，但 generation 已推进：旧 A 的
    // 响应必须被丢弃，不得触发 onConflict，也不得取消新 A 的排程。
    rerender(base({ classId: "class-B", saveStatus: "idle", deps: [2], onSaved, onConflict }));
    // 回到 A 的第一帧还挂着旧上下文的 flag（stale-dirty 保护，不 arm）；
    // 新上下文真正产生的 dirty 才会排程。
    rerender(base({ classId: "class-A", deps: [9], onSaved, onConflict }));
    rerender(base({ classId: "class-A", deps: [10], onSaved, onConflict }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    // 新 A 生命周期的保存正常发出。
    expect(fetch).toHaveBeenCalledTimes(2);

    calls[0].done.resolve(ok(false, 7));
    await flush();
    expect(onConflict).not.toHaveBeenCalled();

    // 新 A 的响应照常落地：旧响应没有弄掉它的 in-flight 记录或回调。
    calls[1].done.resolve(ok(true, 3));
    await flush();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(1, 3, undefined, undefined);
  });

  it("reports a rejection only while its arm is still current", async () => {
    const onError = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1], onError }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    rerender(base({ deps: [2], onError }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    const [first] = calls;
    first.done.reject(new Error("offline"));
    await flush();
    expect(onError).not.toHaveBeenCalled();

    calls[1].done.reject(new Error("offline"));
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(1);
  });

  it("cancels timers, drops in-flight saves, and forgets stale revisions when resetVersion bumps", async () => {
    const onSaved = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1], resetVersion: 0, onSaved }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    calls[0].done.resolve(ok(true, 4));
    await flush();
    expect(onSaved).toHaveBeenCalledTimes(1);

    // Arm a new timer before resetting, then bump resetVersion with clean/idle status.
    rerender(base({ deps: [2], saveStatus: "dirty", resetVersion: 0, onSaved }));
    rerender(base({ deps: [2], saveStatus: "idle", resetVersion: 1, onSaved }));
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    // Pre-reset armed timer was cancelled.
    expect(fetch).toHaveBeenCalledTimes(1);

    // Subsequent edit after reset starts from expectedRevision 0 instead of stale revision 4.
    rerender(
      base({
        deps: [3],
        saveStatus: "dirty",
        resetVersion: 1,
        expectedRevisionOf: () => 0,
        onSaved,
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedRevision).toBe(0);
  });
});
