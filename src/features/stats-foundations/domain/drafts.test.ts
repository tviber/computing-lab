import { describe, expect, it } from "vitest";
import { defaultDraftForStage, sanitizeStatsFoundationsDraft } from "./drafts.ts";

describe("stats foundations drafts", () => {
  it.each([0, 5, 3.5, NaN, Infinity])("rejects unknown stage %s", (stage) => {
    expect(() => sanitizeStatsFoundationsDraft(stage, { w: 1 })).toThrow(RangeError);
    expect(() => defaultDraftForStage(stage)).toThrow(RangeError);
  });

  it("retains the sigmoid bridge draft for stage 4", () => {
    expect(sanitizeStatsFoundationsDraft(4, { curveMode: "sigmoid" })).toEqual({
      ...defaultDraftForStage(4),
      curveMode: "sigmoid",
    });
  });
});
