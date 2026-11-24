import { useId, useState } from "react";
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

export default function BmpHeightPractice({ bytes }: { bytes: readonly number[] }) {
  const [start, setStart] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const feedbackId = useId();
  const result = checked ? checkBmpHeightReading(bytes, start, answer) : null;
  const numberError = result === "enter-height" || result === "wrong-height";
  const selected = start === null ? [] : bytes.slice(start, start + 4);

  const placeValues = ["1", "256", "256^2", "256^3"];
  const terms = selected.map((byte, index) => String.raw`${byte}\times ${placeValues[index]}`);

  return (
    <form
      aria-label="试读图像高度"
      className="decoding-height-practice"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setChecked(true);
      }}
    >
      <fieldset>
        <legend>点选高度的第一格</legend>
        <ByteTable
          bytes={bytes.slice(0, BMP_PROFILE.pixelOffset)}
          label="文件头字节，行首加列号是字节编号"
          headerLength={BMP_PROFILE.pixelOffset}
          fieldStart={start ?? undefined}
          onPickStart={(offset) => {
            setStart(offset);
            setChecked(false);
          }}
        />
      </fieldset>
      <p className="decoding-height-selection" aria-live="polite">
        {start === null ? (
          "选中后，这里会列出连续四个字节。"
        ) : (
          <>
            已选{" "}
            <code>
              #{start}–{start + 3}
            </code>
            ，从低位到高位是 <code>[{selected.join(", ")}]</code>。
          </>
        )}
      </p>
      <div className="decoding-height-answer">
        <label>
          图像高度
          <input
            aria-describedby={numberError ? feedbackId : undefined}
            aria-invalid={numberError}
            autoComplete="off"
            inputMode="numeric"
            maxLength={10}
            name="height"
            onChange={(event) => {
              setAnswer(event.target.value);
              setChecked(false);
            }}
            pattern="[0-9]+"
            required
            type="text"
            value={answer}
          />
          行
        </label>
        <button className="button button-secondary" type="submit">
          核对读数
        </button>
      </div>
      <p id={feedbackId} role="status" className="decoding-height-feedback" data-result={result}>
        {result === "correct" ? (
          <>
            读对了。
            <MathFormula>{`${terms.join(" + ")} = ${Number(answer)}`}</MathFormula>
            。解码器要还原 {Number(answer)} 行像素。
          </>
        ) : result ? (
          hints[result]
        ) : null}
      </p>
    </form>
  );
}
