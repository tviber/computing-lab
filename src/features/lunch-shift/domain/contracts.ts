/**
 * Lunch-shift lab contracts — the shared vocabulary between the student
 * page, the draft store and the server judge. Ported from the Go
 * lunchshift engine (kitchen/main.go + engine.go); scores are locked by
 * golden values (practice baseline 71, final baseline 74, standard set 88),
 * so semantics here must stay identical to the Go original.
 */

export const FOCUSES = ["intake", "kitchen", "delivery"] as const;
export type Focus = (typeof FOCUSES)[number];

export const FOCUS_LABELS: Record<Focus, string> = {
  intake: "接单",
  kitchen: "厨房",
  delivery: "出餐",
};

export const DISHES = ["鸡腿饭", "蛋炒饭", "牛肉面"] as const;
export const NOTES = ["不要香菜", "少辣", "加蛋", "无备注"] as const;
export const TABLES = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

/** One written ticket: what the intake step records from a request. */
export type Ticket = {
  item: string;
  note: string;
  table: string;
  urgent: boolean;
};

/**
 * One rule statement the student attached under a station's start
 * statement. `phrase`/`value`/`ticks` presence depends on `type`; the
 * validator in blockStrategy.ts owns the exact per-type contract.
 */
export type BlockRule = {
  type: string;
  phrase?: string;
  value?: unknown;
  ticks?: number;
};

/** One station's rule list — the only thing the engine reads. */
export type BlockDraft = {
  rules: BlockRule[];
  /** Blockly workspace JSON for restoring the editor; rules are the source of truth. */
  workspace?: string;
};

export type BlockDrafts = Record<Focus, BlockDraft>;

export function emptyBlockDrafts(): BlockDrafts {
  return { intake: { rules: [] }, kitchen: { rules: [] }, delivery: { rules: [] } };
}

/** One order as the queue rules see it at decision time. */
export type Candidate = {
  id: string;
  item: string;
  note: string;
  table: string;
  urgent: boolean;
  request: string;
  arrivalTick: number;
  readyTick: number | null;
  waitTicks: number;
  cookTicks: number;
  deadline: number;
};

/** What the policy is asked: parse one request (intake) or pick an order. */
export type DecisionContext = {
  stage: Focus;
  tick: number;
  orderId?: string;
  request?: string;
  queue: Candidate[];
};

export type ScenarioOrder = {
  id: string;
  request: string;
  arrivalTick: number;
  cookTicks: number;
  /** Hidden grading ticket — stripped by publicScenario before export. */
  expected?: Ticket;
};

export type Scenario = {
  id: string;
  totalTicks: number;
  deliveryTicks: number;
  orders: ScenarioOrder[];
};

export type OrderResult = {
  id: string;
  request: string;
  correct: boolean | null;
  delivered: boolean;
  onTime: boolean;
  wait: number;
  points: number;
  item: string;
  note: string;
  table: string;
  urgent: boolean;
};

export type SimulationAction = "arrive" | "held" | "ticket" | "ready" | "cook" | "send";

export type SimulationEvent = {
  tick: number;
  stage: Focus;
  orderId: string;
  action: SimulationAction;
};

export type RunSummary = {
  score: number | null;
  correct: number;
  delivered: number;
  onTime: number;
  averageWait: number;
  orders: OrderResult[];
  invalidDecisions: number;
  bottleneck: Focus;
  events?: SimulationEvent[];
};

/** Every policy call recorded during a run — feeds the trace explainers. */
export type CapturedDecision = {
  stage: Focus;
  tick: number;
  orderId?: string;
  request?: string;
  queue?: Candidate[];
  output: unknown;
};

export type Policy = (ctx: DecisionContext) => unknown;

export type SimulationRun = {
  result: RunSummary;
  captured: CapturedDecision[];
};

/** Request-text patterns shared by the default parser and the rule engine. */
export const TABLE_DEFAULT_PATTERN = /([1-8])\s*号桌/;
export const TABLE_PREFIX_PATTERN = /(?:桌号|桌)\s*([1-8])/;
export const URGENT_WORDS = /赶时间|急着|快一点|尽快/;
export const NOT_URGENT_WORDS = /不赶时间|不急着|不用急/;

export function isFocus(value: unknown): value is Focus {
  return typeof value === "string" && (FOCUSES as readonly string[]).includes(value);
}

export function sameTicket(left: Ticket | null | undefined, right: Ticket): boolean {
  return (
    left != null &&
    left.item === right.item &&
    left.note === right.note &&
    left.table === right.table &&
    left.urgent === right.urgent
  );
}
