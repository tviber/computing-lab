import { describe, expect, it } from "vitest";
import {
  advanceRush,
  autoRushStep,
  createRushState,
  RUSH_DURATION,
  rushPatience,
} from "./rushGame";

describe("manual lunch rush", () => {
  it("requires the right dish and a completed cook before serving", () => {
    let state = createRushState();
    state = advanceRush(state, { type: "intake", id: 1, dish: "不存在的菜" });
    expect(state.mistakes).toBe(1);
    expect(state.tickets[0].status).toBe("incoming");
    state = advanceRush(state, { type: "intake", id: 1, dish: state.tickets[0].dish });
    state = advanceRush(state, { type: "serve", id: 1 });
    expect(state.tickets[0].status).toBe("queued");
    state = advanceRush(state, { type: "cook", id: 1 });
    for (let i = 0; i < 12; i++) state = advanceRush(state, { type: "step" });
    expect(state.tickets[0].status).toBe("ready");
    state = advanceRush(state, { type: "serve", id: 1 });
    for (let i = 0; i < 5; i++) state = advanceRush(state, { type: "step" });
    expect(state.tickets[0]).toMatchObject({ status: "served", onTime: true });
  });
  it("holds station capacity, expires patience and ends the round", () => {
    let state = createRushState();
    for (let i = 0; i < RUSH_DURATION; i++) state = advanceRush(state, { type: "step" });
    expect(state.tickets.every((t) => t.status === "lost" || t.status === "served")).toBe(true);
    expect(advanceRush(state, { type: "step" })).toBe(state);
    expect(rushPatience(state.tickets[0], -1)).toBe(1);
  });
  it("lets automation rescue actual orders without bypassing station capacity", () => {
    let state = createRushState();
    for (let i = 0; i < RUSH_DURATION; i++) {
      state = autoRushStep(state);
      expect(state.tickets.filter((t) => t.status === "cooking").length).toBeLessThanOrEqual(1);
      expect(state.tickets.filter((t) => t.status === "delivering").length).toBeLessThanOrEqual(1);
    }
    expect(state.tickets.filter((t) => t.onTime).length).toBeGreaterThanOrEqual(10);
  });
});
