/**
 * Image-sampling judge: evaluates a submitted resolution (w,h) against the
 * public+hidden gallery of the stage's category. Pure data in, verdict out —
 * student code is never executed here; `code` is stored as a snapshot only.
 */

import type { DatabaseSync } from "node:sqlite";
import { diffBounds } from "../../../src/features/image-sampling/domain/bitmap.ts";
import { sanitizeResolution } from "../../../src/features/image-sampling/domain/downsample.ts";
import type { SamplingJudgeResult } from "../../../src/features/image-sampling/domain/protocol.ts";
import {
  confusionPairs,
  encodeVerdictDetail,
  judgeResolution,
} from "../../../src/features/image-sampling/domain/recognize.ts";
import {
  getSamplingStage,
  nextSamplingStage,
} from "../../../src/features/image-sampling/domain/stages.ts";
import type { StageDraft } from "../../../src/features/image-sampling/lesson/state.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  insertSubmission,
  gateStage,
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
  const gated = gateStage(
    getSamplingStage(stageIndex),
    (stage) => stage.index <= 1 || project.passedStages.includes(stage.index - 1),
    options,
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;

  if (stage.requiresChooseSize && (typeof rawCode !== "string" || !rawCode.trim())) {
    return { error: "choose-size-required", status: 400 };
  }

  const resolution = sanitizeResolution(rawResolution);
  if (!resolution) return { error: "invalid-resolution", status: 400 };
  if (stage.mode === "square" && resolution.width !== resolution.height) {
    return { error: "square-resolution-required", status: 400 };
  }
  if (stage.mode === "tall" && resolution.height <= resolution.width) {
    return { error: "tall-resolution-required", status: 400 };
  }

  const gallery = judgeGalleryFor(stage.category);
  const report = judgeResolution(gallery, gallery, resolution.width, resolution.height);
  const withinBudget = report.cells <= stage.cellBudget;
  const passed = withinBudget && report.accuracy >= stage.requiredAccuracy;

  const failing = report.verdicts.find((v) => !v.ok);
  const failingQuery = failing ? gallery.find((e) => e.id === failing.queryId)! : null;
  const collidedEntry = failing?.collidedWith.length
    ? (gallery.find((e) => e.id === failing.collidedWith[0].id) ?? null)
    : null;
  const counterexample =
    failing && failingQuery
      ? encodeVerdictDetail(
          failingQuery,
          gallery.find((e) => e.id === failing.predictedId) ?? null,
          resolution.width,
          resolution.height,
          failing,
          collidedEntry ? diffBounds(failingQuery.image, collidedEntry.image) : null,
        )
      : null;
  const pairs = confusionPairs(gallery, resolution.width, resolution.height).slice(0, 6);

  const result: SamplingJudgeResult = {
    resolution: { width: resolution.width, height: resolution.height, cells: report.cells },
    identified: report.identified,
    total: report.total,
    accuracy: report.accuracy,
    requiredAccuracy: stage.requiredAccuracy,
    cellBudget: stage.cellBudget,
    withinBudget,
    passed,
    counterexample,
    confusionPairs: pairs,
    submissionId: "",
    currentStage: project.currentStage,
    passedStages: project.passedStages,
  };

  const code = typeof rawCode === "string" ? rawCode.slice(0, 8000) : undefined;
  const testSummary = {
    resolution: result.resolution,
    accuracy: result.accuracy,
    identified: result.identified,
    total: result.total,
    requiredAccuracy: stage.requiredAccuracy,
    cellBudget: stage.cellBudget,
    withinBudget,
    counterexample,
    confusionPairs: pairs,
    error: null,
  };
  // Submission row + progress update commit together.
  withTransaction(db, () => {
    result.submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot: { ...resolution, code },
      score: report.identified,
      total: report.total,
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
