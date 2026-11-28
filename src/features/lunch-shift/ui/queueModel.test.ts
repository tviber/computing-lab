import { describe, expect, it } from "vitest";
import type { OrderResult, RunSummary } from "../domain/contracts.ts";
import {
  probePassCount,
  probeRowsFromTable,
  replayCaption,
  replayFrames,
  starvedByUrgent,
  waitLimit,
} from "./queueModel";

describe("queue panel model", () => {
  it("uses the lesson wait limits for urgent and normal orders", () => {
    expect(waitLimit({ urgent: true } as OrderResult)).toBe(9);
    expect(waitLimit({ expected: { urgent: true } } as OrderResult)).toBe(9);
    expect(waitLimit({ urgent: false } as OrderResult)).toBe(18);
  });

  it("builds one probe row per grading snapshot", () => {
    const rows = probeRowsFromTable(new Array(124).fill(0));
    expect(rows).toHaveLength(12);
    expect(rows.every((row) => typeof row.picked === "number")).toBe(true);
    expect(probePassCount(rows)).toBe(rows.filter((row) => row.passed).length);
  });

  it("groups replay events by tick and summarizes a frame", () => {
    const frames = replayFrames([
      { tick: 2, action: "send", orderId: "A" },
      { tick: 1, action: "arrive", orderId: "B" },
      { tick: 2, action: "cook", orderId: "C" },
      { tick: 2, action: "ready", orderId: "D" },
    ] as never);
    expect(frames.map((frame) => frame.tick)).toEqual([1, 2]);
    expect(frames[1].events).toHaveLength(3);
    expect(replayCaption(frames[1])).toBe("第 2 拍 · A 送达；C 厨房开始做；另有 1 件事");
    expect(replayCaption(undefined)).toBe("——");
  });

  it("distinguishes queue jumping from normal priority", () => {
    const run = {
      picks: [
        {
          picked: "urgent",
          candidates: [
            { id: "normal", urgent: false, waitTicks: 6 },
            { id: "urgent", urgent: true, waitTicks: 2 },
          ],
        },
        {
          picked: "patient",
          candidates: [
            { id: "patient", urgent: true, waitTicks: 8 },
            { id: "other", urgent: false, waitTicks: 4 },
          ],
        },
      ],
    } as RunSummary;
    expect(starvedByUrgent(run, "normal")).toBe(true);
    expect(starvedByUrgent(run, "other")).toBe(false);
  });
});
