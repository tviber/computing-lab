/**
 * Guided coding task (stage 1): complete `cell_value(region)` — the one line
 * of judgment inside the fixed downsampling rule. The program is presented
 * as inline blanks rather than a free-form editor; the assembled source is
 * still what runs in the Pyodide worker and what gets saved as the draft.
 * Verdicts compare the student's outputs to the majority rule on a fixed
 * set of regions with varied coverage, shown as before→after cell pairs.
 */

import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import { PythonCodeWithBlanks, type PythonCodePart } from "../../../shared/ui/PythonCode";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
import { imageFromLists } from "../domain/bitmap.ts";
import { cellRegion, cellStats } from "../domain/downsample.ts";
import { publicGalleryFor } from "../domain/fixtures.ts";
import { BitmapCanvas } from "./BitmapCanvas.tsx";
import { runCellValue } from "./pyodideRunner.ts";

/** Assemble runnable Python from the two blanks. */
function assemble(inkExpr: string, condExpr: string): string {
  return `def cell_value(region):
    # region 是一个二维列表: 1 = 有图形, 0 = 背景
    total = 0
    ink = 0
    for row in region:
        for v in row:
            total += 1
            ink += ${inkExpr}
    if ${condExpr}:
        return 1
    else:
        return 0
`;
}

/** Recover the two blanks from a previously saved source, if it still fits. */
function parseBlanks(code: string): [string, string] | null {
  const ink = /ink\s*\+=\s*(.+)/.exec(code);
  const cond = /^\s*if\s+(.+?):\s*$/m.exec(code) ?? /return\s+1\s+if\s+(.+?)\s+else\s+0/.exec(code);
  return ink && cond ? [ink[1].trim(), cond[1].trim()] : null;
}

type CheckRow = { index: number; expected: number; got: number | null };

/** Deterministic region set: spread coverage across the invader sprite. */
function buildRegions(): { regions: number[][][]; expected: number[] } {
  const image = publicGalleryFor("invader")[0].image;
  const cells: { region: number[][]; on: number; total: number }[] = [];
  for (let cy = 0; cy < 8; cy += 1) {
    for (let cx = 0; cx < 8; cx += 1) {
      const { on, total } = cellStats(image, 8, 8, cx, cy);
      cells.push({ region: cellRegion(image, 8, 8, cx, cy), on, total });
    }
  }
  cells.sort((a, b) => a.on / a.total - b.on / b.total);
  const picks = [2, 12, 22, 32, 44, 56].map((i) => cells[Math.min(i, cells.length - 1)]);
  return {
    regions: picks.map((p) => p.region),
    expected: picks.map((p) => (2 * p.on >= p.total ? 1 : 0)),
  };
}

export function GuidedCellTask(props: { code: string; onCodeChange: (code: string) => void }) {
  const { regions, expected } = buildRegions();
  const initial = untrack(() => parseBlanks(props.code));
  const [blankInk, setBlankInk] = createSignal(initial?.[0] ?? "");
  const [blankCond, setBlankCond] = createSignal(initial?.[1] ?? "");
  const [guesses, setGuesses] = createSignal<(0 | 1 | null)[]>(regions.map(() => null));
  const [rows, setRows] = createSignal<CheckRow[] | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [running, setRunning] = createSignal(false);
  const [passed, setPassed] = createSignal<boolean | null>(null);
  let lastEmitted: string | null = null;

  // If a saved draft arrives after mount, fold it back into the blanks.
  createEffect(
    () => props.code,
    (code) => {
      if (code === lastEmitted) return;
      const parsed = parseBlanks(code);
      if (parsed) {
        setBlankInk(parsed[0]);
        setBlankCond(parsed[1]);
      }
    },
  );

  const updateBlank = (which: "ink" | "cond", value: string) => {
    const ink = which === "ink" ? value : blankInk();
    const cond = which === "cond" ? value : blankCond();
    if (which === "ink") setBlankInk(value);
    else setBlankCond(value);
    const source = assemble(ink, cond);
    lastEmitted = source;
    props.onCodeChange(source);
  };

  const run = async () => {
    if (!blankInk().trim() || !blankCond().trim()) {
      setError("先把两个空都填上，再运行。");
      setPassed(false);
      return;
    }
    setRunning(true);
    setError(null);
    setRows(null);
    try {
      const results = await runCellValue(assemble(blankInk(), blankCond()), regions);
      const next = results.map((raw, index) => {
        const got = Number(raw);
        return {
          index,
          expected: expected[index],
          got: got === 0 || got === 1 ? got : null,
        };
      });
      setRows(next);
      setPassed(next.every((row) => row.got === row.expected));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPassed(false);
    } finally {
      setRunning(false);
    }
  };

  const codeParts = createMemo<PythonCodePart[]>(() => [
    {
      kind: "code",
      code: `def cell_value(region):
    # region: 二维列表, 1 = 图形, 0 = 背景
    total = 0
    ink = 0
    for row in region:
        for v in row:
            total += 1
            ink += `,
    },
    {
      kind: "blank",
      id: "ink",
      value: blankInk(),
      ariaLabel: "空 1：ink 累加什么",
      minWidth: 4,
      onChange: (value) => updateBlank("ink", value),
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
      ariaLabel: "空 2：什么条件下这个格子是 1",
      minWidth: 14,
      onChange: (value) => updateBlank("cond", value),
    },
    {
      kind: "code",
      code: `:
        return 1
    else:
        return 0
`,
    },
  ]);

  return (
    <section aria-labelledby="guided-cell-title" class="guided-cell-task">
      <h3 id="guided-cell-title">小练习：把刚才的规则写成代码</h3>
      <p>
        刚才实验台里的格子图，就是这么一格一格算出来的。规则只有一条：
        <strong>一个格子盖住的区域里至少一半是图形（1），这个格子才发 1。</strong>
      </p>
      <p>
        下面是 6 块从信号图上取下来的真实区域。先别看代码。先数一数每块里有多少个图形像素，
        点上你判断的 0 或 1，再让代码做同样的判断。
      </p>

      <div class="region-strip">
        <For each={regions}>
          {(region, index) => {
            const regionImage = imageFromLists(region);
            const row = () => rows()?.[index()];
            const guess = () => guesses()[index()];
            return (
              <figure class="region-card">
                <div class="region-pair">
                  <BitmapCanvas
                    ariaLabel={`测试区域 ${index() + 1}`}
                    image={regionImage}
                    pixelSize={6}
                  />
                  <Show when={row()}>
                    {(r) => (
                      <>
                        <span aria-hidden="true" class="preview-arrow">
                          <Icon name="arrow-right" size={16} />
                        </span>
                        <span
                          aria-label={`区域 ${index() + 1} 的代码输出`}
                          class={`cell-outcome${r().got === 1 ? " is-on" : ""}${
                            r().got === r().expected ? " is-ok" : " is-bad"
                          }`}
                          title={`规则答案 ${r().expected}`}
                        >
                          {r().got ?? "?"}
                        </span>
                      </>
                    )}
                  </Show>
                </div>
                <figcaption>区域 {index() + 1}</figcaption>
                <SegmentedPicker
                  class="guess-buttons"
                  itemClass="guess-button"
                  label={`区域 ${index() + 1} 你的判断`}
                  onChange={(value) =>
                    setGuesses((prev) => {
                      const next = [...prev];
                      next[index()] = Number(value) as 0 | 1;
                      return next;
                    })
                  }
                  options={[
                    { value: "0", label: "0" },
                    { value: "1", label: "1" },
                  ]}
                  value={guess() == null ? "" : String(guess())}
                />
                <Show when={guess() !== null}>
                  <span
                    class={`guess-verdict${guess() === expected[index()] ? " is-ok" : " is-bad"}`}
                  >
                    {guess() === expected[index()] ? "和规则一致" : `规则给 ${expected[index()]}`}
                  </span>
                </Show>
              </figure>
            );
          }}
        </For>
      </div>

      <p>再补全这段代码里的两个空，让它在所有这些区域上都给出和规则一致的结果：</p>
      <PythonCodeWithBlanks
        ariaLabel="cell_value 代码填空"
        className="code-fill"
        parts={codeParts()}
      />

      <div class="guided-actions">
        <Button
          class="button button-secondary"
          disabled={running()}
          onClick={() => void run()}
          type="button"
        >
          {running() ? "运行中…（首次需加载 Python）" : "运行检查"}
        </Button>
        <Show when={passed() === true}>
          <span class="badge badge-pass">
            <Icon name="check" size={12} /> 全部一致
          </span>
          <span class="guided-next">
            回实验台把“接收端规则”切换成「我写的 cell_value」，看它生成的格子图。
          </span>
        </Show>
        <Show when={passed() === false && !error()}>
          <span class="badge badge-fail">还不一致</span>
        </Show>
      </div>
      <Show when={error()}>
        {(err) => (
          <pre class="python-error" role="alert">
            {err()}
          </pre>
        )}
      </Show>
    </section>
  );
}
