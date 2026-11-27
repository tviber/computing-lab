/**
 * Pure-logic checks for the AI intake: scoring picks the closest
 * prototype, clarify text round-trips through the fixed parser, and the
 * confirm path swaps in the clarified ticket at a one-tick cost. The
 * model itself is exercised only in the browser — none of this imports
 * transformers.js.
 */

import { describe, expect, it } from "vitest";
import type { Ticket } from "./contracts.ts";
import { DISHES, NOTES, TABLES } from "./contracts.ts";
import {
  checkAiResults,
  clarifiedText,
  cosine,
  normalizedResults,
  orderSetCacheKey,
  sanitizeAiResults,
  parseClarified,
  PRACTICE_ORDERS,
  predictField,
  predictTicket,
  resolveOrder,
  splitClauses,
  textsToEmbed,
  type TicketPrediction,
  type Vector,
} from "./aiIntake.ts";

function oneHot(index: number, size = 4): number[] {
  return Array.from({ length: size }, (_unused, i) => (i === index ? 1 : 0));
}

describe("cosine", () => {
  it("scores identical vectors 1 and orthogonal vectors 0", () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([3, 4], [3, 4])).toBeCloseTo(1);
  });
});

describe("splitClauses", () => {
  it("splits on CJK and ASCII punctuation, dropping empties", () => {
    expect(splitClauses("3号桌，鸡腿饭。尽快！")).toEqual(["3号桌", "鸡腿饭", "尽快"]);
    expect(splitClauses("一份牛肉面")).toEqual(["一份牛肉面"]);
    expect(splitClauses("，，")).toEqual([]);
  });
});

describe("predictField", () => {
  const candidates = [
    { value: "甲", prototypes: ["甲词"] },
    { value: "乙", prototypes: ["乙词"] },
  ];

  it("picks the prototype the closest clause matches", () => {
    // Every clause competes for every candidate: the unrelated clause is a
    // unit vector 60° off 乙词 so it scores it 0.5 without beating 甲's hit.
    const embedOf = (text: string): Vector => (text === "甲词" ? [1, 0] : [0, 1]);
    const prediction = predictField(
      [
        { text: "无关子句", vector: [Math.sqrt(3) / 2, 0.5] },
        { text: "命中子句", vector: [1, 0] },
      ],
      candidates,
      embedOf,
    );
    expect(prediction.value).toBe("甲");
    expect(prediction.similarity).toBeCloseTo(1);
    expect(prediction.clause).toBe("命中子句");
    expect(prediction.runnerUp?.value).toBe("乙");
    expect(prediction.margin).toBeCloseTo(0.5);
  });

  it("uses the best prototype when a value has several", () => {
    const multi = [
      { value: "甲", prototypes: ["远词", "近词"] },
      { value: "乙", prototypes: ["乙词"] },
    ];
    const embedOf = (text: string): Vector =>
      text === "近词" ? [0.9, 0.1] : text === "乙词" ? [0, 1] : [0, 0.5];
    const prediction = predictField([{ text: "请求", vector: [1, 0] }], multi, embedOf);
    expect(prediction.value).toBe("甲");
    expect(prediction.prototype).toBe("近词");
    expect(prediction.source).toBe("embedding");
  });
});

describe("predictTicket", () => {
  it("fills every field and takes the worst similarity and margin", () => {
    // Orthogonal basis per prototype text → each field is a clean pick.
    const protoToAxis = new Map<string, number>();
    const axis = (text: string): Vector => {
      if (!protoToAxis.has(text)) protoToAxis.set(text, protoToAxis.size);
      return oneHot(protoToAxis.get(text)!, 64);
    };
    const prediction = predictTicket("请求", axis);
    expect(DISHES).toContain(prediction.ticket.item);
    expect(NOTES).toContain(prediction.ticket.note);
    expect(TABLES).toContain(prediction.ticket.table);
    expect(typeof prediction.ticket.urgent).toBe("boolean");
    expect(prediction.similarity).toBeLessThanOrEqual(prediction.item.similarity);
    expect(prediction.margin).toBeLessThanOrEqual(prediction.urgent.margin);
  });

  it("reads a literal table number and dish name without the model", () => {
    const axis = (): Vector => [0, 0]; // model votes for nothing
    const prediction = predictTicket("4号桌要一份鸡腿饭", axis);
    expect(prediction.ticket.item).toBe("鸡腿饭");
    expect(prediction.ticket.table).toBe("4");
    expect(prediction.item.source).toBe("literal");
    expect(prediction.table.source).toBe("literal");
    expect(prediction.table.similarity).toBe(1);
    expect(prediction.table.margin).toBe(1);
    expect(prediction.note.source).toBe("embedding");
  });
});

describe("clarify round-trip", () => {
  const tickets: Ticket[] = [
    { item: "鸡腿饭", note: "不要香菜", table: "6", urgent: true },
    { item: "蛋炒饭", note: "无备注", table: "2", urgent: false },
    { item: "牛肉面", note: "少辣", table: "8", urgent: true },
  ];

  it("parses back the same ticket for every field combination", () => {
    for (const ticket of tickets) {
      expect(parseClarified(clarifiedText(ticket))).toEqual(ticket);
    }
    // Every practice order's simulated restatement must be lossless.
    for (const order of PRACTICE_ORDERS) {
      expect(parseClarified(order.clarify)).toEqual(order.expected);
    }
  });

  it("rejects malformed restatements instead of guessing", () => {
    expect(parseClarified("随便来点吃的")).toBeNull();
    expect(parseClarified("鸡腿饭，少辣")).toBeNull(); // no table, no marker
  });
});

describe("resolveOrder", () => {
  const order = PRACTICE_ORDERS[0];
  const wrongPrediction = {
    ticket: { item: "蛋炒饭", note: "加蛋", table: "1", urgent: false },
    similarity: 0.5,
    margin: 0.02,
  } as unknown as TicketPrediction;

  it("keeps the AI ticket when need_confirm says no", () => {
    const outcome = resolveOrder(order, wrongPrediction, false);
    expect(outcome.ticket).toEqual(wrongPrediction.ticket);
    expect(outcome.extraTicks).toBe(0);
    expect(outcome.clarifyText).toBeNull();
    expect(outcome.correct).toBe(false);
  });

  it("replaces the ticket with the clarified one at one extra tick", () => {
    const outcome = resolveOrder(order, wrongPrediction, true);
    expect(outcome.ticket).toEqual(order.expected);
    expect(outcome.extraTicks).toBe(1);
    expect(outcome.clarifyText).toBe(order.clarify);
    expect(outcome.correct).toBe(true);
  });
});

describe("checkAiResults / sanitizeAiResults", () => {
  const orders = [{ id: "A" }, { id: "B" }];
  const ticket = { item: "鸡腿饭", note: "无备注", table: "4", urgent: true };
  const row = (id: string, confirmed = false, t: unknown = ticket) => ({
    id,
    ticket: t,
    confirmed,
  });

  it("accepts exact coverage in any order and sorts by the order list", () => {
    const { results, errors } = checkAiResults([row("B", true), row("A")], orders);
    expect(errors).toEqual([]);
    expect(results?.map((entry) => entry.id)).toEqual(["A", "B"]);
  });

  it("rejects unknown ids, duplicates, gaps, bad tickets and non-boolean flags", () => {
    const cases: [unknown, string][] = [
      [[row("A"), row("C")], "不认识的订单号"],
      [[row("A"), row("A"), row("B")], "重复"],
      [[row("A")], "缺了订单 B"],
      [[row("A", false, { ...ticket, item: "炒米饭" }), row("B")], "小票字段不合法"],
      [[row("A", false, { ...ticket, urgent: "yes" }), row("B")], "小票字段不合法"],
      [[{ ...row("A"), confirmed: 1 }, row("B")], "confirmed 不是布尔值"],
    ];
    for (const [input, fragment] of cases) {
      const { results, errors } = checkAiResults(input, orders);
      expect(results).toBeNull();
      expect(errors.join("\n")).toContain(fragment);
    }
    expect(checkAiResults("nope", orders).results).toBeNull();
    expect(checkAiResults([], orders).results).toBeNull();
  });

  it("sanitizeAiResults keeps well-formed rows and drops the rest", () => {
    const rows = sanitizeAiResults([
      row("A"),
      { id: "B", ticket: { item: "坏菜" }, confirmed: true },
      "x",
    ]);
    expect(rows).toEqual([{ id: "A", ticket, confirmed: false }]);
    expect(sanitizeAiResults(null)).toBeNull();
    expect(sanitizeAiResults([])).toBeNull();
  });
});

describe("normalizedResults", () => {
  it("emits only the fields the server judge needs", () => {
    const outcome = resolveOrder(
      PRACTICE_ORDERS[0],
      predictTicket("随便一句话", () => []),
      false,
    );
    const submission = normalizedResults("poc-set", [outcome]);
    expect(submission.testSetId).toBe("poc-set");
    expect(submission.results).toHaveLength(1);
    expect(Object.keys(submission.results[0]).sort()).toEqual(["extraTicks", "id", "ticket"]);
  });
});

describe("textsToEmbed", () => {
  it("covers every clause and every prototype exactly once", () => {
    const texts = textsToEmbed(["3号桌，来份鸡腿饭，尽快"]);
    expect(texts).toContain("3号桌");
    expect(texts).toContain("来份鸡腿饭");
    expect(texts).toContain("尽快");
    expect(texts).toContain("鸡腿饭");
    expect(texts).toContain("8号桌");
    expect(texts).toContain("不急着");
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("orderSetCacheKey", () => {
  it("distinguishes boundary shifts that raw string concatenation would collide on", () => {
    const a = orderSetCacheKey([
      { id: "P1", request: "0牛肉面" },
      { id: "P2", request: "鸡腿饭" },
    ]);
    const b = orderSetCacheKey([
      { id: "P10", request: "牛肉面" },
      { id: "P2", request: "鸡腿饭" },
    ]);
    expect(a).not.toBe(b);
  });
});
