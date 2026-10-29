/**
 * Lunch-shift lab contracts — the shared vocabulary between the student
 * page, the draft store and the server judge. The lab was rebuilt around
 * student-supplied data (intake word tables) and a student-supplied
 * priority function: the old Go-engine score locks (71/74/88) and the
 * block-rule vocabulary no longer apply.
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
  item: string;
  note: string;
  table: string;
  urgent: boolean;
  /** Correct ticket for feedback; practice runs only — stripped for final. */
  expected?: Ticket;
};

export type SimulationAction =
  "arrive" | "held" | "ticket" | "ready" | "cook" | "expedite" | "send";

export type SimulationEvent = {
  tick: number;
  stage: Focus;
  orderId: string;
  action: SimulationAction;
};

/** One queue decision among ≥2 candidates, with each candidate's inputs
 *  and the value the priority table gave it (null when no table ran). */
export type QueuePick = {
  tick: number;
  stage: "kitchen" | "delivery";
  picked: string;
  candidates: {
    id: string;
    urgent: boolean;
    waitTicks: number;
    cookTicks: number;
    value: number | null;
  }[];
};

export type RunSummary = {
  correct: number;
  delivered: number;
  onTime: number;
  orders: OrderResult[];
  events?: SimulationEvent[];
  picks?: QueuePick[];
  /** How many of the 3 expedite chances were spent this run. */
  expeditesUsed?: number;
};

export type SimulationRun = {
  result: RunSummary;
};

export function sameTicket(left: Ticket | null | undefined, right: Ticket): boolean {
  return (
    left != null &&
    left.item === right.item &&
    left.note === right.note &&
    left.table === right.table &&
    left.urgent === right.urgent
  );
}
