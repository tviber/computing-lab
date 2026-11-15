export const STRATEGY_WORDS = [
  "中奖",
  "妈妈",
  "今天",
  "发票",
  "开会",
  "通知",
  "退款",
  "老师",
  "明天",
  "优惠",
] as const;

export type StrategyWord = (typeof STRATEGY_WORDS)[number];

export const MIN_STRATEGY_WEIGHT = -5;
export const MAX_STRATEGY_WEIGHT = 5;
export const STRATEGY_WEIGHT_STEP = 0.5;
export const STRATEGY_THRESHOLD = 0.5;
export const STRATEGY_BASELINE_PROB = 0.15;

export type StrategyMessage = {
  id: string;
  label: 0 | 1;
  text: string;
  tag: string;
  tokens: readonly StrategyWord[];
};

export const STRATEGY_SMS_EXAMPLES: readonly StrategyMessage[] = [
  {
    id: "st-spam-1",
    label: 1,
    tag: "中奖退款",
    text: "中奖通知！今天的发票和退款！",
    tokens: ["中奖", "通知", "今天", "发票", "退款"],
  },
  {
    id: "st-spam-2",
    label: 1,
    tag: "优惠发票",
    text: "通知：今天明天都有优惠发票！",
    tokens: ["通知", "今天", "明天", "优惠", "发票"],
  },
  {
    id: "st-spam-3",
    label: 1,
    tag: "混入日常词诱骗",
    text: "开会通知：今天中奖的优惠和退款！",
    tokens: ["开会", "通知", "今天", "中奖", "优惠", "退款"],
  },
  {
    id: "st-ham-1",
    label: 0,
    tag: "家校日常",
    text: "妈妈通知：明天和老师开会。",
    tokens: ["妈妈", "通知", "明天", "老师", "开会"],
  },
  {
    id: "st-ham-2",
    label: 0,
    tag: "纯中性词检验",
    text: "今天和明天的通知。",
    tokens: ["今天", "明天", "通知"],
  },
  {
    id: "st-ham-3",
    label: 0,
    tag: "含报销词的日常",
    text: "妈妈明天和老师开会，要今天的发票和退款。",
    tokens: ["妈妈", "明天", "老师", "开会", "今天", "发票", "退款"],
  },
];

/**
 * Calibrated piecewise linear score-to-probability mapping for the Stage 1
 * 10-word strategy activity. Deliberately avoids unbiased Logistic Regression
 * (`sigmoid(0) = 50%`) so neutral messages with `w · x = 0` sit at a low 15%
 * prior instead of hovering on the 50% spam boundary, and small positive scores
 * scale smoothly without saturating too abruptly.
 */
export function strategyScoreToProbability(score: number): number {
  if (!Number.isFinite(score)) return STRATEGY_BASELINE_PROB;
  if (score <= 0) {
    return Math.max(0.02, Math.min(STRATEGY_BASELINE_PROB, STRATEGY_BASELINE_PROB + 0.03 * score));
  }
  if (score < 1) {
    return STRATEGY_BASELINE_PROB + 0.4 * score;
  }
  return Math.min(0.98, 0.55 + 0.06 * (score - 1));
}

export type StrategyWordContribution = {
  word: StrategyWord;
  present: 0 | 1;
  weight: number;
  contribution: number;
};

export type StrategyItemEval = {
  message: StrategyMessage;
  score: number;
  prob: number;
  pred: 0 | 1;
  ok: boolean;
  contributions: StrategyWordContribution[];
};

export type StrategyEvalResult = {
  items: StrategyItemEval[];
  correctCount: number;
  totalCount: number;
  positiveWordCount: number;
  negativeWordCount: number;
};

export function clampStrategyWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(MIN_STRATEGY_WEIGHT, Math.min(MAX_STRATEGY_WEIGHT, value));
  return Math.round(clamped * 2) / 2;
}

export function evaluateStrategyWeights(weights: Record<string, number>): StrategyEvalResult {
  const normalized = Object.fromEntries(
    STRATEGY_WORDS.map((word) => [word, clampStrategyWeight(weights[word] ?? 0)]),
  ) as Record<StrategyWord, number>;

  let positiveWordCount = 0;
  let negativeWordCount = 0;
  for (const word of STRATEGY_WORDS) {
    if (normalized[word] > 0) positiveWordCount += 1;
    if (normalized[word] < 0) negativeWordCount += 1;
  }

  const items: StrategyItemEval[] = STRATEGY_SMS_EXAMPLES.map((message) => {
    const tokenSet = new Set<string>(message.tokens);
    let score = 0;
    const contributions: StrategyWordContribution[] = STRATEGY_WORDS.map((word) => {
      const present: 0 | 1 = tokenSet.has(word) ? 1 : 0;
      const weight = normalized[word];
      const contribution = present * weight;
      score += contribution;
      return { word, present, weight, contribution };
    });
    const prob = strategyScoreToProbability(score);
    const pred: 0 | 1 = prob >= STRATEGY_THRESHOLD ? 1 : 0;
    return {
      message,
      score,
      prob,
      pred,
      ok: pred === message.label,
      contributions,
    };
  });

  const correctCount = items.filter((item) => item.ok).length;
  return {
    items,
    correctCount,
    totalCount: items.length,
    positiveWordCount,
    negativeWordCount,
  };
}
