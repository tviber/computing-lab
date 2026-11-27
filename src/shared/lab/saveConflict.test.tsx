import { TestLabRuntime } from "../../test/lab-runtime";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { flush, Show } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DecodingDraft } from "../../features/decoding/domain/protocol";
import {
  createDecodingLessonState,
  emptyDraft,
  transitionDecodingLesson,
  type DecodingLessonAction,
  type DecodingLessonState,
} from "../../features/decoding/lesson/state";
import { createReducer } from "./createReducer";
import { statusForStage, syncConflictForStage } from "./saveStatus";
import { SaveIndicator } from "./LabGate";
import { useAutosaveDraft } from "./useAutosaveDraft";
import { reconcileConflictedStage, useLabProject } from "./useLabProject";

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

  const settle = async () => {
    flush();
    await vi.advanceTimersByTimeAsync(0);
    flush();
  };

  it.each(["debouncing", "in flight", "save failed"])(
    "protects a retained draft while its save is %s",
    async (savePhase) => {
      function Probe() {
        const [state, dispatch] = createReducer(
          transitionDecodingLesson,
          createDecodingLessonState(1),
        );
        const project = useLabProject<DecodingDraft, Record<string, never>, DecodingLessonAction>(
          () => ({
            scopeId: "class-1",
            labId: "decoding",
            ready: true,
            stageIndex: state().stageIndex,
            toAction: (payload, meta) => ({
              type: "load-project",
              currentStage: payload.currentStage,
              passedStages: payload.passedStages,
              drafts: payload.drafts,
              draftRevisions: payload.draftRevisions,
              payloads: {},
              isReset: meta?.isReset,
            }),
            dispatch,
          }),
        );
        useAutosaveDraft<DecodingDraft>(() => ({
          scopeId: "class-1",
          labId: "decoding",
          saveStatus: project.projectLoaded
            ? statusForStage(state().saveStatusByStage, state().stageIndex)
            : "idle",
          saveStatuses: state().saveStatusByStage,
          flushPreservedDrafts: project.flushPreservedDrafts,
          stageIndex: state().stageIndex,
          deps: [state().drafts],
          expectedGeneration: project.projectGeneration,
          resetVersion: project.saveGeneration,
          draftOf: (stage) => state().drafts[stage],
          expectedRevisionOf: (stage) => state().draftRevisions[stage] ?? 0,
          onSaving: (stageIndex) => dispatch({ type: "mark-saving", stageIndex }),
          onSaved: (stageIndex, revision) => dispatch({ type: "mark-saved", stageIndex, revision }),
          onError: (stageIndex) => dispatch({ type: "mark-save-error", stageIndex }),
        }));
        return (
          <>
            <button onClick={() => dispatch({ type: "set-code", code: "retained edit" })}>
              edit
            </button>
            <button onClick={() => dispatch({ type: "select-stage", stageIndex: 2 })}>
              switch
            </button>
            <button onClick={() => void project.resetProject({ scope: "stage", stageIndex: 2 })}>
              reset
            </button>
            <output>{state().drafts[1]?.code}</output>
            <Show when={project.resetError}>
              <p role="alert">{project.resetError}</p>
            </Show>
          </>
        );
      }

      render(() => (
        <TestLabRuntime>
          <Probe />
        </TestLabRuntime>
      ));
      calls[0].done.resolve(
        json({ labId: "decoding", currentStage: 1, passedStages: [1], drafts: {} }),
      );
      await settle();
      fireEvent.click(screen.getByRole("button", { name: "edit" }));
      flush();
      fireEvent.click(screen.getByRole("button", { name: "switch" }));
      flush();
      if (savePhase === "in flight") {
        vi.advanceTimersByTime(1500);
        await settle();
        expect(calls[1].method).toBe("PUT");
      } else {
        expect(calls).toHaveLength(1);
      }
      fireEvent.click(screen.getByRole("button", { name: "reset" }));
      await settle();
      expect(calls.map(({ method }) => method)).toEqual(["GET", "PUT"]);
      expect(calls[1].body).toMatchObject({
        stageIndex: 1,
        draft: { code: "retained edit" },
        expectedGeneration: 0,
      });

      if (savePhase === "save failed") {
        calls[1].done.resolve(new Response(null, { status: 500 }));
        await settle();
        expect(calls).toHaveLength(2);
        expect(screen.getByRole("alert")).toHaveTextContent("草稿尚未保存");
      } else {
        calls[1].done.resolve(json({ applied: true, revision: 1, projectGeneration: 0 }));
        await settle();
        expect(calls[2].method).toBe("POST");
        expect(calls[2].body).toEqual({ scope: "stage", stageIndex: 2, expectedGeneration: 0 });
        calls[2].done.resolve(
          json({
            labId: "decoding",
            currentStage: 2,
            passedStages: [1],
            drafts: { 1: decodingDraft("retained edit") },
            draftRevisions: { 1: 1 },
            projectGeneration: 1,
          }),
        );
        await settle();
      }
      expect(screen.getByRole("status")).toHaveTextContent("retained edit");
    },
  );

  it("reconciles only the conflicted stage through the real reducer", async () => {
    let getState!: () => LabState;
    let dispatchRef!: (a: DecodingLessonAction) => void;

    function Probe() {
      const [state, dispatch] = createReducer(
        transitionDecodingLesson,
        createDecodingLessonState(1),
      );
      getState = state;
      dispatchRef = dispatch;
      const project = useLabProject<DecodingDraft, Record<string, never>, DecodingLessonAction>(
        () => ({
          scopeId: "class-1",
          labId: "decoding",
          ready: true,
          stageIndex: state().stageIndex,
          toAction: (payload) => ({
            type: "load-project",
            currentStage: payload.currentStage,
            passedStages: payload.passedStages,
            draftRevisions: payload.draftRevisions,
            drafts: Object.fromEntries(
              Object.entries(payload.drafts ?? {}).map(([key, value]) => [Number(key), value]),
            ),
            payloads: {},
          }),
          dispatch,
        }),
      );
      useAutosaveDraft<DecodingDraft>(() => ({
        scopeId: "class-1",
        labId: "decoding",
        saveStatus: project.projectLoaded
          ? statusForStage(state().saveStatusByStage, state().stageIndex)
          : "idle",
        stageIndex: state().stageIndex,
        draftOf: (s) => state().drafts[s],
        expectedRevisionOf: (s) => state().draftRevisions[s] ?? 0,
        onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
        onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
        onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
        onConflict: (s) => {
          void project.fetchProject().then((loaded) => {
            if (!loaded) {
              dispatch({ type: "mark-save-sync-error", stageIndex: s });
              return;
            }
            dispatch({
              type: "resolve-save-conflict",
              stageIndex: s,
              draft: loaded.drafts?.[s] ?? emptyDraft(),
              revision: loaded.draftRevisions?.[s],
            });
          });
        },
      }));
      return null;
    }

    render(() => (
      <TestLabRuntime>
        <Probe />
      </TestLabRuntime>
    ));
    calls[0].done.resolve(
      json({ labId: "decoding", currentStage: 1, passedStages: [1], drafts: {} }),
    );
    await settle();

    const dispatch = (a: DecodingLessonAction) => {
      dispatchRef(a);
      flush();
    };

    dispatch({ type: "set-code", code: "mine-1" });
    vi.advanceTimersByTime(1500);
    await settle();
    const put1 = calls.find((c) => c.method === "PUT");
    expect(put1?.body?.stageIndex).toBe(1);
    expect(put1?.body?.expectedRevision).toBe(0);

    dispatch({ type: "select-stage", stageIndex: 2 });
    dispatch({ type: "set-code", code: "local-2" });
    vi.advanceTimersByTime(1500);
    await settle();
    const put2 = calls.filter((c) => c.method === "PUT")[1];
    expect(put2?.body?.stageIndex).toBe(2);

    put2?.done.resolve(json({ ok: true, applied: false, revision: 7 }));
    await settle();
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
    await settle();

    expect(getState().drafts[2]?.code).toBe("server-2");
    expect(statusForStage(getState().saveStatusByStage, 2)).toBe("conflict");
    expect(getState().draftRevisions[2]).toBe(7);
    expect(getState().drafts[1]?.code).toBe("mine-1");
    expect(statusForStage(getState().saveStatusByStage, 1)).toBe("saving");
    expect(getState().stageIndex).toBe(2);

    put1?.done.resolve(json({ ok: true, applied: true, revision: 3 }));
    await settle();
    expect(statusForStage(getState().saveStatusByStage, 1)).toBe("saved");
    expect(getState().draftRevisions[1]).toBe(3);
    expect(statusForStage(getState().saveStatusByStage, 2)).toBe("conflict");
    expect(getState().drafts[2]?.code).toBe("server-2");

    expect(getState().conflictedLocalDrafts[2]?.code).toBe("local-2");

    dispatch({ type: "restore-conflict-draft", stageIndex: 2 });
    expect(getState().drafts[2]?.code).toBe("local-2");
    expect(getState().conflictedLocalDrafts[2]).toBeUndefined();
    expect(statusForStage(getState().saveStatusByStage, 2)).toBe("dirty");

    vi.advanceTimersByTime(1500);
    await settle();
    const put3 = calls.filter((c) => c.method === "PUT")[2];
    expect(put3?.body?.stageIndex).toBe(2);
    expect(put3?.body?.expectedRevision).toBe(7);
    expect((put3?.body?.draft as DecodingDraft | undefined)?.code).toBe("local-2");

    put3?.done.resolve(json({ ok: true, applied: true, revision: 8 }));
    await settle();
    expect(statusForStage(getState().saveStatusByStage, 2)).toBe("saved");
    expect(getState().draftRevisions[2]).toBe(8);
    expect(getState().drafts[2]?.code).toBe("local-2");
  });

  it("flags sync-error when the reconcile fetch fails; only an explicit retry lifts the fence", async () => {
    let getState!: () => LabState;
    let dispatchRef!: (a: DecodingLessonAction) => void;

    function Probe() {
      const [state, dispatch] = createReducer(
        transitionDecodingLesson,
        createDecodingLessonState(1),
      );
      getState = state;
      dispatchRef = dispatch;
      const project = useLabProject<DecodingDraft, Record<string, never>, DecodingLessonAction>(
        () => ({
          scopeId: "class-1",
          labId: "decoding",
          ready: true,
          stageIndex: state().stageIndex,
          toAction: (payload) => ({
            type: "load-project",
            currentStage: payload.currentStage,
            passedStages: payload.passedStages,
            draftRevisions: payload.draftRevisions,
            drafts: Object.fromEntries(
              Object.entries(payload.drafts ?? {}).map(([key, value]) => [Number(key), value]),
            ),
            payloads: {},
          }),
          dispatch,
        }),
      );
      const reconcile = (s: number) =>
        reconcileConflictedStage({
          fetchProject: project.fetchProject,
          stageIndex: s,
          onResolved: (stageIndex, loaded) =>
            dispatch({
              type: "resolve-save-conflict",
              stageIndex,
              draft: loaded.drafts?.[stageIndex] ?? emptyDraft(),
              revision: loaded.draftRevisions?.[stageIndex],
            }),
          onSyncError: (stageIndex) => dispatch({ type: "mark-save-sync-error", stageIndex }),
        });
      useAutosaveDraft<DecodingDraft>(() => ({
        scopeId: "class-1",
        labId: "decoding",
        saveStatus: project.projectLoaded
          ? statusForStage(state().saveStatusByStage, state().stageIndex)
          : "idle",
        stageIndex: state().stageIndex,
        draftOf: (s) => state().drafts[s],
        expectedRevisionOf: (s) => state().draftRevisions[s] ?? 0,
        onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
        onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
        onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
        onConflict: (s) => reconcile(s),
      }));
      return (
        <SaveIndicator
          onRestoreLocal={
            state().conflictedLocalDrafts[state().stageIndex] !== undefined
              ? () => dispatch({ type: "restore-conflict-draft", stageIndex: state().stageIndex })
              : undefined
          }
          onRetrySync={() => reconcile(state().stageIndex)}
          status={statusForStage(state().saveStatusByStage, state().stageIndex)}
          unresolvedSyncConflict={syncConflictForStage(
            state().unresolvedSyncConflicts,
            state().stageIndex,
          )}
        />
      );
    }

    render(() => (
      <TestLabRuntime>
        <Probe />
      </TestLabRuntime>
    ));
    calls[0].done.resolve(
      json({ labId: "decoding", currentStage: 1, passedStages: [1], drafts: {} }),
    );
    await settle();

    const dispatch = (a: DecodingLessonAction) => {
      dispatchRef(a);
      flush();
    };

    dispatch({ type: "set-code", code: "mine-1" });
    vi.advanceTimersByTime(1500);
    await settle();
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body?.stageIndex).toBe(1);

    put?.done.resolve(json({ ok: true, applied: false, revision: 7 }));
    await settle();
    const refetch1 = calls.filter((c) => c.method === "GET")[1];
    expect(refetch1?.url).toBe("/api/classes/class-1/labs/decoding/project");
    refetch1?.done.resolve(new Response(null, { status: 500 }));
    await settle();

    expect(statusForStage(getState().saveStatusByStage, 1)).toBe("sync-error");
    expect(syncConflictForStage(getState().unresolvedSyncConflicts, 1)).toBe(true);
    expect(getState().drafts[1]?.code).toBe("mine-1");
    expect(getState().draftRevisions[1]).toBeUndefined();
    expect(screen.getByRole("button", { name: "重试同步" })).toBeDefined();

    dispatch({ type: "set-code", code: "mine-2" });
    expect(statusForStage(getState().saveStatusByStage, 1)).toBe("dirty");
    expect(syncConflictForStage(getState().unresolvedSyncConflicts, 1)).toBe(true);
    expect(screen.getByRole("button", { name: "重试同步" })).toBeDefined();
    vi.advanceTimersByTime(5000);
    await settle();
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    expect(getState().drafts[1]?.code).toBe("mine-2");

    fireEvent.click(screen.getByRole("button", { name: "重试同步" }));
    await settle();
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
    await settle();
    expect(statusForStage(getState().saveStatusByStage, 1)).toBe("conflict");
    expect(syncConflictForStage(getState().unresolvedSyncConflicts, 1)).toBe(false);
    expect(screen.queryByRole("button", { name: "重试同步" })).toBeNull();
    expect(getState().drafts[1]?.code).toBe("server-1");
    expect(getState().draftRevisions[1]).toBe(7);
    expect(getState().conflictedLocalDrafts[1]?.code).toBe("mine-2");

    fireEvent.click(screen.getByRole("button", { name: "找回我未保存的修改" }));
    flush();
    vi.advanceTimersByTime(1500);
    await settle();
    const put2 = calls.filter((c) => c.method === "PUT")[1];
    expect(put2?.body?.expectedRevision).toBe(7);
    put2?.done.resolve(json({ ok: true, applied: true, revision: 8 }));
    await settle();
    expect(statusForStage(getState().saveStatusByStage, 1)).toBe("saved");
  });

  it("keeps the conflict backup across saves until the learner discards it", () => {
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

    state = transitionDecodingLesson(state, { type: "set-code", code: "edited-on-server" });
    state = transitionDecodingLesson(state, { type: "mark-saving", stageIndex: 1 });
    state = transitionDecodingLesson(state, { type: "mark-saved", stageIndex: 1, revision: 3 });
    expect(state.conflictedLocalDrafts[1]?.code).toBe("local");

    state = transitionDecodingLesson(state, { type: "discard-conflict-draft", stageIndex: 1 });
    expect(state.conflictedLocalDrafts[1]).toBeUndefined();
    const after = state;
    state = transitionDecodingLesson(state, { type: "restore-conflict-draft", stageIndex: 1 });
    expect(state).toBe(after);
  });
});
