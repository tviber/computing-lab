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
  countOverrides,
  nnTable,
  sanitizeSubset,
  sanitizeTable,
  usedToners,
} from "../../../src/features/color-quantization/domain/quantize.ts";
import {
  confusionPairs,
  encodeVerdictDetail,
  judgeMapping,
} from "../../../src/features/color-quantization/domain/recognize.ts";
import {
  getQuantStage,
  nextQuantStage,
} from "../../../src/features/color-quantization/domain/stages.ts";
import type { StageDraft } from "../../../src/features/color-quantization/lesson/state.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  insertSubmission,
  gateStage,
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
  const gated = gateStage(
    getQuantStage(stageIndex),
    (stage) => stage.index <= 1 || project.passedStages.includes(stage.index - 1),
    options,
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;
  const submission = (rawSubmission ?? {}) as { toners?: unknown; table?: unknown };

  // Resolve the effective mapping table for the stage's mode.
  let table: number[];
  let overrides: number | null = null;
  if (stage.mode === "pick") {
    const subset = sanitizeSubset(submission.toners);
    if (!subset || subset.length === 0) return { error: "invalid-toners", status: 400 };
    table = nnTable(subset);
  } else {
    const cleaned = sanitizeTable(submission.table);
    if (!cleaned) return { error: "invalid-table", status: 400 };
    const loadout = stage.fixedLoadout!;
    if (cleaned.some((v) => v >= 0 && !loadout.includes(v))) {
      return { error: "toner-not-loaded", status: 400 };
    }
    overrides = countOverrides(cleaned, nnTable(loadout));
    table = cleaned;
  }

  const gallery = judgeGalleryFor(stage.category);
  const report = judgeMapping(gallery, table);
  const toners = usedToners(table);

  const withinBudget =
    stage.mode === "pick"
      ? toners.length <= stage.tonerSlots!
      : overrides! <= stage.overrideBudget!;
  const passed = withinBudget && report.accuracy >= stage.requiredAccuracy;

  const failing = report.verdicts.find((v) => !v.ok);
  const counterexample = failing
    ? encodeVerdictDetail(
        gallery.find((e) => e.id === failing.queryId)!,
        gallery.find((e) => e.id === failing.collidedWith[0]?.id) ?? null,
        table,
        failing,
      )
    : null;
  const pairs = confusionPairs(gallery, table).slice(0, 6);

  const result: QuantJudgeResult = {
    mode: stage.mode,
    table,
    tonersUsed: toners,
    slotsUsed: toners.length,
    slotsBudget: stage.tonerSlots,
    overrides,
    overrideBudget: stage.overrideBudget,
    identified: report.identified,
    total: report.total,
    accuracy: report.accuracy,
    requiredAccuracy: stage.requiredAccuracy,
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
    tonersUsed: toners,
    slotsUsed: result.slotsUsed,
    overrides: result.overrides,
    accuracy: result.accuracy,
    identified: result.identified,
    total: result.total,
    requiredAccuracy: stage.requiredAccuracy,
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
      snapshot: { mode: stage.mode, submission, code },
      score: report.identified,
      total: report.total,
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
