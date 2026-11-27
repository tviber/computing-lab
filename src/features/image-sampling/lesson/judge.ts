import { diffBounds } from "../domain/bitmap.ts";
import { sanitizeResolution } from "../domain/downsample.ts";
import type { SamplingJudgeResult } from "../domain/protocol.ts";
import { confusionPairs, encodeVerdictDetail, judgeResolution } from "../domain/recognize.ts";
import { getSamplingStage } from "../domain/stages.ts";

import { gateStage, type JudgeProject } from "../../../shared/lab/judging.ts";
export function evaluateImageSubmission(
  project: JudgeProject,
  stageIndex: number,
  rawResolution: unknown,
  rawCode: unknown,
  gallery: import("../domain/sprites.ts").GalleryEntry[],
  options?: { bypassLock?: boolean },
) {
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

  return { result, score: report.identified, total: report.total, passed, stage };
}
