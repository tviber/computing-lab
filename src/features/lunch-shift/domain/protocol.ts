/**
 * Wire protocol between the lunch-shift UI and the server judge — shared
 * by `server/judge/lunch-shift/judge.ts` (producer) and the lab page
 * (consumer) so the payload shapes live exactly once.
 *
 * Drafts carry code + derived data, never functions: the browser's Pyodide
 * worker turns student code into JSON word tables / a 124-cell priority
 * table, and the server judges those. Code snapshots stay for teacher
 * review only.
 */

import type { LabProjectPayload } from "../../../shared/api/client.ts";
import type { RunSummary, Ticket } from "./contracts.ts";
import type { IntakeTables } from "./wordTables.ts";

/** Stage 1 draft: the guided three-station walkthrough of one order. */
export type TrainingDraft = {
  step: "record" | "cook" | "deliver" | "done";
  ticket: { item: string; note: string; table: string; urgent: boolean } | null;
  kitchenChoice: "urgent" | "normal" | null;
  deliveredTable: string | null;
};

/** Stage 2 draft: word-table code plus the tables it produced. */
export type IntakeDraft = {
  code: string;
  tables: IntakeTables | null;
};

/** Stage 3 draft: priority code plus its 124-cell result table. */
export type QueueDraft = {
  code: string;
  priority: number[] | null;
};

/** Stage 4 draft: both artefacts carried over from stages 2 and 3. */
export type FinalDraft = {
  intakeCode: string;
  tables: IntakeTables | null;
  queueCode: string;
  priority: number[] | null;
};

export type LunchDraft = TrainingDraft | IntakeDraft | QueueDraft | FinalDraft;

/** Stage 2 feedback: which word decided each ticket field. */
export type IntakeOrderResult = {
  id: string;
  request: string;
  correct: boolean;
  produced: Ticket;
  expected: Ticket;
  itemKey: string | null;
  noteKey: string | null;
  urgentVia: "calm" | "rush" | "none";
  urgentKey: string | null;
};

/** Stage 4 feedback — counts only, no order wording. */
export type FinalOrderResult = {
  id: string;
  correct: boolean;
  onTime: boolean;
};

export type LunchTestSummary =
  | { kind: "training"; differences?: string[] }
  | {
      kind: "intake";
      correct: number;
      total: number;
      errors?: string[];
      orders?: IntakeOrderResult[];
    }
  | {
      kind: "queue";
      onTime: number;
      total: number;
      errors?: string[];
      run?: RunSummary;
    }
  | {
      kind: "final";
      correct: number;
      onTime: number;
      total: number;
      orders?: FinalOrderResult[];
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

/** Extra fields merged into GET /project: latest recorded summary per
 *  graded stage, plus this student's training order (deterministic). */
export type LunchProjectExtras = {
  runSummaries: {
    intake: LunchTestSummary | null;
    queue: LunchTestSummary | null;
    final: LunchTestSummary | null;
  };
  training: { request: string; ticket: Ticket };
};

export type LunchProjectPayload = LabProjectPayload<LunchDraft> & LunchProjectExtras;
