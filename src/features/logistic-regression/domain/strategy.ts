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

export const MIN_STRATEGY_WEIGHT = -2;
export const MAX_STRATEGY_WEIGHT = 2;
export const STRATEGY_SCORE_SPAM_THRESHOLD = 1;

export type StrategyTier = {
  value: -2 | -1 | 0 | 1 | 2;
  label: string;
  shortLabel: string;
  role: "neg" | "zero" | "pos";
};

export const STRATEGY_WEIGHT_TIERS: readonly StrategyTier[] = [
  { value: -2, label: "−2 强正常", shortLabel: "−2", role: "neg" },
  { value: -1, label: "−1 偏正常", shortLabel: "−1", role: "neg" },
  { value: 0, label: "0 无关", shortLabel: "0", role: "zero" },
  { value: 1, label: "+1 偏垃圾", shortLabel: "+1", role: "pos" },
  { value: 2, label: "+2 强垃圾", shortLabel: "+2", role: "pos" },
] as const;

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

export type StrategyWordContribution = {
  word: StrategyWord;
  present: 0 | 1;
  weight: number;
  contribution: number;
};

export type StrategyItemEval = {
  message: StrategyMessage;
  score: number;
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
  const rounded = Math.round(clamped);
  return rounded === 0 ? 0 : rounded;
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
    const pred: 0 | 1 = score >= STRATEGY_SCORE_SPAM_THRESHOLD ? 1 : 0;
    return {
      message,
      score,
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
