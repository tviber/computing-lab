import { MathFormula } from "../../../shared/ui/MathFormula";
import { Button } from "@ui-sdk/solid/button";
import { createSignal, createUniqueId, For, lazy, Loading, Match, Show, Switch } from "solid-js";
import { Disclosure } from "../../../shared/ui/Disclosure";
import { DisclosureChevron } from "../../../shared/ui/DisclosureChevron";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
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

function BmpBytes(props: { bytes: number[]; allowHeightPractice: boolean }) {
  const [field, setField] = createSignal(BMP_FIELDS[0]);
  const [expanded, setExpanded] = createSignal(false);
  const [practicing, setPracticing] = createSignal(false);
  const readerId = createUniqueId();
  const tableId = createUniqueId();
  const previewLength = BMP_PROFILE.pixelOffset + 2 * BMP_PROFILE.bytesPerPixel;

  return (
    <div class="decoding-byte-reader">
      <div class="decoding-byte-key">
        <h4>{practicing() ? "这张图有几行像素？" : "在文件头里找线索"}</h4>
        <Show
          fallback={
            <>
              <SegmentedPicker
                class="decoding-byte-fields"
                itemClass="choice-surface"
                label="定位文件头字段"
                onChange={(next) => {
                  const item = BMP_FIELDS.find((candidate) => String(candidate.start) === next);
                  if (item) setField(item);
                }}
                options={BMP_FIELDS.map((item) => ({
                  value: String(item.start),
                  label: (
                    <>
                      {item.label}{" "}
                      <code>
                        #{item.start}–{item.start + 3}
                      </code>
                    </>
                  ),
                }))}
                value={String(field().start)}
              />
              <p aria-live="polite">
                {field().question} 找到 #{field().start - (field().start % 10)} 行的 +
                {field().start % 10} 列，从这里连读 4 格。低位在前，这叫小端。
              </p>
            </>
          }
          when={practicing()}
        >
          <p>
            宽度占 #{BMP_FIELD_OFFSETS.width}–{BMP_FIELD_OFFSETS.width + 3}
            。紧接着的四格存着高度。找到它们，再填入行数。
          </p>
        </Show>
        <Disclosure class="decoding-bit-clue" summary="四格怎么合成一个数？">
          <p>
            从左往右，四格分别乘以 <MathFormula>{String.raw`1,256,256^2,256^3`}</MathFormula>
            ，再相加。例如 <code>[2, 1, 0, 0]</code> 读作{" "}
            <MathFormula>{String.raw`2+1\times256=258`}</MathFormula>。
          </p>
        </Disclosure>
        <Show when={props.allowHeightPractice}>
          <Button
            aria-controls={readerId}
            aria-expanded={practicing() ? "true" : "false"}
            class="decoding-practice-toggle"
            onClick={() => setPracticing((p) => !p)}
            type="button"
          >
            {practicing() ? "返回字段导览" : "试读图像高度"}
          </Button>
        </Show>
      </div>
      <div id={readerId}>
        <Show
          fallback={
            <>
              <div id={tableId}>
                <ByteTable
                  bytes={expanded() ? props.bytes : props.bytes.slice(0, previewLength)}
                  fieldStart={field().start}
                  headerLength={BMP_PROFILE.pixelOffset}
                  label="BMP 字节，行首加列号是字节编号"
                />
              </div>
              <p class="decoding-byte-legend">
                <span>文件头</span>
                <span>像素数据 · 每 3 格存一个像素</span>
              </p>
              <Show when={props.bytes.length > previewLength}>
                <Button
                  aria-controls={tableId}
                  aria-expanded={expanded() ? "true" : "false"}
                  class="decoding-byte-more"
                  onClick={() => setExpanded((e) => !e)}
                  type="button"
                >
                  <DisclosureChevron expandDirection="up" open={expanded()} size={12} />
                  {expanded()
                    ? "收起后续字节"
                    : `展开其余 ${props.bytes.length - previewLength} 字节`}
                </Button>
              </Show>
            </>
          }
          when={practicing()}
        >
          <Loading fallback={<p role="status">正在加载读数练习…</p>}>
            <BmpHeightPractice bytes={props.bytes} />
          </Loading>
        </Show>
      </div>
    </div>
  );
}

export function BytePanel(props: { payload: LabPayload; allowHeightPractice?: boolean }) {
  const byteCount = () => {
    const p = props.payload;
    if (p.kind === "codes") return p.codes.length;
    if (p.kind === "bits") return p.groups.length;
    if (p.kind === "bmp") return p.bytes.length;
    return 0;
  };

  return (
    <Show when={props.payload.kind !== "files"}>
      <section aria-label="原始数据" class="byte-panel">
        <div class="byte-panel-head">
          <h3>原始数据</h3>
          <span class="decoding-panel-note">
            {byteCount()} 字节 · {props.payload.kind === "bits" ? "二进制" : "十进制"}
          </span>
        </div>

        <Switch>
          <Match when={props.payload.kind === "bmp" ? props.payload : null}>
            {(bmp) => (
              <BmpBytes
                allowHeightPractice={props.allowHeightPractice ?? false}
                bytes={bmp().bytes}
              />
            )}
          </Match>
          <Match when={props.payload.kind === "bits" ? props.payload : null}>
            {(bits) => (
              <>
                <ol class="bit-stream" role="list">
                  <For each={bits().groups}>
                    {(group, i) => (
                      <li class="bit-group" title={`十进制 ${bitsToByte(group)}`}>
                        <code>{group}</code>
                        <span class="bit-index">#{i()}</span>
                      </li>
                    )}
                  </For>
                </ol>
                <Show when={bits().groups.length > 0}>
                  <Disclosure class="decoding-bit-clue" summary="试读第一组">
                    <p>
                      <code>{bits().groups[0]}</code> 中为 1 的位相加：
                      <MathFormula>{`${
                        [...bits().groups[0]]
                          .flatMap((bit, index) => (bit === "1" ? [2 ** (7 - index)] : []))
                          .join(" + ") || "0"
                      } = ${bitsToByte(bits().groups[0])}`}</MathFormula>
                      。在字符编码表里找这个数。
                    </p>
                  </Disclosure>
                </Show>
              </>
            )}
          </Match>
          <Match when={props.payload.kind === "codes" ? props.payload : null}>
            {(codes) => (
              <ol aria-label="按顺序读取的字节" class="byte-stream" role="list">
                <For each={codes().codes}>
                  {(byte, index) => <li title={`data[${index()}]`}>{byte}</li>}
                </For>
              </ol>
            )}
          </Match>
        </Switch>

        <Disclosure class="char-table" open={props.payload.kind === "codes"} summary="字符编码表">
          <ol role="list">
            <For each={CHAR_TABLE}>
              {({ char, code }) => (
                <li>
                  <span class="char-glyph">{char}</span>
                  <span class="char-code">{code}</span>
                </li>
              )}
            </For>
          </ol>
        </Disclosure>
      </section>
    </Show>
  );
}
