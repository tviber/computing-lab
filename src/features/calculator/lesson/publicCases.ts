/**
 * Public debug cases. These run in the browser so a student can iterate
 * quickly; they are deliberately small and representative. Passing them is
 * necessary but not sufficient — Submit runs the hidden vectors server-side.
 */

import { intToPins } from "../domain/evaluate";
import type { JudgeCase } from "../domain/evaluate";
import type { Bit } from "../domain/graph";

const nib = (prefix: string, value: number): Record<string, Bit> =>
  intToPins(prefix, value & 0xf, 4);
const byte = (prefix: string, value: number): Record<string, Bit> =>
  intToPins(prefix, value & 0xff, 8);

const threeInputCases = (
  outputFor: (a: Bit, b: Bit, c: Bit) => Bit,
  category = "truth-table",
): JudgeCase[] => {
  const cases: JudgeCase[] = [];
  for (const a of [0, 1] as const)
    for (const b of [0, 1] as const)
      for (const c of [0, 1] as const) {
        cases.push({
          name: `${a}${b}${c}`,
          category,
          inputs: { A: a, B: b, C: c },
          outputs: { Y: outputFor(a, b, c) },
        });
      }
  return cases;
};

const CASES: Record<number, JudgeCase[]> = {
  1: [
    { name: "A = 0", category: "basic", inputs: { A: 0 }, outputs: { Y: 0 } },
    { name: "A = 1", category: "basic", inputs: { A: 1 }, outputs: { Y: 1 } },
  ],
  2: [
    { name: "0 + 0", category: "basic", inputs: { A: 0, B: 0 }, outputs: { Sum: 0, Carry: 0 } },
    { name: "0 + 1", category: "basic", inputs: { A: 0, B: 1 }, outputs: { Sum: 1, Carry: 0 } },
    { name: "1 + 0", category: "basic", inputs: { A: 1, B: 0 }, outputs: { Sum: 1, Carry: 0 } },
    { name: "1 + 1", category: "carry", inputs: { A: 1, B: 1 }, outputs: { Sum: 0, Carry: 1 } },
  ],
  3: [
    {
      name: "0+0, Cin=0",
      category: "basic",
      inputs: { A: 0, B: 0, Cin: 0 },
      outputs: { Sum: 0, Cout: 0 },
    },
    {
      name: "1+0, Cin=1",
      category: "carry-in",
      inputs: { A: 1, B: 0, Cin: 1 },
      outputs: { Sum: 0, Cout: 1 },
    },
    {
      name: "1+1, Cin=0",
      category: "carry",
      inputs: { A: 1, B: 1, Cin: 0 },
      outputs: { Sum: 0, Cout: 1 },
    },
    {
      name: "1+1, Cin=1",
      category: "carry",
      inputs: { A: 1, B: 1, Cin: 1 },
      outputs: { Sum: 1, Cout: 1 },
    },
  ],
  4: [
    {
      name: "0 + 0",
      category: "zero",
      inputs: { ...nib("A", 0), ...nib("B", 0) },
      outputs: { ...nib("S", 0), Cout: 0 },
    },
    {
      name: "3 + 4 = 7",
      category: "basic",
      inputs: { ...nib("A", 3), ...nib("B", 4) },
      outputs: { ...nib("S", 7), Cout: 0 },
    },
    {
      name: "7 + 1 = 8（进位链）",
      category: "carry-chain",
      inputs: { ...nib("A", 7), ...nib("B", 1) },
      outputs: { ...nib("S", 8), Cout: 0 },
    },
    {
      name: "15 + 1 → 0 溢出",
      category: "overflow",
      inputs: { ...nib("A", 15), ...nib("B", 1) },
      outputs: { ...nib("S", 0), Cout: 1 },
    },
  ],
  5: [
    { name: "-0 = 0", category: "zero", inputs: nib("A", 0), outputs: nib("R", 0) },
    { name: "-1 = 1111", category: "basic", inputs: nib("A", 1), outputs: nib("R", 15) },
    { name: "-5 = 1011", category: "basic", inputs: nib("A", 5), outputs: nib("R", 11) },
    { name: "-8 = 1000", category: "sign-boundary", inputs: nib("A", 8), outputs: nib("R", 8) },
  ],
  6: [
    {
      name: "5 - 3 = 2",
      category: "basic",
      inputs: { ...nib("A", 5), ...nib("B", 3) },
      outputs: nib("R", 2),
    },
    {
      name: "9 - 9 = 0",
      category: "zero",
      inputs: { ...nib("A", 9), ...nib("B", 9) },
      outputs: nib("R", 0),
    },
    {
      name: "0 - 1 → 1111",
      category: "borrow",
      inputs: { ...nib("A", 0), ...nib("B", 1) },
      outputs: nib("R", 15),
    },
    {
      name: "3 - 7 → 1100",
      category: "borrow",
      inputs: { ...nib("A", 3), ...nib("B", 7) },
      outputs: nib("R", 12),
    },
  ],
  7: [
    {
      name: "0 × 9 = 0",
      category: "zero",
      inputs: { ...nib("A", 0), ...nib("B", 9) },
      outputs: byte("P", 0),
    },
    {
      name: "1 × 7 = 7",
      category: "identity",
      inputs: { ...nib("A", 1), ...nib("B", 7) },
      outputs: byte("P", 7),
    },
    {
      name: "3 × 5 = 15",
      category: "basic",
      inputs: { ...nib("A", 3), ...nib("B", 5) },
      outputs: byte("P", 15),
    },
    {
      name: "15 × 15 = 225",
      category: "max",
      inputs: { ...nib("A", 15), ...nib("B", 15) },
      outputs: byte("P", 225),
    },
  ],
  8: [
    {
      name: "加：3 + 4 = 7",
      category: "op-add",
      inputs: { ...nib("A", 3), ...nib("B", 4), Op1: 0, Op0: 0 },
      outputs: nib("R", 7),
    },
    {
      name: "减：5 - 3 = 2",
      category: "op-sub",
      inputs: { ...nib("A", 5), ...nib("B", 3), Op1: 0, Op0: 1 },
      outputs: nib("R", 2),
    },
    {
      name: "减：3 - 5 → 1110",
      category: "op-sub",
      inputs: { ...nib("A", 3), ...nib("B", 5), Op1: 0, Op0: 1 },
      outputs: nib("R", 14),
    },
    {
      name: "乘：3 × 5 → 1111",
      category: "op-mul",
      inputs: { ...nib("A", 3), ...nib("B", 5), Op1: 1, Op0: 0 },
      outputs: nib("R", 15),
    },
    {
      name: "异或：1010 ^ 0110",
      category: "op-xor",
      inputs: { ...nib("A", 0b1010), ...nib("B", 0b0110), Op1: 1, Op0: 1 },
      outputs: nib("R", 0b1100),
    },
  ],
  9: [
    { name: "00", category: "truth-table", inputs: { A: 0, B: 0 }, outputs: { Y: 0 } },
    { name: "01", category: "target-row", inputs: { A: 0, B: 1 }, outputs: { Y: 1 } },
    { name: "10", category: "truth-table", inputs: { A: 1, B: 0 }, outputs: { Y: 0 } },
    { name: "11", category: "truth-table", inputs: { A: 1, B: 1 }, outputs: { Y: 0 } },
  ],
  10: threeInputCases((a, b, c) => ((a + b + c) % 2) as Bit),
  11: threeInputCases((a, b, c) => (a + b + c >= 2 ? 1 : 0)),
};

export function publicCasesFor(stageIndex: number): JudgeCase[] {
  return CASES[stageIndex] ?? [];
}
