import { checkAiResults } from "../domain/aiIntake.ts";
import {
  bestCompensation,
  checkCompensateTable,
  COMPENSATE_PASS_REVIEWS,
  COMPENSATE_PASS_SPEND,
  compensateLateOrders,
  evaluateCompensation,
} from "../domain/compensate.ts";
import { sameTicket, type Scenario, type Ticket } from "../domain/contracts.ts";
import { checkPriorityTable } from "../domain/priority.ts";
import type { LunchJudgeResult, LunchTestSummary } from "../domain/protocol.ts";
import { pickProbe, QUEUE_PROBES } from "../domain/queueProbes.ts";
import { INTAKE_SCENARIO, QUEUE_SCENARIO, trainingOrderFor } from "../domain/scenarios.ts";
import { simulate } from "../domain/simulator.ts";
import {
  AI_CONFIRM_BUDGET,
  AI_PASS_CORRECT,
  AI_SERVED_MIN,
  getLunchStage,
  lunchStageUnlocked,
  QUEUE_PASS,
} from "../domain/stages.ts";
import {
  sanitizeAiDraft,
  sanitizeAiIntakeDraft,
  sanitizeCompensateDraft,
  sanitizeQueueDraft,
  sanitizeTrainingDraft,
} from "./state.ts";

import { gateStage, type JudgeProject } from "../../../shared/lab/judging.ts";
export function evaluateLunchShiftSubmission(
  project: JudgeProject<unknown>,
  stageIndex: number,
  rawDraft: unknown,
  finalScenario: Scenario,
  options?: { bypassLock?: boolean },
) {
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

    if (resultErrors.length > 0 || results === null) {
      return { error: "missing-run", status: 400 };
    }

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
    const { results, errors: resultErrors } = checkAiResults(raw?.results, finalScenario.orders);
    const { table, errors: priorityErrors } = checkPriorityTable(raw?.priority);

    if (
      resultErrors.length > 0 ||
      priorityErrors.length > 0 ||
      results === null ||
      table === null
    ) {
      return { error: "missing-run", status: 400 };
    }
    const scenario: Scenario = finalScenario;

    const tickets = new Map<string, Ticket>();
    const confirmStalls = new Set<string>();
    for (const order of scenario.orders) {
      const row = results.find((entry) => entry.id === order.id)!;
      tickets.set(order.id, row.confirmed ? order.expected! : row.ticket);
      if (row.confirmed) confirmStalls.add(order.id);
    }
    const run = simulate(scenario, { tickets, confirmStalls, priority: table }).result;

    const served = run.orders.filter((order) => order.correct === true && order.onTime).length;
    const confirmed = confirmStalls.size;
    score = run.correct + served;
    total = scenario.orders.length * 2;
    passed =
      run.correct >= AI_PASS_CORRECT && confirmed <= AI_CONFIRM_BUDGET && served >= AI_SERVED_MIN;

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

  return { result, snapshot, score, total, passed };
}
