/**
 * Wire protocol between the lunch-shift UI and the server judge — shared
 * by `server/judge/lunch-shift/judge.ts` (producer) and the lab page
 * (consumer) so the payload shapes live exactly once.
 */

import type { LabProjectPayload } from "../../../shared/api/client.ts";
import type { BlockDrafts, Focus, RunSummary, Ticket } from "./contracts.ts";

/** Stage 1 draft: the guided three-station walkthrough of one order. */
export type TrainingDraft = {
  step: "record" | "cook" | "deliver" | "done";
  ticket: { item: string; note: string; table: string; urgent: boolean } | null;
  kitchenChoice: "urgent" | "normal" | null;
  deliveredTable: string | null;
};

/** Stage 2 draft: check answers + the four-line system explanation. */
export type SystemCheckDraft = {
  answers: Record<string, string>;
  explanation: string;
  attempts: number;
};

/** Stages 3 & 4 share one shape: the student's rules and declared focus. */
export type ChallengeDraft = {
  focus: Focus | null;
  blocks: BlockDrafts;
};

export type LunchDraft = TrainingDraft | SystemCheckDraft | ChallengeDraft;

export type QueueTraceRow = {
  stage: Focus;
  tick: number;
  picked: string;
  why: string;
};

/** "谁定的" per order field + "为什么选它" per queue pick. */
export type RunTrace = {
  orders: Record<string, Record<string, string>>;
  queue: QueueTraceRow[];
};

export type LunchTestSummary = {
  kind: "training" | "system-check" | "run";
  /** Stage 1: which ticket/delivery fields were wrong. */
  differences?: string[];
  /** Stage 2: question ids still wrong, and whether the 4-line text passed. */
  missed?: string[];
  explanationOk?: boolean;
  /** Stage 2: 0-based indexes of the explanation parts still off-topic. */
  explanationMissed?: number[];
  /** Stages 3 & 4: the simulated round and its explainers. */
  run?: RunSummary;
  baseline?: RunSummary | null;
  trace?: RunTrace;
};

export type LunchJudgeResult = {
  score: number;
  total: number;
  passed: boolean;
  testSummary: LunchTestSummary;
  submissionId: string;
  currentStage: number;
  passedStages: number[];
  unlockedComponent: null;
};

/** Extra fields merged into GET /project: latest recorded run per stage,
 *  plus this student's training order (deterministic from user id). */
export type LunchProjectExtras = {
  runSummaries: {
    practice: LunchTestSummary | null;
    final: LunchTestSummary | null;
  };
  training: { request: string; ticket: Ticket };
};

export type LunchProjectPayload = LabProjectPayload<LunchDraft> & LunchProjectExtras;
