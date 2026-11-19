import { describe, expect, it } from "vitest";
import {
  createCalculatorLessonState,
  graphOf,
  isStageUnlocked,
  scaffoldGraph,
  transitionCalculatorLesson,
  type CalculatorLessonAction,
  type CalculatorLessonState,
} from "./state";
import { halfAdderGraph } from "../domain/fixtures";
import type { CircuitGraph } from "../domain/graph";
import { CALCULATOR_STAGES } from "../domain/stages";
import { statusForStage } from "../../../shared/lab/saveStatus.ts";

function apply(
  state: CalculatorLessonState,
  ...actions: CalculatorLessonAction[]
): CalculatorLessonState {
  return actions.reduce(transitionCalculatorLesson, state);
}

describe("calculator lesson state", () => {
  it("scaffolds every stage with its declared contract pins", () => {
    for (const stage of CALCULATOR_STAGES) {
      const graph = scaffoldGraph(stage.index);
      expect(graph.nodes.filter((n) => n.kind === "input").map((n) => n.name)).toEqual(
        stage.inputs,
      );
      expect(graph.nodes.filter((n) => n.kind === "output").map((n) => n.name)).toEqual(
        stage.outputs,
      );
      expect(graph.edges).toEqual([]);
    }
  });

  it("keeps the mainline open and gates side challenges on local passes", () => {
    const state = createCalculatorLessonState();
    for (const index of [1, 2, 3, 4, 5, 6]) expect(isStageUnlocked(state, index)).toBe(true);
    expect(isStageUnlocked(state, 7)).toBe(false);
    expect(isStageUnlocked(state, 8)).toBe(false);
    for (const index of [9, 10, 11]) expect(isStageUnlocked(state, index)).toBe(false);
    // Selecting a core stage works even with no passes yet.
    expect(apply(state, { type: "select-stage", stageIndex: 4 }).stageIndex).toBe(4);
    // Selecting a locked optional stage is a no-op.
    expect(apply(state, { type: "select-stage", stageIndex: 7 }).stageIndex).toBe(1);
  });

  it("unlocks side challenges after their anchor and late challenges after core", () => {
    const afterWire = apply(createCalculatorLessonState(2), {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      unlockedSubmodules: [],
      drafts: {},
    });
    expect(isStageUnlocked(afterWire, 9)).toBe(true);
    expect(isStageUnlocked(afterWire, 10)).toBe(false);
    expect(isStageUnlocked(afterWire, 11)).toBe(false);
    expect(isStageUnlocked(afterWire, 7)).toBe(false);

    const loaded = apply(createCalculatorLessonState(2), {
      type: "load-project",
      currentStage: 7,
      passedStages: [1, 2, 3, 4, 5, 6],
      unlockedSubmodules: [],
      drafts: {},
    });
    expect(isStageUnlocked(loaded, 7)).toBe(true);
    expect(isStageUnlocked(loaded, 8)).toBe(true);
    for (const index of [9, 10, 11]) expect(isStageUnlocked(loaded, index)).toBe(true);
    expect(apply(loaded, { type: "select-stage", stageIndex: 7 }).stageIndex).toBe(7);

    const partial = apply(createCalculatorLessonState(), {
      type: "load-project",
      currentStage: 6,
      passedStages: [1, 2, 3, 5],
      unlockedSubmodules: [],
      drafts: {},
    });
    expect(isStageUnlocked(partial, 7)).toBe(false);
  });

  it("does not advance the mainline when an optional challenge passes", () => {
    const loaded = apply(createCalculatorLessonState(2), {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      unlockedSubmodules: [],
      drafts: {},
    });
    const judged = apply(loaded, {
      type: "select-stage",
      stageIndex: 9,
    });
    const completed = apply(judged, {
      type: "judge-result",
      stageIndex: 9,
      outcome: {
        score: 4,
        total: 4,
        passed: true,
        categories: { "truth-table": { passed: 4, total: 4 } },
        counterexample: null,
        passedStages: [1, 9],
        error: null,
        unlockedComponent: null,
        componentsRevision: null,
        unlockedSubmodules: null,
      },
    });
    expect(completed.passedStages).toEqual([1, 9]);
    expect(completed.currentStage).toBe(2);
  });

  it("wires a gate and marks the draft dirty", () => {
    const start = createCalculatorLessonState();
    const withGate = apply(start, { type: "add-node", kind: "xor", x: 300, y: 60 });
    const gateId = withGate.selectedNodeId!;
    expect(gateId).toBeTruthy();

    const wired = apply(
      withGate,
      { type: "start-wire", from: { node: "in-A", port: "out" } },
      { type: "complete-wire", to: { node: gateId, port: "in0" } },
    );
    expect(wired.pendingWire).toBeNull();
    expect(graphOf(wired).edges).toHaveLength(1);
    expect(statusForStage(wired.saveStatusByStage, wired.stageIndex)).toBe("dirty");
  });

  it("toggles component collapse as one undoable graph edit", () => {
    const withComponent = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "component",
      name: "HalfAdder",
      x: 300,
      y: 60,
    });
    const componentId = withComponent.selectedNodeId!;

    const collapsed = apply(withComponent, {
      type: "toggle-collapse-node",
      id: componentId,
    });
    expect(graphOf(collapsed).nodes.find((node) => node.id === componentId)?.collapsed).toBe(true);
    expect(collapsed.past).toHaveLength(2);

    const expanded = apply(collapsed, {
      type: "toggle-collapse-node",
      id: componentId,
    });
    expect(graphOf(expanded).nodes.find((node) => node.id === componentId)?.collapsed).toBe(false);
    expect(apply(expanded, { type: "undo" }).drafts[1].nodes).toEqual(graphOf(collapsed).nodes);
  });

  it("replaces a selected subgraph with a reusable custom component", () => {
    const withGate = apply(createCalculatorLessonState(2), {
      type: "add-node",
      kind: "xor",
      x: 300,
      y: 60,
    });
    const gateId = withGate.selectedNodeId!;
    const wired = apply(
      withGate,
      { type: "start-wire", from: { node: "in-A", port: "out" } },
      { type: "complete-wire", to: { node: gateId, port: "in0" } },
      { type: "start-wire", from: { node: "in-B", port: "out" } },
      { type: "complete-wire", to: { node: gateId, port: "in1" } },
      { type: "start-wire", from: { node: gateId, port: "out" } },
      { type: "complete-wire", to: { node: "out-Sum", port: "in" } },
    );

    const componentized = apply(wired, {
      type: "componentize-selection",
      selectedIds: [gateId],
      name: "XorBlock",
      inputNames: ["A", "B"],
      outputNames: ["Sum"],
    });
    expect(componentized.unlockedSubmodules).toHaveLength(1);
    expect(componentized.unlockedSubmodules[0].custom).toBe(true);
    expect(
      componentized.unlockedSubmodules[0].graph.nodes
        .filter((node) => node.kind === "input" || node.kind === "output")
        .map((node) => node.name),
    ).toEqual(["A", "B", "Sum"]);
    expect(graphOf(componentized).nodes.some((node) => node.id === gateId)).toBe(false);
    expect(
      graphOf(componentized).nodes.some(
        (node) => node.kind === "component" && node.name === "XorBlock",
      ),
    ).toBe(true);

    const definition = componentized.unlockedSubmodules[0];
    const inputNodes = definition.graph.nodes.filter((node) => node.kind === "input");
    const outputNodes = definition.graph.nodes.filter((node) => node.kind === "output");
    const edited = apply(componentized, {
      type: "edit-custom-component",
      name: "XorBlock",
      inputNames: ["B", "A"],
      outputNames: ["Sum"],
      inputPortKeys: [inputNodes[1].id, inputNodes[0].id],
      outputPortKeys: [outputNodes[0].id],
    });
    expect(
      edited.unlockedSubmodules[0].graph.nodes
        .filter((node) => node.kind === "input" || node.kind === "output")
        .map((node) => node.name),
    ).toEqual(["B", "A", "Sum"]);
    expect(edited.message).toContain("已更新");

    const editUndone = apply(edited, { type: "undo" });
    expect(
      editUndone.unlockedSubmodules[0].graph.nodes
        .filter((node) => node.kind === "input" || node.kind === "output")
        .map((node) => node.name),
    ).toEqual(["A", "B", "Sum"]);
  });

  it("renames a custom component and rewrites every instance reference", () => {
    const withGate = apply(createCalculatorLessonState(2), {
      type: "add-node",
      kind: "xor",
      x: 300,
      y: 60,
    });
    const gateId = withGate.selectedNodeId!;
    const wired = apply(
      withGate,
      { type: "start-wire", from: { node: "in-A", port: "out" } },
      { type: "complete-wire", to: { node: gateId, port: "in0" } },
      { type: "start-wire", from: { node: "in-B", port: "out" } },
      { type: "complete-wire", to: { node: gateId, port: "in1" } },
      { type: "start-wire", from: { node: gateId, port: "out" } },
      { type: "complete-wire", to: { node: "out-Sum", port: "in" } },
    );
    const componentized = apply(wired, {
      type: "componentize-selection",
      selectedIds: [gateId],
      name: "XorBlock",
      inputNames: ["A", "B"],
      outputNames: ["Sum"],
    });

    const renamed = apply(componentized, {
      type: "edit-custom-component",
      name: "XorBlock",
      newName: "PairXor",
      inputNames: ["A", "B"],
      outputNames: ["Sum"],
    });
    expect(renamed.unlockedSubmodules.map((component) => component.name)).toEqual(["PairXor"]);
    expect(
      graphOf(renamed).nodes.some((node) => node.kind === "component" && node.name === "PairXor"),
    ).toBe(true);

    // Renaming to a name taken by another component is refused.
    const withTwo = apply(renamed, {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      unlockedSubmodules: [
        ...renamed.unlockedSubmodules,
        { name: "Used", custom: true, graph: { nodes: [], edges: [] } },
      ],
      drafts: renamed.drafts,
    });
    const conflicted = apply(withTwo, {
      type: "edit-custom-component",
      name: "PairXor",
      newName: "Used",
      inputNames: ["A", "B"],
      outputNames: ["Sum"],
    });
    expect(conflicted.unlockedSubmodules.map((component) => component.name)).toEqual([
      "PairXor",
      "Used",
    ]);
    expect(conflicted.message).toContain("已存在");
  });

  it("splits custom components back and protects components that are still in use", () => {
    const withGate = apply(createCalculatorLessonState(2), {
      type: "add-node",
      kind: "xor",
      x: 300,
      y: 60,
    });
    const gateId = withGate.selectedNodeId!;
    const wired = apply(
      withGate,
      { type: "start-wire", from: { node: "in-A", port: "out" } },
      { type: "complete-wire", to: { node: gateId, port: "in0" } },
      { type: "start-wire", from: { node: "in-B", port: "out" } },
      { type: "complete-wire", to: { node: gateId, port: "in1" } },
      { type: "start-wire", from: { node: gateId, port: "out" } },
      { type: "complete-wire", to: { node: "out-Sum", port: "in" } },
    );
    const componentized = apply(wired, {
      type: "componentize-selection",
      selectedIds: [gateId],
      name: "XorBlock",
      inputNames: ["A", "B"],
      outputNames: ["Sum"],
    });

    const blocked = apply(componentized, {
      type: "delete-custom-component",
      name: "XorBlock",
    });
    expect(blocked.unlockedSubmodules).toHaveLength(1);
    expect(blocked.message).toContain("先拆分或删除");

    const componentId = graphOf(blocked).nodes.find((node) => node.kind === "component")?.id;
    expect(componentId).toBeTruthy();
    const expanded = apply(blocked, { type: "expand-component", id: componentId! });
    expect(graphOf(expanded).nodes.some((node) => node.kind === "component")).toBe(false);
    expect(expanded.message).toContain("已拆分");

    const deleted = apply(expanded, {
      type: "delete-custom-component",
      name: "XorBlock",
    });
    expect(deleted.unlockedSubmodules).toHaveLength(0);
    expect(deleted.message).toContain("已删除");
  });

  it("protects a custom component used inside another component definition", () => {
    const nested = apply(
      createCalculatorLessonState(),
      {
        type: "load-project",
        currentStage: 1,
        passedStages: [],
        unlockedSubmodules: [
          {
            name: "A",
            custom: true,
            graph: {
              nodes: [{ id: "a-out", kind: "output", name: "out", x: 100, y: 40 }],
              edges: [],
            },
          },
          {
            name: "B",
            custom: true,
            graph: {
              nodes: [
                { id: "b-a", kind: "component", name: "A", x: 100, y: 40 },
                { id: "b-out", kind: "output", name: "out", x: 300, y: 40 },
              ],
              edges: [
                {
                  id: "b-wire",
                  from: { node: "b-a", port: "out" },
                  to: { node: "b-out", port: "in" },
                },
              ],
            },
          },
        ],
        drafts: {
          1: {
            nodes: [{ id: "stage-b", kind: "component", name: "B", x: 300, y: 60 }],
            edges: [],
          },
        },
      },
      { type: "delete-custom-component", name: "A" },
    );

    expect(nested.unlockedSubmodules.map((component) => component.name)).toEqual(["A", "B"]);
    expect(nested.message).toContain("B");
    expect(nested.message).toContain("仍被");
  });

  it("protects transitive component dependencies when only the outer component is on the canvas", () => {
    const dependencyGraph = (name: string, id: string): CircuitGraph => ({
      nodes: [
        { id: `${id}-dependency`, kind: "component", name, x: 100, y: 40 },
        { id: `${id}-out`, kind: "output", name: "out", x: 300, y: 40 },
      ],
      edges: [
        {
          id: `${id}-wire`,
          from: { node: `${id}-dependency`, port: "out" },
          to: { node: `${id}-out`, port: "in" },
        },
      ],
    });
    const state = apply(createCalculatorLessonState(), {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      unlockedSubmodules: [
        {
          name: "A",
          custom: true,
          graph: {
            nodes: [{ id: "a-out", kind: "output", name: "out", x: 100, y: 40 }],
            edges: [],
          },
        },
        { name: "B", custom: true, graph: dependencyGraph("A", "b") },
        { name: "C", custom: true, graph: dependencyGraph("B", "c") },
      ],
      drafts: {
        1: {
          nodes: [{ id: "stage-c", kind: "component", name: "C", x: 300, y: 60 }],
          edges: [],
        },
      },
    });

    const blocked = apply(state, { type: "delete-custom-component", name: "A" });

    expect(blocked.unlockedSubmodules.map((component) => component.name)).toEqual(["A", "B", "C"]);
    expect(blocked.message).toContain("B、C");
  });

  it("keeps a single driver per input port", () => {
    const state = apply(
      createCalculatorLessonState(2),
      { type: "add-node", kind: "xor", x: 300, y: 60 },
      { type: "start-wire", from: { node: "in-A", port: "out" } },
    );
    const gateId = state.selectedNodeId!;
    const first = apply(state, { type: "complete-wire", to: { node: gateId, port: "in0" } });
    const second = apply(
      first,
      { type: "start-wire", from: { node: "in-B", port: "out" } },
      { type: "complete-wire", to: { node: gateId, port: "in0" } },
    );
    const intoPort = graphOf(second).edges.filter(
      (e) => e.to.node === gateId && e.to.port === "in0",
    );
    expect(intoPort).toHaveLength(1);
    expect(intoPort[0].from.node).toBe("in-B");
  });

  it("refuses to delete stage contract pins but deletes gates with their wires", () => {
    const withGate = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "and",
      x: 200,
      y: 100,
    });
    const gateId = withGate.selectedNodeId!;
    const wired = apply(
      withGate,
      { type: "start-wire", from: { node: "in-A", port: "out" } },
      { type: "complete-wire", to: { node: gateId, port: "in0" } },
    );

    const keptPin = apply(wired, { type: "delete-node", id: "in-A" });
    expect(graphOf(keptPin).nodes.some((n) => n.id === "in-A")).toBe(true);

    const removed = apply(wired, { type: "delete-node", id: gateId });
    expect(graphOf(removed).nodes.some((n) => n.id === gateId)).toBe(false);
    expect(graphOf(removed).edges).toHaveLength(0);
  });

  it("runs public tests locally and passes a correct half adder", () => {
    const loaded = apply(createCalculatorLessonState(2), {
      type: "load-project",
      currentStage: 2,
      passedStages: [],
      unlockedSubmodules: [],
      drafts: { 2: halfAdderGraph() },
    });
    const run = apply(loaded, { type: "run-public-tests" });
    expect(run.runOutcome).not.toBeNull();
    expect(run.runOutcome!.score).toBe(run.runOutcome!.total);
    expect(run.runOutcome!.total).toBeGreaterThan(0);
  });

  it("fails public tests on an empty canvas", () => {
    const run = apply(createCalculatorLessonState(), { type: "run-public-tests" });
    expect(run.runOutcome!.score).toBe(0);
  });

  it("clears a stale verdict as soon as the circuit changes", () => {
    const run = apply(
      apply(createCalculatorLessonState(2), {
        type: "load-project",
        currentStage: 2,
        passedStages: [],
        unlockedSubmodules: [],
        drafts: { 2: halfAdderGraph() },
      }),
      { type: "run-public-tests" },
    );
    expect(run.runOutcome).not.toBeNull();
    const edited = apply(run, { type: "add-node", kind: "or", x: 10, y: 10 });
    expect(edited.runOutcome).toBeNull();
    expect(edited.judgeOutcome).toBeNull();
  });

  it("records an unlocked component and advances on a passing verdict", () => {
    const loaded = apply(createCalculatorLessonState(2), {
      type: "load-project",
      currentStage: 2,
      passedStages: [],
      unlockedSubmodules: [],
      drafts: { 2: halfAdderGraph() },
    });
    const judged = apply(loaded, {
      type: "judge-result",
      stageIndex: 2,
      outcome: {
        score: 4,
        total: 4,
        passed: true,
        categories: { basic: { passed: 3, total: 3 }, carry: { passed: 1, total: 1 } },
        counterexample: null,
        passedStages: [2],
        error: null,
        unlockedComponent: "HalfAdder",
        componentsRevision: null,
        unlockedSubmodules: null,
      },
    });
    expect(judged.currentStage).toBe(3);
    expect(judged.passedStages).toEqual([2]);
    expect(judged.unlockedSubmodules.map((s) => s.name)).toEqual(["HalfAdder"]);
    expect(judged.message).toContain("HalfAdder");
    expect(isStageUnlocked(judged, 3)).toBe(true);

    // The unlocked stage keeps its own draft, scaffolded on first visit.
    const stage3 = apply(judged, { type: "select-stage", stageIndex: 3 });
    expect(graphOf(stage3).nodes.map((n) => n.name)).toContain("Cin");
    expect(graphOf(stage3, 2).nodes.length).toBeGreaterThan(0);
  });

  it("adopts the judge's authoritative library snapshot instead of grafting", () => {
    // A stale tab judges after another tab saved: the answer carries the
    // server's whole library (here: the other tab's BGate + the unlock) —
    // the local list must be REPLACED, never merged onto the stale copy.
    const bGate = { name: "BGate", graph: { nodes: [], edges: [] }, custom: true };
    const halfAdder = { name: "HalfAdder", graph: halfAdderGraph() };
    const loaded = apply(createCalculatorLessonState(2), {
      type: "load-project",
      currentStage: 2,
      passedStages: [],
      unlockedSubmodules: [],
      drafts: {},
      componentsRevision: 0,
    });
    const judged = apply(loaded, {
      type: "judge-result",
      stageIndex: 2,
      outcome: {
        score: 4,
        total: 4,
        passed: true,
        categories: { basic: { passed: 4, total: 4 } },
        counterexample: null,
        passedStages: [2],
        error: null,
        unlockedComponent: "HalfAdder",
        componentsRevision: 2,
        unlockedSubmodules: [bGate, halfAdder],
      },
    });
    // BGate survives on this tab too — the next autosave carries the adopted
    // snapshot and can never delete it.
    expect(judged.unlockedSubmodules.map((s) => s.name)).toEqual(["BGate", "HalfAdder"]);
    expect(judged.componentsRevision).toBe(2);
    expect(judged.conflictedComponents).toBeNull();
    expect(judged.componentsChanged).toBe(false);
  });

  it("stashes unsaved local components when the judge's snapshot replaces the library", () => {
    // The learner had a pending custom component the judge's snapshot does
    // not know about: adopting the server list silently would lose it. It
    // moves to conflictedComponents — the same restorable backup a refused
    // save produces — and the library itself still syncs to the server.
    const mine = { name: "Mine", graph: { nodes: [], edges: [] }, custom: true };
    const other = { name: "Other", graph: { nodes: [], edges: [] }, custom: true };
    const halfAdder = { name: "HalfAdder", graph: halfAdderGraph() };
    let loaded = apply(createCalculatorLessonState(2), {
      type: "load-project",
      currentStage: 2,
      passedStages: [],
      unlockedSubmodules: [],
      drafts: {},
      componentsRevision: 0,
    });
    // The local edit marks the library dirty exactly like a real create.
    loaded = { ...loaded, unlockedSubmodules: [mine], componentsChanged: true };
    const judged = apply(loaded, {
      type: "judge-result",
      stageIndex: 2,
      outcome: {
        score: 4,
        total: 4,
        passed: true,
        categories: { basic: { passed: 4, total: 4 } },
        counterexample: null,
        passedStages: [2],
        error: null,
        unlockedComponent: "HalfAdder",
        componentsRevision: 2,
        unlockedSubmodules: [other, halfAdder],
      },
    });
    expect(judged.unlockedSubmodules.map((s) => s.name)).toEqual(["Other", "HalfAdder"]);
    expect(judged.componentsRevision).toBe(2);
    expect(judged.componentsChanged).toBe(false);
    expect(judged.conflictedComponents?.map((s) => s.name)).toEqual(["Mine"]);
  });

  it("reopens the stage named by the URL when it is unlocked", () => {
    const loaded = apply(createCalculatorLessonState(), {
      type: "load-project",
      currentStage: 7,
      passedStages: [1, 2, 3, 4, 5, 6],
      unlockedSubmodules: [],
      drafts: { 8: halfAdderGraph() },
      stageIndex: 8,
    });
    expect(loaded.stageIndex).toBe(8);
    expect(graphOf(loaded).nodes.length).toBeGreaterThan(0);
  });

  it("restores a core stage even before its predecessors are passed", () => {
    const loaded = apply(createCalculatorLessonState(), {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      unlockedSubmodules: [],
      drafts: {},
      stageIndex: 4,
    });
    expect(loaded.stageIndex).toBe(4);
  });

  it("falls back to the first stage when the requested stage is still locked", () => {
    const loaded = apply(createCalculatorLessonState(), {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      unlockedSubmodules: [],
      drafts: {},
      stageIndex: 8,
    });
    expect(loaded.stageIndex).toBe(1);
  });

  it("ignores a requested stage that does not exist", () => {
    const loaded = apply(createCalculatorLessonState(), {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      unlockedSubmodules: [],
      drafts: {},
      stageIndex: 99,
    });
    expect(loaded.stageIndex).toBe(1);
  });

  it("restores missing contract pins when loading an older draft", () => {
    const loaded = apply(createCalculatorLessonState(), {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      unlockedSubmodules: [],
      drafts: { 1: { nodes: [{ id: "x", kind: "xor", x: 0, y: 0 }], edges: [] } },
    });
    const names = graphOf(loaded)
      .nodes.filter((n) => n.kind === "input" || n.kind === "output")
      .map((n) => n.name);
    expect(names).toEqual(expect.arrayContaining(["A", "Y"]));
  });

  it("re-sorts untouched scaffold pins to the current contract order", () => {
    // A draft saved when stage 7 listed Op1 above Op0.
    const staleNodes = scaffoldGraph(8).nodes.map((node) =>
      node.name === "Op0" ? { ...node, y: 454 } : node.name === "Op1" ? { ...node, y: 408 } : node,
    );
    const loaded = apply(createCalculatorLessonState(8), {
      type: "load-project",
      currentStage: 8,
      passedStages: [1, 2, 3, 4, 5, 6],
      unlockedSubmodules: [],
      drafts: { 8: { nodes: staleNodes, edges: [] } },
    });
    const pins = graphOf(loaded).nodes;
    expect(pins.find((node) => node.name === "Op0")?.y).toBe(408);
    expect(pins.find((node) => node.name === "Op1")?.y).toBe(454);
  });

  it("leaves pin positions alone once the learner has moved one", () => {
    const staleNodes = scaffoldGraph(8).nodes.map((node) =>
      node.name === "Op0"
        ? { ...node, y: 454 }
        : node.name === "Op1"
          ? { ...node, y: 408 }
          : node.name === "A0"
            ? { ...node, x: 90, y: 200 }
            : node,
    );
    const loaded = apply(createCalculatorLessonState(8), {
      type: "load-project",
      currentStage: 8,
      passedStages: [1, 2, 3, 4, 5, 6],
      unlockedSubmodules: [],
      drafts: { 8: { nodes: staleNodes, edges: [] } },
    });
    const pins = graphOf(loaded).nodes;
    expect(pins.find((node) => node.name === "Op0")?.y).toBe(454);
    expect(pins.find((node) => node.name === "Op1")?.y).toBe(408);
  });

  it("resets a stage back to its scaffold", () => {
    const dirty = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "nand",
      x: 5,
      y: 5,
    });
    const reset = apply(dirty, { type: "reset-stage" });
    expect(graphOf(reset)).toEqual(scaffoldGraph(1));
  });

  it("tracks the autosave lifecycle", () => {
    const dirty = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "or",
      x: 1,
      y: 1,
    });
    expect(statusForStage(dirty.saveStatusByStage, dirty.stageIndex)).toBe("dirty");
    const saving = apply(dirty, { type: "mark-saving", stageIndex: 1 });
    expect(statusForStage(saving.saveStatusByStage, saving.stageIndex)).toBe("saving");
    expect(
      statusForStage(apply(saving, { type: "mark-saved", stageIndex: 1 }).saveStatusByStage, 1),
    ).toBe("saved");
    // A save that lands after a new edit must not claim "saved".
    const editedWhileSaving = apply(saving, { type: "add-node", kind: "and", x: 2, y: 2 });
    expect(
      statusForStage(
        apply(editedWhileSaving, { type: "mark-saved", stageIndex: 1 }).saveStatusByStage,
        1,
      ),
    ).toBe("dirty");
  });

  it("undoes the most recent graph edit on the current stage", () => {
    const base = createCalculatorLessonState();
    const edited = apply(base, { type: "add-node", kind: "xor", x: 10, y: 10 });
    expect(graphOf(edited).nodes.length).toBe(graphOf(base).nodes.length + 1);

    const undone = apply(edited, { type: "undo" });
    expect(graphOf(undone)).toEqual(graphOf(base));
    expect(undone.past).toHaveLength(0);
    expect(statusForStage(undone.saveStatusByStage, undone.stageIndex)).toBe("dirty");
  });

  it("groups continuous node dragging into one undo step", () => {
    const base = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "xor",
      x: 10,
      y: 10,
    });
    const nodeId = base.selectedNodeId!;
    const dragged = apply(
      base,
      { type: "start-node-move", id: nodeId },
      { type: "move-node", id: nodeId, x: 11, y: 11 },
      { type: "move-node", id: nodeId, x: 12, y: 12 },
      { type: "move-node", id: nodeId, x: 13, y: 13 },
      { type: "finish-node-move" },
    );

    expect(dragged.past).toHaveLength(2);
    expect(graphOf(dragged).nodes.find((node) => node.id === nodeId)).toMatchObject({
      x: 13,
      y: 13,
    });
    const undone = apply(dragged, { type: "undo" });
    expect(graphOf(undone).nodes.find((node) => node.id === nodeId)).toMatchObject({
      x: 10,
      y: 10,
    });
    expect(undone.past).toHaveLength(1);
  });

  it("undoes a reset back to the working draft", () => {
    const dirty = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "nand",
      x: 5,
      y: 5,
    });
    const reset = apply(dirty, { type: "reset-stage" });
    const undone = apply(reset, { type: "undo" });
    expect(graphOf(undone)).toEqual(graphOf(dirty));
  });

  it("never restores a snapshot that belongs to another stage", () => {
    const edited = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "xor",
      x: 10,
      y: 10,
    });
    const stage2 = apply(edited, { type: "select-stage", stageIndex: 2 });
    const undone = apply(stage2, { type: "undo" });
    expect(undone).toBe(stage2);

    // Back on stage 1 the snapshot is still there and restores correctly.
    const back = apply(undone, { type: "select-stage", stageIndex: 1 });
    const restored = apply(back, { type: "undo" });
    expect(graphOf(restored, 1).nodes.some((n) => n.kind === "xor")).toBe(false);
  });

  it("caps the undo stack at 50 snapshots, dropping the oldest", () => {
    let state = createCalculatorLessonState();
    for (let i = 0; i < 55; i += 1) {
      state = apply(state, { type: "add-node", kind: "or", x: i, y: i });
    }
    expect(state.past).toHaveLength(50);
    for (let i = 0; i < 50; i += 1) {
      state = apply(state, { type: "undo" });
    }
    expect(state.past).toHaveLength(0);
    // The five oldest snapshots were dropped: five added nodes remain.
    expect(graphOf(state).nodes.length).toBe(scaffoldGraph(1).nodes.length + 5);
    expect(apply(state, { type: "undo" }).past).toHaveLength(0);
  });

  it("allows staff forceStage load and clears selection/wire on isReset", () => {
    const edited = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "and",
      x: 20,
      y: 20,
    });
    const nodeId = graphOf(edited).nodes.find((n) => n.kind === "and")!.id;
    const withSelection = apply(edited, { type: "select-node", id: nodeId });
    const forced = apply(withSelection, {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      unlockedSubmodules: [],
      drafts: {},
      stageIndex: 8,
      forceStage: true,
    });
    expect(forced.stageIndex).toBe(8);

    const reset = apply(forced, {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      unlockedSubmodules: [],
      drafts: {},
      stageIndex: 1,
      forceStage: true,
      isReset: true,
    });
    expect(reset.stageIndex).toBe(1);
    expect(reset.selectedNodeId).toBeNull();
    expect(reset.pendingWire).toBeNull();
    expect(reset.message).toBeNull();
  });
});
