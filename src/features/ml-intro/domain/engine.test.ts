import { describe, expect, it } from "vitest";
import { getPublicCorpus } from "./corpus.ts";
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
import { STAGE1_PUZZLE_ITEMS, STAGE1_PUZZLE_SENTENCE, STAGE2_CALIBRATION_SMS } from "./stages.ts";
import { analyzeTokens, inspectMessageWithModel } from "./tokenizer.ts";

describe("ml-intro domain engine", () => {
  it("loads stratified 1400 train + 300 val corpus with ~86% always-zero baseline", () => {
    const corpus = getPublicCorpus();
    expect(corpus.train).toHaveLength(1400);
    expect(corpus.val).toHaveLength(300);
    expect(corpus.fullTrainVocab.size).toBeGreaterThan(7000);
    expect(alwaysZeroBaseline(corpus.val)).toBeCloseTo(0.86, 3);
  });

  it("tokenizes stage-1 puzzle sentence into kept, duplicate, filtered, and oov categories", () => {
    const { fullTrainVocab } = getPublicCorpus();
    const tokens = analyzeTokens(STAGE1_PUZZLE_SENTENCE, fullTrainVocab);
    expect(tokens.map((t) => t.status)).toEqual(STAGE1_PUZZLE_ITEMS.map((item) => item.expected));

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
      STAGE2_CALIBRATION_SMS,
    );
    expect(blacklistOnly.correctCount).toBeLessThan(STAGE2_CALIBRATION_SMS.length);

    const balanced = evaluateManualWeights(
      { 免费: 2.2, 领取: 2, 点击: 2, 退订: 2, 优惠: 2, 同学: -2, 明天: -1.6, 一起: -1.6 },
      -1,
      STAGE2_CALIBRATION_SMS,
    );
    expect(balanced.correctCount).toBe(STAGE2_CALIBRATION_SMS.length);
    expect(balanced.emptyProbability).toBeLessThan(0.5);
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
    const volatile = trainLogisticRegression({ trainCount: 1400, eta: 4.0, epochs: 12 });

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
    expect(small.finalMetrics.oovRate).toBeGreaterThan(0.5);
    expect(small.finalMetrics.recall).toBeLessThan(0.2);

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
});
