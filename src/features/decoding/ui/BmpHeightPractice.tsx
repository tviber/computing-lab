import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, createUniqueId, Show } from "solid-js";
import { MathFormula } from "../../../shared/ui/MathFormula";
import { BMP_PROFILE, checkBmpHeightReading, type HeightReadingResult } from "../domain/bmp.ts";
import { ByteTable } from "./ByteTable.tsx";

const hints: Record<Exclude<HeightReadingResult, "correct">, string> = {
  "pick-start": "先在表里点选高度的第一格，一次会选中连续四格。",
  "picked-width": "你选中了宽度字段。读完这四格，再向前走一格，就到了高度的开头。",
  "wrong-start": "再找找起点。先沿着宽度字段数满四格，高度从紧跟着的那一格开始。",
  "enter-height": "请把这四格存的行数写成一个大于 0 的十进制整数。",
  "wrong-height": "位置找对了，再核对行数。第一格乘 1，第二格乘 256，后面两格的权重再依次乘 256。",
};

const PLACE_VALUES = ["1", "256", "256^2", "256^3"];

export default function BmpHeightPractice(props: { bytes: readonly number[] }) {
  const [start, setStart] = createSignal<number | null>(null);
  const [answer, setAnswer] = createSignal("");
  const [checked, setChecked] = createSignal(false);
  const feedbackId = createUniqueId();

  const result = createMemo(() =>
    checked() ? checkBmpHeightReading(props.bytes, start(), answer()) : null,
  );
  const numberError = () => result() === "enter-height" || result() === "wrong-height";
  const selected = createMemo(() => {
    const s = start();
    return s === null ? [] : props.bytes.slice(s, s + 4);
  });
  const formula = createMemo(() => {
    const terms = selected().map((byte, index) => String.raw`${byte}\times ${PLACE_VALUES[index]}`);
    return `${terms.join(" + ")} = ${Number(answer())}`;
  });

  const handleAnswer = (value: string) => {
    setAnswer(value);
    setChecked(false);
  };

  return (
    <form
      aria-label="试读图像高度"
      class="decoding-height-practice"
      novalidate
      onSubmit={(event) => {
        event.preventDefault();
        setChecked(true);
      }}
    >
      <fieldset>
        <legend>点选高度的第一格</legend>
        <ByteTable
          bytes={props.bytes.slice(0, BMP_PROFILE.pixelOffset)}
          fieldStart={start() ?? undefined}
          headerLength={BMP_PROFILE.pixelOffset}
          label="文件头字节，行首加列号是字节编号"
          onPickStart={(offset) => {
            setStart(offset);
            setChecked(false);
          }}
        />
      </fieldset>
      <p aria-live="polite" class="decoding-height-selection">
        <Show fallback="选中后，这里会列出连续四个字节。" when={start() !== null}>
          已选{" "}
          <code>
            #{start()}–{start()! + 3}
          </code>
          ，从低位到高位是 <code>[{selected().join(", ")}]</code>。
        </Show>
      </p>
      <div class="decoding-height-answer">
        <label>
          图像高度
          <input
            aria-describedby={numberError() ? feedbackId : undefined}
            aria-invalid={numberError() ? "true" : "false"}
            autocomplete="off"
            inputmode="numeric"
            maxlength={10}
            name="height"
            onChange={(event) => handleAnswer(event.currentTarget.value)}
            onInput={(event) => handleAnswer(event.currentTarget.value)}
            pattern="[0-9]+"
            required
            type="text"
            value={answer()}
          />
          行
        </label>
        <Button class="button button-secondary" type="submit">
          核对读数
        </Button>
      </div>
      <p
        class="decoding-height-feedback"
        data-result={result() ?? undefined}
        id={feedbackId}
        role="status"
      >
        <Show when={result()}>
          {(r) => (
            <Show
              fallback={hints[r() as Exclude<HeightReadingResult, "correct">]}
              when={r() === "correct"}
            >
              读对了。
              <MathFormula>{formula()}</MathFormula>
              。解码器要还原 {Number(answer())} 行像素。
            </Show>
          )}
        </Show>
      </p>
    </form>
  );
}
