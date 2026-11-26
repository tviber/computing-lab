import { describe, expect, it } from "vitest";
import { runSgdCode, SGD_REFERENCE_CODE } from "./sgdCode.ts";
import { trainLogisticRegression, MAX_SAMPLE_SIZE } from "./logisticRegression.ts";

describe("SGD lesson code interpreter", () => {
  it("matches the reference SGD curve exactly and converges", () => {
    const actual = runSgdCode(SGD_REFERENCE_CODE);
    const expected = trainLogisticRegression({ trainCount: MAX_SAMPLE_SIZE, eta: 0.1, epochs: 20 });
    expect(actual.diagnostics).toEqual([]);
    expect(actual.run?.epochsHistory.map((point) => point.valLoss)).toEqual(
      expected.epochsHistory.map((point) => point.valLoss),
    );
    expect(actual.run?.epochsHistory.at(-1)?.trainLoss).toBeLessThanOrEqual(0.08);
    expect(actual.run?.epochsHistory.at(-1)?.valLoss).toBeLessThanOrEqual(0.12);
  });

  it.each([
    ["+=", "direction"],
    ["-= g", "feature"],
    ["-= (p - yi) * xi[j]", "eta"],
    ["-= eta * (yi - p) * xi[j]", "error-order"],
  ])(
    "diagnoses update %s as %s",
    (update: string, expected: string) => {
      const code =
        update === "+="
          ? "p = predict(xi)\ng = eta * (p - yi)\nfor j in range(n):\n    w[j] += g * xi[j]"
          : `p = predict(xi)\ng = eta * (p - yi)\nfor j in range(n):\n    w[j] ${update}`;
      expect(runSgdCode(code).diagnostics.map(({ code }) => code)).toContain(expected);
    },
    15_000,
  );

  it.each([
    "w[j] = w[j] - eta * (p - yi) * xi[j]",
    "w[j] -= xi[j] * g",
    "w[j] -= eta * (predict(xi) - yi) * xi[j]",
  ])("accepts equivalent update: %s", (update) => {
    const code = `p = predict(xi)\ng = eta * (p - yi)\nfor j in range(n):\n    ${update}`;
    expect(runSgdCode(code).diagnostics).toEqual([]);
  });

  it.each(["import os", "w[j] -= __import__('os').system('whoami')", "w[j] -= predict(xi];"])(
    "rejects unsupported syntax safely: %s",
    (code) => {
      expect(runSgdCode(code).diagnostics[0]?.code).toBe("syntax");
    },
  );
});
