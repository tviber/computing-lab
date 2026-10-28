/**
 * Lunch-shift judge. Stages grade differently by design:
 *
 *  - 订单旅程: validates the walkthrough record (ticket + delivery).
 *  - 修接单: replays the submitted word tables over the 12 practice
 *    requests — pass requires every ticket right. Malformed tables record
 *    a failed submission with the concrete errors (the student can retry).
 *  - 修排队: replays the submitted 124-cell priority table — pass at
 *    ≥10/12 on-time, star at 12.
 *  - 正式挑战: one-shot on the hidden set — a second submission is refused
 *    before grading; missing/invalid artefacts are refused outright so a
 *    malformed request can't burn the single attempt. Score = correct
 *    tickets + on-time deliveries, total 24.
 *
 * Student code never runs here: the browser's Pyodide worker already
 * turned it into JSON tables; this file only re-checks their shape and
 * replays the fixed parser/simulator. The final order set never leaves
 * this directory.
 */

import type { DatabaseSync } from "node:sqlite";
import { sameTicket, type Scenario } from "../../../src/features/lunch-shift/domain/contracts.ts";
import {
  INTAKE_SCENARIO,
  QUEUE_SCENARIO,
  trainingOrderFor,
} from "../../../src/features/lunch-shift/domain/scenarios.ts";
import { simulate } from "../../../src/features/lunch-shift/domain/simulator.ts";
import {
  getLunchStage,
  lunchStageUnlocked,
  nextLunchStage,
} from "../../../src/features/lunch-shift/domain/stages.ts";
import type {
  LunchJudgeResult,
  LunchTestSummary,
} from "../../../src/features/lunch-shift/domain/protocol.ts";
import { checkPriorityTable } from "../../../src/features/lunch-shift/domain/priority.ts";
import {
  checkIntakeTables,
  evaluateIntake,
} from "../../../src/features/lunch-shift/domain/wordTables.ts";
import {
  sanitizeFinalDraft,
  sanitizeIntakeDraft,
  sanitizeQueueDraft,
  sanitizeTrainingDraft,
} from "../../../src/features/lunch-shift/lesson/state.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";
import { FINAL_SCENARIO } from "./hiddenSet.ts";

export function judgeLunchShiftSubmission(
  db: DatabaseSync,
  project: ProjectRow<unknown>,
  stageIndex: number,
  rawDraft: unknown,
): LunchJudgeResult | LabJudgeError {
  const gated = gateStage(getLunchStage(stageIndex), (stage) =>
    lunchStageUnlocked(project.passedStages, stage.index),
  );
  if ("error" in gated) return gated;

  let score: number;
  let total: number;
  let passed: boolean;
  let testSummary: LunchTestSummary;
  let snapshot: unknown;

  if (stageIndex === 1) {
    const draft = sanitizeTrainingDraft(rawDraft);
    snapshot = draft;
    const training = trainingOrderFor(project.userId).ticket;
    const differences: string[] = [];
    const ticketOk = draft.ticket != null && sameTicket(draft.ticket, training);
    if (!ticketOk) {
      if (!draft.ticket || draft.ticket.item !== training.item)
        differences.push(`菜品应为${training.item}`);
      if (!draft.ticket || draft.ticket.note !== training.note)
        differences.push(`备注应为${training.note}`);
      if (!draft.ticket || draft.ticket.table !== training.table)
        differences.push(`桌号应为 ${training.table}，写错会送错桌`);
      if (!draft.ticket || draft.ticket.urgent !== training.urgent)
        differences.push(training.urgent ? "顾客说了赶时间，应选加急" : "顾客说不赶时间，应选普通");
    }
    if (draft.kitchenChoice === null) differences.push("还没有决定先做哪张订单");
    const deliveryOk = draft.deliveredTable === training.table;
    if (!deliveryOk) differences.push("送餐桌号要和小票一致");
    passed = draft.step === "done" && ticketOk && deliveryOk && draft.kitchenChoice !== null;
    score = passed ? 1 : 0;
    total = 1;
    testSummary = { kind: "training", differences };
  } else if (stageIndex === 2) {
    const draft = sanitizeIntakeDraft(rawDraft);
    snapshot = draft;
    // Grade the raw submission, not the sanitized draft — dropped entries
    // are exactly the malformed ones the student needs named.
    const { tables, errors } = checkIntakeTables((rawDraft as { tables?: unknown } | null)?.tables);
    if (errors.length > 0) {
      score = 0;
      total = INTAKE_SCENARIO.orders.length;
      passed = false;
      testSummary = { kind: "intake", correct: 0, total, errors };
    } else {
      const orders = evaluateIntake(
        INTAKE_SCENARIO.orders.map((order) => ({
          id: order.id,
          request: order.request,
          expected: order.expected!,
        })),
        tables,
      );
      const correct = orders.filter((order) => order.correct).length;
      score = correct;
      total = orders.length;
      passed = correct === orders.length;
      testSummary = { kind: "intake", correct, total, orders };
    }
  } else if (stageIndex === 3) {
    const draft = sanitizeQueueDraft(rawDraft);
    snapshot = draft;
    const { table, errors } = checkPriorityTable(
      (rawDraft as { priority?: unknown } | null)?.priority,
    );
    if (errors.length > 0 || table === null) {
      score = 0;
      total = QUEUE_SCENARIO.orders.length;
      passed = false;
      testSummary = { kind: "queue", onTime: 0, total, errors };
    } else {
      const run = simulate(QUEUE_SCENARIO, { priority: table }).result;
      score = run.onTime;
      total = QUEUE_SCENARIO.orders.length;
      passed = run.onTime >= 10;
      testSummary = { kind: "queue", onTime: run.onTime, total, run };
    }
  } else {
    const draft = sanitizeFinalDraft(rawDraft);
    snapshot = draft;
    const raw = rawDraft as { tables?: unknown; priority?: unknown } | null;
    const { tables, errors: tableErrors } = checkIntakeTables(raw?.tables);
    const { table, errors: priorityErrors } = checkPriorityTable(raw?.priority);
    // Refuse before grading — a malformed request must not burn the one shot.
    if (tableErrors.length > 0 || priorityErrors.length > 0 || table === null) {
      return { error: "missing-run", status: 400 };
    }
    const scenario: Scenario = FINAL_SCENARIO;
    const run = simulate(scenario, { tables, priority: table }).result;
    // Second metric is 记对且准时 — a wrong ticket earns no delivery point:
    // 数据写错，后面全错， consistent with the stage-1 lesson.
    const served = run.orders.filter((order) => order.correct === true && order.onTime).length;
    score = run.correct + served;
    total = scenario.orders.length * 2;
    passed = true;
    // The final's orders stay hidden: ids + outcomes only, no wording.
    testSummary = {
      kind: "final",
      correct: run.correct,
      served,
      total: scenario.orders.length,
      orders: run.orders.map((order) => ({
        id: order.id,
        correct: order.correct === true,
        onTime: order.correct === true && order.onTime,
      })),
    };
  }

  const result: LunchJudgeResult = {
    score,
    total,
    passed,
    testSummary,
    submissionId: "",
    currentStage: project.currentStage,
    passedStages: project.passedStages,
    unlockedComponent: null,
  };

  // Submission row + progress update commit together — and for the final
  // stage the one-shot check rides the same IMMEDIATE transaction, so a
  // second concurrent submit can never slip a duplicate row past it.
  let finalUsed = false;
  withTransaction(db, () => {
    if (stageIndex === 4) {
      const existing = db
        .prepare(
          "SELECT id FROM submissions WHERE project_id = ? AND lab_id = ? AND stage_index = 4 LIMIT 1",
        )
        .get(project.id, project.labId);
      if (existing) {
        finalUsed = true;
        return;
      }
    }
    result.submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot,
      score,
      total,
      passed,
      testSummary,
    });
    if (passed) {
      const progress = advanceStage(db, project, stageIndex, nextLunchStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });
  if (finalUsed) return { error: "final-used", status: 409 };

  return result;
}
