import { trainLogisticRegression, type TrainingRun } from "./logisticRegression.ts";
import type { ConceptAnswers, LogisticRegressionTestSummary } from "./protocol.ts";
import { getLogisticRegressionStage, TRAIN_MAX_TRAIN_LOSS, TRAIN_MAX_VAL_LOSS } from "./stages.ts";

export const SGD_REFERENCE_CODE =
  "p = predict(xi)\ng = eta * (p - yi)\nfor j in range(n):\n    w[j] -= g * xi[j]";
export const SGD_STARTER_CODE =
  "# 每条短信预测一次，再更新权重\np = predict(xi)\ng = 0\nfor j in range(n):\n    w[j] -= 0";
export const MAX_SGD_CODE_LENGTH = 2000;
export type SgdDiagnostic = {
  code: "syntax" | "direction" | "feature" | "eta" | "error-order" | "update";
  message: string;
  line?: number;
};
export type SgdCodeRun = {
  run: TrainingRun | null;
  diagnostics: SgdDiagnostic[];
  summary: LogisticRegressionTestSummary;
  passed: boolean;
};

type Context = {
  p?: number;
  g?: number;
  yi: number;
  eta: number;
  prediction: number;
  x: number;
  w: number;
};
type Expr =
  | { kind: "number"; value: number }
  | { kind: "name"; name: "p" | "g" | "yi" | "eta" | "prediction" | "x" | "w" }
  | { kind: "binary"; op: string; left: Expr; right: Expr };
type Evaluate = (ctx: Context) => number;
type Assignment = { name: "p" | "g"; expr: Expr; line: number };
type Program = {
  assignments: Assignment[];
  update: Expr;
  line: number;
  evaluate: Evaluate;
  sparse: boolean;
};
class CodeError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(message);
    this.line = line;
  }
}

function expression(source: string, line: number, defined: Set<string>): Expr {
  const tokens = source.match(/predict|[A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d+)?|[+*/()[\]-]|\S/g) ?? [];
  let position = 0;
  const take = (expected: string) => {
    if (tokens[position++] !== expected) throw new CodeError(`这里需要 ${expected}。`, line);
  };
  const atom = (): Expr => {
    const token = tokens[position++];
    if (token === "+" || token === "-")
      return { kind: "binary", op: token, left: { kind: "number", value: 0 }, right: atom() };
    if (token === "(") {
      const result = parse(0);
      take(")");
      return result;
    }
    if (token && /^\d/.test(token)) return { kind: "number", value: Number(token) };
    if (token === "predict") {
      take("(");
      take("xi");
      take(")");
      return { kind: "name", name: "prediction" };
    }
    if (token === "xi" || token === "w") {
      take("[");
      take("j");
      take("]");
      return { kind: "name", name: token === "xi" ? "x" : "w" };
    }
    if (token && ["p", "g", "yi", "eta"].includes(token) && defined.has(token))
      return { kind: "name", name: token as "p" | "g" | "yi" | "eta" };
    throw new CodeError(
      `无法识别「${token ?? "空表达式"}」；请只使用已定义的 p、g、yi、eta、predict(xi)、xi[j] 和 w[j]。`,
      line,
    );
  };
  const parse = (minimum: number): Expr => {
    let left = atom();
    while (position < tokens.length) {
      const op = tokens[position];
      const priority = op === "+" || op === "-" ? 1 : op === "*" || op === "/" ? 2 : 0;
      if (!priority || priority < minimum) break;
      position++;
      left = { kind: "binary", op, left, right: parse(priority + 1) };
    }
    return left;
  };
  const result = parse(0);
  if (position !== tokens.length)
    throw new CodeError(`「${tokens[position]}」不在支持的算式中。`, line);
  return result;
}

function compile(expr: Expr): Evaluate {
  if (expr.kind === "number") return () => expr.value;
  if (expr.kind === "name") return (ctx) => ctx[expr.name] ?? NaN;
  const left = compile(expr.left),
    right = compile(expr.right);
  switch (expr.op) {
    case "+":
      return (ctx) => left(ctx) + right(ctx);
    case "-":
      return (ctx) => left(ctx) - right(ctx);
    case "*":
      return (ctx) => left(ctx) * right(ctx);
    default:
      return (ctx) => left(ctx) / right(ctx);
  }
}

function matchesReference(expr: Expr): boolean {
  if (expr.kind !== "binary") return false;
  if (expr.op === "-") {
    if (expr.left.kind !== "number" || expr.left.value !== 0) return false;
    const product = expr.right;
    if (product.kind !== "binary" || product.op !== "*") return false;
    const factor = (node: Expr, name: string) => node.kind === "name" && node.name === name;
    const containsEta = factor(product.left, "eta") || factor(product.right, "eta");
    const other = factor(product.left, "eta") ? product.right : product.left;
    if (!containsEta || other.kind !== "binary" || other.op !== "*") return false;
    const error = (node: Expr) =>
      node.kind === "binary" &&
      node.op === "-" &&
      factor(node.left, "p") &&
      factor(node.right, "yi");
    const feature = (node: Expr) => factor(node, "x");
    return (
      (error(other.left) && feature(other.right)) || (error(other.right) && feature(other.left))
    );
  }
  if (
    expr.op === "*" &&
    matchesReference({ kind: "binary", op: "-", left: { kind: "number", value: 0 }, right: expr })
  )
    return true;
  return false;
}

// A structural proof, not a trial run: only skip absent words if their update is always zero.
function zeroWhenAbsent(expr: Expr): boolean {
  if (expr.kind === "number") return expr.value === 0;
  if (expr.kind === "name") return expr.name === "x";
  if (expr.op === "*") return zeroWhenAbsent(expr.left) || zeroWhenAbsent(expr.right);
  if (expr.op === "/")
    return zeroWhenAbsent(expr.left) && expr.right.kind === "number" && expr.right.value !== 0;
  return zeroWhenAbsent(expr.left) && zeroWhenAbsent(expr.right);
}

function parseProgram(code: string): Program {
  if (code.length > MAX_SGD_CODE_LENGTH) throw new CodeError("代码最多 2000 字。", 1);
  if (/\b(?:import|exec|eval|open|class|while|lambda|global|return)\b|__/.test(code))
    throw new CodeError(
      "不支持 Python 命令、导入或函数；本练习只接受四行更新算式。",
      Math.max(
        1,
        code
          .slice(
            0,
            code.search(/\b(?:import|exec|eval|open|class|while|lambda|global|return)\b|__/),
          )
          .split(/\r?\n/).length,
      ),
    );
  const lines = code
    .split(/\r?\n/)
    .map((text, i) => ({ text: text.split("#")[0].trimEnd(), line: i + 1 }))
    .filter(({ text }) => text.trim());
  if (lines.length > 12) throw new CodeError("只需填写单条短信的更新代码，最多 12 行。", 1);
  const assignments: Assignment[] = [];
  const defined = new Set(["yi", "eta"]);
  let loop = false;
  let update: Expr | undefined;
  let updateLine = 1;
  for (const { text, line } of lines) {
    const trimmed = text.trim();
    if (trimmed === "for j in range(n):" && !loop && !/^\s/.test(text)) {
      loop = true;
      continue;
    }
    if (loop && !/^\s+/.test(text))
      throw new CodeError("for 下面的更新行需要缩进（例如 4 个空格）。", line);
    const assignment = /^([pg])\s*=\s*(.+)$/.exec(trimmed);
    if (assignment && !update && !loop) {
      const expr = expression(assignment[2], line, defined);
      // Per-message scalars cannot depend on a parameter index.
      if (/\[/.test(assignment[2]))
        throw new CodeError("p 和 g 是本条短信共用的数值，不使用 j 下标。", line);
      assignments.push({ name: assignment[1] as "p" | "g", expr, line });
      defined.add(assignment[1]);
      continue;
    }
    if (assignment && loop)
      throw new CodeError("p 和 g 应放在词权重循环外，每条短信只计算一次。", line);
    const match = /^w\s*\[\s*j\s*\]\s*(-=|\+=|=)\s*(.+)$/.exec(trimmed);
    if (!loop || !match || update)
      throw new CodeError("支持 p / g 赋值、for j in range(n): 和一行 w[j] 更新。", line);
    const rhs = expression(match[2], line, defined);
    if (match[1] === "=") {
      if (
        rhs.kind !== "binary" ||
        rhs.left.kind !== "name" ||
        rhs.left.name !== "w" ||
        !["-", "+"].includes(rhs.op)
      ) {
        throw new CodeError("等号更新请写成 w[j] = w[j] - 改变量，或改用 -=。", line);
      }
      update =
        rhs.op === "-"
          ? { kind: "binary", op: "-", left: { kind: "number", value: 0 }, right: rhs.right }
          : rhs.right;
    } else {
      update =
        match[1] === "+="
          ? rhs
          : { kind: "binary", op: "-", left: { kind: "number", value: 0 }, right: rhs };
    }
    updateLine = line;
  }
  if (!update) throw new CodeError("请在 for 循环里填写 w[j] 的更新。", lines.at(-1)?.line ?? 1);
  const wToDelta = (expr: Expr): Expr => {
    if (
      expr.kind === "binary" &&
      expr.op === "-" &&
      expr.left.kind === "name" &&
      expr.left.name === "w"
    )
      return expr.right;
    return expr;
  };
  return {
    assignments,
    update,
    line: updateLine,
    evaluate: compile(wToDelta(update)),
    sparse: zeroWhenAbsent(wToDelta(update)),
  };
}

function prepare(program: Program) {
  const assignments = program.assignments.map((item) => ({
    ...item,
    evaluate: compile(item.expr),
  }));
  return (ctx: Context) => {
    ctx.p = ctx.prediction;
    for (const item of assignments) {
      ctx[item.name] = item.evaluate(ctx);
      if (!Number.isFinite(ctx[item.name]))
        throw new CodeError("算式产生了无穷大或无效数值，请检查除数和计算顺序。", item.line);
    }
  };
}

function diagnose(program: Program, code: string): SgdDiagnostic[] {
  const setup = prepare(program);
  const diagnostics: SgdDiagnostic[] = [];
  const probes = [0.2, 0.7];
  let absent = false,
    reversed = false,
    large = false,
    different = false;
  for (const prediction of probes)
    for (const yi of [0, 1])
      for (const x of [0, 1]) {
        const ctx: Context = { prediction, yi, eta: 0.1, x, w: 0.37 };
        ctx.p = prediction;
        setup(ctx);
        const actual = program.evaluate(ctx);
        if (!Number.isFinite(actual))
          throw new CodeError("更新产生了无效数值，请检查是否除以 0。", program.line);
        const expected = -ctx.eta * (prediction - yi) * x;
        if (!x && Math.abs(actual) > 1e-9) absent = true;
        if (x && actual * expected < 0) reversed = true;
        if (x && Math.abs(actual - expected * 10) < 1e-9) large = true;
        if (Math.abs(actual - expected) > 1e-9) different = true;
      }
  if (absent)
    diagnostics.push({
      code: "feature",
      message: "未出现的词也被改动了。检查是否漏乘 xi[j]；乘 0 才能锁定无关词。",
    });
  if (reversed)
    diagnostics.push(
      /yi\s*-\s*p/.test(code)
        ? {
            code: "error-order",
            message: "yi=1、p=0.2 时，yi - p 为正，再减去它会压低垃圾词权重。检查 p - yi 的顺序。",
          }
        : {
            code: "direction",
            message: "更新方向反了，模型被推向误差更大的方向（梯度上升）。检查 += 与 -=。",
          },
    );
  if (large)
    diagnostics.push({
      code: "eta",
      message:
        "单步改变量是参考值的 10 倍。是否漏乘学习率 eta？大步长可能引起震荡，是否收敛仍要看验证曲线。",
    });
  if (different && !diagnostics.length && !matchesReference(program.update))
    diagnostics.push({
      code: "update",
      message: "单步更新与 −eta × (p − yi) × xi[j] 不一致。先检查下方单步结果，再调整代码。",
    });
  return diagnostics;
}

export function runSgdCode(code: string, concepts: ConceptAnswers = {}): SgdCodeRun {
  let run: TrainingRun | null = null;
  let diagnostics: SgdDiagnostic[] = [];
  try {
    const program = parseProgram(code);
    diagnostics = diagnose(program, code);
    const setup = prepare(program);
    run = trainLogisticRegression({
      eta: 0.1,
      epochs: 20,
      sampleUpdate: (weights, bias, ids, yi, eta, prediction) => {
        const ctx: Context = { yi, eta, prediction, x: 1, w: 0 };
        setup(ctx);
        const update = (j: number, x: number) => {
          ctx.x = x;
          ctx.w = j === weights.length ? bias : weights[j];
          const value = ctx.w + program.evaluate(ctx);
          if (!Number.isFinite(value) || Math.abs(value) > 1e6)
            throw new CodeError("权重超出实验范围，请检查更新方向、步长或除数。", program.line);
          if (j === weights.length) bias = value;
          else weights[j] = value;
        };
        if (program.sparse) {
          for (const id of ids) update(id, 1);
        } else {
          const active = new Set(ids);
          for (let j = 0; j < weights.length; j++) update(j, active.has(j) ? 1 : 0);
        }
        update(weights.length, 1);
        return bias;
      },
    });
  } catch (error) {
    diagnostics.push({
      code: "syntax",
      message: error instanceof CodeError ? error.message : "代码无法运行，请检查算式。",
      line: error instanceof CodeError ? error.line : 1,
    });
  }
  const final = run?.epochsHistory.at(-1);
  const trainOk = !!final && final.trainLoss <= TRAIN_MAX_TRAIN_LOSS;
  const valOk = !!final && final.valLoss <= TRAIN_MAX_VAL_LOSS;
  const prompts = getLogisticRegressionStage(6)?.prompts ?? [];
  const conceptsOk = prompts.length > 0 && prompts.every((p) => concepts[p.id] === p.correct);
  const passed = trainOk && valOk && conceptsOk && diagnostics.length === 0;
  return {
    run,
    diagnostics,
    passed,
    summary: {
      parts: [
        {
          id: "code",
          label: "单步更新规则",
          ok: diagnostics.length === 0,
          detail: diagnostics.length
            ? diagnostics.map((d) => `${d.line ? `第 ${d.line} 行：` : ""}${d.message}`).join("\n")
            : "出现的词和偏置按梯度更新，未出现的词保持不变。",
        },
        {
          id: "train-loss",
          label: "训练损失 ≤ 0.08",
          ok: trainOk,
          detail: final ? final.trainLoss.toFixed(4) : "等待可运行的代码",
        },
        {
          id: "val-loss",
          label: "验证损失 ≤ 0.12",
          ok: valOk,
          detail: final ? final.valLoss.toFixed(4) : "等待可运行的代码",
        },
        {
          id: "concepts",
          label: "2 道概念题",
          ok: conceptsOk,
          detail: conceptsOk ? "全部答对" : "请完成方向与稀疏更新检查",
        },
      ],
      detail: passed
        ? "你写的更新引擎已通过检查。四行代码，把预测误差变成了模型的学习。"
        : "运行结果已更新。对照单步变化与参考曲线，修好引擎再试一次。",
      ...(final ? { metrics: { ...final.valMetrics, trainLoss: final.trainLoss } } : {}),
    },
  };
}

export function sanitizeSgdCodeDraft(raw: unknown): import("./protocol.ts").SgdCodeDraft {
  const base = { code: SGD_STARTER_CODE, concepts: {} };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const concepts: ConceptAnswers = {};
  if (obj.concepts && typeof obj.concepts === "object") {
    for (const [id, value] of Object.entries(obj.concepts as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 10)
        concepts[id] = value;
    }
  }
  return {
    code: typeof obj.code === "string" ? obj.code.slice(0, MAX_SGD_CODE_LENGTH) : base.code,
    concepts,
  };
}
