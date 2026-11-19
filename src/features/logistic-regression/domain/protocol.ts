import type { ClassificationMetrics } from "./logisticRegression.ts";
import type { RawTokenStatus } from "./tokenizer.ts";

export type ConceptAnswers = Record<string, number>;

export type StrategyDraft = {
  weights: Record<string, number>;
  concepts: ConceptAnswers;
};

export type TokenizeDraft = {
  selectedPresetId: string;
  customText: string;
  classifications: Record<string, RawTokenStatus>;
  concepts: ConceptAnswers;
};

export type ScoreDraft = {
  weights: Record<string, number>;
  bias: number;
  selectedMsgId: string;
  concepts: ConceptAnswers;
};

export type TrainDraft = {
  eta: number;
  epochs: number;
  inspectEpoch: number;
  showBgd: boolean;
};

export type TrainingSettings = Pick<TrainDraft, "eta" | "epochs">;

export type ExperienceSubmission = {
  activity: "sms-classification";
  exampleId: string;
  prediction: 0 | 1;
};

export type LogisticRegressionDraft = StrategyDraft | TokenizeDraft | ScoreDraft | TrainDraft;

export type LogisticRegressionPartSummary = {
  id: string;
  label: string;
  ok: boolean;
  detail: string | null;
};

export type LogisticRegressionTestSummary = {
  parts: LogisticRegressionPartSummary[];
  metrics?: ClassificationMetrics & {
    trainLoss?: number;
    baselineAcc?: number;
  };
  detail: string;
  error?: string | null;
};

export type LogisticRegressionJudgeResult = {
  passed: boolean;
  score: number;
  total: number;
  testSummary: LogisticRegressionTestSummary;
  submissionId: string;
  currentStage: number;
  passedStages: number[];
  trainedSettings?: TrainingSettings;
};

export type LogisticRegressionRunSummaries = {
  s1: LogisticRegressionTestSummary | null;
  s2: LogisticRegressionTestSummary | null;
  s3: LogisticRegressionTestSummary | null;
  s4: LogisticRegressionTestSummary | null;
  s5: LogisticRegressionTestSummary | null;
};

export type LogisticRegressionProjectExtras = {
  runSummaries: LogisticRegressionRunSummaries;
  trainedSettings?: TrainingSettings;
};

export type LogisticRegressionProjectPayload = {
  currentStage: number;
  passedStages: number[];
  drafts?: Record<string, LogisticRegressionDraft>;
  draftRevisions?: Record<string, number>;
} & LogisticRegressionProjectExtras;
