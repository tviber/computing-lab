import { sigmoid } from "./math.ts";

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
