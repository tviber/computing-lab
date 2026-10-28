/**
 * The graded final-order set — server-only. Students never receive these
 * requests or expected tickets; the judge runs them and returns only the
 * resulting RunSummary.
 */

import { buildScenario, type FixtureOrder } from "../../../src/features/lunch-shift/domain/scenarios.ts";

export const FINAL_FIXTURES: FixtureOrder[] = [
  {
    request: "能送到 2 号桌吗？鸡腿饭，不要香菜，我赶时间。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "2", urgent: true },
    cookTicks: 1,
  },
  {
    request: "请给 4 号桌来一碗牛肉面，少辣，正常就好。",
    expected: { item: "牛肉面", note: "少辣", table: "4", urgent: false },
    cookTicks: 3,
  },
  {
    request: "蛋炒饭加蛋，送到桌 7，麻烦尽快。",
    expected: { item: "蛋炒饭", note: "加蛋", table: "7", urgent: true },
    cookTicks: 1,
  },
  {
    request: "3号桌鸡腿饭，不用加配料，我不赶时间。",
    expected: { item: "鸡腿饭", note: "无备注", table: "3", urgent: false },
    cookTicks: 1,
  },
  {
    request: "6号桌牛肉面，少辣，急着走，尽快。",
    expected: { item: "牛肉面", note: "少辣", table: "6", urgent: true },
    cookTicks: 3,
  },
  {
    request: "送到 8 号桌，一份鸡腿饭加蛋，赶时间。",
    expected: { item: "鸡腿饭", note: "加蛋", table: "8", urgent: true },
    cookTicks: 1,
  },
  {
    request: "1号桌蛋炒饭，无备注，别着急做。",
    expected: { item: "蛋炒饭", note: "无备注", table: "1", urgent: false },
    cookTicks: 1,
  },
  {
    request: "牛肉面少辣，给5号桌，我正常等。",
    expected: { item: "牛肉面", note: "少辣", table: "5", urgent: false },
    cookTicks: 3,
  },
  {
    request: "3号桌要蛋炒饭，不放香菜，快一点可以吗？",
    expected: { item: "蛋炒饭", note: "不要香菜", table: "3", urgent: true },
    cookTicks: 1,
  },
  {
    request: "鸡腿饭不要香菜，送给2号桌；不赶时间。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "2", urgent: false },
    cookTicks: 1,
  },
  {
    request: "给8号桌做牛肉面加蛋，尽快，我赶时间。",
    expected: { item: "牛肉面", note: "加蛋", table: "8", urgent: true },
    cookTicks: 3,
  },
  {
    request: "4号桌蛋炒饭，平常速度，不要催。",
    expected: { item: "蛋炒饭", note: "无备注", table: "4", urgent: false },
    cookTicks: 1,
  },
];

export const FINAL_SCENARIO = buildScenario("F", FINAL_FIXTURES);
