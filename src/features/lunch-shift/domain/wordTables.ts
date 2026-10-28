/**
 * Intake word tables — the data the student edits in stage 2 (修接单).
 *
 * The student's Python code only defines four variables; the browser
 * serializes them to JSON and the fixed parser below (shared by the page
 * and the server judge) does the actual reading:
 *
 *   dish_words: {原话里的词: 菜品}  — checked in insertion order, first key
 *                                   found in the request decides the dish;
 *                                   the value must be a menu dish.
 *   note_words: {原话里的词: 备注}  — same rule; no hit writes 「无备注」.
 *   calm_words / rush_words:      — word lists. Calm is checked FIRST: any
 *                                   hit means a normal order; otherwise any
 *                                   rush hit marks it urgent; neither means
 *                                   normal.
 *   桌号 is read by the fixed program (「N号桌」「N 号桌」「桌 N」「桌号 N」
 *   all count) — no word table to tune.
 */

import { DISHES, NOTES, sameTicket, type Ticket } from "./contracts.ts";
import type { IntakeOrderResult } from "./protocol.ts";

export type WordPair = [string, string];

export type IntakeTables = {
  dish: WordPair[];
  note: WordPair[];
  calm: string[];
  rush: string[];
};

/** Per-table caps — bound memory and keep the submitted payload small. */
export const MAX_WORDS_PER_TABLE = 20;
export const MAX_WORD_RUNES = 10;

function runeLength(text: string): number {
  return [...text].length;
}

/** The starter tables — exactly what the starter Python code defines. */
export function defaultIntakeTables(): IntakeTables {
  return {
    dish: [
      ["鸡腿饭", "鸡腿饭"],
      ["蛋炒饭", "蛋炒饭"],
      ["牛肉面", "牛肉面"],
    ],
    note: [
      ["不要香菜", "不要香菜"],
      ["少辣", "少辣"],
      ["加蛋", "加蛋"],
    ],
    calm: ["不赶时间", "不急着"],
    rush: ["赶时间", "急着", "快一点", "尽快"],
  };
}

const TABLE_SUFFIX_PATTERN = /([1-8])\s*号桌/;
const TABLE_PREFIX_PATTERN = /(?:桌号|桌)\s*([1-8])/;

/** Fixed table-number reader — deliberately not part of the word tables. */
export function readTable(request: string): string {
  const suffix = TABLE_SUFFIX_PATTERN.exec(request);
  const prefix = TABLE_PREFIX_PATTERN.exec(request);
  if (suffix && (!prefix || suffix.index <= prefix.index)) return suffix[1];
  if (prefix) return prefix[1];
  return "";
}

export function parseTicket(request: string, tables: IntakeTables): Ticket {
  const ticket: Ticket = { item: "", note: "无备注", table: readTable(request), urgent: false };
  for (const [key, value] of tables.dish) {
    if (key !== "" && request.includes(key)) {
      ticket.item = value;
      break;
    }
  }
  for (const [key, value] of tables.note) {
    if (key !== "" && request.includes(key)) {
      ticket.note = value;
      break;
    }
  }
  if (tables.calm.some((word) => word !== "" && request.includes(word))) {
    ticket.urgent = false;
  } else {
    ticket.urgent = tables.rush.some((word) => word !== "" && request.includes(word));
  }
  return ticket;
}

/** Per-field attribution for the result page: which word decided what. */
export type TicketTrace = {
  ticket: Ticket;
  item: { key: string | null };
  note: { key: string | null };
  urgent: { via: "calm" | "rush" | "none"; key: string | null };
};

export function traceTicket(request: string, tables: IntakeTables): TicketTrace {
  const ticket = parseTicket(request, tables);
  const trace: TicketTrace = {
    ticket,
    item: { key: null },
    note: { key: null },
    urgent: { via: "none", key: null },
  };
  for (const [key] of tables.dish) {
    if (key !== "" && request.includes(key)) {
      trace.item.key = key;
      break;
    }
  }
  for (const [key] of tables.note) {
    if (key !== "" && request.includes(key)) {
      trace.note.key = key;
      break;
    }
  }
  const calmHit = tables.calm.find((word) => word !== "" && request.includes(word));
  if (calmHit !== undefined) {
    trace.urgent = { via: "calm", key: calmHit };
  } else {
    const rushHit = tables.rush.find((word) => word !== "" && request.includes(word));
    if (rushHit !== undefined) trace.urgent = { via: "rush", key: rushHit };
  }
  return trace;
}

function checkWord(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const word = raw.trim();
  if (word === "" || runeLength(word) > MAX_WORD_RUNES) return null;
  return word;
}

function checkPairTable(
  raw: unknown,
  name: string,
  allowed: readonly string[],
  errors: string[],
): WordPair[] {
  if (!Array.isArray(raw)) {
    errors.push(`${name} 要写成一一对应的词表（字典）。`);
    return [];
  }
  if (raw.length > MAX_WORDS_PER_TABLE) {
    errors.push(`${name} 最多 ${MAX_WORDS_PER_TABLE} 个词，现在有 ${raw.length} 个。`);
  }
  const pairs: WordPair[] = [];
  for (const [index, entry] of raw.slice(0, MAX_WORDS_PER_TABLE).entries()) {
    const pair = Array.isArray(entry) ? entry : null;
    const key = pair ? checkWord(pair[0]) : null;
    const value = pair && typeof pair[1] === "string" ? pair[1].trim() : null;
    if (key === null) {
      errors.push(
        `${name} 第 ${index + 1} 个词写得不完整——词要去掉空格后剩 1～${MAX_WORD_RUNES} 个字。`,
      );
      continue;
    }
    if (value === null || !(allowed as readonly string[]).includes(value)) {
      errors.push(`${name} 里「${key}」对应的值不在菜单上（可选：${allowed.join("、")}）。`);
      continue;
    }
    pairs.push([key, value]);
  }
  return pairs;
}

function checkListTable(raw: unknown, name: string, errors: string[]): string[] {
  if (!Array.isArray(raw)) {
    errors.push(`${name} 要写成一串词（列表）。`);
    return [];
  }
  if (raw.length > MAX_WORDS_PER_TABLE) {
    errors.push(`${name} 最多 ${MAX_WORDS_PER_TABLE} 个词，现在有 ${raw.length} 个。`);
  }
  const words: string[] = [];
  for (const [index, entry] of raw.slice(0, MAX_WORDS_PER_TABLE).entries()) {
    const word = checkWord(entry);
    if (word === null) {
      errors.push(
        `${name} 第 ${index + 1} 个词写得不完整——词要去掉空格后剩 1～${MAX_WORD_RUNES} 个字。`,
      );
      continue;
    }
    words.push(word);
  }
  return words;
}

/**
 * Validate a submitted/restored tables object. Returns the usable tables
 * (invalid entries dropped, lists capped at 20) plus Chinese error text for
 * every rejected entry — the judge refuses submissions with errors; draft
 * restores keep the usable remainder silently.
 */
export function checkIntakeTables(raw: unknown): { tables: IntakeTables; errors: string[] } {
  const errors: string[] = [];
  const empty: IntakeTables = { dish: [], note: [], calm: [], rush: [] };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push("还没有可用的词表——先运行代码，让程序读出四张词表。");
    return { tables: empty, errors };
  }
  const record = raw as Record<string, unknown>;
  const tables: IntakeTables = {
    dish: checkPairTable(record.dish, "dish_words", DISHES, errors),
    note: checkPairTable(record.note, "note_words", NOTES, errors),
    calm: checkListTable(record.calm, "calm_words", errors),
    rush: checkListTable(record.rush, "rush_words", errors),
  };
  return { tables, errors };
}

/** Grade a word-table set against orders, keeping per-field attribution. */
export function evaluateIntake(
  orders: readonly { id: string; request: string; expected: Ticket }[],
  tables: IntakeTables,
): IntakeOrderResult[] {
  return orders.map((order) => {
    const trace = traceTicket(order.request, tables);
    return {
      id: order.id,
      request: order.request,
      correct: sameTicket(trace.ticket, order.expected),
      produced: trace.ticket,
      expected: order.expected,
      itemKey: trace.item.key,
      noteKey: trace.note.key,
      urgentVia: trace.urgent.via,
      urgentKey: trace.urgent.key,
    };
  });
}

/** Draft-restore variant: keep what is valid, say nothing. */
export function sanitizeIntakeTables(raw: unknown): IntakeTables | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return checkIntakeTables(raw).tables;
}
