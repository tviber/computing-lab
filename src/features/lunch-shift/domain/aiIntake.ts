/**
 * AI 智能接单 — pure domain logic, no model imports.
 *
 * The embed worker turns text into vectors; this module owns everything
 * testable without the network: which prototype phrases stand for each
 * ticket field, how cosine scores pick a winner, how the simulated
 * 「再确认一次」 restatement is written and parsed back with fixed rules,
 * and the normalized JSON a real server judge would receive.
 *
 * Scoring is CLAUSE-level, not whole-sentence: a request like
 * 「牛肉面，少辣，不急着吃」 is split on punctuation and every clause is
 * scored against every prototype. Measured on the practice set this is
 * the difference between 6/12 and 12/12 — urgency and note phrases live
 * in their own clauses, and whole-sentence vectors dilute them with the
 * dish/table content. Deterministic fields (table number via regex, a
 * dish named literally) bypass the model entirely and report certainty.
 *
 * Field confidence: each embedding-scored field's `similarity` is its
 * winning clause×prototype cosine, `margin` is best-minus-runner-up
 * VALUE. Literally-parsed fields report 1.0/1.0 so they never force a
 * confirmation. The order-level numbers fed to `need_confirm` are the
 * WORST field of each — one uncertain field is reason enough to ask.
 */

import type { Ticket } from "./contracts.ts";
import { DISHES, NOTES, sameTicket, TABLES } from "./contracts.ts";
import { INTAKE_SCENARIO } from "./scenarios.ts";

const TABLE_SUFFIX_PATTERN = /([1-8])\s*号桌/;
const TABLE_PREFIX_PATTERN = /(?:桌号|桌)\s*([1-8])/;

/** Literal table-number read — deterministic, the model is not consulted. */
function readTable(request: string): string {
  const suffix = TABLE_SUFFIX_PATTERN.exec(request);
  const prefix = TABLE_PREFIX_PATTERN.exec(request);
  if (suffix && (!prefix || suffix.index <= prefix.index)) return suffix[1];
  if (prefix) return prefix[1];
  return "";
}

export const AI_MODEL_ID = "Xenova/bge-small-zh-v1.5";

/** An extra intake tick is the price of asking the customer to repeat. */
export const CONFIRM_EXTRA_TICKS = 1;

export type Vector = readonly number[];

/** One possible value for a field, with the phrases that represent it. */
export type Candidate<T> = { value: T; prototypes: string[] };

export type CandidateScore = { value: string; prototype: string; score: number };

/** An order clause paired with its embedding vector. */
export type ClauseVector = { text: string; vector: Vector };

export type FieldPrediction<T> = {
  value: T;
  /** "literal" = fixed rule matched; the model was not consulted. */
  source: "literal" | "embedding";
  /** Winning candidate's best cosine score across clause×prototype pairs. */
  similarity: number;
  /** Winning score minus the best OTHER value's score. */
  margin: number;
  prototype: string;
  /** The order clause that produced the winning score (embedding only). */
  clause: string | null;
  runnerUp: { value: T; score: number } | null;
  /** Every candidate's best score, sorted high → low (for the detail view). */
  scores: CandidateScore[];
};

export function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Split a customer request into clauses on any CJK/ASCII punctuation. */
export function splitClauses(request: string): string[] {
  return request
    .split(/[，。；：、！？,.;:?!]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

/**
 * Score every candidate value by its best (clause × prototype) cosine,
 * pick the winner. Each clause is matched independently — the clause
 * carrying the note only competes with note prototypes, so 「不急着吃」
 * never has to outshout the dish name inside one pooled vector.
 */
export function predictField<T>(
  clauses: readonly ClauseVector[],
  candidates: readonly Candidate<T>[],
  embedOf: (text: string) => Vector,
): FieldPrediction<T> {
  const scored = candidates.map((candidate) => {
    let best = -Infinity;
    let bestProto = "";
    let bestClause: string | null = null;
    for (const prototype of candidate.prototypes) {
      const protoVector = embedOf(prototype);
      for (const clause of clauses) {
        const score = cosine(clause.vector, protoVector);
        if (score > best) {
          best = score;
          bestProto = prototype;
          bestClause = clause.text;
        }
      }
    }
    return { candidate, score: best, prototype: bestProto, clause: bestClause };
  });
  scored.sort((left, right) => right.score - left.score);
  const winner = scored[0];
  const runner = scored.length > 1 ? scored[1] : null;
  return {
    value: winner.candidate.value,
    source: "embedding",
    similarity: winner.score,
    margin: runner ? winner.score - runner.score : 1,
    prototype: winner.prototype,
    clause: winner.clause,
    runnerUp: runner ? { value: runner.candidate.value, score: runner.score } : null,
    scores: scored.map((entry) => ({
      value: String(entry.candidate.value),
      prototype: entry.prototype,
      score: entry.score,
    })),
  };
}

/** Certain prediction for a field a fixed rule already read correctly. */
function literalField<T>(value: T, matched: string): FieldPrediction<T> {
  return {
    value,
    source: "literal",
    similarity: 1,
    margin: 1,
    prototype: matched,
    clause: null,
    runnerUp: null,
    scores: [{ value: String(value), prototype: matched, score: 1 }],
  };
}

/* ---- Candidate prototypes ------------------------------------------
 * Clause-length phrases, each value carrying several synonyms so a
 * paraphrase (「不放香菜」「别太辣」「急着开会」) lands on the right
 * value. These are the knobs to tune first if real-device accuracy
 * disappoints; the dev page prints every score precisely so each
 * knob's effect is visible.
 */

const ITEM_CANDIDATES: Candidate<string>[] = DISHES.map((dish) => ({
  value: dish,
  prototypes: [dish, `一份${dish}`, `来份${dish}`],
}));

const NOTE_CANDIDATES: Candidate<string>[] = [
  { value: "不要香菜", prototypes: ["不要香菜", "不放香菜", "免香菜", "去香菜"] },
  { value: "少辣", prototypes: ["少辣", "别太辣", "微辣", "不要太辣", "少一点辣"] },
  { value: "加蛋", prototypes: ["加蛋", "加个蛋", "多加蛋"] },
  { value: "无备注", prototypes: ["无备注", "没有要求", "没有备注", "正常做"] },
];

const TABLE_CANDIDATES: Candidate<string>[] = TABLES.map((table) => ({
  value: table,
  prototypes: [`${table}号桌`, `${table} 号桌`],
}));

const URGENT_CANDIDATES: Candidate<boolean>[] = [
  {
    value: true,
    prototypes: [
      "赶时间",
      "急着要",
      "尽快",
      "快一点",
      "能快点吗",
      "急着开会",
      "加急",
      "能快一点吗",
      // Paid-express family — the store sells 加急 as a paid option, so
      // real customers phrase it as paying for speed.
      "要加急",
      "走加急通道",
      "付费加急",
      "付费加快",
      "这单加急",
      "加钱走急单",
      "我加急",
    ],
  },
  {
    value: false,
    prototypes: [
      "不赶时间",
      "不急着",
      "不用急",
      "不用赶时间",
      "慢慢来",
      "正常做",
      "平常速度",
      "不着急",
      "不用加急",
      "普通做",
    ],
  },
];

export type TicketPrediction = {
  ticket: Ticket;
  /** Worst field similarity / margin — what need_confirm sees. */
  similarity: number;
  margin: number;
  item: FieldPrediction<string>;
  note: FieldPrediction<string>;
  table: FieldPrediction<string>;
  urgent: FieldPrediction<boolean>;
};

/**
 * Predict a ticket from the customer's request. Table number and a
 * literally-named dish are read by fixed rules (always right, reported
 * as certain); note and urgency — where paraphrase and negation live —
 * go through clause-level embedding.
 */
export function predictTicket(
  request: string,
  embedOf: (text: string) => Vector,
): TicketPrediction {
  const clauses: ClauseVector[] = splitClauses(request).map((text) => ({
    text,
    vector: embedOf(text),
  }));
  if (clauses.length === 0) clauses.push({ text: request, vector: embedOf(request) });

  const literalItem = DISHES.find((dish) => request.includes(dish));
  const literalTable = readTable(request);

  const item = literalItem
    ? literalField(literalItem, literalItem)
    : predictField(clauses, ITEM_CANDIDATES, embedOf);
  const note = predictField(clauses, NOTE_CANDIDATES, embedOf);
  const table = literalTable
    ? literalField(literalTable, literalTable)
    : predictField(clauses, TABLE_CANDIDATES, embedOf);
  const urgent = predictField(clauses, URGENT_CANDIDATES, embedOf);
  return {
    ticket: { item: item.value, note: note.value, table: table.value, urgent: urgent.value },
    similarity: Math.min(item.similarity, note.similarity, table.similarity, urgent.similarity),
    margin: Math.min(item.margin, note.margin, table.margin, urgent.margin),
    item,
    note,
    table,
    urgent,
  };
}

/* ---- 自动二次确认 ----------------------------------------------------
 * The customer is simulated: when asked to repeat, they answer in the
 * fixed format 「N号桌，菜，备注，加急单/普通单。」 so the FIXED parser —
 * not the model — reads it. In production the restated sentence would be
 * authored server-side per hidden order (it must not leak the answer:
 * the student only ever receives it after paying the extra tick, and even
 * then only sees the parsed ticket).
 */

export function clarifiedText(ticket: Ticket): string {
  const note = ticket.note === "无备注" ? "无备注" : ticket.note;
  return `${ticket.table}号桌，${ticket.item}，${note}，${ticket.urgent ? "加急" : "普通"}单。`;
}

/**
 * Fixed-rule reader for the restated sentence. Looks for menu values as
 * substrings plus the urgent/calm marker — no AI involved. Returns null
 * on any miss so a malformed clarify string can't silently win.
 */
export function parseClarified(text: string): Ticket | null {
  const item = DISHES.find((dish) => text.includes(dish));
  const note = NOTES.find((entry) => text.includes(entry));
  const table = readTable(text);
  const urgent = text.includes("加急") ? true : text.includes("普通") ? false : null;
  if (!item || !note || !table || urgent === null) return null;
  return { item, note, table, urgent };
}

/* ---- One order through the whole flow -------------------------------- */

export type AiOrderOutcome = {
  id: string;
  request: string;
  prediction: TicketPrediction;
  /** need_confirm(similarity, margin) returned true. */
  confirmed: boolean;
  /** The customer's restated sentence — only set when confirmed. */
  clarifyText: string | null;
  /** What intake finally wrote (clarified ticket if confirmed). */
  ticket: Ticket;
  extraTicks: number;
  /** Practice sets only: whether the final ticket matches the answer. */
  correct: boolean | null;
};

/**
 * Run one order from prediction to final ticket. `confirm` is the
 * student's need_confirm verdict. `order.clarify` is the restated
 * sentence the order set carries (authored per order — on the practice
 * set it's generated from the answer; a hidden set would ship it as
 * data). `order.expected` exists only on practice sets and only marks
 * correctness.
 */
export function resolveOrder(
  order: { id: string; request: string; clarify?: string; expected?: Ticket },
  prediction: TicketPrediction,
  confirm: boolean,
): AiOrderOutcome {
  const clarifyText = confirm ? (order.clarify ?? null) : null;
  const clarified = clarifyText ? parseClarified(clarifyText) : null;
  const ticket = clarified ?? prediction.ticket;
  return {
    id: order.id,
    request: order.request,
    prediction,
    confirmed: confirm,
    clarifyText,
    ticket,
    extraTicks: confirm ? CONFIRM_EXTRA_TICKS : 0,
    correct: order.expected ? sameTicket(ticket, order.expected) : null,
  };
}

/* ---- 正式提交行：第四关交给服务器的标准化结果 -------------------------
 * One row per order — the AI's predicted ticket plus the student's
 * need_confirm verdict. Confirmed rows keep their predicted ticket in
 * the payload (it records what the model guessed), but the judge
 * records the order correctly: confirmation means the customer
 * restated, which always lands right at a one-tick intake cost.
 */

export type AiResultRow = { id: string; ticket: Ticket; confirmed: boolean };

/** Menu-enum ticket check — the boundary every submitted row crosses. */
export function checkAiTicket(raw: unknown): Ticket | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const ticket = raw as Record<string, unknown>;
  if (
    typeof ticket.item !== "string" ||
    !(DISHES as readonly string[]).includes(ticket.item) ||
    typeof ticket.note !== "string" ||
    !(NOTES as readonly string[]).includes(ticket.note) ||
    typeof ticket.table !== "string" ||
    !(TABLES as readonly string[]).includes(ticket.table) ||
    typeof ticket.urgent !== "boolean"
  ) {
    return null;
  }
  return { item: ticket.item, note: ticket.note, table: ticket.table, urgent: ticket.urgent };
}

/**
 * Loose per-row sanitize for draft storage — keeps rows that look like
 * results, drops the rest. The judge re-checks strictly (ids must cover
 * the order set exactly) before grading.
 */
export function sanitizeAiResults(raw: unknown): AiResultRow[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: AiResultRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const ticket = checkAiTicket(row.ticket);
    if (typeof row.id !== "string" || ticket === null || typeof row.confirmed !== "boolean") {
      continue;
    }
    rows.push({ id: row.id, ticket, confirmed: row.confirmed });
  }
  return rows.length > 0 ? rows : null;
}

/**
 * Strict check for judging: one row per expected order, no extras, no
 * duplicates, every ticket menu-valid, every verdict boolean.
 */
export function checkAiResults(
  raw: unknown,
  orders: readonly { id: string }[],
): { results: AiResultRow[] | null; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(raw)) return { results: null, errors: ["缺少逐单结果 results"] };
  const wanted = new Set(orders.map((order) => order.id));
  const seen = new Set<string>();
  const rows: AiResultRow[] = [];
  for (const entry of raw) {
    const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
    const id = row?.id;
    if (typeof id !== "string" || !wanted.has(id)) {
      errors.push("结果里有不认识的订单号");
      continue;
    }
    if (seen.has(id)) {
      errors.push(`订单 ${id} 重复了`);
      continue;
    }
    seen.add(id);
    const ticket = checkAiTicket(row?.ticket);
    if (ticket === null) {
      errors.push(`订单 ${id} 的小票字段不合法`);
      continue;
    }
    if (typeof row?.confirmed !== "boolean") {
      errors.push(`订单 ${id} 的 confirmed 不是布尔值`);
      continue;
    }
    rows.push({ id, ticket, confirmed: row.confirmed });
  }
  for (const order of orders) {
    if (!seen.has(order.id)) errors.push(`缺了订单 ${order.id} 的结果`);
  }
  if (errors.length > 0) return { results: null, errors };
  rows.sort(
    (a, b) =>
      orders.findIndex((order) => order.id === a.id) -
      orders.findIndex((order) => order.id === b.id),
  );
  return { results: rows, errors };
}

/* ---- Normalized submission (what the server would judge) ------------- */

export type NormalizedAiResult = { id: string; ticket: Ticket; extraTicks: number };

export type NormalizedAiResults = {
  testSetId: string;
  modelVersion: string;
  results: NormalizedAiResult[];
};

export function normalizedResults(
  testSetId: string,
  outcomes: readonly AiOrderOutcome[],
): NormalizedAiResults {
  return {
    testSetId,
    modelVersion: AI_MODEL_ID,
    results: outcomes.map((outcome) => ({
      id: outcome.id,
      ticket: outcome.ticket,
      extraTicks: outcome.extraTicks,
    })),
  };
}

/* ---- Practice set ------------------------------------------------------
 * The stage-2 practice orders — the only set with public expected
 * tickets. Each order's predicted ticket carries the order-level
 * [similarity, margin] pair handed to the student's need_confirm.
 */

export const PRACTICE_ORDERS = INTAKE_SCENARIO.orders.map((order) => ({
  id: order.id,
  request: order.request,
  clarify: clarifiedText(order.expected!),
  expected: order.expected!,
}));

/** Collision-free cache key for an ordered list of intake requests. */
export function orderSetCacheKey(orders: readonly { id: string; request: string }[]): string {
  return JSON.stringify(orders.map((order) => [order.id, order.request]));
}

/** All texts the model must embed: every request clause + prototypes. */
export function textsToEmbed(requests: readonly string[]): string[] {
  const texts = new Set<string>();
  for (const request of requests) {
    const clauses = splitClauses(request);
    if (clauses.length === 0) texts.add(request);
    for (const clause of clauses) texts.add(clause);
  }
  for (const group of [ITEM_CANDIDATES, NOTE_CANDIDATES, TABLE_CANDIDATES, URGENT_CANDIDATES]) {
    for (const candidate of group) {
      for (const prototype of candidate.prototypes) texts.add(prototype);
    }
  }
  return [...texts];
}
