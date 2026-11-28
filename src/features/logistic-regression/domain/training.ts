import { getPublicCorpus, type CorpusMessage } from "./corpus.ts";
import {
  alwaysZeroBaseline,
  binaryLogLoss,
  clamp,
  clampEpochs,
  clampEta,
  clampThreshold,
  MAX_SAMPLE_SIZE,
  MIN_SAMPLE_SIZE,
  sigmoid,
} from "./math.ts";
import {
  buildVocabFromTrain,
  evaluateVecSet,
  extractTopWords,
  vectorizeMessages,
  type ClassificationMetrics,
  type MessagePrediction,
  type TrainedModel,
  type VectorizedMessage,
  type WordWeightEntry,
} from "./vectorize.ts";

export const DEFAULT_TRAIN_SEED = 2026;

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
  /** Lesson interpreter; returns the updated bias using the same corpus and shuffle. */
  sampleUpdate?: (
    weights: Float64Array,
    bias: number,
    ids: readonly number[],
    label: 0 | 1,
    eta: number,
    probability: number,
  ) => number;
};

type PreparedPublicSplit = {
  vocab: string[];
  vocabSet: Set<string>;
  wordToIndex: Map<string, number>;
  docFreq: Int32Array;
  trainVecs: VectorizedMessage[];
  valVecs: VectorizedMessage[];
};

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
      if (options.sampleUpdate) {
        bias = options.sampleUpdate(weights, bias, ids, sample.label, eta, p);
      } else {
        const step = eta * (p - sample.label);
        for (let k = 0; k < ids.length; k++) {
          weights[ids[k]] -= step;
        }
        bias -= step;
      }

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
