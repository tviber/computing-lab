import { useMemo, useState } from "react";
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

/** The generated sample input: copyable, and split one line per stored pixel
 *  row once a decoded image is available — BMP stores bottom row first, so
 *  row tags count down y=h-1 … y=0. */
export function SampleBytes({ raw, pixels }: { raw: string; pixels: PixelMatrix | null }) {
  const [copied, setCopied] = useState(false);
  const [fileRow, setFileRow] = useState(0);
  const bytes = useMemo(() => parseByteList(raw), [raw]);
  const grouped = useMemo(() => {
    if (!bytes || !pixels) return null;
    const h = pixels.length;
    const w = pixels[0]?.length ?? 0;
    const headerLen = bytes.length - h * w * 3;
    if (w === 0 || headerLen <= 0) return null;
    const rows: number[][] = [];
    for (let i = 0; i < h; i += 1) {
      rows.push(bytes.slice(headerLen + i * w * 3, headerLen + (i + 1) * w * 3));
    }
    return { header: bytes.slice(0, headerLen), rows, h, w };
  }, [bytes, pixels]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (e.g. non-secure context) — nothing to copy to
    }
  };
  const rowIndex = grouped ? Math.min(fileRow, grouped.h - 1) : 0;
  return (
    <>
      <div className="decode-example-bytes-head">
        <h4>样例输入</h4>
        <button
          className="button button-ghost decode-copy"
          onClick={() => void copy()}
          type="button"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      {grouped ? (
        <div className="decoding-sample">
          <details>
            <summary>样例文件头 · {grouped.header.length} 字节</summary>
            <ByteTable
              bytes={grouped.header}
              headerLength={grouped.header.length}
              label="样例文件头字节"
            />
          </details>
          <label className="decoding-sample-row">
            按文件顺序查看像素行
            <select value={rowIndex} onChange={(event) => setFileRow(Number(event.target.value))}>
              {grouped.rows.map((_, index) => (
                <option key={index} value={index}>
                  第 {index + 1} 行 → 图上 y={grouped.h - 1 - index}
                </option>
              ))}
            </select>
          </label>
          <div
            className="decoding-sample-scroll"
            role="region"
            aria-label="样例像素通道"
            tabIndex={0}
          >
            <table
              className="decoding-byte-table"
              aria-label="每个像素的三个字节，按 B、G、R 顺序"
              style={{ minWidth: `${(grouped.w + 1) * 2.15}rem` }}
            >
              <thead>
                <tr>
                  <th scope="col">通道</th>
                  {Array.from({ length: grouped.w }, (_, column) => (
                    <th key={column} scope="col">
                      x={column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {["B", "G", "R"].map((channel, offset) => (
                  <tr key={channel}>
                    <th scope="row">{channel}</th>
                    {Array.from({ length: grouped.w }, (_, column) => (
                      <td key={column}>{grouped.rows[rowIndex][column * 3 + offset]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <pre className="decode-example-bytes">
          <code>{raw}</code>
        </pre>
      )}
    </>
  );
}
