import { Button } from "@ui-sdk/solid/button";
import { createMemo, For, Show } from "solid-js";
import type {
  SliceCurveData,
  SliceEval,
  SliceStepDirection,
  SliceStepOutcome,
} from "../domain/lossSlice.ts";
import {
  buildTrailComparisonNote,
  fmtSigned,
  type ContextMode,
  type TrailPoint,
} from "./weightLossSliceGeometry.ts";

export type WeightLossSliceMetricsPanelProps = {
  selectedWord: string;
  contextMode: ContextMode;
  curve: SliceCurveData;
  currentEval: SliceEval;
  actualSpamRate: number;
  previewDescent: SliceStepOutcome;
  previewLeft: SliceStepOutcome;
  previewRight: SliceStepOutcome;
  statusHint: string | null;
  trail: TrailPoint[];
  onStep: (direction: SliceStepDirection) => void;
  onFiveSteps: () => void;
  onBouncePreset: () => void;
  onReset: () => void;
};

export function WeightLossSliceMetricsPanel(props: WeightLossSliceMetricsPanelProps) {
  const comparisonNote = createMemo(() => buildTrailComparisonNote(props.trail));

  return (
    <>
      <p class="logistic-regression-note-box logistic-regression-slice-impact" role="status">
        <Show
          fallback={
            <>
              固定其他词权重后，这 {props.currentEval.totalCount} 条含「{props.selectedWord}
              」的短信当前判对{" "}
              <strong class="logistic-regression-mono">
                {props.currentEval.correctCount} / {props.currentEval.totalCount}
              </strong>{" "}
              条（误拦正常{" "}
              <strong class="logistic-regression-mono">{props.currentEval.fpCount}</strong> 条 ·
              漏掉垃圾 <strong class="logistic-regression-mono">{props.currentEval.fnCount}</strong>{" "}
              条）。
            </>
          }
          when={props.contextMode === "zero"}
        >
          <>
            当前权重下，模型对这 {props.currentEval.totalCount} 条含「{props.selectedWord}
            」短信的平均猜垃圾概率为{" "}
            <strong class="logistic-regression-mono">
              {(props.currentEval.meanProb * 100).toFixed(1)}%
            </strong>
            （真实垃圾占{" "}
            <strong class="logistic-regression-mono">
              {(props.actualSpamRate * 100).toFixed(1)}%
            </strong>
            ）；按 50% 门槛判对{" "}
            <strong class="logistic-regression-mono">
              {props.currentEval.correctCount} / {props.currentEval.totalCount}
            </strong>{" "}
            条。其他权重均为 0 时，损失最低的位置对应这组短信的垃圾占比。
          </>
        </Show>
      </p>

      <div class="logistic-regression-micro-metrics">
        <div class="logistic-regression-stat-box">
          <span>当前权重 w</span>
          <strong class="logistic-regression-mono">{fmtSigned(props.currentEval.w)}</strong>
          <small>可直接在曲线上左右拖动圆点</small>
        </div>
        <div class="logistic-regression-stat-box">
          <span>平均损失</span>
          <strong class="logistic-regression-mono">{props.currentEval.loss.toFixed(4)}</strong>
          <small>区间最低值：{props.curve.minPoint.loss.toFixed(4)}</small>
        </div>
        <div class="logistic-regression-stat-box">
          <span>当前坡度（往哪边是下坡）</span>
          <strong class="logistic-regression-mono">{fmtSigned(props.currentEval.grad, 4)}</strong>
          <small>
            {props.previewDescent.isAtMinimum
              ? "坡度接近 0，已在谷底附近"
              : props.currentEval.grad > 0
                ? "右高左低，顺坡应往左走"
                : "左高右低，顺坡应往右走"}
          </small>
        </div>
        <div class="logistic-regression-stat-box">
          <span>下一步会跳多远</span>
          <strong
            class={`logistic-regression-mono ${
              props.previewDescent.actualDelta > 0
                ? "is-pos"
                : props.previewDescent.actualDelta < 0
                  ? "is-neg"
                  : ""
            }`}
          >
            {fmtSigned(props.previewDescent.actualDelta)}
          </strong>
          <small>
            {props.previewDescent.isAtMinimum
              ? "步幅 ≈ 0，靠自动步长已动不了"
              : `将从 ${props.currentEval.w.toFixed(2)} 跳到 ${props.previewDescent.to.w.toFixed(2)}`}
          </small>
        </div>
      </div>

      <div class="logistic-regression-slice-actions">
        <Button class="button button-primary" onClick={() => props.onStep("descent")} type="button">
          按梯度更新一步
        </Button>
        <Button class="button button-ghost" onClick={() => props.onStep("left")} type="button">
          ← 往左试推一格（{fmtSigned(props.previewLeft.actualDelta, 2)} ·{" "}
          {props.previewDescent.descentSide === "left"
            ? "下坡 ↓"
            : props.previewDescent.descentSide === "right"
              ? "上坡 ↑"
              : "步长≈0"}
          ）
        </Button>
        <Button class="button button-ghost" onClick={() => props.onStep("right")} type="button">
          往右试推一格（{fmtSigned(props.previewRight.actualDelta, 2)} ·{" "}
          {props.previewDescent.descentSide === "right"
            ? "下坡 ↓"
            : props.previewDescent.descentSide === "left"
              ? "上坡 ↑"
              : "步长≈0"}
          ）→
        </Button>
        <Button class="button button-ghost" onClick={() => props.onFiveSteps()} type="button">
          连走 5 步
        </Button>
        <Button class="button button-ghost" onClick={() => props.onBouncePreset()} type="button">
          示例：步子太大跨过头
        </Button>
        <Button class="button button-ghost" onClick={() => props.onReset()} type="button">
          重置起点
        </Button>
      </div>

      <Show when={props.statusHint}>
        {(hint) => (
          <p class="logistic-regression-note-box" role="status">
            {hint()}
          </p>
        )}
      </Show>

      <Show when={comparisonNote()}>
        {(note) => (
          <p class="logistic-regression-note-box logistic-regression-slice-insight" role="status">
            {note()}
          </p>
        )}
      </Show>

      <Show when={props.trail.length > 1}>
        <div class="logistic-regression-slice-trail">
          <span class="logistic-regression-field-label">跳跃轨迹：</span>
          <ol aria-label="跳跃历史轨迹" class="logistic-regression-trail-chips">
            <For each={props.trail}>
              {(pt, idx) => (
                <li class="logistic-regression-trail-chip">
                  <span class="logistic-regression-mono">
                    P{idx()}: w={pt.w.toFixed(2)}
                  </span>
                  <Show when={pt.deltaW !== null}>
                    <small class="logistic-regression-mono">({fmtSigned(pt.deltaW!, 2)})</small>
                  </Show>
                </li>
              )}
            </For>
          </ol>
        </div>
      </Show>
    </>
  );
}
