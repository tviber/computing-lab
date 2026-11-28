import { describe, expect, it } from "vitest";
import { MIGRATION_STEPS, MIN_SUPPORTED_SCHEMA_VERSION, SCHEMA_VERSION } from "./migrations.ts";

describe("migration manifest", () => {
  it("covers every supported upgrade with one ordered step", () => {
    const expectedTargets = Array.from(
      { length: SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION },
      (_, index) => MIN_SUPPORTED_SCHEMA_VERSION + index + 1,
    );

    expect(MIGRATION_STEPS.map((step) => step.targetVersion)).toEqual(expectedTargets);
    expect(MIGRATION_STEPS.every((step) => typeof step.apply === "function")).toBe(true);
  });
});
