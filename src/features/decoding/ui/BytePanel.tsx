import { lazy, Suspense, useId, useState } from "react";
import { BMP_FIELD_OFFSETS, BMP_PROFILE } from "../domain/bmp.ts";
import { bitsToByte, CHAR_TABLE } from "../domain/encoding.ts";
import type { LabPayload } from "../domain/protocol.ts";
import { ByteTable } from "./ByteTable.tsx";

const BmpHeightPractice = lazy(() => import("./BmpHeightPractice.tsx"));

const BMP_FIELDS = [
  {
    start: BMP_FIELD_OFFSETS.pixelOffset,
    label: "像素起点",
    question: "从哪个字节开始读第一个像素？",
  },
  { start: BMP_FIELD_OFFSETS.width, label: "宽", question: "一行有多少个像素？" },
  { start: BMP_FIELD_OFFSETS.height, label: "高", question: "整张图有多少行？" },
];

function BmpBytes({
  bytes,
  allowHeightPractice,
}: {
  bytes: number[];
  allowHeightPractice: boolean;
}) {
  const [field, setField] = useState(BMP_FIELDS[0]);
  const [expanded, setExpanded] = useState(false);
  const [practicing, setPracticing] = useState(false);
  const readerId = useId();
  const tableId = useId();
  const previewLength = BMP_PROFILE.pixelOffset + 2 * BMP_PROFILE.bytesPerPixel;
  return (
    <div className="decoding-byte-reader">
      <div className="decoding-byte-key">
        <h4>{practicing ? "这张图有几行像素？" : "在文件头里找线索"}</h4>
        {practicing ? (
          <p>
            宽度占 #{BMP_FIELD_OFFSETS.width}–{BMP_FIELD_OFFSETS.width + 3}
            。紧接着的四格存着高度。找到它们，再填入行数。
          </p>
        ) : (
          <>
            <div className="decoding-byte-fields" role="group" aria-label="定位文件头字段">
              {BMP_FIELDS.map((item) => (
                <button
                  type="button"
                  key={item.start}
                  aria-pressed={field === item}
                  onClick={() => setField(item)}
                >
                  {item.label}{" "}
                  <code>
                    #{item.start}–{item.start + 3}
                  </code>
                </button>
              ))}
            </div>
            <p aria-live="polite">
              {field.question} 找到 #{field.start - (field.start % 10)} 行的 +{field.start % 10}{" "}
              列，从这里连读 4 格。低位在前，这叫小端。
            </p>
          </>
        )}
        <details className="decoding-bit-clue">
          <summary>四格怎么合成一个数？</summary>
          <p>
            从左往右，四格分别乘以 1、256、256²、256³，再相加。例如 <code>[2, 1, 0, 0]</code> 读作 2
            + 1 × 256 = 258。
          </p>
        </details>
        {allowHeightPractice ? (
          <button
            type="button"
            className="decoding-practice-toggle"
            aria-expanded={practicing}
            aria-controls={readerId}
            onClick={() => setPracticing(!practicing)}
          >
            {practicing ? "返回字段导览" : "试读图像高度"}
          </button>
        ) : null}
      </div>
      <div id={readerId}>
        {practicing ? (
          <Suspense fallback={<p role="status">正在加载读数练习…</p>}>
            <BmpHeightPractice bytes={bytes} />
          </Suspense>
        ) : (
          <>
            <div id={tableId}>
              <ByteTable
                bytes={expanded ? bytes : bytes.slice(0, previewLength)}
                label="BMP 字节，行首加列号是字节编号"
                headerLength={BMP_PROFILE.pixelOffset}
                fieldStart={field.start}
              />
            </div>
            <p className="decoding-byte-legend">
              <span>文件头</span>
              <span>像素数据 · 每 3 格存一个像素</span>
            </p>
            {bytes.length > previewLength ? (
              <button
                className="decoding-byte-more"
                type="button"
                aria-controls={tableId}
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "收起后续字节" : `展开其余 ${bytes.length - previewLength} 字节`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function BytePanel({
  payload,
  allowHeightPractice = false,
}: {
  payload: LabPayload;
  allowHeightPractice?: boolean;
}) {
  if (payload.kind === "files") return null;

  const byteCount =
    payload.kind === "codes"
      ? payload.codes.length
      : payload.kind === "bits"
        ? payload.groups.length
        : payload.bytes.length;

  return (
    <section aria-label="原始数据" className="byte-panel">
      <div className="byte-panel-head">
        <h3>原始数据</h3>
        <span className="decoding-panel-note">
          {byteCount} 字节 · {payload.kind === "bits" ? "二进制" : "十进制"}
        </span>
      </div>

      {payload.kind === "bmp" ? (
        <BmpBytes bytes={payload.bytes} allowHeightPractice={allowHeightPractice} />
      ) : payload.kind === "bits" ? (
        <>
          <ol className="bit-stream" role="list">
            {payload.groups.map((group, i) => (
              <li className="bit-group" key={i} title={`十进制 ${bitsToByte(group)}`}>
                <code>{group}</code>
                <span className="bit-index">#{i}</span>
              </li>
            ))}
          </ol>
          {payload.groups.length > 0 ? (
            <details className="decoding-bit-clue">
              <summary>试读第一组</summary>
              <p>
                <code>{payload.groups[0]}</code> 中为 1 的位相加：
                {[...payload.groups[0]]
                  .flatMap((bit, index) => (bit === "1" ? [2 ** (7 - index)] : []))
                  .join(" + ") || "0"}{" "}
                = {bitsToByte(payload.groups[0])}。在字符编码表里找这个数。
              </p>
            </details>
          ) : null}
        </>
      ) : (
        <ol aria-label="按顺序读取的字节" className="byte-stream" role="list">
          {payload.codes.map((byte, index) => (
            <li key={index} title={`data[${index}]`}>
              {byte}
            </li>
          ))}
        </ol>
      )}

      <details className="char-table" open={payload.kind === "codes"}>
        <summary>字符编码表</summary>
        <ol role="list">
          {CHAR_TABLE.map(({ char, code }) => (
            <li key={code}>
              <span className="char-glyph">{char}</span>
              <span className="char-code">{code}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
