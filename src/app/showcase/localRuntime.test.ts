import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalTransport, LOCAL_LEARNER_ID } from "./localRuntime";
import { LAB_IDS } from "../../shared/lab/labMetadata";
import {
  build,
  wireGraph,
  halfAdderGraph,
  referenceSolutions,
} from "../../features/calculator/domain/fixtures";
import { CALCULATOR_STAGES } from "../../features/calculator/domain/stages";
import { STATS_FOUNDATIONS_STAGES } from "../../features/stats-foundations/domain/stages";
import type { LocalProject } from "./specs";
import { localSpecs } from "./specs";
import { trainingOrderFor, INTAKE_SCENARIO } from "../../features/lunch-shift/domain/scenarios";
import { DECODING_STAGES } from "../../features/decoding/domain/stages";
import { generatePayload } from "../../features/decoding/domain/payload";
import { seedFor } from "../../features/decoding/domain/rng";
import { priorityIndex, PRIORITY_TABLE_SIZE } from "../../features/lunch-shift/domain/priority";
import {
  LOGISTIC_REGRESSION_STAGES,
  TOKENIZE_PUZZLE_ITEMS,
} from "../../features/logistic-regression/domain/stages";
import { SGD_REFERENCE_CODE } from "../../features/logistic-regression/domain/sgdCode";

const STORAGE_PREFIX = "computing-lab:project:v1:";

function seedProject(labId: string, project: LocalProject) {
  localStorage.setItem(STORAGE_PREFIX + labId, JSON.stringify(project));
}

function storedProject(labId: string): LocalProject {
  return JSON.parse(localStorage.getItem(STORAGE_PREFIX + labId) ?? "") as LocalProject;
}

describe("browser lab host", () => {
  beforeEach(() => localStorage.clear());

  it.each(LAB_IDS)("loads %s without network and refuses invalid stages", async (id) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const transport = createLocalTransport(localStorage);
    const project = await transport.load<LocalProject>("browser", id);
    expect(project.passedStages).toEqual([]);
    await expect(
      transport.judge("browser", id, { stageIndex: -1, expectedGeneration: 0 }),
    ).rejects.toThrow("invalid-stage");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("persists drafts and passes across host recreation; rejects stale revisions and reset generations", async () => {
    const transport = createLocalTransport(localStorage);
    const body = { stageIndex: 1, graph: wireGraph(), expectedGeneration: 0, expectedRevision: 0 };
    expect(await transport.save("browser", "calculator", body)).toMatchObject({
      applied: true,
      revision: 1,
    });
    expect(await transport.save("browser", "calculator", body)).toMatchObject({
      applied: false,
      revision: 1,
    });
    expect(await transport.judge("browser", "calculator", body)).toMatchObject({
      passed: true,
      passedStages: [1],
    });
    const fresh = createLocalTransport(localStorage);
    expect(await fresh.load("browser", "calculator")).toMatchObject({
      drafts: { 1: body.graph },
      passedStages: [1],
    });
    await fresh.reset("browser", "calculator", { scope: "lab", expectedGeneration: 0 });
    await expect(transport.judge("browser", "calculator", body)).rejects.toMatchObject({
      code: "stale-project-generation",
    });
    expect(await fresh.load("browser", "calculator")).toMatchObject({
      drafts: {},
      passedStages: [],
      projectGeneration: 1,
    });
  });

  it("uses the shared calculator evaluator for every stage and grants reusable components", async () => {
    const transport = createLocalTransport(localStorage);
    const solutions = referenceSolutions();
    for (const stage of CALCULATOR_STAGES) {
      expect(
        await transport.judge("browser", "calculator", {
          stageIndex: stage.index,
          graph: solutions[stage.index],
          expectedGeneration: 0,
        }),
      ).toMatchObject({ passed: true });
    }
    const loaded = await transport.load<LocalProject>("browser", "calculator");
    expect(loaded.passedStages).toHaveLength(CALCULATOR_STAGES.length);
    expect(loaded.unlockedSubmodules.length).toBeGreaterThan(0);
  });

  it("preserves independent calculator stages on reset and removes invalid component dependencies", async () => {
    const transport = createLocalTransport(localStorage);
    for (const [stageIndex, graph] of [
      [1, wireGraph()],
      [2, halfAdderGraph()],
    ] as const)
      await transport.judge("browser", "calculator", { stageIndex, graph, expectedGeneration: 0 });
    const reset = await transport.reset<LocalProject>("browser", "calculator", {
      scope: "stage",
      stageIndex: 2,
      expectedGeneration: 0,
    });
    expect(reset.passedStages).toContain(1);
    expect(reset.passedStages).not.toContain(2);
    expect(reset.unlockedSubmodules).toEqual([]);
  });

  it("clears custom components on a full reset and rejects a late autosave without overwriting progress", async () => {
    const transport = createLocalTransport(localStorage);
    await transport.save("browser", "calculator", {
      stageIndex: 1,
      graph: wireGraph(),
      components: [{ name: "LocalWire", graph: wireGraph(), custom: true }],
      expectedGeneration: 0,
      expectedRevision: 0,
      expectedComponentsRevision: 0,
    });
    const reset = await transport.reset<LocalProject>("browser", "calculator", {
      scope: "lab",
      expectedGeneration: 0,
    });
    expect(reset.unlockedSubmodules).toEqual([]);
    expect(reset.currentStage).toBe(1);
    expect(
      await transport.save("browser", "calculator", {
        stageIndex: 1,
        graph: wireGraph(),
        expectedGeneration: 0,
        expectedRevision: 1,
      }),
    ).toMatchObject({ applied: false, projectGeneration: 1 });
    expect(await transport.load("browser", "calculator")).toMatchObject({ drafts: {} });
  });

  it("repairs calculator drafts on load when a custom component no longer exists", async () => {
    const dangling = build((b) => {
      const a = b.input("A");
      b.output("Y", b.component("Lost", { in: a })("out"));
    });
    seedProject("calculator", {
      userId: LOCAL_LEARNER_ID,
      labId: "calculator",
      currentStage: 2,
      passedStages: [1],
      drafts: { 2: dangling },
      draftRevisions: { 2: 7 },
      projectGeneration: 0,
      unlockedSubmodules: [],
      runSummaries: {},
    });
    const transport = createLocalTransport(localStorage);
    const loaded = await transport.load<LocalProject & { draftNotices?: string[] }>(
      "browser",
      "calculator",
    );
    const repaired = {
      nodes: dangling.nodes.filter((node) => node.kind !== "component"),
      edges: [],
    };
    expect(loaded).toMatchObject({
      drafts: { 2: repaired },
      draftRevisions: { 2: 8 },
      draftNotices: [expect.stringContaining("Lost")],
    });
    expect(storedProject("calculator")).toMatchObject({
      drafts: { 2: repaired },
      draftRevisions: { 2: 8 },
    });
    const again = await transport.load<LocalProject & { draftNotices?: string[] }>(
      "browser",
      "calculator",
    );
    expect(again.draftNotices).toBeUndefined();
    expect(again.draftRevisions).toMatchObject({ 2: 8 });
  });

  it("repairs other calculator drafts when a components save removes a dependency", async () => {
    const dangling = build((b) => {
      const a = b.input("A");
      b.output("Y", b.component("Lost", { in: a })("out"));
    });
    const graph = wireGraph();
    seedProject("calculator", {
      userId: LOCAL_LEARNER_ID,
      labId: "calculator",
      currentStage: 2,
      passedStages: [1],
      drafts: { 2: dangling },
      draftRevisions: { 2: 7 },
      projectGeneration: 0,
      unlockedSubmodules: [{ name: "Lost", graph, custom: true }],
      runSummaries: {},
    });
    const transport = createLocalTransport(localStorage);
    expect(
      await transport.save("browser", "calculator", {
        stageIndex: 1,
        graph,
        components: [],
        expectedGeneration: 0,
        expectedRevision: 0,
        expectedComponentsRevision: 0,
      }),
    ).toMatchObject({ applied: true, revision: 1, componentsRevision: 1 });
    expect(storedProject("calculator")).toMatchObject({
      unlockedSubmodules: [],
      drafts: {
        1: graph,
        2: { nodes: dangling.nodes.filter((node) => node.kind !== "component"), edges: [] },
      },
      draftRevisions: { 1: 1, 2: 8, components: 1 },
    });
  });

  it("grades statistics locally and unlocks the next lesson only after a passing answer", async () => {
    const transport = createLocalTransport(localStorage);
    await expect(
      transport.judge("browser", "stats-foundations", {
        stageIndex: 2,
        draft: {},
        expectedGeneration: 0,
      }),
    ).rejects.toThrow("stage-locked");
    expect(
      await transport.judge("browser", "stats-foundations", {
        stageIndex: 1,
        draft: {
          slope: 3.2,
          intercept: -22,
          answer: STATS_FOUNDATIONS_STAGES[0].question!.correct,
        },
        expectedGeneration: 0,
      }),
    ).toMatchObject({ passed: true, passedStages: [1], currentStage: 2 });
  });

  it("uses the same seeded decoding payload for display and judgement", async () => {
    const transport = createLocalTransport(localStorage);
    const stage = DECODING_STAGES[0];
    const { expected } = generatePayload(stage, seedFor(LOCAL_LEARNER_ID, "decoding", 1));
    const conceptAnswers = Object.fromEntries(
      (stage.prompts ?? []).map((prompt) => [
        prompt.id,
        prompt.options.findIndex((option) => option.correct),
      ]),
    );
    expect(
      await transport.judge("browser", "decoding", {
        stageIndex: 1,
        artifact: expected,
        conceptAnswers,
        expectedGeneration: 0,
      }),
    ).toMatchObject({ passed: true });
  });

  it("supplies restaurant training and public final orders with consistent identifiers", async () => {
    const transport = createLocalTransport(localStorage);
    const training = trainingOrderFor(LOCAL_LEARNER_ID);
    expect(
      await transport.judge("browser", "lunch-shift", {
        stageIndex: 1,
        expectedGeneration: 0,
        draft: {
          step: "done",
          ticket: training.ticket,
          kitchenChoice: "urgent",
          deliveredTable: training.ticket.table,
        },
      }),
    ).toMatchObject({ passed: true });
    const project = await transport.load<LocalProject>("browser", "lunch-shift");
    expect(
      localSpecs["lunch-shift"].extras!({ ...project, passedStages: [1, 2, 3] }).aiOrders,
    ).toEqual(INTAKE_SCENARIO.orders.map(({ id, request }) => ({ id, request })));
  });

  it("stores lunch-shift stage-1 summaries without a literal undefined key", async () => {
    const transport = createLocalTransport(localStorage);
    const training = trainingOrderFor(LOCAL_LEARNER_ID);
    await transport.judge("browser", "lunch-shift", {
      stageIndex: 1,
      expectedGeneration: 0,
      draft: {
        step: "done",
        ticket: training.ticket,
        kitchenChoice: "urgent",
        deliveredTable: training.ticket.table,
      },
    });
    expect(storedProject("lunch-shift").runSummaries).toEqual({
      s1: { kind: "training", differences: [] },
    });
    await transport.reset("browser", "lunch-shift", {
      scope: "lab",
      expectedGeneration: 0,
    });
    expect(storedProject("lunch-shift").runSummaries).toEqual({});
  });

  it("reports storage write failures without claiming a saved draft", async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    } as unknown as Storage;
    await expect(
      createLocalTransport(storage).save("browser", "calculator", {
        stageIndex: 1,
        graph: wireGraph(),
        expectedGeneration: 0,
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: "local-storage-full" });
  });

  it("runs the restaurant mainline with public scenario data through final unlock", async () => {
    const transport = createLocalTransport(localStorage);
    const training = trainingOrderFor(LOCAL_LEARNER_ID);
    const priority = new Array<number>(PRIORITY_TABLE_SIZE);
    for (const urgent of [false, true])
      for (let wait = 0; wait <= 30; wait++)
        for (const cook of [1, 3])
          priority[priorityIndex(urgent, wait, cook)] = wait - (urgent ? 9 : 18);
    const results = INTAKE_SCENARIO.orders.map((order) => ({
      id: order.id,
      ticket: order.expected,
      confirmed: false,
    }));
    const drafts = [
      {
        step: "done",
        ticket: training.ticket,
        kitchenChoice: "urgent",
        deliveredTable: training.ticket.table,
      },
      { confirmCode: "def need_confirm(similarity, margin): return False", results },
      {
        priorityCode: "def priority(urgent, wait, cook): return wait - (9 if urgent else 18)",
        priority,
      },
      { results, priority },
    ];
    for (const [index, draft] of drafts.entries())
      expect(
        await transport.judge("browser", "lunch-shift", {
          stageIndex: index + 1,
          draft,
          expectedGeneration: 0,
        }),
      ).toMatchObject({ passed: true });
    expect(await createLocalTransport(localStorage).load("browser", "lunch-shift")).toMatchObject({
      passedStages: [1, 2, 3, 4],
    });
  });

  it("completes logistic regression including persisted training and the optional code stage", async () => {
    const transport = createLocalTransport(localStorage);
    const concepts = (stage: number) =>
      Object.fromEntries(
        LOGISTIC_REGRESSION_STAGES.find((entry) => entry.index === stage)!.prompts.map((prompt) => [
          prompt.id,
          prompt.correct,
        ]),
      );
    const drafts = [
      {
        weights: {
          中奖: 2,
          发票: 1,
          退款: 1,
          优惠: 1,
          妈妈: -2,
          开会: -1,
          老师: -1,
          今天: 0,
          明天: 0,
          通知: 0,
        },
        concepts: concepts(1),
      },
      {
        classifications: Object.fromEntries(
          TOKENIZE_PUZZLE_ITEMS.map((item) => [item.id, item.expected]),
        ),
        concepts: concepts(2),
      },
      {
        weights: {
          免费: 2.2,
          领取: 2,
          点击: 2,
          退订: 2,
          优惠: 2,
          同学: -2,
          明天: -1.6,
          一起: -1.6,
        },
        bias: -1,
        concepts: concepts(3),
      },
      { eta: 0.1, epochs: 12 },
      { activity: "sms-classification", exampleId: "promotion", prediction: 1 },
      { code: SGD_REFERENCE_CODE, concepts: concepts(6) },
    ];
    for (const [index, draft] of drafts.entries())
      expect(
        await transport.judge("browser", "logistic-regression", {
          stageIndex: index + 1,
          draft,
          expectedGeneration: 0,
        }),
      ).toMatchObject({ passed: true });
    expect(
      await createLocalTransport(localStorage).load("browser", "logistic-regression"),
    ).toMatchObject({
      passedStages: [1, 2, 3, 4, 5, 6],
      trainedSettings: { eta: 0.1, epochs: 12 },
    });
  });

  it.each([
    ["image-sampling", { width: 16, height: 16 }],
    ["color-quantization", { toners: [0, 1, 2, 3, 4, 5, 6, 7] }],
  ] as const)("grades %s with its public gallery", async (labId, input) => {
    const transport = createLocalTransport(localStorage);
    expect(
      await transport.judge("browser", labId, { ...input, stageIndex: 1, expectedGeneration: 0 }),
    ).toMatchObject({ passed: true, passedStages: [1] });
    expect(await createLocalTransport(localStorage).load("browser", labId)).toMatchObject({
      passedStages: [1],
      currentStage: 2,
    });
  });
});
