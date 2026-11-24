export type LinearRegressionDraft = {
  slope: number;
  intercept: number;
  showSquares: boolean;
  answer: number | null;
};

export type ConditionalProbDraft = {
  pRain: string;
  pRainGivenForecast: string;
  pForecastGivenRain: string;
  answer: number | null;
};

export type LikelihoodDraft = {
  p: number;
  viewMode: "likelihood" | "nll";
  answer: number | null;
};

export type SigmoidBridgeDraft = {
  w: number;
  b: number;
  curveMode: "linear" | "sigmoid";
};

export type StatsFoundationsDraft =
  LinearRegressionDraft | ConditionalProbDraft | LikelihoodDraft | SigmoidBridgeDraft;

export type StatsFoundationsTestSummary = {
  stage: number;
  passed: boolean;
  detail: string;
};

export type StatsFoundationsJudgeResult = {
  passed: boolean;
  stageIndex: number;
  nextStage: number | null;
  passedStages: number[];
  summary: StatsFoundationsTestSummary;
  feedback: string;
};
