/**
 * Authoritative server-side judge for the ml-intro lab across all 6 stages.
 * Re-runs deterministic scoring & SGD training server-side and grades Stage 6
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
  EVAL_MIN_ACCURACY,
  EVAL_MIN_PRECISION,
  EVAL_MIN_RECALL,
  GENERALIZE_MAX_VAL_LOSS,
  GENERALIZE_MIN_TEST_ACCURACY,
  GENERALIZE_MIN_TEST_PRECISION,
  GENERALIZE_MIN_TEST_RECALL,
  getMlStage,
  mlStageUnlocked,
  nextMlStage,
  SCORE_CALIBRATION_SMS,
  TOKENIZE_PUZZLE_ITEMS,
  TRAIN_MAX_TRAIN_LOSS,
  TRAIN_MAX_VAL_LOSS,
  type ConceptPrompt,
} from "../../../src/features/ml-intro/domain/stages.ts";
import { evaluateStrategyWeights } from "../../../src/features/ml-intro/domain/strategy.ts";
import {
  sanitizeEvaluateDraft,
  sanitizeGeneralizeDraft,
  sanitizeScoreDraft,
  sanitizeStrategyDraft,
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
  options?: { bypassLock?: boolean },
): MlJudgeResult | LabJudgeError {
  const gated = gateStage(
    getMlStage(stageIndex),
    (item) => mlStageUnlocked(project.passedStages, item.index),
    options,
  );
  if ("error" in gated) return gated;
  const { stage } = gated;

  let score = 0;
  let total = 0;
  let passed = false;
  let testSummary: MlTestSummary;
  let snapshot: unknown;

  if (stageIndex === 1) {
    const draft = sanitizeStrategyDraft(rawDraft);
    snapshot = draft;
    const evalRes = evaluateStrategyWeights(draft.weights);
    const smsOk = evalRes.correctCount === evalRes.totalCount;
    const diversityOk = evalRes.positiveWordCount >= 2 && evalRes.negativeWordCount >= 2;
    const conceptCheck = checkConcepts(stage.prompts, draft.concepts);
    score = evalRes.correctCount + (diversityOk ? 1 : 0) + conceptCheck.correct;
    total = evalRes.totalCount + 1 + conceptCheck.total;
    passed = smsOk && diversityOk && conceptCheck.ok;
    const wrongTags = evalRes.items.filter((item) => !item.ok).map((item) => item.message.tag);
    const parts: MlPartSummary[] = [
      {
        id: "strategy-sms",
        label: "6 条示例短信分类",
        ok: smsOk,
        detail: smsOk
          ? `${evalRes.correctCount} / ${evalRes.totalCount} 条全部分对`
          : `${evalRes.correctCount} / ${evalRes.totalCount} 条分对（未过：${wrongTags.join("、")}）`,
      },
      {
        id: "strategy-balance",
        label: "正分词和负分词的数量",
        ok: diversityOk,
        detail: diversityOk
          ? `你设置了 ${evalRes.positiveWordCount} 个正分词、${evalRes.negativeWordCount} 个负分词`
          : `请至少设置 2 个正分词和 2 个负分词（当前正分 ${evalRes.positiveWordCount} 个、负分 ${evalRes.negativeWordCount} 个）`,
      },
      conceptCheck.part,
    ];
    testSummary = {
      parts,
      detail: passed
        ? "你的规则分对了全部示例短信。你可以进入第 2 关，看看程序怎样把文字变成数字。"
        : "请调整这 10 个词的分值，并答对概念题。",
    };
  } else if (stageIndex === 2) {
    const draft = sanitizeTokenizeDraft(rawDraft);
    snapshot = draft;
    let tokCorrect = 0;
    for (const item of TOKENIZE_PUZZLE_ITEMS) {
      if (draft.classifications[item.id] === item.expected) tokCorrect++;
    }
    const tokTotal = TOKENIZE_PUZZLE_ITEMS.length;
    const tokOk = tokCorrect === tokTotal;
    const conceptCheck = checkConcepts(stage.prompts, draft.concepts);
    score = tokCorrect + conceptCheck.correct;
    total = tokTotal + conceptCheck.total;
    passed = tokOk && conceptCheck.ok;
    const parts: MlPartSummary[] = [
      {
        id: "tokens",
        label: "词和标点的处理方式",
        ok: tokOk,
        detail: tokOk
          ? `${tokCorrect} / ${tokTotal} 个全部答对`
          : `答对了 ${tokCorrect} / ${tokTotal} 个。请再看看重复的词、标点和词表里没有的词。`,
      },
      conceptCheck.part,
    ];
    testSummary = {
      parts,
      detail: passed
        ? "练习和概念题全部答对了。你可以进入第 3 关。"
        : "还有题目没有答对。请再检查词和标点的处理方式，以及概念题。",
    };
  } else if (stageIndex === 3) {
    const draft = sanitizeScoreDraft(rawDraft);
    snapshot = draft;
    const evalRes = evaluateManualWeights(draft.weights, draft.bias, SCORE_CALIBRATION_SMS, 0.5);
    const smsOk = evalRes.correctCount === SCORE_CALIBRATION_SMS.length;
    const priorOk = evalRes.emptyProbability < 0.5;
    const conceptCheck = checkConcepts(stage.prompts, draft.concepts);
    score = evalRes.correctCount + (priorOk ? 1 : 0) + conceptCheck.correct;
    total = SCORE_CALIBRATION_SMS.length + 1 + conceptCheck.total;
    passed = smsOk && priorOk && conceptCheck.ok;
    const wrongTags = evalRes.items
      .filter((item) => !item.correct)
      .map((item) => SCORE_CALIBRATION_SMS.find((m) => m.id === item.id)?.tag ?? item.id);
    const parts: MlPartSummary[] = [
      {
        id: "calibration",
        label: "6 条示例短信分类",
        ok: smsOk,
        detail: smsOk
          ? "6 / 6 条全部分对"
          : `${evalRes.correctCount} / 6 条分对（未过：${wrongTags.join("、")}）`,
      },
      {
        id: "prior",
        label: "没有已知词时的预测",
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
        ? "模型分对了全部示例短信。下一关，你可以让模型自己学习权重。"
        : "请调整权重和偏置，检查 6 条短信的分类，以及没有已知词时的预测概率。",
    };
  } else if (stageIndex === 4) {
    const draft = sanitizeTrainDraft(rawDraft);
    snapshot = draft;
    const run = trainLogisticRegression({
      trainCount: MAX_SAMPLE_SIZE,
      eta: draft.eta,
      epochs: draft.epochs,
      threshold: 0.5,
    });
    const finalEpoch = run.epochsHistory[run.epochsHistory.length - 1];
    const trOk = finalEpoch.trainLoss <= TRAIN_MAX_TRAIN_LOSS;
    const valOk = finalEpoch.valLoss <= TRAIN_MAX_VAL_LOSS;
    const conceptCheck = checkConcepts(stage.prompts, draft.concepts);
    score = (trOk ? 1 : 0) + (valOk ? 1 : 0) + conceptCheck.correct;
    total = 2 + conceptCheck.total;
    passed = trOk && valOk && conceptCheck.ok;
    const parts: MlPartSummary[] = [
      {
        id: "train-loss",
        label: "训练损失（≤ 0.08）",
        ok: trOk,
        detail: `当前训练损失 ${finalEpoch.trainLoss.toFixed(4)}`,
      },
      {
        id: "val-loss",
        label: "验证损失（≤ 0.12）",
        ok: valOk,
        detail: `当前验证损失 ${finalEpoch.valLoss.toFixed(4)}（每条都预测 50% 时为 0.6931）`,
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
        ? `模型训练了 ${draft.epochs} 轮，学习率为 ${draft.eta}，两项损失已达到要求（验证损失 ${finalEpoch.valLoss.toFixed(3)}）。`
        : `训练损失或验证损失尚未达到要求。请比较其他学习率和轮数（当前 η=${draft.eta}，${draft.epochs} 轮）。`,
    };
  } else if (stageIndex === 5) {
    const draft = sanitizeEvaluateDraft(rawDraft);
    snapshot = draft;
    const run = trainLogisticRegression({
      trainCount: MAX_SAMPLE_SIZE,
      eta: draft.eta,
      epochs: draft.epochs,
      threshold: draft.threshold,
    });
    const m = run.finalMetrics;
    const accOk = m.accuracy >= EVAL_MIN_ACCURACY;
    const precOk = m.precision >= EVAL_MIN_PRECISION;
    const recOk = m.recall >= EVAL_MIN_RECALL;
    const conceptCheck = checkConcepts(stage.prompts, draft.concepts);
    score = (accOk ? 1 : 0) + (precOk ? 1 : 0) + (recOk ? 1 : 0) + conceptCheck.correct;
    total = 3 + conceptCheck.total;
    passed = accOk && precOk && recOk && conceptCheck.ok;
    const parts: MlPartSummary[] = [
      {
        id: "accuracy",
        label: "准确率（≥ 95.0%）",
        ok: accOk,
        detail: `准确率 ${pct(m.accuracy)}（全部判为正常时为 ${pct(run.baselineAcc)}）`,
      },
      {
        id: "precision",
        label: "查准率 Precision (≥ 90.0%)",
        ok: precOk,
        detail: `${pct(m.precision)}（正确拦截 ${m.tp} 条，误拦正常短信 ${m.fp} 条）`,
      },
      {
        id: "recall",
        label: "查全率 Recall (≥ 80.0%)",
        ok: recOk,
        detail: `${pct(m.recall)}（正确拦截 ${m.tp} 条，漏报 ${m.fn} 条）`,
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
        ? `模型在验证集上的准确率为 ${pct(m.accuracy)}，查准率为 ${pct(m.precision)}，查全率为 ${pct(m.recall)}，已达到要求。`
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
    const valBaseline = alwaysZeroBaseline(run.valPredictions);

    const valLossOk = run.finalMetrics.loss <= GENERALIZE_MAX_VAL_LOSS;
    const testAccOk = hm.accuracy >= GENERALIZE_MIN_TEST_ACCURACY;
    const testPrecOk = hm.precision >= GENERALIZE_MIN_TEST_PRECISION;
    const testRecOk = hm.recall >= GENERALIZE_MIN_TEST_RECALL;
    const hiddenAllOk = testAccOk && testPrecOk && testRecOk;
    const conceptCheck = checkConcepts(stage.prompts, draft.concepts);
    score = (valLossOk ? 1 : 0) + (hiddenAllOk ? 2 : 0) + conceptCheck.correct;
    total = 3 + conceptCheck.total;
    passed = valLossOk && hiddenAllOk && conceptCheck.ok;

    const parts: MlPartSummary[] = [
      {
        id: "val-loss",
        label: "验证损失（≤ 0.14）",
        ok: valLossOk,
        detail: `训练短信 ${draft.sampleSize} 条，验证损失 ${run.finalMetrics.loss.toFixed(3)}，验证准确率 ${pct(run.finalMetrics.accuracy)}，验证短信中不在词表里的词占 ${pct(run.finalMetrics.oovRate)}`,
      },
      {
        id: "hidden-blind-exam",
        label: "300 条未公开短信测试",
        ok: hiddenAllOk,
        detail: hiddenAllOk
          ? "测试通过。模型在新短信上的准确率、查准率和查全率均达到要求。测试集不提供详细指标。"
          : "测试未通过。模型在新短信上的准确率、查准率或查全率尚未达到要求。请查看验证集的损失、误判的短信，以及哪些词不在词表里，再调整参数。测试集不提供详细指标。",
      },
      conceptCheck.part,
    ];
    testSummary = {
      parts,
      metrics: {
        ...run.finalMetrics,
        trainLoss: run.epochsHistory[run.epochsHistory.length - 1].trainLoss,
        baselineAcc: valBaseline,
      },
      detail: passed
        ? `模型通过了 300 条新短信的测试。训练样本量为 ${draft.sampleSize} 条，验证损失为 ${run.finalMetrics.loss.toFixed(3)}。`
        : valLossOk
          ? `验证损失已达到要求（${run.finalMetrics.loss.toFixed(3)}），但模型尚未通过测试集检查。请根据公开验证集的误判和指标调整参数。`
          : `验证损失 ${run.finalMetrics.loss.toFixed(3)} 尚未达到要求，验证短信中有 ${pct(run.finalMetrics.oovRate)} 的词不在词表里。你可以增加训练样本，并比较不同学习率的结果。`,
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
