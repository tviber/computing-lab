import { act, fireEvent, render, screen } from "@testing-library/react";
import { useReducer, type Dispatch } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DecodingDraft } from "../../features/decoding/domain/protocol";
import {
  createDecodingLessonState,
  emptyDraft,
  transitionDecodingLesson,
  type DecodingLessonAction,
  type DecodingLessonState,
} from "../../features/decoding/lesson/state";
import { statusForStage, syncConflictForStage } from "./saveStatus";
import { SaveIndicator } from "./LabGate";
import { useAutosaveDraft } from "./useAutosaveDraft";
import { reconcileConflictedStage, useLabProject } from "./useLabProject";

/**
 * Save-conflict recovery end to end, driven through the REAL decoding lesson
 * reducer: a PUT the server refuses (`applied: false`) must reconcile ONLY
 * the conflicted stage — the other stages' unsaved local drafts and their
 * save flags survive, and the conflict flag lands on the stage it belongs
 * to. The final reducer state is what is asserted.
 */

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const decodingDraft = (code: string): DecodingDraft => ({ ...emptyDraft(), code });

type LabState = DecodingLessonState;

describe("save conflict recovery", () => {
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

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("reconciles only the conflicted stage through the real reducer", async () => {
    // The probe wires the hooks exactly like the lab pages do, but keeps the
    // lesson reducer in the open so the test can seed edits and read the
    // final state after the conflict resolves.
    const exposed: { state: LabState; dispatch: Dispatch<DecodingLessonAction> | null } = {
      state: createDecodingLessonState(1),
      dispatch: null,
    };

    function Probe() {
      const [state, dispatch] = useReducer(transitionDecodingLesson, undefined, () =>
        createDecodingLessonState(1),
      );
      exposed.state = state;
      exposed.dispatch = dispatch;
      const { fetchProject, projectLoaded } = useLabProject<
        DecodingDraft,
        Record<string, never>,
        DecodingLessonAction
      >({
        classId: "class-1",
        labId: "decoding",
        ready: true,
        toAction: (project) => ({
          type: "load-project",
          currentStage: project.currentStage,
          passedStages: project.passedStages,
          draftRevisions: project.draftRevisions,
          drafts: Object.fromEntries(
            Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
          ),
          payloads: {},
        }),
        dispatch,
      });
      useAutosaveDraft<DecodingDraft>({
        classId: "class-1",
        labId: "decoding",
        saveStatus: projectLoaded
          ? statusForStage(state.saveStatusByStage, state.stageIndex)
          : "idle",
        stageIndex: state.stageIndex,
        draftOf: (s) => state.drafts[s],
        expectedRevisionOf: (s) => state.draftRevisions[s] ?? 0,
        onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
        onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
        onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
        onConflict: (s) => {
          void fetchProject().then((project) => {
            if (!project) {
              dispatch({ type: "mark-save-sync-error", stageIndex: s });
              return;
            }
            dispatch({
              type: "resolve-save-conflict",
              stageIndex: s,
              draft: project.drafts?.[s] ?? emptyDraft(),
              revision: project.draftRevisions?.[s],
            });
          });
        },
      });
      return null;
    }

    render(<Probe />);
    // 初始 project GET：stage 1 已通过（stage 2 解锁），服务端无草稿。
    calls[0].done.resolve(
      json({ labId: "decoding", currentStage: 1, passedStages: [1], drafts: {} }),
    );
    await flush();

    const dispatch = (a: DecodingLessonAction) =>
      act(() => {
        exposed.dispatch?.(a);
      });

    // Stage 1 留下一个本地未保存草稿，autosave 已在途 → flag "saving"。
    dispatch({ type: "set-code", code: "mine-1" });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    const put1 = calls.find((c) => c.method === "PUT");
    expect(put1?.body?.stageIndex).toBe(1);
    expect(put1?.body?.expectedRevision).toBe(0);

    // 切到 stage 2 再编辑 —— stage 2 的保存随后在途。
    dispatch({ type: "select-stage", stageIndex: 2 });
    dispatch({ type: "set-code", code: "local-2" });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    const put2 = calls.filter((c) => c.method === "PUT")[1];
    expect(put2?.body?.stageIndex).toBe(2);

    // 服务器上另一设备已写入更新的数据（revision 7）：本机写入被拒。
    put2?.done.resolve(json({ ok: true, applied: false, revision: 7 }));
    await flush();
    // onConflict → fetchProject：重取只为调和，不再走整图 load-project。
    const refetch = calls.find((c, i) => i > 0 && c.method === "GET");
    expect(refetch?.url).toBe("/api/classes/class-1/labs/decoding/project");
    refetch?.done.resolve(
      json({
        labId: "decoding",
        currentStage: 1,
        passedStages: [1],
        drafts: { "2": decodingDraft("server-2") },
        draftRevisions: { "2": 7 },
      }),
    );
    await flush();

    // 终态断言（真实 reducer，不是 dispatch 顺序）：
    // - stage 2 换成服务端草稿、flag 落定 conflict、revision 记录服务端值；
    // - stage 1 的本地草稿与 flag 原样保留 —— 旧的 load-project 路径会把
    //   它们一起清掉。
    expect(exposed.state.drafts[2]?.code).toBe("server-2");
    expect(statusForStage(exposed.state.saveStatusByStage, 2)).toBe("conflict");
    expect(exposed.state.draftRevisions[2]).toBe(7);
    expect(exposed.state.drafts[1]?.code).toBe("mine-1");
    expect(statusForStage(exposed.state.saveStatusByStage, 1)).toBe("saving");
    expect(exposed.state.stageIndex).toBe(2);

    // stage 1 的在途保存随后落地：flag 收敛到 saved，revision 也记入。
    put1?.done.resolve(json({ ok: true, applied: true, revision: 3 }));
    await flush();
    expect(statusForStage(exposed.state.saveStatusByStage, 1)).toBe("saved");
    expect(exposed.state.draftRevisions[1]).toBe(3);
    // 冲突过的 stage 2 不受影响。
    expect(statusForStage(exposed.state.saveStatusByStage, 2)).toBe("conflict");
    expect(exposed.state.drafts[2]?.code).toBe("server-2");

    // 被服务端草稿覆盖的本地草稿并没有丢：可找回的副本留在
    // conflictedLocalDrafts —— “找回我未保存的修改” 用它换回本地版本。
    expect(exposed.state.conflictedLocalDrafts[2]?.code).toBe("local-2");

    dispatch({ type: "restore-conflict-draft", stageIndex: 2 });
    expect(exposed.state.drafts[2]?.code).toBe("local-2");
    expect(exposed.state.conflictedLocalDrafts[2]).toBeUndefined();
    expect(statusForStage(exposed.state.saveStatusByStage, 2)).toBe("dirty");

    // 找回的草稿标记 dirty → autosave 重新排程。此时 expectedRevision 已是
    // 调和后的服务端 revision 7，这笔写入是合法地覆盖（而非偷渡）。
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    const put3 = calls.filter((c) => c.method === "PUT")[2];
    expect(put3?.body?.stageIndex).toBe(2);
    expect(put3?.body?.expectedRevision).toBe(7);
    expect((put3?.body?.draft as DecodingDraft | undefined)?.code).toBe("local-2");

    put3?.done.resolve(json({ ok: true, applied: true, revision: 8 }));
    await flush();
    expect(statusForStage(exposed.state.saveStatusByStage, 2)).toBe("saved");
    expect(exposed.state.draftRevisions[2]).toBe(8);
    expect(exposed.state.drafts[2]?.code).toBe("local-2");
  });

  it("flags sync-error when the reconcile fetch fails; only an explicit retry lifts the fence", async () => {
    // 被拒的写入之后 fetchProject 失败：本地草稿原样保留、关卡仍被
    // revision 栅栏挡住，状态是「同步失败」而不是谎称已载入最新进度的
    // conflict —— 只有显式重试成功后的 resolve 才解锁自动保存。
    const exposed: {
      state: LabState;
      dispatch: Dispatch<DecodingLessonAction> | null;
      retrySync: ((s: number) => void) | null;
    } = { state: createDecodingLessonState(1), dispatch: null, retrySync: null };

    function Probe() {
      const [state, dispatch] = useReducer(transitionDecodingLesson, undefined, () =>
        createDecodingLessonState(1),
      );
      exposed.state = state;
      exposed.dispatch = dispatch;
      const { fetchProject, projectLoaded } = useLabProject<
        DecodingDraft,
        Record<string, never>,
        DecodingLessonAction
      >({
        classId: "class-1",
        labId: "decoding",
        ready: true,
        toAction: (project) => ({
          type: "load-project",
          currentStage: project.currentStage,
          passedStages: project.passedStages,
          draftRevisions: project.draftRevisions,
          drafts: Object.fromEntries(
            Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
          ),
          payloads: {},
        }),
        dispatch,
      });
      const reconcile = (s: number) =>
        reconcileConflictedStage({
          fetchProject,
          stageIndex: s,
          onResolved: (stageIndex, project) =>
            dispatch({
              type: "resolve-save-conflict",
              stageIndex,
              draft: project.drafts?.[stageIndex] ?? emptyDraft(),
              revision: project.draftRevisions?.[stageIndex],
            }),
          onSyncError: (stageIndex) => dispatch({ type: "mark-save-sync-error", stageIndex }),
        });
      exposed.retrySync = reconcile;
      useAutosaveDraft<DecodingDraft>({
        classId: "class-1",
        labId: "decoding",
        saveStatus: projectLoaded
          ? statusForStage(state.saveStatusByStage, state.stageIndex)
          : "idle",
        stageIndex: state.stageIndex,
        draftOf: (s) => state.drafts[s],
        expectedRevisionOf: (s) => state.draftRevisions[s] ?? 0,
        onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
        onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
        onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
        onConflict: (s) => reconcile(s),
      });
      // Render the real indicator exactly like the lab pages wire it — the
      // retry button's visibility is part of what this test locks down.
      return (
        <SaveIndicator
          status={statusForStage(state.saveStatusByStage, state.stageIndex)}
          unresolvedSyncConflict={syncConflictForStage(
            state.unresolvedSyncConflicts,
            state.stageIndex,
          )}
          onRetrySync={() => reconcile(state.stageIndex)}
          onRestoreLocal={
            state.conflictedLocalDrafts[state.stageIndex] !== undefined
              ? () => dispatch({ type: "restore-conflict-draft", stageIndex: state.stageIndex })
              : undefined
          }
        />
      );
    }

    render(<Probe />);
    calls[0].done.resolve(
      json({ labId: "decoding", currentStage: 1, passedStages: [1], drafts: {} }),
    );
    await flush();

    const dispatch = (a: DecodingLessonAction) =>
      act(() => {
        exposed.dispatch?.(a);
      });

    dispatch({ type: "set-code", code: "mine-1" });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body?.stageIndex).toBe(1);

    // 另一设备先写（revision 7）：拒绝 → 调和 fetch 失败（网络断）。
    put?.done.resolve(json({ ok: true, applied: false, revision: 7 }));
    await flush();
    const refetch1 = calls.filter((c) => c.method === "GET")[1];
    expect(refetch1?.url).toBe("/api/classes/class-1/labs/decoding/project");
    refetch1?.done.resolve(new Response(null, { status: 500 }));
    await flush();

    // 同步失败态：草稿原样在、revision 没动、关卡被栅栏挡住。未决的
    // 同步冲突单独记入 unresolvedSyncConflicts —— 重试按钮据此显示。
    expect(statusForStage(exposed.state.saveStatusByStage, 1)).toBe("sync-error");
    expect(syncConflictForStage(exposed.state.unresolvedSyncConflicts, 1)).toBe(true);
    expect(exposed.state.drafts[1]?.code).toBe("mine-1");
    expect(exposed.state.draftRevisions[1]).toBeUndefined();
    expect(screen.getByRole("button", { name: "重试同步" })).toBeDefined();

    // 同步失败后继续编辑：flag 翻回 dirty，但栅栏仍挡着 —— 重试入口必须
    // 保持可见，否则学习者没有任何界面路径解除栅栏。
    dispatch({ type: "set-code", code: "mine-2" });
    expect(statusForStage(exposed.state.saveStatusByStage, 1)).toBe("dirty");
    expect(syncConflictForStage(exposed.state.unresolvedSyncConflicts, 1)).toBe(true);
    expect(screen.getByRole("button", { name: "重试同步" })).toBeDefined();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    expect(exposed.state.drafts[1]?.code).toBe("mine-2");

    // 网络恢复 → 点击界面上的「重试同步」：调和落地后 revision 前进、
    // 栅栏解除、按钮随未决标志一起消失。
    fireEvent.click(screen.getByRole("button", { name: "重试同步" }));
    await flush();
    const refetch2 = calls.filter((c) => c.method === "GET")[2];
    refetch2?.done.resolve(
      json({
        labId: "decoding",
        currentStage: 1,
        passedStages: [1],
        drafts: { "1": decodingDraft("server-1") },
        draftRevisions: { "1": 7 },
      }),
    );
    await flush();
    expect(statusForStage(exposed.state.saveStatusByStage, 1)).toBe("conflict");
    expect(syncConflictForStage(exposed.state.unresolvedSyncConflicts, 1)).toBe(false);
    expect(screen.queryByRole("button", { name: "重试同步" })).toBeNull();
    expect(exposed.state.drafts[1]?.code).toBe("server-1");
    expect(exposed.state.draftRevisions[1]).toBe(7);
    // 调和前的本地草稿被收进备份 —— 「找回我未保存的修改」出现。
    expect(exposed.state.conflictedLocalDrafts[1]?.code).toBe("mine-2");

    // 找回本地版本 → dirty → 自动保存以 revision 7 合法续写。
    fireEvent.click(screen.getByRole("button", { name: "找回我未保存的修改" }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    const put2 = calls.filter((c) => c.method === "PUT")[1];
    expect(put2?.body?.expectedRevision).toBe(7);
    put2?.done.resolve(json({ ok: true, applied: true, revision: 8 }));
    await flush();
    expect(statusForStage(exposed.state.saveStatusByStage, 1)).toBe("saved");
  });

  it("keeps the conflict backup across saves until the learner discards it", () => {
    // 备份生命周期：普通保存不再清掉可找回副本；只有找回、显式丢弃、
    // 更新冲突覆盖或项目载入才会让它消失。
    let state = createDecodingLessonState(1);
    state = transitionDecodingLesson(state, {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      drafts: { 1: decodingDraft("local") },
      draftRevisions: { 1: 1 },
      payloads: {},
    });
    state = transitionDecodingLesson(state, { type: "mark-saving", stageIndex: 1 });
    state = transitionDecodingLesson(state, {
      type: "resolve-save-conflict",
      stageIndex: 1,
      draft: decodingDraft("server"),
      revision: 2,
    });
    expect(state.conflictedLocalDrafts[1]?.code).toBe("local");

    // 冲突后学习者在服务端副本上又改了一笔并保存成功 —— 备份必须活着。
    state = transitionDecodingLesson(state, { type: "set-code", code: "edited-on-server" });
    state = transitionDecodingLesson(state, { type: "mark-saving", stageIndex: 1 });
    state = transitionDecodingLesson(state, { type: "mark-saved", stageIndex: 1, revision: 3 });
    expect(state.conflictedLocalDrafts[1]?.code).toBe("local");

    // 显式丢弃 → 备份消失、flag 落定；此后找回是 no-op。
    state = transitionDecodingLesson(state, { type: "discard-conflict-draft", stageIndex: 1 });
    expect(state.conflictedLocalDrafts[1]).toBeUndefined();
    const after = state;
    state = transitionDecodingLesson(state, { type: "restore-conflict-draft", stageIndex: 1 });
    expect(state).toBe(after);
  });
});
