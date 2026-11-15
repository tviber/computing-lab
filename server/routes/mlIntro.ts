import type {
  MlDraft,
  MlJudgeResult,
  MlRunSummaries,
  MlTestSummary,
} from "../../src/features/ml-intro/domain/protocol.ts";
import { ML_STAGES } from "../../src/features/ml-intro/domain/stages.ts";
import { sanitizeMlDraft } from "../../src/features/ml-intro/lesson/state.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { parseJsonColumn } from "../db/client.ts";
import { judgeMlIntroSubmission } from "../judge/ml-intro/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

const SUMMARY_KEYS: Record<number, keyof MlRunSummaries> = {
  1: "s1",
  2: "s2",
  3: "s3",
  4: "s4",
  5: "s5",
};

function latestRunSummaries(
  db: import("node:sqlite").DatabaseSync,
  projectId: string,
): MlRunSummaries {
  const rows = db
    .prepare(
      `SELECT stage_index AS stageIndex, test_summary AS testSummary
       FROM submissions
       WHERE project_id = ? AND lab_id = 'ml-intro' AND stage_index IN (1, 2, 3, 4, 5)
       ORDER BY submitted_at DESC`,
    )
    .all(projectId) as { stageIndex: number; testSummary: string }[];
  const found: MlRunSummaries = { s1: null, s2: null, s3: null, s4: null, s5: null };
  for (const row of rows) {
    const key = SUMMARY_KEYS[row.stageIndex];
    if (key && found[key] === null) {
      found[key] = parseJsonColumn<MlTestSummary | null>(row.testSummary, null);
    }
  }
  return found;
}

export function mlIntroRoutes() {
  const judgeLimiter = new SlidingWindowLimiter(30, 10 * 60 * 1000);
  return labRoutes<MlDraft, MlJudgeResult>({
    labId: "ml-intro",
    stageCount: ML_STAGES.length,
    projectExtras: (db, project) => ({
      runSummaries: latestRunSummaries(db, project.id),
    }),
    saveDraft: (db, project, stageIndex, body, expectedRevision) =>
      saveStageDraft(db, project, stageIndex, sanitizeMlDraft(stageIndex, body.draft ?? {}), {
        expectedRevision,
      }),
    judge: (db, project, stageIndex, body) => {
      const key = `${project.userId}|ml-intro|${stageIndex}`;
      if (judgeLimiter.exceeded(key)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(key);
      return judgeMlIntroSubmission(db, project, stageIndex, body.draft);
    },
  });
}
