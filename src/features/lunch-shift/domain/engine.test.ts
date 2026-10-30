/**
 * Order-set and parser properties for the rebuilt lunch-shift lab.
 * These numbers are the lesson's difficulty curve — change them
 * deliberately, never silently.
 *
 *  - 修接单 set: default word tables miss 5/12 (dish short name, two
 *    reworded notes, reworded rush phrase, negated rush phrase); every
 *    miss is fixable by adding a word and no fix breaks another order.
 *  - 修排队 set: FIFO 8/12, urgent-first 10/12, urgent + wait-boost
 *    reaches 12/12 for every threshold in 8..16 (not one magic number).
 *  - 正式集 (mirrored below): a tables set copied from the practice
 *    misses loses exactly 3 orders; generic words score 24/24.
 *  - 附加挑战: the fixed FIFO run on the rush set leaves 11 problem
 *    orders (urgent AND normal, 6 undelivered); the bad-review scoring
 *    makes all three extreme policies fail on different lines.
 */

import { describe, expect, it } from "vitest";
import { sameTicket } from "./contracts.ts";
import { priorityIndex, PRIORITY_TABLE_SIZE, checkPriorityTable } from "./priority.ts";
import { findFullWidthPunctuation } from "./runErrors.ts";
import { buildScenario, INTAKE_FIXTURES, QUEUE_SCENARIO } from "./scenarios.ts";
import {
  bestCompensation,
  checkCompensateTable,
  COMPENSATE_PASS_REVIEWS,
  COMPENSATE_PASS_SPEND,
  COMPENSATE_TABLE_SIZE,
  compensateIndex,
  compensateLateOrders,
  evaluateCompensation,
} from "./compensate.ts";
import { simulate } from "./simulator.ts";
import {
  checkIntakeTables,
  defaultIntakeTables,
  evaluateIntake,
  parseTicket,
  readTable,
  type IntakeTables,
} from "./wordTables.ts";

function tableFor(fn: (urgent: boolean, wait: number, cook: number) => number): number[] {
  const table = new Array(PRIORITY_TABLE_SIZE);
  for (const urgent of [false, true])
    for (let wait = 0; wait <= 30; wait++)
      for (const cook of [1, 3]) table[priorityIndex(urgent, wait, cook)] = fn(urgent, wait, cook);
  return table;
}

const boost = (t: number) => tableFor((u, w) => (u ? 1 : 0) + (w >= t ? 1 : 0));
/** Overwrite style — the skeleton's natural fill: urgent→1, then wait≥T→2. */
const overwrite = (t: number) => tableFor((u, w) => (w >= t ? 2 : u ? 1 : 0));

/** Literal practice fix — exactly the words the missed orders used. */
const LITERAL_TABLES: IntakeTables = {
  dish: [...defaultIntakeTables().dish, ["炒饭", "蛋炒饭"]],
  note: [...defaultIntakeTables().note, ["不放香菜", "不要香菜"], ["别太辣", "少辣"]],
  calm: [...defaultIntakeTables().calm, "不用赶"],
  rush: [...defaultIntakeTables().rush, "能快点吗"],
};

/** Generic practice fix — shorter words that cover unseen phrasings. */
const GENERIC_TABLES: IntakeTables = {
  dish: [...defaultIntakeTables().dish, ["炒饭", "蛋炒饭"]],
  note: [...defaultIntakeTables().note, ["放香菜", "不要香菜"], ["辣", "少辣"]],
  calm: [...defaultIntakeTables().calm, "不用赶", "不急"],
  rush: [...defaultIntakeTables().rush, "快", "等不及"],
};

// Mirrors the hidden final set in server/judge/lunch-shift/hiddenSet.ts.
const FINAL_FIXTURES = [
  {
    request: "送到 6 号桌一份蛋炒饭，不要香菜，我不赶时间。",
    expected: { item: "蛋炒饭", note: "不要香菜", table: "6", urgent: false },
    cookTicks: 1,
    arrivalTick: 3,
  },
  {
    request: "2号桌鸡腿饭，别放香菜，我赶时间。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "2", urgent: true },
    cookTicks: 1,
    arrivalTick: 3,
  },
  {
    request: "请给 4 号桌做牛肉面，少辣，正常就好。",
    expected: { item: "牛肉面", note: "少辣", table: "4", urgent: false },
    cookTicks: 3,
    arrivalTick: 4,
  },
  {
    request: "3号桌蛋炒饭，加蛋，麻烦快点，我等不及了。",
    expected: { item: "蛋炒饭", note: "加蛋", table: "3", urgent: true },
    cookTicks: 3,
    arrivalTick: 1,
  },
  {
    request: "1号桌鸡腿饭，不要香菜，不赶时间，慢慢做。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "1", urgent: false },
    cookTicks: 1,
    arrivalTick: 1,
  },
  {
    request: "8号桌来一份炒饭，无备注，正常做。",
    expected: { item: "蛋炒饭", note: "无备注", table: "8", urgent: false },
    cookTicks: 3,
    arrivalTick: 12,
  },
  {
    request: "7号桌牛肉面，少放点辣，不用赶时间。",
    expected: { item: "牛肉面", note: "少辣", table: "7", urgent: false },
    cookTicks: 3,
    arrivalTick: 1,
  },
  {
    request: "5号桌鸡腿饭，加蛋，麻烦快些。",
    expected: { item: "鸡腿饭", note: "加蛋", table: "5", urgent: true },
    cookTicks: 1,
    arrivalTick: 11,
  },
  {
    request: "6号桌牛肉面，少辣，尽快送来，我赶时间。",
    expected: { item: "牛肉面", note: "少辣", table: "6", urgent: true },
    cookTicks: 3,
    arrivalTick: 13,
  },
  {
    request: "给2号桌做牛肉面加蛋，尽快，我赶时间。",
    expected: { item: "牛肉面", note: "加蛋", table: "2", urgent: true },
    cookTicks: 1,
    arrivalTick: 1,
  },
  {
    request: "4号桌蛋炒饭，平常速度，不要催。",
    expected: { item: "蛋炒饭", note: "无备注", table: "4", urgent: false },
    cookTicks: 3,
    arrivalTick: 15,
  },
  {
    request: "8号桌鸡腿饭，不要香菜，赶时间。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "8", urgent: true },
    cookTicks: 1,
    arrivalTick: 16,
  },
];

const FINAL = buildScenario("F", FINAL_FIXTURES);

const intakeOrders = INTAKE_FIXTURES.map((order, index) => ({
  id: `P${String(index + 1).padStart(2, "0")}`,
  request: order.request,
  expected: order.expected,
}));

describe("word-table parser", () => {
  const tables = defaultIntakeTables();

  it("reads dish/note/urgent from the default tables", () => {
    expect(parseTicket("3号桌鸡腿饭，少辣，赶时间。", tables)).toEqual({
      item: "鸡腿饭",
      note: "少辣",
      table: "3",
      urgent: true,
    });
  });

  it("checks calm words before rush words", () => {
    const parsed = parseTicket("1号桌蛋炒饭，不急着吃。", tables);
    expect(parsed.urgent).toBe(false);
  });

  it("first key in insertion order wins", () => {
    const parsed = parseTicket("炒饭送到5号桌", {
      ...tables,
      dish: [
        ["炒饭", "蛋炒饭"],
        ["炒", "鸡腿饭"],
      ],
    });
    expect(parsed.item).toBe("蛋炒饭");
  });

  it("reads every table-number spelling", () => {
    expect(readTable("送到5号桌")).toBe("5");
    expect(readTable("送到 5 号桌")).toBe("5");
    expect(readTable("桌 5")).toBe("5");
    expect(readTable("桌号 5")).toBe("5");
    expect(readTable("桌5")).toBe("5");
  });
});

describe("word-table validation", () => {
  it("accepts the starter tables", () => {
    expect(checkIntakeTables(defaultIntakeTables()).errors).toEqual([]);
  });

  it("rejects over-long keys and off-menu values with Chinese messages", () => {
    const { errors } = checkIntakeTables({
      dish: [
        ["这是一个特别特别特别长的词", "鸡腿饭"],
        ["炒饭", "炒米饭"],
      ],
      note: [],
      calm: [],
      rush: [],
    });
    expect(errors.length).toBe(2);
    expect(errors[0]).toContain("dish_words");
    expect(errors[1]).toContain("不在菜单上");
  });

  it("rejects wrong shapes and caps at 20 entries", () => {
    expect(checkIntakeTables({ dish: "x", note: [], calm: [], rush: [] }).errors.length).toBe(1);
    const big = { dish: [], note: [], calm: Array(21).fill("不急"), rush: [] };
    expect(checkIntakeTables(big).errors.some((e) => e.includes("最多 20"))).toBe(true);
  });

  it("keeps the usable entries when some are invalid", () => {
    const { tables, errors } = checkIntakeTables({
      dish: [
        ["炒饭", "蛋炒饭"],
        ["", "牛肉面"],
      ],
      note: [],
      calm: ["不急"],
      rush: [],
    });
    expect(errors.length).toBe(1);
    expect(tables.dish).toEqual([["炒饭", "蛋炒饭"]]);
    expect(tables.calm).toEqual(["不急"]);
  });
});

describe("修接单 order set", () => {
  it("the starter tables miss exactly the five designed orders", () => {
    const wrong = evaluateIntake(intakeOrders, defaultIntakeTables()).filter((o) => !o.correct);
    expect(wrong.map((o) => o.id)).toEqual(["P03", "P04", "P08", "P09", "P11"]);
  });

  it("the negated-rush order needs calm checked first", () => {
    // 「不用赶时间」误中 rush 的「赶时间」，calm 先查才能拦下来
    const miss = evaluateIntake(intakeOrders, defaultIntakeTables()).find((o) => o.id === "P09");
    expect(miss?.produced.urgent).toBe(true);
  });

  it.each([
    ["literal", LITERAL_TABLES],
    ["generic", GENERIC_TABLES],
  ])("%s word tables fix all 12", (_name, tables) => {
    const results = evaluateIntake(intakeOrders, tables);
    expect(results.every((order) => order.correct)).toBe(true);
  });

  it("every missed order is fixable by one added word without breaking others", () => {
    const fixes: { id: string; patch: (t: IntakeTables) => IntakeTables }[] = [
      { id: "P03", patch: (t) => ({ ...t, dish: [...t.dish, ["炒饭", "蛋炒饭"]] }) },
      { id: "P04", patch: (t) => ({ ...t, note: [...t.note, ["不放香菜", "不要香菜"]] }) },
      { id: "P08", patch: (t) => ({ ...t, note: [...t.note, ["太辣", "少辣"]] }) },
      { id: "P09", patch: (t) => ({ ...t, calm: [...t.calm, "不用赶"] }) },
      { id: "P11", patch: (t) => ({ ...t, rush: [...t.rush, "快点"] }) },
    ];
    for (const { id, patch } of fixes) {
      const tables = patch(defaultIntakeTables());
      const results = evaluateIntake(intakeOrders, tables);
      const target = results.find((order) => order.id === id)!;
      expect(target.correct).toBe(true);
      // no new wrong orders introduced vs the default misses
      const wrongIds = results.filter((order) => !order.correct).map((order) => order.id);
      expect(wrongIds).not.toContain(id);
      for (const other of ["P03", "P04", "P08", "P09", "P11"].filter((x) => x !== id)) {
        expect(wrongIds).toContain(other);
      }
    }
  });
});

describe("修排队 order set", () => {
  it("FIFO delivers 8/12 on time", () => {
    expect(simulate(QUEUE_SCENARIO, { priority: null }).result.onTime).toBe(8);
  });

  it("urgent-first delivers 11/12 on time — one normal order starves", () => {
    const run = simulate(QUEUE_SCENARIO, { priority: tableFor((u) => (u ? 1 : 0)) }).result;
    expect(run.onTime).toBe(11);
    const late = run.orders.filter((order) => !order.onTime).map((order) => order.id);
    expect(late).toEqual(["Q07"]);
  });

  it("urgent + wait-boost reaches 12/12 for every threshold 8..16", () => {
    for (let t = 8; t <= 16; t++) {
      expect(simulate(QUEUE_SCENARIO, { priority: boost(t) }).result.onTime).toBe(12);
    }
  });

  it("the overwrite style (urgent→1, wait≥T→2) also reaches 12/12 for T 8..16", () => {
    for (let t = 8; t <= 16; t++) {
      expect(simulate(QUEUE_SCENARIO, { priority: overwrite(t) }).result.onTime).toBe(12);
    }
  });

  it("boost outside the sweet range is not full marks (the curve is real)", () => {
    expect(simulate(QUEUE_SCENARIO, { priority: boost(4) }).result.onTime).toBeLessThan(12);
    expect(simulate(QUEUE_SCENARIO, { priority: boost(18) }).result.onTime).toBeLessThan(12);
  });
});

describe("正式集 (mirrored hidden set)", () => {
  it("literal practice words lose exactly the four reworded orders", () => {
    const wrong = FINAL.orders.filter(
      (order) => !sameTicket(parseTicket(order.request, LITERAL_TABLES), order.expected!),
    );
    expect(wrong.map((order) => order.id)).toEqual(["F02", "F04", "F07", "F08"]);
  });

  it("generic words get every ticket right and 12/12 on time (24/24)", () => {
    const run = simulate(FINAL, { tables: GENERIC_TABLES, priority: boost(10) }).result;
    expect(run.correct).toBe(12);
    expect(run.onTime).toBe(12);
  });

  it("the full-marks queue formula stays full marks on the final set", () => {
    for (const t of [8, 10, 12]) {
      const run = simulate(FINAL, { tables: GENERIC_TABLES, priority: boost(t) }).result;
      expect(run.onTime).toBe(12);
    }
  });

  it("the overwrite style also reaches 12/12 on the final set for T 8..16", () => {
    for (let t = 8; t <= 16; t++) {
      const run = simulate(FINAL, { tables: GENERIC_TABLES, priority: overwrite(t) }).result;
      expect(run.onTime).toBe(12);
    }
  });

  it("urgent-first alone is NOT full marks on the final set either", () => {
    // Stage-4 must keep the starvation lesson: solving it in stage 3 pays off.
    const run = simulate(FINAL, {
      tables: GENERIC_TABLES,
      priority: tableFor((u) => (u ? 1 : 0)),
    }).result;
    expect(run.onTime).toBe(11);
  });
});

describe("compensate (附加挑战)", () => {
  // The fixed run everyone pays for — same as the judge: plain FIFO on
  // the 20-order rush set leaves 11 orders late or undelivered.
  const late = compensateLateOrders();

  const compensateTableFor = (
    fn: (urgent: boolean, overtime: number, delivered: boolean) => number,
  ): number[] => {
    const table = new Array(COMPENSATE_TABLE_SIZE).fill(0);
    for (const u of [false, true])
      for (let o = 0; o <= 30; o++)
        for (const d of [false, true]) table[compensateIndex(u, o, d)] = fn(u, o, d);
    return table;
  };

  it("the first-come-first-served run leaves 11 problem orders, urgent included", () => {
    expect(late).toHaveLength(11);
    expect(late.filter((o) => o.urgent)).toHaveLength(8);
    expect(late.filter((o) => !o.delivered)).toHaveLength(6);
    expect(late.filter((o) => !o.urgent && !o.delivered)).toHaveLength(3);
    expect(late.filter((o) => o.delivered).map((o) => o.id)).toEqual([
      "R06",
      "R08",
      "R10",
      "R12",
      "R14",
    ]);
  });

  it("checkCompensateTable bounds the 124-cell shape and 0/1/2 values", () => {
    expect(checkCompensateTable(new Array(COMPENSATE_TABLE_SIZE).fill(0)).table).not.toBeNull();
    expect(checkCompensateTable(new Array(62).fill(0)).table).toBeNull();
    const bad = new Array(COMPENSATE_TABLE_SIZE).fill(0);
    bad[10] = 3;
    const { errors } = checkCompensateTable(bad);
    expect(errors[0]).toContain("只能返回 0、1 或 2");
    expect(checkCompensateTable(bad).table).toBeNull();
  });

  it("all three extreme policies fail on different lines — the trade-off is real", () => {
    const none = evaluateCompensation(
      late,
      compensateTableFor(() => 0),
    );
    const snacks = evaluateCompensation(
      late,
      compensateTableFor(() => 1),
    );
    const refunds = evaluateCompensation(
      late,
      compensateTableFor(() => 2),
    );
    expect(none.badReviewPoints).toBe(860); // 8.60 expected bad reviews
    expect(snacks.badReviewPoints).toBe(580); // still over the 4.50 line
    expect(refunds.badReviewPoints).toBe(212); // lowest reviews…
    expect(refunds.spend).toBe(165); // …but way over the 80 元 budget
    for (const bill of [none, snacks, refunds]) {
      expect(
        bill.badReviewPoints <= COMPENSATE_PASS_REVIEWS && bill.spend <= COMPENSATE_PASS_SPEND,
      ).toBe(false);
    }
  });

  it("the overtime-only starter policy misses the undelivered and fails", () => {
    const starter = evaluateCompensation(
      late,
      compensateTableFor((_u, overtime) => (overtime >= 8 ? 2 : overtime >= 4 ? 1 : 0)),
    );
    expect(starter.badReviewPoints).toBeGreaterThan(COMPENSATE_PASS_REVIEWS);
  });

  it("urgent-blind generosity breaks the budget; urgent-aware fits it", () => {
    // Refund every undelivered order + snack every delivered one: 100 元.
    const blind = evaluateCompensation(
      late,
      compensateTableFor((_u, _o, d) => (d ? 1 : 2)),
    );
    expect(blind.spend).toBe(100);
    expect(blind.spend).toBeGreaterThan(COMPENSATE_PASS_SPEND);
    // Refund the urgent undelivered, snack the rest — 4.42 reviews @ 61 元.
    const aware = evaluateCompensation(
      late,
      compensateTableFor((u, _o, d) => (!d ? (u ? 2 : 1) : 1)),
    );
    expect(aware.badReviewPoints).toBe(442);
    expect(aware.spend).toBe(61);
    expect(
      aware.badReviewPoints <= COMPENSATE_PASS_REVIEWS && aware.spend <= COMPENSATE_PASS_SPEND,
    ).toBe(true);
  });

  it("the best bill inside the spend cap is locked", () => {
    const best = bestCompensation(late);
    expect(best.badReviewPoints).toBe(399); // 3.99 expected bad reviews
    expect(best.spend).toBe(74);
  });

  it("best compensation must choose one tier per input, not per order", () => {
    // Two identical (normal, 0, undelivered) orders share one table cell:
    // a student function can snack both or refund both, never split.
    // Ungrouped DP would refund one and skip the other (15 元, 107 pts).
    const orders = [
      { id: "A", urgent: false, overtime: 0, delivered: false },
      { id: "B", urgent: false, overtime: 0, delivered: false },
    ];
    expect(bestCompensation(orders, 15)).toEqual({
      badReviewPoints: 120, // snack both: 60% × 2
      spend: 4,
    });
  });
});

describe("priority table validation", () => {
  it("accepts exactly 124 finite numbers", () => {
    expect(checkPriorityTable(new Array(124).fill(0)).table).not.toBeNull();
  });

  it("rejects wrong length and non-finite values", () => {
    expect(checkPriorityTable(new Array(5).fill(0)).table).toBeNull();
    const bad = new Array(124).fill(0);
    bad[7] = Number.NaN;
    const { errors } = checkPriorityTable(bad);
    expect(errors[0]).toContain("第 8 个值");
    expect(checkPriorityTable([...new Array(123).fill(0), Infinity]).table).toBeNull();
    expect(checkPriorityTable([...new Array(123).fill(0), "1"]).table).toBeNull();
  });
});

describe("full-width punctuation scan", () => {
  it("flags punctuation in code but skips strings and comments", () => {
    const code = 'x = {"别急": "别急"}  # 注释里：中文标点没事\ny：= 1';
    const hits = findFullWidthPunctuation(code);
    expect(hits).toEqual([{ line: 2, ch: "：" }]);
  });

  it("accepts the starter code with Chinese words inside strings", () => {
    const code = `dish_words = {"鸡腿饭": "鸡腿饭", "蛋炒饭": "蛋炒饭"}\ncalm_words = ["不赶时间", "不急着"]`;
    expect(findFullWidthPunctuation(code)).toEqual([]);
  });
});
