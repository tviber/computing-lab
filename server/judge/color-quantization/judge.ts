import { evaluateQuantSubmission } from "../../../src/features/color-quantization/lesson/judge.ts";
/**
 * Color-quantization judge: evaluates a submitted toner choice against the
 * public+hidden gallery of the stage's category. Pure data in, verdict out —
 * student code is never executed here; `code` is stored as a snapshot only.
 *
 *   pick stage: submission is the set of loaded toner cartridges; the
 *               printer applies its fixed nearest-toner rule.
 *   free stage: submission is a full mapping table over the source colors;
 *               entries must stay inside the stage's fixed loadout, and at
 *               most `overrideBudget` may differ from the default table.
 */

import type { DatabaseSync } from "node:sqlite";
import type { QuantJudgeResult } from "../../../src/features/color-quantization/domain/protocol.ts";
import {
  getQuantStage,
  nextQuantStage,
} from "../../../src/features/color-quantization/domain/stages.ts";
import type { StageDraft } from "../../../src/features/color-quantization/lesson/state.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";
import { judgeGalleryFor } from "./hiddenSet.ts";

export function judgeQuantSubmission(
  db: DatabaseSync,
  project: ProjectRow<StageDraft>,
  stageIndex: number,
  rawSubmission: unknown,
  rawCode?: unknown,
  options?: { bypassLock?: boolean },
): QuantJudgeResult | LabJudgeError {
  if (!getQuantStage(stageIndex)) return { error: "unknown-stage", status: 400 };
  const evaluation = evaluateQuantSubmission(
    project,
    stageIndex,
    rawSubmission,
    rawCode,
    judgeGalleryFor(getQuantStage(stageIndex)!.category),
    options,
  );
  if ("error" in evaluation) return evaluation;
  const { result, score, total, passed, stage } = evaluation;
  const code = typeof rawCode === "string" ? rawCode.slice(0, 8000) : undefined;
  const testSummary = {
    tonersUsed: result.tonersUsed,
    slotsUsed: result.slotsUsed,
    overrides: result.overrides,
    accuracy: result.accuracy,
    identified: result.identified,
    total: result.total,
    requiredAccuracy: stage.requiredAccuracy,
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
      snapshot: { mode: stage.mode, submission: rawSubmission ?? {}, code },
      score,
      total,
      passed,
      testSummary,
    });
    if (passed) {
      const progress = advanceStage(db, project, stageIndex, nextQuantStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  return result;
}
