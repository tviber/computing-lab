import { useState } from "react";
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

function Distance({ source, candidate }: { source: RGB; candidate: number }) {
  const { rgb, name } = rack[candidate];
  const terms = source.map((value, channel) => `(${value}-${rgb[channel]})^2`);
  return (
    <p>
      <strong>{name}</strong> ·{" "}
      <MathFormula>{`${terms.join(" + ")} = ${colorDist2(source, rgb)}`}</MathFormula>
    </p>
  );
}

export function TonerPrediction({ outputs }: { outputs: (number | null)[] | null }) {
  const [active, setActive] = useState(0);
  const [guesses, setGuesses] = useState<Record<number, number>>({});
  const color = practiceColors[active];
  const guess = guesses[active];
  const correct = guess === color.expected;

  return (
    <div className="quant-prediction">
      <div className="quant-practice-sources" role="group" aria-label="选择练习源色">
        {practiceColors.map((item, index) => (
          <button
            type="button"
            key={item.source}
            className="choice-surface"
            aria-pressed={index === active}
            onClick={() => setActive(index)}
          >
            <span
              aria-hidden="true"
              className="quant-practice-chip"
              style={{ background: rgbCss(item.rgb) }}
            />
            {item.name}
          </button>
        ))}
      </div>
      <p>
        <strong>{color.name}</strong> <code>RGB({color.rgb.join(", ")})</code>{" "}
        会落到哪个候选色？这次把 8 种墨粉都装上，0 号留给纸白。
      </p>
      <div className="quant-practice-rack" role="group" aria-label={`${color.name} 的候选色`}>
        {rack.map((candidate, index) => (
          <button
            type="button"
            key={candidate.name}
            className="choice-surface"
            aria-pressed={guess === index}
            onClick={() => setGuesses((previous) => ({ ...previous, [active]: index }))}
          >
            <span
              aria-hidden="true"
              className="quant-practice-chip"
              style={{ background: rgbCss(candidate.rgb) }}
            />
            <span>
              {index} · {candidate.name}
            </span>
            <small>{candidate.rgb.join(",")}</small>
          </button>
        ))}
      </div>
      <div className="quant-distance" aria-live="polite">
        {guess !== undefined ? (
          <>
            <strong>
              {correct
                ? "猜中了，这是最短距离。"
                : `你选了 ${rack[guess].name}，${rack[color.expected].name} 更近。`}
            </strong>
            <Distance source={color.rgb} candidate={guess} />
            {correct ? null : <Distance source={color.rgb} candidate={color.expected} />}
          </>
        ) : (
          <p>先猜一次，再比较三个通道的平方差之和。数越小，颜色越近。</p>
        )}
      </div>
      {outputs ? (
        <ul className="quant-practice-results" aria-label="六种源色的代码检查结果">
          {practiceColors.map((item, index) => {
            const output = outputs[index];
            const match = output === item.expected;
            return (
              <li key={item.source}>
                <strong>{item.name}</strong> → {output == null ? "无效返回值" : rack[output].name} ·{" "}
                {match ? "一致" : `规则选 ${rack[item.expected].name}`}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
