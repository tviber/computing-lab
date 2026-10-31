/**
 * Discrete-event simulator for the information-system lab.
 *
 * Model: every stimulus (scripted emit or a sensor tick) creates one
 * event that travels the student's wiring — one queue item per hop,
 * at least one tick per link. Node handlers are pure transitions on a
 * small runtime view; the same event arriving again (e.g. fanned out
 * and reconverging at a db) is deduped per device by event id.
 *
 * Determinism: the queue is a plain array and `pop` is an O(n) scan for
 * the earliest (tick, insertion seq) item — cheap at MAX_EVENTS=512, and
 * it keeps same-tick order stable. The single seeded rng drives sensor
 * jitter and gateway drop-rate only.
 *
 * Termination: `done` when the queue drains; `budget` only when the step
 * counter hits `maxEvents` with work still queued (runaway
 * amplification). Events due at or after the horizon are recorded as
 * drops (cause "timeout") — human queues left non-empty then report as
 * pending.
 *
 * Drops are first-class rows (separate `dropped` list sharing the `step`
 * counter with `trace`) so the timeline can show where an event died.
 */

import type { IsCase, IsEventKind, ScriptEvent } from "./scenario.ts";
import { sanitizeTopology, type IsNode, type IsTopology } from "./model.ts";
import { makeRng } from "./rng.ts";

export const MAX_EVENTS = 512;
const LINK_TICK = 1;

export type SimReason = "done" | "budget";

export type DropCause = "link-down" | "device-down" | "timeout" | "loop" | "no-emit";

export type DroppedEvent = {
  step: number;
  tick: number;
  eventId: string;
  kind: IsEventKind;
  payload: number;
  from: string;
  to: string;
  port: string;
  cause: DropCause;
};

export type TraceEmit = { to: string; port: string; at: number };

export type TraceRow = {
  step: number;
  tick: number;
  node: string;
  port: string;
  kind: IsEventKind;
  payload: number;
  from: string;
  eventId: string;
  path: string[];
  emits: TraceEmit[];
  note?: string;
  after?: DeviceView;
};

export type DeviceView = {
  kind: string;
  label: string;
  up: boolean;
  emitted: number;
  forwarded: number;
  dropped: number;
  stored: number[];
  results: number;
  seen: number;
  feed: number[];
  last: number | null;
  active: boolean;
  fired: number;
  received: number;
  pending: number;
};

export type SimRun = {
  reason: SimReason;
  horizon: number;
  trace: TraceRow[];
  dropped: DroppedEvent[];
  /** Views at t=0 (before the first step) — cursor 0 shows this. */
  initialDevices: Record<string, DeviceView>;
  devices: Record<string, DeviceView>;
  eventsUsed: number;
};

type Inflight = {
  id: string;
  kind: IsEventKind;
  payload: number;
  path: string[];
  born: number;
};

type PendingItem =
  | { at: number; t: "deliver"; event: Inflight; node: string; port: string }
  | { at: number; t: "stim"; node: string; kind: IsEventKind; payload: number }
  | {
      at: number;
      t: "fault";
      op: "link-up" | "device-up" | "link-down" | "device-down";
      node: string;
      port: string | null;
    };

type QueueItem = PendingItem & { seq: number };

type DevState = {
  def: IsNode;
  up: boolean;
  emitted: number;
  forwarded: number;
  dropped: number;
  stored: number[];
  storedIds: Set<string>;
  results: number;
  seen: number;
  feed: number[];
  last: number | null;
  active: boolean;
  fired: number;
  received: number;
  queue: Inflight[];
  pendingIds: Set<string>;
};

type ProcessResult = {
  emits: { kind: IsEventKind; payload: number; at: number; carry?: Inflight }[];
  note?: string;
  selfAt?: number;
};

function viewOf(dev: DevState): DeviceView {
  return {
    kind: dev.def.kind,
    label: dev.def.label,
    up: dev.up,
    emitted: dev.emitted,
    forwarded: dev.forwarded,
    dropped: dev.dropped,
    stored: [...dev.stored],
    results: dev.results,
    seen: dev.seen,
    feed: [...dev.feed],
    last: dev.last,
    active: dev.active,
    fired: dev.fired,
    received: dev.received,
    pending: dev.queue.length,
  };
}

export function runScenario(
  topology: IsTopology,
  testCase: IsCase,
  maxEvents: number = MAX_EVENTS,
): SimRun {
  const topo = sanitizeTopology(topology);
  const rng = makeRng(testCase.seed ?? 0);
  const devices = new Map<string, DevState>();
  for (const node of topo.nodes) {
    devices.set(node.id, {
      def: node,
      up: !(testCase.init?.down ?? []).includes(node.id),
      emitted: 0,
      forwarded: 0,
      dropped: 0,
      stored: [...(testCase.init?.dbRecords?.[node.id] ?? [])],
      storedIds: new Set(),
      results: 0,
      seen: 0,
      feed: [],
      last: null,
      active: false,
      fired: 0,
      received: 0,
      queue: [],
      pendingIds: new Set(),
    });
  }
  const downPorts = new Set((testCase.init?.cut ?? []).map((c) => `${c.node}|${c.port}`));

  const queue: QueueItem[] = [];
  let seq = 0;
  let emitCounter = 0;
  const push = (item: PendingItem) => {
    queue.push({ ...item, seq });
    seq += 1;
  };

  for (const node of topo.nodes) {
    if (node.kind !== "sensor") continue;
    const interval = node.params.interval ?? 0;
    if (interval <= 0) continue;
    for (let t = interval; t < testCase.horizon; t += interval) {
      push({ at: t, t: "stim", node: node.id, kind: "reading", payload: Number.NaN });
    }
  }
  const script: ScriptEvent[] = [...(testCase.script ?? [])].sort((a, b) => a.at - b.at);
  for (const ev of script) {
    if (ev.op === "emit")
      push({ at: ev.at, t: "stim", node: ev.node, kind: ev.kind, payload: ev.payload ?? 0 });
    else
      push({
        at: ev.at,
        t: "fault",
        op: ev.op,
        node: ev.node,
        port: "port" in ev ? ev.port : null,
      });
  }

  const pop = (): QueueItem | undefined => {
    let best = 0;
    for (let i = 1; i < queue.length; i += 1) {
      const a = queue[i];
      const b = queue[best];
      if (a.at < b.at || (a.at === b.at && a.seq < b.seq)) best = i;
    }
    return queue.splice(best, 1)[0];
  };

  const trace: TraceRow[] = [];
  const dropped: DroppedEvent[] = [];
  let step = 0;

  const nextId = () => `e${(emitCounter += 1)}`;

  const dropEvent = (
    item: Extract<QueueItem, { t: "deliver" }>,
    cause: DropCause,
    tick: number,
  ) => {
    dropped.push({
      step,
      tick,
      eventId: item.event.id,
      kind: item.event.kind,
      payload: item.event.payload,
      from: item.event.path[item.event.path.length - 1] ?? "script",
      to: item.node,
      port: item.port,
      cause,
    });
  };

  const fanOut = (nodeId: string, event: Inflight, at: number) => {
    const emits: TraceEmit[] = [];
    for (const link of topo.links) {
      if (link.from !== nodeId) continue;
      push({ at: at + LINK_TICK, t: "deliver", event, node: link.to, port: link.port });
      emits.push({ to: link.to, port: link.port, at: at + LINK_TICK });
    }
    return emits;
  };

  const process = (dev: DevState, event: Inflight, port: string, at: number): ProcessResult => {
    const p = dev.def.params;
    switch (dev.def.kind) {
      case "gateway": {
        const dropRate = p.dropRate ?? 0;
        if (dropRate > 0 && rng() < dropRate) {
          dev.dropped += 1;
          return { emits: [], note: `丢包 (丢包率 ${dropRate})` };
        }
        dev.forwarded += 1;
        return { emits: [{ kind: event.kind, payload: event.payload, at: at + (p.delay ?? 0) }] };
      }
      case "db": {
        if (port === "write") {
          if (dev.storedIds.has(event.id)) {
            return { emits: [], note: "重复事件已忽略" };
          }
          dev.storedIds.add(event.id);
          dev.stored.push(event.payload);
          dev.results += 1;
          return { emits: [{ kind: "result", payload: dev.stored.length, at }] };
        }
        if (port === "query") {
          const n = dev.stored.filter((v) => v === event.payload).length;
          dev.results += 1;
          return { emits: [{ kind: "result", payload: n, at }] };
        }
        const idx = dev.stored.indexOf(event.payload);
        if (idx < 0) {
          dev.results += 1;
          return {
            emits: [{ kind: "result", payload: dev.stored.length, at }],
            note: "没有匹配的记录",
          };
        }
        dev.stored.splice(idx, 1);
        dev.results += 1;
        return {
          emits: [{ kind: "result", payload: dev.stored.length, at }],
          note: "删除一条记录",
        };
      }
      case "actuator": {
        const threshold = p.threshold ?? 0;
        if (event.payload >= threshold && !dev.active) {
          dev.active = true;
          dev.fired += 1;
          return {
            emits: [{ kind: "action", payload: event.payload, at }],
            note: `达到阈值 ${threshold}，动作`,
          };
        }
        if (event.payload < threshold && dev.active) {
          dev.active = false;
          return { emits: [{ kind: "clear", payload: event.payload, at }], note: "回落到阈值以下" };
        }
        return { emits: [], note: event.payload >= threshold ? "仍在阈值之上" : "未达到阈值" };
      }
      case "dashboard": {
        dev.seen += 1;
        dev.last = event.payload;
        dev.feed.push(event.payload);
        if (dev.feed.length > 8) dev.feed.shift();
        return { emits: [] };
      }
      case "human": {
        if (port === "$due") {
          const next = dev.queue.shift();
          if (!next) return { emits: [] };
          const result: ProcessResult = {
            emits: [{ kind: next.kind, payload: next.payload, at, carry: next }],
            note: `核准 #${next.id}`,
          };
          if (dev.queue.length > 0) result.selfAt = at + (dev.def.params.workDelay ?? 1);
          return result;
        }
        if (dev.pendingIds.has(event.id)) {
          return { emits: [], note: "重复事件已忽略" };
        }
        dev.pendingIds.add(event.id);
        dev.queue.push(event);
        dev.received += 1;
        if (dev.queue.length === 1) {
          return { emits: [], selfAt: at + (p.workDelay ?? 1), note: "排队等待人工处理" };
        }
        return { emits: [], note: "排队等待人工处理" };
      }
      default:
        return { emits: [] };
    }
  };

  let item: QueueItem | undefined;
  while ((item = pop()) !== undefined) {
    const at = item.at;
    const currentStep = step;
    step += 1;
    if (at >= testCase.horizon) {
      if (item.t === "deliver" && item.port !== "$due") {
        dropEvent({ ...item, seq: item.seq }, "timeout", at);
      } else if (item.t === "deliver") {
        dropped.push({
          step: currentStep,
          tick: at,
          eventId: item.event.id,
          kind: item.event.kind,
          payload: item.event.payload,
          from: item.event.path[item.event.path.length - 1] ?? "script",
          to: item.node,
          port: item.port,
          cause: "timeout",
        });
      }
      if (step >= maxEvents) break;
      continue;
    }

    if (item.t === "fault") {
      if (item.op === "link-down" || item.op === "link-up") {
        const key = `${item.node}|${item.port}`;
        if (item.op === "link-down") downPorts.add(key);
        else downPorts.delete(key);
      } else {
        const dev = devices.get(item.node);
        if (dev) dev.up = item.op === "device-up";
      }
      const dev = devices.get(item.node);
      trace.push({
        step: currentStep,
        tick: at,
        node: item.node,
        port: item.port ?? "",
        kind: "fault",
        payload: 0,
        from: "script",
        eventId: "",
        path: [],
        emits: [],
        note: item.op,
        after: dev ? viewOf(dev) : undefined,
      });
      if (step >= maxEvents) break;
      continue;
    }

    if (item.t === "stim") {
      const dev = devices.get(item.node);
      if (!dev || dev.def.kind !== "sensor") {
        dropped.push({
          step: currentStep,
          tick: at,
          eventId: "",
          kind: item.kind,
          payload: item.payload,
          from: "script",
          to: item.node,
          port: "emit",
          cause: "no-emit",
        });
        if (step >= maxEvents) break;
        continue;
      }
      if (!dev.up) {
        dropped.push({
          step: currentStep,
          tick: at,
          eventId: "",
          kind: item.kind,
          payload: item.payload,
          from: "script",
          to: item.node,
          port: "emit",
          cause: "device-down",
        });
        if (step >= maxEvents) break;
        continue;
      }
      const base = dev.def.params.base ?? 0;
      const noise = dev.def.params.noise ?? 0;
      const payload = Number.isNaN(item.payload)
        ? Math.round(base + (rng() * 2 - 1) * noise)
        : item.payload;
      const event: Inflight = {
        id: nextId(),
        kind: item.kind,
        payload,
        path: [item.node],
        born: at,
      };
      dev.emitted += 1;
      const emits = fanOut(item.node, event, at);
      trace.push({
        step: currentStep,
        tick: at,
        node: item.node,
        port: "emit",
        kind: item.kind,
        payload,
        from: "script",
        eventId: event.id,
        path: [item.node],
        emits,
        after: viewOf(dev),
      });
      if (step >= maxEvents) break;
      continue;
    }

    const dev = devices.get(item.node);
    if (!dev) continue;
    const event = item.event;
    const isDue = item.port === "$due";
    if (!isDue && event.path.includes(item.node)) {
      dropEvent(item, "loop", at);
      if (step >= maxEvents) break;
      continue;
    }
    if (!dev.up) {
      dropEvent(item, "device-down", at);
      if (step >= maxEvents) break;
      continue;
    }
    if (!isDue && downPorts.has(`${item.node}|${item.port}`)) {
      dropEvent(item, "link-down", at);
      if (step >= maxEvents) break;
      continue;
    }

    const path = isDue ? event.path : [...event.path, item.node];
    const result = process(dev, event, item.port, at);
    const emits: TraceEmit[] = [];
    for (const e of result.emits) {
      const carried: Inflight = e.carry ?? {
        id: event.id,
        kind: e.kind,
        payload: e.payload,
        path,
        born: event.born,
      };
      if (e.carry) carried.path = [...e.carry.path, item.node];
      for (const link of topo.links) {
        if (link.from !== item.node) continue;
        push({
          at: e.at + LINK_TICK,
          t: "deliver",
          event: carried,
          node: link.to,
          port: link.port,
        });
        emits.push({ to: link.to, port: link.port, at: e.at + LINK_TICK });
      }
    }
    if (result.selfAt !== undefined) {
      const queued = dev.queue[0];
      if (queued) {
        push({
          at: result.selfAt,
          t: "deliver",
          event: {
            id: `due-${event.id}`,
            kind: "tick",
            payload: queued.payload,
            path: [item.node],
            born: at,
          },
          node: item.node,
          port: "$due",
        });
      }
    }
    trace.push({
      step: currentStep,
      tick: at,
      node: item.node,
      port: item.port,
      kind: event.kind,
      payload: event.payload,
      from: event.path[event.path.length - 1] ?? "script",
      eventId: event.id,
      path,
      emits,
      note: result.note,
      after: viewOf(dev),
    });
    if (step >= maxEvents) break;
  }

  const deviceViews: Record<string, DeviceView> = {};
  const initialViews: Record<string, DeviceView> = {};
  for (const [id, dev] of devices) {
    deviceViews[id] = viewOf(dev);
    // initial = the device as it stood before any event (faults aside).
    initialViews[id] = {
      ...deviceViews[id],
      emitted: 0,
      forwarded: 0,
      dropped: 0,
      stored: [...(testCase.init?.dbRecords?.[id] ?? [])],
      results: 0,
      seen: 0,
      feed: [],
      last: null,
      active: false,
      fired: 0,
      received: 0,
      pending: 0,
      up: !(testCase.init?.down ?? []).includes(id),
    };
  }

  return {
    // Draining the last item exactly on the maxEvents step is still a
    // completed run; only a non-empty queue at the cap means the budget
    // genuinely ran out.
    reason: step >= maxEvents && queue.length > 0 ? "budget" : "done",
    horizon: testCase.horizon,
    trace,
    dropped,
    initialDevices: initialViews,
    devices: deviceViews,
    eventsUsed: step,
  };
}
