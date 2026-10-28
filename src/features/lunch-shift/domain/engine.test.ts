/**
 * Golden-value parity with the Go engine (kitchen/engine_test.go):
 * baselines must stay 71 (practice) / 74 (final) and the standard rule
 * set reaches 88. These scores are locked — any change to the engine or
 * fixtures must update them deliberately, never silently.
 */

import { describe, expect, it } from "vitest";
import {
  applyBlockStrategy,
  traceIntake,
  traceQueueChoice,
} from "./blockStrategy.ts";
import type { BlockDrafts, BlockRule, Candidate } from "./contracts.ts";
import { buildScenario, PRACTICE_FIXTURES } from "./scenarios.ts";
import { simulate } from "./simulator.ts";
import { isSystemExplanation } from "./systemCheck.ts";

// Mirrors the hidden final set in server/judge/lunch-shift/hiddenSet.ts.
const FINAL_FIXTURES = [
  { request: "能送到 2 号桌吗？鸡腿饭，不要香菜，我赶时间。", expected: { item: "鸡腿饭", note: "不要香菜", table: "2", urgent: true }, cookTicks: 1 },
  { request: "请给 4 号桌来一碗牛肉面，少辣，正常就好。", expected: { item: "牛肉面", note: "少辣", table: "4", urgent: false }, cookTicks: 3 },
  { request: "蛋炒饭加蛋，送到桌 7，麻烦尽快。", expected: { item: "蛋炒饭", note: "加蛋", table: "7", urgent: true }, cookTicks: 1 },
  { request: "3号桌鸡腿饭，不用加配料，我不赶时间。", expected: { item: "鸡腿饭", note: "无备注", table: "3", urgent: false }, cookTicks: 1 },
  { request: "6号桌牛肉面，少辣，急着走，尽快。", expected: { item: "牛肉面", note: "少辣", table: "6", urgent: true }, cookTicks: 3 },
  { request: "送到 8 号桌，一份鸡腿饭加蛋，赶时间。", expected: { item: "鸡腿饭", note: "加蛋", table: "8", urgent: true }, cookTicks: 1 },
  { request: "1号桌蛋炒饭，无备注，别着急做。", expected: { item: "蛋炒饭", note: "无备注", table: "1", urgent: false }, cookTicks: 1 },
  { request: "牛肉面少辣，给5号桌，我正常等。", expected: { item: "牛肉面", note: "少辣", table: "5", urgent: false }, cookTicks: 3 },
  { request: "3号桌要蛋炒饭，不放香菜，快一点可以吗？", expected: { item: "蛋炒饭", note: "不要香菜", table: "3", urgent: true }, cookTicks: 1 },
  { request: "鸡腿饭不要香菜，送给2号桌；不赶时间。", expected: { item: "鸡腿饭", note: "不要香菜", table: "2", urgent: false }, cookTicks: 1 },
  { request: "给8号桌做牛肉面加蛋，尽快，我赶时间。", expected: { item: "牛肉面", note: "加蛋", table: "8", urgent: true }, cookTicks: 3 },
  { request: "4号桌蛋炒饭，平常速度，不要催。", expected: { item: "蛋炒饭", note: "无备注", table: "4", urgent: false }, cookTicks: 1 },
];

const PRACTICE = buildScenario("P", PRACTICE_FIXTURES);
const FINAL = buildScenario("F", FINAL_FIXTURES);

const mk = (intake: BlockRule[], kitchen: BlockRule[], delivery: BlockRule[]): BlockDrafts => ({
  intake: { rules: intake },
  kitchen: { rules: kitchen },
  delivery: { rules: delivery },
});

const note: BlockRule[] = [{ type: "note", phrase: "不放香菜", value: "不要香菜" }];
const table: BlockRule[] = [{ type: "table_prefix" }];
const pu: BlockRule[] = [{ type: "priority_urgent" }];
const wait3: BlockRule[] = [{ type: "priority_wait", ticks: 3 }];
const shortest: BlockRule[] = [{ type: "priority_shortest" }];
const both = [...note, ...table];

const CASES: Record<string, BlockDrafts> = {
  baseline: mk([], [], []),
  note: mk(note, [], []),
  table: mk(table, [], []),
  "queue-urgent": mk([], pu, pu),
  "note+table": mk(both, [], []),
  "all-standard": mk(both, pu, pu),
  "wait-kitchen": mk(both, wait3, pu),
  "short-kitchen": mk(both, shortest, pu),
};

const WANT: Record<string, [number, number, number]> = {
  "practice/baseline": [71, 10, 9],
  "practice/note": [75, 11, 9],
  "practice/table": [75, 11, 9],
  "practice/queue-urgent": [77, 10, 11],
  "practice/note+table": [80, 12, 9],
  "practice/all-standard": [88, 12, 12],
  "practice/wait-kitchen": [87, 12, 12],
  "practice/short-kitchen": [85, 12, 11],
  "final/baseline": [74, 10, 10],
  "final/note": [78, 11, 10],
  "final/table": [78, 11, 10],
  "final/queue-urgent": [77, 10, 11],
  "final/note+table": [83, 12, 10],
  "final/all-standard": [88, 12, 12],
  "final/wait-kitchen": [87, 12, 12],
  "final/short-kitchen": [88, 12, 12],
};

describe("scoring parity with the Go engine", () => {
  for (const [mode, scenario] of [
    ["practice", PRACTICE],
    ["final", FINAL],
  ] as const) {
    for (const [name, drafts] of Object.entries(CASES)) {
      it(`${mode}/${name}`, () => {
        const { result } = simulate(scenario, (ctx) => applyBlockStrategy(ctx, drafts), 1, 1);
        const [score, correct, onTime] = WANT[`${mode}/${name}`];
        expect(result.score).toBe(score);
        expect(result.correct).toBe(correct);
        expect(result.onTime).toBe(onTime);
      });
    }
  }
});

describe("trace explainers", () => {
  it("credits a synonym rule for a note the raw text never contained", () => {
    const trace = traceIntake("4号桌，鸡腿饭，不放香菜。麻烦快一点。", [
      { type: "synonym", phrase: "不放香菜", value: "不要香菜" },
    ]);
    expect(trace.note).toBe("你的同义词规则帮程序认出的");
  });

  it("attributes a default note to the program, not the student", () => {
    const trace = traceIntake("5号桌要牛肉面，少辣；我不赶时间。", []);
    expect(trace.note).toBe("程序自己从原话认出的");
  });

  it("explains an aging-promoted pick without mutating the queue", () => {
    const queue: Candidate[] = [
      { id: "P01", item: "鸡腿饭", note: "不要香菜", table: "3", urgent: false, request: "", arrivalTick: 1, readyTick: null, waitTicks: 8, cookTicks: 1, deadline: 18 },
      { id: "P02", item: "牛肉面", note: "少辣", table: "5", urgent: true, request: "", arrivalTick: 5, readyTick: null, waitTicks: 4, cookTicks: 3, deadline: 9 },
    ];
    const rules: BlockRule[] = [
      { type: "aged_urgent", ticks: 5 },
      { type: "priority_urgent" },
    ];
    // P02 (already urgent) still wins over the aged P01; the aging note is
    // what the explainer should surface only when it decided the pick.
    const why = traceQueueChoice(rules, queue);
    expect(why).toContain("加急");
    // The caller's queue objects must not be mutated by the aging pass.
    expect(queue[0].urgent).toBe(false);
  });
});

describe("system explanation contract", () => {
  it("rejects placeholder one-letter lines", () => {
    expect(isSystemExplanation("a\nb\nc\nd")).toBe(false);
  });
  it("accepts four real phrases", () => {
    expect(isSystemExplanation("顾客提出需求\n经网络送到服务器\n程序运行规则\n页面显示结果")).toBe(true);
  });
});
