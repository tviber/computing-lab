import { createExperienceClassifier, EXPERIENCE_EXAMPLES } from "../domain/experience.ts";
import {
  evaluateManualWeights,
  MAX_SAMPLE_SIZE,
  trainLogisticRegression,
} from "../domain/logisticRegression.ts";
import type {
  LogisticRegressionJudgeResult,
  LogisticRegressionPartSummary,
  LogisticRegressionTestSummary,
  TrainingSettings,
} from "../domain/protocol.ts";
import { runSgdCode, sanitizeSgdCodeDraft } from "../domain/sgdCode.ts";
import {
  getLogisticRegressionStage,
  logisticRegressionStageUnlocked,
  SCORE_CALIBRATION_SMS,
  TOKENIZE_PUZZLE_ITEMS,
  TRAIN_MAX_TRAIN_LOSS,
  TRAIN_MAX_VAL_LOSS,
  type ConceptPrompt,
} from "../domain/stages.ts";
import { evaluateStrategyWeights } from "../domain/strategy.ts";
import {
  sanitizeScoreDraft,
  sanitizeStrategyDraft,
  sanitizeTokenizeDraft,
  sanitizeTrainDraft,
} from "./state.ts";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function checkConcepts(
  prompts: readonly ConceptPrompt[],
  answers: Readonly<Record<string, number>>,
): { correct: number; total: number; ok: boolean; part: LogisticRegressionPartSummary } {
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

import { gateStage, type JudgeProject } from "../../../shared/lab/judging.ts";
export function evaluateLogisticRegressionSubmission(
  project: JudgeProject<unknown>,
  stageIndex: number,
  rawDraft: unknown,
  passedTraining?: TrainingSettings,
) {
  if (!Number.isInteger(stageIndex) || stageIndex < 1 || (stageIndex > 5 && stageIndex !== 6)) {
    return { error: "unknown-stage", status: 400 };
  }
  const gated = gateStage(getLogisticRegressionStage(stageIndex), (item) =>
    logisticRegressionStageUnlocked(project.passedStages, item.index),
  );
  if ("error" in gated) return gated;
  const { stage } = gated;

  let score: number;
  let total: number;
  let passed: boolean;
  let testSummary: LogisticRegressionTestSummary;
  let snapshot: unknown;
  let trainedSettings: TrainingSettings | undefined;

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
    const parts: LogisticRegressionPartSummary[] = [
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
        ? "6 条短信全部分对。下一关用词表把短信编码为 0 和 1。"
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
    const parts: LogisticRegressionPartSummary[] = [
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
    const parts: LogisticRegressionPartSummary[] = [
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
          ? `偏置 $b=${draft.bias.toFixed(1)}$（空消息概率 ${pct(evalRes.emptyProbability)} < 50%）`
          : `偏置 $b=${draft.bias.toFixed(1)}\\ge0$ 会导致全是新词的短信被默认判为垃圾`,
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
    score = (trOk ? 1 : 0) + (valOk ? 1 : 0);
    total = 2;
    passed = trOk && valOk;
    if (passed) trainedSettings = { eta: draft.eta, epochs: draft.epochs };
    const parts: LogisticRegressionPartSummary[] = [
      {
        id: "train-loss",
        label: "训练损失（$\\le0.08$）",
        ok: trOk,
        detail: `当前训练损失 ${finalEpoch.trainLoss.toFixed(4)}`,
      },
      {
        id: "val-loss",
        label: "验证损失（$\\le0.12$）",
        ok: valOk,
        detail: `当前验证损失 ${finalEpoch.valLoss.toFixed(4)}（每条都预测 50% 时为 0.6931）`,
      },
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
    const activity = rawDraft as {
      activity?: unknown;
      exampleId?: unknown;
      prediction?: unknown;
    } | null;
    const example = EXPERIENCE_EXAMPLES.find(({ id }) => id === activity?.exampleId);
    if (
      activity?.activity !== "sms-classification" ||
      !example ||
      (activity.prediction !== 0 && activity.prediction !== 1)
    ) {
      return { error: "invalid-activity", status: 400 };
    }
    const training = passedTraining ?? sanitizeTrainDraft(project.drafts[4]);
    if (createExperienceClassifier(training).inspect(example.text).pred !== activity.prediction) {
      return { error: "invalid-activity", status: 400 };
    }
    snapshot = { activity: "sms-classification" };
    score = 1;
    total = 1;
    passed = true;
    testSummary = {
      parts: [{ id: "experience", label: "短信分类体验", ok: true, detail: null }],
      detail: "已完成短信分类体验。",
    };
  } else {
    const draft = sanitizeSgdCodeDraft(rawDraft);
    snapshot = draft;
    const judged = runSgdCode(draft.code, draft.concepts);
    testSummary = judged.summary;
    score = judged.summary.parts.filter((part) => part.ok).length;
    total = judged.summary.parts.length;
    passed = judged.passed;
  }

  const result: LogisticRegressionJudgeResult = {
    passed,
    score,
    total,
    testSummary,
    submissionId: "",
    currentStage: project.currentStage,
    passedStages: project.passedStages,
    ...(trainedSettings ? { trainedSettings } : {}),
  };

  return { result, snapshot, score, total, passed };
}
