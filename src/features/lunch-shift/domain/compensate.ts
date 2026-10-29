/**
 * Stage-5 附加挑战: compensate(urgent, wait) decides how the restaurant
 * makes up for each LATE order. The browser evaluates the function over
 * all 2×31 inputs → a 62-cell table (0/1/2); the server replays it.
 *
 * Rules (stated on the panel):
 *   0 不补偿  —— 成本 0，超时损失全吃
 *   1 送小食  —— 成本 1，最多挽回 3 拍损失
 *   2 部分退款 —— 成本 3，超时损失全挽回
 * 损失 = 这张单等超过上限的拍数；净挽回 = 挽回 − 成本，可负。
 */

export const COMPENSATE_TABLE_SIZE = 2 * 31;

export function compensateIndex(urgent: boolean, wait: number): number {
  return (urgent ? 31 : 0) + Math.max(0, Math.min(30, Math.trunc(wait)));
}

export function checkCompensateTable(raw: unknown): {
  table: number[] | null;
  errors: string[];
} {
  if (raw === null || raw === undefined) {
    return {
      table: null,
      errors: ["还没有可用的结果表，运行 compensate 后才算得出 62 个值。"],
    };
  }
  if (!Array.isArray(raw) || raw.length !== COMPENSATE_TABLE_SIZE) {
    return {
      table: null,
      errors: [`结果表长度不对——应是 ${COMPENSATE_TABLE_SIZE} 个值（2 种是否加急 × 31 种等待）。`],
    };
  }
  const errors: string[] = [];
  const table = raw.map((value, index) => {
    if (value === 0 || value === 1 || value === 2) return value;
    errors.push(`第 ${index + 1} 个值是 ${String(value)}——只能返回 0、1 或 2。`);
    return 0;
  });
  return { table: errors.length ? null : table, errors };
}

/** How much overtime (拍 beyond the deadline) one late order carries. */
export function overtimeOf(wait: number, urgent: boolean): number {
  return Math.max(0, wait - (urgent ? 9 : 18) + 1);
}

export type CompensateOrderResult = {
  id: string;
  urgent: boolean;
  wait: number;
  overtime: number;
  choice: number;
  recovered: number;
  cost: number;
};

/** Apply the table to every late order in a run; net = recovered − cost. */
export function evaluateCompensation(
  orders: readonly {
    id: string;
    onTime: boolean;
    wait: number;
    expected?: { urgent: boolean } | null;
  }[],
  table: readonly number[],
): { orders: CompensateOrderResult[]; recovered: number; cost: number; net: number; loss: number } {
  const results: CompensateOrderResult[] = [];
  let recovered = 0;
  let cost = 0;
  let loss = 0;
  for (const order of orders) {
    if (order.onTime) continue;
    const urgent = order.expected?.urgent === true;
    const overtime = overtimeOf(order.wait, urgent);
    const choice = table[compensateIndex(urgent, Math.min(30, order.wait))] ?? 0;
    const gain = choice === 0 ? 0 : choice === 1 ? Math.min(overtime, 3) : overtime;
    const price = choice === 0 ? 0 : choice === 1 ? 1 : 3;
    results.push({
      id: order.id,
      urgent,
      wait: order.wait,
      overtime,
      choice,
      recovered: gain,
      cost: price,
    });
    recovered += gain;
    cost += price;
    loss += overtime;
  }
  return { orders: results, recovered, cost, net: recovered - cost, loss };
}
