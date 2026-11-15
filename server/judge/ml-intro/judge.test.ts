import { describe, expect, it } from "vitest";
import { newId, openMemoryDb } from "../../db/client.ts";
import { getOrCreateProject } from "../pipeline.ts";
import { judgeMlIntroSubmission } from "./judge.ts";
import {
  evaluateModelOnMessages,
  trainLogisticRegression,
} from "../../../src/features/ml-intro/domain/logreg.ts";
import { ML_STAGES, TOKENIZE_PUZZLE_ITEMS } from "../../../src/features/ml-intro/domain/stages.ts";
import { HIDDEN_TEST_ROWS } from "./hiddenCorpus.ts";
import { getHiddenTestMessages } from "./hiddenSet.ts";

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

  it("judges stage 1 10-word strategy weights and diversity constraints authoritatively", () => {
    const { db, project } = setupProject([]);

    // Positive-only blacklist weights fail ham trap and balance check.
    const posOnly = judgeMlIntroSubmission(db, project, 1, {
      weights: { 中奖: 2, 发票: 2, 退款: 2, 优惠: 2 },
      concepts: correctConcepts(1),
    });
    expect("error" in posOnly).toBe(false);
    if ("error" in posOnly) return;
    expect(posOnly.passed).toBe(false);

    // Turning neutral words positive misfires on purely neutral SMS.
    const noisyNeutral = judgeMlIntroSubmission(db, project, 1, {
      weights: {
        中奖: 3,
        发票: 2,
        退款: 2,
        优惠: 2,
        妈妈: -3,
        开会: -2,
        老师: -2,
        今天: 1,
        通知: 1,
      },
      concepts: correctConcepts(1),
    });
    if (!("error" in noisyNeutral)) expect(noisyNeutral.passed).toBe(false);

    const ok = judgeMlIntroSubmission(db, project, 1, {
      weights: {
        中奖: 3,
        发票: 2,
        退款: 2,
        优惠: 2,
        妈妈: -3,
        开会: -2,
        老师: -2,
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

    const partial = judgeMlIntroSubmission(db, project, 2, {
      classifications: { ...classifications, "tok-5": "kept" },
      concepts: correctConcepts(2),
    });
    expect("error" in partial).toBe(false);
    if ("error" in partial) return;
    expect(partial.passed).toBe(false);
    expect(partial.score).toBe(9);

    const ok = judgeMlIntroSubmission(db, project, 2, {
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

    // Keyword-only weights fail on ham traps.
    const trap = judgeMlIntroSubmission(db, project, 3, {
      weights: { 免费: 2, 领取: 2, 点击: 2, 退订: 2, 优惠: 2, 同学: 0, 明天: 0, 一起: 0 },
      bias: -1,
      concepts: correctConcepts(3),
    });
    expect("error" in trap).toBe(false);
    if ("error" in trap) return;
    expect(trap.passed).toBe(false);

    // Positive bias fails empty-message prior check.
    const badPrior = judgeMlIntroSubmission(db, project, 3, {
      weights: { 免费: 2.2, 领取: 2, 点击: 2, 退订: 2, 优惠: 2, 同学: -2.4, 明天: -2, 一起: -2 },
      bias: 0.4,
      concepts: correctConcepts(3),
    });
    expect("error" in badPrior).toBe(false);
    if ("error" in badPrior) return;
    expect(badPrior.passed).toBe(false);

    const pass = judgeMlIntroSubmission(db, project, 3, {
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

    const tooSlow = judgeMlIntroSubmission(db, project, 4, {
      eta: 0.002,
      epochs: 12,
      concepts: correctConcepts(4),
    });
    if (!("error" in tooSlow)) expect(tooSlow.passed).toBe(false);

    const tooBig = judgeMlIntroSubmission(db, project, 4, {
      eta: 5.0,
      epochs: 12,
      concepts: correctConcepts(4),
    });
    if (!("error" in tooBig)) expect(tooBig.passed).toBe(false);

    const pass = judgeMlIntroSubmission(db, project, 4, {
      eta: 0.1,
      epochs: 12,
      concepts: correctConcepts(4),
    });
    expect("error" in pass).toBe(false);
    if ("error" in pass) return;
    expect(pass.passed).toBe(true);
    expect(pass.passedStages).toEqual([1, 2, 3, 4]);
  });

  it("judges stage 5 confusion matrix metrics against imbalance baseline", () => {
    const { db, project } = setupProject([1, 2, 3, 4]);

    const strictFailRecall = judgeMlIntroSubmission(db, project, 5, {
      eta: 0.1,
      epochs: 12,
      threshold: 0.9,
      concepts: correctConcepts(5),
    });
    if (!("error" in strictFailRecall)) expect(strictFailRecall.passed).toBe(false);

    const looseFailPrecision = judgeMlIntroSubmission(db, project, 5, {
      eta: 0.1,
      epochs: 12,
      threshold: 0.05,
      concepts: correctConcepts(5),
    });
    if (!("error" in looseFailPrecision)) expect(looseFailPrecision.passed).toBe(false);

    const pass = judgeMlIntroSubmission(db, project, 5, {
      eta: 0.1,
      epochs: 12,
      threshold: 0.4,
      concepts: correctConcepts(5),
    });
    expect("error" in pass).toBe(false);
    if ("error" in pass) return;
    expect(pass.passed).toBe(true);
    expect(pass.passedStages).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps held-out server corpus free of unredacted PII and classroom-unsafe text", () => {
    const patterns = [
      /(?<!\d)1[3-9]\d{9}(?!\d)/,
      /(?<!\d)1\d{2}[x*]{4}\d{2,4}/i,
      /(?<!\d)[48]00[-\s]?\d{3}[-\s]?\d{4}/,
      /https?:\/\/|www\./i,
      /强奸|强暴|乱伦|轮奸|他妈|操你|滚蛋|蠢货/,
    ];
    expect(HIDDEN_TEST_ROWS).toHaveLength(300);
    for (const row of HIDDEN_TEST_ROWS) {
      const text = row.split("\t")[1] ?? "";
      for (const re of patterns) {
        expect(text, `hidden row matched ${re}: ${text}`).not.toMatch(re);
      }
    }
  });

  it("grades stage 6 generalization on the held-out corpus without leaking test metrics or texts", () => {
    const { db, project } = setupProject([1, 2, 3, 4, 5]);
    const hiddenMessages = getHiddenTestMessages();

    const overfitSmall = judgeMlIntroSubmission(db, project, 6, {
      sampleSize: 150,
      eta: 0.1,
      epochs: 15,
      threshold: 0.4,
      concepts: correctConcepts(6),
    });
    expect("error" in overfitSmall).toBe(false);
    if (!("error" in overfitSmall)) {
      expect(overfitSmall.passed).toBe(false);
      expect(overfitSmall.testSummary.parts.map((p) => p.id)).toEqual([
        "val-loss",
        "hidden-blind-exam",
        "concepts",
      ]);
    }

    const borderlineFail = judgeMlIntroSubmission(db, project, 6, {
      sampleSize: 1400,
      eta: 0.1,
      epochs: 12,
      threshold: 0.9,
      concepts: correctConcepts(6),
    });
    expect("error" in borderlineFail).toBe(false);
    if ("error" in borderlineFail) return;
    expect(borderlineFail.passed).toBe(false);
    expect(borderlineFail.testSummary.parts[0]).toMatchObject({ id: "val-loss", ok: true });
    expect(borderlineFail.testSummary.parts[1]).toMatchObject({
      id: "hidden-blind-exam",
      ok: false,
    });

    const pass = judgeMlIntroSubmission(db, project, 6, {
      sampleSize: 1400,
      eta: 0.1,
      epochs: 15,
      threshold: 0.4,
      concepts: correctConcepts(6),
    });
    expect("error" in pass).toBe(false);
    if ("error" in pass) return;
    expect(pass.passed).toBe(true);
    expect(pass.passedStages).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pass.testSummary.parts.map((p) => p.id)).toEqual([
      "val-loss",
      "hidden-blind-exam",
      "concepts",
    ]);

    const expectedVal = trainLogisticRegression({
      trainCount: 1400,
      eta: 0.1,
      epochs: 15,
      threshold: 0.4,
    });
    const hiddenEval = evaluateModelOnMessages(expectedVal.finalModel, hiddenMessages, 0.4);
    expect(pass.testSummary.metrics?.accuracy).toBeCloseTo(expectedVal.finalMetrics.accuracy, 10);
    expect(pass.testSummary.metrics?.recall).toBeCloseTo(expectedVal.finalMetrics.recall, 10);
    expect(pass.testSummary.metrics?.tp).toBe(expectedVal.finalMetrics.tp);

    const serializedPass = JSON.stringify(pass.testSummary);
    const serializedFail = JSON.stringify(borderlineFail.testSummary);
    const hiddenAccPct = `${(hiddenEval.metrics.accuracy * 100).toFixed(1)}%`;
    const hiddenRecPct = `${(hiddenEval.metrics.recall * 100).toFixed(1)}%`;
    if (hiddenAccPct !== `${(expectedVal.finalMetrics.accuracy * 100).toFixed(1)}%`) {
      expect(serializedPass).not.toContain(hiddenAccPct);
    }
    if (hiddenRecPct !== `${(expectedVal.finalMetrics.recall * 100).toFixed(1)}%`) {
      expect(serializedPass).not.toContain(hiddenRecPct);
    }
    expect(serializedPass).not.toContain("test-accuracy");
    expect(serializedFail).not.toContain("test-precision");
    for (const msg of hiddenMessages) {
      if (msg.text.length >= 12) {
        expect(serializedPass).not.toContain(msg.text.slice(0, 12));
        expect(serializedFail).not.toContain(msg.text.slice(0, 12));
      }
    }
  });
});
