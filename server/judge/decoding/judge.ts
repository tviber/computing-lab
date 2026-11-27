import { evaluateDecodingSubmission } from "../../../src/features/decoding/lesson/judge.ts";
/**
 * Decoding judge. The student submits data — the decoded artifact plus
 * concept answers and a code snapshot — never executable code. The server
 * re-derives this student's payload from (userId, labId, stageIndex), runs
 * the same reference decode the browser was told about only through its
 * payload, and compares. Details name the first mismatching position only:
 * enough to debug a decoder, not enough to leak the answer.
 */

import type { DatabaseSync } from "node:sqlite";
import type {
  DecodingDraft,
  DecodingJudgeResult,
} from "../../../src/features/decoding/domain/protocol.ts";
import { nextDecodingStage } from "../../../src/features/decoding/domain/stages.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";

/**
 * Concept prompts are re-checked server-side — the client only sends picks.
 * Each prompt becomes its own part so a wrong pick lands in the verdict list
 * (and teacher snapshot) instead of an opaque 400; details name the prompt,
 * never the correct option.
 */
export function judgeDecodingSubmission(
  db: DatabaseSync,
  project: ProjectRow<DecodingDraft>,
  stageIndex: number,
  body: { artifact?: unknown; code?: unknown; conceptAnswers?: Record<string, number> },
  options?: { bypassLock?: boolean },
): DecodingJudgeResult | LabJudgeError {
  const evaluation = evaluateDecodingSubmission(project, stageIndex, body, options);
  if ("error" in evaluation) return evaluation;
  const { result, snapshot, score, total, passed, parts } = evaluation;
  // Submission row + progress update commit together.
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
      testSummary: { parts },
    });
    if (passed) {
      const progress = advanceStage(db, project, stageIndex, nextDecodingStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  return result;
}
