/**
 * Public scenario data: the guided-training order, round tuning, and the
 * three practice sets. The FINAL fixture list is deliberately NOT here —
 * it lives in server/judge/lunch-shift/hiddenSet.ts so the graded orders
 * stay server-only.
 *
 * Order-set properties (locked by engine.test.ts):
 *  - INTAKE set: the AI model misses P10 outright — 「辣子照旧」 →
 *    少辣 (true 无备注 — “照旧” means the customer's usual, which is
 *    the standard preparation; the AI has no history, so it should ask
 *    rather than guess. Catchable by low similarity). P06 「想快一点但
 *    不想加钱」 stays 普通 but with
 *    a near-zero margin, so its urgency answer can flip on the next
 *    phrasing and the margin signal still asks for a confirmation.
 *  - QUEUE set (小票已录对): FIFO 8/12 on-time, urgent-first 11/12, and
 *    urgent + wait-boost reaches 12/12 for every threshold T in 8..16.
 *  - RUSH set: an optional denser 20-order round for fast finishers.
 */

import type { Scenario, Ticket } from "./contracts.ts";

export const TICKS_PER_ROUND = 30;
export const DELIVERY_TICKS = 2;

export type FixtureOrder = {
  request: string;
  expected: Ticket;
  cookTicks: number;
  arrivalTick: number;
};

export function buildScenario(prefix: string, fixtures: FixtureOrder[]): Scenario {
  return {
    id: `${prefix}-v1`,
    totalTicks: TICKS_PER_ROUND,
    deliveryTicks: DELIVERY_TICKS,
    orders: fixtures.map((item, index) => ({
      id: `${prefix}${String(index + 1).padStart(2, "0")}`,
      request: item.request,
      arrivalTick: item.arrivalTick,
      cookTicks: item.cookTicks,
      expected: { ...item.expected },
    })),
  };
}

export const TRAINING_REQUEST = "请送到 5 号桌，一份牛肉面，少辣。我不赶时间，正常就好。";
export const TRAINING_TICKET: Ticket = { item: "牛肉面", note: "少辣", table: "5", urgent: false };

export type TrainingOrder = { request: string; ticket: Ticket };

const TRAINING_ITEMS: { item: Ticket["item"]; note: string }[] = [
  { item: "鸡腿饭", note: "不要香菜" },
  { item: "蛋炒饭", note: "加蛋" },
  { item: "牛肉面", note: "少辣" },
];

const CALM_PHRASES = ["我不赶时间，正常做就好。", "不急着吃，慢慢来。", "不用急，正常做就行。"];

/** Deterministic per-student training order — the same student always gets
 *  the same sentence, different students get different tables/notes.
 *  The order is ALWAYS normal: the companion order (2 号桌 · 鸡腿饭 ·
 *  加急 · 1 拍) stays fixed, and the step-2 copy ("先做加急单少等 3 拍")
 *  only makes sense with exactly one urgent order on the board. */
export function trainingOrderFor(seed: string): TrainingOrder {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const h = Math.abs(hash);
  const item = TRAINING_ITEMS[h % TRAINING_ITEMS.length];
  const table = String(((h >> 4) % 8) + 1);
  const phrase = CALM_PHRASES[(h >> 12) % CALM_PHRASES.length];
  return {
    request: `${h % 2 ? "麻烦送到" : "请送到"} ${table} 号桌，一份${item.item}，${item.note}。${phrase}`,
    ticket: { item: item.item, note: item.note, table, urgent: false },
  };
}

/**
 * Stage 2 智能接单·练习 — 12 orders the local AI reads. The restaurant
 * sells a paid 加急 option, so urgency is phrased as paying for speed
 * (要加急 / 付费加急 / 走加急通道…). Two orders exercise the two
 * confidence signals: P06 wants speed without paying and sits on a
 * near-zero urgency margin (the value may flip, so margin should ask),
 * while P10 asks for the usual preparation (辣子照旧 → reads 少辣,
 * similarity ≈0.57 — "usual" depends on history the AI doesn't have;
 * only the similarity signal flags it). An honest need_confirm sends
 * both back to the customer.
 */
export const INTAKE_FIXTURES: FixtureOrder[] = [
  {
    request: "麻烦送到 3 号桌，一份鸡腿饭，不要香菜。我赶时间，这单要加急。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "3", urgent: true },
    cookTicks: 1,
    arrivalTick: 1,
  },
  {
    request: "5号桌要牛肉面，少辣；我不赶时间，正常做就好。",
    expected: { item: "牛肉面", note: "少辣", table: "5", urgent: false },
    cookTicks: 3,
    arrivalTick: 2,
  },
  {
    request: "请给 6 号桌做炒饭，加蛋，这单付费加急。",
    expected: { item: "蛋炒饭", note: "加蛋", table: "6", urgent: true },
    cookTicks: 1,
    arrivalTick: 4,
  },
  {
    request: "4号桌，鸡腿饭，不放香菜。我加钱加急。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "4", urgent: true },
    cookTicks: 1,
    arrivalTick: 5,
  },
  {
    request: "送到8号桌：牛肉面，少辣，不急着吃。",
    expected: { item: "牛肉面", note: "少辣", table: "8", urgent: false },
    cookTicks: 3,
    arrivalTick: 6,
  },
  {
    request: "7号桌来份鸡腿饭，加蛋，想快一点但不想加钱。",
    expected: { item: "鸡腿饭", note: "加蛋", table: "7", urgent: false },
    cookTicks: 1,
    arrivalTick: 7,
  },
  {
    request: "1号桌蛋炒饭，不要香菜，平常速度就行。",
    expected: { item: "蛋炒饭", note: "不要香菜", table: "1", urgent: false },
    cookTicks: 1,
    arrivalTick: 9,
  },
  {
    request: "请把牛肉面送去2号桌，别太辣，我急着开会，走加急通道。",
    expected: { item: "牛肉面", note: "少辣", table: "2", urgent: true },
    cookTicks: 3,
    arrivalTick: 10,
  },
  {
    request: "3号桌鸡腿饭，不要香菜，不用加急，慢慢做。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "3", urgent: false },
    cookTicks: 1,
    arrivalTick: 11,
  },
  {
    request: "6号桌牛肉面，辣子照旧，不用赶时间。",
    expected: { item: "牛肉面", note: "无备注", table: "6", urgent: false },
    cookTicks: 3,
    arrivalTick: 12,
  },
  {
    request: "2号桌来一份蛋炒饭，加蛋，这单付费加快。",
    expected: { item: "蛋炒饭", note: "加蛋", table: "2", urgent: true },
    cookTicks: 1,
    arrivalTick: 14,
  },
  {
    request: "4号桌鸡腿饭，不要香菜，这单加急。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "4", urgent: true },
    cookTicks: 1,
    arrivalTick: 15,
  },
];

export const INTAKE_SCENARIO = buildScenario("P", INTAKE_FIXTURES);

/**
 * Stage 3 修排队 — tickets already correct; only queueing is graded.
 * Ladder (engine.test.ts locks this): FIFO 8/12, urgent-first 11/12
 * (Q07 starves), both scoring styles — additive urgent+1 / wait≥T+1 and
 * overwrite urgent→1 / wait≥T→2 — reach 12/12 for every T in 8..16.
 */
export const QUEUE_FIXTURES: FixtureOrder[] = [
  {
    request: "6号桌蛋炒饭，不要香菜，不赶时间。",
    expected: { item: "蛋炒饭", note: "不要香菜", table: "6", urgent: false },
    cookTicks: 3,
    arrivalTick: 2,
  },
  {
    request: "2号桌鸡腿饭，不要香菜，赶时间。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "2", urgent: true },
    cookTicks: 1,
    arrivalTick: 4,
  },
  {
    request: "4号桌牛肉面，少辣，正常做就好。",
    expected: { item: "牛肉面", note: "少辣", table: "4", urgent: false },
    cookTicks: 3,
    arrivalTick: 4,
  },
  {
    request: "1号桌牛肉面，加蛋，急着走。",
    expected: { item: "牛肉面", note: "加蛋", table: "1", urgent: true },
    cookTicks: 3,
    arrivalTick: 4,
  },
  {
    request: "7号桌牛肉面，少辣，不急着吃。",
    expected: { item: "牛肉面", note: "少辣", table: "7", urgent: false },
    cookTicks: 3,
    arrivalTick: 4,
  },
  {
    request: "3号桌鸡腿饭，不要香菜，慢慢来。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "3", urgent: false },
    cookTicks: 1,
    arrivalTick: 1,
  },
  {
    request: "5号桌蛋炒饭，加蛋，平常速度。",
    expected: { item: "蛋炒饭", note: "加蛋", table: "5", urgent: false },
    cookTicks: 1,
    arrivalTick: 5,
  },
  {
    request: "6号桌鸡腿饭，加蛋，这单加急。",
    expected: { item: "鸡腿饭", note: "加蛋", table: "6", urgent: true },
    cookTicks: 1,
    arrivalTick: 5,
  },
  {
    request: "2号桌蛋炒饭，不要香菜，我要加急。",
    expected: { item: "蛋炒饭", note: "不要香菜", table: "2", urgent: true },
    cookTicks: 1,
    arrivalTick: 7,
  },
  {
    request: "8号桌牛肉面，少辣，赶时间。",
    expected: { item: "牛肉面", note: "少辣", table: "8", urgent: true },
    cookTicks: 3,
    arrivalTick: 11,
  },
  {
    request: "1号桌蛋炒饭，无备注，不赶时间。",
    expected: { item: "蛋炒饭", note: "无备注", table: "1", urgent: false },
    cookTicks: 3,
    arrivalTick: 16,
  },
  {
    request: "4号桌鸡腿饭，不要香菜，急着要。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "4", urgent: true },
    cookTicks: 1,
    arrivalTick: 18,
  },
];

export const QUEUE_SCENARIO = buildScenario("Q", QUEUE_FIXTURES);

/**
 * Optional 晚高峰 set for fast finishers — denser arrivals, same rules.
 * Practiced locally, never recorded.
 */
export const RUSH_FIXTURES: FixtureOrder[] = [
  {
    request: "1号桌鸡腿饭，不要香菜，赶时间。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "1", urgent: true },
    cookTicks: 1,
    arrivalTick: 1,
  },
  {
    request: "3号桌牛肉面，少辣，正常做。",
    expected: { item: "牛肉面", note: "少辣", table: "3", urgent: false },
    cookTicks: 3,
    arrivalTick: 1,
  },
  {
    request: "2号桌蛋炒饭，加蛋，急着走。",
    expected: { item: "蛋炒饭", note: "加蛋", table: "2", urgent: true },
    cookTicks: 1,
    arrivalTick: 2,
  },
  {
    request: "5号桌鸡腿饭，不要香菜，不赶时间。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "5", urgent: false },
    cookTicks: 1,
    arrivalTick: 2,
  },
  {
    request: "4号桌牛肉面，少辣，付费加急。",
    expected: { item: "牛肉面", note: "少辣", table: "4", urgent: true },
    cookTicks: 3,
    arrivalTick: 3,
  },
  {
    request: "6号桌蛋炒饭，无备注，走加急通道。",
    expected: { item: "蛋炒饭", note: "无备注", table: "6", urgent: true },
    cookTicks: 1,
    arrivalTick: 4,
  },
  {
    request: "8号桌鸡腿饭，加蛋，慢慢来。",
    expected: { item: "鸡腿饭", note: "加蛋", table: "8", urgent: false },
    cookTicks: 3,
    arrivalTick: 4,
  },
  {
    request: "7号桌牛肉面，不要香菜，我赶时间。",
    expected: { item: "牛肉面", note: "不要香菜", table: "7", urgent: true },
    cookTicks: 3,
    arrivalTick: 5,
  },
  {
    request: "1号桌蛋炒饭，少辣，不急着吃。",
    expected: { item: "蛋炒饭", note: "少辣", table: "1", urgent: false },
    cookTicks: 1,
    arrivalTick: 6,
  },
  {
    request: "3号桌鸡腿饭，不要香菜，急着要。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "3", urgent: true },
    cookTicks: 1,
    arrivalTick: 7,
  },
  {
    request: "2号桌牛肉面，加蛋，正常速度。",
    expected: { item: "牛肉面", note: "加蛋", table: "2", urgent: false },
    cookTicks: 3,
    arrivalTick: 8,
  },
  {
    request: "4号桌蛋炒饭，不要香菜，赶时间。",
    expected: { item: "蛋炒饭", note: "不要香菜", table: "4", urgent: true },
    cookTicks: 1,
    arrivalTick: 10,
  },
  {
    request: "6号桌鸡腿饭，少辣，不用急。",
    expected: { item: "鸡腿饭", note: "少辣", table: "6", urgent: false },
    cookTicks: 1,
    arrivalTick: 11,
  },
  {
    request: "5号桌牛肉面，加蛋，加急送来。",
    expected: { item: "牛肉面", note: "加蛋", table: "5", urgent: true },
    cookTicks: 3,
    arrivalTick: 12,
  },
  {
    request: "8号桌蛋炒饭，不要香菜，我急着开会。",
    expected: { item: "蛋炒饭", note: "不要香菜", table: "8", urgent: true },
    cookTicks: 1,
    arrivalTick: 13,
  },
  {
    request: "7号桌鸡腿饭，无备注，平常做。",
    expected: { item: "鸡腿饭", note: "无备注", table: "7", urgent: false },
    cookTicks: 1,
    arrivalTick: 15,
  },
  {
    request: "3号桌牛肉面，少辣，赶时间。",
    expected: { item: "牛肉面", note: "少辣", table: "3", urgent: true },
    cookTicks: 3,
    arrivalTick: 16,
  },
  {
    request: "1号桌鸡腿饭，加蛋，不赶时间。",
    expected: { item: "鸡腿饭", note: "加蛋", table: "1", urgent: false },
    cookTicks: 1,
    arrivalTick: 17,
  },
  {
    request: "4号桌蛋炒饭，不要香菜，这单付费加快。",
    expected: { item: "蛋炒饭", note: "不要香菜", table: "4", urgent: true },
    cookTicks: 1,
    arrivalTick: 19,
  },
  {
    request: "2号桌牛肉面，少辣，正常来。",
    expected: { item: "牛肉面", note: "少辣", table: "2", urgent: false },
    cookTicks: 3,
    arrivalTick: 21,
  },
];

export const RUSH_SCENARIO = buildScenario("R", RUSH_FIXTURES);

/** Sandbox tweaks unlocked after a practice run — free, never recorded. */
export type Experiment = {
  id: "stoves2" | "fastdelivery" | "intake2";
  label: string;
  note: string;
  stoves: number;
  intakePerTick: number;
  deliveryTicks: number;
};

export const EXPERIMENTS: Experiment[] = [
  {
    id: "stoves2",
    label: "厨房再加一口灶",
    note: "多一口灶出餐快，救不了等不到灶台的单。",
    stoves: 2,
    intakePerTick: 1,
    deliveryTicks: DELIVERY_TICKS,
  },
  {
    id: "fastdelivery",
    label: "送餐快一倍",
    note: "送餐快了，堵的地方可能挪回厨房。",
    stoves: 1,
    intakePerTick: 1,
    deliveryTicks: 1,
  },
  {
    id: "intake2",
    label: "多一名接单员",
    note: "小票更早进厨房，等位从头就少一拍。",
    stoves: 1,
    intakePerTick: 2,
    deliveryTicks: DELIVERY_TICKS,
  },
];
