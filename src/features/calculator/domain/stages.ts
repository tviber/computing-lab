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
    takeaway: "导线把输入直接送到输出，是数据通路的最小单元。",
  },
  {
    index: 2,
    id: "half-adder",
    title: "半加器",
    englishTitle: "Half Adder",
    description:
      "用逻辑门实现 1 位加法：输入 A 和 B，输出和位 Sum 与进位 Carry，满足 $A+B=2\\,\\mathrm{Carry}+\\mathrm{Sum}$。",
    track: "core",
    buses: [{ name: "结果（2 位）", pins: ["Carry", "Sum"], role: "output", signed: false }],
    inputs: ["A", "B"],
    outputs: ["Sum", "Carry"],
    primitives: ["xor", "and"],
    extraPrimitives: ["or", "not", "nand", "nor", "buffer"],
    unlocks: "HalfAdder",
    hint: "Sum 只在两个输入不同时为 1；Carry 只在都为 1 时为 1。",
    takeaway: "XOR 给出和位，AND 给出进位，合起来就是一位加法器。",
  },
  {
    index: 3,
    id: "full-adder",
    title: "全加器",
    englishTitle: "Full Adder",
    description:
      "加入进位输入 Cin：三个 1 位相加，输出 Sum 与 Cout，满足 $A+B+\\mathrm{Cin}=2\\,\\mathrm{Cout}+\\mathrm{Sum}$。",
    track: "core",
    buses: [{ name: "结果（2 位）", pins: ["Cout", "Sum"], role: "output", signed: false }],
    inputs: ["A", "B", "Cin"],
    outputs: ["Sum", "Cout"],
    primitives: ALL_GATES,
    unlocks: "FullAdder",
    hint: "可以用两个 HalfAdder 级联：先加 $A+B$，再加 Cin；两次进位取或。",
    takeaway: "两个半加器负责相加，OR 门合并两次进位，就得到能处理进位输入的全加器。",
  },
  {
    index: 4,
    id: "add4",
    title: "4 位加法器",
    englishTitle: "4-bit Addition",
    description: "把四个全加器串成进位链，计算 $A + B$（4 位无符号）。",
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
    takeaway: "低位的 Cout 接到高位的 Cin，四个全加器串起来就完成了多位加法。",
  },
  {
    index: 5,
    id: "negate4",
    title: "求补码",
    englishTitle: "Negation",
    description:
      "计算机用固定位数的二进制补码表示有符号整数时，最高位（最左边一位）是符号位。0 表示零或正数，1 表示负数。例如用 5 位表示时，3 写作 00011，−3 写作 11101。本关只需把 A 的低 4 位逐位取反再加 1，输出结果的低 4 位 R3～R0。",
    details:
      "把 A 看作一个 5 位二进制补码正数的低 4 位（$1\\le A\\le15$；$A=0$ 仅作为零的边界用例）：最高位是符号位，恒为 0，不出现在引脚上。求 $-A$ 的 5 位补码：$-15\\le -A\\le0$，在 5 位补码范围（$[-16,15]$）内不会溢出，其符号位恒为 1（$A=0$ 时结果为全 0），已由题意确定，不需要用电路实现。对 A 按位取反再加 1，计算固定在 4 位内，超出第 4 位的进位不保留。",
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
    takeaway: "补码把逐位取反再加 1 的结果作为负数编码，电路里仍沿用加法器。",
  },
  {
    index: 6,
    id: "sub4",
    title: "4 位减法器",
    englishTitle: "Subtraction",
    description:
      "计算 $A-B$，输出低 4 位 R3～R0。减法就是加上补码：先用 Neg4 求 $-B$，再用 Add4 相加，超出第 4 位的进位不保留。",
    details:
      "把 A、B 看作两个 5 位二进制补码正数的低 4 位（$0\\le A,B\\le15$）：最高位是符号位，恒为 0，不出现在引脚上。计算 $A-B$ 的 5 位补码：$-15\\le A-B\\le15$，在 5 位补码范围（$[-16,15]$）内不会溢出；符号位为 1 当且仅当 $A<B$，由输入决定，不需要用电路实现。",
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
    hint: "Neg4 求出 $-B$，再用 Add4 相加。减法就是加上补码。",
    takeaway: "减法可以转成加法：先求 B 的补码，再与 A 相加。",
  },
  {
    index: 7,
    id: "mul4",
    title: "4 位乘法器",
    englishTitle: "Multiplication",
    description:
      "计算 $A\\times B$，输出 8 位乘积 P。例如可把 A0～A3 分别与同一个 Bi 做 AND，框选后封装成一组部分积组件，再反复使用。",
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
    hint: "把 A 的每一位分别与 B0、B1、B2、B3 做 AND，得到四行部分积。第一行的最低位就是 P0。把这一行剩下的三位高位补 0，用 Add4 与下一行相加。和的最低位就是 P1，把 Cout 和其余三位拼成下一轮的加数。处理第三行时同样取出 P2。加完第四行，Cout 和四位和就是 P7～P3。",
    takeaway: "乘法拆成若干行部分积，再用加法器逐行累加。",
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
    takeaway: "多种运算并排计算，再由控制信号选择其中一个结果，就构成了一块多功能 ALU。",
  },
  {
    index: 9,
    id: "second-tick",
    title: "只有一行亮",
    englishTitle: "One Exact Case",
    description:
      "四种输入里，只有 $A=0$、$B=1$ 时 $Y=1$；其他三种组合都为 0。把这个条件拆成可以逐段检查的小块。",
    track: "challenge",
    railAfter: 1,
    unlockAfter: [1],
    buses: [],
    inputs: ["A", "B"],
    outputs: ["Y"],
    primitives: ["not", "and"],
    unlocks: null,
    hint: "先让 A 变成“不是 A”，再让两个条件同时成立。",
    takeaway: "一个只在 $A=0$、$B=1$ 时成立的输出条件，可以拆成 NOT 和 AND 逐段检查。",
  },
  {
    index: 10,
    id: "odd3",
    title: "三个输入的奇偶",
    englishTitle: "Odd Signals",
    description:
      "当 A、B、C 中有奇数个 1 时输出 $Y=1$，有偶数个 1 时输出 $Y=0$。这个行为会在全加器的和位再次出现。",
    track: "challenge",
    railAfter: 2,
    unlockAfter: [2],
    buses: [],
    inputs: ["A", "B", "C"],
    outputs: ["Y"],
    primitives: ["xor"],
    unlocks: null,
    hint: "先对 A、B 做 XOR，再把中间结果和 C 做 XOR。",
    takeaway: "XOR 级联可以判断三个输入中 1 的个数是否为奇数，全加器的和位也使用同一逻辑。",
  },
  {
    index: 11,
    id: "majority3",
    title: "至少两个为 1",
    englishTitle: "Double Trouble",
    description:
      "当 A、B、C 中至少两个为 1 时输出 $Y=1$。先找出所有能让结果为 1 的成对条件，再把它们合起来。",
    track: "challenge",
    railAfter: 2,
    unlockAfter: [2],
    buses: [],
    inputs: ["A", "B", "C"],
    outputs: ["Y"],
    primitives: ["and", "or"],
    unlocks: null,
    hint: "分别判断 $A\\land B$、$A\\land C$、$B\\land C$，三个条件只要有一个成立就输出 1。",
    takeaway:
      "把三组成对条件分别用 AND 判断，再用 OR 合并，就得到多数决；全加器的进位输出也采用这个结构。",
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
