/**
 * Wire protocol between the lunch-shift UI and the server judge — shared
 * by `server/judge/lunch-shift/judge.ts` (producer) and the lab page
 * (consumer) so the payload shapes live exactly once.
 *
 * Drafts carry code + derived data, never functions: the browser's Pyodide
 * worker turns student code into JSON artefacts (a 124-cell priority
 * table, per-order confirm verdicts) and the server judges those. Code
 * snapshots stay for teacher review only.
 */

import type { LabProjectPayload } from "../../../shared/lab/contracts.ts";
import type { AiResultRow } from "./aiIntake.ts";
import type { RunSummary, Ticket } from "./contracts.ts";

/** Stage 1 draft: the guided three-station walkthrough of one order. */
export type TrainingDraft = {
  step: "record" | "cook" | "deliver" | "done";
  ticket: { item: string; note: string; table: string; urgent: boolean } | null;
  kitchenChoice: "urgent" | "normal" | null;
  deliveredTable: string | null;
};

/**
 * Stage 2 智能接单练习 draft: the need_confirm code plus the normalized
 * results the browser computed (AI ticket + confirm verdict per order)
 * on the 12 practice requests — expected tickets are public here.
 */
export type AiIntakeDraft = {
  confirmCode: string;
  results: AiResultRow[] | null;
};

/** Stage 3 draft: priority code plus its 124-cell result table. */
export type QueueDraft = {
  code: string;
  priority: number[] | null;
};

/**
 * Stage 4 综合挑战 draft: the same need_confirm artefact as stage 2,
 * now aimed at the hidden order set, plus the carried-over queue
 * artefact — confirmed tickets join the same queue simulation.
 */
export type AiDraft = AiIntakeDraft & {
  queueCode: string;
  priority: number[] | null;
};

/** Stage 5 附加挑战 draft: compensate code plus its 3844-cell result table. */
export type CompensateDraft = {
  code: string;
  compensate: number[] | null;
};

/** One compensated order row in the stage-5 bill. */
export type CompensateOrderRow = {
  id: string;
  urgent: boolean;
  delivered: boolean;
  overtime: number;
  /** 订单金额（元）— 退款退它的钱。 */
  price: number;
  choice: number;
  /** Bad-review probability for the chosen action, percent. */
  risk: number;
  cost: number;
};

export type LunchDraft = TrainingDraft | AiIntakeDraft | QueueDraft | AiDraft | CompensateDraft;

/** Stage 2 feedback: practice orders, so wording and expected tickets
 *  are shown — the student needs them to tune need_confirm. */
export type AiIntakeOrderResult = {
  id: string;
  request: string;
  correct: boolean;
  /** This order was sent back for customer confirmation. */
  confirmed: boolean;
  produced: Ticket;
  expected: Ticket;
};

/** Stage 4 feedback — counts only, no order wording. */
export type AiOrderResult = {
  id: string;
  correct: boolean;
  /** This order was sent back for customer confirmation. */
  confirmed: boolean;
  onTime: boolean;
};

export type LunchTestSummary =
  | { kind: "training"; differences?: string[] }
  | {
      kind: "ai-intake";
      correct: number;
      total: number;
      /** Orders sent back for confirmation — budgeted at AI_CONFIRM_BUDGET. */
      confirmed: number;
      orders?: AiIntakeOrderResult[];
    }
  | {
      kind: "queue";
      /** Probes passed — the layered score (field kept as onTime for
       *  compat with older recorded summaries). */
      onTime: number;
      total: number;
      errors?: string[];
      run?: RunSummary;
      probes?: {
        id: string;
        title: string;
        passed: boolean;
        /** Candidate the table picked (index into the probe's list). */
        picked: number;
        answer: number;
      }[];
    }
  | {
      kind: "final";
      correct: number;
      /** Orders that are BOTH correctly recorded and on time. */
      served: number;
      total: number;
      /** Orders sent back for confirmation — budgeted at AI_CONFIRM_BUDGET. */
      confirmed: number;
      orders?: AiOrderResult[];
    }
  | {
      kind: "compensate";
      /** Expected bad reviews ×100 (442 = 预计 4.42 单差评). */
      badReviewPoints: number;
      /** 补偿总花费（元）. */
      spend: number;
      /** Best achievable within the spend cap — the gap to aim at. */
      bestReviewPoints: number;
      bestSpend: number;
      orders?: CompensateOrderRow[];
      errors?: string[];
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
  /**
   * Stage-4 order wording, shipped the moment the result unlocks the
   * stage — same payload as LunchProjectExtras.aiOrders, so a student
   * who passes stage 3 mid-session can play stage 4 without a reload.
   */
  aiOrders: { id: string; request: string }[] | null;
};

/** Extra fields merged into GET /project: latest recorded summary per
 *  graded stage, plus this student's training order (deterministic). */
export type LunchProjectExtras = {
  runSummaries: {
    intake: LunchTestSummary | null;
    queue: LunchTestSummary | null;
    final: LunchTestSummary | null;
    compensate: LunchTestSummary | null;
  };
  training: { request: string; ticket: Ticket };
  /**
   * Stage-4 order requests for the browser's AI intake — ids and
   * wording only, no expected tickets. Null until the stage unlocks:
   * these are the graded orders, so they ship as late as possible.
   */
  aiOrders: { id: string; request: string }[] | null;
};

export type LunchProjectPayload = LabProjectPayload<LunchDraft> & LunchProjectExtras;
