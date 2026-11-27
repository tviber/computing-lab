import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, For, Show } from "solid-js";
import { MathFormula } from "../../../shared/ui/MathFormula";
import { getPublicCorpus } from "../domain/corpus.ts";
import type { TrainedModel } from "../domain/logisticRegression.ts";
import {
  buildWordSliceDataset,
  clampSliceEta,
  clampSliceW,
  evaluateSliceAt,
  sampleLossSliceCurve,
  SLICE_MAX_ETA,
  SLICE_MAX_W,
  SLICE_MIN_ETA,
  SLICE_MIN_W,
  SLICE_WORD_OPTIONS,
  stepSliceWeight,
  type SliceEval,
  type SliceStepDirection,
} from "../domain/lossSlice.ts";

type TrailPoint = SliceEval & {
  deltaW: number | null;
  action: SliceStepDirection | "init";
};

type ContextMode = "zero" | "trained";

type ContextScopedState<T> = {
  word: string;
  contextMode: ContextMode;
  trainedModel: TrainedModel | null;
  value: T;
};

const ETA_QUICK_PRESETS = [
  { label: "稳步 η = 0.8", eta: 0.8 },
  { label: "适中 η = 2.0", eta: 2.0 },
  { label: "跨谷反弹 η = 5.5", eta: 5.5 },
  { label: "大幅震荡 η = 7.5", eta: 7.5 },
] as const;

const DEFAULT_START_W = 2.0;
const W = 540;
const H = 228;
const PAD_L = 48;
const PAD_R = 20;
const PAD_T = 20;
const PAD_B = 30;
const W_TICKS = [-4, -2, 0, 2, 4] as const;

function clipLineToBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number,
): [number, number, number, number] | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const checks: [number, number][] = [
    [-dx, x1 - xmin],
    [dx, xmax - x1],
    [-dy, y1 - ymin],
    [dy, ymax - y1],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

function fmtSigned(val: number, digits = 3): string {
  const fixed = val.toFixed(digits);
  return val >= 0 ? `+${fixed}` : fixed;
}

const xOfW = (w: number) =>
  PAD_L + ((clampSliceW(w) - SLICE_MIN_W) / (SLICE_MAX_W - SLICE_MIN_W)) * (W - PAD_L - PAD_R);

export function WeightLossSliceExplorer(props: { trainedModel: TrainedModel }) {
  const train = getPublicCorpus().train;
  const [selectedWord, setSelectedWord] = createSignal<string>(SLICE_WORD_OPTIONS[0].word);
  const [contextMode, setContextMode] = createSignal<ContextMode>("zero");
  const [sliceEta, setSliceEta] = createSignal<number>(2.0);
  const [currentW, setCurrentW] = createSignal<number>(DEFAULT_START_W);
  const [trailState, setTrailState] = createSignal<ContextScopedState<TrailPoint[]> | null>(null);
  const [dragging, setDragging] = createSignal(false);
  const [hintState, setHintState] = createSignal<ContextScopedState<string> | null>(null);
  let svgRef: SVGSVGElement | undefined;

  const activeContextModel = createMemo(() =>
    contextMode() === "trained" ? props.trainedModel : null,
  );

  const dataset = createMemo(() =>
    buildWordSliceDataset(selectedWord(), train, activeContextModel()),
  );

  const curve = createMemo(() => sampleLossSliceCurve(dataset().samples));
  const currentEval = createMemo(() => evaluateSliceAt(dataset().samples, currentW()));
  const previewDescent = createMemo(() =>
    stepSliceWeight(dataset().samples, currentW(), sliceEta(), "descent"),
  );
  const previewLeft = createMemo(() =>
    stepSliceWeight(dataset().samples, currentW(), sliceEta(), "left"),
  );
  const previewRight = createMemo(() =>
    stepSliceWeight(dataset().samples, currentW(), sliceEta(), "right"),
  );

  const matchesCurrentContext = <T,>(
    entry: ContextScopedState<T> | null,
  ): entry is ContextScopedState<T> =>
    Boolean(
      entry &&
      entry.word === selectedWord() &&
      entry.contextMode === contextMode() &&
      entry.trainedModel === activeContextModel(),
    );

  const activeTrail = createMemo<TrailPoint[]>(() => {
    const ts = trailState();
    if (
      ts &&
      ts.word === selectedWord() &&
      ts.contextMode === contextMode() &&
      ts.trainedModel === activeContextModel() &&
      ts.value.length > 0
    ) {
      return ts.value;
    }
    return [{ ...currentEval(), deltaW: null, action: "init" }];
  });

  const statusHint = createMemo(() => {
    const hs = hintState();
    return matchesCurrentContext(hs) ? hs.value : null;
  });

  const setScopedTrail = (
    points: TrailPoint[],
    word = selectedWord(),
    mode = contextMode(),
    model = activeContextModel(),
  ) => {
    setTrailState({ word, contextMode: mode, trainedModel: model, value: points });
  };

  const setScopedHint = (
    text: string | null,
    word = selectedWord(),
    mode = contextMode(),
    model = activeContextModel(),
  ) => {
    setHintState(
      text === null ? null : { word, contextMode: mode, trainedModel: model, value: text },
    );
  };

  const wordMeta = createMemo(
    () => SLICE_WORD_OPTIONS.find((item) => item.word === selectedWord()) ?? SLICE_WORD_OPTIONS[0],
  );
  const learnedW = createMemo(() => props.trainedModel.weightsByWord.get(selectedWord()));
  const actualSpamRate = createMemo(() =>
    dataset().totalCount > 0 ? dataset().posCount / dataset().totalCount : 0,
  );

  const resetPoint = (
    nextW = DEFAULT_START_W,
    nextWord = selectedWord(),
    nextMode = contextMode(),
  ) => {
    const nextModel = nextMode === "trained" ? props.trainedModel : null;
    const nextDataset = buildWordSliceDataset(nextWord, train, nextModel);
    const safeW = clampSliceW(nextW);
    const ev = evaluateSliceAt(nextDataset.samples, safeW);
    setCurrentW(safeW);
    setScopedTrail([{ ...ev, deltaW: null, action: "init" }], nextWord, nextMode, nextModel);
    setScopedHint(null);
  };

  const handleSelectWord = (word: string) => {
    setSelectedWord(word);
    resetPoint(DEFAULT_START_W, word, contextMode());
  };

  const handleSelectContext = (mode: ContextMode) => {
    setContextMode(mode);
    resetPoint(DEFAULT_START_W, selectedWord(), mode);
  };

  const triggerStep = (direction: SliceStepDirection) => {
    const outcome = stepSliceWeight(dataset().samples, currentW(), sliceEta(), direction);
    if (outcome.isAtMinimum) {
      setScopedHint(
        "当前位置已经到谷底，坡度几乎为 0，单靠自动步长推不动了。请直接拖动曲线上的圆点放到斜坡上再试。",
      );
      return;
    }
    if (Math.abs(outcome.actualDelta) < 1e-5 && outcome.clamped) {
      setScopedHint("已到达横轴展示边界，无法继续向该方向移动。");
      return;
    }
    const base = activeTrail();
    const nextPoint: TrailPoint = {
      ...outcome.to,
      deltaW: outcome.actualDelta,
      action: direction,
    };
    setCurrentW(outcome.to.w);
    setScopedTrail([...base.slice(-6), nextPoint]);
    setScopedHint(outcome.clamped ? "步子太大，落点已贴到坐标轴边界。" : null);
  };

  const triggerFiveSteps = () => {
    let wCursor = currentW();
    const base = activeTrail();
    const nextPoints: TrailPoint[] = [...base];
    for (let i = 0; i < 5; i++) {
      const outcome = stepSliceWeight(dataset().samples, wCursor, sliceEta(), "descent");
      if (outcome.isAtMinimum || Math.abs(outcome.actualDelta) < 1e-5) break;
      wCursor = outcome.to.w;
      nextPoints.push({
        ...outcome.to,
        deltaW: outcome.actualDelta,
        action: "descent",
      });
    }
    setCurrentW(wCursor);
    setScopedTrail(nextPoints.slice(-7));
    setScopedHint(
      nextPoints.length === base.length
        ? "已在谷底附近，坡度接近 0，不需要继续移动。"
        : "已连续顺坡走了几步，观察每步跨度怎样随坡度变化。",
    );
  };

  const loadBouncePreset = () => {
    const word = "好";
    const startW = 2.0;
    const eta = 6.5;
    const nextDataset = buildWordSliceDataset(word, train, null);
    const ev = evaluateSliceAt(nextDataset.samples, startW);
    setSelectedWord(word);
    setContextMode("zero");
    setSliceEta(eta);
    setCurrentW(startW);
    setScopedTrail([{ ...ev, deltaW: null, action: "init" }], word, "zero", null);
    setScopedHint(
      "已选中「好」，η = 6.5。连续点击两次「按梯度更新一步」，比较起点和第二步结束的位置。",
      word,
      "zero",
      null,
    );
  };

  const yMax = createMemo(() => Math.max(0.35, curve().maxLoss * 1.12));

  const yOfLoss = (loss: number) => {
    const clamped = Math.max(0, Math.min(yMax(), loss));
    return H - PAD_B - (clamped / yMax()) * (H - PAD_T - PAD_B);
  };

  const wFromClientX = (clientX: number): number => {
    if (!svgRef) return currentW();
    const rect = svgRef.getBoundingClientRect();
    if (rect.width <= 0) return currentW();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    const ratio = (svgX - PAD_L) / (W - PAD_L - PAD_R);
    return clampSliceW(SLICE_MIN_W + ratio * (SLICE_MAX_W - SLICE_MIN_W));
  };

  const updateDraggedW = (clientX: number) => {
    const nextW = wFromClientX(clientX);
    const ev = evaluateSliceAt(dataset().samples, nextW);
    setCurrentW(nextW);
    setScopedTrail([{ ...ev, deltaW: null, action: "init" }]);
    setScopedHint(null);
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
    const nextW = clampSliceW(currentW() + (e.key === "ArrowRight" ? step : -step));
    const ev = evaluateSliceAt(dataset().samples, nextW);
    setCurrentW(nextW);
    setScopedTrail([{ ...ev, deltaW: null, action: "init" }]);
    setScopedHint(null);
  };

  const curvePts = createMemo(() =>
    curve()
      .points.map((pt) => `${xOfW(pt.w).toFixed(1)},${yOfLoss(pt.loss).toFixed(1)}`)
      .join(" "),
  );

  const rawTangent = createMemo(() => {
    const tangentSpanW = 1.6;
    const ev = currentEval();
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

  const comparisonNote = createMemo<string | null>(() => {
    const trail = activeTrail();
    if (trail.length < 3) return null;
    const [p0, p1, p2] = trail.slice(-3);
    const d1 = p1.w - p0.w;
    const d2 = p2.w - p1.w;
    if (d1 * d2 < -1e-6) {
      const diff = p2.w - p0.w;
      return `来回对比：从 P${trail.length - 3} (${p0.w.toFixed(2)}) 跳到 P${trail.length - 2} (${p1.w.toFixed(2)}) 后再反向跳回 P${trail.length - 1} (${p2.w.toFixed(2)})，没有回到原位（相差 ${fmtSigned(diff)}），因为两处的坡度（偏导）不同（${fmtSigned(p0.grad)} vs ${fmtSigned(p1.grad)}）。`;
    }
    if (Math.abs(d1) > 1e-5 && Math.abs(d2) > 1e-5) {
      return `最近两步步幅：${Math.abs(d1).toFixed(3)} → ${Math.abs(d2).toFixed(3)}（${
        Math.abs(d2) < Math.abs(d1)
          ? "越靠近谷底坡度越缓，每格步幅自动收缩"
          : "进入更陡区域，坡度变大，每格步幅也跟着变大"
      }）。`;
    }
    return null;
  });

  const curX = () => xOfW(currentEval().w);
  const curY = () => yOfLoss(currentEval().loss);
  const ghostX = () => xOfW(previewDescent().to.w);
  const ghostY = () => yOfLoss(previewDescent().to.loss);
  const yTicks = createMemo(() => [0, yMax() * 0.33, yMax() * 0.67, yMax()]);
  const trailSegments = createMemo(() => activeTrail().slice(0, -1));

  return (
    <section
      aria-label="单维权重与损失切片探索"
      class="logistic-regression-panel logistic-regression-slice-panel"
    >
      <div class="logistic-regression-panel-head">
        <h3>固定其他权重，只调整一个词</h3>
        <span class="logistic-regression-badge-neutral">
          含「{selectedWord()}」样本：{dataset().totalCount} 条（垃圾 {dataset().posCount} · 正常{" "}
          {dataset().negCount}）
        </span>
      </div>

      <p class="logistic-regression-data-guide">
        真实模型有几千个词，画不出来全貌。我们先把其他词权重固定住，只单独调「{selectedWord()}
        」的权重：不含该词的短信（<MathFormula>x_j=0</MathFormula>
        ）不会受这个词影响，所以这里只统计包含该词的 {dataset().totalCount}{" "}
        条短信，观察权重怎么顺着坡度滑进最低点。
      </p>

      <div class="logistic-regression-slice-toolbar">
        <div class="logistic-regression-slice-group">
          <span class="logistic-regression-field-label">1. 选一个词：</span>
          <div aria-label="选择切片词" class="logistic-regression-preset-row" role="group">
            <For each={SLICE_WORD_OPTIONS}>
              {(opt) => (
                <Button
                  aria-pressed={selectedWord() === opt.word ? "true" : "false"}
                  class={`logistic-regression-chip-btn${selectedWord() === opt.word ? " is-active" : ""}`}
                  onClick={() => handleSelectWord(opt.word)}
                  type="button"
                >
                  <span>「{opt.label}」</span>
                </Button>
              )}
            </For>
          </div>
        </div>

        <div class="logistic-regression-slice-group">
          <span class="logistic-regression-field-label">2. 其他词固定为：</span>
          <div aria-label="选择其余权重基准" class="logistic-regression-segmented" role="group">
            <Button
              aria-pressed={contextMode() === "zero" ? "true" : "false"}
              class={contextMode() === "zero" ? "is-active" : ""}
              onClick={() => handleSelectContext("zero")}
              type="button"
            >
              全为 0（训练起点）
            </Button>
            <Button
              aria-pressed={contextMode() === "trained" ? "true" : "false"}
              class={contextMode() === "trained" ? "is-active" : ""}
              onClick={() => handleSelectContext("trained")}
              type="button"
            >
              当前训练模型权重
            </Button>
          </div>
        </div>
      </div>

      <p class="logistic-regression-muted-note">
        {wordMeta().note}
        {contextMode() === "trained" && learnedW() !== undefined
          ? Math.abs(learnedW()! - curve().minPoint.w) <= 0.35
            ? ` 当前模型为「${selectedWord()}」学到的权重是 ${fmtSigned(learnedW()!)}，已经靠近这条曲线的最低谷 w* ≈ ${fmtSigned(curve().minPoint.w, 2)}。`
            : ` 当前模型为「${selectedWord()}」学到的权重是 ${fmtSigned(learnedW()!)}，与当前曲线最低谷 w* ≈ ${fmtSigned(curve().minPoint.w, 2)} 仍有差距（可能上方学习率/轮数尚未收敛或波动较大）。`
          : ` 在起点全 0 时，曲线最低点位于 w* ≈ ${fmtSigned(curve().minPoint.w, 2)}。`}
      </p>

      <div class="logistic-regression-slice-eta-bar">
        <label class="logistic-regression-inline-slider" for="logistic-regression-slice-eta">
          <span>
            单步步长系数 η ={" "}
            <strong class="logistic-regression-mono">{sliceEta().toFixed(1)}</strong>
          </span>
          <input
            id="logistic-regression-slice-eta"
            max={SLICE_MAX_ETA}
            min={SLICE_MIN_ETA}
            onChange={(e) => setSliceEta(clampSliceEta(Number(e.currentTarget.value)))}
            onInput={(e) => setSliceEta(clampSliceEta(Number(e.currentTarget.value)))}
            step={0.1}
            type="range"
            value={sliceEta()}
          />
        </label>
        <div class="logistic-regression-preset-row">
          <For each={ETA_QUICK_PRESETS}>
            {(preset) => (
              <Button
                class={`logistic-regression-chip-btn logistic-regression-chip-sm${Math.abs(sliceEta() - preset.eta) < 0.05 ? " is-active" : ""}`}
                onClick={() => setSliceEta(preset.eta)}
                type="button"
              >
                {preset.label}
              </Button>
            )}
          </For>
        </div>
      </div>

      <div class="logistic-regression-chart-box logistic-regression-slice-chart-box">
        <div class="logistic-regression-chart-head">
          <h4>
            「{selectedWord()}」的权重与平均损失
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

        <svg
          aria-label={`词「${selectedWord()}」权重与交叉熵损失切片图`}
          class={`logistic-regression-svg-chart logistic-regression-slice-svg${dragging() ? " is-dragging" : ""}`}
          onPointerCancel={handleSvgPointerUp}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          ref={(el) => {
            svgRef = el;
          }}
          viewBox={`0 0 ${W} ${H}`}
        >
          <For each={yTicks()}>
            {(v) => (
              <g>
                <line
                  stroke="var(--border)"
                  stroke-width="0.8"
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={yOfLoss(v)}
                  y2={yOfLoss(v)}
                />
                <text
                  fill="var(--muted)"
                  font-size="9.5"
                  text-anchor="end"
                  x={PAD_L - 6}
                  y={yOfLoss(v) + 3}
                >
                  {v.toFixed(2)}
                </text>
              </g>
            )}
          </For>

          <For each={W_TICKS}>
            {(wTick) => (
              <g>
                <line
                  stroke="var(--border)"
                  stroke-dasharray={wTick === 0 ? "3 3" : undefined}
                  stroke-width="0.8"
                  x1={xOfW(wTick)}
                  x2={xOfW(wTick)}
                  y1={PAD_T}
                  y2={H - PAD_B}
                />
                <text
                  fill="var(--muted)"
                  font-size="9.5"
                  text-anchor="middle"
                  x={xOfW(wTick)}
                  y={H - 10}
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
            x1={xOfW(curve().minPoint.w)}
            x2={xOfW(curve().minPoint.w)}
            y1={PAD_T}
            y2={H - PAD_B}
          />
          <text
            fill="var(--success)"
            font-size="9.5"
            text-anchor="middle"
            x={Math.max(PAD_L + 26, Math.min(W - PAD_R - 26, xOfW(curve().minPoint.w)))}
            y={PAD_T - 4}
          >
            最低谷 w*≈{curve().minPoint.w.toFixed(2)}
          </text>

          <Show
            when={
              contextMode() === "trained" &&
              learnedW() !== undefined &&
              learnedW()! >= SLICE_MIN_W &&
              learnedW()! <= SLICE_MAX_W
                ? learnedW()
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
                  y1={PAD_T + 8}
                  y2={H - PAD_B}
                />
                <text
                  fill="var(--primary)"
                  font-size="8.5"
                  text-anchor="middle"
                  x={Math.max(PAD_L + 32, Math.min(W - PAD_R - 32, xOfW(lw())))}
                  y={H - PAD_B - 4}
                >
                  模型 w={lw().toFixed(2)}
                </text>
              </g>
            )}
          </Show>

          <polyline fill="none" points={curvePts()} stroke="var(--accent)" stroke-width="2.4" />

          <For each={trailSegments()}>
            {(pt, idx) => {
              const seg = () => {
                const nextPt = activeTrail()[idx() + 1];
                const x1 = xOfW(pt.w);
                const y1 = yOfLoss(pt.loss);
                const x2 = xOfW(nextPt.w);
                const y2 = yOfLoss(nextPt.loss);
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
                    y={Math.max(PAD_T + 8, seg().y1 - 7)}
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
                y1={yOfLoss(tan()[1])}
                y2={yOfLoss(tan()[3])}
              />
            )}
          </Show>

          <Show when={!previewDescent().isAtMinimum}>
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
            aria-label={`拖动调整词「${selectedWord()}」的权重 wⱼ`}
            aria-valuemax={SLICE_MAX_W}
            aria-valuemin={SLICE_MIN_W}
            aria-valuenow={Number(currentEval().w.toFixed(2))}
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

      <p class="logistic-regression-note-box logistic-regression-slice-impact" role="status">
        <Show
          fallback={
            <>
              固定其他词权重后，这 {currentEval().totalCount} 条含「{selectedWord()}」的短信当前判对{" "}
              <strong class="logistic-regression-mono">
                {currentEval().correctCount} / {currentEval().totalCount}
              </strong>{" "}
              条（误拦正常 <strong class="logistic-regression-mono">{currentEval().fpCount}</strong>{" "}
              条 · 漏掉垃圾{" "}
              <strong class="logistic-regression-mono">{currentEval().fnCount}</strong> 条）。
            </>
          }
          when={contextMode() === "zero"}
        >
          <>
            当前权重下，模型对这 {currentEval().totalCount} 条含「{selectedWord()}
            」短信的平均猜垃圾概率为{" "}
            <strong class="logistic-regression-mono">
              {(currentEval().meanProb * 100).toFixed(1)}%
            </strong>
            （真实垃圾占{" "}
            <strong class="logistic-regression-mono">{(actualSpamRate() * 100).toFixed(1)}%</strong>
            ）；按 50% 门槛判对{" "}
            <strong class="logistic-regression-mono">
              {currentEval().correctCount} / {currentEval().totalCount}
            </strong>{" "}
            条。其他权重均为 0 时，损失最低的位置对应这组短信的垃圾占比。
          </>
        </Show>
      </p>

      <div class="logistic-regression-micro-metrics">
        <div class="logistic-regression-stat-box">
          <span>当前权重 w</span>
          <strong class="logistic-regression-mono">{fmtSigned(currentEval().w)}</strong>
          <small>可直接在曲线上左右拖动圆点</small>
        </div>
        <div class="logistic-regression-stat-box">
          <span>平均损失</span>
          <strong class="logistic-regression-mono">{currentEval().loss.toFixed(4)}</strong>
          <small>曲线最低值：{curve().minPoint.loss.toFixed(4)}</small>
        </div>
        <div class="logistic-regression-stat-box">
          <span>当前坡度（往哪边是下坡）</span>
          <strong class="logistic-regression-mono">{fmtSigned(currentEval().grad, 4)}</strong>
          <small>
            {previewDescent().isAtMinimum
              ? "坡度接近 0，已在谷底附近"
              : currentEval().grad > 0
                ? "右高左低，顺坡应往左走"
                : "左高右低，顺坡应往右走"}
          </small>
        </div>
        <div class="logistic-regression-stat-box">
          <span>下一步会跳多远</span>
          <strong
            class={`logistic-regression-mono ${
              previewDescent().actualDelta > 0
                ? "is-pos"
                : previewDescent().actualDelta < 0
                  ? "is-neg"
                  : ""
            }`}
          >
            {fmtSigned(previewDescent().actualDelta)}
          </strong>
          <small>
            {previewDescent().isAtMinimum
              ? "步幅 ≈ 0，靠自动步长已动不了"
              : `将从 ${currentEval().w.toFixed(2)} 跳到 ${previewDescent().to.w.toFixed(2)}`}
          </small>
        </div>
      </div>

      <div class="logistic-regression-slice-actions">
        <Button class="button button-primary" onClick={() => triggerStep("descent")} type="button">
          按梯度更新一步
        </Button>
        <Button class="button button-ghost" onClick={() => triggerStep("left")} type="button">
          ← 往左试推一格（{fmtSigned(previewLeft().actualDelta, 2)} ·{" "}
          {previewDescent().descentSide === "left"
            ? "下坡 ↓"
            : previewDescent().descentSide === "right"
              ? "上坡 ↑"
              : "步长≈0"}
          ）
        </Button>
        <Button class="button button-ghost" onClick={() => triggerStep("right")} type="button">
          往右试推一格（{fmtSigned(previewRight().actualDelta, 2)} ·{" "}
          {previewDescent().descentSide === "right"
            ? "下坡 ↓"
            : previewDescent().descentSide === "left"
              ? "上坡 ↑"
              : "步长≈0"}
          ）→
        </Button>
        <Button class="button button-ghost" onClick={triggerFiveSteps} type="button">
          连走 5 步
        </Button>
        <Button class="button button-ghost" onClick={loadBouncePreset} type="button">
          示例：步子太大跨过头
        </Button>
        <Button class="button button-ghost" onClick={() => resetPoint()} type="button">
          重置起点
        </Button>
      </div>

      <Show when={statusHint()}>
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

      <Show when={activeTrail().length > 1}>
        <div class="logistic-regression-slice-trail">
          <span class="logistic-regression-field-label">跳跃轨迹：</span>
          <ol aria-label="跳跃历史轨迹" class="logistic-regression-trail-chips">
            <For each={activeTrail()}>
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
    </section>
  );
}
