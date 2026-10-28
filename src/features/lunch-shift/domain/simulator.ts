/**
 * The deterministic tick simulation — ported from kitchen/engine.go's
 * `Simulate`. Synchronous: the policy is pure data in, data out. The Go
 * original is authoritative; scores must stay 71/74/88.
 */

import {
  DISHES,
  NOTES,
  NOT_URGENT_WORDS,
  TABLES,
  TABLE_DEFAULT_PATTERN,
  URGENT_WORDS,
  type Candidate,
  type CapturedDecision,
  type DecisionContext,
  type OrderResult,
  type Policy,
  type RunSummary,
  type Scenario,
  type ScenarioOrder,
  type SimulationEvent,
  type SimulationRun,
  type Ticket,
} from "./contracts.ts";

export function defaultTicket(request: string): Ticket {
  const ticket: Ticket = { item: "", note: "无备注", table: "", urgent: false };
  for (const dish of DISHES) {
    if (request.includes(dish)) {
      ticket.item = dish;
      break;
    }
  }
  if (request.includes("不要香菜")) ticket.note = "不要香菜";
  else if (request.includes("少辣")) ticket.note = "少辣";
  else if (request.includes("加蛋")) ticket.note = "加蛋";
  const match = TABLE_DEFAULT_PATTERN.exec(request);
  if (match) ticket.table = match[1];
  ticket.urgent = URGENT_WORDS.test(request) && !NOT_URGENT_WORDS.test(request);
  return ticket;
}

/** The original no-rules behavior: default parse + first-come-first-served. */
export function baselinePolicy(ctx: DecisionContext): unknown {
  if (ctx.stage === "intake") return defaultTicket(ctx.request ?? "");
  return ctx.queue.length > 0 ? ctx.queue[0].id : null;
}

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

/** Replays one round; the policy decides intake parsing and queue picks. */
export function simulate(
  scenario: Scenario,
  policy: Policy,
  stoves = 1,
  intakePerTick = 1,
): SimulationRun {
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
  const captured: CapturedDecision[] = [];
  const events: SimulationEvent[] = [];
  const stageWait: Record<string, number> = { intake: 0, kitchen: 0, delivery: 0 };
  let nextArrival = 0;
  let runnerAvailableTick = 0;
  let invalidDecisions = 0;

  const ask = (ctx: DecisionContext): unknown => {
    const output = policy(ctx);
    captured.push({
      stage: ctx.stage,
      tick: ctx.tick,
      orderId: ctx.orderId,
      request: ctx.request,
      queue: ctx.queue,
      output,
    });
    return output;
  };

  const choose = (queue: RuntimeOrder[], stage: "kitchen" | "delivery", tick: number) => {
    const ordered = fifoQueue(queue);
    if (ordered.length < 2) {
      if (ordered.length === 1) {
        captured.push({
          stage,
          tick,
          queue: [candidateFor(ordered[0], tick, scenario)],
          output: ordered[0].source.id,
        });
      }
      return ordered[0];
    }
    const candidates = ordered.map((order) => candidateFor(order, tick, scenario));
    const selected = ask({ stage, tick, queue: candidates });
    if (typeof selected === "string") {
      const match = ordered.find((order) => order.source.id === selected);
      if (match) return match;
    }
    invalidDecisions++;
    return ordered[0];
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
      const output = ask({
        stage: "intake",
        tick,
        orderId: order.source.id,
        request: order.source.request,
        queue: [],
      });
      if (output === "hold") {
        // 学生用拦截规则把这单拦下了：不进厨房，也永远不会送达。
        order.receivedTick = tick;
        events.push({ tick, stage: "intake", orderId: order.source.id, action: "held" });
        continue;
      }
      // A ticket with any unrecognized field (e.g. empty table) is invalid
      // and the order keeps a null ticket, like the Go engine.
      if (isRecordableTicket(output)) {
        order.ticket = output;
      } else {
        invalidDecisions++;
      }
      order.receivedTick = tick;
      stageWait.intake += maxInt(0, tick - order.source.arrivalTick);
      kitchen.push(order);
      events.push({ tick, stage: "intake", orderId: order.source.id, action: "ticket" });
    }

    while (cooking.length < stoves && kitchen.length > 0) {
      const order = choose(kitchen, "kitchen", tick);
      kitchen = removeOrder(kitchen, order);
      order.cookStartTick = tick;
      stageWait.kitchen += maxInt(0, tick - order.receivedTick);
      cooking.push({ order, doneTick: tick + maxInt(1, order.source.cookTicks) });
      events.push({ tick, stage: "kitchen", orderId: order.source.id, action: "cook" });
    }

    if (ready.length > 0 && tick >= runnerAvailableTick) {
      const order = choose(ready, "delivery", tick);
      ready = removeOrder(ready, order);
      order.deliveredTick = tick;
      stageWait.delivery += maxInt(0, tick - order.readyTick);
      runnerAvailableTick = tick + maxInt(1, scenario.deliveryTicks);
      events.push({ tick, stage: "delivery", orderId: order.source.id, action: "send" });
    }
  }

  for (const order of runtime) {
    if (order.receivedTick === 0) {
      stageWait.intake += maxInt(0, scenario.totalTicks - order.source.arrivalTick + 1);
    } else if (order.cookStartTick === 0) {
      stageWait.kitchen += maxInt(0, scenario.totalTicks - order.receivedTick + 1);
    } else if (order.readyTick === 0) {
      stageWait.kitchen += maxInt(0, scenario.totalTicks - order.cookStartTick + 1);
    } else if (order.deliveredTick === 0) {
      stageWait.delivery += maxInt(0, scenario.totalTicks - order.readyTick + 1);
    }
  }

  const hasExpected = runtime.every((order) => order.source.expected != null);
  const orders: OrderResult[] = [];
  let scoreSum = 0;
  let deliveredCount = 0;
  let onTimeCount = 0;
  let correctCount = 0;
  let waitSum = 0;
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
    const waitPoints = delivered ? 25 * Math.max(0, 1 - wait / waitTarget) : 0;
    let points = waitPoints;
    if (correct === true) points += 50;
    if (onTime) points += 25;
    const rounded = Math.round(points * 100) / 100;
    orders.push({
      id: order.source.id,
      request: order.source.request,
      correct,
      delivered,
      onTime,
      wait,
      points: rounded,
      item: order.ticket?.item ?? "",
      note: order.ticket?.note ?? "",
      table: order.ticket?.table ?? "",
      urgent: order.ticket?.urgent ?? false,
    });
    if (delivered) {
      deliveredCount++;
      waitSum += wait;
    }
    if (onTime) onTimeCount++;
    if (correct === true) correctCount++;
    scoreSum += rounded;
  }
  const averageWait = deliveredCount > 0 ? Math.round((waitSum / deliveredCount) * 10) / 10 : 0;
  let bottleneck = "intake";
  for (const focus of ["kitchen", "delivery"]) {
    if (stageWait[focus] > stageWait[bottleneck]) bottleneck = focus;
  }
  const score = hasExpected && orders.length > 0 ? Math.round(scoreSum / orders.length) : null;
  return {
    result: {
      score,
      correct: correctCount,
      delivered: deliveredCount,
      onTime: onTimeCount,
      averageWait,
      orders,
      invalidDecisions,
      bottleneck: bottleneck as RunSummary["bottleneck"],
      events,
    },
    captured,
  };
}
