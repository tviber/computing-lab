/**
 * Lunch-shift judge. Stages grade differently by design:
 *
 *  - 订单旅程: validates the walkthrough record (ticket + delivery).
 *  - 认识系统: 6/6 answers plus a valid four-line explanation.
 *  - 规则练习: records one practice-scenario run — always passes; the
 *    score is the teaching signal, not a gate.
 *  - 正式挑战: one-shot — a second submission is refused before grading.
 *
 * The scenario runs are pure functions of the submitted rules; the final
 * order set never leaves this directory.
 */

import type { DatabaseSync } from "node:sqlite";
import {
  applyBlockStrategy,
  traceIntake,
  traceQueueChoice,
} from "../../../src/features/lunch-shift/domain/blockStrategy.ts";
import type {
  CapturedDecision,
  RunSummary,
  Scenario,
} from "../../../src/features/lunch-shift/domain/contracts.ts";
import type {
  LunchJudgeResult,
  LunchTestSummary,
  QueueTraceRow,
} from "../../../src/features/lunch-shift/domain/protocol.ts";
import {
  PRACTICE_SCENARIO,
  TRAINING_TICKET,
} from "../../../src/features/lunch-shift/domain/scenarios.ts";
import { baselinePolicy, simulate } from "../../../src/features/lunch-shift/domain/simulator.ts";
import {
  getLunchStage,
  lunchStageUnlocked,
  nextLunchStage,
} from "../../../src/features/lunch-shift/domain/stages.ts";
import {
  gradeSystemCheck,
  isSystemExplanation,
  missedSystemCheckQuestions,
} from "../../../src/features/lunch-shift/domain/systemCheck.ts";
import {
  sanitizeChallengeDraft,
  sanitizeCheckDraft,
  sanitizeTrainingDraft,
} from "../../../src/features/lunch-shift/lesson/state.ts";
import { sameTicket } from "../../../src/features/lunch-shift/domain/contracts.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";
import { FINAL_SCENARIO } from "./hiddenSet.ts";

/** "谁定的 / 为什么选它" explainers, replayed over the captured decisions. */
function buildTrace(captured: CapturedDecision[], blocks: ReturnType<typeof sanitizeChallengeDraft>["blocks"]) {
  const orders: Record<string, Record<string, string>> = {};
  const queue: QueueTraceRow[] = [];
  for (const item of captured) {
    if (item.stage === "intake" && item.orderId && item.request) {
      orders[item.orderId] = traceIntake(item.request, blocks.intake.rules);
    } else if (
      (item.stage === "kitchen" || item.stage === "delivery") &&
      item.queue &&
      typeof item.output === "string"
    ) {
      queue.push({
        stage: item.stage,
        tick: item.tick,
        picked: item.output,
        why: traceQueueChoice(blocks[item.stage].rules, item.queue),
      });
    }
  }
  return { orders, queue };
}

function runChallenge(
  draft: ReturnType<typeof sanitizeChallengeDraft>,
  scenario: Scenario,
  stripBaselineOrders: boolean,
): { run: RunSummary; baseline: RunSummary; trace: ReturnType<typeof buildTrace> } {
  const { result, captured } = simulate(
    scenario,
    (ctx) => applyBlockStrategy(ctx, draft.blocks),
    1,
    1,
  );
  const baseline = simulate(scenario, baselinePolicy, 1, 1).result;
  if (stripBaselineOrders) baseline.orders = [];
  return { run: result, baseline, trace: buildTrace(captured, draft.blocks) };
}

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
    const differences: string[] = [];
    const ticketOk = draft.ticket != null && sameTicket(draft.ticket, TRAINING_TICKET);
    if (!ticketOk) {
      if (!draft.ticket || draft.ticket.item !== TRAINING_TICKET.item)
        differences.push(`菜品应为${TRAINING_TICKET.item}`);
      if (!draft.ticket || draft.ticket.note !== TRAINING_TICKET.note)
        differences.push(`备注应为${TRAINING_TICKET.note}`);
      if (!draft.ticket || draft.ticket.table !== TRAINING_TICKET.table)
        differences.push(`桌号应为 ${TRAINING_TICKET.table}，写错会送错桌`);
      if (!draft.ticket || draft.ticket.urgent !== TRAINING_TICKET.urgent)
        differences.push("顾客说不赶时间，应选普通");
    }
    if (draft.kitchenChoice === null) differences.push("还没有决定先做哪张订单");
    const deliveryOk = draft.deliveredTable === TRAINING_TICKET.table;
    if (!deliveryOk) differences.push("送餐桌号要和小票一致");
    passed = draft.step === "done" && ticketOk && deliveryOk && draft.kitchenChoice !== null;
    score = passed ? 1 : 0;
    total = 1;
    testSummary = { kind: "training", differences };
  } else if (stageIndex === 2) {
    const draft = sanitizeCheckDraft(rawDraft);
    snapshot = draft;
    score = gradeSystemCheck(draft.answers);
    total = 6;
    const explanationOk = isSystemExplanation(draft.explanation);
    passed = score === total && explanationOk;
    testSummary = {
      kind: "system-check",
      missed: missedSystemCheckQuestions(draft.answers),
      explanationOk,
    };
  } else {
    const draft = sanitizeChallengeDraft(rawDraft);
    snapshot = draft;
    if (stageIndex === 4) {
      // One-shot contract: any earlier stage-4 submission row means the
      // final was already recorded — refuse before grading again.
      const existing = db
        .prepare(
          "SELECT id FROM submissions WHERE project_id = ? AND lab_id = ? AND stage_index = 4 LIMIT 1",
        )
        .get(project.id, project.labId);
      if (existing) return { error: "final-used", status: 409 };
    }
    const scenario = stageIndex === 4 ? FINAL_SCENARIO : PRACTICE_SCENARIO;
    const { run, baseline, trace } = runChallenge(draft, scenario, stageIndex === 4);
    score = run.score ?? 0;
    total = 100;
    passed = true;
    testSummary = { kind: "run", run, baseline, trace };
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
      testSummary,
    });
    if (passed) {
      const progress = advanceStage(db, project, stageIndex, nextLunchStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  return result;
}
