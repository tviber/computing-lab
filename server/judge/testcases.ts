/**
 * Hidden test vectors for the Calculator Lab judge.
 *
 * SERVER-ONLY — never import from src/ client bundles. These deliberately
 * cover zeros, boundary overflow, and carry-chain propagation that public
 * debug cases do not.
 */

import { intToPins, type JudgeCase } from "../../src/features/calculator/domain/evaluate.ts";
import type { Bit } from "../../src/features/calculator/domain/graph.ts";

const nib = (prefix: string, value: number): Record<string, Bit> =>
  intToPins(prefix, value & 0xf, 4);
const byte = (prefix: string, value: number): Record<string, Bit> =>
  intToPins(prefix, value & 0xff, 8);

function bitCase(
  name: string,
  category: string,
  ins: Record<string, Bit>,
  outs: Record<string, Bit>,
): JudgeCase {
  return { name, category, inputs: ins, outputs: outs };
}

function threeInputCases(
  outputFor: (a: Bit, b: Bit, c: Bit) => Bit,
  category = "truth-table",
): JudgeCase[] {
  const cases: JudgeCase[] = [];
  for (const a of [0, 1] as const)
    for (const b of [0, 1] as const)
      for (const c of [0, 1] as const)
        cases.push(
          bitCase(`${a}${b}${c}`, category, { A: a, B: b, C: c }, { Y: outputFor(a, b, c) }),
        );
  return cases;
}

function wireCases(): JudgeCase[] {
  return [
    bitCase("A = 0", "basic", { A: 0 }, { Y: 0 }),
    bitCase("A = 1", "basic", { A: 1 }, { Y: 1 }),
  ];
}

function secondTickCases(): JudgeCase[] {
  return [
    bitCase("00", "truth-table", { A: 0, B: 0 }, { Y: 0 }),
    bitCase("01", "target-row", { A: 0, B: 1 }, { Y: 1 }),
    bitCase("10", "truth-table", { A: 1, B: 0 }, { Y: 0 }),
    bitCase("11", "truth-table", { A: 1, B: 1 }, { Y: 0 }),
  ];
}

function halfAdderCases(): JudgeCase[] {
  const cases: JudgeCase[] = [];
  for (const a of [0, 1] as const)
    for (const b of [0, 1] as const)
      cases.push(
        bitCase(
          `${a}+${b}`,
          "basic",
          { A: a, B: b },
          { Sum: (a ^ b) as Bit, Carry: (a & b) as Bit },
        ),
      );
  return cases;
}

function fullAdderCases(): JudgeCase[] {
  const cases: JudgeCase[] = [];
  for (const a of [0, 1] as const)
    for (const b of [0, 1] as const)
      for (const cin of [0, 1] as const) {
        const total = a + b + cin;
        cases.push(
          bitCase(
            `${a}+${b}+${cin}`,
            cin === 1 ? "carry-in" : "basic",
            { A: a, B: b, Cin: cin },
            { Sum: (total & 1) as Bit, Cout: (total >> 1) as Bit },
          ),
        );
      }
  return cases;
}

function add4(a: number, b: number, name: string, category: string): JudgeCase {
  const sum = a + b;
  return bitCase(
    name,
    category,
    { ...nib("A", a), ...nib("B", b) },
    { ...nib("S", sum), Cout: (sum >> 4) as Bit },
  );
}

function add4Cases(): JudgeCase[] {
  // The whole 4-bit input space is only 16×16 — enumerate it, Cout included.
  const cases: JudgeCase[] = [];
  for (let a = 0; a < 16; a += 1)
    for (let b = 0; b < 16; b += 1) {
      const cat =
        a + b > 15
          ? "overflow"
          : a === 0 || b === 0
            ? "zero"
            : (a & b) !== 0
              ? "carry-chain"
              : "basic";
      cases.push(add4(a, b, `${a}+${b}`, cat));
    }
  return cases;
}

function neg4Cases(): JudgeCase[] {
  const cases: JudgeCase[] = [];
  for (let a = 0; a < 16; a += 1) {
    const r = -a & 0xf;
    const category = a === 0 ? "zero" : a === 8 ? "sign-boundary" : a === 15 ? "max" : "basic";
    cases.push(bitCase(`-${a}`, category, nib("A", a), nib("R", r)));
  }
  return cases;
}

function sub4(a: number, b: number, name: string, category: string): JudgeCase {
  return bitCase(name, category, { ...nib("A", a), ...nib("B", b) }, nib("R", (a - b) & 0xf));
}

function sub4Cases(): JudgeCase[] {
  const cases: JudgeCase[] = [];
  for (let a = 0; a < 16; a += 1)
    for (let b = 0; b < 16; b += 1) {
      const cat =
        a < b
          ? "borrow"
          : a === b || a === 0 || b === 0
            ? "zero"
            : a === 15 || b === 15
              ? "max"
              : "basic";
      cases.push(sub4(a, b, `${a}-${b}`, cat));
    }
  return cases;
}

function mul4(a: number, b: number, name: string, category: string): JudgeCase {
  return bitCase(name, category, { ...nib("A", a), ...nib("B", b) }, byte("P", a * b));
}

function mul4Cases(): JudgeCase[] {
  const cases: JudgeCase[] = [];
  for (let a = 0; a < 16; a += 1)
    for (let b = 0; b < 16; b += 1) {
      const powerShift = (a & (a - 1)) === 0 || (b & (b - 1)) === 0;
      const cat =
        a === 0 || b === 0
          ? "zero"
          : a === 1 || b === 1
            ? "identity"
            : a === 15 && b === 15
              ? "max"
              : powerShift
                ? "power-shift"
                : "basic";
      cases.push(mul4(a, b, `${a}×${b}`, cat));
    }
  return cases;
}

function calc(a: number, b: number, op: number, name: string, category: string): JudgeCase {
  let r: number;
  if (op === 0) r = (a + b) & 0xf;
  else if (op === 1) r = (a - b) & 0xf;
  else if (op === 2) r = (a * b) & 0xf;
  else r = a ^ b;
  return bitCase(
    name,
    category,
    { ...nib("A", a), ...nib("B", b), Op1: ((op >> 1) & 1) as Bit, Op0: (op & 1) as Bit },
    nib("R", r),
  );
}

function calculatorCases(): JudgeCase[] {
  const ops = ["add", "sub", "mul", "xor"] as const;
  // 4 ops × 16 × 16 = 1024 exhaustive (a,b,op) combinations.
  const cases: JudgeCase[] = [];
  for (let op = 0; op < 4; op += 1)
    for (let a = 0; a < 16; a += 1)
      for (let b = 0; b < 16; b += 1)
        cases.push(calc(a, b, op, `${ops[op]} ${a},${b}`, `op-${ops[op]}`));
  return cases;
}

export const HIDDEN_TESTS: Record<number, JudgeCase[]> = {
  1: wireCases(),
  2: halfAdderCases(),
  3: fullAdderCases(),
  4: add4Cases(),
  5: neg4Cases(),
  6: sub4Cases(),
  7: mul4Cases(),
  8: calculatorCases(),
  9: secondTickCases(),
  10: threeInputCases((a, b, c) => ((a + b + c) % 2) as Bit),
  11: threeInputCases((a, b, c) => (a + b + c >= 2 ? 1 : 0)),
};

export function hiddenTestsFor(stageIndex: number): JudgeCase[] {
  return HIDDEN_TESTS[stageIndex] ?? [];
}
