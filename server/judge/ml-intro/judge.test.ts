import { describe, expect, it } from "vitest";
import { newId, openMemoryDb } from "../../db/client.ts";
import { getOrCreateProject } from "../pipeline.ts";
import { judgeMlIntroSubmission } from "./judge.ts";
import { ML_STAGES, STAGE1_PUZZLE_ITEMS } from "../../../src/features/ml-intro/domain/stages.ts";

const LAB_ID = "ml-intro";

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
  const stage = ML_STAGES.find((s) => s.index === stageIndex)!;
  return Object.fromEntries(stage.prompts.map((p) => [p.id, p.correct]));
}

describe("ml-intro judge", () => {
  it("gates locked stages until predecessors pass", () => {
    const { db, project } = setupProject([]);
    const blocked = judgeMlIntroSubmission(db, project, 2, {});
    expect("error" in blocked && blocked.status).toBe(409);
  });

  it("judges stage 1 token puzzle and concepts authoritatively", () => {
    const { db, project } = setupProject([]);
    const classifications = Object.fromEntries(
      STAGE1_PUZZLE_ITEMS.map((item) => [item.id, item.expected]),
    );

    const partial = judgeMlIntroSubmission(db, project, 1, {
      classifications: { ...classifications, "tok-5": "kept" },
      concepts: correctConcepts(1),
    });
    expect("error" in partial).toBe(false);
    if ("error" in partial) return;
    expect(partial.passed).toBe(false);
    expect(partial.score).toBe(9);

    const ok = judgeMlIntroSubmission(db, project, 1, {
      classifications,
      concepts: correctConcepts(1),
    });
    expect("error" in ok).toBe(false);
    if ("error" in ok) return;
    expect(ok.passed).toBe(true);
    expect(ok.passedStages).toEqual([1]);
    expect(ok.currentStage).toBe(2);
  });

  it("judges stage 2 manual weights including normal-message traps and empty baseline", () => {
    const { db, project } = setupProject([1]);

    // Keyword-only weights fail on ham traps.
    const trap = judgeMlIntroSubmission(db, project, 2, {
      weights: { 免费: 2, 领取: 2, 点击: 2, 退订: 2, 优惠: 2, 同学: 0, 明天: 0, 一起: 0 },
      bias: -1,
      concepts: correctConcepts(2),
    });
    expect("error" in trap).toBe(false);
    if ("error" in trap) return;
    expect(trap.passed).toBe(false);

    // Positive bias fails empty-message prior check.
    const badPrior = judgeMlIntroSubmission(db, project, 2, {
      weights: { 免费: 2.2, 领取: 2, 点击: 2, 退订: 2, 优惠: 2, 同学: -2.4, 明天: -2, 一起: -2 },
      bias: 0.4,
      concepts: correctConcepts(2),
    });
    expect("error" in badPrior).toBe(false);
    if ("error" in badPrior) return;
    expect(badPrior.passed).toBe(false);

    const pass = judgeMlIntroSubmission(db, project, 2, {
      weights: { 免费: 2.2, 领取: 2, 点击: 2, 退订: 2, 优惠: 2, 同学: -2, 明天: -1.6, 一起: -1.6 },
      bias: -1,
      concepts: correctConcepts(2),
    });
    expect("error" in pass).toBe(false);
    if ("error" in pass) return;
    expect(pass.passed).toBe(true);
    expect(pass.passedStages).toEqual([1, 2]);
  });

  it("judges stage 3 gradient descent convergence vs slow/volatile eta", () => {
    const { db, project } = setupProject([1, 2]);

    const tooSlow = judgeMlIntroSubmission(db, project, 3, {
      eta: 0.002,
      epochs: 12,
      concepts: correctConcepts(3),
    });
    if (!("error" in tooSlow)) expect(tooSlow.passed).toBe(false);

    const tooBig = judgeMlIntroSubmission(db, project, 3, {
      eta: 4.0,
      epochs: 12,
      concepts: correctConcepts(3),
    });
    if (!("error" in tooBig)) expect(tooBig.passed).toBe(false);

    const pass = judgeMlIntroSubmission(db, project, 3, {
      eta: 0.1,
      epochs: 12,
      concepts: correctConcepts(3),
    });
    expect("error" in pass).toBe(false);
    if ("error" in pass) return;
    expect(pass.passed).toBe(true);
    expect(pass.passedStages).toEqual([1, 2, 3]);
  });

  it("judges stage 4 confusion matrix metrics against imbalance baseline", () => {
    const { db, project } = setupProject([1, 2, 3]);

    const strictFailRecall = judgeMlIntroSubmission(db, project, 4, {
      eta: 0.1,
      epochs: 12,
      threshold: 0.9,
      concepts: correctConcepts(4),
    });
    if (!("error" in strictFailRecall)) expect(strictFailRecall.passed).toBe(false);

    const looseFailPrecision = judgeMlIntroSubmission(db, project, 4, {
      eta: 0.1,
      epochs: 12,
      threshold: 0.05,
      concepts: correctConcepts(4),
    });
    if (!("error" in looseFailPrecision)) expect(looseFailPrecision.passed).toBe(false);

    const pass = judgeMlIntroSubmission(db, project, 4, {
      eta: 0.1,
      epochs: 12,
      threshold: 0.4,
      concepts: correctConcepts(4),
    });
    expect("error" in pass).toBe(false);
    if ("error" in pass) return;
    expect(pass.passed).toBe(true);
    expect(pass.passedStages).toEqual([1, 2, 3, 4]);
  });

  it("judges stage 5 generalization strictly on the held-out server corpus", () => {
    const { db, project } = setupProject([1, 2, 3, 4]);

    const overfitSmall = judgeMlIntroSubmission(db, project, 5, {
      sampleSize: 150,
      eta: 0.1,
      epochs: 15,
      threshold: 0.4,
      concepts: correctConcepts(5),
    });
    if (!("error" in overfitSmall)) expect(overfitSmall.passed).toBe(false);

    const pass = judgeMlIntroSubmission(db, project, 5, {
      sampleSize: 1400,
      eta: 0.1,
      epochs: 15,
      threshold: 0.4,
      concepts: correctConcepts(5),
    });
    expect("error" in pass).toBe(false);
    if ("error" in pass) return;
    expect(pass.passed).toBe(true);
    expect(pass.passedStages).toEqual([1, 2, 3, 4, 5]);
    expect(JSON.stringify(pass.testSummary)).not.toContain("梅龙镇伊势丹");
  });
});
