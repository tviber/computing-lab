import type {
  LogisticRegressionDraft,
  LogisticRegressionJudgeResult,
  LogisticRegressionRunSummaries,
  LogisticRegressionTestSummary,
} from "../../src/features/logistic-regression/domain/protocol.ts";
import { LOGISTIC_REGRESSION_STAGES } from "../../src/features/logistic-regression/domain/stages.ts";
import {
  sanitizeLogisticRegressionDraft,
  sanitizeTrainDraft,
} from "../../src/features/logistic-regression/lesson/state.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { parseJsonColumn } from "../db/client.ts";
import { judgeLogisticRegressionSubmission } from "../judge/logistic-regression/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

const SUMMARY_KEYS: Record<number, keyof LogisticRegressionRunSummaries> = {
  1: "s1",
  2: "s2",
  3: "s3",
  4: "s4",
  5: "s5",
};

function latestRunSummaries(
  db: import("node:sqlite").DatabaseSync,
  projectId: string,
): LogisticRegressionRunSummaries {
  const rows = db
    .prepare(
      `SELECT stage_index AS stageIndex, test_summary AS testSummary
       FROM submissions
       WHERE project_id = ? AND lab_id = 'logistic-regression' AND stage_index BETWEEN 1 AND 5
       ORDER BY submitted_at DESC, rowid DESC`,
    )
    .all(projectId) as { stageIndex: number; testSummary: string }[];
  const found: LogisticRegressionRunSummaries = {
    s1: null,
    s2: null,
    s3: null,
    s4: null,
    s5: null,
  };
  for (const row of rows) {
    const key = SUMMARY_KEYS[row.stageIndex];
    if (key && found[key] === null) {
      found[key] = parseJsonColumn<LogisticRegressionTestSummary | null>(row.testSummary, null);
    }
  }
  return found;
}

export function logisticRegressionRoutes() {
  const judgeLimiter = new SlidingWindowLimiter(30, 10 * 60 * 1000);
  return labRoutes<LogisticRegressionDraft, LogisticRegressionJudgeResult>({
    labId: "logistic-regression",
    stageCount: LOGISTIC_REGRESSION_STAGES.length,
    projectExtras: (db, project) => {
      const latestModel = db
        .prepare(
          `SELECT snapshot_graph AS snapshot FROM submissions
         WHERE project_id = ? AND lab_id = 'logistic-regression' AND stage_index = 4 AND passed = 1
         ORDER BY submitted_at DESC, rowid DESC LIMIT 1`,
        )
        .get(project.id) as { snapshot: string } | undefined;
      const settings = latestModel && parseJsonColumn<unknown>(latestModel.snapshot, null);
      const trainedSettings = settings ? sanitizeTrainDraft(settings) : undefined;
      return {
        runSummaries: latestRunSummaries(db, project.id),
        ...(trainedSettings
          ? { trainedSettings: { eta: trainedSettings.eta, epochs: trainedSettings.epochs } }
          : {}),
      };
    },
    saveDraft: (
      db,
      project,
      stageIndex,
      body,
      expectedRevision,
      _expectedComponents,
      expectedGeneration,
    ) =>
      saveStageDraft(
        db,
        project,
        stageIndex,
        sanitizeLogisticRegressionDraft(stageIndex, body.draft ?? {}),
        {
          expectedRevision,
          expectedGeneration,
        },
      ),
    judge: (db, project, stageIndex, body, { staff }) => {
      const key = `${project.userId}|logistic-regression|${stageIndex}`;
      if (judgeLimiter.exceeded(key)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(key);
      return judgeLogisticRegressionSubmission(db, project, stageIndex, body.draft, {
        bypassLock: staff,
      });
    },
  });
}
