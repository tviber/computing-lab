import type { DatabaseSync } from "node:sqlite";
import type {
  LogisticRegressionJudgeResult,
  TrainingSettings,
} from "../../../src/features/logistic-regression/domain/protocol.ts";
import { nextLogisticRegressionStage } from "../../../src/features/logistic-regression/domain/stages.ts";
import { evaluateLogisticRegressionSubmission } from "../../../src/features/logistic-regression/lesson/judge.ts";
import { sanitizeTrainDraft } from "../../../src/features/logistic-regression/lesson/state.ts";
import { parseJsonColumn, withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";

export function latestPassedTraining(
  db: DatabaseSync,
  projectId: string,
): TrainingSettings | undefined {
  const latest = db
    .prepare(
      `SELECT snapshot_graph AS snapshot FROM submissions
       WHERE project_id = ? AND lab_id = 'logistic-regression' AND stage_index = 4 AND passed = 1
       ORDER BY submitted_at DESC, rowid DESC LIMIT 1`,
    )
    .get(projectId) as { snapshot: string } | undefined;
  const snapshot = latest && parseJsonColumn<unknown>(latest.snapshot, null);
  if (!snapshot) return undefined;
  const { eta, epochs } = sanitizeTrainDraft(snapshot);
  return { eta, epochs };
}

export function judgeLogisticRegressionSubmission(
  db: DatabaseSync,
  project: ProjectRow<unknown>,
  stageIndex: number,
  rawDraft: unknown,
): LogisticRegressionJudgeResult | LabJudgeError {
  const evaluation = evaluateLogisticRegressionSubmission(
    project,
    stageIndex,
    rawDraft,
    latestPassedTraining(db, project.id),
  );
  if ("error" in evaluation) return evaluation;
  const { result, snapshot, score, total, passed } = evaluation;
  withTransaction(db, () => {
    result.submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot,
      score,
      total,
      passed,
      testSummary: result.testSummary,
    });
    if (passed) {
      if (stageIndex === 6) {
        const passedStages = [...new Set([...project.passedStages, 6])].sort((a, b) => a - b);
        result.passedStages = passedStages;
        result.currentStage = nextLogisticRegressionStage(passedStages);
        db.prepare(
          "UPDATE student_projects SET passed_stages = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        ).run(JSON.stringify(passedStages), project.id);
      } else {
        const progress = advanceStage(db, project, stageIndex, nextLogisticRegressionStage);
        result.passedStages = progress.passedStages;
        result.currentStage = progress.currentStage;
      }
    }
  });

  return result;
}
