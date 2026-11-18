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
import { checkAiResults } from "../../../src/features/lunch-shift/domain/aiIntake.ts";
import {
  sameTicket,
  type Scenario,
  type Ticket,
} from "../../../src/features/lunch-shift/domain/contracts.ts";
import {
  INTAKE_SCENARIO,
  QUEUE_SCENARIO,
  trainingOrderFor,
} from "../../../src/features/lunch-shift/domain/scenarios.ts";
import { simulate } from "../../../src/features/lunch-shift/domain/simulator.ts";
import {
  AI_CONFIRM_BUDGET,
  AI_PASS_CORRECT,
  AI_SERVED_MIN,
  getLunchStage,
  lunchStageUnlocked,
  nextLunchStage,
  QUEUE_PASS,
} from "../../../src/features/lunch-shift/domain/stages.ts";
import type {
  LunchJudgeResult,
  LunchTestSummary,
} from "../../../src/features/lunch-shift/domain/protocol.ts";
import { checkPriorityTable } from "../../../src/features/lunch-shift/domain/priority.ts";
import { pickProbe, QUEUE_PROBES } from "../../../src/features/lunch-shift/domain/queueProbes.ts";
import {
  bestCompensation,
  checkCompensateTable,
  COMPENSATE_PASS_REVIEWS,
  COMPENSATE_PASS_SPEND,
  compensateLateOrders,
  evaluateCompensation,
} from "../../../src/features/lunch-shift/domain/compensate.ts";
import {
  sanitizeAiDraft,
  sanitizeAiIntakeDraft,
  sanitizeCompensateDraft,
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
import { FINAL_PUBLIC_ORDERS, FINAL_SCENARIO } from "./hiddenSet.ts";

export function judgeLunchShiftSubmission(
  db: DatabaseSync,
  project: ProjectRow<unknown>,
  stageIndex: number,
  rawDraft: unknown,
  options?: { bypassLock?: boolean },
): LunchJudgeResult | LabJudgeError {
  const gated = gateStage(
    getLunchStage(stageIndex),
    (stage) => lunchStageUnlocked(project.passedStages, stage.index),
    options,
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
    const draft = sanitizeAiIntakeDraft(rawDraft);
    snapshot = draft;
    const { results, errors: resultErrors } = checkAiResults(
      (rawDraft as { results?: unknown } | null)?.results,
      INTAKE_SCENARIO.orders,
    );
    // Refuse before grading — a request without computed results is a
    // client-protocol fault, not a gradeable attempt, so it records nothing.
    if (resultErrors.length > 0 || results === null) {
      return { error: "missing-run", status: 400 };
    }
    // Confirmed orders record the expected ticket (the customer restated);
    // unconfirmed ones keep the AI's ticket and stand or fall on it.
    const orders = INTAKE_SCENARIO.orders.map((order) => {
      const row = results.find((entry) => entry.id === order.id)!;
      const correct = row.confirmed || sameTicket(row.ticket, order.expected!);
      return {
        id: order.id,
        request: order.request,
        correct,
        confirmed: row.confirmed,
        produced: row.confirmed ? order.expected! : row.ticket,
        expected: order.expected!,
      };
    });
    const correct = orders.filter((order) => order.correct).length;
    const confirmed = orders.filter((order) => order.confirmed).length;
    score = correct;
    total = orders.length;
    passed = correct === orders.length && confirmed <= AI_CONFIRM_BUDGET;
    testSummary = { kind: "ai-intake", correct, total, confirmed, orders };
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
      // Layered probes — not the 12-order round: a single round can't
      // hurt naive urgent-first enough (the 18-tick normal window is too
      // forgiving). Each probe is a crafted queue snapshot with a
      // deadline-derived right pick.
      const probeRows = QUEUE_PROBES.map((probe) => {
        const picked = pickProbe(table, probe);
        return {
          id: probe.id,
          title: probe.title,
          passed: picked === probe.answer,
          picked,
          answer: probe.answer,
        };
      });
      const passedProbes = probeRows.filter((row) => row.passed).length;
      // The big round stays as the preview visual (and the pick table
      // students debug from) — it no longer gates the pass.
      const run = simulate(QUEUE_SCENARIO, { priority: table }).result;
      score = passedProbes;
      total = QUEUE_PROBES.length;
      passed = passedProbes >= QUEUE_PASS;
      testSummary = { kind: "queue", onTime: passedProbes, total, run, probes: probeRows };
    }
  } else if (stageIndex === 5) {
    const draft = sanitizeCompensateDraft(rawDraft);
    snapshot = draft;
    const { table, errors } = checkCompensateTable(
      (rawDraft as { compensate?: unknown } | null)?.compensate,
    );
    if (errors.length > 0 || table === null) {
      score = 0;
      total = 1;
      passed = false;
      testSummary = {
        kind: "compensate",
        badReviewPoints: 0,
        spend: 0,
        bestReviewPoints: 0,
        bestSpend: 0,
        errors,
      };
    } else {
      // Everyone pays for the same problem orders — the fixed FIFO run on
      // the 20-order rush set. Pass needs both lines held: expected bad
      // reviews AND compensation spend.
      const late = compensateLateOrders();
      const bill = evaluateCompensation(late, table);
      const best = bestCompensation(late);
      passed =
        bill.badReviewPoints <= COMPENSATE_PASS_REVIEWS && bill.spend <= COMPENSATE_PASS_SPEND;
      score = passed ? 1 : 0;
      total = 1;
      testSummary = {
        kind: "compensate",
        badReviewPoints: bill.badReviewPoints,
        spend: bill.spend,
        bestReviewPoints: best.badReviewPoints,
        bestSpend: best.spend,
        orders: bill.orders,
      };
    }
  } else {
    const draft = sanitizeAiDraft(rawDraft);
    snapshot = draft;
    const raw = rawDraft as {
      results?: unknown;
      priority?: unknown;
    } | null;
    const { results, errors: resultErrors } = checkAiResults(raw?.results, FINAL_SCENARIO.orders);
    const { table, errors: priorityErrors } = checkPriorityTable(raw?.priority);
    // Refuse before grading — a request without computed artefacts is a
    // client-protocol fault, not a gradeable attempt, so it records nothing.
    if (
      resultErrors.length > 0 ||
      priorityErrors.length > 0 ||
      results === null ||
      table === null
    ) {
      return { error: "missing-run", status: 400 };
    }
    const scenario: Scenario = FINAL_SCENARIO;
    // Confirmed orders record the expected ticket (the customer restated)
    // and stall intake one slot — certainty costs a tick, exactly as the
    // stage promises.
    const tickets = new Map<string, Ticket>();
    const confirmStalls = new Set<string>();
    for (const order of scenario.orders) {
      const row = results.find((entry) => entry.id === order.id)!;
      tickets.set(order.id, row.confirmed ? order.expected! : row.ticket);
      if (row.confirmed) confirmStalls.add(order.id);
    }
    const run = simulate(scenario, { tickets, confirmStalls, priority: table }).result;
    // Second metric is 记对且准时 — a wrong ticket earns no delivery point:
    // 数据写错，后面全错， consistent with the stage-1 lesson. It also
    // gates the pass: confirmations stall intake, so over-confirming can
    // fail on served even when every ticket lands right.
    const served = run.orders.filter((order) => order.correct === true && order.onTime).length;
    const confirmed = confirmStalls.size;
    score = run.correct + served;
    total = scenario.orders.length * 2;
    passed =
      run.correct >= AI_PASS_CORRECT && confirmed <= AI_CONFIRM_BUDGET && served >= AI_SERVED_MIN;
    // The final's orders stay hidden: ids + outcomes only, no wording.
    testSummary = {
      kind: "final",
      correct: run.correct,
      served,
      total: scenario.orders.length,
      confirmed,
      orders: run.orders.map((order) => ({
        id: order.id,
        correct: order.correct === true,
        confirmed: confirmStalls.has(order.id),
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
    aiOrders: null,
  };

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
      testSummary,
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
