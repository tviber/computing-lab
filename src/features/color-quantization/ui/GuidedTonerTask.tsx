/**
 * Guided coding task (stage 1): complete `nearest_toner(r, g, b, toners)` —
 * the one line of judgment inside the printer's fixed mapping rule. The
 * program is presented as inline blanks rather than a free-form editor; the
 * assembled source is still what runs in the Pyodide worker and what gets
 * saved as the draft. Students first predict each test color's destination
 * by hand, then watch their code make the same judgment.
 */

import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, Show, untrack } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import { PythonCodeWithBlanks, type PythonCodePart } from "../../../shared/ui/PythonCode";
import { runNearestToner } from "./pyodideRunner.ts";
import { practiceCandidates, practiceColors, TonerPrediction } from "./TonerPrediction.tsx";

function assemble(blueExpr: string, condExpr: string): string {
  return `def nearest_toner(r, g, b, toners):
    # toners: 候选颜色列表, 每个是 [r, g, b], toners[0] 是纸白
    best = 0
    best_d = (r - toners[0][0])**2 + (g - toners[0][1])**2 + (b - toners[0][2])**2
    for i in range(1, len(toners)):
        d = (r - toners[i][0])**2 + (g - toners[i][1])**2 + ${blueExpr}
        if ${condExpr}:
            best_d = d
            best = i
    return best
`;
}

/** Recover the two blanks from a previously saved source, if it still fits. */
function parseBlanks(code: string): [string, string] | null {
  const blue = /d = \(r - toners\[i\]\[0\]\)\*\*2 \+ \(g - toners\[i\]\[1\]\)\*\*2 \+ (.+)/.exec(
    code,
  );
  const cond = /if\s+(.+):/.exec(code);
  return blue && cond ? [blue[1].trim(), cond[1].trim()] : null;
}

export function GuidedTonerTask(props: { code: string; onCodeChange: (code: string) => void }) {
  const initial = untrack(() => parseBlanks(props.code));
  const [blankBlue, setBlankBlue] = createSignal(initial?.[0] ?? "");
  const [blankCond, setBlankCond] = createSignal(initial?.[1] ?? "");
  const [check, setCheck] = createSignal<{
    source: string;
    outputs: (number | null)[] | null;
    error?: string;
  } | null>(null);
  const [running, setRunning] = createSignal(false);
  let lastEmitted: string | null = null;

  // If a saved draft arrives after mount, fold it back into the blanks.
  createEffect(
    () => props.code,
    (code) => {
      if (code === lastEmitted) return;
      const parsed = parseBlanks(code);
      if (parsed) {
        setBlankBlue(parsed[0]);
        setBlankCond(parsed[1]);
      }
    },
  );

  const updateBlank = (which: "blue" | "cond", value: string) => {
    const blue = which === "blue" ? value : blankBlue();
    const cond = which === "cond" ? value : blankCond();
    if (which === "blue") setBlankBlue(value);
    else setBlankCond(value);
    const nextSource = assemble(blue, cond);
    lastEmitted = nextSource;
    props.onCodeChange(nextSource);
  };

  const source = createMemo(() => assemble(blankBlue(), blankCond()));
  const current = createMemo(() => {
    const c = check();
    return c?.source === source() ? c : null;
  });
  const passed = createMemo(() =>
    current()?.outputs?.every((value, index) => value === practiceColors[index].expected),
  );

  const run = async () => {
    const currentSource = source();
    if (!blankBlue().trim() || !blankCond().trim()) {
      setCheck({ source: currentSource, outputs: null, error: "先把两个空都填上，再运行。" });
      return;
    }
    setRunning(true);
    setCheck(null);
    try {
      const results = await runNearestToner(
        currentSource,
        practiceColors.map((color) => color.rgb),
        practiceCandidates,
      );
      const outputs = practiceColors.map((_, index) => {
        const value = results[index];
        return typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 0 &&
          value < practiceCandidates.length
          ? value
          : null;
      });
      setCheck({ source: currentSource, outputs });
    } catch (err) {
      setCheck({
        source: currentSource,
        outputs: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(false);
    }
  };

  const codeParts = createMemo<PythonCodePart[]>(() => [
    {
      kind: "code",
      code: `def nearest_toner(r, g, b, toners):
    # toners: 候选颜色列表, 每个是 [r, g, b], toners[0] 是纸白
    best = 0
    best_d = (r - toners[0][0])**2 + (g - toners[0][1])**2 + (b - toners[0][2])**2
    for i in range(1, len(toners)):
        d = (r - toners[i][0])**2 + (g - toners[i][1])**2 + `,
    },
    {
      kind: "blank",
      id: "blue",
      value: blankBlue(),
      ariaLabel: "空 1：蓝色通道的距离项",
      minWidth: 16,
      onChange: (value) => updateBlank("blue", value),
    },
    {
      kind: "code",
      code: `
        if `,
    },
    {
      kind: "blank",
      id: "condition",
      value: blankCond(),
      ariaLabel: "空 2：什么条件下更新 best",
      minWidth: 10,
      onChange: (value) => updateBlank("cond", value),
    },
    {
      kind: "code",
      code: `:
            best_d = d
            best = i
    return best
`,
    },
  ]);

  return (
    <section aria-labelledby="guided-toner-title" class="quant-guided">
      <h3 id="guided-toner-title">小练习：把刚才的规则写成代码</h3>
      <p>
        刚才实验台里的印刷效果，就是这么一个颜色一个颜色算出来的。规则只有一条：
        <strong>每种源色落到离它最近的候选色</strong>
        ，候选色包括纸白和已装的墨粉。距离按 RGB 三个通道的平方差相加计算。
      </p>
      <TonerPrediction outputs={current()?.outputs ?? null} />

      <p>
        让代码也选一次。第一个空补蓝色通道的平方差，第二个空决定什么时候用当前候选替换之前的最佳候选。
      </p>
      <PythonCodeWithBlanks
        ariaLabel="nearest_toner 代码填空"
        class="quant-code-fill"
        parts={codeParts()}
      />

      <div class="quant-actions">
        <Button
          class="button button-secondary"
          disabled={running()}
          onClick={() => void run()}
          type="button"
        >
          {running() ? "运行中…（首次需加载 Python）" : "运行检查"}
        </Button>
        <Show when={passed() === true}>
          <span class="quant-badge is-pass">
            <Icon name="check" size={12} /> 全部一致
          </span>
          <span class="quant-guided-next">
            回实验台把“映射规则”切换成「我写的 nearest_toner」，看它印出的整图。
          </span>
        </Show>
        <Show when={passed() === false}>
          <span class="quant-badge is-fail">还不一致，查看上方六种源色的检查结果。</span>
        </Show>
      </div>
      <Show when={current()?.error}>
        {(err) => (
          <pre class="quant-error" role="alert">
            {err()}
          </pre>
        )}
      </Show>
    </section>
  );
}
