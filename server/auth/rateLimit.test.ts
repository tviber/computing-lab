import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlidingWindowLimiter } from "./rateLimit.ts";

describe("SlidingWindowLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-28T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks a key once hits reach max within the window and recovers after expiry", () => {
    const limiter = new SlidingWindowLimiter(3, 60_000);

    expect(limiter.exceeded("ip|alice")).toBe(false);
    expect(limiter.size).toBe(0);

    limiter.hit("ip|alice");
    limiter.hit("ip|alice");
    expect(limiter.exceeded("ip|alice")).toBe(false);
    expect(limiter.size).toBe(1);

    limiter.hit("ip|alice");
    expect(limiter.exceeded("ip|alice")).toBe(true);

    vi.advanceTimersByTime(60_001);
    expect(limiter.exceeded("ip|alice")).toBe(false);
    expect(limiter.size).toBe(0);
  });

  it("clears tracked state immediately on reset", () => {
    const limiter = new SlidingWindowLimiter(2, 60_000);
    limiter.hit("ip|bob");
    limiter.hit("ip|bob");
    expect(limiter.exceeded("ip|bob")).toBe(true);

    limiter.reset("ip|bob");
    expect(limiter.exceeded("ip|bob")).toBe(false);
    expect(limiter.size).toBe(0);
  });

  it("does not retain unseen keys checked via exceeded()", () => {
    const limiter = new SlidingWindowLimiter(5, 60_000);
    for (let i = 0; i < 200; i += 1) {
      expect(limiter.exceeded(`10.0.0.1|missing-${i}`)).toBe(false);
    }
    expect(limiter.size).toBe(0);
  });

  it("evicts large batches of one-off keys once their window expires", () => {
    const limiter = new SlidingWindowLimiter(5, 60_000);
    for (let i = 0; i < 500; i += 1) {
      limiter.hit(`10.0.0.1|oneoff-${i}`);
    }
    expect(limiter.size).toBe(500);

    vi.advanceTimersByTime(60_001);
    expect(limiter.exceeded("10.0.0.1|probe")).toBe(false);
    expect(limiter.size).toBe(0);
  });
});
