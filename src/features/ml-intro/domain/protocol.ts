import type { ClassificationMetrics } from "./logreg.ts";
import type { RawTokenStatus } from "./tokenizer.ts";

export type ConceptAnswers = Record<string, number>;

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
  concepts: ConceptAnswers;
};

export type EvaluateDraft = {
  eta: number;
  epochs: number;
  threshold: number;
  activeBucket: "tp" | "fp" | "tn" | "fn";
  concepts: ConceptAnswers;
};

export type GeneralizeDraft = {
  sampleSize: number;
  eta: number;
  epochs: number;
  threshold: number;
  probeText: string;
  concepts: ConceptAnswers;
};

export type MlDraft = TokenizeDraft | ScoreDraft | TrainDraft | EvaluateDraft | GeneralizeDraft;

export type MlPartSummary = {
  id: string;
  label: string;
  ok: boolean;
  detail: string | null;
};

export type MlTestSummary = {
  parts: MlPartSummary[];
  metrics?: ClassificationMetrics & {
    trainLoss?: number;
    baselineAcc?: number;
  };
  detail: string;
  error?: string | null;
};

export type MlJudgeResult = {
  passed: boolean;
  score: number;
  total: number;
  testSummary: MlTestSummary;
  submissionId: string;
  currentStage: number;
  passedStages: number[];
};

export type MlRunSummaries = {
  s1: MlTestSummary | null;
  s2: MlTestSummary | null;
  s3: MlTestSummary | null;
  s4: MlTestSummary | null;
  s5: MlTestSummary | null;
};

export type MlProjectExtras = {
  runSummaries: MlRunSummaries;
};

export type MlProjectPayload = {
  currentStage: number;
  passedStages: number[];
  drafts?: Record<string, MlDraft>;
  draftRevisions?: Record<string, number>;
} & MlProjectExtras;
