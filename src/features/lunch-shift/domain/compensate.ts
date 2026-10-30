/**
 * Stage-5 附加挑战: compensate(urgent, overtime, delivered) picks a
 * compensation tier for each problem order from ONE fixed run — the
 * 20-order rush set replayed first-come-first-served, which leaves 11
 * orders late or undelivered (urgent and normal alike, so every argument
 * matters). The browser evaluates the function over all 2×31×2 inputs →
 * a 124-cell table (0/1/2); the server replays it.
 *
 * Scoring is grounded in the bad-review table shown on the panel — the
 * restaurant's historical rates per situation. Expected bad reviews are
 * a deterministic sum (no randomness), and passing needs BOTH expected
 * reviews ≤ 4.5 and spend ≤ 80 元: refunding all six undelivered orders
 * costs 90 元, already over budget, so the student has to pick WHICH
 * undelivered orders deserve a refund — that is the trade-off the
 * takeaway describes.
 */

import type { CompensateOrderRow } from "./protocol.ts";
import { RUSH_SCENARIO } from "./scenarios.ts";
import { simulate } from "./simulator.ts";

export const COMPENSATE_OVERTIMES = 31; // overtime ∈ 0..30, clamped like wait
export const COMPENSATE_TABLE_SIZE = 2 * COMPENSATE_OVERTIMES * 2; // 124

export function compensateIndex(urgent: boolean, overtime: number, delivered: boolean): number {
  const clamped = Math.max(0, Math.min(COMPENSATE_OVERTIMES - 1, Math.trunc(overtime)));
  return (urgent ? COMPENSATE_OVERTIMES * 2 : 0) + clamped * 2 + (delivered ? 1 : 0);
}

export function checkCompensateTable(raw: unknown): {
  table: number[] | null;
  errors: string[];
} {
  if (raw === null || raw === undefined) {
    return {
      table: null,
      errors: ["还没有可用的结果表，运行 compensate 后才算得出 124 个值。"],
    };
  }
  if (!Array.isArray(raw) || raw.length !== COMPENSATE_TABLE_SIZE) {
    return {
      table: null,
      errors: [
        `结果表长度不对，应是 ${COMPENSATE_TABLE_SIZE} 个值（2 种是否加急 × 31 种超时 × 2 种是否送到）。`,
      ],
    };
  }
  const errors: string[] = [];
  const table = raw.map((value, index) => {
    if (value === 0 || value === 1 || value === 2) return value;
    errors.push(`第 ${index + 1} 个值是 ${String(value)}，只能返回 0、1 或 2。`);
    return 0;
  });
  return { table: errors.length ? null : table, errors };
}

/** How much overtime (拍 beyond the deadline) one order carries. */
export function overtimeOf(wait: number, urgent: boolean): number {
  return Math.max(0, wait - (urgent ? 9 : 18) + 1);
}

/** Compensation choices: 0 不补偿 / 1 送小食 / 2 部分退款 — unit cost in 元. */
export const COMPENSATE_COST = [0, 2, 15] as const;
export const COMPENSATE_CHOICES = ["不补偿", "送小食", "部分退款"] as const;

export type CompensateTier = "mild" | "bad" | "worst" | "lost";

export const REVIEW_RISK_TIERS: { key: CompensateTier; label: string }[] = [
  { key: "mild", label: "送到了，超时 1～3 拍" },
  { key: "bad", label: "送到了，超时 4～8 拍" },
  { key: "worst", label: "送到了，超时 9 拍以上" },
  { key: "lost", label: "没送到" },
];

/**
 * The restaurant's historical bad-review rates (percent) — shown verbatim
 * on the panel so students score by looking, not by reverse-engineering.
 * Each tier stores [不补偿, 送小食, 部分退款] for 普通 and 加急 orders:
 * a rushed customer left waiting forgives less at every step.
 */
export const REVIEW_RISK: Record<
  CompensateTier,
  { normal: readonly [number, number, number]; urgent: readonly [number, number, number] }
> = {
  mild: { normal: [25, 8, 3], urgent: [40, 12, 5] },
  bad: { normal: [50, 20, 6], urgent: [65, 32, 10] },
  worst: { normal: [70, 45, 12], urgent: [85, 58, 15] },
  lost: { normal: [85, 60, 22], urgent: [95, 78, 32] },
};

/** Pass needs BOTH numbers under the line — that's what makes it a trade-off. */
export const COMPENSATE_PASS_REVIEWS = 450; // 预计差评 ≤ 4.50 单
export const COMPENSATE_PASS_SPEND = 80; // 补偿总花费 ≤ 80 元

export function tierOf(overtime: number, delivered: boolean): CompensateTier {
  if (!delivered) return "lost";
  if (overtime <= 3) return "mild";
  if (overtime <= 8) return "bad";
  return "worst";
}

/** Bad-review probability (percent) for one compensated order. */
export function reviewRisk(
  urgent: boolean,
  overtime: number,
  delivered: boolean,
  choice: number,
): number {
  const row = REVIEW_RISK[tierOf(overtime, delivered)][urgent ? "urgent" : "normal"];
  return row[choice] ?? row[0];
}

/** One problem order reduced to the arguments compensate() receives. */
export type CompensateLateOrder = {
  id: string;
  urgent: boolean;
  delivered: boolean;
  overtime: number;
};

let cachedLate: CompensateLateOrder[] | null = null;

/**
 * The bill everyone pays: the same first-come-first-served replay of the
 * 晚高峰 set the judge uses — the queue is done, only compensation is left.
 */
export function compensateLateOrders(): CompensateLateOrder[] {
  if (cachedLate === null) {
    const run = simulate(RUSH_SCENARIO, { priority: null }).result;
    cachedLate = run.orders
      .filter((order) => !order.onTime)
      .map((order) => {
        const urgent = order.expected?.urgent === true;
        return {
          id: order.id,
          urgent,
          delivered: order.delivered,
          overtime: overtimeOf(order.wait, urgent),
        };
      });
  }
  return cachedLate;
}

export type CompensateBill = {
  orders: CompensateOrderRow[];
  /** Expected bad reviews ×100 — the sum of per-order percents. */
  badReviewPoints: number;
  spend: number;
};

/** Apply the table to every problem order; reviews add up deterministically. */
export function evaluateCompensation(
  orders: readonly CompensateLateOrder[],
  table: readonly number[],
): CompensateBill {
  const rows: CompensateOrderRow[] = [];
  let badReviewPoints = 0;
  let spend = 0;
  for (const order of orders) {
    const choice = table[compensateIndex(order.urgent, order.overtime, order.delivered)] ?? 0;
    const risk = reviewRisk(order.urgent, order.overtime, order.delivered, choice);
    const cost = COMPENSATE_COST[choice] ?? 0;
    rows.push({ ...order, choice, risk, cost });
    badReviewPoints += risk;
    spend += cost;
  }
  return { orders: rows, badReviewPoints, spend };
}

/**
 * The best reachable bill inside the spend cap — a small knapsack over
 * per-order choices, so the panel can show the gap without any sampling.
 * Orders sharing one (urgent, overtime, delivered) input must take the
 * same choice — a student's function can't tell them apart — so the DP
 * runs over input groups, or it would show a bill no function can reach.
 */
export function bestCompensation(
  orders: readonly CompensateLateOrder[],
  maxSpend = COMPENSATE_PASS_SPEND,
): { badReviewPoints: number; spend: number } {
  const groups = new Map<string, { u: boolean; o: number; d: boolean; n: number }>();
  for (const order of orders) {
    const key = `${order.urgent}|${order.overtime}|${order.delivered}`;
    const group = groups.get(key) ?? {
      u: order.urgent,
      o: order.overtime,
      d: order.delivered,
      n: 0,
    };
    group.n++;
    groups.set(key, group);
  }
  const items = [...groups.values()];
  const maxCost = items.reduce((sum, g) => sum + g.n * COMPENSATE_COST[2], 0);
  let dp = new Array<number>(maxCost + 1).fill(Infinity);
  dp[0] = 0;
  for (const g of items) {
    const next = new Array<number>(maxCost + 1).fill(Infinity);
    for (let spend = 0; spend <= maxCost; spend++) {
      if (dp[spend] === Infinity) continue;
      for (const choice of [0, 1, 2] as const) {
        const total = spend + COMPENSATE_COST[choice] * g.n;
        const points = dp[spend] + reviewRisk(g.u, g.o, g.d, choice) * g.n;
        if (points < next[total]) next[total] = points;
      }
    }
    dp = next;
  }
  let best = { badReviewPoints: Infinity, spend: 0 };
  for (let spend = 0; spend <= Math.min(maxSpend, maxCost); spend++) {
    if (dp[spend] < best.badReviewPoints) best = { badReviewPoints: dp[spend], spend };
  }
  return best;
}
