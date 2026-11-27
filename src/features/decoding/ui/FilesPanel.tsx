/**
 * Stage 4 — the file folder. Each card shows the file's meta line and its raw
 * bytes, and offers the two provided decoders (`decode_as_text` /
 * `decode_as_image`) as buttons. The student runs whichever they think fits,
 * then pins a verdict per file; the artifact of that decoder's last run is
 * what the submission records. Trying the "wrong" decoder is allowed — its
 * output is itself the lesson (letter soup is still a "readable" string).
 */

import { Button } from "@ui-sdk/solid/button";
import { createSignal, For, Show } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import type { PixelMatrix } from "../domain/bmp.ts";
import type { DecoderChoice, LabPayload } from "../domain/protocol.ts";
import { FILE_HELPERS, runDecode } from "../runtime/pyodideRunner.ts";
import { PixelCanvas } from "./PixelCanvas.tsx";

type FileRun = { text?: string; pixels?: PixelMatrix };

export function FilesPanel(props: {
  payload: Extract<LabPayload, { kind: "files" }>;
  verdicts: ({ decoder: DecoderChoice; text?: string; pixels?: PixelMatrix } | null)[];
  onVerdict: (
    fileIndex: number,
    verdict: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix } | null,
    /** Run-completion sync: writes only if the pinned verdict still picks this. */
    expectDecoder?: DecoderChoice,
  ) => void;
}) {
  const [runs, setRuns] = createSignal<Record<number, FileRun>>({});
  const [running, setRunning] = createSignal<{ file: number; decoder: DecoderChoice } | null>(null);
  const [errors, setErrors] = createSignal<Record<number, string>>({});
  const [dims, setDims] = createSignal<Record<number, { w: number; h: number }>>({});

  const dimOf = (index: number) => dims()[index] ?? { w: 8, h: 8 };

  const setDim = (index: number, patch: Partial<{ w: number; h: number }>) => {
    const next = { ...dimOf(index), ...patch };
    setDims((prev) => ({ ...prev, [index]: next }));
  };

  const runText = async (index: number, bytes: number[]) => {
    setRunning({ file: index, decoder: "text" });
    try {
      const result = await runDecode("", bytes, {
        preamble: FILE_HELPERS,
        call: "decode_as_text(data)",
      });
      const text = typeof result === "string" ? result : String(result);
      setRuns((prev) => ({ ...prev, [index]: { ...prev[index], text } }));
      setErrors((prev) => ({ ...prev, [index]: "" }));
      // A pinned verdict on this decoder tracks the fresh run output —
      // expectDecoder makes the write conditional on the CURRENT pin, so a
      // re-pin during the run isn't silently rolled back.
      props.onVerdict(index, { decoder: "text", text }, "text");
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        [index]: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setRunning(null);
    }
  };

  const runImage = async (index: number, bytes: number[]) => {
    const { w, h } = dimOf(index);
    if (!(w > 0 && h > 0)) {
      setErrors((prev) => ({ ...prev, [index]: "宽和高都要是正整数。" }));
      return;
    }
    if (w * h * 3 > bytes.length) {
      setErrors((prev) => ({
        ...prev,
        [index]: `字节不够：${w}×${h} 的图像要 ${w * h * 3} 个字节，这个文件只有 ${bytes.length} 个。`,
      }));
      return;
    }
    setRunning({ file: index, decoder: "image" });
    try {
      const result = await runDecode("", bytes, {
        preamble: FILE_HELPERS,
        call: `decode_as_image(data, ${w}, ${h})`,
      });
      const pixels = result as PixelMatrix;
      setRuns((prev) => ({ ...prev, [index]: { ...prev[index], pixels } }));
      setErrors((prev) => ({ ...prev, [index]: "" }));
      props.onVerdict(index, { decoder: "image", pixels }, "image");
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        [index]: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setRunning(null);
    }
  };

  return (
    <section aria-label="文件列表" class="files-panel">
      <div class="decoding-panel-heading">
        <h3>档案室 · 三个文件</h3>
      </div>
      <ol class="files-list">
        <For each={props.payload.files}>
          {(file, i) => {
            const run = () => runs()[i()] ?? {};
            const verdict = () => props.verdicts[i()] ?? null;
            const dim = () => dimOf(i());
            const busy = () => running() !== null;
            return (
              <li class="file-card">
                <header class="file-card-head">
                  <code class="file-name">{file.id}</code>
                  <span class="file-meta">meta：{file.meta}</span>
                </header>
                <ol
                  aria-label={`${file.id} 字节`}
                  class="byte-stream is-compact"
                  role="list"
                  tabindex={0}
                >
                  <For each={file.bytes}>
                    {(byte, bi) => <li title={`data[${bi()}]`}>{byte}</li>}
                  </For>
                </ol>
                <div class="file-actions">
                  <Button
                    class="button button-secondary"
                    disabled={busy()}
                    onClick={() => void runText(i(), file.bytes)}
                    type="button"
                  >
                    {running()?.file === i() && running()?.decoder === "text"
                      ? "解码中…"
                      : "按字符编码解码"}
                  </Button>
                  <span class="file-image-run">
                    <Button
                      class="button button-secondary"
                      disabled={busy()}
                      onClick={() => void runImage(i(), file.bytes)}
                      type="button"
                    >
                      {running()?.file === i() && running()?.decoder === "image"
                        ? "解码中…"
                        : "按图像解码"}
                    </Button>
                    <label>
                      宽
                      <input
                        aria-label="图像宽度"
                        disabled={busy()}
                        max={32}
                        min={1}
                        onChange={(e) => setDim(i(), { w: Number(e.currentTarget.value) })}
                        onInput={(e) => setDim(i(), { w: Number(e.currentTarget.value) })}
                        type="number"
                        value={dim().w}
                      />
                    </label>
                    <label>
                      高
                      <input
                        aria-label="图像高度"
                        disabled={busy()}
                        max={32}
                        min={1}
                        onChange={(e) => setDim(i(), { h: Number(e.currentTarget.value) })}
                        onInput={(e) => setDim(i(), { h: Number(e.currentTarget.value) })}
                        type="number"
                        value={dim().h}
                      />
                    </label>
                  </span>
                </div>
                <Show when={errors()[i()]}>
                  {(err) => (
                    <p class="file-error" role="alert">
                      {err()}
                    </p>
                  )}
                </Show>
                <Show when={run().text !== undefined}>
                  <p class="file-result">
                    <span class="file-result-label">按字符编码 →</span>
                    <code class="file-result-text">{run().text || "（空串）"}</code>
                  </p>
                </Show>
                <Show when={run().pixels}>
                  {(pixels) => (
                    <div class="file-result">
                      <span class="file-result-label">按图像 →</span>
                      <PixelCanvas ariaLabel="图像解码预览" pixelSize={14} pixels={pixels()} />
                    </div>
                  )}
                </Show>
                <div aria-label={`${file.id} 的判定`} class="file-verdict" role="radiogroup">
                  <span>判定它是：</span>
                  <label class={verdict()?.decoder === "text" ? "is-picked" : ""}>
                    <input
                      checked={verdict()?.decoder === "text"}
                      disabled={run().text === undefined}
                      onChange={() =>
                        props.onVerdict(i(), { decoder: "text", text: run().text ?? "" })
                      }
                      type="radio"
                    />
                    一段文字
                  </label>
                  <label class={verdict()?.decoder === "image" ? "is-picked" : ""}>
                    <input
                      checked={verdict()?.decoder === "image"}
                      disabled={!run().pixels}
                      onChange={() =>
                        props.onVerdict(i(), { decoder: "image", pixels: run().pixels })
                      }
                      type="radio"
                    />
                    一张图像
                  </label>
                  <Show when={verdict()}>
                    <span class="file-verdict-done">
                      已记下判定 <Icon name="check" size={12} />
                    </span>
                  </Show>
                  <Show when={run().text === undefined || !run().pixels}>
                    <span class="file-verdict-hint">先点对应的「解码」跑一遍才能选</span>
                  </Show>
                </div>
              </li>
            );
          }}
        </For>
      </ol>
    </section>
  );
}
