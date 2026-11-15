/**
 * Authoritative server-side judge for the ml-intro lab across all 5 stages.
 * Re-runs deterministic scoring & SGD training server-side and grades Stage 5
 * against the held-out 300-SMS corpus in hiddenCorpus.ts without leaking any
 * hidden message text back to the browser.
 */

import type { DatabaseSync } from "node:sqlite";
import {
  alwaysZeroBaseline,
  evaluateManualWeights,
  evaluateModelOnMessages,
  MAX_SAMPLE_SIZE,
  trainLogisticRegression,
} from "../../../src/features/ml-intro/domain/logreg.ts";
import type {
  MlJudgeResult,
  MlPartSummary,
  MlTestSummary,
} from "../../../src/features/ml-intro/domain/protocol.ts";
import {
  getMlStage,
  mlStageUnlocked,
  nextMlStage,
  STAGE1_PUZZLE_ITEMS,
  STAGE2_CALIBRATION_SMS,
  STAGE3_MAX_TRAIN_LOSS,
  STAGE3_MAX_VAL_LOSS,
  STAGE4_MIN_ACCURACY,
  STAGE4_MIN_PRECISION,
  STAGE4_MIN_RECALL,
  STAGE5_MAX_VAL_LOSS,
  STAGE5_MIN_TEST_ACCURACY,
  STAGE5_MIN_TEST_PRECISION,
  STAGE5_MIN_TEST_RECALL,
  type ConceptPrompt,
} from "../../../src/features/ml-intro/domain/stages.ts";
import {
  sanitizeEvaluateDraft,
  sanitizeGeneralizeDraft,
  sanitizeScoreDraft,
  sanitizeTokenizeDraft,
  sanitizeTrainDraft,
} from "../../../src/features/ml-intro/lesson/state.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";
import { getHiddenTestMessages } from "./hiddenSet.ts";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function checkConcepts(
  prompts: readonly ConceptPrompt[],
  answers: Readonly<Record<string, number>>,
): { correct: number; total: number; ok: boolean; part: MlPartSummary } {
  let correct = 0;
  for (const prompt of prompts) {
    if (answers[prompt.id] === prompt.correct) correct++;
  }
  const total = prompts.length;
  const ok = correct === total;
  return {
    correct,
    total,
    ok,
    part: {
      id: "concepts",
      label: "概念检查",
      ok,
      detail: ok
        ? `${correct} / ${total} 题全对`
        : `答对 ${correct} / ${total} 题，请完成全部概念检查`,
    },
  };
}

export function judgeMlIntroSubmission(
  db: DatabaseSync,
  project: ProjectRow<unknown>,
  stageIndex: number,
  rawDraft: unknown,
): MlJudgeResult | LabJudgeError {
  const gated = gateStage(getMlStage(stageIndex), (item) =>
    mlStageUnlocked(project.passedStages, item.index),
  );
  if ("error" in gated) return gated;
  const { stage } = gated;

  let score = 0;
  let total = 0;
  let passed = false;
  let testSummary: MlTestSummary;
  let snapshot: unknown;

  if (stageIndex === 1) {
    const draft = sanitizeTokenizeDraft(rawDraft);
    snapshot = draft;
    let tokCorrect = 0;
    for (const item of STAGE1_PUZZLE_ITEMS) {
      if (draft.classifications[item.id] === item.expected) tokCorrect++;
    }
    const tokTotal = STAGE1_PUZZLE_ITEMS.length;
    const tokOk = tokCorrect === tokTotal;
    const conceptCheck = checkConcepts(stage.prompts, draft.concepts);
    score = tokCorrect + conceptCheck.correct;
    total = tokTotal + conceptCheck.total;
    passed = tokOk && conceptCheck.ok;
    const parts: MlPartSummary[] = [
      {
        id: "tokens",
        label: "切词与特征归类",
        ok: tokOk,
        detail: tokOk
          ? `${tokCorrect} / ${tokTotal} 个片段归类正确`
          : `已对 ${tokCorrect} / ${tokTotal} 个片段，请再检查重复词、标点和 OOV`,
      },
      conceptCheck.part,
    ];
    testSummary = {
      parts,
      detail: passed
        ? "文本特征抽取与词袋规则全对，解锁第 2 关。"
        : "特征归类或概念题尚未全部通过。",
    };
  } else if (stageIndex === 2) {
    const draft = sanitizeScoreDraft(rawDraft);
    snapshot = draft;
    const evalRes = evaluateManualWeights(draft.weights, draft.bias, STAGE2_CALIBRATION_SMS, 0.5);
    const smsOk = evalRes.correctCount === STAGE2_CALIBRATION_SMS.length;
    const priorOk = evalRes.emptyProbability < 0.5;
    const conceptCheck = checkConcepts(stage.prompts, draft.concepts);
    score = evalRes.correctCount + (priorOk ? 1 : 0) + conceptCheck.correct;
    total = STAGE2_CALIBRATION_SMS.length + 1 + conceptCheck.total;
    passed = smsOk && priorOk && conceptCheck.ok;
    const wrongTags = evalRes.items
      .filter((item) => !item.correct)
      .map((item) => STAGE2_CALIBRATION_SMS.find((m) => m.id === item.id)?.tag ?? item.id);
    const parts: MlPartSummary[] = [
      {
        id: "calibration",
        label: "6 条分诊短信分类",
        ok: smsOk,
        detail: smsOk
          ? "6 / 6 条全部分对"
          : `${evalRes.correctCount} / 6 条分对（未过：${wrongTags.join("、")}）`,
      },
      {
        id: "prior",
        label: "无特征短信先验基线",
        ok: priorOk,
        detail: priorOk
          ? `偏置 b = ${draft.bias.toFixed(1)}（空消息概率 ${pct(evalRes.emptyProbability)} < 50%）`
          : `偏置 b = ${draft.bias.toFixed(1)} ≥ 0 会导致全是新词的短信被默认判为垃圾`,
      },
      conceptCheck.part,
    ];
    testSummary = {
      parts,
      detail: passed
        ? "正负词权与偏置搭配成功，接下来看机器如何自动学会这些权重。"
        : "请调整权重和偏置让 6 条短信与空消息基线都达标。",
    };
  } else if (stageIndex === 3) {
    const draft = sanitizeTrainDraft(rawDraft);
    snapshot = draft;
    const run = trainLogisticRegression({
      trainCount: MAX_SAMPLE_SIZE,
      eta: draft.eta,
      epochs: draft.epochs,
      threshold: 0.5,
    });
    const finalEpoch = run.epochsHistory[run.epochsHistory.length - 1];
    const trOk = finalEpoch.trainLoss <= STAGE3_MAX_TRAIN_LOSS;
    const valOk = finalEpoch.valLoss <= STAGE3_MAX_VAL_LOSS;
    const conceptCheck = checkConcepts(stage.prompts, draft.concepts);
    score = (trOk ? 1 : 0) + (valOk ? 1 : 0) + conceptCheck.correct;
    total = 2 + conceptCheck.total;
    passed = trOk && valOk && conceptCheck.ok;
    const parts: MlPartSummary[] = [
      {
        id: "train-loss",
        label: "训练损失收敛 (≤ 0.08)",
        ok: trOk,
        detail: `当前训练损失 ${finalEpoch.trainLoss.toFixed(4)}`,
      },
      {
        id: "val-loss",
        label: "验证损失收敛 (≤ 0.12)",
        ok: valOk,
        detail: `当前验证损失 ${finalEpoch.valLoss.toFixed(4)}（盲猜基线 0.6931）`,
      },
      conceptCheck.part,
    ];
    testSummary = {
      parts,
      metrics: {
        ...finalEpoch.valMetrics,
        trainLoss: finalEpoch.trainLoss,
        baselineAcc: run.baselineAcc,
      },
      detail: passed
        ? `η=${draft.eta}、${draft.epochs} 轮训练收敛良好（验证损失 ${finalEpoch.valLoss.toFixed(3)}）。`
        : `当前训练/验证损失尚未压到目标线（η=${draft.eta}，${draft.epochs} 轮）。`,
    };
  } else if (stageIndex === 4) {
    const draft = sanitizeEvaluateDraft(rawDraft);
    snapshot = draft;
    const run = trainLogisticRegression({
      trainCount: MAX_SAMPLE_SIZE,
      eta: draft.eta,
      epochs: draft.epochs,
      threshold: draft.threshold,
    });
    const m = run.finalMetrics;
    const accOk = m.accuracy >= STAGE4_MIN_ACCURACY;
    const precOk = m.precision >= STAGE4_MIN_PRECISION;
    const recOk = m.recall >= STAGE4_MIN_RECALL;
    const conceptCheck = checkConcepts(stage.prompts, draft.concepts);
    score = (accOk ? 1 : 0) + (precOk ? 1 : 0) + (recOk ? 1 : 0) + conceptCheck.correct;
    total = 3 + conceptCheck.total;
    passed = accOk && precOk && recOk && conceptCheck.ok;
    const parts: MlPartSummary[] = [
      {
        id: "accuracy",
        label: "准确率超越基线 (≥ 95.0%)",
        ok: accOk,
        detail: `准确率 ${pct(m.accuracy)}（全猜正常基线 ${pct(run.baselineAcc)}）`,
      },
      {
        id: "precision",
        label: "查准率 Precision (≥ 90.0%)",
        ok: precOk,
        detail: `${pct(m.precision)}（真垃圾 ${m.tp}，误杀正常 ${m.fp}）`,
      },
      {
        id: "recall",
        label: "查全率 Recall (≥ 80.0%)",
        ok: recOk,
        detail: `${pct(m.recall)}（抓到 ${m.tp}，漏网 ${m.fn}）`,
      },
      conceptCheck.part,
    ];
    testSummary = {
      parts,
      metrics: {
        ...m,
        baselineAcc: run.baselineAcc,
      },
      detail: passed
        ? `验证集达到 Accuracy ${pct(m.accuracy)}、Precision ${pct(m.precision)}、Recall ${pct(m.recall)}。`
        : `阈值 τ=${draft.threshold.toFixed(2)} 下指标未全部达标（Precision 需 ≥90%，Recall 需 ≥80%）。`,
    };
  } else {
    const draft = sanitizeGeneralizeDraft(rawDraft);
    snapshot = draft;
    const run = trainLogisticRegression({
      trainCount: draft.sampleSize,
      eta: draft.eta,
      epochs: draft.epochs,
      threshold: draft.threshold,
    });
    const hiddenMessages = getHiddenTestMessages();
    const hiddenEval = evaluateModelOnMessages(run.finalModel, hiddenMessages, draft.threshold);
    const hm = hiddenEval.metrics;
    const hiddenBaseline = alwaysZeroBaseline(hiddenMessages);

    const valLossOk = run.finalMetrics.loss <= STAGE5_MAX_VAL_LOSS;
    const testAccOk = hm.accuracy >= STAGE5_MIN_TEST_ACCURACY;
    const testPrecOk = hm.precision >= STAGE5_MIN_TEST_PRECISION;
    const testRecOk = hm.recall >= STAGE5_MIN_TEST_RECALL;
    const conceptCheck = checkConcepts(stage.prompts, draft.concepts);
    score =
      (valLossOk ? 1 : 0) +
      (testAccOk ? 1 : 0) +
      (testPrecOk ? 1 : 0) +
      (testRecOk ? 1 : 0) +
      conceptCheck.correct;
    total = 4 + conceptCheck.total;
    passed = valLossOk && testAccOk && testPrecOk && testRecOk && conceptCheck.ok;

    const parts: MlPartSummary[] = [
      {
        id: "val-loss",
        label: "验证损失稳定 (≤ 0.14)",
        ok: valLossOk,
        detail: `训练样本 ${draft.sampleSize} 条，验证损失 ${run.finalMetrics.loss.toFixed(3)}，验证 OOV ${pct(run.finalMetrics.oovRate)}`,
      },
      {
        id: "test-accuracy",
        label: "隐藏测试集准确率 (≥ 94.5%)",
        ok: testAccOk,
        detail: `盲测准确率 ${pct(hm.accuracy)}（盲猜基线 ${pct(hiddenBaseline)}，盲测 OOV ${pct(hm.oovRate)}）`,
      },
      {
        id: "test-precision",
        label: "隐藏测试集 Precision (≥ 85.0%)",
        ok: testPrecOk,
        detail: `盲测 Precision ${pct(hm.precision)}（误杀正常 ${hm.fp} 条）`,
      },
      {
        id: "test-recall",
        label: "隐藏测试集 Recall (≥ 75.0%)",
        ok: testRecOk,
        detail: `盲测 Recall ${pct(hm.recall)}（拦住 ${hm.tp} / ${hm.tp + hm.fn} 条真垃圾）`,
      },
      conceptCheck.part,
    ];
    testSummary = {
      parts,
      metrics: {
        ...hm,
        trainLoss: run.epochsHistory[run.epochsHistory.length - 1].trainLoss,
        baselineAcc: hiddenBaseline,
      },
      detail: passed
        ? `300 条盲测通过：准确率 ${pct(hm.accuracy)}、Precision ${pct(hm.precision)}、Recall ${pct(hm.recall)}（OOV ${pct(hm.oovRate)}）。`
        : `隐藏测试集尚未全部达标（样本数=${draft.sampleSize}，准确率 ${pct(hm.accuracy)}，Precision ${pct(hm.precision)}，Recall ${pct(hm.recall)}）。`,
    };
  }

  const result: MlJudgeResult = {
    passed,
    score,
    total,
    testSummary,
    submissionId: "",
    currentStage: project.currentStage,
    passedStages: project.passedStages,
  };

  withTransaction(db, () => {
    result.submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot,
      score,
      total,
      passed,
      testSummary,
    });
    if (passed) {
      const progress = advanceStage(db, project, stageIndex, nextMlStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  return result;
}
