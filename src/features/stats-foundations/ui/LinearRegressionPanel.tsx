import { Field, FieldLabel } from "@ui-sdk/react/field";
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/react/slider";
import { MathFormula } from "../../../shared/ui/MathFormula";
import { ConceptQuestion } from "./ConceptQuestion.tsx";
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

type Props = {
  draft: LinearRegressionDraft;
  question?: StatsConceptQuestion;
  passed: boolean;
  onChange: (next: LinearRegressionDraft) => void;
};

const SVG_W = 540;
const SVG_H = 320;
const PAD = { left: 52, right: 24, top: 20, bottom: 44 };
const X_MAX = 32;
const Y_MIN = LINEAR_INTERCEPT_MIN;
const Y_MAX = 90;

function mapX(temp: number): number {
  return PAD.left + (temp / X_MAX) * (SVG_W - PAD.left - PAD.right);
}

function mapY(cups: number): number {
  return SVG_H - PAD.bottom - ((cups - Y_MIN) / (Y_MAX - Y_MIN)) * (SVG_H - PAD.top - PAD.bottom);
}

const optimal = computeOptimalLinearFit();

function FitSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field>
      <Slider
        className="sf-slider-group"
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={onChange}
      >
        <div className="sf-slider-head">
          <FieldLabel>{label}</FieldLabel>
          <SliderValue className="sf-mono" />
        </div>
        <SliderControl className="sf-fit-slider-control">
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb />
          </SliderTrack>
        </SliderControl>
      </Slider>
    </Field>
  );
}

export function LinearRegressionPanel({ draft, question, passed, onChange }: Props) {
  const fit = evaluateLinearFit(draft.slope, draft.intercept);

  const mseGood = fit.mse <= LINEAR_MSE_THRESHOLD;

  return (
    <div className="sf-panel">
      <div className="sf-metrics-row">
        <div className={`sf-metric-card ${mseGood ? "is-good" : ""}`}>
          <span className="sf-metric-label">均方误差 MSE</span>
          <strong className="sf-metric-value">{roundTo(fit.mse, 2)}</strong>
          <span className="sf-metric-sub">
            目标 ≤ {LINEAR_MSE_THRESHOLD}（理论最优 ≈ {roundTo(optimal.mse, 2)}）
          </span>
        </div>
        <div className="sf-metric-card">
          <span className="sf-metric-label">当前直线公式</span>
          <strong className="sf-metric-value sf-mono">
            y = {roundTo(fit.slope, 2)}x {fit.intercept >= 0 ? "+" : "−"}{" "}
            {Math.abs(roundTo(fit.intercept, 1))}
          </strong>
          <span className="sf-metric-sub">
            调斜率 w，直线绕 (0, b) 旋转；调截距 b，直线上下平移
          </span>
        </div>
        <div className="sf-metric-card">
          <span className="sf-metric-label">预测 30°C 销量</span>
          <strong className="sf-metric-value">{Math.round(fit.predictAt30)} 杯</strong>
          <span className="sf-metric-sub">实际 30°C 那天卖了 76 杯</span>
        </div>
      </div>

      <div className="sf-workspace-grid">
        <div className="sf-chart-card">
          <div className="sf-chart-header">
            <h3>气温 (°C) vs 冰奶茶销量 (杯)</h3>
            <label className="sf-toggle">
              <input
                checked={draft.showSquares}
                onChange={(e) => onChange({ ...draft, showSquares: e.target.checked })}
                type="checkbox"
              />
              <span>显示残差方块（面积 = 误差²）</span>
            </label>
          </div>

          <svg
            role="img"
            aria-label="线性回归散点图与残差方块"
            className="sf-svg"
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          >
            {/* Grid lines */}
            {[-40, -20, 0, 20, 40, 60, 80].map((yVal) => (
              <g key={`gy-${yVal}`}>
                <line
                  className="sf-grid-line"
                  x1={PAD.left}
                  x2={SVG_W - PAD.right}
                  y1={mapY(yVal)}
                  y2={mapY(yVal)}
                />
                <text className="sf-axis-tick" textAnchor="end" x={PAD.left - 8} y={mapY(yVal) + 4}>
                  {yVal}
                </text>
              </g>
            ))}
            {[0, 5, 10, 15, 20, 25, 30].map((xVal) => (
              <g key={`gx-${xVal}`}>
                <line
                  className="sf-grid-line"
                  x1={mapX(xVal)}
                  x2={mapX(xVal)}
                  y1={PAD.top}
                  y2={SVG_H - PAD.bottom}
                />
                <text className="sf-axis-tick" textAnchor="middle" x={mapX(xVal)} y={SVG_H - 22}>
                  {xVal}°C
                </text>
              </g>
            ))}

            {/* Axes */}
            <line
              className="sf-axis-line"
              x1={PAD.left}
              x2={SVG_W - PAD.right}
              y1={mapY(0)}
              y2={mapY(0)}
            />
            <line
              className="sf-axis-line"
              x1={PAD.left}
              x2={PAD.left}
              y1={PAD.top}
              y2={SVG_H - PAD.bottom}
            />
            <text className="sf-axis-label" textAnchor="middle" x={SVG_W / 2} y={SVG_H - 4}>
              当天最高气温 (°C)
            </text>
            <text
              className="sf-axis-label"
              textAnchor="middle"
              transform={`rotate(-90 16 ${SVG_H / 2})`}
              x={16}
              y={SVG_H / 2}
            >
              冰奶茶销量 (杯)
            </text>

            <defs>
              <clipPath id="sf-fit-plot">
                <rect
                  x={PAD.left}
                  y={PAD.top}
                  width={SVG_W - PAD.left - PAD.right}
                  height={SVG_H - PAD.top - PAD.bottom}
                />
              </clipPath>
            </defs>
            <g clipPath="url(#sf-fit-plot)">
              {fit.residuals.map((pt) => {
                const cx = mapX(pt.temp);
                const cyActual = mapY(pt.cups);
                const cyPred = mapY(pt.predicted);
                const side = Math.abs(cyActual - cyPred);
                const topY = Math.min(cyActual, cyPred);
                return (
                  <g key={`res-${pt.day}`}>
                    {draft.showSquares && side > 1 && (
                      <rect
                        className="sf-residual-square"
                        height={side}
                        width={side}
                        x={cx}
                        y={topY}
                      />
                    )}
                    <line className="sf-residual-line" x1={cx} x2={cx} y1={cyActual} y2={cyPred} />
                  </g>
                );
              })}

              {/* Fitted line */}
              <line
                className="sf-fit-line"
                x1={mapX(0)}
                x2={mapX(X_MAX)}
                y1={mapY(fit.intercept)}
                y2={mapY(fit.slope * X_MAX + fit.intercept)}
              />
            </g>
            <circle className="sf-marker-dot" cx={mapX(0)} cy={mapY(fit.intercept)} r={5}>
              <title>截距 (0, {fit.intercept})</title>
            </circle>
            {/* Data points */}
            {fit.residuals.map((pt) => (
              <circle
                className="sf-data-dot"
                cx={mapX(pt.temp)}
                cy={mapY(pt.cups)}
                key={`pt-${pt.day}`}
                r={5}
              >
                <title>
                  第 {pt.day} 天：{pt.temp}°C，实际 {pt.cups} 杯，预测 {roundTo(pt.predicted, 1)} 杯
                </title>
              </circle>
            ))}
          </svg>
        </div>

        <div className="sf-controls-card">
          <h3>动手调直线</h3>
          <FitSlider
            label="斜率 w（每升高 1°C 多卖几杯）"
            value={draft.slope}
            min={LINEAR_SLOPE_MIN}
            max={LINEAR_SLOPE_MAX}
            step={0.1}
            onChange={(slope) => onChange({ ...draft, slope })}
          />
          <FitSlider
            label="截距 b（基准偏移量）"
            value={draft.intercept}
            min={LINEAR_INTERCEPT_MIN}
            max={LINEAR_INTERCEPT_MAX}
            step={1}
            onChange={(intercept) => onChange({ ...draft, intercept })}
          />

          <div className="sf-note-box">
            <strong>小发现：</strong>
            每个红色正方形的边长就是「实际销量 − 预测销量」的绝对值，面积就是误差的平方。把 10
            个正方形的面积加起来再除以 10，就是{" "}
            <MathFormula>{String.raw`\mathrm{MSE}=\frac{1}{10}\sum_{i=1}^{10}(y_i-\hat y_i)^2`}</MathFormula>
            。
          </div>
        </div>
      </div>

      {question && (
        <ConceptQuestion
          question={question}
          answer={draft.answer}
          passed={passed}
          onAnswer={(answer) => onChange({ ...draft, answer })}
        />
      )}
    </div>
  );
}
