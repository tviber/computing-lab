import { describe, expect, it } from "vitest";
import { openMemoryDb, newId } from "../db/client.ts";
import { getOrCreateProject } from "./pipeline.ts";
import { judgeSubmission, saveDraft } from "./run.ts";
import { hiddenTestsFor } from "./testcases.ts";
import { runCases } from "../../src/features/calculator/domain/evaluate.ts";
import type { ComponentDef } from "../../src/features/calculator/domain/graph.ts";
import {
  add4Graph,
  calculatorGraph,
  fullAdderGraph,
  fullAdderPrimitiveGraph,
  halfAdderGraph,
  majority3Graph,
  mul4Graph,
  neg4Graph,
  odd3Graph,
  sub4Graph,
  secondTickGraph,
  wireGraph,
} from "../../src/features/calculator/domain/fixtures.ts";
import {
  CALCULATOR_STAGES,
  challengeStages,
  coreStages,
} from "../../src/features/calculator/domain/stages.ts";
import type { CircuitGraph } from "../../src/features/calculator/domain/graph.ts";

/**
 * The reference solutions are correct by construction; every hidden vector
 * must accept them. A failure here means the judge (not the student) is wrong.
 */
describe("hidden tests accept the reference solutions", () => {
  const halfAdder = halfAdderGraph();
  const fullAdder = fullAdderGraph();
  const add4 = add4Graph();
  const neg4 = neg4Graph();
  const sub4 = sub4Graph();
  const mul4 = mul4Graph();

  // Components accumulate exactly like the unlock progression does.
  const afterStage2 = { HalfAdder: halfAdder };
  const afterStage3 = { ...afterStage2, FullAdder: fullAdder };
  const afterStage4 = { ...afterStage3, Add4: add4 };
  const afterStage5 = { ...afterStage4, Neg4: neg4 };
  const afterStage6 = { ...afterStage5, Sub4: sub4 };
  const afterStage7 = { ...afterStage6, Mul4: mul4 };

  it.each([
    [1, wireGraph(), {}],
    [2, halfAdder, {}],
    [3, fullAdder, afterStage2],
    [3, fullAdderPrimitiveGraph(), {}],
    [4, add4, afterStage3],
    [5, neg4, afterStage4],
    [6, sub4, afterStage5],
    [7, mul4, afterStage6],
    [8, calculatorGraph(), afterStage7],
    [9, secondTickGraph(), {}],
    [10, odd3Graph(), {}],
    [11, majority3Graph(), {}],
  ])(
    "stage %i reference solution passes every hidden case",
    (stageIndex, graph, components: Record<string, CircuitGraph>) => {
      const cases = hiddenTestsFor(stageIndex as number);
      expect(cases.length).toBeGreaterThan(0);
      const { results, score, total } = runCases(graph as CircuitGraph, cases, components);
      const failed = results.filter((r) => !r.passed);
      expect(
        failed.map(
          (r) =>
            `${r.name} expected=${JSON.stringify(r.expected)} actual=${JSON.stringify(r.actual)}`,
        ),
      ).toEqual([]);
      expect(score).toBe(total);
    },
    // Stages 7-8 now enumerate every operand pair (256 and 1024 cases); leave
    // headroom for slow CI runners even though component evaluation is memoized.
    120_000,
  );

  it("rejects a wrong half adder and classifies the failures", () => {
    // Carry wired to OR instead of AND: correct only when at most one input is 1.
    const broken: CircuitGraph = {
      nodes: [
        { id: "a", kind: "input", name: "A", value: 0, x: 0, y: 0 },
        { id: "b", kind: "input", name: "B", value: 0, x: 0, y: 40 },
        { id: "x", kind: "xor", x: 100, y: 0 },
        { id: "o", kind: "or", x: 100, y: 60 },
        { id: "s", kind: "output", name: "Sum", x: 200, y: 0 },
        { id: "c", kind: "output", name: "Carry", x: 200, y: 60 },
      ],
      edges: [
        { id: "1", from: { node: "a", port: "out" }, to: { node: "x", port: "in0" } },
        { id: "2", from: { node: "b", port: "out" }, to: { node: "x", port: "in1" } },
        { id: "3", from: { node: "a", port: "out" }, to: { node: "o", port: "in0" } },
        { id: "4", from: { node: "b", port: "out" }, to: { node: "o", port: "in1" } },
        { id: "5", from: { node: "x", port: "out" }, to: { node: "s", port: "in" } },
        { id: "6", from: { node: "o", port: "out" }, to: { node: "c", port: "in" } },
      ],
    };
    const { score, total } = runCases(broken, hiddenTestsFor(2), {});
    expect(score).toBeLessThan(total);
  });

  it("reports undriven outputs instead of silently passing", () => {
    const dangling: CircuitGraph = {
      nodes: [
        { id: "a", kind: "input", name: "A", value: 0, x: 0, y: 0 },
        { id: "b", kind: "input", name: "B", value: 0, x: 0, y: 40 },
        { id: "s", kind: "output", name: "Sum", x: 200, y: 0 },
        { id: "c", kind: "output", name: "Carry", x: 200, y: 60 },
      ],
      edges: [],
    };
    const { results } = runCases(dangling, hiddenTestsFor(2), {});
    // 0+0 happens to expect Sum=0/Carry=0, but null must not equal 0.
    expect(results.every((r) => !r.passed)).toBe(true);
  });

  it("enumerates every operand pair for the 4-bit arithmetic stages", () => {
    expect(hiddenTestsFor(4)).toHaveLength(256);
    expect(hiddenTestsFor(5)).toHaveLength(16);
    expect(hiddenTestsFor(6)).toHaveLength(256);
    expect(hiddenTestsFor(7)).toHaveLength(256);
    expect(hiddenTestsFor(8)).toHaveLength(1024);
  });

  it("detects a feedback loop rather than hanging", () => {
    const looped: CircuitGraph = {
      nodes: [
        { id: "n1", kind: "not", x: 0, y: 0 },
        { id: "o", kind: "output", name: "Sum", x: 100, y: 0 },
      ],
      edges: [
        { id: "1", from: { node: "n1", port: "out" }, to: { node: "n1", port: "in" } },
        { id: "2", from: { node: "n1", port: "out" }, to: { node: "o", port: "in" } },
      ],
    };
    const { results } = runCases(looped, hiddenTestsFor(2), {});
    expect(results[0].error?.kind).toBe("cycle");
  });
});

describe("stage contracts", () => {
  it("declares unique ids and consecutive indices", () => {
    expect(CALCULATOR_STAGES.map((s) => s.index)).toEqual(
      Array.from({ length: 11 }, (_, index) => index + 1),
    );
    expect(new Set(CALCULATOR_STAGES.map((s) => s.id)).size).toBe(11);
    for (const stage of CALCULATOR_STAGES) {
      expect(stage.inputs.length).toBeGreaterThan(0);
      expect(stage.outputs.length).toBeGreaterThan(0);
    }
  });

  it("covers every declared output pin with hidden cases", () => {
    for (const stage of CALCULATOR_STAGES) {
      const cases = hiddenTestsFor(stage.index);
      const covered = new Set(cases.flatMap((c) => Object.keys(c.outputs)));
      expect([...covered].sort()).toEqual([...stage.outputs].sort());
      const bound = new Set(cases.flatMap((c) => Object.keys(c.inputs)));
      expect([...bound].sort()).toEqual([...stage.inputs].sort());
    }
  });

  it("declares non-empty buses whose pins match the stage contract", () => {
    for (const stage of CALCULATOR_STAGES) {
      if (stage.buses.length === 0) continue;
      expect(stage.buses.length).toBeGreaterThan(0);
      for (const bus of stage.buses) {
        const declared = bus.role === "input" ? stage.inputs : stage.outputs;
        for (const pin of bus.pins) {
          expect(declared, `${stage.id} bus "${bus.name}" pin ${pin}`).toContain(pin);
        }
      }
    }
  });

  it("splits stages into core, anchored side challenges, and late challenges", () => {
    expect(coreStages().map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(challengeStages().map((s) => s.index)).toEqual([7, 8, 9, 10, 11]);
    expect(
      challengeStages()
        .filter((s) => s.railAfter !== undefined)
        .map((s) => s.index),
    ).toEqual([9, 10, 11]);
  });
});

describe("judge persistence and unlocking", () => {
  function setup() {
    const db = openMemoryDb();
    const userId = newId();
    const classId = newId();
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
      classId,
      "test-class",
      "TEST1",
    );
    db.prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)").run(
      userId,
      "20260101",
      "张三",
      "scrypt:x:y",
    );
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, 'student')",
    ).run(newId(), classId, userId);
    return { db, userId, classId };
  }

  it("advances the stage and unlocks the component on a full pass", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    expect(project.currentStage).toBe(1);

    const outcome = judgeSubmission(db, project, 2, halfAdderGraph());
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.passed).toBe(true);
    expect(outcome.score).toBe(outcome.total);
    expect(outcome.currentStage).toBe(3);
    expect(outcome.passedStages).toEqual([2]);
    expect(outcome.testSummary.counterexample).toBeNull();
    expect(outcome.unlockedComponent).toBe("HalfAdder");

    const reloaded = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    expect(reloaded.currentStage).toBe(3);
    expect(reloaded.passedStages).toEqual([2]);
    expect((reloaded.unlockedSubmodules as ComponentDef[]).map((s) => s.name)).toEqual([
      "HalfAdder",
    ]);

    // The unlocked component is usable by the next stage.
    const stage2 = judgeSubmission(db, reloaded, 3, fullAdderGraph());
    if ("error" in stage2) throw new Error(stage2.error);
    expect(stage2.passed).toBe(true);
    expect(stage2.currentStage).toBe(4);
  });

  it("judges with a learner-made component but never persists the submitted list", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    const custom = { name: "PackedHalfAdder", graph: halfAdderGraph(), custom: true };
    const graph: CircuitGraph = {
      nodes: [
        { id: "a", kind: "input", name: "A", value: 0, x: 40, y: 40 },
        { id: "b", kind: "input", name: "B", value: 0, x: 40, y: 86 },
        { id: "component", kind: "component", name: custom.name, x: 220, y: 60 },
        { id: "sum", kind: "output", name: "Sum", x: 480, y: 40 },
        { id: "carry", kind: "output", name: "Carry", x: 480, y: 86 },
      ],
      edges: [
        {
          id: "a-component",
          from: { node: "a", port: "out" },
          to: { node: "component", port: "A" },
        },
        {
          id: "b-component",
          from: { node: "b", port: "out" },
          to: { node: "component", port: "B" },
        },
        {
          id: "component-sum",
          from: { node: "component", port: "Sum" },
          to: { node: "sum", port: "in" },
        },
        {
          id: "component-carry",
          from: { node: "component", port: "Carry" },
          to: { node: "carry", port: "in" },
        },
      ],
    };

    const outcome = judgeSubmission(db, project, 2, graph, [custom]);
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.passed).toBe(true);
    // The submitted component list is an evaluation view only: the library
    // write keeps just the server copy plus the judge's own unlock grant —
    // PackedHalfAdder persists through the draft OCC save path, not judge.
    const reloaded = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    expect(
      (reloaded.unlockedSubmodules as ComponentDef[]).map((component) => component.name),
    ).toEqual(["HalfAdder"]);
    expect((reloaded.unlockedSubmodules as ComponentDef[])[0].custom).toBeUndefined();
  });

  it("never lets a stale tab's judgement overwrite another tab's fresh components", () => {
    const { db, userId, classId } = setup();
    // Tab A's project view — read before tab B created anything.
    const staleProject = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    // Tab B creates a component and autosaves it through the OCC path —
    // the library's revision moves to 1.
    const fresh = { name: "FreshGate", graph: { nodes: [], edges: [] }, custom: true };
    const saved = saveDraft(db, staleProject, 1, { nodes: [], edges: [] }, [fresh], 0, 0);
    expect(saved).toMatchObject({ applied: true, componentsRevision: 1 });

    // Tab A judges stage 2 with its stale (empty) component list — a
    // FAILING judgement must not write that list back over B's save.
    const failing = judgeSubmission(db, staleProject, 2, wireGraph(), []);
    if ("error" in failing) throw new Error(failing.error);
    expect(failing.passed).toBe(false);
    expect(failing.componentsRevision).toBeNull();
    let reloaded = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    expect(
      (reloaded.unlockedSubmodules as ComponentDef[]).map((component) => component.name),
    ).toEqual(["FreshGate"]);
    expect(reloaded.draftRevisions.components).toBe(1);

    // Even a PASSING judgement only adds the stage's own unlock to the
    // server copy — B's component survives alongside it.
    const passing = judgeSubmission(db, staleProject, 2, halfAdderGraph(), []);
    if ("error" in passing) throw new Error(passing.error);
    expect(passing.passed).toBe(true);
    expect(passing.unlockedComponent).toBe("HalfAdder");
    reloaded = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    expect(
      (reloaded.unlockedSubmodules as ComponentDef[]).map((component) => component.name),
    ).toEqual(["FreshGate", "HalfAdder"]);
    expect(reloaded.draftRevisions.components).toBe(2);

    // The judgement answers its library write with the full authoritative
    // snapshot, not just a revision number: tab A adopts it wholesale, so
    // its own next save carries BOTH B's component and the unlock under the
    // claimed revision — FreshGate must still be there afterwards.
    expect(passing.componentsRevision).toBe(2);
    expect(passing.unlockedSubmodules?.map((component) => component.name)).toEqual([
      "FreshGate",
      "HalfAdder",
    ]);
    const aGate = { name: "AGate", graph: { nodes: [], edges: [] }, custom: true };
    const adopted = passing.unlockedSubmodules ?? [];
    // Each PUT loads its own project row — the request-time read is what
    // the merge classifies against, never a tab's stale snapshot.
    const requestProject = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    const accepted = saveDraft(
      db,
      requestProject,
      3,
      { nodes: [], edges: [] },
      [...adopted, aGate],
      0,
      passing.componentsRevision ?? 0,
    );
    expect(accepted).toMatchObject({ applied: true, componentsRevision: 3 });
    reloaded = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    expect(
      (reloaded.unlockedSubmodules as ComponentDef[]).map((component) => component.name),
    ).toEqual(["FreshGate", "HalfAdder", "AGate"]);
  });

  it("does not advance on a partial pass but records the score", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    // Fully wired but wrong: Carry is OR instead of AND, so exactly one
    // hidden case fails — a genuine partial pass, not a structural fail.
    const wrongCarry: CircuitGraph = {
      nodes: [
        { id: "a", kind: "input", name: "A", value: 0, x: 0, y: 0 },
        { id: "b", kind: "input", name: "B", value: 0, x: 0, y: 40 },
        { id: "x", kind: "xor", x: 100, y: 0 },
        { id: "o", kind: "or", x: 100, y: 60 },
        { id: "s", kind: "output", name: "Sum", x: 200, y: 0 },
        { id: "c", kind: "output", name: "Carry", x: 200, y: 60 },
      ],
      edges: [
        { id: "1", from: { node: "a", port: "out" }, to: { node: "x", port: "in0" } },
        { id: "2", from: { node: "b", port: "out" }, to: { node: "x", port: "in1" } },
        { id: "3", from: { node: "a", port: "out" }, to: { node: "o", port: "in0" } },
        { id: "4", from: { node: "b", port: "out" }, to: { node: "o", port: "in1" } },
        { id: "5", from: { node: "x", port: "out" }, to: { node: "s", port: "in" } },
        { id: "6", from: { node: "o", port: "out" }, to: { node: "c", port: "in" } },
      ],
    };
    const outcome = judgeSubmission(db, project, 2, wrongCarry);
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.passed).toBe(false);
    expect(outcome.currentStage).toBe(1);
    expect(outcome.passedStages).toEqual([]);
    expect(outcome.unlockedComponent).toBeNull();
    expect(Object.keys(outcome.testSummary.categories).length).toBeGreaterThan(0);
    // A failed run exposes the first failing case as a minimal counterexample.
    const counterexample = outcome.testSummary.counterexample;
    expect(counterexample).not.toBeNull();
    expect(counterexample!.actual).not.toEqual(counterexample!.expected);

    const count = db
      .prepare("SELECT COUNT(*) AS n FROM submissions WHERE user_id = ?")
      .get(userId) as { n: number };
    expect(count.n).toBe(1);
  });

  it("refuses a challenge stage while any core stage is unpassed", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    const outcome = judgeSubmission(db, project, 7, mul4Graph());
    expect(outcome).toMatchObject({ error: "stage-locked", status: 409 });
  });

  it("opens an anchored side challenge without advancing the mainline", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    const locked = judgeSubmission(db, project, 9, secondTickGraph());
    expect(locked).toMatchObject({ error: "stage-locked", status: 409 });

    const wire = judgeSubmission(db, project, 1, wireGraph());
    if ("error" in wire) throw new Error(wire.error);
    expect(wire.passed).toBe(true);
    expect(wire.currentStage).toBe(2);

    const afterWire = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    const side = judgeSubmission(db, afterWire, 9, secondTickGraph());
    if ("error" in side) throw new Error(side.error);
    expect(side.passed).toBe(true);
    expect(side.passedStages).toEqual([1, 9]);
    expect(side.currentStage).toBe(2);
  });

  it("accepts a core stage submission in any order", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    // neg4Graph needs the Add4 component, so it cannot pass yet — the point
    // is that judging stage 5 is allowed rather than stage-locked.
    const outcome = judgeSubmission(db, project, 5, neg4Graph());
    expect("error" in outcome ? outcome.error : null).not.toBe("stage-locked");
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.passed).toBe(false);
  });

  it("persists out-of-order passes in passed_stages", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");

    // Stage 3 first (the primitive-only full adder needs no components).
    const stage2 = judgeSubmission(db, project, 3, fullAdderPrimitiveGraph());
    if ("error" in stage2) throw new Error(stage2.error);
    expect(stage2.passed).toBe(true);
    expect(stage2.passedStages).toEqual([3]);
    expect(stage2.currentStage).toBe(4);
    expect(stage2.unlockedComponent).toBe("FullAdder");

    // Stage 2 afterwards still counts.
    const after2 = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    const stage1 = judgeSubmission(db, after2, 2, halfAdderGraph());
    if ("error" in stage1) throw new Error(stage1.error);
    expect(stage1.passed).toBe(true);
    expect(stage1.passedStages).toEqual([2, 3]);

    const reloaded = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    expect(reloaded.passedStages).toEqual([2, 3]);
    expect(reloaded.currentStage).toBe(4);
    expect((reloaded.unlockedSubmodules as ComponentDef[]).map((s) => s.name)).toEqual(
      expect.arrayContaining(["HalfAdder", "FullAdder"]),
    );
  });

  it("fails a structurally invalid graph without running cases", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    // Two wires into Sum's `in` port plus a missing B pin: the bug from issue
    // #44 — this graph must fail before any truth-table case runs.
    const bad: CircuitGraph = {
      nodes: [
        { id: "a", kind: "input", name: "A", value: 0, x: 0, y: 0 },
        { id: "s", kind: "output", name: "Sum", x: 200, y: 0 },
      ],
      edges: [
        { id: "e1", from: { node: "a", port: "out" }, to: { node: "s", port: "in" } },
        { id: "e2", from: { node: "a", port: "out" }, to: { node: "s", port: "in" } },
      ],
    };
    const outcome = judgeSubmission(db, project, 2, bad);
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.passed).toBe(false);
    expect(outcome.score).toBe(0);
    // sanitizeGraph dedupes the double-driven port first, so the readable
    // diagnostics cover the pins it could not repair: a missing B and a
    // missing Carry.
    expect(outcome.testSummary.error).toContain("结构问题");
    expect(outcome.testSummary.error).toContain("缺少输入引脚 B");
    expect(outcome.testSummary.error).toContain("缺少输出引脚 Carry");

    const row = db
      .prepare("SELECT score, passed FROM submissions WHERE user_id = ?")
      .get(userId) as { score: number; passed: number };
    expect(row).toEqual({ score: 0, passed: 0 });
  });

  it("keeps drafts per stage and sanitizes them", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    saveDraft(db, project, 1, halfAdderGraph());
    const withOne = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    expect(Object.keys(withOne.drafts)).toEqual(["1"]);

    saveDraft(db, withOne, 2, { nodes: "not-an-array", edges: [] });
    const withTwo = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    expect(withTwo.drafts["2"]).toEqual({ nodes: [], edges: [] });
    expect(withTwo.drafts["1"].nodes.length).toBeGreaterThan(0);
  });

  it("removes a learner-made component when autosave submits it as deleted", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    const custom = { name: "TemporaryBlock", graph: halfAdderGraph(), custom: true };

    saveDraft(db, project, 1, { nodes: [], edges: [] }, [custom], 0, 0);
    const withCustom = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    expect(
      (withCustom.unlockedSubmodules as ComponentDef[]).map((component) => component.name),
    ).toEqual(["TemporaryBlock"]);

    // Library writes are compare-and-swapped like stage drafts: the second
    // call supersedes at the revision the first write was assigned.
    saveDraft(db, withCustom, 1, { nodes: [], edges: [] }, [], 1, 1);
    const reloaded = getOrCreateProject<CircuitGraph>(db, userId, classId, "calculator");
    expect(reloaded.unlockedSubmodules).toEqual([]);
  });
});

it("keeps server testcase names readable without TeX markup", () => {
  for (const stage of CALCULATOR_STAGES) {
    for (const testcase of hiddenTestsFor(stage.index)) {
      expect(testcase.name).not.toMatch(/[$\\]/);
    }
  }
});
