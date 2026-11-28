import type { CorpusMessage } from "./corpus.ts";
import { binaryLogLoss, clampThreshold, MAX_THRESHOLD, MIN_THRESHOLD, sigmoid } from "./math.ts";

export type WordWeightEntry = {
  word: string;
  weight: number;
  df: number;
};

export type ClassificationMetrics = {
  total: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  loss: number;
  oovRate: number;
};

export type VectorizedMessage = {
  id: number;
  label: 0 | 1;
  text: string;
  tokens: string[];
  activeIds: number[];
  oovWords: string[];
};

export type MessagePrediction = {
  id: number;
  label: 0 | 1;
  text: string;
  tokens: string[];
  probability: number;
  rawZ: number;
  pred: 0 | 1;
  bucket: "tp" | "fp" | "tn" | "fn";
  oovWords: string[];
  tokenCount: number;
};

export type TrainedModel = {
  vocab: string[];
  vocabSet: Set<string>;
  wordToIndex: Map<string, number>;
  docFreq: Int32Array;
  weights: Float64Array;
  bias: number;
  weightsByWord: Map<string, number>;
};

export type ThresholdCurvePoint = {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  fp: number;
  fn: number;
};

export function buildVocabFromTrain(trainMessages: readonly CorpusMessage[]): {
  vocab: string[];
  vocabSet: Set<string>;
  wordToIndex: Map<string, number>;
  docFreq: Int32Array;
} {
  const counts = new Map<string, number>();
  for (const msg of trainMessages) {
    const seen = new Set<string>();
    for (const tok of msg.tokens) {
      if (seen.has(tok)) continue;
      seen.add(tok);
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  const vocab = Array.from(counts.keys()).sort();
  const vocabSet = new Set(vocab);
  const wordToIndex = new Map<string, number>();
  const docFreq = new Int32Array(vocab.length);
  for (let i = 0; i < vocab.length; i++) {
    const word = vocab[i];
    wordToIndex.set(word, i);
    docFreq[i] = counts.get(word) ?? 0;
  }
  return { vocab, vocabSet, wordToIndex, docFreq };
}

export function vectorizeMessages(
  messages: readonly CorpusMessage[],
  wordToIndex: ReadonlyMap<string, number>,
): VectorizedMessage[] {
  return messages.map((msg) => {
    const activeIds: number[] = [];
    const seenIds = new Set<number>();
    const oovWords: string[] = [];
    for (const tok of msg.tokens) {
      const idx = wordToIndex.get(tok);
      if (idx === undefined) {
        oovWords.push(tok);
        continue;
      }
      if (!seenIds.has(idx)) {
        seenIds.add(idx);
        activeIds.push(idx);
      }
    }
    return {
      id: msg.id,
      label: msg.label,
      text: msg.text,
      tokens: msg.tokens,
      activeIds,
      oovWords,
    };
  });
}

function bucketOf(label: 0 | 1, pred: 0 | 1): "tp" | "fp" | "tn" | "fn" {
  if (label === 1 && pred === 1) return "tp";
  if (label === 0 && pred === 1) return "fp";
  if (label === 0 && pred === 0) return "tn";
  return "fn";
}

export function computeMetricsFromPredictions(
  preds: readonly MessagePrediction[],
  threshold = 0.5,
): ClassificationMetrics {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let totalLoss = 0;
  let oovCount = 0;
  let tokenTotal = 0;

  for (const item of preds) {
    totalLoss += binaryLogLoss(item.label, item.probability);
    oovCount += item.oovWords.length;
    tokenTotal += item.tokenCount;
    const pred: 0 | 1 = item.probability >= threshold ? 1 : 0;
    if (item.label === 1 && pred === 1) tp++;
    else if (item.label === 0 && pred === 1) fp++;
    else if (item.label === 0 && pred === 0) tn++;
    else fn++;
  }

  const total = preds.length;
  const accuracy = total > 0 ? (tp + tn) / total : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    total,
    tp,
    fp,
    tn,
    fn,
    accuracy,
    precision,
    recall,
    f1,
    loss: total > 0 ? totalLoss / total : 0,
    oovRate: tokenTotal > 0 ? oovCount / tokenTotal : 0,
  };
}

export function rethresholdPredictions(
  predictions: readonly MessagePrediction[],
  threshold: number,
): { predictions: MessagePrediction[]; metrics: ClassificationMetrics } {
  const safeThreshold = clampThreshold(threshold);
  const next = predictions.map((item) => {
    const pred: 0 | 1 = item.probability >= safeThreshold ? 1 : 0;
    return {
      ...item,
      pred,
      bucket: bucketOf(item.label, pred),
    };
  });
  return {
    predictions: next,
    metrics: computeMetricsFromPredictions(next, safeThreshold),
  };
}

export function sweepThresholds(predictions: readonly MessagePrediction[]): ThresholdCurvePoint[] {
  const points: ThresholdCurvePoint[] = [];
  for (let t = 5; t <= 95; t += 5) {
    const threshold = t / 100;
    const m = computeMetricsFromPredictions(predictions, threshold);
    points.push({
      threshold,
      precision: m.precision,
      recall: m.recall,
      f1: m.f1,
      accuracy: m.accuracy,
      fp: m.fp,
      fn: m.fn,
    });
  }
  return points;
}

export function selectExperienceThreshold(predictions: readonly MessagePrediction[]): number {
  let bestThreshold = 0.5;
  let bestF1 = computeMetricsFromPredictions(predictions, bestThreshold).f1;
  for (let percent = MIN_THRESHOLD * 100; percent <= MAX_THRESHOLD * 100; percent++) {
    const threshold = percent / 100;
    const { f1 } = computeMetricsFromPredictions(predictions, threshold);
    if (
      f1 > bestF1 ||
      (f1 === bestF1 && Math.abs(threshold - 0.5) < Math.abs(bestThreshold - 0.5))
    ) {
      bestThreshold = threshold;
      bestF1 = f1;
    }
  }
  return bestThreshold;
}

export function evaluateVecSet(
  vecSet: readonly VectorizedMessage[],
  weights: Float64Array,
  bias: number,
  threshold: number,
): { predictions: MessagePrediction[]; metrics: ClassificationMetrics } {
  const predictions: MessagePrediction[] = vecSet.map((msg) => {
    let z = bias;
    const ids = msg.activeIds;
    for (let i = 0; i < ids.length; i++) z += weights[ids[i]];
    const probability = sigmoid(z);
    const pred: 0 | 1 = probability >= threshold ? 1 : 0;
    return {
      id: msg.id,
      label: msg.label,
      text: msg.text,
      tokens: msg.tokens,
      probability,
      rawZ: z,
      pred,
      bucket: bucketOf(msg.label, pred),
      oovWords: msg.oovWords,
      tokenCount: msg.tokens.length,
    };
  });
  return {
    predictions,
    metrics: computeMetricsFromPredictions(predictions, threshold),
  };
}

export function extractTopWords(
  vocab: readonly string[],
  weights: Float64Array,
  docFreq: Int32Array,
  topN = 10,
): { topSpam: WordWeightEntry[]; topHam: WordWeightEntry[] } {
  const positive: WordWeightEntry[] = [];
  const negative: WordWeightEntry[] = [];
  for (let i = 0; i < vocab.length; i++) {
    const w = weights[i];
    if (w > 0.001) positive.push({ word: vocab[i], weight: w, df: docFreq[i] });
    else if (w < -0.001) negative.push({ word: vocab[i], weight: w, df: docFreq[i] });
  }
  positive.sort((a, b) => b.weight - a.weight);
  negative.sort((a, b) => a.weight - b.weight);
  return {
    topSpam: positive.slice(0, topN),
    topHam: negative.slice(0, topN),
  };
}

export function evaluateModelOnMessages(
  model: TrainedModel,
  messages: readonly CorpusMessage[],
  threshold = 0.5,
): { predictions: MessagePrediction[]; metrics: ClassificationMetrics } {
  const vecSet = vectorizeMessages(messages, model.wordToIndex);
  return evaluateVecSet(vecSet, model.weights, model.bias, clampThreshold(threshold));
}
