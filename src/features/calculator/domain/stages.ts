import type { GateKind } from "./graph.ts";

export type ImplicitSign =
  | { kind: "zero" }
  | { kind: "nonzero"; pins: string[] }
  | { kind: "lt"; left: string[]; right: string[] };

export type BusDef = {
  name: string;
  pins: string[];
  role: "input" | "output";
  signed: boolean;
  implicitSign?: ImplicitSign;
};

export type StageTrack = "core" | "challenge";

export type StageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  description: string;
  track: StageTrack;
  railAfter?: number;
  unlockAfter?: number[];
  buses: BusDef[];
  inputs: string[];
  outputs: string[];
  primitives: GateKind[];
  extraPrimitives?: GateKind[];
  constants?: boolean;
  details?: string;
  unlocks: string | null;
  hint: string;
  takeaway: string;
};

const ALL_GATES: GateKind[] = ["and", "or", "xor", "not", "nand", "nor", "buffer"];

const nib = (prefix: string) => [`${prefix}0`, `${prefix}1`, `${prefix}2`, `${prefix}3`];
const byte = (prefix: string) => [
  `${prefix}0`,
  `${prefix}1`,
  `${prefix}2`,
  `${prefix}3`,
  `${prefix}4`,
  `${prefix}5`,
  `${prefix}6`,
  `${prefix}7`,
];

const busNib = (prefix: string) => [...nib(prefix)].reverse();
const busByte = (prefix: string) => [...byte(prefix)].reverse();

export const CALCULATOR_STAGES: StageDef[] = [
  {
    index: 1,
    id: "wire",
    title: "连接导线",
    englishTitle: "First Wire",
    description: "用一根导线把输入 A 连到输出 Y：接好后，Y 会实时跟着 A 变。",
    track: "core",
    buses: [],
    inputs: ["A"],
    outputs: ["Y"],
    primitives: [],
    unlocks: null,
    hint: "点击 A 右边的输出圆点，再点击 Y 左边的输入圆点。",
    takeaway: "一根导线 = 实时信号传递，数据通路的基本单元。",
  },
  {
    index: 2,
    id: "half-adder",
    title: "半加器",
    englishTitle: "Half Adder",
    description: "用逻辑门实现 1 位加法：输入 A 和 B，输出和位 Sum 与进位 Carry。",
    track: "core",
    buses: [{ name: "结果（2 位）", pins: ["Carry", "Sum"], role: "output", signed: false }],
    inputs: ["A", "B"],
    outputs: ["Sum", "Carry"],
    primitives: ["xor", "and"],
    extraPrimitives: ["or", "not", "nand", "nor", "buffer"],
    unlocks: "HalfAdder",
    hint: "Sum 只在两个输入不同时为 1；Carry 只在都为 1 时为 1。",
    takeaway: "半加器 = XOR 算和 + AND 算进位，1 位加法的最小电路。",
  },
  {
    index: 3,
    id: "full-adder",
    title: "全加器",
    englishTitle: "Full Adder",
    description: "加入进位输入 Cin：三个 1 位相加，输出 Sum 与 Cout。",
    track: "core",
    buses: [{ name: "结果（2 位）", pins: ["Cout", "Sum"], role: "output", signed: false }],
    inputs: ["A", "B", "Cin"],
    outputs: ["Sum", "Cout"],
    primitives: ALL_GATES,
    unlocks: "FullAdder",
    hint: "可以用两个 HalfAdder 级联：先加 A+B，再加 Cin；两次进位取或。",
    takeaway: "全加器 = 两个半加器 + 一个或门（合并两次进位），三个 1 位数相加的完整部件。",
  },
  {
    index: 4,
    id: "add4",
    title: "4 位加法器",
    englishTitle: "4-bit Addition",
    description: "把四个全加器串成进位链，计算 A + B（4 位无符号）。",
    track: "core",
    buses: [
      { name: "A", pins: busNib("A"), role: "input", signed: false },
      { name: "B", pins: busNib("B"), role: "input", signed: false },
      {
        name: "真实和（5 位）",
        pins: ["Cout", ...busNib("S")],
        role: "output",
        signed: false,
      },
      {
        name: "存进 4 位字的结果",
        pins: busNib("S"),
        role: "output",
        signed: false,
      },
    ],
    inputs: [...nib("A"), ...nib("B")],
    outputs: [...nib("S"), "Cout"],
    primitives: ALL_GATES,
    constants: true,
    unlocks: "Add4",
    hint: "第 0 位的 Cin 接常量 0；进位像波浪一样从低位传到高位。",
    takeaway: "进位链 = 低位的 Cout 流向高位的 Cin，多位加法就是全加器的串联。",
  },
  {
    index: 5,
    id: "negate4",
    title: "求补码",
    englishTitle: "Negation",
    description:
      "让电路算出 −A，只需输出低 4 位 R3～R0。先观察几个例子：3 → −3（R = 1101）、5 → −5（R = 1011）。二进制补码里，「逐位取反再加 1」就能得到 −A。",
    details:
      "把 A 看作一个 5 位二进制补码正数的低 4 位（1≤A≤15；A=0 仅作为零的边界用例）：最高位是符号位，恒为 0，不出现在引脚上。求 −A 的 5 位补码：−15≤−A≤0，在 5 位补码范围（−16～15）内不会溢出，其符号位恒为 1（A=0 时结果为全 0），已由题意确定，不需要用电路实现。对 A 按位取反再加 1，计算固定在 4 位内，超出第 4 位的进位不保留。",
    track: "core",
    buses: [
      {
        name: "A",
        pins: busNib("A"),
        role: "input",
        signed: false,
        implicitSign: { kind: "zero" },
      },
      {
        name: "R",
        pins: busNib("R"),
        role: "output",
        signed: true,
        implicitSign: { kind: "nonzero", pins: busNib("A") },
      },
    ],
    inputs: nib("A"),
    outputs: nib("R"),
    primitives: ALL_GATES,
    constants: true,
    unlocks: "Neg4",
    hint: "NOT 每个输入位，然后把结果当作加数送进 Add4，另一个加数是常量 1。",
    takeaway: "补码 = 逐位取反再加 1，负数在二进制里的编码方式。",
  },
  {
    index: 6,
    id: "sub4",
    title: "4 位减法器",
    englishTitle: "Subtraction",
    description:
      "计算 A − B，输出低 4 位 R3～R0。减法就是加上补码：先用 Neg4 求 −B，再用 Add4 相加，超出第 4 位的进位不保留。",
    details:
      "把 A、B 看作两个 5 位二进制补码正数的低 4 位（0≤A,B≤15）：最高位是符号位，恒为 0，不出现在引脚上。计算 A − B 的 5 位补码：−15≤A−B≤15，在 5 位补码范围（−16～15）内不会溢出；符号位为 1 当且仅当 A < B，由输入决定，不需要用电路实现。",
    track: "core",
    buses: [
      {
        name: "A",
        pins: busNib("A"),
        role: "input",
        signed: false,
        implicitSign: { kind: "zero" },
      },
      {
        name: "B",
        pins: busNib("B"),
        role: "input",
        signed: false,
        implicitSign: { kind: "zero" },
      },
      {
        name: "R",
        pins: busNib("R"),
        role: "output",
        signed: true,
        implicitSign: { kind: "lt", left: busNib("A"), right: busNib("B") },
      },
    ],
    inputs: [...nib("A"), ...nib("B")],
    outputs: nib("R"),
    primitives: ALL_GATES,
    constants: true,
    unlocks: "Sub4",
    hint: "Neg4 求出 −B，再用 Add4 相加。减法就是加上补码。",
    takeaway: "减法 = 加上补码，用已有的加法器合成新运算。",
  },
  {
    index: 7,
    id: "mul4",
    title: "4 位乘法器",
    englishTitle: "Multiplication",
    description:
      "计算 A × B，输出 8 位乘积 P。例如可把 A0～A3 分别与同一个 Bi 做 AND，框选后封装成一组部分积组件，再反复使用。",
    track: "challenge",
    buses: [
      { name: "A", pins: busNib("A"), role: "input", signed: false },
      { name: "B", pins: busNib("B"), role: "input", signed: false },
      { name: "P（8 位）", pins: busByte("P"), role: "output", signed: false },
    ],
    inputs: [...nib("A"), ...nib("B")],
    outputs: byte("P"),
    primitives: ALL_GATES,
    constants: true,
    unlocks: "Mul4",
    hint: "每个 B 位与 A 做 AND 得到部分积，左移后用 FullAdder 逐位累加；Add4 没有进位输入，不能直接级联。",
    takeaway: "乘法 = 部分积累加，用更简单的门电路搭出复杂运算。",
  },
  {
    index: 8,
    id: "calculator",
    title: "完整计算器",
    englishTitle: "Final Calculator",
    description: "用 Op1、Op0 选择运算：00 加、01 减、10 乘（低 4 位）、11 按位异或。",
    track: "challenge",
    buses: [
      { name: "A", pins: busNib("A"), role: "input", signed: false },
      { name: "B", pins: busNib("B"), role: "input", signed: false },
      { name: "R", pins: busNib("R"), role: "output", signed: false },
    ],
    inputs: [...nib("A"), ...nib("B"), "Op0", "Op1"],
    outputs: nib("R"),
    primitives: ALL_GATES,
    constants: true,
    unlocks: null,
    hint: "算出全部结果，再用 Op 位做选择器（MUX）逐位挑选输出。",
    takeaway: "多功能 ALU = 把四种运算并排放，用控制信号选一个输出——一片芯片，多种功能。",
  },
  {
    index: 9,
    id: "second-tick",
    title: "只有一行亮",
    englishTitle: "One Exact Case",
    description:
      "四种输入里，只有 A=0、B=1 时 Y=1；其他三种组合都为 0。把这个条件拆成可以逐段检查的小块。",
    track: "challenge",
    railAfter: 1,
    unlockAfter: [1],
    buses: [],
    inputs: ["A", "B"],
    outputs: ["Y"],
    primitives: ["not", "and"],
    unlocks: null,
    hint: "先让 A 变成“不是 A”，再让两个条件同时成立。",
    takeaway: "组合逻辑 = 把条件拆成可逐段检查的小块，用 NOT + AND 合成。",
  },
  {
    index: 10,
    id: "odd3",
    title: "三个输入的奇偶",
    englishTitle: "Odd Signals",
    description:
      "当 A、B、C 中有奇数个 1 时输出 Y=1，有偶数个 1 时输出 Y=0。这个行为会在全加器的和位再次出现。",
    track: "challenge",
    railAfter: 2,
    unlockAfter: [2],
    buses: [],
    inputs: ["A", "B", "C"],
    outputs: ["Y"],
    primitives: ["xor"],
    unlocks: null,
    hint: "先对 A、B 做 XOR，再把中间结果和 C 做 XOR。",
    takeaway: "奇偶判断 = XOR 的级联，全加器的和位也是这个逻辑。",
  },
  {
    index: 11,
    id: "majority3",
    title: "至少两个为 1",
    englishTitle: "Double Trouble",
    description:
      "当 A、B、C 中至少两个为 1 时输出 Y=1。先找出所有能让结果为 1 的成对条件，再把它们合起来。",
    track: "challenge",
    railAfter: 2,
    unlockAfter: [2],
    buses: [],
    inputs: ["A", "B", "C"],
    outputs: ["Y"],
    primitives: ["and", "or"],
    unlocks: null,
    hint: "分别判断 A&B、A&C、B&C，三个条件只要有一个成立就输出 1。",
    takeaway: "多数决 = 把成对的 AND 用 OR 合起来——它恰好就是全加器的进位输出。",
  },
];

export function getStage(index: number): StageDef | undefined {
  return CALCULATOR_STAGES.find((s) => s.index === index);
}

export function coreStages(): StageDef[] {
  return CALCULATOR_STAGES.filter((s) => s.track === "core");
}

export function challengeStages(): StageDef[] {
  return CALCULATOR_STAGES.filter((s) => s.track === "challenge");
}

export function stagePrerequisites(stage: StageDef): number[] {
  if (stage.track === "core") return [];
  return stage.unlockAfter ?? coreStages().map((core) => core.index);
}

export function calculatorStageAffectedByReset(fromStage: number, stageIndex: number): boolean {
  if (fromStage === stageIndex) return true;
  if (getStage(fromStage)?.track !== "core") return false;
  const stage = getStage(stageIndex);
  return stage?.track === "core"
    ? stageIndex >= fromStage
    : stage !== undefined && stagePrerequisites(stage).some((index) => index >= fromStage);
}

export function nextMainlineStage(passedStages: readonly number[]): number {
  const highestPassedCore = coreStages().reduce(
    (highest, stage) => (passedStages.includes(stage.index) ? stage.index : highest),
    0,
  );
  return Math.min(highestPassedCore + 1, coreStages().length + 1);
}
