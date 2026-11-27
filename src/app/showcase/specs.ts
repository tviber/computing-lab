import { sanitizeGraph, type ComponentDef } from "../../features/calculator/domain/graph";
import {
  CALCULATOR_STAGES,
  calculatorStageAffectedByReset,
  nextMainlineStage,
} from "../../features/calculator/domain/stages";
import {
  evaluateCalculatorSubmission,
  mergeCustomComponents,
} from "../../features/calculator/lesson/judge";
import { publicCasesFor } from "../../features/calculator/lesson/publicCases";
import { DECODING_STAGES, nextDecodingStage } from "../../features/decoding/domain/stages";
import { generatePayload } from "../../features/decoding/domain/payload";
import { seedFor } from "../../features/decoding/domain/rng";
import { evaluateDecodingSubmission } from "../../features/decoding/lesson/judge";
import { sanitizeDraft as sanitizeDecoding } from "../../features/decoding/lesson/state";
import { evaluateImageSubmission } from "../../features/image-sampling/lesson/judge";
import { sanitizeDraft as sanitizeSampling } from "../../features/image-sampling/lesson/state";
import {
  IMAGE_SAMPLING_STAGES,
  getSamplingStage,
  nextSamplingStage,
} from "../../features/image-sampling/domain/stages";
import { publicGalleryFor as samplingGallery } from "../../features/image-sampling/domain/fixtures";
import { evaluateQuantSubmission } from "../../features/color-quantization/lesson/judge";
import { sanitizeDraft as sanitizeQuant } from "../../features/color-quantization/lesson/state";
import {
  COLOR_QUANT_STAGES,
  getQuantStage,
  nextQuantStage,
} from "../../features/color-quantization/domain/stages";
import { publicGalleryFor as quantGallery } from "../../features/color-quantization/domain/fixtures";
import { evaluateLunchShiftSubmission } from "../../features/lunch-shift/lesson/judge";
import { sanitizeLunchDraft } from "../../features/lunch-shift/lesson/state";
import { INTAKE_SCENARIO, trainingOrderFor } from "../../features/lunch-shift/domain/scenarios";
import {
  LUNCH_STAGES,
  lunchStageAffectedByReset,
  lunchStageUnlocked,
  nextLunchStage,
} from "../../features/lunch-shift/domain/stages";
import { evaluateLogisticRegressionSubmission } from "../../features/logistic-regression/lesson/judge";
import { sanitizeLogisticRegressionDraft } from "../../features/logistic-regression/lesson/state";
import {
  LOGISTIC_REGRESSION_STAGES,
  nextLogisticRegressionStage,
} from "../../features/logistic-regression/domain/stages";
import type { TrainingSettings } from "../../features/logistic-regression/domain/protocol";
import { evaluateStatsStage } from "../../features/stats-foundations/lesson/judge";
import { sanitizeStatsFoundationsDraft } from "../../features/stats-foundations/domain/drafts";
import {
  STATS_FOUNDATIONS_STAGES,
  statsFoundationsStageUnlocked,
  nextStatsFoundationsStage,
} from "../../features/stats-foundations/domain/stages";
import type { LabId } from "../../shared/lab/labMetadata";
import type { JudgeProject, LabJudgeError } from "../../shared/lab/judging";

export type LocalProject = JudgeProject & {
  drafts: Record<string, unknown>;
  draftRevisions: Record<string, number>;
  projectGeneration: number;
  runSummaries: Record<string, unknown>;
  trainedSettings?: TrainingSettings;
  fullAdderGuideAcknowledged?: boolean;
};

type Result = { passed: boolean; [key: string]: unknown };
type LocalSpec = {
  stages: readonly { index: number }[];
  sanitize: (stage: number, body: Record<string, unknown>) => unknown;
  evaluate: (
    project: LocalProject,
    stage: number,
    body: Record<string, unknown>,
  ) => Result | LabJudgeError;
  next: (passed: number[]) => number;
  affected?: (from: number, stage: number) => boolean;
  extras?: (project: LocalProject) => Record<string, unknown>;
};

function verdict(value: { result: Result } | LabJudgeError): Result | LabJudgeError {
  return "error" in value ? value : value.result;
}

export const localSpecs: Record<LabId, LocalSpec> = {
  calculator: {
    stages: CALCULATOR_STAGES,
    sanitize: (_stage, body) => sanitizeGraph(body.graph),
    evaluate: (project, stage, body) => {
      const evaluation = evaluateCalculatorSubmission(
        project,
        stage,
        body.graph,
        body.components,
        publicCasesFor(stage),
      );
      if ("error" in evaluation) return evaluation;
      const { graph, score, total, passed, testSummary } = evaluation;
      const unlockedComponent = passed ? evaluation.stage.unlocks : null;
      if (unlockedComponent) {
        project.unlockedSubmodules = [
          ...(project.unlockedSubmodules as ComponentDef[]).filter(
            (component) => component.name.toLowerCase() !== unlockedComponent.toLowerCase(),
          ),
          { name: unlockedComponent, graph },
        ];
        project.draftRevisions.components = (project.draftRevisions.components ?? 0) + 1;
      }
      return {
        score,
        total,
        passed,
        testSummary,
        unlockedComponent,
        componentsRevision: unlockedComponent ? project.draftRevisions.components : null,
        unlockedSubmodules: unlockedComponent ? project.unlockedSubmodules : null,
      };
    },
    next: nextMainlineStage,
    affected: calculatorStageAffectedByReset,
  },
  decoding: {
    stages: DECODING_STAGES,
    sanitize: (_stage, body) => sanitizeDecoding(body.draft),
    evaluate: (project, stage, body) => verdict(evaluateDecodingSubmission(project, stage, body)),
    next: nextDecodingStage,
    extras: (project) => ({
      payloads: Object.fromEntries(
        DECODING_STAGES.map((stage) => [
          stage.index,
          generatePayload(stage, seedFor(project.userId, "decoding", stage.index)).payload,
        ]),
      ),
    }),
  },
  "image-sampling": {
    stages: IMAGE_SAMPLING_STAGES,
    sanitize: (_stage, body) => sanitizeSampling(body.draft),
    evaluate: (project, stage, body) =>
      verdict(
        evaluateImageSubmission(
          project,
          stage,
          body,
          body.code,
          samplingGallery(getSamplingStage(stage)!.category),
        ),
      ),
    next: nextSamplingStage,
  },
  "color-quantization": {
    stages: COLOR_QUANT_STAGES,
    sanitize: (_stage, body) => sanitizeQuant(body.draft),
    evaluate: (project, stage, body) =>
      verdict(
        evaluateQuantSubmission(
          project,
          stage,
          body,
          body.code,
          quantGallery(getQuantStage(stage)!.category),
        ),
      ),
    next: nextQuantStage,
  },
  "lunch-shift": {
    stages: LUNCH_STAGES,
    sanitize: (stage, body) => sanitizeLunchDraft(stage, body.draft),
    evaluate: (project, stage, body) =>
      verdict(evaluateLunchShiftSubmission(project, stage, body.draft, INTAKE_SCENARIO)),
    next: nextLunchStage,
    affected: lunchStageAffectedByReset,
    extras: (project) => ({
      training: trainingOrderFor(project.userId),
      aiOrders: lunchStageUnlocked(project.passedStages, 4)
        ? INTAKE_SCENARIO.orders.map(({ id, request }) => ({ id, request }))
        : null,
    }),
  },
  "logistic-regression": {
    stages: LOGISTIC_REGRESSION_STAGES,
    sanitize: (stage, body) => sanitizeLogisticRegressionDraft(stage, body.draft),
    evaluate: (project, stage, body) =>
      verdict(
        evaluateLogisticRegressionSubmission(project, stage, body.draft, project.trainedSettings),
      ),
    next: nextLogisticRegressionStage,
  },
  "stats-foundations": {
    stages: STATS_FOUNDATIONS_STAGES,
    sanitize: (stage, body) => sanitizeStatsFoundationsDraft(stage, body.draft),
    evaluate: (project, stage, body) => {
      if (!statsFoundationsStageUnlocked(stage, project.passedStages))
        return { error: "stage-locked", status: 409 };
      return {
        ...evaluateStatsStage(stage, sanitizeStatsFoundationsDraft(stage, body.draft)),
        stageIndex: stage,
        nextStage: nextStatsFoundationsStage(stage),
      };
    },
    next: (passed) =>
      STATS_FOUNDATIONS_STAGES.find((stage) => !passed.includes(stage.index))?.index ??
      STATS_FOUNDATIONS_STAGES.length + 1,
  },
};

export { mergeCustomComponents };
