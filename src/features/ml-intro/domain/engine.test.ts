import { describe, expect, it } from "vitest";
import { getPublicCorpus } from "./corpus.ts";
import { TRAIN_ROWS, VAL_ROWS } from "./corpusData.ts";
import {
  alwaysZeroBaseline,
  BLIND_GUESS_LOSS,
  classifyEtaRegime,
  evaluateManualWeights,
  rethresholdPredictions,
  sigmoid,
  singleUpdateDemo,
  sweepThresholds,
  trainLogisticRegression,
} from "./logreg.ts";
import {
  buildWordSliceDataset,
  evaluateSliceAt,
  sampleLossSliceCurve,
  SLICE_WORD_OPTIONS,
  stepSliceWeight,
} from "./lossSlice.ts";
import {
  SCORE_CALIBRATION_SMS,
  TOKENIZE_PUZZLE_ITEMS,
  TOKENIZE_PUZZLE_SENTENCE,
} from "./stages.ts";
import {
  clampStrategyWeight,
  evaluateStrategyWeights,
  MAX_STRATEGY_WEIGHT,
  MIN_STRATEGY_WEIGHT,
  STRATEGY_SCORE_SPAM_THRESHOLD,
  STRATEGY_SMS_EXAMPLES,
  STRATEGY_WEIGHT_TIERS,
  STRATEGY_WORDS,
} from "./strategy.ts";
import {
  analyzeTokens,
  inspectCorpusMessageWithModel,
  inspectMessageWithModel,
} from "./tokenizer.ts";

const UNSAFE_OR_PII_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "raw-mobile", re: /(?<!\d)1[3-9]\d{9}(?!\d)/ },
  { name: "masked-mobile", re: /(?<!\d)1\d{2}[x*]{4}\d{2,4}/i },
  { name: "hotline-400-800", re: /(?<!\d)[48]00[-\s]?\d{3}[-\s]?\d{4}/ },
  { name: "raw-url", re: /https?:\/\/|www\./i },
  { name: "profanity-or-sexual-violence", re: /强奸|强暴|乱伦|轮奸|他妈|操你|滚蛋|蠢货/ },
];

describe("ml-intro domain engine", () => {
  it("loads stratified 1400 train + 300 val corpus with ~86% always-zero baseline", () => {
    const corpus = getPublicCorpus();
    expect(corpus.train).toHaveLength(1400);
    expect(corpus.val).toHaveLength(300);
    expect(corpus.fullTrainVocab.size).toBeGreaterThan(5000);
    expect(alwaysZeroBaseline(corpus.val)).toBeCloseTo(0.86, 3);
  });

  it("keeps public train + val SMS corpus free of unredacted PII and classroom-unsafe text", () => {
    const allRows = [...TRAIN_ROWS, ...VAL_ROWS];
    expect(allRows).toHaveLength(1700);
    for (const row of allRows) {
      const text = row.split("\t")[1] ?? "";
      for (const rule of UNSAFE_OR_PII_PATTERNS) {
        expect(text, `row violated ${rule.name}: ${text}`).not.toMatch(rule.re);
      }
    }
  });

  it("evaluates Stage 1 10-word strategy with discrete tiers and signed risk cutoff w·x >= +1", () => {
    expect(STRATEGY_WORDS).toHaveLength(10);
    expect(MIN_STRATEGY_WEIGHT).toBe(-2);
    expect(MAX_STRATEGY_WEIGHT).toBe(2);
    expect(STRATEGY_SCORE_SPAM_THRESHOLD).toBe(1);
    expect(STRATEGY_WEIGHT_TIERS.map((tier) => tier.value)).toEqual([-2, -1, 0, 1, 2]);

    const vocab = new Set<string>(STRATEGY_WORDS);
    const seen = new Set<string>();
    for (const msg of STRATEGY_SMS_EXAMPLES) {
      expect(msg.tokens.length).toBeGreaterThan(0);
      for (const tok of msg.tokens) {
        expect(vocab.has(tok)).toBe(true);
        seen.add(tok);
      }
    }
    expect(seen.size).toBe(10);

    expect(clampStrategyWeight(99)).toBe(2);
    expect(clampStrategyWeight(-99)).toBe(-2);
    expect(clampStrategyWeight(1.74)).toBe(2);
    expect(clampStrategyWeight(-0.2)).toBe(0);

    const zeroEval = evaluateStrategyWeights({});
    expect(zeroEval.correctCount).toBe(3);
    for (const item of zeroEval.items) {
      expect(item.score).toBe(0);
      expect(item.pred).toBe(0);
      expect("prob" in item).toBe(false);
    }

    const atCutoff = evaluateStrategyWeights({ 中奖: 1 });
    expect(atCutoff.items.find((i) => i.message.id === "st-spam-1")?.score).toBe(1);
    expect(atCutoff.items.find((i) => i.message.id === "st-spam-1")?.pred).toBe(1);
    expect(atCutoff.items.find((i) => i.message.id === "st-ham-2")?.score).toBe(0);
    expect(atCutoff.items.find((i) => i.message.id === "st-ham-2")?.pred).toBe(0);

    const noNeg = evaluateStrategyWeights({ 中奖: 2, 发票: 1, 退款: 1, 优惠: 1 });
    expect(noNeg.correctCount).toBeLessThan(STRATEGY_SMS_EXAMPLES.length);
    expect(noNeg.items.find((i) => i.message.id === "st-ham-3")?.ok).toBe(false);

    const pollutedNeutral = evaluateStrategyWeights({
      中奖: 2,
      发票: 1,
      退款: 1,
      优惠: 1,
      妈妈: -2,
      开会: -1,
      老师: -1,
      今天: 1,
      通知: 1,
    });
    expect(pollutedNeutral.items.find((i) => i.message.id === "st-ham-2")?.ok).toBe(false);

    // Pure polarity choice (+/-1, 0) suffices without exact numeric tweaking.
    const equalTiers = evaluateStrategyWeights({
      中奖: 1,
      发票: 1,
      退款: 1,
      优惠: 1,
      妈妈: -1,
      开会: -1,
      老师: -1,
      今天: 0,
      明天: 0,
      通知: 0,
    });
    expect(equalTiers.correctCount).toBe(STRATEGY_SMS_EXAMPLES.length);
    expect(equalTiers.positiveWordCount).toBe(4);
    expect(equalTiers.negativeWordCount).toBe(3);
  });

  it("tokenizes stage-2 puzzle sentence into kept, duplicate, filtered, and oov categories", () => {
    const { fullTrainVocab } = getPublicCorpus();
    const tokens = analyzeTokens(TOKENIZE_PUZZLE_SENTENCE, fullTrainVocab);
    expect(tokens.map((t) => t.status)).toEqual(TOKENIZE_PUZZLE_ITEMS.map((item) => item.expected));

    const pairA = analyzeTokens("朋友请我免费喝奶茶", fullTrainVocab)
      .filter((t) => t.status === "kept")
      .map((t) => t.text)
      .sort();
    const pairB = analyzeTokens("免费请我朋友喝奶茶", fullTrainVocab)
      .filter((t) => t.status === "kept")
      .map((t) => t.text)
      .sort();
    expect(pairA).toEqual(pairB);
  });

  it("demonstrates why manual keyword blacklists fail ham traps until negative weights balance them", () => {
    const blacklistOnly = evaluateManualWeights(
      { 免费: 2, 领取: 2, 点击: 2, 退订: 2, 优惠: 2, 同学: 0, 明天: 0, 一起: 0 },
      -1,
      SCORE_CALIBRATION_SMS,
    );
    expect(blacklistOnly.correctCount).toBeLessThan(SCORE_CALIBRATION_SMS.length);

    const balancedWeights = {
      免费: 2.2,
      领取: 2,
      点击: 2,
      退订: 2,
      优惠: 2,
      同学: -2,
      明天: -1.6,
      一起: -1.6,
    };
    const balanced = evaluateManualWeights(balancedWeights, -1, SCORE_CALIBRATION_SMS);
    expect(balanced.correctCount).toBe(SCORE_CALIBRATION_SMS.length);
    expect(balanced.emptyProbability).toBeLessThan(0.5);

    const { fullTrainVocab } = getPublicCorpus();
    const wMap = new Map(Object.entries(balancedWeights));
    SCORE_CALIBRATION_SMS.forEach((sms, i) => {
      const fromText = inspectMessageWithModel(sms.text, wMap, -1, fullTrainVocab, 0.5);
      const fromTokens = inspectCorpusMessageWithModel(sms, wMap, -1, fullTrainVocab, 0.5);
      expect(fromText.probability).toBeCloseTo(balanced.items[i].probability, 12);
      expect(fromTokens.probability).toBeCloseTo(balanced.items[i].probability, 12);
      expect(fromText.pred).toBe(balanced.items[i].pred);
    });
  });

  it("matches model prediction and UI inspection bit-for-bit across all 300 validation SMS", () => {
    const corpus = getPublicCorpus();
    const run = trainLogisticRegression({ trainCount: 1400, eta: 0.1, epochs: 12, threshold: 0.5 });

    for (const threshold of [0.4, 0.5]) {
      const evaluated = rethresholdPredictions(run.valPredictions, threshold);
      expect(evaluated.predictions).toHaveLength(300);

      for (let i = 0; i < corpus.val.length; i++) {
        const msg = corpus.val[i];
        const pred = evaluated.predictions[i];
        const fromCorpus = inspectCorpusMessageWithModel(
          msg,
          run.finalModel.weightsByWord,
          run.finalModel.bias,
          run.finalModel.vocabSet,
          threshold,
          run.finalModel.wordToIndex,
        );
        const fromText = inspectMessageWithModel(
          msg.text,
          run.finalModel.weightsByWord,
          run.finalModel.bias,
          run.finalModel.vocabSet,
          threshold,
          run.finalModel.wordToIndex,
        );

        expect(fromCorpus.keptWords).toEqual(fromText.keptWords);
        expect(fromCorpus.rawZ).toBeCloseTo(fromText.rawZ, 12);
        expect(fromCorpus.probability).toBeCloseTo(pred.probability, 12);
        expect(fromText.probability).toBeCloseTo(pred.probability, 12);
        expect(fromCorpus.pred).toBe(pred.pred);
        expect(fromText.pred).toBe(pred.pred);
      }
    }
  });

  it("trains reproducible shuffled SGD epochs per seed while keeping BGD invariant", () => {
    const runA = trainLogisticRegression({
      trainCount: 1400,
      eta: 0.1,
      epochs: 8,
      seed: 2026,
      includeBgd: true,
    });
    const runASame = trainLogisticRegression({
      trainCount: 1400,
      eta: 0.1,
      epochs: 8,
      seed: 2026,
      includeBgd: true,
    });
    const runB = trainLogisticRegression({
      trainCount: 1400,
      eta: 0.1,
      epochs: 8,
      seed: 999,
      includeBgd: true,
    });
    const unshuffled = trainLogisticRegression({
      trainCount: 1400,
      eta: 0.1,
      epochs: 8,
      seed: 2026,
      shuffleEpochs: false,
      includeBgd: true,
    });

    expect(runA.epochsHistory).toEqual(runASame.epochsHistory);
    expect(runA.bgdHistory).toEqual(runB.bgdHistory);
    expect(runA.epochsHistory[1].trainLoss).not.toBeCloseTo(runB.epochsHistory[1].trainLoss, 6);
    expect(runA.epochsHistory[1].trainLoss).not.toBeCloseTo(
      unshuffled.epochsHistory[1].trainLoss,
      6,
    );
  });

  it("trains deterministic SGD with real intra-epoch jitter and differentiates eta regimes", () => {
    const slow = trainLogisticRegression({ trainCount: 1400, eta: 0.002, epochs: 12 });
    const steady = trainLogisticRegression({
      trainCount: 1400,
      eta: 0.1,
      epochs: 12,
      includeTrace: true,
      includeBgd: true,
    });
    const volatile = trainLogisticRegression({ trainCount: 1400, eta: 5.0, epochs: 12 });

    expect(steady.epochsHistory[0].trainLoss).toBeCloseTo(BLIND_GUESS_LOSS, 3);
    expect(steady.epochsHistory[12].trainLoss).toBeLessThan(0.05);
    expect(steady.epochsHistory[12].valLoss).toBeLessThan(0.11);
    expect(slow.epochsHistory[12].valLoss).toBeGreaterThan(0.14);
    expect(volatile.epochsHistory[12].valLoss).toBeGreaterThan(0.18);

    expect(steady.intraEpochTrace.length).toBeGreaterThan(20);
    expect(steady.bgdHistory).toHaveLength(13);
    expect(classifyEtaRegime(0.002).id).toBe("slow");
    expect(classifyEtaRegime(0.1).id).toBe("steady");
    expect(classifyEtaRegime(3.5).id).toBe("volatile");
  });

  it("trades precision against recall across thresholds and surfaces overfitting on small samples", () => {
    const small = trainLogisticRegression({
      trainCount: 150,
      eta: 0.1,
      epochs: 15,
      threshold: 0.45,
    });
    const full = trainLogisticRegression({
      trainCount: 1400,
      eta: 0.1,
      epochs: 15,
      threshold: 0.45,
    });

    const smallLast = small.epochsHistory[small.epochsHistory.length - 1];
    expect(smallLast.trainAcc).toBeGreaterThan(0.98);
    expect(small.finalMetrics.oovRate).toBeGreaterThan(0.35);
    expect(small.finalMetrics.recall).toBeLessThan(0.25);

    expect(full.finalMetrics.oovRate).toBeLessThan(small.finalMetrics.oovRate);
    expect(full.finalMetrics.recall).toBeGreaterThan(0.75);
    expect(full.finalMetrics.precision).toBeGreaterThan(0.9);

    const curve = sweepThresholds(full.valPredictions);
    const lowThresh = curve.find((c) => Math.abs(c.threshold - 0.15) < 0.001)!;
    const highThresh = curve.find((c) => Math.abs(c.threshold - 0.85) < 0.001)!;
    expect(lowThresh.recall).toBeGreaterThan(highThresh.recall);
    expect(highThresh.precision).toBeGreaterThanOrEqual(lowThresh.precision);

    const re = rethresholdPredictions(full.valPredictions, 0.4);
    expect(re.metrics.precision).toBeGreaterThanOrEqual(0.9);
    expect(re.metrics.recall).toBeGreaterThanOrEqual(0.8);
  });

  it("computes single-step gradient updates and message inspection coherently", () => {
    const demo = singleUpdateDemo(0.2, 1, 0.1);
    expect(demo.errorSignal).toBeCloseTo(-0.8, 5);
    expect(demo.deltaW).toBeCloseTo(0.08, 5);
    expect(demo.direction).toBe("up");

    const corpus = getPublicCorpus();
    const inspection = inspectMessageWithModel(
      "免费领取红包",
      new Map([
        ["免费", 1.5],
        ["领取", 1.2],
      ]),
      -1.0,
      corpus.fullTrainVocab,
      0.5,
    );
    expect(inspection.rawZ).toBeCloseTo(1.7, 5);
    expect(inspection.probability).toBeCloseTo(sigmoid(1.7), 6);
    expect(inspection.pred).toBe(1);
  });

  it("computes 1D weight-loss slices with convex bowls and asymmetric gradient steps", () => {
    const corpus = getPublicCorpus();
    const run = trainLogisticRegression({ trainCount: 1400, eta: 0.1, epochs: 12 });

    for (const opt of SLICE_WORD_OPTIONS) {
      const zeroDs = buildWordSliceDataset(opt.word, corpus.train, null);
      expect(zeroDs.posCount).toBeGreaterThan(0);
      expect(zeroDs.negCount).toBeGreaterThan(0);

      const zeroCurve = sampleLossSliceCurve(zeroDs.samples);
      const expectedOptW = Math.log(zeroDs.posCount / zeroDs.negCount);
      expect(zeroCurve.minPoint.w).toBeCloseTo(expectedOptW, 0);

      const trainedDs = buildWordSliceDataset(opt.word, corpus.train, run.finalModel);
      expect(trainedDs.totalCount).toBe(zeroDs.totalCount);
      const trainedCurve = sampleLossSliceCurve(trainedDs.samples);
      expect(trainedCurve.maxLoss).toBeGreaterThan(trainedCurve.minLoss);
    }

    // Verify asymmetric return: stepping right (+eta|grad|) from pos1=1.5 then left (-eta|grad|)
    // lands on a different coordinate because partial derivatives differ at the two points.
    const freeDs = buildWordSliceDataset("免费", corpus.train, null);
    const stepRight = stepSliceWeight(freeDs.samples, 1.5, 2.0, "right");
    expect(stepRight.to.w).toBeGreaterThan(1.5);
    const stepBackLeft = stepSliceWeight(freeDs.samples, stepRight.to.w, 2.0, "left");
    expect(stepBackLeft.to.w).not.toBeCloseTo(1.5, 2);
    expect(stepRight.from.grad).not.toBeCloseTo(stepRight.to.grad, 2);

    // At the analytical minimum, gradient is ~0 and descent step vanishes.
    const optW = Math.log(freeDs.posCount / freeDs.negCount);
    const atMin = stepSliceWeight(freeDs.samples, optW, 2.0, "descent");
    expect(atMin.isAtMinimum).toBe(true);
    expect(Math.abs(atMin.actualDelta)).toBeLessThan(1e-3);

    // Large eta on "好" overshoots the valley and bounces asymmetrically.
    const haoDs = buildWordSliceDataset("好", corpus.train, null);
    const jump1 = stepSliceWeight(haoDs.samples, 2.0, 6.5, "descent");
    expect(jump1.to.w).toBeLessThan(0);
    const jump2 = stepSliceWeight(haoDs.samples, jump1.to.w, 6.5, "descent");
    expect(jump2.to.w).toBeGreaterThan(0);
    expect(jump2.to.w).not.toBeCloseTo(2.0, 2);
    expect(evaluateSliceAt(haoDs.samples, jump2.to.w).loss).toBeLessThan(jump1.from.loss);

    // Slice eval reports real classification impact and mean predicted spam probability.
    const freeEval = evaluateSliceAt(freeDs.samples, 2.0);
    expect(freeEval.totalCount).toBe(14);
    expect(freeEval.correctCount).toBe(8);
    expect(freeEval.fpCount).toBe(6);
    expect(freeEval.fnCount).toBe(0);
    expect(freeEval.meanProb).toBeCloseTo(sigmoid(2.0), 6);
  });

  it("estimates trainSpamRate strictly from the training split without peeking at validation labels", () => {
    const trainMessages = [
      { id: 1, label: 1 as const, text: "a", tokens: ["a"] },
      { id: 2, label: 1 as const, text: "a", tokens: ["a"] },
      { id: 3, label: 0 as const, text: "b", tokens: ["b"] },
      { id: 4, label: 0 as const, text: "b", tokens: ["b"] },
    ];
    const valMessages = [
      { id: 10, label: 1 as const, text: "a", tokens: ["a"] },
      { id: 11, label: 0 as const, text: "b", tokens: ["b"] },
      { id: 12, label: 0 as const, text: "b", tokens: ["b"] },
      { id: 13, label: 0 as const, text: "b", tokens: ["b"] },
      { id: 14, label: 0 as const, text: "b", tokens: ["b"] },
    ];
    const customRun = trainLogisticRegression({
      eta: 0.1,
      epochs: 2,
      trainMessages,
      valMessages,
      trainCount: 4,
    });
    expect(customRun.trainSpamRate).toBeCloseTo(0.5, 6);
    expect(customRun.baselineAcc).toBeCloseTo(0.8, 6);
  });
});
