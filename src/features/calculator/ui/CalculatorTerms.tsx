import type { JSX } from "@solidjs/web";
import { createMemo, For } from "solid-js";
import { Disclosure } from "../../../shared/ui/Disclosure";

export const CALCULATOR_TERM_NOTES = {
  "Half Adder": "半加器：把两个 1 位输入相加，输出和位 Sum 与进位 Carry。",
  "Full Adder": "全加器：把 A、B 和输入进位 Cin 三个 1 位输入相加。",
  "4-bit Addition": "4 位加法：把 4 个全加器串起来，逐位传递进位。",
  Negation: "求补码：按位取反，再加 1，得到相反数。",
  Subtraction: "减法：用 A 加上 B 的补码来实现。",
  Multiplication: "乘法：用部分积左移后逐位相加得到乘积。",
  "Final Calculator": "完整计算器：用操作选择位在加、减、乘、异或结果中选择一个。",
  HalfAdder: "半加器组件：把两个 1 位输入相加。",
  FullAdder: "全加器组件：把 A、B 和输入进位相加。",
  Add4: "4 位加法器组件：逐位相加并传递进位。",
  Neg4: "4 位求补码组件：按位取反后加 1。",
  Sub4: "4 位减法器组件：把 B 的补码加到 A。",
  Mul4: "4 位乘法器组件：输出 8 位乘积。",
  Sum: "和位：这一位相加后留下的 0 或 1。",
  Carry: "进位：这一位相加产生、传给更高位的 1。",
  Cin: "输入进位：从更低一位传入的进位。",
  Cout: "输出进位：从当前这一位传给更高一位的进位。",
  AND: "与门：两个输入都为 1 时，输出才为 1。",
  OR: "或门：至少一个输入为 1 时，输出为 1。",
  XOR: "异或门：两个输入不同时输出 1。",
  NAND: "与非门：先做 AND，再把结果取反。",
  NOR: "或非门：先做 OR，再把结果取反。",
  NOT: "非门：把 0 变成 1，把 1 变成 0。",
  BUF: "缓冲门：输出与输入相同，用来直接传递信号。",
  MUX: "多路选择器：根据选择位，从多个结果中挑一个输出。",
  符号位: "符号位：二进制补码的最高位，0 表示非负，1 表示负。",
  borrow: "借位：减法中向更高位借来的 1。",
  carry: "进位用例：专门检查相加时是否正确产生进位。",
  "carry-in": "输入进位用例：专门检查来自更低位的 Cin。",
  "carry-chain": "进位链用例：检查进位能否连续传到更高位。",
  overflow: "溢出用例：结果超出当前位数能表示的范围。",
  "sign-boundary": "符号边界用例：检查补码正负数的分界。",
  "op-add": "加法操作用例。",
  "op-sub": "减法操作用例。",
  "op-mul": "乘法操作用例。",
  "op-xor": "异或操作用例。",
} as const;

type CalculatorTerm = keyof typeof CALCULATOR_TERM_NOTES;

const TERM_PATTERN = new RegExp(
  `(${Object.keys(CALCULATOR_TERM_NOTES)
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})`,
  "g",
);

export function CalculatorTerm(props: { term: CalculatorTerm }) {
  return <abbr title={`${props.term}：${CALCULATOR_TERM_NOTES[props.term]}`}>{props.term}</abbr>;
}

export function AnnotatedText(props: { text: string }) {
  const parts = createMemo(() => props.text.split(TERM_PATTERN));
  return (
    <For each={parts()}>
      {(part) =>
        part in CALCULATOR_TERM_NOTES ? <CalculatorTerm term={part as CalculatorTerm} /> : part
      }
    </For>
  );
}

const GUIDE_TERMS: CalculatorTerm[] = [
  "Sum",
  "Carry",
  "Cin",
  "Cout",
  "AND",
  "OR",
  "XOR",
  "NOT",
  "MUX",
  "符号位",
  "borrow",
  "overflow",
];

export function CalculatorTermGuide(): JSX.Element {
  return (
    <Disclosure
      class="calculator-term-guide"
      summary="术语说明（英文加下划线，悬停或触摸可查看解释）"
    >
      <dl>
        <For each={GUIDE_TERMS}>
          {(term) => (
            <div>
              <dt>
                <CalculatorTerm term={term} />
              </dt>
              <dd>{CALCULATOR_TERM_NOTES[term]}</dd>
            </div>
          )}
        </For>
      </dl>
    </Disclosure>
  );
}
