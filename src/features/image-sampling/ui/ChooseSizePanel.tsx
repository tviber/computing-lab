/**
 * choose_size(images) — the student-written encoder decision, run in the
 * Pyodide worker. It receives the public gallery as 0/1 nested lists, so
 * the resolution is computed from the data instead of being a guessed
 * constant. Its return value fills the (width, height) draft; the
 * submission itself is still just the two numbers, so the server never
 * executes code.
 *
 * Earlier-stage functions stay callable: the student's own cell_value
 * from stage 1 is injected, and a reference downsample(image, w, h) is
 * always available — it calls whatever cell_value is defined.
 */

import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, Show } from "solid-js";
import { PythonEditor } from "../../../shared/ui/PythonEditor";
import { imageToLists } from "../domain/bitmap.ts";
import { publicGalleryFor } from "../domain/fixtures.ts";
import type { SamplingStageDef } from "../domain/stages.ts";
import { runChooseSize } from "./pyodideRunner.ts";

const STARTER = (stage: SamplingStageDef) =>
  stage.mode === "square"
    ? `def choose_size(images):
    # images: 这一类所有图片, 每张是 64×64 的二维列表
    #   images[0][y][x] -> 0 (背景) 或 1 (图形)
    # 还可以直接调用:
    #   cell_value(region): 你在第 1 关写的判定规则
    #   downsample(image, w, h): 把一张图缩成 w×h 的 0/1 列表
    # 任务: 分析这些图, 算出一个 n, 让它们缩到 n×n 后仍能区分开
    return 16
`
    : `def choose_size(images):
    # images: 这一类所有图片, 每张是 64×64 的二维列表
    #   images[0][y][x] -> 0 (背景) 或 1 (图形)
    # 还可以直接调用:
    #   cell_value(region): 你在第 1 关写的判定规则
    #   downsample(image, w, h): 把一张图缩成 w×h 的 0/1 列表
    # 任务: 分析这些图, 算出 (宽, 高); 两者可以不同
    return (16, 16)
`;

export function ChooseSizePanel(props: {
  stage: SamplingStageDef;
  code: string;
  /** The student's stage-1 cell_value source; injected before each run. */
  helperCode: string;
  onCodeChange: (code: string) => void;
  onResolution: (width: number, height: number) => void;
}) {
  const required = () => props.stage.requiresChooseSize;
  const [error, setError] = createSignal<string | null>(null);
  const [applied, setApplied] = createSignal<string | null>(null);
  const [running, setRunning] = createSignal(false);

  const source = () => (props.code.trim() ? props.code : STARTER(props.stage));
  const images = createMemo(() =>
    publicGalleryFor(props.stage.category).map((entry) => imageToLists(entry.image)),
  );

  const run = async () => {
    setRunning(true);
    setError(null);
    setApplied(null);
    try {
      const result = await runChooseSize(source(), images(), props.helperCode);
      // `return 16` → scalar; `return (w, h)` → array. A lone n means n×n.
      const values = Array.isArray(result) ? result : [result];
      const [rw, rh] =
        values.length === 1
          ? [Number(values[0]), Number(values[0])]
          : [Number(values[0]), Number(values[1])];
      if (values.length > 2 || !Number.isInteger(rw) || !Number.isInteger(rh)) {
        throw new Error("choose_size 需要返回一个整数 n 或一对整数 (宽, 高)。");
      }
      if (rw < 2 || rh < 2 || rw > 64 || rh > 64) {
        throw new Error("分辨率的宽和高都要在 2～64 之间。");
      }
      if (props.stage.mode === "square" && rw !== rh) {
        throw new Error("这一关要求正方形分辨率：宽和高必须相同。");
      }
      if (props.stage.mode === "tall" && rh <= rw) {
        throw new Error("这一关要求高度大于宽度（高 > 宽）。");
      }
      props.onResolution(rw, rh);
      setApplied(`choose_size(images) → ${rw} × ${rh}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section aria-labelledby="choose-size-title" class="choose-size-panel">
      <h3 id="choose-size-title">把策略写成代码{required() ? "" : "（可选）"}</h3>
      <p>
        {required() ? "本关必须" : "写一个"} <code>choose_size(images)</code>{" "}
        函数：它会拿到上面公开图库的全部 {images().length} 张图（每张 64×64 的 0/1
        列表），由你的代码算出分辨率并填入上方。注意它对整个 category 只返回一个尺寸。
      </p>
      <p class="helper-note">
        前面关卡写的函数可以直接用：<code>cell_value(region)</code>（第 1 关你的判定规则）和{" "}
        <code>downsample(image, w, h)</code>（内部就是逐格调用 cell_value）。
      </p>
      <PythonEditor
        ariaLabel="choose_size 代码"
        className="code-editor"
        height="200px"
        onChange={(value) => props.onCodeChange(value)}
        value={source()}
      />
      <div class="guided-actions">
        <Button
          class="button button-secondary"
          disabled={running()}
          onClick={() => void run()}
          type="button"
        >
          {running() ? "运行中…" : "运行并填入分辨率"}
        </Button>
        <Show when={applied()}>{(msg) => <span class="badge badge-pass">{msg()}</span>}</Show>
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
