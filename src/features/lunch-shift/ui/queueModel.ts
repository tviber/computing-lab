import type { OrderResult, RunSummary, SimulationEvent } from "../domain/contracts.ts";
import { priorityIndex, PRIORITY_TABLE_SIZE } from "../domain/priority.ts";
import { pickProbe, QUEUE_PROBES } from "../domain/queueProbes.ts";

export type ProbeRow = {
  id: string;
  title: string;
  passed: boolean;
  picked: number;
  answer: number;
};

export type ReplayFrame = { tick: number; events: SimulationEvent[] };

export const REPLAY_EVENT_TEXT = {
  arrive: "到达，开始等",
  held: "小票暂缓录入",
  ticket: "小票记好了",
  cook: "厨房开始做",
  ready: "做好了，等送出",
  send: "送达",
} as const;

export function waitLimit(order: OrderResult): number {
  return (order.expected?.urgent ?? order.urgent) ? 9 : 18;
}

export function presetPriorityTable(kind: "fifo" | "urgent"): number[] {
  const table = new Array<number>(PRIORITY_TABLE_SIZE).fill(0);
  if (kind === "fifo") return table;
  for (const urgent of [false, true]) {
    for (let wait = 0; wait <= 30; wait++) {
      for (const cook of [1, 3] as const) {
        table[priorityIndex(urgent, wait, cook)] = urgent ? 1 : 0;
      }
    }
  }
  return table;
}

export function probeRowsFromTable(table: number[]): ProbeRow[] {
  return QUEUE_PROBES.map((probe) => {
    const picked = pickProbe(table, probe);
    return {
      id: probe.id,
      title: probe.title,
      passed: picked === probe.answer,
      picked,
      answer: probe.answer,
    };
  });
}

export function probePassCount(probes: readonly ProbeRow[]): number {
  return probes.filter((row) => row.passed).length;
}

export function lateOrdersOf(run: RunSummary): OrderResult[] {
  return run.orders.filter((order) => !order.onTime);
}

export function starvedByUrgent(run: RunSummary, orderId: string): boolean {
  return (run.picks ?? []).some((pick) => {
    const me = pick.candidates.find((candidate) => candidate.id === orderId);
    const winner = pick.candidates.find((candidate) => candidate.id === pick.picked);
    // Only queue-jumping counts — an urgent order that had already waited
    // longer is just first-come-first-served.
    return me !== undefined && winner?.urgent === true && winner.waitTicks < me.waitTicks;
  });
}

export function replayFrames(events: readonly SimulationEvent[]): ReplayFrame[] {
  const byTick = new Map<number, SimulationEvent[]>();
  for (const event of events) {
    const list = byTick.get(event.tick);
    if (list) list.push(event);
    else byTick.set(event.tick, [event]);
  }
  return [...byTick.entries()]
    .sort(([left], [right]) => left - right)
    .map(([tick, frameEvents]) => ({ tick, events: frameEvents }));
}

export function replayCaption(frame: ReplayFrame | undefined): string {
  if (!frame) return "——";
  const details = frame.events.map(
    (event) => `${event.orderId} ${REPLAY_EVENT_TEXT[event.action]}`,
  );
  const shown = details.slice(0, 2).join("；");
  return `第 ${frame.tick} 拍 · ${shown}${details.length > 2 ? `；另有 ${details.length - 2} 件事` : ""}`;
}
