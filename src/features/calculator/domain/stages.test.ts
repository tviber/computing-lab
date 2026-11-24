import { describe, expect, it } from "vitest";
import { CALCULATOR_STAGES, getStage } from "./stages";

describe("calculator stage pin order", () => {
  it("places numbered pins from low bit to high bit on the canvas", () => {
    expect(getStage(4)?.inputs).toEqual(["A0", "A1", "A2", "A3", "B0", "B1", "B2", "B3"]);
    expect(getStage(4)?.outputs).toEqual(["S0", "S1", "S2", "S3", "Cout"]);
    expect(getStage(7)?.outputs).toEqual(["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7"]);
    expect(getStage(8)?.inputs.slice(-2)).toEqual(["Op0", "Op1"]);
  });

  it("keeps numeric readout buses in high-bit-first order", () => {
    const add4 = getStage(4)!;
    expect(add4.buses[0].pins).toEqual(["A3", "A2", "A1", "A0"]);
    expect(add4.buses[2].pins).toEqual(["Cout", "S3", "S2", "S1", "S0"]);

    for (const stage of CALCULATOR_STAGES.filter((candidate) => candidate.index >= 5)) {
      const operandBus = stage.buses.find((bus) => bus.name === "A");
      if (operandBus) expect(operandBus.pins).toEqual(["A3", "A2", "A1", "A0"]);
    }
  });

  it("keeps optional logic challenges beside, rather than inside, the mainline", () => {
    expect(CALCULATOR_STAGES.map((stage) => stage.index)).toEqual(
      Array.from({ length: 11 }, (_, index) => index + 1),
    );
    expect(getStage(9)?.railAfter).toBe(1);
    expect(getStage(10)?.railAfter).toBe(2);
    expect(getStage(11)?.railAfter).toBe(2);
    expect(getStage(9)?.unlockAfter).toEqual([1]);
    expect(getStage(10)?.unlockAfter).toEqual([2]);
    expect(getStage(11)?.unlockAfter).toEqual([2]);
  });

  it("states the 5-bit signed contract for negation and subtraction", () => {
    expect(getStage(5)?.description).toContain("逐位取反再加 1");
    expect(getStage(5)?.description).toContain("0 表示零或正数，1 表示负数");
    expect(getStage(5)?.details).toContain("5 位二进制补码");
    expect(getStage(5)?.details).toContain("1≤A≤15");
    expect(getStage(5)?.details).toContain("符号位");
    expect(getStage(6)?.description).toContain("Neg4");
    expect(getStage(6)?.details).toContain("5 位二进制补码");
    expect(getStage(6)?.details).toContain("A < B");
  });

  it("has a non-empty takeaway for every stage", () => {
    for (const stage of CALCULATOR_STAGES) {
      expect(stage.takeaway).toBeTruthy();
      expect(stage.takeaway.length).toBeGreaterThan(0);
    }
  });
});
