/**
 * choose_toners(toners, palette, images, k) — the student-written loading
 * decision, run in the Pyodide worker. It receives the toner rack, the
 * source palette, and the public gallery as palette-index grids, so the
 * choice is computed from the data instead of being a guessed constant.
 * Its return value fills the toner-slot draft; the submission itself is
 * still just the index list, so the server never executes code.
 *
 * Earlier-stage functions stay callable: the student's own nearest_toner
 * from stage 1 is injected, and reference nn_table(subset) / quantize()
 * helpers are always available — nn_table calls whatever nearest_toner is
 * defined.
 */

import { useMemo, useState } from "react";
import { Icon } from "../../../shared/ui/Icon";
import { PythonEditor } from "../../../shared/ui/PythonEditor";
import { imageToLists } from "../domain/indexed.ts";
import { publicGalleryFor } from "../domain/fixtures.ts";
import { SOURCE_COLORS, TONER_RACK } from "../domain/palette.ts";
import type { QuantStageDef } from "../domain/stages.ts";
import { runChooseToners } from "./pyodideRunner.ts";

const STARTER = `def choose_toners(toners, palette, images, k):
    # toners:  粉架, toners[i] = [r,g,b] (i = 0..7)
    # palette: 源色板, palette[j] = [r,g,b] (j 对应图像里的编号 j+1)
    # images:  这一类所有图片, 每张 64×64, 像素是源色编号 (0 = 纸)
    # k:       最多能装几种粉
    # 还可以直接调用:
    #   nearest_toner(r, g, b, toners) —— 你在第 1 关写的规则 (toners[0] 是纸白)
    #   nn_table(subset)    —— 装 subset 这组粉时, 每个源色落到哪 (表值: 粉编号或 -1=纸)
    #   quantize(image, table) —— 用映射表打印一张图, 返回 toner 编号网格 (0 = 纸)
    # 任务: 返回一个编号列表, 决定装哪几种粉 (len <= k)
    return [0, 1, 2, 3]
`;

export function ChooseTonersPanel({
  stage,
  code,
  helperCode,
  onCodeChange,
  onToners,
}: {
  stage: QuantStageDef;
  code: string;
  /** The student's stage-1 nearest_toner source; injected before each run. */
  helperCode: string;
  onCodeChange: (code: string) => void;
  onToners: (toners: number[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [helperFailed, setHelperFailed] = useState(false);
  const [running, setRunning] = useState(false);

  const source = code.trim() ? code : STARTER;
  const images = useMemo(
    () => publicGalleryFor(stage.category).map((entry) => imageToLists(entry.image)),
    [stage.category],
  );

  const run = async () => {
    setRunning(true);
    setError(null);
    setApplied(null);
    try {
      const { results, helperFailed: helperErr } = await runChooseToners(
        source,
        TONER_RACK.map((t) => [...t.rgb]),
        SOURCE_COLORS.map((c) => [...c.rgb]),
        images,
        stage.tonerSlots ?? 4,
        helperCode,
      );
      setHelperFailed(helperErr);
      const values = Array.isArray(results) ? results : [results];
      const toners = values.map((v) => Number(v));
      if (
        !toners.length ||
        toners.some((v) => !Number.isInteger(v) || v < 0 || v >= TONER_RACK.length)
      ) {
        throw new Error("choose_toners 需要返回一个墨粉编号列表（0～7）。");
      }
      onToners(toners);
      setApplied(
        `choose_toners(...) → 装入 [${[...new Set(toners)].sort((a, b) => a - b).join(", ")}]`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section aria-labelledby="choose-toners-title" className="quant-panel">
      <h3 id="choose-toners-title">把装粉策略写成代码（可选）</h3>
      <p>
        写一个 <code>choose_toners(toners, palette, images, k)</code> 函数：它会拿到粉架、
        源色板和上面公开图库的全部 {images.length} 张图（64×64 的源色编号网格），
        由你的代码算出要装哪几种粉并填入上方——注意它对整个类别只返回一组选择。
      </p>
      <p className="quant-helper-note">
        可以直接调用的函数：<code>nearest_toner(r, g, b, toners)</code>（第 1 关你写的最近色规则）、
        <code>nn_table(subset)</code>（装这组粉时每个源色落到哪）、
        <code>quantize(image, table)</code>（按映射表打印一张图）。
      </p>
      <PythonEditor
        ariaLabel="choose_toners 代码"
        className="quant-editor"
        height="220px"
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
          {running ? "运行中…" : "运行并装入粉槽"}
        </button>
        {applied ? <span className="quant-badge is-pass">{applied}</span> : null}
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
