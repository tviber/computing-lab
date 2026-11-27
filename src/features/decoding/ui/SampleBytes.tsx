import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Disclosure } from "../../../shared/ui/Disclosure";
import type { PixelMatrix } from "../domain/bmp.ts";
import { ByteTable } from "./ByteTable.tsx";

/** Parse `print(list)` output like "[66, 77, 0, ...]" back into ints; null
 *  when the stream isn't a plain int list (then show it verbatim). */
function parseByteList(raw: string): number[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const parts = trimmed.slice(1, -1).split(",");
  if (!parts.every((part) => /^\s*\d+\s*$/.test(part))) return null;
  return parts.map((part) => Number(part));
}

const CHANNELS = ["B", "G", "R"] as const;

/** The generated sample input: copyable, and split one line per stored pixel
 *  row once a decoded image is available — BMP stores bottom row first, so
 *  row tags count down y=h-1 … y=0. */
export function SampleBytes(props: { raw: string; pixels: PixelMatrix | null }) {
  const [copied, setCopied] = createSignal(false);
  const [fileRow, setFileRow] = createSignal(0);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  onCleanup(() => {
    if (copyTimeout !== null) clearTimeout(copyTimeout);
  });

  const bytes = createMemo(() => parseByteList(props.raw));
  const grouped = createMemo(() => {
    const b = bytes();
    const p = props.pixels;
    if (!b || !p) return null;
    const h = p.length;
    const w = p[0]?.length ?? 0;
    const headerLen = b.length - h * w * 3;
    if (w === 0 || headerLen <= 0) return null;
    const rows: number[][] = [];
    for (let i = 0; i < h; i += 1) {
      rows.push(b.slice(headerLen + i * w * 3, headerLen + (i + 1) * w * 3));
    }
    return { header: b.slice(0, headerLen), rows, h, w };
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.raw);
      setCopied(true);
      if (copyTimeout !== null) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        setCopied(false);
        copyTimeout = null;
      }, 1500);
    } catch {
      // clipboard unavailable (e.g. non-secure context) — nothing to copy to
    }
  };

  const rowIndex = () => {
    const g = grouped();
    return g ? Math.min(fileRow(), g.h - 1) : 0;
  };

  return (
    <>
      <div class="decode-example-bytes-head">
        <h4>样例输入</h4>
        <Button class="button button-ghost decode-copy" onClick={() => void copy()} type="button">
          {copied() ? "已复制" : "复制"}
        </Button>
      </div>
      <Show
        fallback={
          <pre class="decode-example-bytes">
            <code>{props.raw}</code>
          </pre>
        }
        when={grouped()}
      >
        {(g) => {
          const cols = createMemo(() => Array.from({ length: g().w }, (_, column) => column));
          return (
            <div class="decoding-sample">
              <Disclosure summary={`样例文件头 · ${g().header.length} 字节`}>
                <ByteTable
                  bytes={g().header}
                  headerLength={g().header.length}
                  label="样例文件头字节"
                />
              </Disclosure>
              <label class="decoding-sample-row">
                按文件顺序查看像素行
                <select
                  onChange={(event) => setFileRow(Number(event.currentTarget.value))}
                  value={rowIndex()}
                >
                  <For each={g().rows}>
                    {(_, index) => (
                      <option selected={index() === rowIndex()} value={index()}>
                        第 {index() + 1} 行 → 图上 y={g().h - 1 - index()}
                      </option>
                    )}
                  </For>
                </select>
              </label>
              <div
                aria-label="样例像素通道"
                class="decoding-sample-scroll"
                role="region"
                tabindex={0}
              >
                <table
                  aria-label="每个像素的三个字节，按 B、G、R 顺序"
                  class="decoding-byte-table"
                  style={{ "min-width": `${(g().w + 1) * 2.15}rem` }}
                >
                  <thead>
                    <tr>
                      <th scope="col">通道</th>
                      <For each={cols()}>{(column) => <th scope="col">x={column}</th>}</For>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={CHANNELS}>
                      {(channel, offset) => (
                        <tr>
                          <th scope="row">{channel}</th>
                          <For each={cols()}>
                            {(column) => <td>{g().rows[rowIndex()][column * 3 + offset()]}</td>}
                          </For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          );
        }}
      </Show>
    </>
  );
}
