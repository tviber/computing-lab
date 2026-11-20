import type {
  LunchDraft,
  LunchJudgeResult,
  LunchTestSummary,
} from "../../src/features/lunch-shift/domain/protocol.ts";
import {
  LUNCH_STAGES,
  lunchStageAffectedByReset,
  lunchStageUnlocked,
} from "../../src/features/lunch-shift/domain/stages.ts";
import { FINAL_PUBLIC_ORDERS } from "../judge/lunch-shift/hiddenSet.ts";
import { sanitizeLunchDraft } from "../../src/features/lunch-shift/lesson/state.ts";
import { trainingOrderFor } from "../../src/features/lunch-shift/domain/scenarios.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { parseJsonColumn } from "../db/client.ts";
import { judgeLunchShiftSubmission } from "../judge/lunch-shift/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

const SUMMARY_STAGES: Record<number, "intake" | "queue" | "final" | "compensate"> = {
  2: "intake",
  3: "queue",
  4: "final",
  5: "compensate",
};

function latestRunSummaries(
  db: import("node:sqlite").DatabaseSync,
  projectId: string,
): {
  intake: LunchTestSummary | null;
  queue: LunchTestSummary | null;
  final: LunchTestSummary | null;
  compensate: LunchTestSummary | null;
} {
  const rows = db
    .prepare(
      `SELECT stage_index AS stageIndex, test_summary AS testSummary
       FROM submissions
       WHERE project_id = ? AND lab_id = 'lunch-shift' AND stage_index IN (2, 3, 4, 5)
       ORDER BY submitted_at DESC`,
    )
    .all(projectId) as { stageIndex: number; testSummary: string }[];
  const found: {
    intake: LunchTestSummary | null;
    queue: LunchTestSummary | null;
    final: LunchTestSummary | null;
    compensate: LunchTestSummary | null;
  } = { intake: null, queue: null, final: null, compensate: null };
  for (const row of rows) {
    const key = SUMMARY_STAGES[row.stageIndex];
    if (key && found[key] === null) {
      found[key] = parseJsonColumn<LunchTestSummary | null>(row.testSummary, null);
    }
  }
  return found;
}

export function lunchShiftRoutes() {
  const judgeLimiter = new SlidingWindowLimiter(20, 10 * 60 * 1000);
  return labRoutes<LunchDraft, LunchJudgeResult>({
    labId: "lunch-shift",
    stageCount: LUNCH_STAGES.length,
    stageAffectedByReset: lunchStageAffectedByReset,
    projectExtras: (db, project, { staff }) => ({
      runSummaries: latestRunSummaries(db, project.id),
      training: trainingOrderFor(project.userId),
      aiOrders: staff || lunchStageUnlocked(project.passedStages, 4) ? FINAL_PUBLIC_ORDERS : null,
    }),
    saveDraft: (
      db,
      project,
      stageIndex,
      body,
      expectedRevision,
      _expectedComponents,
      expectedGeneration,
    ) =>
      saveStageDraft(db, project, stageIndex, sanitizeLunchDraft(stageIndex, body.draft ?? {}), {
        expectedRevision,
        expectedGeneration,
      }),
    judge: (db, project, stageIndex, body, { staff }) => {
      const key = `${project.userId}|lunch-shift|${stageIndex}`;
      if (judgeLimiter.exceeded(key)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(key);
      return judgeLunchShiftSubmission(db, project, stageIndex, body.draft, { bypassLock: staff });
    },
  });
}
