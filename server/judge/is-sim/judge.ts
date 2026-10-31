/**
 * Is-sim judge: interprets the submitted device topology against the
 * hidden, per-user-seeded scenario set. The student submits bounded data
 * — never code — and the same pure `runScenario` the browser preview
 * used grades it here. A pass needs every case green.
 */

import type { DatabaseSync } from "node:sqlite";
import type {
  IsDraft,
  IsJudgeResult,
  IsTestSummary,
} from "../../../src/features/is-sim/domain/protocol.ts";
import { enforcePrefillParams } from "../../../src/features/is-sim/domain/model.ts";
import { seedFor } from "../../../src/features/is-sim/domain/rng.ts";
import { judgeCase } from "../../../src/features/is-sim/domain/scenario.ts";
import {
  getIsStage,
  isSimStageUnlocked,
  nextIsSimStage,
} from "../../../src/features/is-sim/domain/stages.ts";
import { sanitizeDraft } from "../../../src/features/is-sim/lesson/state.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";
import { hiddenCasesFor } from "./hiddenSet.ts";

export function judgeIsSimSubmission(
  db: DatabaseSync,
  project: ProjectRow<IsDraft>,
  stageIndex: number,
  rawDraft: unknown,
): IsJudgeResult | LabJudgeError {
  const gated = gateStage(getIsStage(stageIndex), (stage) =>
    isSimStageUnlocked(project.passedStages, stage.index),
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;

  // sanitizeTopology keeps wire-claimed fixedParams flags as-is; the
  // reducer refuses param edits on frozen devices but a crafted request
  // could retune one, so stage prefill is re-applied before judging.
  const draft = enforcePrefillParams(sanitizeDraft(rawDraft), stage.prefill);

  const seed = seedFor(project.userId, project.labId, stage.index);
  const cases = hiddenCasesFor(stage.index, seed);
  const verdicts = cases.map((testCase) => judgeCase(draft, testCase, stage.maxEvents));

  const score = verdicts.filter((v) => v.passed).length;
  const total = verdicts.length;
  const passed = total > 0 && score === total;

  const categories: IsTestSummary["categories"] = {};
  for (const verdict of verdicts) {
    const tally = categories[verdict.category] ?? { passed: 0, total: 0 };
    tally.total += 1;
    if (verdict.passed) tally.passed += 1;
    categories[verdict.category] = tally;
  }

  const failingIndex = verdicts.findIndex((v) => !v.passed);
  const failing = failingIndex >= 0 ? verdicts[failingIndex] : undefined;
  const testCase = failing ? cases[failingIndex] : undefined;
  const counterexample: IsTestSummary["counterexample"] =
    failing && testCase
      ? {
          name: failing.name,
          category: failing.category,
          reason: failing.reason,
          eventsUsed: failing.eventsUsed,
          eventBudget: testCase.expect.events,
          scenario: testCase,
          dbDiff: failing.dbDiff,
          seenDiff: failing.seenDiff,
          firedDiff: failing.firedDiff,
          unapproved: failing.unapproved,
          pending: failing.pending,
          dropped: failing.dropped,
          trace: failing.run.trace,
        }
      : null;

  const testSummary: IsTestSummary = {
    categories,
    results: verdicts.map((v) => ({ name: v.name, category: v.category, passed: v.passed })),
    counterexample,
    error: null,
  };

  const result: IsJudgeResult = {
    score,
    total,
    passed,
    testSummary,
    submissionId: "",
    currentStage: project.currentStage,
    passedStages: project.passedStages,
    unlockedComponent: null,
  };

  // Submission row + progress update commit together.
  withTransaction(db, () => {
    result.submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot: draft,
      score,
      total,
      passed,
      testSummary,
    });
    if (passed) {
      const progress = advanceStage(db, project, stageIndex, nextIsSimStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  return result;
}
