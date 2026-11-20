import { act, render } from "@testing-library/react";
import { useReducer, type Dispatch } from "react";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../../../../server/auth/password.ts";
import { createSession } from "../../../../server/auth/session.ts";
import { newId, openMemoryDb } from "../../../../server/db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../../../../server/http/context.ts";
import { calculatorRoutes } from "../../../../server/routes/calculator.ts";
import { api } from "../../../shared/api/client.ts";
import { statusForStage } from "../../../shared/lab/saveStatus.ts";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft.ts";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject.ts";
import { halfAdderGraph } from "../domain/fixtures.ts";
import type { CircuitGraph, ComponentDef } from "../domain/graph.ts";
import type { CalculatorJudgeResult } from "../domain/protocol.ts";
import {
  createCalculatorLessonState,
  graphOf,
  transitionCalculatorLesson,
  type CalculatorLessonAction,
  type CalculatorLessonState,
} from "./state.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

type Call = {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  serverWork: Promise<Response>;
  done: ReturnType<typeof deferred<Response>>;
};

const AUTOSAVE_DELAY_MS = 1500;

describe("calculator component-library autosave lifecycle", () => {
  let calls: Call[];
  let app: Hono<{ Variables: AppVariables }>;
  let classId: string;
  let cookie: string;
  let exposed: {
    state: CalculatorLessonState;
    dispatch: Dispatch<CalculatorLessonAction> | null;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    calls = [];
    const db = openMemoryDb();
    classId = newId();
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
      classId,
      "实验班",
      "invite-1",
    );
    const studentId = newId();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    ).run(studentId, "stu-1", "stu-1", await hashPassword("pass"), "user");
    db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
      newId(),
      classId,
      studentId,
      "student",
    );
    app = new Hono<{ Variables: AppVariables }>();
    app.use("/api/*", attachDb(db), attachSession());
    app.route("/api/classes/:classId/labs/calculator", calculatorRoutes());
    cookie = `lab_session=${createSession(db, studentId).id}`;
    exposed = { state: createCalculatorLessonState(1), dispatch: null };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown, init?: RequestInit) => {
        const done = deferred<Response>();
        const request = new Request(new URL(String(input), "http://lab.test"), {
          method: init?.method ?? "GET",
          headers: { "content-type": "application/json", cookie },
          body: init?.body ? String(init.body) : undefined,
        });
        const serverWork = Promise.resolve(app.fetch(request));
        calls.push({
          url: String(input),
          method: init?.method ?? "GET",
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
          serverWork,
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

  const deliver = async (call: Call) => {
    call.done.resolve(await call.serverWork);
    await flush();
  };

  const advance = async () => {
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
  };

  const dispatch = (action: CalculatorLessonAction) =>
    act(() => {
      exposed.dispatch?.(action);
    });

  const componentNames = () => exposed.state.unlockedSubmodules.map((component) => component.name);

  function Probe() {
    const [state, dispatch] = useReducer(transitionCalculatorLesson, undefined, () =>
      createCalculatorLessonState(1),
    );
    exposed.state = state;
    exposed.dispatch = dispatch;
    const graph = graphOf(state);
    const { projectLoaded, fetchProject, projectGeneration } = useLabProject<
      CircuitGraph,
      { unlockedSubmodules: ComponentDef[] },
      CalculatorLessonAction
    >({
      classId,
      labId: "calculator",
      ready: true,
      stageIndex: state.stageIndex,
      toAction: (project) => ({
        type: "load-project",
        currentStage: project.currentStage,
        passedStages: project.passedStages,
        unlockedSubmodules: project.unlockedSubmodules,
        draftRevisions: project.draftRevisions,
        componentsRevision: project.draftRevisions?.components ?? 0,
        drafts: Object.fromEntries(
          Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
        ),
      }),
      dispatch,
    });
    const dirtyStages = Object.keys(state.saveStatusByStage)
      .map(Number)
      .filter(
        (s) => s !== state.stageIndex && statusForStage(state.saveStatusByStage, s) === "dirty",
      );
    useAutosaveDraft<CircuitGraph>({
      classId,
      labId: "calculator",
      expectedGeneration: projectGeneration,
      saveStatus: projectLoaded
        ? statusForStage(state.saveStatusByStage, state.stageIndex)
        : "idle",
      stageIndex: state.stageIndex,
      dirtyStages,
      draftOf: (s) => graphOf(state, s),
      bodyFor: (index, draft) => ({
        stageIndex: index,
        graph: draft,
        ...(state.componentsChanged ? { components: state.unlockedSubmodules } : {}),
      }),
      holdSend: (_stage, draft) => {
        const known = new Set(state.unlockedSubmodules.map((component) => component.name));
        return draft.nodes.some(
          (node) => node.kind === "component" && node.name !== undefined && !known.has(node.name),
        );
      },
      deps: [graph, state.unlockedSubmodules, state.saveStatusByStage],
      expectedRevisionOf: (s) => state.draftRevisions[s] ?? 0,
      expectedComponentsRevisionOf: () => state.componentsRevision,
      componentsSeqOf: () => state.componentsEditSeq,
      onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
      onSaved: (s, revision, componentsRevision, componentsSeq) =>
        dispatch({
          type: "mark-saved",
          stageIndex: s,
          revision,
          componentsRevision,
          componentsSeq,
        }),
      onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
      onConflict: (s) =>
        reconcileConflictedStage<CircuitGraph, { unlockedSubmodules: ComponentDef[] }>({
          fetchProject,
          stageIndex: s,
          onResolved: (stageIndex, project) =>
            dispatch({
              type: "resolve-save-conflict",
              stageIndex,
              draft: project.drafts?.[stageIndex],
              revision: project.draftRevisions?.[stageIndex],
              unlockedSubmodules: project.unlockedSubmodules,
              componentsRevision: project.draftRevisions?.components,
            }),
          onSyncError: (stageIndex) => dispatch({ type: "mark-save-sync-error", stageIndex }),
        }),
    });
    return null;
  }

  const createComponent = (name: string, outputPin: string) => {
    dispatch({ type: "add-node", kind: "not", x: 220, y: 120 });
    const gate = exposed.state.selectedNodeId!;
    dispatch({ type: "start-wire", from: { node: "in-A", port: "out" } });
    dispatch({ type: "complete-wire", to: { node: gate, port: "in" } });
    dispatch({ type: "start-wire", from: { node: gate, port: "out" } });
    dispatch({ type: "complete-wire", to: { node: `out-${outputPin}`, port: "in" } });
    dispatch({
      type: "componentize-selection",
      selectedIds: [gate],
      name,
      inputNames: ["I"],
      outputNames: ["O"],
    });
  };

  const selectStage = (stageIndex: number) =>
    dispatch({ type: "select-stage", stageIndex, force: true });

  const submitJudge = async (stageIndex: number, graph: CircuitGraph) => {
    const result = await api.post<CalculatorJudgeResult>(
      `/api/classes/${classId}/labs/calculator/judge`,
      { stageIndex, expectedGeneration: 0, graph, components: exposed.state.unlockedSubmodules },
    );
    act(() => {
      exposed.dispatch?.({
        type: "judge-result",
        stageIndex,
        outcome: {
          score: result.score,
          total: result.total,
          passed: result.passed,
          categories: result.testSummary.categories,
          counterexample: result.testSummary.counterexample,
          passedStages: result.passedStages,
          error: result.testSummary.error,
          unlockedComponent: result.unlockedComponent,
          unlockedSubmodules: result.unlockedSubmodules,
          componentsRevision: result.componentsRevision,
        },
      });
    });
  };

  const foreignPut = (body: Record<string, unknown>) =>
    app.fetch(
      new Request(`http://lab.test/api/classes/${classId}/labs/calculator/draft`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ expectedGeneration: 0, ...body }),
      }),
    );

  const projectPayload = async () => {
    const response = await app.fetch(
      new Request(`http://lab.test/api/classes/${classId}/labs/calculator/project`, {
        headers: { cookie },
      }),
    );
    return (await response.json()) as {
      drafts: Record<string, CircuitGraph>;
      draftRevisions: Record<string, number>;
      unlockedSubmodules: ComponentDef[];
    };
  };

  const puts = () => calls.filter((call) => call.method === "PUT");

  const loadProject = async () => {
    render(<Probe />);
    await deliver(calls[0]);
    expect(componentNames()).toEqual([]);
  };

  it("T1: a stage-1 ack confirms only the library edits it carried, so stage-2's save still carries B", async () => {
    await loadProject();

    createComponent("NotA", "Y");
    expect(exposed.state.componentsEditSeq).toBe(1);
    await advance();
    const put1 = puts()[0];
    expect(put1.body?.stageIndex).toBe(1);
    expect(put1.body?.expectedComponentsRevision).toBe(0);
    expect((put1.body?.components as ComponentDef[]).map((c) => c.name)).toEqual(["NotA"]);
    expect((await put1.serverWork).status).toBe(200);

    selectStage(2);
    createComponent("NotB", "Sum");
    expect(exposed.state.componentsEditSeq).toBe(2);

    await deliver(put1);
    expect(exposed.state.componentsChanged).toBe(true);

    await advance();
    const put2 = puts()[1];
    expect(put2.body?.stageIndex).toBe(2);
    expect(put2.body?.expectedComponentsRevision).toBe(1);
    expect((put2.body?.components as ComponentDef[]).map((c) => c.name)).toEqual(["NotA", "NotB"]);
    await deliver(put2);
    expect(exposed.state.componentsChanged).toBe(false);

    const project = await projectPayload();
    expect(project.unlockedSubmodules.map((c) => c.name)).toEqual(["NotA", "NotB"]);
    expect(project.drafts["2"].nodes.some((n) => n.kind === "component" && n.name === "NotB")).toBe(
      true,
    );
  });

  it("T2: a component-fenced send parks the stage's save task and re-sends after the library resyncs", async () => {
    await loadProject();

    const foreign = await foreignPut({
      stageIndex: 3,
      graph: { nodes: [], edges: [] },
      components: [{ name: "ForeignPart", graph: { nodes: [], edges: [] }, custom: true }],
      expectedRevision: 0,
      expectedComponentsRevision: 0,
    });
    expect((await foreign.json()).applied).toBe(true);

    createComponent("NotA", "Y");
    await advance();
    const put1 = puts()[0];
    expect((await put1.serverWork).status).toBe(200);

    selectStage(2);
    dispatch({ type: "add-node", kind: "not", x: 200, y: 80 });
    selectStage(3);

    await deliver(put1);
    const refetch = calls.find((call, index) => index > 0 && call.method === "GET");
    expect(refetch?.url).toBe(`/api/classes/${classId}/labs/calculator/project`);

    await advance();
    expect(puts()).toHaveLength(1);

    await deliver(refetch!);
    expect(exposed.state.componentsRevision).toBe(1);
    expect(exposed.state.conflictedComponents?.map((c) => c.name)).toEqual(["NotA"]);

    const put2 = puts()[1];
    expect(put2).toBeDefined();
    expect(put2.body?.stageIndex).toBe(2);
    expect(put2.body?.components).toBeUndefined();
    expect(put2.body?.expectedComponentsRevision).toBeUndefined();
    await deliver(put2);
    expect(statusForStage(exposed.state.saveStatusByStage, 2)).toBe("saved");

    const project = await projectPayload();
    const stage2 = project.drafts["2"];
    expect(stage2.nodes.some((node) => node.kind === "not")).toBe(true);
    expect(project.unlockedSubmodules.map((c) => c.name)).toEqual(["ForeignPart"]);
  });

  it("T3: a stale autosave response cannot regress the library revision a judge already adopted", async () => {
    await loadProject();

    selectStage(2);
    createComponent("NotA", "Sum");
    await advance();
    const put1 = puts()[0];
    expect((await put1.serverWork).status).toBe(200);

    const judgePromise = submitJudge(2, halfAdderGraph());
    const judgeCall = calls.find((call) => call.method === "POST");
    expect(judgeCall).toBeDefined();
    await deliver(judgeCall!);
    await judgePromise;
    expect(exposed.state.componentsRevision).toBe(2);
    expect(componentNames()).toEqual(["NotA", "HalfAdder"]);

    await deliver(put1);
    expect(exposed.state.componentsRevision).toBe(2);

    createComponent("NotB", "Carry");
    await advance();
    const put2 = puts()[1];
    expect(put2.body?.expectedComponentsRevision).toBe(2);
    await deliver(put2);
    expect(exposed.state.componentsRevision).toBe(3);

    const project = await projectPayload();
    expect(project.unlockedSubmodules.map((c) => c.name)).toEqual(["NotA", "HalfAdder", "NotB"]);
    expect(project.draftRevisions["components"]).toBe(3);
  });

  it("T4: renaming a shared component persists every stage whose references were rewritten", async () => {
    await loadProject();

    selectStage(2);
    createComponent("NotX", "Sum");
    await advance();
    const put1 = puts()[0];
    expect(put1.body?.stageIndex).toBe(2);
    await deliver(put1);

    selectStage(3);
    dispatch({ type: "add-node", kind: "component", name: "NotX", x: 300, y: 80 });
    await advance();
    const put2 = puts()[1];
    expect(put2.body?.stageIndex).toBe(3);
    await deliver(put2);

    selectStage(2);
    dispatch({
      type: "edit-custom-component",
      name: "NotX",
      newName: "NotY",
      inputNames: ["I"],
      outputNames: ["O"],
    });
    await advance();

    const stage2Put = puts()[2];
    expect(stage2Put.body?.stageIndex).toBe(2);
    expect((stage2Put.body?.components as ComponentDef[]).map((c) => c.name)).toEqual(["NotY"]);
    await deliver(stage2Put);
    const stage3Put = puts()[3];
    expect(stage3Put.body?.stageIndex).toBe(3);
    expect(
      (stage3Put.body?.graph as CircuitGraph).nodes.some(
        (node) => node.kind === "component" && node.name === "NotY",
      ),
    ).toBe(true);
    await deliver(stage3Put);

    const project = await projectPayload();
    expect(project.unlockedSubmodules.map((c) => c.name)).toEqual(["NotY"]);
    const stage3 = project.drafts["3"];
    expect(stage3.nodes.some((n) => n.kind === "component" && n.name === "NotY")).toBe(true);
    expect(stage3.nodes.some((n) => n.kind === "component" && n.name === "NotX")).toBe(false);
  });

  it("T5: a late judge verdict keeps the stage it was submitted on", async () => {
    await loadProject();

    selectStage(2);
    const pending = submitJudge(2, halfAdderGraph());
    const judgeCall = calls.find((call) => call.method === "POST");
    expect(judgeCall).toBeDefined();
    selectStage(3);
    await deliver(judgeCall!);
    await pending;

    expect(exposed.state.passedStages).toEqual([2]);
    expect(componentNames()).toEqual(["HalfAdder"]);
    expect(exposed.state.judgeOutcome).toBeNull();
    expect(exposed.state.message).toBeNull();
  });

  it("T6: a draft referencing a component stranded in the conflict backup does not save clean", async () => {
    await loadProject();

    const foreign = await foreignPut({
      stageIndex: 3,
      graph: { nodes: [], edges: [] },
      components: [{ name: "ForeignPart", graph: { nodes: [], edges: [] }, custom: true }],
      expectedRevision: 0,
      expectedComponentsRevision: 0,
    });
    expect((await foreign.json()).applied).toBe(true);

    createComponent("NotA", "Y");
    await advance();
    const put1 = puts()[0];
    expect((await put1.serverWork).status).toBe(200);

    selectStage(2);
    dispatch({ type: "add-node", kind: "component", name: "NotA", x: 300, y: 80 });

    await deliver(put1);
    const refetch = calls.find((call, index) => index > 0 && call.method === "GET");
    expect(refetch?.url).toBe(`/api/classes/${classId}/labs/calculator/project`);

    await advance();
    expect(puts()).toHaveLength(1);

    await deliver(refetch!);
    expect(exposed.state.conflictedComponents?.map((c) => c.name)).toEqual(["NotA"]);

    await flush();
    expect(puts()).toHaveLength(1);
    expect(statusForStage(exposed.state.saveStatusByStage, 2)).toBe("dirty");
    const stale = await projectPayload();
    expect(stale.drafts["2"]).toBeUndefined();
    expect(stale.unlockedSubmodules.map((c) => c.name)).toEqual(["ForeignPart"]);

    dispatch({ type: "restore-conflict-draft", stageIndex: 2 });
    await flush();
    const put2 = puts()[1];
    expect(put2).toBeDefined();
    expect(put2.body?.stageIndex).toBe(2);
    expect((put2.body?.components as ComponentDef[]).map((c) => c.name)).toEqual(["NotA"]);
    await deliver(put2);
    expect(statusForStage(exposed.state.saveStatusByStage, 2)).toBe("saved");

    const project = await projectPayload();
    expect(project.unlockedSubmodules.map((c) => c.name)).toEqual(["NotA"]);
    expect(project.drafts["2"].nodes.some((n) => n.kind === "component" && n.name === "NotA")).toBe(
      true,
    );
  });
});
