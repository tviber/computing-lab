import { DISHES } from "./contracts";

/** One step is 100 ms. All clocks stop together when the player pauses. */
export const RUSH_DURATION = 300;
export type RushTicket = {
  id: number;
  dish: string;
  arrival: number;
  urgent: boolean;
  cook: number;
  status: "incoming" | "queued" | "cooking" | "ready" | "delivering" | "served" | "lost";
  finish: number | null;
  onTime: boolean;
};
export type RushState = { tick: number; tickets: RushTicket[]; mistakes: number };
export type RushAction =
  | { type: "step" }
  | { type: "intake"; id: number; dish: string }
  | { type: "cook" | "serve"; id: number };

export function createRushState(): RushState {
  return {
    tick: 0,
    mistakes: 0,
    tickets: Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      dish: DISHES[(i * 7 + Math.floor(i / 3)) % DISHES.length],
      arrival: i < 3 ? i * 10 : 25 + (i - 3) * 7,
      urgent: i % 3 === 1,
      cook: i % 3 === 2 ? 24 : 12,
      status: "incoming" as const,
      finish: null,
      onTime: false,
    })),
  };
}
export function rushPatience(ticket: RushTicket, tick: number): number {
  const budget = ticket.urgent ? 60 : 100;
  return Math.max(0, Math.min(1, 1 - (tick - ticket.arrival) / budget));
}
export function advanceRush(state: RushState, action: RushAction): RushState {
  if (state.tick >= RUSH_DURATION) return state;
  if (action.type === "step") {
    const tick = state.tick + 1;
    return {
      ...state,
      tick,
      tickets: state.tickets.map((ticket) => {
        if (ticket.status === "served" || ticket.status === "lost") return ticket;
        if (ticket.status === "delivering" && tick >= (ticket.finish ?? Infinity)) {
          return { ...ticket, status: "served", onTime: rushPatience(ticket, tick) > 0 };
        }
        if (tick >= ticket.arrival && rushPatience(ticket, tick) <= 0) {
          return { ...ticket, status: "lost", finish: null };
        }
        if (ticket.status === "cooking" && tick >= (ticket.finish ?? Infinity)) {
          return { ...ticket, status: "ready", finish: null };
        }
        return ticket;
      }),
    };
  }
  const target = state.tickets.find((ticket) => ticket.id === action.id);
  if (!target || target.arrival > state.tick) return state;
  if (action.type === "intake" && target.status === "incoming") {
    if (action.dish !== target.dish) return { ...state, mistakes: state.mistakes + 1 };
    return {
      ...state,
      tickets: state.tickets.map((t) => (t.id === target.id ? { ...t, status: "queued" } : t)),
    };
  }
  const isCook = action.type === "cook";
  const eligible = isCook ? "queued" : "ready";
  const occupied = isCook ? "cooking" : "delivering";
  if (target.status !== eligible || state.tickets.some((t) => t.status === occupied)) return state;
  return {
    ...state,
    tickets: state.tickets.map((t) =>
      t.id === target.id
        ? { ...t, status: occupied, finish: state.tick + (isCook ? t.cook : 5) }
        : t,
    ),
  };
}

/** A reproducible opponent: take orders immediately, then serve the closest deadline. */
export function autoRushStep(state: RushState): RushState {
  let next = state;
  for (const t of next.tickets) {
    if (t.status === "incoming" && t.arrival <= next.tick) {
      next = advanceRush(next, { type: "intake", id: t.id, dish: t.dish });
    }
  }
  const byDeadline = (status: RushTicket["status"]) =>
    next.tickets
      .filter((t) => t.status === status)
      .sort((a, b) => a.arrival + (a.urgent ? 60 : 100) - b.arrival - (b.urgent ? 60 : 100))[0];
  const cook = byDeadline("queued");
  if (cook) next = advanceRush(next, { type: "cook", id: cook.id });
  const serve = byDeadline("ready");
  if (serve) next = advanceRush(next, { type: "serve", id: serve.id });
  return advanceRush(next, { type: "step" });
}
