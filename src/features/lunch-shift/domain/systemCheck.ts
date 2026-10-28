/**
 * The five-element system check — ported from kitchen/systemcheck.go.
 * Rendering needs the questions client-side; the judge re-grades server-side
 * from the same table.
 */

export type SystemCheckOption = { value: string; label: string };
export type SystemCheckQuestion = { id: string; prompt: string; options: SystemCheckOption[] };

export const SYSTEM_CHECK_QUESTIONS: SystemCheckQuestion[] = [
  {
    id: "hardware",
    prompt: "订单网页能打开、小票能显示，首先依赖电脑或平板的哪一部分？",
    options: [
      { value: "programs", label: "软件：网页和餐馆的处理规则" },
      { value: "devices", label: "硬件：你的设备和餐馆的服务器" },
      { value: "orders", label: "数据：订单和小票内容" },
    ],
  },
  {
    id: "software",
    prompt: "餐馆按规则处理订单，是谁在照着规则一条条执行？",
    options: [
      { value: "network", label: "把规则从你的设备送到服务器的网络" },
      { value: "hardware", label: "电脑里的芯片和零件自己" },
      { value: "rule", label: "服务器上运行的程序" },
    ],
  },
  {
    id: "network",
    prompt: "你在自己的设备上改好规则，服务器上的程序要收到它，靠哪一部分连接？",
    options: [
      { value: "ticket", label: "小票中的数据字段" },
      { value: "connection", label: "通信网络" },
      { value: "user", label: "教师和学生这些用户" },
    ],
  },
  {
    id: "data",
    prompt: "你把 5 号桌录成 8 号桌，错误会跟着哪一部分进入后续流程？",
    options: [
      { value: "network", label: "网络：数据传输路径" },
      { value: "software", label: "软件：选单程序" },
      { value: "record", label: "数据：小票里的桌号字段" },
    ],
  },
  {
    id: "users",
    prompt: "厨房先做哪一张订单，最直接地影响谁？",
    options: [
      { value: "student", label: "只有开发系统的程序员" },
      { value: "people", label: "在系统中点单与等候的顾客" },
      { value: "server", label: "只有运行服务的电脑" },
    ],
  },
  {
    id: "flow",
    prompt: "你认为一张订单怎样经过这套系统？",
    options: [
      {
        value: "software-first",
        label: "服务器先排出送餐顺序，顾客再提出需求，页面显示结果",
      },
      {
        value: "end-to-end",
        label: "顾客提出需求 → 数据和规则送到餐馆的服务器 → 程序处理订单 → 页面显示结果",
      },
      {
        value: "hardware-only",
        label: "顾客提出需求 → 订单数据送到你的设备 → 设备自己决定送餐顺序",
      },
    ],
  },
];

export const SYSTEM_CHECK_EXPLANATIONS: Record<string, string> = {
  hardware: "你的设备和餐馆的服务器是硬件；没有这些设备，网页就无法输入规则、显示结果。",
  software: "你写下的规则只是数据；照着规则一条条执行的是服务器上运行的程序。",
  network: "网络把你设备里的请求和规则送到餐馆的服务器，再把成绩送回页面。",
  data: "桌号是订单数据；错误数据会沿后续流程传递，导致送错桌。",
  users: "顾客提供需求并等待结果；学生和教师也是使用系统的人。",
  flow: "顾客需求成为订单数据；数据和规则经网络送到餐馆的服务器，服务器上的程序按规则处理订单，再把成绩送回页面。",
};

const SYSTEM_CHECK_KEY: Record<string, string> = {
  hardware: "devices",
  software: "rule",
  network: "connection",
  data: "record",
  users: "people",
  flow: "end-to-end",
};

/** Four one-line parts of the end-to-end explanation, in order. */
export const SYSTEM_EXPLANATION_PARTS = [
  "谁提出需求",
  "经过哪里",
  "谁运行软件",
  "结果交给谁",
] as const;

export function systemCheckQuestion(id: string): SystemCheckQuestion | undefined {
  return SYSTEM_CHECK_QUESTIONS.find((question) => question.id === id);
}

export function optionValueExists(question: SystemCheckQuestion, value: string): boolean {
  return question.options.some((option) => option.value === value);
}

export function isCorrectAnswer(questionId: string, answer: string): boolean {
  return SYSTEM_CHECK_KEY[questionId] === answer;
}

export function gradeSystemCheck(answers: Record<string, string>): number {
  return SYSTEM_CHECK_QUESTIONS.filter(
    (question) => answers[question.id] === SYSTEM_CHECK_KEY[question.id],
  ).length;
}

export function missedSystemCheckQuestions(answers: Record<string, string>): string[] {
  return SYSTEM_CHECK_QUESTIONS.filter(
    (question) => answers[question.id] !== SYSTEM_CHECK_KEY[question.id],
  ).map((question) => question.id);
}

/**
 * Four lines, each a real phrase (≥4 runes), ≤300 chars total — the
 * 四步说明 contract. A bare "a / b / c / d" does not pass.
 */
export function isSystemExplanation(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 300) return false;
  const parts = value.split("\n");
  if (parts.length !== 4) return false;
  return parts.every((part) => [...part.trim()].length >= 4);
}

/**
 * Keyword sets per explanation part — each line must name the actor or
 * the channel, in the student's own words. Grading is keyword matching,
 * not LLM judging: the point is to verbalize the flow, not to write prose.
 */
const EXPLANATION_KEYWORDS: readonly (readonly string[])[] = [
  ["顾客", "用户", "客人", "人", "点餐", "我们"],
  ["网络", "服务器", "网", "云", "设备", "传输"],
  ["服务器上的程序"],
  ["顾客", "用户", "页面", "屏幕", "客人", "我", "学生"],
];

/** Reference wording, shown after the student passes — not the key. */
export const SYSTEM_EXPLANATION_REFERENCE = [
  "顾客在柜台前提出需求",
  "订单数据和规则经网络送到餐馆的服务器",
  "服务器上的程序按规则处理订单",
  "把处理结果送回页面给顾客看",
];

/**
 * Which of the four explanation parts missed (0-based indexes). A part
 * counts as correct when its line contains any keyword for that slot.
 */
export function gradeExplanation(explanation: string): number[] {
  const parts = explanation.split("\n").map((part) => part.trim());
  const missed: number[] = [];
  for (let i = 0; i < EXPLANATION_KEYWORDS.length; i++) {
    const line = parts[i] ?? "";
    if (line.length < 4 || !EXPLANATION_KEYWORDS[i].some((word) => line.includes(word))) {
      missed.push(i);
    }
  }
  return missed;
}

export function sanitizeSystemCheckAnswers(raw: unknown): Record<string, string> {
  const answers: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return answers;
  const record = raw as Record<string, unknown>;
  for (const question of SYSTEM_CHECK_QUESTIONS) {
    const answer = record[question.id];
    if (typeof answer === "string" && optionValueExists(question, answer)) {
      answers[question.id] = answer;
    }
  }
  return answers;
}
