import type {
  LogisticRegressionDraft,
  LogisticRegressionJudgeResult,
  LogisticRegressionRunSummaries,
  LogisticRegressionTestSummary,
} from "../../src/features/logistic-regression/domain/protocol.ts";
import { LOGISTIC_REGRESSION_CORE_STAGES } from "../../src/features/logistic-regression/domain/stages.ts";
import { sanitizeLogisticRegressionDraft } from "../../src/features/logistic-regression/lesson/state.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { parseJsonColumn } from "../db/client.ts";
import {
  judgeLogisticRegressionSubmission,
  latestPassedTraining,
} from "../judge/logistic-regression/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

const SUMMARY_KEYS: Record<number, keyof LogisticRegressionRunSummaries> = {
  1: "s1",
  2: "s2",
  3: "s3",
  4: "s4",
  5: "s5",
  6: "s6",
};

function latestRunSummaries(
  db: import("node:sqlite").DatabaseSync,
  projectId: string,
): LogisticRegressionRunSummaries {
  const rows = db
    .prepare(
      `SELECT stage_index AS stageIndex, test_summary AS testSummary
       FROM submissions
       WHERE project_id = ? AND lab_id = 'logistic-regression' AND stage_index BETWEEN 1 AND 6
       ORDER BY submitted_at DESC, rowid DESC`,
    )
    .all(projectId) as { stageIndex: number; testSummary: string }[];
  const found: LogisticRegressionRunSummaries = {
    s1: null,
    s2: null,
    s3: null,
    s4: null,
    s5: null,
    s6: null,
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
    stageCount: LOGISTIC_REGRESSION_CORE_STAGES.length,
    optionalStageIndexes: [6],
    staffNavigation: false,
    projectExtras: (db, project) => {
      const trainedSettings = latestPassedTraining(db, project.id);
      return {
        runSummaries: latestRunSummaries(db, project.id),
        ...(trainedSettings ? { trainedSettings } : {}),
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
    ) => {
      if (stageIndex === 5) return { error: "invalid-stage", status: 400 };
      return saveStageDraft(
        db,
        project,
        stageIndex,
        sanitizeLogisticRegressionDraft(stageIndex, body.draft ?? {}),
        {
          expectedRevision,
          expectedGeneration,
        },
      );
    },
    judge: (db, project, stageIndex, body) => {
      const key = `${project.userId}|logistic-regression|${stageIndex}`;
      if (judgeLimiter.exceeded(key)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(key);
      return judgeLogisticRegressionSubmission(db, project, stageIndex, body.draft);
    },
  });
}
