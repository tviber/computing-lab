import type { QuantJudgeResult } from "../domain/protocol.ts";
import {
  countOverrides,
  nnTable,
  sanitizeSubset,
  sanitizeTable,
  usedToners,
} from "../domain/quantize.ts";
import { confusionPairs, encodeVerdictDetail, judgeMapping } from "../domain/recognize.ts";
import { getQuantStage } from "../domain/stages.ts";

import { gateStage, type JudgeProject } from "../../../shared/lab/judging.ts";
export function evaluateQuantSubmission(
  project: JudgeProject,
  stageIndex: number,
  rawSubmission: unknown,
  rawCode: unknown,
  gallery: import("../domain/sprites.ts").GalleryEntry[],
  options?: { bypassLock?: boolean },
) {
  const gated = gateStage(
    getQuantStage(stageIndex),
    (stage) => stage.index <= 1 || project.passedStages.includes(stage.index - 1),
    options,
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;
  const submission = (rawSubmission ?? {}) as { toners?: unknown; table?: unknown };

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

  return { result, score: report.identified, total: report.total, passed, stage };
}
