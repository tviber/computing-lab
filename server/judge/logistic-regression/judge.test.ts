import { describe, expect, it } from "vitest";
import { newId, openMemoryDb } from "../../db/client.ts";
import { getOrCreateProject } from "../pipeline.ts";
import { judgeLogisticRegressionSubmission } from "./judge.ts";
import {
  LOGISTIC_REGRESSION_STAGES,
  TOKENIZE_PUZZLE_ITEMS,
} from "../../../src/features/logistic-regression/domain/stages.ts";

const LAB_ID = "logistic-regression";

function setupProject(passedStages: number[] = []) {
  const db = openMemoryDb();
  db.prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)").run(
    newId(),
    "s1",
    "学生",
    "x",
  );
  const userId = (db.prepare("SELECT id FROM users").get() as { id: string }).id;
  const project = getOrCreateProject(db, userId, "class-1", LAB_ID);
  if (passedStages.length > 0) {
    db.prepare("UPDATE student_projects SET passed_stages = ?, current_stage = ? WHERE id = ?").run(
      JSON.stringify(passedStages),
      Math.max(...passedStages) + 1,
      project.id,
    );
    return { db, project: { ...project, passedStages } };
  }
  return { db, project };
}

function correctConcepts(stageIndex: number): Record<string, number> {
  const stage = LOGISTIC_REGRESSION_STAGES.find((s) => s.index === stageIndex)!;
  return Object.fromEntries(stage.prompts.map((p) => [p.id, p.correct]));
}

describe("logistic-regression judge", () => {
  it("gates locked stages until predecessors pass", () => {
    const { db, project } = setupProject([]);
    const blocked = judgeLogisticRegressionSubmission(db, project, 2, {});
    expect("error" in blocked && blocked.status).toBe(409);
  });

  it("judges stage 1 10-word strategy weights and diversity constraints authoritatively", () => {
    const { db, project } = setupProject([]);

    const posOnly = judgeLogisticRegressionSubmission(db, project, 1, {
      weights: { 中奖: 2, 发票: 2, 退款: 2, 优惠: 2 },
      concepts: correctConcepts(1),
    });
    expect("error" in posOnly).toBe(false);
    if ("error" in posOnly) return;
    expect(posOnly.passed).toBe(false);

    const noisyNeutral = judgeLogisticRegressionSubmission(db, project, 1, {
      weights: {
        中奖: 2,
        发票: 1,
        退款: 1,
        优惠: 1,
        妈妈: -2,
        开会: -1,
        老师: -1,
        今天: 1,
        通知: 1,
      },
      concepts: correctConcepts(1),
    });
    if (!("error" in noisyNeutral)) expect(noisyNeutral.passed).toBe(false);

    const ok = judgeLogisticRegressionSubmission(db, project, 1, {
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
      concepts: correctConcepts(1),
    });
    expect("error" in ok).toBe(false);
    if ("error" in ok) return;
    expect(ok.passed).toBe(true);
    expect(ok.score).toBe(9);
    expect(ok.total).toBe(9);
    expect(ok.passedStages).toEqual([1]);
    expect(ok.currentStage).toBe(2);
  });

  it("judges stage 2 token puzzle and concepts authoritatively", () => {
    const { db, project } = setupProject([1]);
    const classifications = Object.fromEntries(
      TOKENIZE_PUZZLE_ITEMS.map((item) => [item.id, item.expected]),
    );

    const partial = judgeLogisticRegressionSubmission(db, project, 2, {
      classifications: { ...classifications, "tok-5": "kept" },
      concepts: correctConcepts(2),
    });
    expect("error" in partial).toBe(false);
    if ("error" in partial) return;
    expect(partial.passed).toBe(false);
    expect(partial.score).toBe(9);

    const ok = judgeLogisticRegressionSubmission(db, project, 2, {
      classifications,
      concepts: correctConcepts(2),
    });
    expect("error" in ok).toBe(false);
    if ("error" in ok) return;
    expect(ok.passed).toBe(true);
    expect(ok.passedStages).toEqual([1, 2]);
    expect(ok.currentStage).toBe(3);
  });

  it("judges stage 3 manual weights including normal-message traps and empty baseline", () => {
    const { db, project } = setupProject([1, 2]);

    const trap = judgeLogisticRegressionSubmission(db, project, 3, {
      weights: { 免费: 2, 领取: 2, 点击: 2, 退订: 2, 优惠: 2, 同学: 0, 明天: 0, 一起: 0 },
      bias: -1,
      concepts: correctConcepts(3),
    });
    expect("error" in trap).toBe(false);
    if ("error" in trap) return;
    expect(trap.passed).toBe(false);

    const badPrior = judgeLogisticRegressionSubmission(db, project, 3, {
      weights: { 免费: 2.2, 领取: 2, 点击: 2, 退订: 2, 优惠: 2, 同学: -2.4, 明天: -2, 一起: -2 },
      bias: 0.4,
      concepts: correctConcepts(3),
    });
    expect("error" in badPrior).toBe(false);
    if ("error" in badPrior) return;
    expect(badPrior.passed).toBe(false);

    const pass = judgeLogisticRegressionSubmission(db, project, 3, {
      weights: { 免费: 2.2, 领取: 2, 点击: 2, 退订: 2, 优惠: 2, 同学: -2, 明天: -1.6, 一起: -1.6 },
      bias: -1,
      concepts: correctConcepts(3),
    });
    expect("error" in pass).toBe(false);
    if ("error" in pass) return;
    expect(pass.passed).toBe(true);
    expect(pass.passedStages).toEqual([1, 2, 3]);
  });

  it("judges stage 4 gradient descent convergence vs slow/volatile eta", () => {
    const { db, project } = setupProject([1, 2, 3]);

    const tooSlow = judgeLogisticRegressionSubmission(db, project, 4, {
      eta: 0.002,
      epochs: 12,
    });
    if (!("error" in tooSlow)) expect(tooSlow.passed).toBe(false);

    const tooBig = judgeLogisticRegressionSubmission(db, project, 4, {
      eta: 5.0,
      epochs: 12,
    });
    if (!("error" in tooBig)) expect(tooBig.passed).toBe(false);

    const pass = judgeLogisticRegressionSubmission(db, project, 4, {
      eta: 0.1,
      epochs: 12,
    });
    expect("error" in pass).toBe(false);
    if ("error" in pass) return;
    expect(pass.passed).toBe(true);
    expect(pass.total).toBe(2);
    expect(pass.trainedSettings).toEqual({ eta: 0.1, epochs: 12 });
    expect(pass.passedStages).toEqual([1, 2, 3, 4]);
  });

  it("validates a public example against the trained model and records only completion", () => {
    const { db, project } = setupProject([1, 2, 3, 4]);
    expect(judgeLogisticRegressionSubmission(db, project, 5, { threshold: 0.4 })).toMatchObject({
      error: "invalid-activity",
    });
    expect(judgeLogisticRegressionSubmission(db, project, 6, {})).toMatchObject({
      error: "unknown-stage",
    });
    const activity = { activity: "sms-classification", exampleId: "promotion", prediction: 1 };
    expect(
      judgeLogisticRegressionSubmission(db, { ...project, passedStages: [] }, 5, activity),
    ).toMatchObject({ error: "stage-locked" });
    expect(
      judgeLogisticRegressionSubmission(db, project, 4, { eta: 0.1, epochs: 12 }),
    ).toMatchObject({ passed: true });
    for (const draft of [
      { activity: "sms-classification" },
      { ...activity, exampleId: "arbitrary" },
      { ...activity, prediction: 0 },
      { ...activity, prediction: "1" },
    ]) {
      expect(judgeLogisticRegressionSubmission(db, project, 5, draft)).toEqual({
        error: "invalid-activity",
        status: 400,
      });
    }
    expect(db.prepare("SELECT * FROM submissions WHERE stage_index = 5").get()).toBeUndefined();
    const outcome = judgeLogisticRegressionSubmission(db, project, 5, {
      ...activity,
      probeText: "试一条短信",
    });
    expect(outcome).toMatchObject({
      passed: true,
      score: 1,
      total: 1,
      currentStage: 6,
      passedStages: [1, 2, 3, 4, 5],
    });
    expect(
      db.prepare("SELECT snapshot_graph FROM submissions WHERE stage_index = 5").get(),
    ).toMatchObject({ snapshot_graph: JSON.stringify({ activity: "sms-classification" }) });
  });
});
