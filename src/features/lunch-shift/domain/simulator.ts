/**
 * The deterministic tick simulation. One synchronous pass over the round:
 * orders arrive, intake writes tickets, the stove cooks one at a time, the
 * runner delivers. Two student inputs plug in:
 *
 *   - intake word tables: parse each request into a ticket (stage 2 work).
 *     When absent the order's expected ticket is recorded as-is — the
 *     修排队 stage starts from 小票已录对.
 *   - priority table: at every ≥2-candidate queue decision, pick the
 *     candidate with the largest table value; equal values keep the
 *     first-come-first-served order. When absent, plain FIFO.
 */

import {
  DISHES,
  NOTES,
  TABLES,
  type Candidate,
  type OrderResult,
  type QueuePick,
  type Scenario,
  type ScenarioOrder,
  type SimulationEvent,
  type SimulationRun,
  type Ticket,
} from "./contracts.ts";
import { priorityValue } from "./priority.ts";
import { parseTicket, type IntakeTables } from "./wordTables.ts";

export type SimConfig = {
  /** Student intake word tables; null/absent = 小票已录对 (expected used). */
  tables?: IntakeTables | null;
  /** 124-cell priority table; null/absent = first-come-first-served. */
  priority?: readonly number[] | null;
  /** 124-cell expedite table (>0 = spend a boost); null = never expedite. */
  expedite?: readonly number[] | null;
};

/** Per-run kitchen boost budget — a 3-tick order can be done in 1. */
export const EXPEDITE_BUDGET = 3;

/** Drops the hidden expected tickets before a scenario leaves the server. */
export function publicScenario(scenario: Scenario): Scenario {
  return {
    id: scenario.id,
    totalTicks: scenario.totalTicks,
    deliveryTicks: scenario.deliveryTicks,
    orders: scenario.orders.map(({ id, request, arrivalTick, cookTicks }) => ({
      id,
      request,
      arrivalTick,
      cookTicks,
    })),
  };
}

type RuntimeOrder = {
  source: ScenarioOrder;
  ticket: Ticket | null;
  receivedTick: number;
  cookStartTick: number;
  readyTick: number;
  deliveredTick: number;
};

type CookingSlot = { order: RuntimeOrder; doneTick: number };

function fifoQueue(queue: RuntimeOrder[]): RuntimeOrder[] {
  return queue
    .slice()
    .sort(
      (a, b) =>
        a.source.arrivalTick - b.source.arrivalTick || a.source.id.localeCompare(b.source.id),
    );
}

function deadlineFor(order: ScenarioOrder, scenario: Scenario): number {
  const ratio = order.expected?.urgent ? 0.3 : 0.6;
  return Math.trunc(scenario.totalTicks * ratio);
}

function candidateFor(order: RuntimeOrder, tick: number, scenario: Scenario): Candidate {
  const ticket = order.ticket ?? { item: "", note: "", table: "", urgent: false };
  return {
    id: order.source.id,
    item: ticket.item,
    note: ticket.note,
    table: ticket.table,
    urgent: ticket.urgent,
    request: order.source.request,
    arrivalTick: order.source.arrivalTick,
    readyTick: order.readyTick === 0 ? null : order.readyTick,
    waitTicks: Math.max(0, tick - order.source.arrivalTick),
    cookTicks: order.source.cookTicks,
    deadline: deadlineFor(order.source, scenario),
  };
}

function maxInt(a: number, b: number): number {
  return a > b ? a : b;
}

function isRecordableTicket(value: unknown): value is Ticket {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ticket = value as Record<string, unknown>;
  return (
    typeof ticket.item === "string" &&
    (DISHES as readonly string[]).includes(ticket.item) &&
    typeof ticket.note === "string" &&
    (NOTES as readonly string[]).includes(ticket.note) &&
    typeof ticket.table === "string" &&
    (TABLES as readonly string[]).includes(ticket.table) &&
    typeof ticket.urgent === "boolean"
  );
}

function removeOrder(queue: RuntimeOrder[], target: RuntimeOrder): RuntimeOrder[] {
  const index = queue.indexOf(target);
  return index < 0 ? queue : [...queue.slice(0, index), ...queue.slice(index + 1)];
}

/** Replays one round; the config supplies intake tables and queue picks. */
export function simulate(
  scenario: Scenario,
  config: SimConfig = {},
  stoves = 1,
  intakePerTick = 1,
): SimulationRun {
  const priority = config.priority ?? null;
  const expedite = config.expedite ?? null;
  let expediteBudget = EXPEDITE_BUDGET;
  let expeditesUsed = 0;
  const runtime = scenario.orders
    .slice()
    .sort((a, b) => a.arrivalTick - b.arrivalTick || a.id.localeCompare(b.id))
    .map<RuntimeOrder>((source) => ({
      source,
      ticket: null,
      receivedTick: 0,
      cookStartTick: 0,
      readyTick: 0,
      deliveredTick: 0,
    }));
  let inbox: RuntimeOrder[] = [];
  let kitchen: RuntimeOrder[] = [];
  let ready: RuntimeOrder[] = [];
  let cooking: CookingSlot[] = [];
  const events: SimulationEvent[] = [];
  const picks: QueuePick[] = [];
  let nextArrival = 0;
  let runnerAvailableTick = 0;

  const choose = (queue: RuntimeOrder[], stage: "kitchen" | "delivery", tick: number) => {
    const ordered = fifoQueue(queue);
    if (ordered.length < 2) return ordered[0];
    const candidates = ordered.map((order) => candidateFor(order, tick, scenario));
    const withValues = candidates.map((candidate) => ({
      candidate,
      value:
        priority === null
          ? null
          : priorityValue(priority, candidate.urgent, candidate.waitTicks, candidate.cookTicks),
    }));
    let best = withValues[0];
    if (priority !== null) {
      for (const entry of withValues) {
        // Strictly greater wins; ties keep the earlier (FIFO) candidate.
        if ((entry.value ?? 0) > (best.value ?? 0)) best = entry;
      }
    }
    picks.push({
      tick,
      stage,
      picked: best.candidate.id,
      candidates: withValues.map((entry) => ({
        id: entry.candidate.id,
        urgent: entry.candidate.urgent,
        waitTicks: entry.candidate.waitTicks,
        cookTicks: entry.candidate.cookTicks,
        value: entry.value,
      })),
    });
    const match = ordered.find((order) => order.source.id === best.candidate.id);
    return match ?? ordered[0];
  };

  for (let tick = 1; tick <= scenario.totalTicks; tick++) {
    while (nextArrival < runtime.length && runtime[nextArrival].source.arrivalTick <= tick) {
      const order = runtime[nextArrival];
      inbox.push(order);
      events.push({ tick, stage: "intake", orderId: order.source.id, action: "arrive" });
      nextArrival++;
    }

    const finished: CookingSlot[] = [];
    for (const slot of cooking) {
      if (slot.doneTick <= tick) {
        slot.order.readyTick = tick;
        ready.push(slot.order);
        events.push({ tick, stage: "kitchen", orderId: slot.order.source.id, action: "ready" });
      } else {
        finished.push(slot);
      }
    }
    cooking = finished;

    for (let processed = 0; inbox.length > 0 && processed < intakePerTick; processed++) {
      const order = fifoQueue(inbox)[0];
      inbox = removeOrder(inbox, order);
      // With word tables the student's parse decides; a ticket missing its
      // dish or table is invalid and the order keeps a null ticket. Without
      // tables the stage runs 小票已录对 — the expected ticket is recorded.
      const output = config.tables
        ? parseTicket(order.source.request, config.tables)
        : (order.source.expected ?? null);
      if (isRecordableTicket(output)) order.ticket = output;
      order.receivedTick = tick;
      kitchen.push(order);
      events.push({ tick, stage: "intake", orderId: order.source.id, action: "ticket" });
    }

    while (cooking.length < stoves && kitchen.length > 0) {
      const order = choose(kitchen, "kitchen", tick);
      kitchen = removeOrder(kitchen, order);
      order.cookStartTick = tick;
      const candidate = candidateFor(order, tick, scenario);
      let cookTicks = maxInt(1, order.source.cookTicks);
      if (
        cookTicks === 3 &&
        expediteBudget > 0 &&
        expedite !== null &&
        priorityValue(expedite, candidate.urgent, candidate.waitTicks, 3) > 0
      ) {
        cookTicks = 1;
        expediteBudget--;
        expeditesUsed++;
        events.push({ tick, stage: "kitchen", orderId: order.source.id, action: "expedite" });
      }
      cooking.push({ order, doneTick: tick + cookTicks });
      events.push({ tick, stage: "kitchen", orderId: order.source.id, action: "cook" });
    }

    if (ready.length > 0 && tick >= runnerAvailableTick) {
      const order = choose(ready, "delivery", tick);
      ready = removeOrder(ready, order);
      order.deliveredTick = tick;
      runnerAvailableTick = tick + maxInt(1, scenario.deliveryTicks);
      events.push({ tick, stage: "delivery", orderId: order.source.id, action: "send" });
    }
  }

  const hasExpected = runtime.every((order) => order.source.expected != null);
  const orders: OrderResult[] = [];
  let deliveredCount = 0;
  let onTimeCount = 0;
  let correctCount = 0;
  for (const order of runtime) {
    const delivered = order.deliveredTick !== 0;
    const wait = delivered
      ? maxInt(0, order.deliveredTick - order.source.arrivalTick)
      : maxInt(0, scenario.totalTicks - order.source.arrivalTick + 1);
    const correct =
      order.source.expected != null
        ? order.ticket != null &&
          order.ticket.item === order.source.expected.item &&
          order.ticket.note === order.source.expected.note &&
          order.ticket.table === order.source.expected.table &&
          order.ticket.urgent === order.source.expected.urgent
        : null;
    const urgent = order.source.expected?.urgent ?? false;
    const waitTarget = Math.max(1, scenario.totalTicks * (urgent ? 0.3 : 0.6));
    const onTime = delivered && wait < waitTarget;
    orders.push({
      id: order.source.id,
      request: order.source.request,
      correct,
      delivered,
      onTime,
      wait,
      item: order.ticket?.item ?? "",
      note: order.ticket?.note ?? "",
      table: order.ticket?.table ?? "",
      urgent: order.ticket?.urgent ?? false,
      expected: order.source.expected,
    });
    if (delivered) deliveredCount++;
    if (onTime) onTimeCount++;
    if (correct === true) correctCount++;
  }
  return {
    result: {
      correct: hasExpected ? correctCount : 0,
      delivered: deliveredCount,
      onTime: onTimeCount,
      orders,
      events,
      picks,
      expeditesUsed,
    },
  };
}
