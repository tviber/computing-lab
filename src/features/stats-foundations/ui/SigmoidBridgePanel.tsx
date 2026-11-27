import { createMemo, createSignal, For, Show } from "solid-js";
import { MathFormula } from "../../../shared/ui/MathFormula";
import type { SigmoidBridgeDraft } from "../domain/protocol.ts";
import {
  evaluateSigmoidFit,
  linearFitOnStudyData,
  roundTo,
  sigmoid,
  SIGMOID_ACCURACY_THRESHOLD,
  SIGMOID_B_MAX,
  SIGMOID_B_MIN,
  SIGMOID_LOGLOSS_THRESHOLD,
  SIGMOID_W_MAX,
  SIGMOID_W_MIN,
} from "../domain/statsMath.ts";
import { StatsModePicker } from "./StatsModePicker";
import { StatsSlider } from "./StatsSlider";

type Props = {
  draft: SigmoidBridgeDraft;
  onChange: (next: SigmoidBridgeDraft) => void;
};

const SVG_W = 540;
const SVG_H = 300;
const PAD = { left: 54, right: 24, top: 24, bottom: 44 };
const X_MIN = 0;
const X_MAX = 10;
const Y_MIN = -0.25;
const Y_MAX = 1.25;
const Y_TICKS = [0, 0.5, 1];
const X_TICKS = [0, 2, 4, 6, 8, 10];
const LINEAR_FIT = linearFitOnStudyData();
const CURVE_OPTIONS: readonly { value: SigmoidBridgeDraft["curveMode"]; label: string }[] = [
  { value: "linear", label: "用直线硬拟合" },
  { value: "sigmoid", label: "Sigmoid 曲线" },
];

function mapX(hours: number): number {
  return PAD.left + ((hours - X_MIN) / (X_MAX - X_MIN)) * (SVG_W - PAD.left - PAD.right);
}

function mapY(prob: number): number {
  return SVG_H - PAD.bottom - ((prob - Y_MIN) / (Y_MAX - Y_MIN)) * (SVG_H - PAD.top - PAD.bottom);
}

export function SigmoidBridgePanel(props: Props) {
  const [selectedId, setSelectedId] = createSignal<number>(6);
  const fit = createMemo(() => evaluateSigmoidFit(props.draft.w, props.draft.b));
  const isLinear = createMemo(() => props.draft.curveMode === "linear");

  const accGood = createMemo(() => fit().accuracy >= SIGMOID_ACCURACY_THRESHOLD);
  const lossGood = createMemo(() => fit().logLoss <= SIGMOID_LOGLOSS_THRESHOLD);

  const sigmoidPath = createMemo(() => {
    const { w, b } = fit();
    const pts: string[] = [];
    for (let i = 0; i <= 80; i++) {
      const x = X_MIN + ((X_MAX - X_MIN) * i) / 80;
      const y = sigmoid(w * x + b);
      pts.push(`${i === 0 ? "M" : "L"}${mapX(x).toFixed(1)},${mapY(y).toFixed(1)}`);
    }
    return pts.join(" ");
  });

  const selectedPoint = createMemo(
    () => fit().points.find((p) => p.id === selectedId()) ?? fit().points[0],
  );

  return (
    <div class="sf-panel">
      <Show when={!isLinear()}>
        <div class="sf-metrics-row">
          <div class={`sf-metric-card ${accGood() ? "is-good" : ""}`}>
            <span class="sf-metric-label">分类准确率</span>
            <strong class="sf-metric-value">
              {Math.round(fit().accuracy * 100)}% ({fit().correctCount}/10)
            </strong>
            <span class="sf-metric-sub">
              目标 ≥ {Math.round(SIGMOID_ACCURACY_THRESHOLD * 100)}%
            </span>
          </div>
          <div class={`sf-metric-card ${lossGood() ? "is-good" : ""}`}>
            <span class="sf-metric-label">平均对数损失 (负对数似然)</span>
            <strong class="sf-metric-value sf-mono">{roundTo(fit().logLoss, 3)}</strong>
            <span class="sf-metric-sub">目标 ≤ {SIGMOID_LOGLOSS_THRESHOLD}（越小越好）</span>
          </div>
          <div class="sf-metric-card">
            <span class="sf-metric-label">50% 分界点 x₀ = −b / w</span>
            <strong class="sf-metric-value sf-mono">{roundTo(fit().boundaryX, 2)} 小时</strong>
            <span class="sf-metric-sub">超过此时长预测为「通过」</span>
          </div>
        </div>
      </Show>
      <div class="sf-workspace-grid">
        <div class="sf-chart-card">
          <div class="sf-chart-header">
            <h3>考前复习时长 (小时) → 通过概率 P(通过 | 时长)</h3>
            <StatsModePicker
              label="拟合模式"
              onChange={(curveMode) => props.onChange({ ...props.draft, curveMode })}
              options={CURVE_OPTIONS}
              value={props.draft.curveMode}
            />
          </div>

          <svg
            aria-label={
              isLinear() ? "复习时长与直线拟合结果" : "复习时长与通过概率的 Sigmoid 拟合图"
            }
            class="sf-svg"
            role="img"
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          >
            {/* Shaded invalid probability zones (<0 or >1) */}
            <rect
              class="sf-invalid-zone"
              height={mapY(1) - PAD.top}
              width={SVG_W - PAD.left - PAD.right}
              x={PAD.left}
              y={PAD.top}
            />
            <rect
              class="sf-invalid-zone"
              height={SVG_H - PAD.bottom - mapY(0)}
              width={SVG_W - PAD.left - PAD.right}
              x={PAD.left}
              y={mapY(0)}
            />

            <For each={Y_TICKS}>
              {(yVal) => (
                <g>
                  <line
                    class={yVal === 0.5 ? "sf-mid-line" : "sf-grid-line"}
                    x1={PAD.left}
                    x2={SVG_W - PAD.right}
                    y1={mapY(yVal)}
                    y2={mapY(yVal)}
                  />
                  <text class="sf-axis-tick" text-anchor="end" x={PAD.left - 8} y={mapY(yVal) + 4}>
                    {Math.round(yVal * 100)}%
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
                    {xVal}h
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
              考前复习时长 x (小时)
            </text>

            {/* Decision boundary line */}
            <Show when={!isLinear() && fit().boundaryX >= X_MIN && fit().boundaryX <= X_MAX}>
              <line
                class="sf-guide-line"
                x1={mapX(fit().boundaryX)}
                x2={mapX(fit().boundaryX)}
                y1={mapY(1)}
                y2={mapY(0)}
              />
            </Show>

            {/* Linear or Sigmoid curve */}
            <Show
              fallback={<path class="sf-curve-path" d={sigmoidPath()} fill="none" />}
              when={isLinear()}
            >
              <line
                class="sf-linear-warn-line"
                x1={mapX(X_MIN)}
                x2={mapX(X_MAX)}
                y1={mapY(LINEAR_FIT.slope * X_MIN + LINEAR_FIT.intercept)}
                y2={mapY(LINEAR_FIT.slope * X_MAX + LINEAR_FIT.intercept)}
              />
            </Show>

            {/* Student points */}
            <For each={fit().points}>
              {(pt) => {
                const isSelected = () => pt.id === selectedPoint().id;
                return (
                  <circle
                    class={`sf-student-dot ${pt.passed === 1 ? "is-pass" : "is-fail"} ${isSelected() ? "is-selected" : ""}`}
                    cx={mapX(pt.hours)}
                    cy={mapY(pt.passed)}
                    onClick={() => setSelectedId(pt.id)}
                    r={isSelected() ? 7.5 : 5.5}
                  >
                    <title>
                      {pt.name}：复习 {pt.hours} 小时，实际{pt.passed === 1 ? "通过" : "未通过"}
                    </title>
                  </circle>
                );
              }}
            </For>
          </svg>

          <Show when={isLinear()}>
            <div class="sf-warn-box">
              <strong>看！直线出界了：</strong>
              当复习 0.5 小时时，直线给出负概率；当复习 9 小时时，直线超过 100%！概率必须在 0% 到
              100% 之间，所以我们需要用 <strong>Sigmoid</strong> 把直线「压扁」进 (0, 1)。
            </div>
          </Show>
        </div>

        <div class="sf-controls-card">
          <h3>调整 Sigmoid 曲线</h3>
          <StatsSlider
            label="斜率 w（曲线陡峭程度）"
            max={SIGMOID_W_MAX}
            min={SIGMOID_W_MIN}
            onChange={(w) => props.onChange({ ...props.draft, curveMode: "sigmoid", w })}
            step={0.1}
            value={props.draft.w}
          />

          <StatsSlider
            label="偏移 b（控制左右移动）"
            max={SIGMOID_B_MAX}
            min={SIGMOID_B_MIN}
            onChange={(b) => props.onChange({ ...props.draft, curveMode: "sigmoid", b })}
            step={0.2}
            value={props.draft.b}
          />

          <div class="sf-inspector-box">
            <div class="sf-inspector-title">
              <label>
                查看样本{" "}
                <select
                  onChange={(event) => setSelectedId(Number(event.currentTarget.value))}
                  value={selectedPoint().id}
                >
                  <For each={fit().points}>
                    {(point) => <option value={point.id}>{point.name}</option>}
                  </For>
                </select>
              </label>
            </div>
            <ul class="sf-inspector-list">
              <li>
                复习时长 <span class="sf-mono">x = {selectedPoint().hours}h</span>，实际结果：
                <strong>{selectedPoint().passed === 1 ? "通过 (1)" : "未通过 (0)"}</strong>
              </li>
              <Show
                fallback={
                  <>
                    <li>
                      先算直线得分{" "}
                      <span class="sf-mono">z = wx + b = {roundTo(selectedPoint().z, 2)}</span>
                    </li>
                    <li>
                      用 <MathFormula>{String.raw`\sigma(z)=1/(1+e^{-z})`}</MathFormula>{" "}
                      得到条件概率{" "}
                      <span class="sf-mono">
                        P(通过|x) = {Math.round(selectedPoint().prob * 100)}%
                      </span>
                    </li>
                    <li>
                      分类判断：
                      <strong class={selectedPoint().correct ? "sf-text-ok" : "sf-text-bad"}>
                        {selectedPoint().correct ? "预测正确 ✓" : "预测错了 ✗"}
                      </strong>
                    </li>
                  </>
                }
                when={isLinear()}
              >
                <li>
                  直线预测值{" "}
                  <span class="sf-mono">
                    {roundTo(LINEAR_FIT.slope * selectedPoint().hours + LINEAR_FIT.intercept, 3)}
                  </span>
                </li>
              </Show>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
