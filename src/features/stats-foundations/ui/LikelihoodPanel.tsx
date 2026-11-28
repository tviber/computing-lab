import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, For, Show } from "solid-js";
import { LabeledSlider } from "../../../shared/ui/LabeledSlider";
import { MathFormula, MathText } from "../../../shared/ui/MathFormula";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
import type { LikelihoodDraft } from "../domain/protocol.ts";
import type { StatsConceptQuestion } from "../domain/stages.ts";
import {
  COIN_HEADS,
  COIN_MLE_OPTIMAL,
  COIN_P_MAX,
  COIN_P_MIN,
  COIN_TAILS,
  COIN_TOSSES,
  coinLikelihood,
  coinNegLogLikelihood,
  isNearCoinMLE,
  roundTo,
  sampleLikelihoodCurve,
} from "../domain/statsMath.ts";
import { ConceptQuestion } from "./ConceptQuestion.tsx";

type Props = {
  draft: LikelihoodDraft;
  question?: StatsConceptQuestion;
  onChange: (next: LikelihoodDraft) => void;
};

const SVG_W = 540;
const SVG_H = 270;
const PAD = { left: 56, right: 24, top: 20, bottom: 42 };
const P_TICKS = [0.1, 0.3, 0.5, 0.7, 0.9];
const CURVE = sampleLikelihoodCurve(90);
const MAX_L = coinLikelihood(COIN_MLE_OPTIMAL);
const MAX_NLL = Math.max(...CURVE.map((point) => point.nll));
const VIEW_OPTIONS: readonly { value: LikelihoodDraft["viewMode"]; label: string }[] = [
  { value: "likelihood", label: "似然 $L(p)$" },
  { value: "nll", label: "负对数似然 $-\\ln L(p)$" },
];

export function LikelihoodPanel(props: Props) {
  const [simResult, setSimResult] = createSignal<string | null>(null);
  const currentL = createMemo(() => coinLikelihood(props.draft.p));
  const expParts = createMemo(() => currentL().toExponential(3).split("e"));
  const currentNll = createMemo(() => coinNegLogLikelihood(props.draft.p));
  const isNearPeak = createMemo(() => isNearCoinMLE(props.draft.p));

  const isNll = createMemo(() => props.draft.viewMode === "nll");
  const maxY = createMemo(() => (isNll() ? MAX_NLL : MAX_L * 1.18));
  const minY = createMemo(() => (isNll() ? 5.5 : 0));

  const mapX = (p: number) => PAD.left + p * (SVG_W - PAD.left - PAD.right);
  const mapY = (val: number) => {
    const hi = maxY();
    const lo = minY();
    const clamped = Math.min(hi, Math.max(lo, val));
    return SVG_H - PAD.bottom - ((clamped - lo) / (hi - lo)) * (SVG_H - PAD.top - PAD.bottom);
  };

  const pathD = createMemo(() =>
    CURVE.map((pt, i) => {
      const x = mapX(pt.p);
      const y = mapY(isNll() ? pt.nll : pt.likelihood);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" "),
  );

  const yTicks = createMemo(() => [minY(), (minY() + maxY()) / 2, maxY()]);
  const curX = createMemo(() => mapX(props.draft.p));
  const curY = createMemo(() => mapY(isNll() ? currentNll() : currentL()));

  const runSimulation = () => {
    let heads = 0;
    for (let i = 0; i < 10; i++) {
      if (Math.random() < props.draft.p) heads += 1;
    }
    setSimResult(
      `按你猜的 $p = ${roundTo(props.draft.p, 2)}$ 模拟抛 10 次：出现 ${heads} 正 ${10 - heads} 反`,
    );
  };

  return (
    <div class="sf-panel">
      <div class="sf-coins-banner">
        <div class="sf-coins-label">
          <strong>实测 10 次抛掷记录：</strong>
          <span>
            {COIN_HEADS} 次正面 · {COIN_TAILS} 次反面
          </span>
        </div>
        <div aria-label="10次抛硬币记录" class="sf-coins-row">
          <For each={COIN_TOSSES}>
            {(side) => (
              <span class={`sf-coin is-${side === "H" ? "heads" : "tails"}`}>
                {side === "H" ? "正" : "反"}
              </span>
            )}
          </For>
        </div>
      </div>

      <div class="sf-metrics-row">
        <div class={`sf-metric-card ${isNearPeak() ? "is-good" : ""}`}>
          <span class="sf-metric-label">
            你猜的正面概率 <MathFormula>{String.raw`p`}</MathFormula>
          </span>
          <strong class="sf-metric-value sf-mono">{roundTo(props.draft.p, 2)}</strong>
          <span class="sf-metric-sub">
            {isNearPeak() ? "已到达似然峰顶附近。" : "拖动滑块寻找峰顶 / 谷底。"}
          </span>
        </div>
        <div class="sf-metric-card">
          <span class="sf-metric-label">
            似然 <MathFormula>{String.raw`L(p)=p^7(1-p)^3`}</MathFormula>
          </span>
          <strong class="sf-metric-value sf-mono">
            <MathFormula>{String.raw`${expParts()[0]}\times10^{${Number(expParts()[1])}}`}</MathFormula>
          </strong>
          <span class="sf-metric-sub">越大表示该参数下这串记录越可能出现</span>
        </div>
        <div class="sf-metric-card">
          <span class="sf-metric-label">
            负对数似然 <MathFormula>{String.raw`-\ln L(p)`}</MathFormula>
          </span>
          <strong class="sf-metric-value sf-mono">{roundTo(currentNll(), 3)}</strong>
          <span class="sf-metric-sub">越小越好（逻辑回归的损失函数）</span>
        </div>
      </div>

      <div class="sf-workspace-grid">
        <div class="sf-chart-card">
          <div class="sf-chart-header">
            <h3>
              <MathText>
                {isNll()
                  ? "负对数似然曲线 $-\\ln L(p)$（找最低谷）"
                  : "似然曲线 $L(p)$（找最高峰）"}
              </MathText>
            </h3>
            <SegmentedPicker
              label="曲线视图"
              onChange={(viewMode) => props.onChange({ ...props.draft, viewMode })}
              options={VIEW_OPTIONS.map((option) => ({
                ...option,
                label: <MathText>{option.label}</MathText>,
              }))}
              value={props.draft.viewMode}
            />
          </div>

          <svg
            aria-label={isNll() ? "负对数似然曲线" : "似然函数曲线"}
            class="sf-svg"
            role="img"
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          >
            <For each={P_TICKS}>
              {(pTick) => (
                <g>
                  <line
                    class="sf-grid-line"
                    x1={mapX(pTick)}
                    x2={mapX(pTick)}
                    y1={PAD.top}
                    y2={SVG_H - PAD.bottom}
                  />
                  <text class="sf-axis-tick" text-anchor="middle" x={mapX(pTick)} y={SVG_H - 22}>
                    {pTick.toFixed(1)}
                  </text>
                </g>
              )}
            </For>

            <line
              class="sf-axis-line"
              x1={PAD.left}
              x2={SVG_W - PAD.right}
              y1={SVG_H - PAD.bottom}
              y2={SVG_H - PAD.bottom}
            />
            <line
              class="sf-axis-line"
              x1={PAD.left}
              x2={PAD.left}
              y1={PAD.top}
              y2={SVG_H - PAD.bottom}
            />
            <text class="sf-axis-label" text-anchor="middle" x={SVG_W / 2} y={SVG_H - 4}>
              猜测的正面概率
            </text>

            <For each={yTicks()}>
              {(tick) => (
                <text class="sf-axis-tick" text-anchor="end" x={PAD.left - 5} y={mapY(tick) + 3}>
                  {isNll() ? tick.toFixed(1) : tick.toFixed(4)}
                </text>
              )}
            </For>
            {/* Curve */}
            <path class="sf-curve-path" d={pathD()} fill="none" />

            {/* Current p marker */}
            <line
              class="sf-guide-line"
              x1={curX()}
              x2={curX()}
              y1={PAD.top}
              y2={SVG_H - PAD.bottom}
            />
            <circle class="sf-marker-dot" cx={curX()} cy={curY()} r={6} />
          </svg>
        </div>

        <div class="sf-controls-card">
          <h3>猜测硬币的偏向程度</h3>
          <LabeledSlider
            label={
              <>
                正面朝上的概率 <MathFormula>{String.raw`p`}</MathFormula>
              </>
            }
            max={Math.round(COIN_P_MAX * 100)}
            min={Math.round(COIN_P_MIN * 100)}
            onChange={(percent) => props.onChange({ ...props.draft, p: percent / 100 })}
            step={1}
            value={Math.round(props.draft.p * 100)}
            valueText={String(roundTo(props.draft.p, 2))}
            valueClass="sf-mono"
          />

          <div class="sf-note-box">
            <strong>为什么是连乘？</strong>
            <br />
            每次抛硬币相互独立，所以按上面的顺序抛出这 10 个结果的联合概率是：
            <div class="sf-formula-line sf-mono">
              <MathFormula>{String.raw`L(${roundTo(props.draft.p, 2)})=${roundTo(props.draft.p, 2)}^{${COIN_HEADS}}\times${roundTo(1 - props.draft.p, 2)}^{${COIN_TAILS}}`}</MathFormula>
            </div>
          </div>

          <div class="sf-sim-box">
            <Button class="sf-secondary-btn" onClick={runSimulation} type="button">
              用当前 <MathFormula>{String.raw`p`}</MathFormula> 模拟再抛 10 次
            </Button>
            <Show when={simResult()}>
              {(result) => (
                <p class="sf-sim-result">
                  <MathText>{result()}</MathText>
                </p>
              )}
            </Show>
          </div>
        </div>
      </div>

      <Show when={props.question}>
        {(q) => (
          <ConceptQuestion
            answer={props.draft.answer}
            onAnswer={(answer) => props.onChange({ ...props.draft, answer })}
            question={q()}
          />
        )}
      </Show>
    </div>
  );
}
