export const EPS = 1e-12;
export const BLIND_GUESS_LOSS = Math.LN2;

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
