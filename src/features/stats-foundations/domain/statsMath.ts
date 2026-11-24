export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// ============================================================================
// Stage 1: Linear Regression (Campus Milk Tea Shop: Temperature -> Cups Sold)
// ============================================================================

export type MilkTeaPoint = {
  day: number;
  temp: number; // Celsius
  cups: number; // Cups sold
};

/** 10 days of campus milk tea sales. True underlying trend ~ 3.2 * temp - 22 + small noise. */
export const MILK_TEA_DATA: readonly MilkTeaPoint[] = [
  { day: 1, temp: 16, cups: 28 },
  { day: 2, temp: 18, cups: 36 },
  { day: 3, temp: 19, cups: 38 },
  { day: 4, temp: 21, cups: 46 },
  { day: 5, temp: 22, cups: 45 },
  { day: 6, temp: 24, cups: 58 },
  { day: 7, temp: 25, cups: 56 },
  { day: 8, temp: 27, cups: 65 },
  { day: 9, temp: 28, cups: 68 },
  { day: 10, temp: 30, cups: 76 },
];

export const LINEAR_SLOPE_MIN = 0;
export const LINEAR_SLOPE_MAX = 6;
export const LINEAR_INTERCEPT_MIN = -50;
export const LINEAR_INTERCEPT_MAX = 40;
export const LINEAR_MSE_THRESHOLD = 16;

export type LinearFitMetrics = {
  slope: number;
  intercept: number;
  mse: number;
  sse: number;
  residuals: { day: number; temp: number; cups: number; predicted: number; residual: number }[];
  predictAt30: number;
};

export function evaluateLinearFit(slope: number, intercept: number): LinearFitMetrics {
  const w = clamp(slope, LINEAR_SLOPE_MIN, LINEAR_SLOPE_MAX);
  const b = clamp(intercept, LINEAR_INTERCEPT_MIN, LINEAR_INTERCEPT_MAX);
  let sse = 0;
  const residuals = MILK_TEA_DATA.map((pt) => {
    const predicted = w * pt.temp + b;
    const residual = pt.cups - predicted;
    sse += residual * residual;
    return { ...pt, predicted, residual };
  });
  const mse = sse / MILK_TEA_DATA.length;
  return {
    slope: w,
    intercept: b,
    mse,
    sse,
    residuals,
    predictAt30: w * 30 + b,
  };
}

export function computeOptimalLinearFit(): { slope: number; intercept: number; mse: number } {
  const n = MILK_TEA_DATA.length;
  const meanX = MILK_TEA_DATA.reduce((acc, p) => acc + p.temp, 0) / n;
  const meanY = MILK_TEA_DATA.reduce((acc, p) => acc + p.cups, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of MILK_TEA_DATA) {
    num += (p.temp - meanX) * (p.cups - meanY);
    den += (p.temp - meanX) ** 2;
  }
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  const { mse } = evaluateLinearFit(slope, intercept);
  return { slope, intercept, mse };
}

// ============================================================================
// Stage 2: Conditional Probability (Campus Weather Station: 100-Day Record)
// ============================================================================

export type WeatherOutcome = "tp" | "fp" | "fn" | "tn";

export const WEATHER_COUNTS = {
  tp: 24, // Forecast rain & actually rained
  fp: 16, // Forecast rain & did NOT rain
  fn: 6, // Forecast dry & actually rained
  tn: 54, // Forecast dry & did NOT rain
} as const;

export const WEATHER_TOTAL =
  WEATHER_COUNTS.tp + WEATHER_COUNTS.fp + WEATHER_COUNTS.fn + WEATHER_COUNTS.tn; // 100

/** Expected percentage answers (0-100). */
export const WEATHER_EXPECTED = {
  pRain: ((WEATHER_COUNTS.tp + WEATHER_COUNTS.fn) / WEATHER_TOTAL) * 100, // (24 + 6) / 100 = 30%
  pRainGivenForecast: (WEATHER_COUNTS.tp / (WEATHER_COUNTS.tp + WEATHER_COUNTS.fp)) * 100, // 24 / (24 + 16) = 24 / 40 = 60%
  pForecastGivenRain: (WEATHER_COUNTS.tp / (WEATHER_COUNTS.tp + WEATHER_COUNTS.fn)) * 100, // 24 / (24 + 6) = 24 / 30 = 80%
} as const;

export const WEATHER_GRID_CELLS: readonly { index: number; outcome: WeatherOutcome }[] = (() => {
  const cells: { index: number; outcome: WeatherOutcome }[] = [];
  const order: [WeatherOutcome, number][] = [
    ["tp", WEATHER_COUNTS.tp],
    ["fp", WEATHER_COUNTS.fp],
    ["fn", WEATHER_COUNTS.fn],
    ["tn", WEATHER_COUNTS.tn],
  ];
  let index = 0;
  for (const [outcome, count] of order) {
    for (let i = 0; i < count; i++) {
      cells.push({ index, outcome });
      index += 1;
    }
  }
  return cells;
})();

/** Bayes sandbox: given base rain rate, sensitivity P(F+|R+), false alarm rate P(F+|R-). */
export function computeBayesRain(
  baseRainPct: number,
  sensitivity = WEATHER_COUNTS.tp / (WEATHER_COUNTS.tp + WEATHER_COUNTS.fn),
  falseAlarm = WEATHER_COUNTS.fp / (WEATHER_COUNTS.fp + WEATHER_COUNTS.tn),
): { pRainGivenForecastPct: number; pForecastPct: number } {
  const pRain = clamp(baseRainPct, 1, 99) / 100;
  const pForecastAndRain = pRain * sensitivity;
  const pForecastAndDry = (1 - pRain) * falseAlarm;
  const pForecast = pForecastAndRain + pForecastAndDry;
  return {
    pRainGivenForecastPct: pForecast > 0 ? (pForecastAndRain / pForecast) * 100 : 0,
    pForecastPct: pForecast * 100,
  };
}

// ============================================================================
// Stage 3: Maximum Likelihood Estimation (Biased Coin: 7 Heads, 3 Tails)
// ============================================================================

export const COIN_TOSSES: readonly ("H" | "T")[] = [
  "H",
  "H",
  "T",
  "H",
  "H",
  "H",
  "T",
  "H",
  "T",
  "H",
];

export const COIN_HEADS = 7;
export const COIN_TAILS = 3;
export const COIN_P_MIN = 0.05;
export const COIN_P_MAX = 0.95;
export const COIN_MLE_OPTIMAL = COIN_HEADS / (COIN_HEADS + COIN_TAILS); // 0.7
export const COIN_MLE_TOLERANCE = 0.03; // [0.67, 0.73]

export function isNearCoinMLE(p: number): boolean {
  return (
    p >= roundTo(COIN_MLE_OPTIMAL - COIN_MLE_TOLERANCE) &&
    p <= roundTo(COIN_MLE_OPTIMAL + COIN_MLE_TOLERANCE)
  );
}

export function coinLikelihood(p: number, heads = COIN_HEADS, tails = COIN_TAILS): number {
  const prob = clamp(p, 0.001, 0.999);
  return prob ** heads * (1 - prob) ** tails;
}

export function coinNegLogLikelihood(p: number, heads = COIN_HEADS, tails = COIN_TAILS): number {
  const prob = clamp(p, 0.001, 0.999);
  return -(heads * Math.log(prob) + tails * Math.log(1 - prob));
}

export function sampleLikelihoodCurve(
  steps = 90,
  heads = COIN_HEADS,
  tails = COIN_TAILS,
): { p: number; likelihood: number; nll: number }[] {
  const out: { p: number; likelihood: number; nll: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = COIN_P_MIN + ((COIN_P_MAX - COIN_P_MIN) * i) / steps;
    out.push({
      p,
      likelihood: coinLikelihood(p, heads, tails),
      nll: coinNegLogLikelihood(p, heads, tails),
    });
  }
  return out;
}

// ============================================================================
// Stage 4: From Line to Probability (Study Hours -> Pass Quiz: Sigmoid Bridge)
// ============================================================================

export type StudyPoint = {
  id: number;
  name: string;
  hours: number;
  passed: 0 | 1;
};

export const STUDY_QUIZ_DATA: readonly StudyPoint[] = [
  { id: 1, name: "小宇", hours: 0.5, passed: 0 },
  { id: 2, name: "小琪", hours: 1.5, passed: 0 },
  { id: 3, name: "阿哲", hours: 2.0, passed: 0 },
  { id: 4, name: "林悦", hours: 3.0, passed: 0 },
  { id: 5, name: "陈晨", hours: 4.0, passed: 0 },
  { id: 6, name: "子涵", hours: 4.8, passed: 1 },
  { id: 7, name: "思远", hours: 5.5, passed: 1 },
  { id: 8, name: "雨桐", hours: 6.5, passed: 1 },
  { id: 9, name: "浩然", hours: 7.5, passed: 1 },
  { id: 10, name: "佳宁", hours: 9.0, passed: 1 },
];

export const SIGMOID_W_MIN = 0.2;
export const SIGMOID_W_MAX = 3.0;
export const SIGMOID_B_MIN = -18;
export const SIGMOID_B_MAX = 2;
export const SIGMOID_ACCURACY_THRESHOLD = 0.9;
export const SIGMOID_LOGLOSS_THRESHOLD = 0.35;

export function sigmoid(z: number): number {
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

export type SigmoidFitMetrics = {
  w: number;
  b: number;
  boundaryX: number;
  accuracy: number;
  correctCount: number;
  logLoss: number;
  likelihood: number;
  points: {
    id: number;
    name: string;
    hours: number;
    passed: 0 | 1;
    z: number;
    prob: number;
    predicted: 0 | 1;
    correct: boolean;
  }[];
};

export function evaluateSigmoidFit(rawW: number, rawB: number): SigmoidFitMetrics {
  const w = clamp(rawW, SIGMOID_W_MIN, SIGMOID_W_MAX);
  const b = clamp(rawB, SIGMOID_B_MIN, SIGMOID_B_MAX);
  let correctCount = 0;
  let totalNll = 0;
  let likelihood = 1;

  const points = STUDY_QUIZ_DATA.map((pt) => {
    const z = w * pt.hours + b;
    const prob = sigmoid(z);
    const predicted: 0 | 1 = prob >= 0.5 ? 1 : 0;
    const correct = predicted === pt.passed;
    if (correct) correctCount += 1;
    const pTrue = pt.passed === 1 ? prob : 1 - prob;
    const safeP = Math.max(1e-9, pTrue);
    totalNll += -Math.log(safeP);
    likelihood *= safeP;
    return {
      ...pt,
      z,
      prob,
      predicted,
      correct,
    };
  });

  return {
    w,
    b,
    boundaryX: -b / w,
    accuracy: correctCount / STUDY_QUIZ_DATA.length,
    correctCount,
    logLoss: totalNll / STUDY_QUIZ_DATA.length,
    likelihood,
    points,
  };
}

/** Linear OLS on the 0/1 study data, used to show why a straight line breaks for probabilities. */
export function linearFitOnStudyData(): { slope: number; intercept: number } {
  const n = STUDY_QUIZ_DATA.length;
  const meanX = STUDY_QUIZ_DATA.reduce((acc, p) => acc + p.hours, 0) / n;
  const meanY = STUDY_QUIZ_DATA.reduce((acc, p) => acc + p.passed, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of STUDY_QUIZ_DATA) {
    num += (p.hours - meanX) * (p.passed - meanY);
    den += (p.hours - meanX) ** 2;
  }
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}
