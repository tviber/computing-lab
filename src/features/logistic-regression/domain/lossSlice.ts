import type { CorpusMessage } from "./corpus.ts";
import { binaryLogLoss, clamp, sigmoid, type TrainedModel } from "./logisticRegression.ts";

export type SliceWordOption = {
  word: string;
  label: string;
  note: string;
};

export const SLICE_WORD_OPTIONS: readonly SliceWordOption[] = [
  {
    word: "免费",
    label: "免费",
    note: "在这组训练数据里，两类短信都出现过这个词。其余参数全为 0 时，谷底靠近 0。",
  },
  {
    word: "好",
    label: "好",
    note: "在这组训练数据里，两类短信中出现的次数接近 1:1。其余参数全为 0 时，适合观察近似对称的斜坡与跨谷反弹。",
  },
  {
    word: "您",
    label: "您",
    note: "在这组训练数据里，含这个词的短信以垃圾短信为主。其余参数全为 0 时，谷底偏右（$w^* > 0$）。",
  },
  {
    word: "的",
    label: "的",
    note: "在这组训练数据里，含这个词的短信以正常短信为主。其余参数全为 0 时，谷底偏左（$w^* < 0$）。",
  },
] as const;

export const SLICE_MIN_W = -5;
export const SLICE_MAX_W = 5;
export const SLICE_MIN_ETA = 0.2;
export const SLICE_MAX_ETA = 8.0;

export type SliceSample = {
  label: 0 | 1;
  otherZ: number;
};

export type SliceDatasetSummary = {
  word: string;
  samples: SliceSample[];
  posCount: number;
  negCount: number;
  totalCount: number;
};

export type SliceEval = {
  w: number;
  loss: number;
  grad: number;
  meanProb: number;
  correctCount: number;
  totalCount: number;
  fpCount: number;
  fnCount: number;
};

export type SliceCurveData = {
  points: SliceEval[];
  minPoint: SliceEval;
  maxLoss: number;
  minLoss: number;
};

export type SliceStepDirection = "descent" | "left" | "right";

export type SliceStepOutcome = {
  from: SliceEval;
  to: SliceEval;
  eta: number;
  direction: SliceStepDirection;
  rawDelta: number;
  actualDelta: number;
  clamped: boolean;
  isAtMinimum: boolean;
  descentSide: "left" | "right" | "zero";
};

export function clampSliceW(w: number): number {
  if (!Number.isFinite(w)) return 0;
  return Number(clamp(w, SLICE_MIN_W, SLICE_MAX_W).toFixed(4));
}

export function clampSliceEta(eta: number): number {
  if (!Number.isFinite(eta)) return 1.5;
  return Number(clamp(eta, SLICE_MIN_ETA, SLICE_MAX_ETA).toFixed(2));
}

export function buildWordSliceDataset(
  word: string,
  trainMessages: readonly CorpusMessage[],
  fixedModel: TrainedModel | null = null,
): SliceDatasetSummary {
  const samples: SliceSample[] = [];
  let posCount = 0;
  let negCount = 0;

  if (!fixedModel) {
    for (const msg of trainMessages) {
      if (!msg.tokens.includes(word)) continue;
      if (msg.label === 1) posCount++;
      else negCount++;
      samples.push({ label: msg.label, otherZ: 0 });
    }
    return { word, samples, posCount, negCount, totalCount: samples.length };
  }

  const targetIdx = fixedModel.wordToIndex.get(word);
  for (const msg of trainMessages) {
    let hasWord = false;
    let otherZ = fixedModel.bias;
    const seen = new Set<string>();
    for (const tok of msg.tokens) {
      if (seen.has(tok)) continue;
      seen.add(tok);
      const idx = fixedModel.wordToIndex.get(tok);
      if (idx === undefined) continue;
      if (idx === targetIdx) {
        hasWord = true;
      } else {
        otherZ += fixedModel.weights[idx];
      }
    }
    if (!hasWord) continue;
    if (msg.label === 1) posCount++;
    else negCount++;
    samples.push({ label: msg.label, otherZ });
  }

  return { word, samples, posCount, negCount, totalCount: samples.length };
}

export function evaluateSliceAt(samples: readonly SliceSample[], w: number): SliceEval {
  const safeW = clampSliceW(w);
  if (samples.length === 0) {
    return {
      w: safeW,
      loss: 0,
      grad: 0,
      meanProb: 0,
      correctCount: 0,
      totalCount: 0,
      fpCount: 0,
      fnCount: 0,
    };
  }
  let lossSum = 0;
  let gradSum = 0;
  let probSum = 0;
  let correctCount = 0;
  let fpCount = 0;
  let fnCount = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const p = sigmoid(safeW + s.otherZ);
    lossSum += binaryLogLoss(s.label, p);
    gradSum += p - s.label;
    probSum += p;
    const pred: 0 | 1 = p >= 0.5 ? 1 : 0;
    if (pred === s.label) correctCount++;
    else if (pred === 1) fpCount++;
    else fnCount++;
  }
  return {
    w: safeW,
    loss: lossSum / samples.length,
    grad: gradSum / samples.length,
    meanProb: probSum / samples.length,
    correctCount,
    totalCount: samples.length,
    fpCount,
    fnCount,
  };
}

export function sampleLossSliceCurve(
  samples: readonly SliceSample[],
  minW = SLICE_MIN_W,
  maxW = SLICE_MAX_W,
  segments = 80,
): SliceCurveData {
  const count = Math.max(8, Math.round(segments));
  const points: SliceEval[] = [];
  let minPoint: SliceEval | null = null;
  let maxLoss = 0;
  let minLoss = Infinity;

  for (let i = 0; i <= count; i++) {
    const w = minW + ((maxW - minW) * i) / count;
    const pt = evaluateSliceAt(samples, w);
    points.push(pt);
    if (!minPoint || pt.loss < minPoint.loss) minPoint = pt;
    if (pt.loss > maxLoss) maxLoss = pt.loss;
    if (pt.loss < minLoss) minLoss = pt.loss;
  }

  const fallback: SliceEval = {
    w: 0,
    loss: 0,
    grad: 0,
    meanProb: 0,
    correctCount: 0,
    totalCount: 0,
    fpCount: 0,
    fnCount: 0,
  };
  return {
    points,
    minPoint: minPoint ?? fallback,
    maxLoss: Math.max(0.2, maxLoss),
    minLoss: Number.isFinite(minLoss) ? minLoss : 0,
  };
}

export function stepSliceWeight(
  samples: readonly SliceSample[],
  currentW: number,
  eta: number,
  direction: SliceStepDirection,
): SliceStepOutcome {
  const from = evaluateSliceAt(samples, currentW);
  const safeEta = clampSliceEta(eta);
  const absGrad = Math.abs(from.grad);
  const isAtMinimum = absGrad < 1e-3;
  const descentSide: "left" | "right" | "zero" =
    from.grad > 1e-4 ? "left" : from.grad < -1e-4 ? "right" : "zero";

  let rawDelta: number;
  if (direction === "descent") {
    rawDelta = -safeEta * from.grad;
  } else if (direction === "left") {
    rawDelta = -safeEta * absGrad;
  } else {
    rawDelta = safeEta * absGrad;
  }

  const unclampedNext = from.w + rawDelta;
  const nextW = clampSliceW(unclampedNext);
  const clamped = Math.abs(nextW - unclampedNext) > 1e-6;
  const to = evaluateSliceAt(samples, nextW);

  return {
    from,
    to,
    eta: safeEta,
    direction,
    rawDelta,
    actualDelta: to.w - from.w,
    clamped,
    isAtMinimum,
    descentSide,
  };
}
