import { getPublicCorpus, type CorpusMessage } from "./corpus.ts";

export const EPS = 1e-12;
export const BLIND_GUESS_LOSS = Math.LN2;
export const DEFAULT_TRAIN_SEED = 2026;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleOrder(order: number[], rng: () => number): void {
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
}

export const MIN_ETA = 0.001;
export const MAX_ETA = 5.0;
export const MIN_EPOCHS = 1;
export const MAX_EPOCHS = 30;
export const MIN_THRESHOLD = 0.05;
export const MAX_THRESHOLD = 0.95;
export const MIN_SAMPLE_SIZE = 100;
export const MAX_SAMPLE_SIZE = 1400;
export const MIN_MANUAL_WEIGHT = -4;
export const MAX_MANUAL_WEIGHT = 4;
export const MIN_MANUAL_BIAS = -3;
export const MAX_MANUAL_BIAS = 3;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function clampEta(eta: number): number {
  return Number(clamp(eta, MIN_ETA, MAX_ETA).toFixed(4));
}

export function clampEpochs(epochs: number): number {
  return Math.round(clamp(epochs, MIN_EPOCHS, MAX_EPOCHS));
}

export function clampThreshold(threshold: number): number {
  return Number(clamp(threshold, MIN_THRESHOLD, MAX_THRESHOLD).toFixed(2));
}

export function clampSampleSize(sampleSize: number): number {
  return Math.round(clamp(sampleSize, MIN_SAMPLE_SIZE, MAX_SAMPLE_SIZE));
}

export function sigmoid(z: number): number {
  if (z >= 35) return 1;
  if (z <= -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

export function binaryLogLoss(y: 0 | 1, p: number): number {
  const safeP = Math.max(EPS, Math.min(1 - EPS, p));
  return y === 1 ? -Math.log(safeP) : -Math.log(1 - safeP);
}

export function alwaysZeroBaseline(messages: readonly { label: 0 | 1 }[]): number {
  if (messages.length === 0) return 0;
  let zeros = 0;
  for (const m of messages) if (m.label === 0) zeros++;
  return zeros / messages.length;
}

export type EtaRegime = {
  id: "slow" | "steady" | "volatile";
  label: string;
  summary: string;
};

export function classifyEtaRegime(eta: number): EtaRegime {
  if (eta < 0.015) {
    return {
      id: "slow",
      label: "较小的学习率",
      summary: "模型每次调整的幅度较小。在相同轮数下，损失可能下降得较慢。",
    };
  }
  if (eta <= 0.6) {
    return {
      id: "steady",
      label: "中等学习率",
      summary: "你可以先用这个范围训练，再比较训练损失和验证损失是否一起下降。",
    };
  }
  return {
    id: "volatile",
    label: "较大的学习率",
    summary: "模型每次调整的幅度较大，损失可能反复波动。请检查验证结果是否改善。",
  };
}

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

export type EpochSnapshot = {
  epoch: number;
  trainLoss: number;
  valLoss: number;
  trainAcc: number;
  valMetrics: ClassificationMetrics;
  bias: number;
  topSpam: WordWeightEntry[];
  topHam: WordWeightEntry[];
};

export type IntraEpochPoint = {
  checkpointIndex: number;
  epochFloat: number;
  sgdValLoss: number;
  sampleLabel: 0 | 1;
};

export type BgdEpochPoint = {
  epoch: number;
  bgdTrainLoss: number;
  bgdValLoss: number;
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

export type TrainingRun = {
  trainCount: number;
  eta: number;
  epochs: number;
  threshold: number;
  seed: number;
  vocabSize: number;
  baselineAcc: number;
  trainSpamRate: number;
  epochsHistory: EpochSnapshot[];
  intraEpochTrace: IntraEpochPoint[];
  bgdHistory: BgdEpochPoint[];
  finalModel: TrainedModel;
  valPredictions: MessagePrediction[];
  finalMetrics: ClassificationMetrics;
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

export type ThresholdCurvePoint = {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  fp: number;
  fn: number;
};

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

function evaluateVecSet(
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

function extractTopWords(
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

export type TrainingOptions = {
  trainMessages?: readonly CorpusMessage[];
  valMessages?: readonly CorpusMessage[];
  trainCount?: number;
  eta: number;
  epochs: number;
  threshold?: number;
  seed?: number;
  shuffleEpochs?: boolean;
  includeTrace?: boolean;
  includeBgd?: boolean;
  topWordsCount?: number;
};

type PreparedPublicSplit = {
  vocab: string[];
  vocabSet: Set<string>;
  wordToIndex: Map<string, number>;
  docFreq: Int32Array;
  trainVecs: VectorizedMessage[];
  valVecs: VectorizedMessage[];
};

const publicSplitCache = new Map<number, PreparedPublicSplit>();

function getPreparedPublicSplit(trainCount: number): PreparedPublicSplit {
  const cached = publicSplitCache.get(trainCount);
  if (cached) return cached;
  const pub = getPublicCorpus();
  const trainSlice = pub.train.slice(0, trainCount);
  const { vocab, vocabSet, wordToIndex, docFreq } = buildVocabFromTrain(trainSlice);
  const prepared: PreparedPublicSplit = {
    vocab,
    vocabSet,
    wordToIndex,
    docFreq,
    trainVecs: vectorizeMessages(trainSlice, wordToIndex),
    valVecs: vectorizeMessages(pub.val, wordToIndex),
  };
  if (publicSplitCache.size >= 32) {
    const oldest = publicSplitCache.keys().next().value;
    if (oldest !== undefined) publicSplitCache.delete(oldest);
  }
  publicSplitCache.set(trainCount, prepared);
  return prepared;
}

/**
 * Deterministic Bag-of-Words logistic regression trainer using seeded
 * per-epoch shuffled SGD (with optional real intra-epoch SGD checkpoints
 * and full-batch BGD epoch reference).
 */
export function trainLogisticRegression(options: TrainingOptions): TrainingRun {
  const usesCustomCorpus = Boolean(options.trainMessages || options.valMessages);
  const pub = getPublicCorpus();
  const fullTrain = options.trainMessages ?? pub.train;
  const valMessages = options.valMessages ?? pub.val;

  const trainCount = clamp(
    Math.round(options.trainCount ?? fullTrain.length),
    Math.min(MIN_SAMPLE_SIZE, fullTrain.length),
    fullTrain.length,
  );
  const eta = clampEta(options.eta);
  const epochs = clampEpochs(options.epochs);
  const threshold = clampThreshold(options.threshold ?? 0.5);
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed!) : DEFAULT_TRAIN_SEED;
  const shuffleEpochs = options.shuffleEpochs ?? true;
  const topWordsCount = options.topWordsCount ?? 10;

  let vocab: string[];
  let vocabSet: Set<string>;
  let wordToIndex: Map<string, number>;
  let docFreq: Int32Array;
  let trainVecs: VectorizedMessage[];
  let valVecs: VectorizedMessage[];

  if (!usesCustomCorpus) {
    const prepared = getPreparedPublicSplit(trainCount);
    vocab = prepared.vocab;
    vocabSet = prepared.vocabSet;
    wordToIndex = prepared.wordToIndex;
    docFreq = prepared.docFreq;
    trainVecs = prepared.trainVecs;
    valVecs = prepared.valVecs;
  } else {
    const trainSlice = fullTrain.slice(0, trainCount);
    const built = buildVocabFromTrain(trainSlice);
    vocab = built.vocab;
    vocabSet = built.vocabSet;
    wordToIndex = built.wordToIndex;
    docFreq = built.docFreq;
    trainVecs = vectorizeMessages(trainSlice, wordToIndex);
    valVecs = vectorizeMessages(valMessages, wordToIndex);
  }

  const weights = new Float64Array(vocab.length);
  let bias = 0;

  const evalLossAndAcc = (vecs: readonly VectorizedMessage[], w: Float64Array, b: number) => {
    let lossSum = 0;
    let correct = 0;
    for (let i = 0; i < vecs.length; i++) {
      const m = vecs[i];
      let z = b;
      const ids = m.activeIds;
      for (let k = 0; k < ids.length; k++) z += w[ids[k]];
      const p = sigmoid(z);
      lossSum += binaryLogLoss(m.label, p);
      if ((p >= threshold ? 1 : 0) === m.label) correct++;
    }
    return {
      loss: vecs.length > 0 ? lossSum / vecs.length : 0,
      acc: vecs.length > 0 ? correct / vecs.length : 0,
    };
  };

  const epochsHistory: EpochSnapshot[] = [];
  const valEval0 = evaluateVecSet(valVecs, weights, bias, threshold);
  const trEval0 = evalLossAndAcc(trainVecs, weights, bias);
  epochsHistory.push({
    epoch: 0,
    trainLoss: trEval0.loss,
    valLoss: valEval0.metrics.loss,
    trainAcc: trEval0.acc,
    valMetrics: valEval0.metrics,
    bias,
    topSpam: [],
    topHam: [],
  });

  const intraEpochTrace: IntraEpochPoint[] = [];
  if (options.includeTrace) {
    intraEpochTrace.push({
      checkpointIndex: 0,
      epochFloat: 0,
      sgdValLoss: valEval0.metrics.loss,
      sampleLabel: 0,
    });
  }

  const checkpointsPerEpoch = 10;
  const traceEpochs = Math.min(3, epochs);
  let checkpointIdx = 1;
  const order = Array.from({ length: trainVecs.length }, (_, idx) => idx);
  const rng = mulberry32(seed);

  for (let epoch = 1; epoch <= epochs; epoch++) {
    if (shuffleEpochs) shuffleOrder(order, rng);
    const sampleStep = Math.max(1, Math.floor(trainVecs.length / checkpointsPerEpoch));
    for (let i = 0; i < trainVecs.length; i++) {
      const sample = trainVecs[order[i]];
      const ids = sample.activeIds;
      let z = bias;
      for (let k = 0; k < ids.length; k++) z += weights[ids[k]];
      const p = sigmoid(z);
      const step = eta * (p - sample.label);
      for (let k = 0; k < ids.length; k++) {
        weights[ids[k]] -= step;
      }
      bias -= step;

      if (
        options.includeTrace &&
        epoch <= traceEpochs &&
        ((i + 1) % sampleStep === 0 || i === trainVecs.length - 1)
      ) {
        const probe = evalLossAndAcc(valVecs, weights, bias);
        intraEpochTrace.push({
          checkpointIndex: checkpointIdx++,
          epochFloat: Number((epoch - 1 + (i + 1) / trainVecs.length).toFixed(3)),
          sgdValLoss: probe.loss,
          sampleLabel: sample.label,
        });
      }
    }

    const trEval = evalLossAndAcc(trainVecs, weights, bias);
    const valEval = evaluateVecSet(valVecs, weights, bias, threshold);
    const top = extractTopWords(vocab, weights, docFreq, topWordsCount);
    epochsHistory.push({
      epoch,
      trainLoss: trEval.loss,
      valLoss: valEval.metrics.loss,
      trainAcc: trEval.acc,
      valMetrics: valEval.metrics,
      bias,
      topSpam: top.topSpam,
      topHam: top.topHam,
    });
  }

  const bgdHistory: BgdEpochPoint[] = [];
  if (options.includeBgd) {
    const bgdW = new Float64Array(vocab.length);
    let bgdB = 0;
    const gradW = new Float64Array(vocab.length);
    const tr0 = evalLossAndAcc(trainVecs, bgdW, bgdB);
    const va0 = evalLossAndAcc(valVecs, bgdW, bgdB);
    bgdHistory.push({ epoch: 0, bgdTrainLoss: tr0.loss, bgdValLoss: va0.loss });
    const invN = trainVecs.length > 0 ? eta / trainVecs.length : 0;

    for (let epoch = 1; epoch <= epochs; epoch++) {
      gradW.fill(0);
      let gradB = 0;
      for (let i = 0; i < trainVecs.length; i++) {
        const sample = trainVecs[i];
        let z = bgdB;
        const ids = sample.activeIds;
        for (let k = 0; k < ids.length; k++) z += bgdW[ids[k]];
        const err = sigmoid(z) - sample.label;
        for (let k = 0; k < ids.length; k++) gradW[ids[k]] += err;
        gradB += err;
      }
      for (let k = 0; k < bgdW.length; k++) {
        if (gradW[k] !== 0) bgdW[k] -= invN * gradW[k];
      }
      bgdB -= invN * gradB;
      const tr = evalLossAndAcc(trainVecs, bgdW, bgdB);
      const va = evalLossAndAcc(valVecs, bgdW, bgdB);
      bgdHistory.push({ epoch, bgdTrainLoss: tr.loss, bgdValLoss: va.loss });
    }
  }

  const finalEval = evaluateVecSet(valVecs, weights, bias, threshold);
  const weightsByWord = new Map<string, number>();
  for (let i = 0; i < vocab.length; i++) {
    weightsByWord.set(vocab[i], weights[i]);
  }

  let trainSpamCount = 0;
  for (let i = 0; i < trainVecs.length; i++) {
    if (trainVecs[i].label === 1) trainSpamCount++;
  }
  const trainSpamRate = trainVecs.length > 0 ? trainSpamCount / trainVecs.length : 0;

  return {
    trainCount,
    eta,
    epochs,
    threshold,
    seed,
    vocabSize: vocab.length,
    baselineAcc: alwaysZeroBaseline(valMessages),
    trainSpamRate,
    epochsHistory,
    intraEpochTrace,
    bgdHistory,
    finalModel: {
      vocab,
      vocabSet,
      wordToIndex,
      docFreq,
      weights,
      bias,
      weightsByWord,
    },
    valPredictions: finalEval.predictions,
    finalMetrics: finalEval.metrics,
  };
}

export function singleUpdateDemo(
  predictedP: number,
  trueLabel: 0 | 1,
  eta: number,
): {
  loss: number;
  errorSignal: number;
  deltaW: number;
  direction: "up" | "down" | "zero";
} {
  const safeP = clamp(predictedP, 0.01, 0.99);
  const safeEta = clampEta(eta);
  const errorSignal = safeP - trueLabel;
  const deltaW = -safeEta * errorSignal;
  return {
    loss: binaryLogLoss(trueLabel, safeP),
    errorSignal,
    deltaW,
    direction: deltaW > 1e-6 ? "up" : deltaW < -1e-6 ? "down" : "zero",
  };
}

export function findTrainingExamplesForWord(
  word: string,
  trainCount = MAX_SAMPLE_SIZE,
  limit = 4,
): { label: 0 | 1; text: string }[] {
  const { train } = getPublicCorpus();
  const hits: { label: 0 | 1; text: string }[] = [];
  const cap = clamp(Math.round(trainCount), 1, train.length);
  for (let i = 0; i < cap; i++) {
    const msg = train[i];
    if (msg.tokens.includes(word)) {
      hits.push({ label: msg.label, text: msg.text });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

export type CalibrationMessage = {
  id: string;
  label: 0 | 1;
  text: string;
  tokens: string[];
  tag: string;
};

export type ManualEvalItem = {
  id: string;
  label: 0 | 1;
  pred: 0 | 1;
  correct: boolean;
  rawZ: number;
  probability: number;
  activeWeights: { word: string; weight: number }[];
};

/** Evaluates a manual weight dictionary & bias on the Stage-2 calibration SMS set. */
export function evaluateManualWeights(
  weights: Readonly<Record<string, number>>,
  bias: number,
  messages: readonly CalibrationMessage[],
  threshold = 0.5,
): {
  items: ManualEvalItem[];
  correctCount: number;
  emptyProbability: number;
} {
  const items: ManualEvalItem[] = messages.map((msg) => {
    let rawZ = bias;
    const seen = new Set<string>();
    const activeWeights: { word: string; weight: number }[] = [];
    for (const tok of msg.tokens) {
      if (seen.has(tok)) continue;
      seen.add(tok);
      if (Object.prototype.hasOwnProperty.call(weights, tok)) {
        const weight = weights[tok];
        rawZ += weight;
        activeWeights.push({ word: tok, weight });
      }
    }
    const probability = sigmoid(rawZ);
    const pred: 0 | 1 = probability >= threshold ? 1 : 0;
    return {
      id: msg.id,
      label: msg.label,
      pred,
      correct: pred === msg.label,
      rawZ,
      probability,
      activeWeights,
    };
  });

  return {
    items,
    correctCount: items.filter((item) => item.correct).length,
    emptyProbability: sigmoid(bias),
  };
}
