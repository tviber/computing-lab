import { render, screen, within } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import type { CaseResult } from "../domain/evaluate";
import { getStage } from "../domain/stages";
import type { JudgeOutcome } from "../lesson/state";
import { TestPanel } from "./TestPanel";

const stage3 = getStage(4)!; // add4: buses A, B, 真实和（5 位）, 存进 4 位字的结果
const stage5 = getStage(6)!; // sub4: signed R bus
const stage7 = getStage(8)!; // final calculator: R is an unsigned 4-bit word

function passResult(name: string): CaseResult {
  return {
    name,
    category: "basic",
    passed: true,
    inputs: {},
    expected: { S3: 0, S2: 1, S1: 1, S0: 1, Cout: 0 },
    actual: { S3: 0, S2: 1, S1: 1, S0: 1, Cout: 0 },
    error: null,
  };
}

describe("TestPanel", () => {
  it("renders expected and actual as MSB-first bus numbers with decimals", () => {
    const failed: CaseResult = {
      name: "3 + 4 = 7",
      category: "basic",
      passed: false,
      inputs: {},
      expected: { S3: 0, S2: 1, S1: 1, S0: 1, Cout: 0 },
      actual: { S3: 0, S2: 1, S1: 1, S0: 0, Cout: 0 },
      error: null,
    };
    render(() => (
      <TestPanel
        judgeOutcome={null}
        runOutcome={{ results: [passResult("0 + 0"), failed], score: 1, total: 2 }}
        stage={stage3}
      />
    ));

    const row = screen.getByRole("rowheader", { name: "3 + 4 = 7" }).closest("tr")!;
    // 真实和（5 位）= Cout S3..S0: expected 00111 (7), actual 00110 (6).
    const cells = within(row).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("00111（7）");
    expect(cells[1]).toHaveTextContent("0111（7）"); // 存进 4 位字的结果
    expect(cells[2]).toHaveTextContent("00110（6）");
    expect(cells[2]).toHaveTextContent("0110（6）");
    // The single flipped bit is highlighted with <mark>, not just color.
    expect(within(cells[2]).getAllByText("0", { selector: "mark" }).length).toBeGreaterThan(0);
    // The old pin=值 ordering must be gone: no "S0=" text remains.
    expect(row).not.toHaveTextContent(/S0=/);
  });

  it("shows both unsigned and two's-complement readings for a signed bus", () => {
    const result: CaseResult = {
      name: "0 - 1 → 1111",
      category: "borrow",
      passed: true,
      inputs: { A3: 0, A2: 0, A1: 0, A0: 0, B3: 0, B2: 0, B1: 0, B0: 1 },
      expected: { R3: 1, R2: 1, R1: 1, R0: 1 },
      actual: { R3: 1, R2: 1, R1: 1, R0: 1 },
      error: null,
    };
    render(() => (
      <TestPanel
        judgeOutcome={null}
        runOutcome={{ results: [result], score: 1, total: 1 }}
        stage={stage5}
      />
    ));
    const row = screen.getByRole("rowheader", { name: "0 - 1 → 1111" }).closest("tr")!;
    expect(row).toHaveTextContent("1111（15）");
    expect(row).toHaveTextContent("（补码 -1）");
  });

  it("keeps final calculator results as unsigned words", () => {
    const result: CaseResult = {
      name: "乘：3 × 5 → 1111",
      category: "op-mul",
      passed: true,
      inputs: {},
      expected: { R3: 1, R2: 1, R1: 1, R0: 1 },
      actual: { R3: 1, R2: 1, R1: 1, R0: 1 },
      error: null,
    };
    render(() => (
      <TestPanel
        judgeOutcome={null}
        runOutcome={{ results: [result], score: 1, total: 1 }}
        stage={stage7}
      />
    ));

    const row = screen.getByRole("rowheader", { name: "乘：3 × 5 → 1111" }).closest("tr")!;
    expect(row).toHaveTextContent("1111（15）");
    expect(row).not.toHaveTextContent("补码");
  });

  it("shows the judge counterexample with inputs, expected, actual and a sentence", () => {
    const judgeOutcome: NonNullable<JudgeOutcome> = {
      score: 9,
      total: 10,
      passed: false,
      categories: { borrow: { passed: 0, total: 2 } },
      counterexample: {
        name: "0 - 1 → 1111",
        category: "borrow",
        inputs: { A3: 0, A2: 0, A1: 0, A0: 0, B3: 0, B2: 0, B1: 0, B0: 1 },
        expected: { R3: 1, R2: 1, R1: 1, R0: 1 },
        actual: { R3: 0, R2: 1, R1: 1, R0: 0 },
      },
      passedStages: [],
      error: null,
      unlockedComponent: null,
      componentsRevision: null,
      unlockedSubmodules: null,
    };
    render(() => <TestPanel judgeOutcome={judgeOutcome} runOutcome={null} stage={stage5} />);

    const block = screen.getByText("最小反例").closest(".test-counterexample")!;
    expect(block).toHaveTextContent("0 - 1 → 1111");
    // Inputs render through the A/B buses: A=0000, B=0001.
    expect(block).toHaveTextContent("0000（0）");
    expect(block).toHaveTextContent("0001（1）");
    // Expected 1111（15） vs actual 0110（6）, signed 补码 readings included.
    // The implied sign is 1 whenever A < B, so actual 0110 reads as -10.
    expect(block).toHaveTextContent("1111（15）");
    expect(block).toHaveTextContent("（补码 -1）");
    expect(block).toHaveTextContent("0110（6）");
    expect(block).toHaveTextContent("（补码 -10）");
    expect(block).toHaveTextContent("这一组输入下，你的电路给出 0110（6），应为 1111（15）。");
  });

  it("keeps bare pins that no output bus covers", () => {
    const result: CaseResult = {
      name: "异或",
      category: "op-xor",
      passed: false,
      inputs: {},
      expected: { R3: 1, R2: 1, R1: 0, R0: 0, Extra: 1 },
      actual: { R3: 1, R2: 1, R1: 0, R0: 0, Extra: 0 },
      error: null,
    };
    render(() => (
      <TestPanel
        judgeOutcome={null}
        runOutcome={{ results: [result], score: 0, total: 1 }}
        stage={getStage(8)!}
      />
    ));
    const row = screen.getByRole("rowheader", { name: "异或" }).closest("tr")!;
    // R bus renders as a number; the uncovered pin stays as pin=值.
    expect(row).toHaveTextContent("1100（12）");
    expect(row).toHaveTextContent("Extra=1");
    expect(row).toHaveTextContent("Extra=0");
  });
});
