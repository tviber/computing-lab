import { evaluateImageSubmission } from "../../../src/features/image-sampling/lesson/judge.ts";
/**
 * Image-sampling judge: evaluates a submitted resolution (w,h) against the
 * public+hidden gallery of the stage's category. Pure data in, verdict out —
 * student code is never executed here; `code` is stored as a snapshot only.
 */

import type { DatabaseSync } from "node:sqlite";
import type { SamplingJudgeResult } from "../../../src/features/image-sampling/domain/protocol.ts";
import {
  getSamplingStage,
  nextSamplingStage,
} from "../../../src/features/image-sampling/domain/stages.ts";
import type { StageDraft } from "../../../src/features/image-sampling/lesson/state.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";
import { judgeGalleryFor } from "./hiddenGallery.ts";

export function judgeImageSubmission(
  db: DatabaseSync,
  project: ProjectRow<StageDraft>,
  stageIndex: number,
  rawResolution: unknown,
  rawCode?: unknown,
  options?: { bypassLock?: boolean },
): SamplingJudgeResult | LabJudgeError {
  if (!getSamplingStage(stageIndex)) return { error: "unknown-stage", status: 400 };
  const evaluation = evaluateImageSubmission(
    project,
    stageIndex,
    rawResolution,
    rawCode,
    judgeGalleryFor(getSamplingStage(stageIndex)!.category),
    options,
  );
  if ("error" in evaluation) return evaluation;
  const { result, score, total, passed, stage } = evaluation;
  const code = typeof rawCode === "string" ? rawCode.slice(0, 8000) : undefined;
  const testSummary = {
    resolution: result.resolution,
    accuracy: result.accuracy,
    identified: result.identified,
    total: result.total,
    requiredAccuracy: stage.requiredAccuracy,
    cellBudget: stage.cellBudget,
    withinBudget: result.withinBudget,
    counterexample: result.counterexample,
    confusionPairs: result.confusionPairs,
    error: null,
  };
  // Submission row + progress update commit together.
  withTransaction(db, () => {
    result.submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot: { width: result.resolution.width, height: result.resolution.height, code },
      score,
      total,
      passed,
      testSummary,
    });
    if (passed) {
      const progress = advanceStage(db, project, stageIndex, nextSamplingStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  return result;
}
