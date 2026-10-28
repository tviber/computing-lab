import type {
  LunchDraft,
  LunchJudgeResult,
  LunchTestSummary,
} from "../../src/features/lunch-shift/domain/protocol.ts";
import { LUNCH_STAGES } from "../../src/features/lunch-shift/domain/stages.ts";
import { sanitizeLunchDraft } from "../../src/features/lunch-shift/lesson/state.ts";
import { trainingOrderFor } from "../../src/features/lunch-shift/domain/scenarios.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { parseJsonColumn } from "../db/client.ts";
import { judgeLunchShiftSubmission } from "../judge/lunch-shift/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

/** Latest recorded run per challenge stage, for the result views on reload. */
function latestRunSummaries(
  db: import("node:sqlite").DatabaseSync,
  projectId: string,
): { practice: LunchTestSummary | null; final: LunchTestSummary | null } {
  const rows = db
    .prepare(
      `SELECT stage_index AS stageIndex, test_summary AS testSummary
       FROM submissions
       WHERE project_id = ? AND lab_id = 'lunch-shift' AND stage_index IN (3, 4)
       ORDER BY submitted_at DESC`,
    )
    .all(projectId) as { stageIndex: number; testSummary: string }[];
  const found: { practice: LunchTestSummary | null; final: LunchTestSummary | null } = {
    practice: null,
    final: null,
  };
  for (const row of rows) {
    const key = row.stageIndex === 3 ? "practice" : "final";
    if (found[key] === null)
      found[key] = parseJsonColumn<LunchTestSummary | null>(row.testSummary, null);
  }
  return found;
}

export function lunchShiftRoutes() {
  // 20 submissions per stage per 10 minutes — practice reruns stay cheap
  // but bounded; the one-shot final needs no limiter of its own.
  const judgeLimiter = new SlidingWindowLimiter(20, 10 * 60 * 1000);
  return labRoutes<LunchDraft, LunchJudgeResult>({
    labId: "lunch-shift",
    stageCount: LUNCH_STAGES.length,
    projectExtras: (db, project) => ({
      runSummaries: latestRunSummaries(db, project.id),
      training: trainingOrderFor(project.userId),
    }),
    saveDraft: (db, project, stageIndex, body, expectedRevision) =>
      saveStageDraft(db, project, stageIndex, sanitizeLunchDraft(stageIndex, body.draft ?? {}), {
        expectedRevision,
      }),
    judge: (db, project, stageIndex, body) => {
      const key = `${project.userId}|lunch-shift|${stageIndex}`;
      if (judgeLimiter.exceeded(key)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(key);
      return judgeLunchShiftSubmission(db, project, stageIndex, body.draft);
    },
  });
}
