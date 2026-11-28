import { MathFormula } from "../../../shared/ui/MathFormula";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  clampSliceW,
  SLICE_MAX_W,
  SLICE_MIN_W,
  type SliceCurveData,
  type SliceEval,
  type SliceStepOutcome,
} from "../domain/lossSlice.ts";
import {
  clipLineToBox,
  SLICE_CHART_H,
  SLICE_CHART_W,
  SLICE_PAD_B,
  SLICE_PAD_L,
  SLICE_PAD_R,
  SLICE_PAD_T,
  SLICE_W_TICKS,
  wFromClientX,
  xOfW,
  yOfLoss,
  type ContextMode,
  type TrailPoint,
} from "./weightLossSliceGeometry.ts";

export type WeightLossSliceChartProps = {
  selectedWord: string;
  contextMode: ContextMode;
  curve: SliceCurveData;
  currentEval: SliceEval;
  previewDescent: SliceStepOutcome;
  learnedW: number | undefined;
  trail: TrailPoint[];
  onSetW: (nextW: number) => void;
};

export function WeightLossSliceChart(props: WeightLossSliceChartProps) {
  const [dragging, setDragging] = createSignal(false);
  let svgRef: SVGSVGElement | undefined;

  const yMax = createMemo(() => Math.max(0.35, props.curve.maxLoss * 1.12));
  const yAt = (loss: number) => yOfLoss(loss, yMax());

  const updateDraggedW = (clientX: number) => {
    if (!svgRef) return;
    const rect = svgRef.getBoundingClientRect();
    props.onSetW(wFromClientX(clientX, rect.left, rect.width, props.currentEval.w));
  };

  const handleSvgPointerDown = (e: PointerEvent & { currentTarget: SVGSVGElement }) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    updateDraggedW(e.clientX);
  };

  const handleSvgPointerMove = (e: PointerEvent & { currentTarget: SVGSVGElement }) => {
    if (!dragging()) return;
    updateDraggedW(e.clientX);
  };

  const handleSvgPointerUp = (e: PointerEvent & { currentTarget: SVGSVGElement }) => {
    if (!dragging()) return;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleHandleKeyDown = (e: KeyboardEvent & { currentTarget: SVGCircleElement }) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 0.5 : 0.1;
    const nextW = clampSliceW(props.currentEval.w + (e.key === "ArrowRight" ? step : -step));
    props.onSetW(nextW);
  };

  const curvePts = createMemo(() =>
    props.curve.points.map((pt) => `${xOfW(pt.w).toFixed(1)},${yAt(pt.loss).toFixed(1)}`).join(" "),
  );

  const rawTangent = createMemo(() => {
    const tangentSpanW = 1.6;
    const ev = props.currentEval;
    return clipLineToBox(
      ev.w - tangentSpanW,
      ev.loss - ev.grad * tangentSpanW,
      ev.w + tangentSpanW,
      ev.loss + ev.grad * tangentSpanW,
      SLICE_MIN_W,
      SLICE_MAX_W,
      0,
      yMax(),
    );
  });

  const curX = () => xOfW(props.currentEval.w);
  const curY = () => yAt(props.currentEval.loss);
  const ghostX = () => xOfW(props.previewDescent.to.w);
  const ghostY = () => yAt(props.previewDescent.to.loss);
  const yTicks = createMemo(() => [0, yMax() * 0.33, yMax() * 0.67, yMax()]);
  const trailSegments = createMemo(() => props.trail.slice(0, -1));

  return (
    <div class="logistic-regression-chart-box logistic-regression-slice-chart-box">
      <div class="logistic-regression-chart-head">
        <h4>
          「{props.selectedWord}」的权重与平均损失
          <small class="logistic-regression-slice-sub">（拖动圆点设置起点）</small>
        </h4>
        <div class="logistic-regression-legend">
          <span class="logistic-regression-leg-item">
            <i class="logistic-regression-leg-swatch is-train" /> 损失曲线
          </span>
          <span class="logistic-regression-leg-item">
            <i class="logistic-regression-leg-swatch is-tangent" /> 当前坡度切线
          </span>
          <span class="logistic-regression-leg-item">
            <i class="logistic-regression-leg-dot is-msg" /> 当前点 / 虚线为更新后的位置
          </span>
        </div>
      </div>

      <p class="logistic-regression-muted-note">
        区间最低点{" "}
        <MathFormula>{String.raw`w^*\approx${props.curve.minPoint.w.toFixed(2)}`}</MathFormula>
        ；当前 <MathFormula>{String.raw`w=${props.currentEval.w.toFixed(2)}`}</MathFormula>。
        <Show when={props.contextMode === "trained" && props.learnedW !== undefined}>
          模型权重 <MathFormula>{`w=${props.learnedW!.toFixed(2)}`}</MathFormula>。
        </Show>
      </p>
      <svg
        aria-label={`词「${props.selectedWord}」权重与交叉熵损失切片图`}
        class={`logistic-regression-svg-chart logistic-regression-slice-svg${dragging() ? " is-dragging" : ""}`}
        onPointerCancel={handleSvgPointerUp}
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={handleSvgPointerUp}
        ref={(el) => {
          svgRef = el;
        }}
        viewBox={`0 0 ${SLICE_CHART_W} ${SLICE_CHART_H}`}
      >
        <For each={yTicks()}>
          {(v) => (
            <g>
              <line
                stroke="var(--border)"
                stroke-width="0.8"
                x1={SLICE_PAD_L}
                x2={SLICE_CHART_W - SLICE_PAD_R}
                y1={yAt(v)}
                y2={yAt(v)}
              />
              <text
                fill="var(--muted)"
                font-size="9.5"
                text-anchor="end"
                x={SLICE_PAD_L - 6}
                y={yAt(v) + 3}
              >
                {v.toFixed(2)}
              </text>
            </g>
          )}
        </For>

        <For each={SLICE_W_TICKS}>
          {(wTick) => (
            <g>
              <line
                stroke="var(--border)"
                stroke-dasharray={wTick === 0 ? "3 3" : undefined}
                stroke-width="0.8"
                x1={xOfW(wTick)}
                x2={xOfW(wTick)}
                y1={SLICE_PAD_T}
                y2={SLICE_CHART_H - SLICE_PAD_B}
              />
              <text
                fill="var(--muted)"
                font-size="9.5"
                text-anchor="middle"
                x={xOfW(wTick)}
                y={SLICE_CHART_H - 10}
              >
                {wTick > 0 ? `+${wTick}` : wTick}
              </text>
            </g>
          )}
        </For>

        <line
          stroke="var(--success)"
          stroke-dasharray="3 3"
          stroke-opacity="0.65"
          stroke-width="1.1"
          x1={xOfW(props.curve.minPoint.w)}
          x2={xOfW(props.curve.minPoint.w)}
          y1={SLICE_PAD_T}
          y2={SLICE_CHART_H - SLICE_PAD_B}
        />
        <text
          fill="var(--success)"
          font-size="9.5"
          text-anchor="middle"
          x={Math.max(
            SLICE_PAD_L + 26,
            Math.min(SLICE_CHART_W - SLICE_PAD_R - 26, xOfW(props.curve.minPoint.w)),
          )}
          y={SLICE_PAD_T - 4}
        >
          区间最低点
        </text>

        <Show
          when={
            props.contextMode === "trained" &&
            props.learnedW !== undefined &&
            props.learnedW >= SLICE_MIN_W &&
            props.learnedW <= SLICE_MAX_W
              ? props.learnedW
              : null
          }
        >
          {(lw) => (
            <g>
              <line
                stroke="var(--primary)"
                stroke-dasharray="2 2"
                stroke-opacity="0.6"
                stroke-width="1.1"
                x1={xOfW(lw())}
                x2={xOfW(lw())}
                y1={SLICE_PAD_T + 8}
                y2={SLICE_CHART_H - SLICE_PAD_B}
              />
              <text
                fill="var(--primary)"
                font-size="8.5"
                text-anchor="middle"
                x={Math.max(
                  SLICE_PAD_L + 32,
                  Math.min(SLICE_CHART_W - SLICE_PAD_R - 32, xOfW(lw())),
                )}
                y={SLICE_CHART_H - SLICE_PAD_B - 4}
              >
                模型权重
              </text>
            </g>
          )}
        </Show>

        <polyline fill="none" points={curvePts()} stroke="var(--accent)" stroke-width="2.4" />

        <For each={trailSegments()}>
          {(pt, idx) => {
            const seg = () => {
              const nextPt = props.trail[idx() + 1];
              const x1 = xOfW(pt.w);
              const y1 = yAt(pt.loss);
              const x2 = xOfW(nextPt.w);
              const y2 = yAt(nextPt.loss);
              const midX = (x1 + x2) / 2;
              const arcY = Math.min(y1, y2) - Math.min(26, Math.abs(x2 - x1) * 0.22 + 8);
              return { x1, y1, x2, y2, midX, arcY };
            };
            return (
              <g>
                <path
                  d={`M ${seg().x1.toFixed(1)} ${seg().y1.toFixed(1)} Q ${seg().midX.toFixed(1)} ${seg().arcY.toFixed(1)} ${seg().x2.toFixed(1)} ${seg().y2.toFixed(1)}`}
                  fill="none"
                  stroke="var(--muted)"
                  stroke-dasharray="3 2"
                  stroke-opacity="0.65"
                  stroke-width="1.3"
                />
                <circle
                  cx={seg().x1}
                  cy={seg().y1}
                  fill="var(--surface)"
                  r="3.8"
                  stroke="var(--muted)"
                  stroke-width="1.5"
                />
                <text
                  fill="var(--muted)"
                  font-size="8.5"
                  text-anchor="middle"
                  x={seg().x1}
                  y={Math.max(SLICE_PAD_T + 8, seg().y1 - 7)}
                >
                  P{idx()}
                </text>
              </g>
            );
          }}
        </For>

        <Show when={rawTangent()}>
          {(tan) => (
            <line
              stroke="var(--warning)"
              stroke-width="1.8"
              x1={xOfW(tan()[0])}
              x2={xOfW(tan()[2])}
              y1={yAt(tan()[1])}
              y2={yAt(tan()[3])}
            />
          )}
        </Show>

        <Show when={!props.previewDescent.isAtMinimum}>
          <g>
            <line
              stroke="var(--accent)"
              stroke-dasharray="4 3"
              stroke-opacity="0.7"
              stroke-width="1.5"
              x1={curX()}
              x2={ghostX()}
              y1={curY()}
              y2={ghostY()}
            />
            <circle
              cx={ghostX()}
              cy={ghostY()}
              fill="var(--surface)"
              fill-opacity="0.85"
              r="4.5"
              stroke="var(--accent)"
              stroke-dasharray="2 2"
              stroke-width="1.6"
            />
          </g>
        </Show>

        <circle
          aria-label={`拖动调整词「${props.selectedWord}」的权重 wⱼ`}
          aria-valuemax={SLICE_MAX_W}
          aria-valuemin={SLICE_MIN_W}
          aria-valuenow={Number(props.currentEval.w.toFixed(2))}
          class="logistic-regression-slice-handle"
          cx={curX()}
          cy={curY()}
          fill="var(--accent)"
          onKeyDown={handleHandleKeyDown}
          r="7"
          role="slider"
          stroke="var(--surface)"
          stroke-width="2.2"
          tabindex={0}
        />
      </svg>
    </div>
  );
}
