import { evaluateLunchShiftSubmission } from "../../../src/features/lunch-shift/lesson/judge.ts";
/**
 * Lunch-shift judge. Stages grade differently by design:
 *
 *  - 订单旅程: validates the walkthrough record (ticket + delivery).
 *  - 智能接单: the browser's embedding model already turned the 12
 *    practice orders into tickets; the submission is per-order
 *    {ticket, confirmed}. Confirmed orders record the expected ticket
 *    (the customer restated); unconfirmed ones keep the AI's ticket.
 *    Pass needs 12/12 correct within the confirmation budget — so the
 *    student must confirm the orders the model actually missed, not
 *    just any order. Missing/invalid artefacts are refused outright
 *    before grading (a malformed request is not an attempt).
 *  - 修排队: replays the submitted 124-cell priority table — pass at
 *    ≥10/12 on-time, star at 12.
 *  - 晚餐高峰: the same intake artefact aimed at the hidden order set,
 *    plus the carried-over priority table. Confirmed orders stall
 *    intake one tick. Pass needs 12/12 correct, ≤4 confirmations AND
 *    ≥11 tickets both correct and on time — accuracy, confirmation
 *    cost and delivery speed are judged together.
 *  - 附加挑战: the compensate table is replayed over the fixed FIFO run's
 *    problem orders — pass holds BOTH lines: expected bad reviews ≤ 4.0
 *    and compensation spend ≤ 70 元, where a refund costs the order's own
 *    price (the rates and menu live in domain/compensate).
 *
 * Student code never runs here: the browser's Pyodide worker already
 * turned it into JSON tables; this file only re-checks their shape and
 * replays the fixed parser/simulator. The final order set never leaves
 * this directory.
 */

import type { DatabaseSync } from "node:sqlite";
import type { LunchJudgeResult } from "../../../src/features/lunch-shift/domain/protocol.ts";
import {
  lunchStageUnlocked,
  nextLunchStage,
} from "../../../src/features/lunch-shift/domain/stages.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";
import { FINAL_PUBLIC_ORDERS, FINAL_SCENARIO } from "./hiddenSet.ts";

export function judgeLunchShiftSubmission(
  db: DatabaseSync,
  project: ProjectRow<unknown>,
  stageIndex: number,
  rawDraft: unknown,
  options?: { bypassLock?: boolean },
): LunchJudgeResult | LabJudgeError {
  const evaluation = evaluateLunchShiftSubmission(
    project,
    stageIndex,
    rawDraft,
    FINAL_SCENARIO,
    options,
  );
  if ("error" in evaluation) return evaluation;
  const { result, snapshot, score, total, passed } = evaluation;
  // Submission row + progress update commit together — a crash between
  // them would record a pass the student never got credit for.
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
      const progress = advanceStage(db, project, stageIndex, nextLunchStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  // A passing stage-3 run unlocks stage 4 mid-session (and staff always keep access) — ship its order
  // wording with the result so the page needs no reload (ids+text only).
  result.aiOrders =
    options?.bypassLock || lunchStageUnlocked(result.passedStages, 4) ? FINAL_PUBLIC_ORDERS : null;
  return result;
}
