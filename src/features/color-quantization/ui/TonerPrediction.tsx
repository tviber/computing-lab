import { createMemo, createSignal, For, Show } from "solid-js";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
import { MathFormula } from "../../../shared/ui/MathFormula";
import {
  colorDist2,
  PAPER,
  rgbCss,
  SOURCE_COLORS,
  TONER_RACK,
  type RGB,
} from "../domain/palette.ts";
import { nnTable } from "../domain/quantize.ts";

const rack = [{ name: "纸白", rgb: PAPER }, ...TONER_RACK];
const loadout = TONER_RACK.map((_, index) => index);
const nearest = nnTable(loadout);
export const practiceColors = [0, 1, 3, 6, 8, 13].map((index) => ({
  ...SOURCE_COLORS[index],
  source: index + 1,
  expected: nearest[index] + 1,
}));
export const practiceCandidates = rack.map((color) => color.rgb);

function Distance(props: { source: RGB; candidate: number }) {
  const entry = () => rack[props.candidate];
  const formula = createMemo(() => {
    const { rgb } = entry();
    const terms = props.source.map((value, channel) => `(${value}-${rgb[channel]})^2`);
    return `${terms.join(" + ")} = ${colorDist2(props.source, rgb)}`;
  });
  return (
    <p>
      <strong>{entry().name}</strong> · <MathFormula>{formula()}</MathFormula>
    </p>
  );
}

export function TonerPrediction(props: { outputs: (number | null)[] | null }) {
  const [active, setActive] = createSignal(0);
  const [guesses, setGuesses] = createSignal<Record<number, number>>({});
  const color = () => practiceColors[active()];
  const guess = () => guesses()[active()];
  const correct = () => guess() === color().expected;

  return (
    <div class="quant-prediction">
      <SegmentedPicker
        class="quant-practice-sources"
        itemClass="choice-surface"
        label="选择练习源色"
        onChange={(next) => setActive(Number(next))}
        options={practiceColors.map((item, index) => ({
          value: String(index),
          label: (
            <>
              <span
                aria-hidden="true"
                class="quant-practice-chip"
                style={{ background: rgbCss(item.rgb) }}
              />
              {item.name}
            </>
          ),
        }))}
        value={String(active())}
      />
      <p>
        <strong>{color().name}</strong> <code>RGB({color().rgb.join(", ")})</code>{" "}
        会落到哪个候选色？这次把 8 种墨粉都装上，0 号留给纸白。
      </p>
      <SegmentedPicker
        class="quant-practice-rack"
        itemClass="choice-surface"
        label={`${color().name} 的候选色`}
        onChange={(next) => setGuesses((previous) => ({ ...previous, [active()]: Number(next) }))}
        options={rack.map((candidate, index) => ({
          value: String(index),
          label: (
            <>
              <span
                aria-hidden="true"
                class="quant-practice-chip"
                style={{ background: rgbCss(candidate.rgb) }}
              />
              <span>
                {index} · {candidate.name}
              </span>
              <small>{candidate.rgb.join(",")}</small>
            </>
          ),
        }))}
        value={guess() === undefined ? "" : String(guess())}
      />
      <div aria-live="polite" class="quant-distance">
        <Show
          fallback={<p>先猜一次，再比较三个通道的平方差之和。数越小，颜色越近。</p>}
          when={guess() !== undefined}
        >
          <strong>
            {correct()
              ? "猜中了，这是最短距离。"
              : `你选了 ${rack[guess()!].name}，${rack[color().expected].name} 更近。`}
          </strong>
          <Distance candidate={guess()!} source={color().rgb} />
          <Show when={!correct()}>
            <Distance candidate={color().expected} source={color().rgb} />
          </Show>
        </Show>
      </div>
      <Show when={props.outputs}>
        {(outputs) => (
          <ul aria-label="六种源色的代码检查结果" class="quant-practice-results">
            <For each={practiceColors}>
              {(item, index) => {
                const output = () => outputs()[index()];
                const match = () => output() === item.expected;
                return (
                  <li>
                    <strong>{item.name}</strong> →{" "}
                    {output() == null ? "无效返回值" : rack[output()!].name} ·{" "}
                    {match() ? "一致" : `规则选 ${rack[item.expected].name}`}
                  </li>
                );
              }}
            </For>
          </ul>
        )}
      </Show>
    </div>
  );
}
