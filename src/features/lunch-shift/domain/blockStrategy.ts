/**
 * Block-rule semantics: validation, the policy the simulator calls, and
 * the two explainers ("谁定的？" per ticket field / "为什么选它" per queue
 * pick). Ported from kitchen/engine.go — the Go original is authoritative;
 * scores must stay 71/74/88.
 */

import {
  DISHES,
  FOCUSES,
  NOTES,
  TABLE_PREFIX_PATTERN,
  URGENT_WORDS,
  emptyBlockDrafts,
  type BlockDrafts,
  type BlockRule,
  type Candidate,
  type DecisionContext,
  type Focus,
} from "./contracts.ts";
import { defaultTicket } from "./simulator.ts";

const MAX_RULES_PER_FOCUS = 12;
const MAX_PHRASE_RUNES = 20;

function runeLength(text: string): number {
  return [...text].length;
}

/** Whether one rule is legal under a station's start statement. */
export function validRule(rule: BlockRule, focus: Focus): boolean {
  if (focus === "intake") {
    if (rule.type === "table_prefix" || rule.type === "hold_bad") return true;
    if (typeof rule.phrase !== "string" || runeLength(rule.phrase) > MAX_PHRASE_RUNES) {
      return false;
    }
    if (rule.type === "note") {
      return typeof rule.value === "string" && (NOTES as readonly string[]).includes(rule.value);
    }
    if (rule.type === "urgent_phrase") {
      return typeof rule.value === "boolean";
    }
    if (rule.type === "synonym") {
      return typeof rule.value === "string" && runeLength(rule.value) <= MAX_PHRASE_RUNES;
    }
    return false;
  }
  if (rule.type === "priority_urgent" || rule.type === "priority_longest") return true;
  if (rule.type === "priority_shortest") return focus === "kitchen";
  if (rule.type === "priority_item") {
    return typeof rule.value === "string" && (DISHES as readonly string[]).includes(rule.value);
  }
  if (
    rule.type === "priority_normal" ||
    rule.type === "priority_first" ||
    rule.type === "priority_deadline"
  ) {
    return true;
  }
  if (rule.type === "priority_table") return focus === "delivery";
  if (rule.type === "aged_urgent") {
    return (
      Number.isInteger(rule.ticks) && (rule.ticks as number) >= 1 && (rule.ticks as number) <= 30
    );
  }
  return (
    rule.type === "priority_wait" &&
    Number.isInteger(rule.ticks) &&
    (rule.ticks as number) >= 1 &&
    (rule.ticks as number) <= 30
  );
}

function sanitizeRule(raw: unknown, focus: Focus): BlockRule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.type !== "string") return null;
  const rule: BlockRule = { type: candidate.type };
  if (typeof candidate.phrase === "string") rule.phrase = candidate.phrase;
  if (candidate.value !== undefined) rule.value = candidate.value;
  if (typeof candidate.ticks === "number") rule.ticks = candidate.ticks;
  return validRule(rule, focus) ? rule : null;
}

/**
 * Bound a restored/submitted drafts object at the domain edge: every focus
 * gets a rule list, invalid rules drop out, the list caps at 12.
 */
export function sanitizeBlockDrafts(raw: unknown): BlockDrafts {
  const drafts = emptyBlockDrafts();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return drafts;
  const record = raw as Record<string, unknown>;
  for (const focus of FOCUSES) {
    const entry = record[focus];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const draftEntry = entry as Record<string, unknown>;
    const rules = draftEntry.rules;
    if (!Array.isArray(rules)) continue;
    drafts[focus] = {
      rules: rules
        .map((rule) => sanitizeRule(rule, focus))
        .filter((rule): rule is BlockRule => rule !== null)
        .slice(0, MAX_RULES_PER_FOCUS),
    };
    // Blockly workspace blob is only used to restore the editor canvas;
    // cap it so drafts can't smuggle arbitrary payloads.
    if (typeof draftEntry.workspace === "string" && draftEntry.workspace.length <= 200_000) {
      drafts[focus].workspace = draftEntry.workspace;
    }
  }
  return drafts;
}

export function isBlockDrafts(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  return FOCUSES.every((focus) => {
    const entry = record[focus];
    return (
      entry != null &&
      typeof entry === "object" &&
      Array.isArray((entry as BlockDrafts[Focus]).rules)
    );
  });
}

function rulePriority(rule: BlockRule, order: Candidate): number {
  switch (rule.type) {
    case "priority_urgent":
      return order.urgent ? 1 : 0;
    case "priority_wait":
      return order.waitTicks >= (rule.ticks as number) ? 1 : 0;
    case "priority_longest":
      return order.waitTicks;
    case "priority_shortest":
      return -order.cookTicks;
    case "priority_item":
      return order.item === rule.value ? 1 : 0;
    case "priority_normal":
      return order.urgent ? 0 : 1;
    case "priority_first":
      return -order.arrivalTick;
    case "priority_deadline":
      return order.waitTicks >= order.deadline ? 1 : 0;
    case "priority_table": {
      const number = Number.parseInt(order.table, 10);
      return Number.isNaN(number) ? 0 : -number;
    }
  }
  return 0;
}

/**
 * Orders that waited at least the rule's tick count count as urgent.
 * Copies each order: the caller's queue must stay un-aged so the trace
 * can still tell which orders the aging rule promoted.
 */
function applyAging(queue: Candidate[], rules: BlockRule[]): Candidate[] {
  const aged = queue.map((order) => ({ ...order }));
  for (const rule of rules) {
    if (rule.type !== "aged_urgent" || rule.ticks === undefined) continue;
    for (const order of aged) {
      if (order.waitTicks >= rule.ticks) order.urgent = true;
    }
  }
  return aged;
}

/** Relabel rules act on candidates, not comparisons. */
function sortingRules(rules: BlockRule[]): BlockRule[] {
  return rules.filter((rule) => rule.type !== "aged_urgent" && rule.type !== "synonym");
}

/**
 * Synonym rules: "原话中的 X 也算 Y" appends Y so the default parser and
 * the keyword rules can match the normalized text.
 */
export function expandRequest(request: string, rules: BlockRule[]): string {
  let expanded = request;
  for (const rule of rules) {
    if (rule.type !== "synonym" || rule.phrase === undefined) continue;
    const phrase = rule.phrase.trim();
    const value = typeof rule.value === "string" ? rule.value.trim() : "";
    if (phrase !== "" && value !== "" && request.includes(phrase)) {
      expanded += " " + value;
    }
  }
  return expanded;
}

/** The student policy: intake parses a ticket, queues pick an order id. */
export function applyBlockStrategy(ctx: DecisionContext, drafts: BlockDrafts): unknown {
  if (ctx.stage === "intake") {
    const request = expandRequest(ctx.request ?? "", drafts.intake.rules);
    const ticket = defaultTicket(request);
    let holdBad = false;
    let noteMatched = false;
    let urgentMatched = false;
    for (const rule of drafts.intake.rules) {
      if (rule.type === "hold_bad") holdBad = true;
    }
    for (const rule of drafts.intake.rules) {
      switch (rule.type) {
        case "table_prefix": {
          const match = TABLE_PREFIX_PATTERN.exec(request);
          if (match) ticket.table = match[1];
          break;
        }
        case "note": {
          if (!noteMatched && rule.phrase?.trim() && request.includes(rule.phrase)) {
            if (typeof rule.value === "string") {
              ticket.note = rule.value;
              noteMatched = true;
            }
          }
          break;
        }
        case "urgent_phrase": {
          if (!urgentMatched && rule.phrase?.trim() && request.includes(rule.phrase)) {
            if (typeof rule.value === "boolean") {
              ticket.urgent = rule.value;
              urgentMatched = true;
            }
          }
          break;
        }
      }
    }
    if (holdBad && (ticket.item === "" || ticket.table === "")) return "hold";
    return ticket;
  }
  const rules = sortingRules(drafts[ctx.stage].rules);
  const queue = applyAging(ctx.queue, drafts[ctx.stage].rules);
  const ranked = queue.map((order, index) => ({ order, index }));
  ranked.sort((a, b) => {
    for (const rule of rules) {
      const difference = rulePriority(rule, b.order) - rulePriority(rule, a.order);
      if (difference !== 0) return difference;
    }
    return a.index - b.index;
  });
  return ranked.length === 0 ? null : ranked[0].order.id;
}

export function ruleLabel(rule: BlockRule): string {
  const phrase = rule.phrase ?? "";
  switch (rule.type) {
    case "note":
      return `原话包含「${phrase}」→ 备注${String(rule.value)}`;
    case "table_prefix":
      return "识别“桌 7 / 桌号 7”这样的桌号";
    case "urgent_phrase":
      return `原话包含「${phrase}」→ 订单设为${rule.value ? "加急" : "普通"}`;
    case "priority_urgent":
      return "加急单先处理";
    case "priority_longest":
      return "等得最久的先处理";
    case "priority_shortest":
      return "做得快的先处理";
    case "priority_item":
      return `先做/先送 ${String(rule.value)}`;
    case "priority_normal":
      return "普通单先处理";
    case "priority_first":
      return "来得最早的先处理";
    case "priority_deadline":
      return "已达到准时等待上限的订单优先";
    case "priority_table":
      return "桌号小的先送";
    case "hold_bad":
      return "认不出的订单拦下";
    case "synonym":
      return `原话中的「${phrase}」也算「${String(rule.value)}」`;
    case "aged_urgent":
      return `等了 ${rule.ticks} 拍的订单算加急`;
  }
  return `等了 ${rule.ticks} 拍的先处理`;
}

/** Explains who decided each ticket field for one order. */
export function traceIntake(request: string, rules: BlockRule[]): Record<string, string> {
  const expanded = expandRequest(request, rules);
  const synonymFired = expanded !== request;
  const ticket = defaultTicket(expanded);
  const setBy: Record<string, string> = { note: "", table: "", urgent: "" };
  let noteMatched = false;
  let urgentMatched = false;
  for (const [index, rule] of rules.entries()) {
    const label = `你的第 ${index + 1} 条规则「${ruleLabel(rule)}」`;
    switch (rule.type) {
      case "table_prefix": {
        const match = TABLE_PREFIX_PATTERN.exec(expanded);
        if (match) {
          ticket.table = match[1];
          setBy.table = label;
        }
        break;
      }
      case "note": {
        if (!noteMatched && rule.phrase?.trim() && expanded.includes(rule.phrase)) {
          if (typeof rule.value === "string") {
            ticket.note = rule.value;
            setBy.note = label;
            noteMatched = true;
          }
        }
        break;
      }
      case "urgent_phrase": {
        if (!urgentMatched && rule.phrase?.trim() && expanded.includes(rule.phrase)) {
          if (typeof rule.value === "boolean") {
            ticket.urgent = rule.value;
            setBy.urgent = label;
            urgentMatched = true;
          }
        }
        break;
      }
    }
  }
  // Field attribution reads the FINAL ticket (after synonyms/rules), not
  // the raw parse — otherwise a synonym that fixed a field would still be
  // explained as "程序按默认填写".
  const fallback = (field: "note" | "table" | "urgent"): string => {
    if (setBy[field] !== "") return setBy[field];
    if (field === "note") {
      if (ticket.note !== "无备注") {
        return synonymFired && !request.includes(ticket.note)
          ? "你的同义词规则帮程序认出的"
          : "程序自己从原话认出的";
      }
      return "没有规则命中，程序按默认写了「无备注」";
    }
    if (field === "table") {
      if (ticket.table !== "") {
        return synonymFired && !/([1-8])\s*号桌/.test(request)
          ? "你的同义词规则帮程序认出的"
          : "程序自己从原话认出的";
      }
      return "没有规则命中，程序没认出桌号";
    }
    if (ticket.urgent) {
      return synonymFired && !URGENT_WORDS.test(request)
        ? "你的同义词规则帮程序认出的"
        : "程序自己从原话认出的";
    }
    return "原话里没有催单词，程序按默认当成了普通";
  };
  for (const rule of rules) {
    if (rule.type === "hold_bad" && (ticket.item === "" || ticket.table === "")) {
      return {
        item: "被你的拦截规则拦下，这单没进厨房",
        note: "被你的拦截规则拦下",
        table: "被你的拦截规则拦下",
        urgent: "被你的拦截规则拦下",
      };
    }
  }
  let itemSource = "程序没有认出菜品，小票菜品是空的";
  if (ticket.item !== "") {
    itemSource = "程序从原话认出的";
    if (synonymFired) {
      for (const dish of DISHES) {
        if (ticket.item === dish && !request.includes(dish)) {
          itemSource = "你的同义词规则帮程序认出的";
          break;
        }
      }
    }
  }
  return {
    item: itemSource,
    note: fallback("note"),
    table: fallback("table"),
    urgent: fallback("urgent"),
  };
}

/** Explains why one order was picked from the queue. */
export function traceQueueChoice(rules: BlockRule[], queue: Candidate[]): string {
  const boosted = new Map<string, number>();
  for (const rule of rules) {
    if (rule.type !== "aged_urgent" || rule.ticks === undefined) continue;
    for (const order of queue) {
      if (order.waitTicks >= rule.ticks && !order.urgent) boosted.set(order.id, rule.ticks);
    }
  }
  const aged = applyAging(queue, rules);
  const active = sortingRules(rules);
  const ranked = aged.map((order, index) => ({ order, index }));
  ranked.sort((a, b) => {
    for (const rule of active) {
      const difference = rulePriority(rule, b.order) - rulePriority(rule, a.order);
      if (difference !== 0) return difference;
    }
    return a.index - b.index;
  });
  if (ranked.length === 0) return "这一拍没有可处理的订单";
  if (ranked.length === 1) return "这一拍只有它可以处理";
  const picked = ranked[0].order;
  const second = ranked[1].order;
  const boostedTicks = boosted.get(picked.id);
  if (boostedTicks !== undefined) {
    return `它等了 ${boostedTicks} 拍，被你的规则当成加急，排在最前`;
  }
  for (const [index, rule] of active.entries()) {
    if (rulePriority(rule, picked) > rulePriority(rule, second)) {
      return `第 ${index + 1} 条规则「${ruleLabel(rule)}」让它排在最前`;
    }
  }
  if (active.length > 0) return "几条规则分不出高下，按先到顺序选了它";
  return "没有规则，按先到先处理选了它";
}

/** Rule types each station's editor offers, in palette order. */
export const INTAKE_RULE_TYPES = ["note", "table_prefix", "urgent_phrase", "hold_bad"] as const;
export const INTAKE_ADVANCED_RULE_TYPES = ["synonym"] as const;
export const KITCHEN_RULE_TYPES = [
  "priority_urgent",
  "priority_longest",
  "priority_first",
  "priority_shortest",
  "priority_normal",
  "priority_deadline",
  "priority_item",
  "priority_wait",
] as const;
export const DELIVERY_RULE_TYPES = [
  "priority_urgent",
  "priority_longest",
  "priority_first",
  "priority_table",
  "priority_normal",
  "priority_deadline",
  "priority_item",
  "priority_wait",
] as const;
export const QUEUE_ADVANCED_RULE_TYPES = ["aged_urgent"] as const;

export function ruleTypesFor(focus: Focus): {
  basic: readonly string[];
  advanced: readonly string[];
} {
  if (focus === "intake") {
    return { basic: INTAKE_RULE_TYPES, advanced: INTAKE_ADVANCED_RULE_TYPES };
  }
  return {
    basic: focus === "kitchen" ? KITCHEN_RULE_TYPES : DELIVERY_RULE_TYPES,
    advanced: QUEUE_ADVANCED_RULE_TYPES,
  };
}

/** Default parameter values when a rule of this type is first added. */
export function defaultRule(type: string): BlockRule {
  switch (type) {
    case "note":
      return { type, phrase: "不放香菜", value: NOTES[0] };
    case "urgent_phrase":
      return { type, phrase: "不赶时间", value: false };
    case "synonym":
      return { type, phrase: "不放香菜", value: "不要香菜" };
    case "priority_item":
      return { type, value: DISHES[0] };
    case "priority_wait":
    case "aged_urgent":
      return { type, ticks: 8 };
    default:
      return { type };
  }
}
