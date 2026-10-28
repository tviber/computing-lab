/**
 * Public scenario data: the guided-training order, round tuning, and the
 * 12-order practice set. The FINAL fixture list is deliberately NOT here —
 * it lives in server/judge/lunch-shift/hiddenSet.ts so the graded orders
 * stay server-only.
 */

import type { Scenario, Ticket } from "./contracts.ts";

export const TICKS_PER_ROUND = 30;
export const DELIVERY_TICKS = 2;
const ARRIVALS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16];

export const TRAINING_REQUEST = "请送到 5 号桌，一份牛肉面，少辣。我不赶时间，正常就好。";
export const TRAINING_TICKET: Ticket = { item: "牛肉面", note: "少辣", table: "5", urgent: false };

export type FixtureOrder = {
  request: string;
  expected: Ticket;
  cookTicks: number;
};

export function buildScenario(prefix: string, fixtures: FixtureOrder[]): Scenario {
  return {
    id: `${prefix}-v1`,
    totalTicks: TICKS_PER_ROUND,
    deliveryTicks: DELIVERY_TICKS,
    orders: fixtures.map((item, index) => ({
      id: `${prefix}${String(index + 1).padStart(2, "0")}`,
      request: item.request,
      arrivalTick: ARRIVALS[index],
      cookTicks: item.cookTicks,
      expected: { ...item.expected },
    })),
  };
}

export const PRACTICE_FIXTURES: FixtureOrder[] = [
  {
    request: "麻烦送到 3 号桌，一份鸡腿饭，不要香菜。赶时间，能快一点吗？",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "3", urgent: true },
    cookTicks: 1,
  },
  {
    request: "5号桌要牛肉面，少辣；我不赶时间，正常做就好。",
    expected: { item: "牛肉面", note: "少辣", table: "5", urgent: false },
    cookTicks: 3,
  },
  {
    request: "请给 6 号桌做蛋炒饭，加蛋，尽快送来。",
    expected: { item: "蛋炒饭", note: "加蛋", table: "6", urgent: true },
    cookTicks: 1,
  },
  {
    request: "4号桌，鸡腿饭，不放香菜。麻烦快一点。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "4", urgent: true },
    cookTicks: 1,
  },
  {
    request: "送到8号桌：牛肉面，少辣，不急着吃。",
    expected: { item: "牛肉面", note: "少辣", table: "8", urgent: false },
    cookTicks: 3,
  },
  {
    request: "7号桌来份鸡腿饭，加蛋，麻烦快一点。",
    expected: { item: "鸡腿饭", note: "加蛋", table: "7", urgent: true },
    cookTicks: 1,
  },
  {
    request: "1号桌蛋炒饭，不要香菜，平常速度就行。",
    expected: { item: "蛋炒饭", note: "不要香菜", table: "1", urgent: false },
    cookTicks: 1,
  },
  {
    request: "请把牛肉面送去2号桌，少辣，我急着开会，尽快。",
    expected: { item: "牛肉面", note: "少辣", table: "2", urgent: true },
    cookTicks: 3,
  },
  {
    request: "3号桌鸡腿饭，不要香菜，我不赶时间。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "3", urgent: false },
    cookTicks: 1,
  },
  {
    request: "桌号 5，蛋炒饭加蛋，我赶时间。",
    expected: { item: "蛋炒饭", note: "加蛋", table: "5", urgent: true },
    cookTicks: 1,
  },
  {
    request: "6号桌牛肉面，无备注，正常来就好。",
    expected: { item: "牛肉面", note: "无备注", table: "6", urgent: false },
    cookTicks: 3,
  },
  {
    request: "4号桌鸡腿饭，不要香菜，急着要。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "4", urgent: true },
    cookTicks: 1,
  },
];

/** The scenario students preview and practice on — expected tickets stay
 *  attached here because the judge also runs this set server-side; the
 *  client only ever shows results, never the expected field. */
export const PRACTICE_SCENARIO = buildScenario("P", PRACTICE_FIXTURES);

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
    note: "多一口灶把速度提上去了，救不了认错的小票——识别错的单还是错的。",
    stoves: 2,
    intakePerTick: 1,
    deliveryTicks: DELIVERY_TICKS,
  },
  {
    id: "fastdelivery",
    label: "送餐快一倍",
    note: "送餐快了，最挤的地方可能挪回厨房；这就是瓶颈会搬家。",
    stoves: 1,
    intakePerTick: 1,
    deliveryTicks: 1,
  },
  {
    id: "intake2",
    label: "多一名接单员",
    note: "接单快了一倍，但最挤的地方多半挪到厨房。",
    stoves: 1,
    intakePerTick: 2,
    deliveryTicks: DELIVERY_TICKS,
  },
];
