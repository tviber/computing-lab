import { createMemo, For, Show } from "solid-js";
import { LabeledSlider } from "../../../shared/ui/LabeledSlider";
import { MathFormula, MathText } from "../../../shared/ui/MathFormula";
import type { LinearRegressionDraft } from "../domain/protocol.ts";
import type { StatsConceptQuestion } from "../domain/stages.ts";
import {
  computeOptimalLinearFit,
  evaluateLinearFit,
  LINEAR_INTERCEPT_MAX,
  LINEAR_INTERCEPT_MIN,
  LINEAR_MSE_THRESHOLD,
  LINEAR_SLOPE_MAX,
  LINEAR_SLOPE_MIN,
  roundTo,
} from "../domain/statsMath.ts";
import { ConceptQuestion } from "./ConceptQuestion.tsx";

type Props = {
  draft: LinearRegressionDraft;
  question?: StatsConceptQuestion;
  onChange: (next: LinearRegressionDraft) => void;
};

const SVG_W = 540;
const SVG_H = 320;
const PAD = { left: 52, right: 24, top: 20, bottom: 44 };
const X_MAX = 32;
const Y_MIN = LINEAR_INTERCEPT_MIN;
const Y_MAX = 90;
const Y_TICKS = [-40, -20, 0, 20, 40, 60, 80];
const X_TICKS = [0, 5, 10, 15, 20, 25, 30];

function mapX(temp: number): number {
  return PAD.left + (temp / X_MAX) * (SVG_W - PAD.left - PAD.right);
}

function mapY(cups: number): number {
  return SVG_H - PAD.bottom - ((cups - Y_MIN) / (Y_MAX - Y_MIN)) * (SVG_H - PAD.top - PAD.bottom);
}

const optimal = computeOptimalLinearFit();

export function LinearRegressionPanel(props: Props) {
  const fit = createMemo(() => evaluateLinearFit(props.draft.slope, props.draft.intercept));
  const mseGood = createMemo(() => fit().mse <= LINEAR_MSE_THRESHOLD);

  return (
    <div class="sf-panel">
      <div class="sf-metrics-row">
        <div class={`sf-metric-card ${mseGood() ? "is-good" : ""}`}>
          <span class="sf-metric-label">
            均方误差 <MathFormula>{String.raw`\mathrm{MSE}`}</MathFormula>
          </span>
          <strong class="sf-metric-value">{roundTo(fit().mse, 2)}</strong>
          <span class="sf-metric-sub">
            目标 <MathFormula>{String.raw`\le ${LINEAR_MSE_THRESHOLD}`}</MathFormula>（理论最优{" "}
            <MathFormula>{String.raw`\approx ${roundTo(optimal.mse, 2)}`}</MathFormula>）
          </span>
        </div>
        <div class="sf-metric-card">
          <span class="sf-metric-label">当前直线公式</span>
          <strong class="sf-metric-value sf-mono">
            <MathFormula>{String.raw`y=${roundTo(fit().slope, 2)}x ${fit().intercept >= 0 ? "+" : "-"} ${Math.abs(roundTo(fit().intercept, 1))}`}</MathFormula>
          </strong>
          <span class="sf-metric-sub">
            <MathText>{String.raw`调斜率 $w$，直线绕 $(0,b)$ 旋转；调截距 $b$，直线上下平移`}</MathText>
          </span>
        </div>
        <div class="sf-metric-card">
          <span class="sf-metric-label">预测 30°C 销量</span>
          <strong class="sf-metric-value">{Math.round(fit().predictAt30)} 杯</strong>
          <span class="sf-metric-sub">实际 30°C 那天卖了 76 杯</span>
        </div>
      </div>

      <div class="sf-workspace-grid">
        <div class="sf-chart-card">
          <div class="sf-chart-header">
            <h3>气温 (°C) vs 冰奶茶销量 (杯)</h3>
            <label class="sf-toggle">
              <input
                checked={props.draft.showSquares}
                onChange={(e) =>
                  props.onChange({ ...props.draft, showSquares: e.currentTarget.checked })
                }
                type="checkbox"
              />
              <span>
                <MathText>{String.raw`显示残差方块（$\text{面积}=\text{误差}^2$）`}</MathText>
              </span>
            </label>
          </div>

          <svg
            aria-label="线性回归散点图与残差方块"
            class="sf-svg"
            role="img"
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          >
            {/* Grid lines */}
            <For each={Y_TICKS}>
              {(yVal) => (
                <g>
                  <line
                    class="sf-grid-line"
                    x1={PAD.left}
                    x2={SVG_W - PAD.right}
                    y1={mapY(yVal)}
                    y2={mapY(yVal)}
                  />
                  <text class="sf-axis-tick" text-anchor="end" x={PAD.left - 8} y={mapY(yVal) + 4}>
                    {yVal}
                  </text>
                </g>
              )}
            </For>
            <For each={X_TICKS}>
              {(xVal) => (
                <g>
                  <line
                    class="sf-grid-line"
                    x1={mapX(xVal)}
                    x2={mapX(xVal)}
                    y1={PAD.top}
                    y2={SVG_H - PAD.bottom}
                  />
                  <text class="sf-axis-tick" text-anchor="middle" x={mapX(xVal)} y={SVG_H - 22}>
                    {xVal}°C
                  </text>
                </g>
              )}
            </For>

            {/* Axes */}
            <line
              class="sf-axis-line"
              x1={PAD.left}
              x2={SVG_W - PAD.right}
              y1={mapY(0)}
              y2={mapY(0)}
            />
            <line
              class="sf-axis-line"
              x1={PAD.left}
              x2={PAD.left}
              y1={PAD.top}
              y2={SVG_H - PAD.bottom}
            />
            <text class="sf-axis-label" text-anchor="middle" x={SVG_W / 2} y={SVG_H - 4}>
              当天最高气温 (°C)
            </text>
            <text
              class="sf-axis-label"
              text-anchor="middle"
              transform={`rotate(-90 16 ${SVG_H / 2})`}
              x={16}
              y={SVG_H / 2}
            >
              冰奶茶销量 (杯)
            </text>

            <defs>
              <clipPath id="sf-fit-plot">
                <rect
                  height={SVG_H - PAD.top - PAD.bottom}
                  width={SVG_W - PAD.left - PAD.right}
                  x={PAD.left}
                  y={PAD.top}
                />
              </clipPath>
            </defs>
            <g clip-path="url(#sf-fit-plot)">
              <For each={fit().residuals}>
                {(pt) => {
                  const cx = mapX(pt.temp);
                  const cyActual = mapY(pt.cups);
                  const cyPred = mapY(pt.predicted);
                  const side = Math.abs(cyActual - cyPred);
                  const topY = Math.min(cyActual, cyPred);
                  return (
                    <g>
                      <Show when={props.draft.showSquares && side > 1}>
                        <rect
                          class="sf-residual-square"
                          height={side}
                          width={side}
                          x={cx}
                          y={topY}
                        />
                      </Show>
                      <line class="sf-residual-line" x1={cx} x2={cx} y1={cyActual} y2={cyPred} />
                    </g>
                  );
                }}
              </For>

              {/* Fitted line */}
              <line
                class="sf-fit-line"
                x1={mapX(0)}
                x2={mapX(X_MAX)}
                y1={mapY(fit().intercept)}
                y2={mapY(fit().slope * X_MAX + fit().intercept)}
              />
            </g>
            <circle class="sf-marker-dot" cx={mapX(0)} cy={mapY(fit().intercept)} r={5}>
              <title>截距 (0, {fit().intercept})</title>
            </circle>
            {/* Data points */}
            <For each={fit().residuals}>
              {(pt) => (
                <circle class="sf-data-dot" cx={mapX(pt.temp)} cy={mapY(pt.cups)} r={5}>
                  <title>
                    第 {pt.day} 天：{pt.temp}°C，实际 {pt.cups} 杯，预测 {roundTo(pt.predicted, 1)}{" "}
                    杯
                  </title>
                </circle>
              )}
            </For>
          </svg>
        </div>

        <div class="sf-controls-card">
          <h3>动手调直线</h3>
          <LabeledSlider
            label={<MathText>{String.raw`斜率 $w$（每升高 1°C 多卖几杯）`}</MathText>}
            max={LINEAR_SLOPE_MAX}
            min={LINEAR_SLOPE_MIN}
            onChange={(slope) => props.onChange({ ...props.draft, slope })}
            step={0.1}
            value={props.draft.slope}
          />
          <LabeledSlider
            label={<MathText>{String.raw`截距 $b$（基准偏移量）`}</MathText>}
            max={LINEAR_INTERCEPT_MAX}
            min={LINEAR_INTERCEPT_MIN}
            onChange={(intercept) => props.onChange({ ...props.draft, intercept })}
            step={1}
            value={props.draft.intercept}
          />

          <div class="sf-note-box">
            <strong>小发现：</strong>
            每个红色正方形的边长就是「实际销量 − 预测销量」的绝对值，面积就是误差的平方。把 10
            个正方形的面积加起来再除以 10，就是{" "}
            <MathFormula>{String.raw`\mathrm{MSE}=\frac{1}{10}\sum_{i=1}^{10}(y_i-\hat y_i)^2`}</MathFormula>
            。
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
