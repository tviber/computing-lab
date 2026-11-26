/**
 * map_color(r, g, b) — the free-mapping stage. The student's function runs
 * once per source color in the Pyodide worker and returns a toner index (or
 * -1 for paper); the resulting table fills the draft and is what the server
 * judges. The printer's own nearest-toner table is shown as the baseline —
 * overrides vs it are counted against the stage's budget.
 */

import { useMemo, useState } from "react";
import { Icon } from "../../../shared/ui/Icon";
import { PythonEditor } from "../../../shared/ui/PythonEditor";
import { SOURCE_COLORS, TONER_RACK } from "../domain/palette.ts";
import { nnTable, countOverrides } from "../domain/quantize.ts";
import type { QuantStageDef } from "../domain/stages.ts";
import { runMapAll } from "./pyodideRunner.ts";

const STARTER = `def map_color(r, g, b):
    # 返回墨粉编号: 0=black 1=red 2=orange 3=yellow 4=green 5=cyan 6=blue 7=magenta
    # 本关粉盒固定: 只能返回 1(red) 2(orange) 4(green) 6(blue), 或 -1 留白(纸色)
    # 默认规则是"落到最近的已装粉"——你可以改写它, 但最多改 4 条
    # 可用的辅助: nearest_toner(r, g, b, toners), TONERS, PALETTE, PAPER
    best = -1
    best_d = (r - PAPER[0])**2 + (g - PAPER[1])**2 + (b - PAPER[2])**2
    for i in [1, 2, 4, 6]:
        t = TONERS[i]
        d = (r - t[0])**2 + (g - t[1])**2 + (b - t[2])**2
        if d < best_d:
            best_d = d
            best = i
    return best
`;

export function FreeMapPanel({
  stage,
  code,
  helperCode,
  table,
  onCodeChange,
  onTable,
}: {
  stage: QuantStageDef;
  code: string;
  /** The student's stage-1 nearest_toner source; injected before each run. */
  helperCode: string;
  /** Current draft table, if any. */
  table: number[] | null;
  onCodeChange: (code: string) => void;
  onTable: (table: number[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [helperFailed, setHelperFailed] = useState(false);
  const [running, setRunning] = useState(false);

  const source = code.trim() ? code : STARTER;
  const defaultTable = useMemo(() => nnTable(stage.fixedLoadout ?? []), [stage.fixedLoadout]);
  const overrides = table ? countOverrides(table, defaultTable) : null;

  const run = async () => {
    setRunning(true);
    setError(null);
    setApplied(null);
    try {
      const { results, helperFailed: helperErr } = await runMapAll(
        source,
        SOURCE_COLORS.map((c) => [...c.rgb]),
        TONER_RACK.map((t) => [...t.rgb]),
        SOURCE_COLORS.map((c) => [...c.rgb]),
        helperCode,
      );
      setHelperFailed(helperErr);
      if (results.length !== SOURCE_COLORS.length) {
        throw new Error(`map_color 需要对 ${SOURCE_COLORS.length} 个源色各返回一个值。`);
      }
      const next = results.map((raw) => Number(raw));
      if (next.some((v) => !Number.isInteger(v) || v < -1 || v >= TONER_RACK.length)) {
        throw new Error("map_color 的返回值必须是墨粉编号（0～7）或 -1（留白）。");
      }
      const disallowed = next.filter((v) => v >= 0 && !(stage.fixedLoadout ?? []).includes(v));
      if (disallowed.length) {
        throw new Error(
          `粉盒里只装了 ${(stage.fixedLoadout ?? []).map((i) => TONER_RACK[i].name).join("、")}` +
            `——不能映射到 ${TONER_RACK[disallowed[0]].name}。`,
        );
      }
      onTable(next);
      setApplied(`map_color(...) → 改了 ${countOverrides(next, defaultTable)} 条默认映射`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section aria-labelledby="free-map-title" className="quant-panel">
      <h3 id="free-map-title">改写映射规则</h3>
      <p>
        写一个 <code>map_color(r, g, b)</code> 函数：它对每个源色返回墨粉编号或 -1（留白）。
        本关粉盒固定为 {(stage.fixedLoadout ?? []).map((i) => TONER_RACK[i].name).join("、")}
        ，且最多只能有 {stage.overrideBudget} 条映射和打印机默认规则不同。
      </p>
      <PythonEditor
        ariaLabel="map_color 代码"
        className="quant-editor"
        height="240px"
        onChange={(value) => onCodeChange(value)}
        value={source}
      />
      <div className="quant-actions">
        <button
          className="button button-secondary"
          disabled={running}
          onClick={() => void run()}
          type="button"
        >
          {running ? "运行中…" : "运行并生成映射表"}
        </button>
        {applied ? <span className="quant-badge is-pass">{applied}</span> : null}
        {overrides !== null ? (
          <span
            className={`quant-badge${overrides <= (stage.overrideBudget ?? 0) ? " is-pass" : " is-fail"}`}
          >
            当前改动 {overrides} / {stage.overrideBudget} 条
          </span>
        ) : null}
      </div>
      {helperFailed ? (
        <p className="quant-helper-warn" role="note">
          <Icon name="warning" size={13} /> 你在第 1 关写的 <code>nearest_toner</code>{" "}
          有错误，这次运行用的是内置参考版本—— 回去修好它，这里才会真正调用你的规则。
        </p>
      ) : null}
      {error ? (
        <pre className="quant-error" role="alert">
          {error}
        </pre>
      ) : null}
    </section>
  );
}
