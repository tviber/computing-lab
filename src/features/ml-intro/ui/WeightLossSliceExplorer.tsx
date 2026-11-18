import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { getPublicCorpus } from "../domain/corpus.ts";
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
import type { TrainedModel } from "../domain/logreg.ts";

type TrailPoint = SliceEval & {
  deltaW: number | null;
  action: SliceStepDirection | "init";
};

type ContextMode = "zero" | "trained";

const ETA_QUICK_PRESETS = [
  { label: "稳步 η = 0.8", eta: 0.8 },
  { label: "适中 η = 2.0", eta: 2.0 },
  { label: "跨谷反弹 η = 5.5", eta: 5.5 },
  { label: "大幅震荡 η = 7.5", eta: 7.5 },
] as const;

const DEFAULT_START_W = 2.0;

/**
 * Clips a line segment (x1,y1)-(x2,y2) to the rectangle [xmin,xmax] x [ymin,ymax]
 * using Liang-Barsky parametric clipping so steep tangent lines never overflow the plot frame.
 */
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

export function WeightLossSliceExplorer({ trainedModel }: { trainedModel: TrainedModel }) {
  const { train } = useMemo(() => getPublicCorpus(), []);
  const [selectedWord, setSelectedWord] = useState<string>(SLICE_WORD_OPTIONS[0].word);
  const [contextMode, setContextMode] = useState<ContextMode>("zero");
  const [sliceEta, setSliceEta] = useState<number>(2.0);
  const [currentW, setCurrentW] = useState<number>(DEFAULT_START_W);
  const [trail, setTrail] = useState<TrailPoint[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const dataset = useMemo(
    () =>
      buildWordSliceDataset(selectedWord, train, contextMode === "trained" ? trainedModel : null),
    [selectedWord, train, contextMode, trainedModel],
  );

  const curve = useMemo(() => sampleLossSliceCurve(dataset.samples), [dataset.samples]);
  const currentEval = useMemo(
    () => evaluateSliceAt(dataset.samples, currentW),
    [dataset.samples, currentW],
  );
  const previewDescent = useMemo(
    () => stepSliceWeight(dataset.samples, currentW, sliceEta, "descent"),
    [dataset.samples, currentW, sliceEta],
  );
  const previewLeft = useMemo(
    () => stepSliceWeight(dataset.samples, currentW, sliceEta, "left"),
    [dataset.samples, currentW, sliceEta],
  );
  const previewRight = useMemo(
    () => stepSliceWeight(dataset.samples, currentW, sliceEta, "right"),
    [dataset.samples, currentW, sliceEta],
  );

  const activeTrail: TrailPoint[] = useMemo(() => {
    if (trail && trail.length > 0) return trail;
    return [{ ...currentEval, deltaW: null, action: "init" }];
  }, [trail, currentEval]);

  const wordMeta =
    SLICE_WORD_OPTIONS.find((item) => item.word === selectedWord) ?? SLICE_WORD_OPTIONS[0];
  const learnedW = trainedModel.weightsByWord.get(selectedWord);
  const actualSpamRate = dataset.totalCount > 0 ? dataset.posCount / dataset.totalCount : 0;

  const resetPoint = (nextW = DEFAULT_START_W, nextWord = selectedWord, nextMode = contextMode) => {
    const nextDataset = buildWordSliceDataset(
      nextWord,
      train,
      nextMode === "trained" ? trainedModel : null,
    );
    const safeW = clampSliceW(nextW);
    const ev = evaluateSliceAt(nextDataset.samples, safeW);
    setCurrentW(safeW);
    setTrail([{ ...ev, deltaW: null, action: "init" }]);
    setStatusHint(null);
  };

  const handleSelectWord = (word: string) => {
    setSelectedWord(word);
    resetPoint(DEFAULT_START_W, word, contextMode);
  };

  const handleSelectContext = (mode: ContextMode) => {
    setContextMode(mode);
    resetPoint(DEFAULT_START_W, selectedWord, mode);
  };

  const triggerStep = (direction: SliceStepDirection) => {
    const outcome = stepSliceWeight(dataset.samples, currentW, sliceEta, direction);
    if (outcome.isAtMinimum) {
      setStatusHint(
        "当前位置已经到谷底，坡度几乎为 0，单靠自动步长推不动了。请直接拖动曲线上的圆点放到斜坡上再试。",
      );
      return;
    }
    if (Math.abs(outcome.actualDelta) < 1e-5 && outcome.clamped) {
      setStatusHint("已到达横轴展示边界，无法继续向该方向移动。");
      return;
    }
    const base = activeTrail;
    const nextPoint: TrailPoint = {
      ...outcome.to,
      deltaW: outcome.actualDelta,
      action: direction,
    };
    setCurrentW(outcome.to.w);
    setTrail([...base.slice(-6), nextPoint]);
    setStatusHint(outcome.clamped ? "步子太大，落点已贴到坐标轴边界。" : null);
  };

  const triggerFiveSteps = () => {
    let wCursor = currentW;
    const nextPoints: TrailPoint[] = [...activeTrail];
    for (let i = 0; i < 5; i++) {
      const outcome = stepSliceWeight(dataset.samples, wCursor, sliceEta, "descent");
      if (outcome.isAtMinimum || Math.abs(outcome.actualDelta) < 1e-5) break;
      wCursor = outcome.to.w;
      nextPoints.push({
        ...outcome.to,
        deltaW: outcome.actualDelta,
        action: "descent",
      });
    }
    setCurrentW(wCursor);
    setTrail(nextPoints.slice(-7));
    setStatusHint(
      nextPoints.length === activeTrail.length
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
    setTrail([{ ...ev, deltaW: null, action: "init" }]);
    setStatusHint(
      "已切换到「好」+ η = 6.5：连续点两次「顺坡走一步」，观察点跨过谷底后弹回为什么回不到原点。",
    );
  };

  const W = 540;
  const H = 228;
  const PAD_L = 48;
  const PAD_R = 20;
  const PAD_T = 20;
  const PAD_B = 30;
  const yMax = Math.max(0.35, curve.maxLoss * 1.12);

  const xOfW = (w: number) =>
    PAD_L + ((clampSliceW(w) - SLICE_MIN_W) / (SLICE_MAX_W - SLICE_MIN_W)) * (W - PAD_L - PAD_R);
  const yOfLoss = (loss: number) => {
    const clamped = Math.max(0, Math.min(yMax, loss));
    return H - PAD_B - (clamped / yMax) * (H - PAD_T - PAD_B);
  };

  const wFromClientX = (clientX: number): number => {
    const svg = svgRef.current;
    if (!svg) return currentW;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return currentW;
    const svgX = ((clientX - rect.left) / rect.width) * W;
    const ratio = (svgX - PAD_L) / (W - PAD_L - PAD_R);
    return clampSliceW(SLICE_MIN_W + ratio * (SLICE_MAX_W - SLICE_MIN_W));
  };

  const updateDraggedW = (clientX: number) => {
    const nextW = wFromClientX(clientX);
    const ev = evaluateSliceAt(dataset.samples, nextW);
    setCurrentW(nextW);
    setTrail([{ ...ev, deltaW: null, action: "init" }]);
    setStatusHint(null);
  };

  const handleSvgPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    updateDraggedW(e.clientX);
  };

  const handleSvgPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    updateDraggedW(e.clientX);
  };

  const handleSvgPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleHandleKeyDown = (e: KeyboardEvent<SVGCircleElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 0.5 : 0.1;
    const nextW = clampSliceW(currentW + (e.key === "ArrowRight" ? step : -step));
    const ev = evaluateSliceAt(dataset.samples, nextW);
    setCurrentW(nextW);
    setTrail([{ ...ev, deltaW: null, action: "init" }]);
    setStatusHint(null);
  };

  const curvePts = curve.points
    .map((pt) => `${xOfW(pt.w).toFixed(1)},${yOfLoss(pt.loss).toFixed(1)}`)
    .join(" ");

  const tangentSpanW = 1.6;
  const rawTangent = clipLineToBox(
    currentEval.w - tangentSpanW,
    currentEval.loss - currentEval.grad * tangentSpanW,
    currentEval.w + tangentSpanW,
    currentEval.loss + currentEval.grad * tangentSpanW,
    SLICE_MIN_W,
    SLICE_MAX_W,
    0,
    yMax,
  );

  const lastThree = activeTrail.length >= 3 ? activeTrail.slice(-3) : null;
  let comparisonNote: string | null = null;
  if (lastThree) {
    const [p0, p1, p2] = lastThree;
    const d1 = p1.w - p0.w;
    const d2 = p2.w - p1.w;
    if (d1 * d2 < -1e-6) {
      const diff = p2.w - p0.w;
      comparisonNote = `来回对比：从 P${activeTrail.length - 3} (${p0.w.toFixed(2)}) 跳到 P${activeTrail.length - 2} (${p1.w.toFixed(2)}) 后再反向跳回 P${activeTrail.length - 1} (${p2.w.toFixed(2)})，没有回到原位（相差 ${fmtSigned(diff)}），因为两处的坡度（偏导）不同（${fmtSigned(p0.grad)} vs ${fmtSigned(p1.grad)}）。`;
    } else if (Math.abs(d1) > 1e-5 && Math.abs(d2) > 1e-5) {
      comparisonNote = `最近两步步幅：${Math.abs(d1).toFixed(3)} → ${Math.abs(d2).toFixed(3)}（${
        Math.abs(d2) < Math.abs(d1)
          ? "越靠近谷底坡度越缓，每格步幅自动收缩"
          : "进入更陡区域，坡度变大，每格步幅也跟着变大"
      }）。`;
    }
  }

  const curX = xOfW(currentEval.w);
  const curY = yOfLoss(currentEval.loss);
  const ghostX = xOfW(previewDescent.to.w);
  const ghostY = yOfLoss(previewDescent.to.loss);
  const yTicks = [0, yMax * 0.33, yMax * 0.67, yMax];

  return (
    <section className="ml-panel ml-slice-panel" aria-label="单维权重与损失切片探索">
      <div className="ml-panel-head">
        <h3>固定其他词，单看一个词的权重怎样把「猜错扣分」降到最低</h3>
        <span className="ml-badge-neutral">
          含「{selectedWord}」样本：{dataset.totalCount} 条（垃圾 {dataset.posCount} · 正常{" "}
          {dataset.negCount}）
        </span>
      </div>

      <p className="ml-data-guide">
        真实模型有几千个词，画不出来全貌。我们先把其他词权重固定住，只单独调「{selectedWord}
        」的权重：不含该词的短信（x<sub>j</sub>=0）不会受这个词影响，所以这里只统计包含该词的{" "}
        {dataset.totalCount} 条短信，观察权重怎么顺着坡度滑进最低点。
      </p>

      <div className="ml-slice-toolbar">
        <div className="ml-slice-group">
          <span className="ml-field-label">1. 选一个词：</span>
          <div className="ml-preset-row" role="group" aria-label="选择切片词">
            {SLICE_WORD_OPTIONS.map((opt) => (
              <button
                aria-pressed={selectedWord === opt.word}
                className={`ml-chip-btn${selectedWord === opt.word ? " is-active" : ""}`}
                key={opt.word}
                onClick={() => handleSelectWord(opt.word)}
                type="button"
              >
                <span>「{opt.label}」</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ml-slice-group">
          <span className="ml-field-label">2. 其他词固定为：</span>
          <div className="ml-segmented" role="group" aria-label="选择其余权重基准">
            <button
              aria-pressed={contextMode === "zero"}
              className={contextMode === "zero" ? "is-active" : ""}
              onClick={() => handleSelectContext("zero")}
              type="button"
            >
              全为 0（训练起点）
            </button>
            <button
              aria-pressed={contextMode === "trained"}
              className={contextMode === "trained" ? "is-active" : ""}
              onClick={() => handleSelectContext("trained")}
              type="button"
            >
              当前训练模型权重
            </button>
          </div>
        </div>
      </div>

      <p className="ml-muted-note">
        {wordMeta.note}
        {contextMode === "trained" && learnedW !== undefined
          ? Math.abs(learnedW - curve.minPoint.w) <= 0.35
            ? ` 当前模型为「${selectedWord}」学到的权重是 ${fmtSigned(learnedW)}，已经靠近这条曲线的最低谷 w* ≈ ${fmtSigned(curve.minPoint.w, 2)}。`
            : ` 当前模型为「${selectedWord}」学到的权重是 ${fmtSigned(learnedW)}，与当前曲线最低谷 w* ≈ ${fmtSigned(curve.minPoint.w, 2)} 仍有差距（可能上方学习率/轮数尚未收敛或波动较大）。`
          : ` 在起点全 0 时，曲线最低点位于 w* ≈ ${fmtSigned(curve.minPoint.w, 2)}。`}
      </p>

      <div className="ml-slice-eta-bar">
        <label className="ml-inline-slider" htmlFor="ml-slice-eta">
          <span>
            单步步长系数 η = <strong className="ml-mono">{sliceEta.toFixed(1)}</strong>
          </span>
          <input
            id="ml-slice-eta"
            max={SLICE_MAX_ETA}
            min={SLICE_MIN_ETA}
            onChange={(e) => setSliceEta(clampSliceEta(Number(e.target.value)))}
            step={0.1}
            type="range"
            value={sliceEta}
          />
        </label>
        <div className="ml-preset-row">
          {ETA_QUICK_PRESETS.map((preset) => (
            <button
              className={`ml-chip-btn ml-chip-sm${Math.abs(sliceEta - preset.eta) < 0.05 ? " is-active" : ""}`}
              key={preset.label}
              onClick={() => setSliceEta(preset.eta)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ml-chart-box ml-slice-chart-box">
        <div className="ml-chart-head">
          <h4>
            「{selectedWord}」的权重 vs 猜错平均扣分
            <small className="ml-slice-sub">（拖动圆点摆放起点，点下方按钮看一步跳去哪）</small>
          </h4>
          <div className="ml-legend">
            <span className="ml-leg-item">
              <i className="ml-leg-swatch is-train" /> 扣分曲线
            </span>
            <span className="ml-leg-item">
              <i className="ml-leg-swatch is-tangent" /> 当前坡度切线
            </span>
            <span className="ml-leg-item">
              <i className="ml-leg-dot is-msg" /> 当前点 / 虚线为下一跳位置
            </span>
          </div>
        </div>

        <svg
          aria-label={`词「${selectedWord}」权重与交叉熵损失切片图`}
          className={`ml-svg-chart ml-slice-svg${dragging ? " is-dragging" : ""}`}
          onPointerCancel={handleSvgPointerUp}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
        >
          {yTicks.map((v, idx) => (
            <g key={idx}>
              <line
                stroke="var(--border)"
                strokeWidth="0.8"
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yOfLoss(v)}
                y2={yOfLoss(v)}
              />
              <text
                fill="var(--muted)"
                fontSize="9.5"
                textAnchor="end"
                x={PAD_L - 6}
                y={yOfLoss(v) + 3}
              >
                {v.toFixed(2)}
              </text>
            </g>
          ))}

          {[-4, -2, 0, 2, 4].map((wTick) => (
            <g key={wTick}>
              <line
                stroke="var(--border)"
                strokeDasharray={wTick === 0 ? "3 3" : undefined}
                strokeWidth="0.8"
                x1={xOfW(wTick)}
                x2={xOfW(wTick)}
                y1={PAD_T}
                y2={H - PAD_B}
              />
              <text
                fill="var(--muted)"
                fontSize="9.5"
                textAnchor="middle"
                x={xOfW(wTick)}
                y={H - 10}
              >
                {wTick > 0 ? `+${wTick}` : wTick}
              </text>
            </g>
          ))}

          <line
            stroke="var(--success)"
            strokeDasharray="3 3"
            strokeOpacity="0.65"
            strokeWidth="1.1"
            x1={xOfW(curve.minPoint.w)}
            x2={xOfW(curve.minPoint.w)}
            y1={PAD_T}
            y2={H - PAD_B}
          />
          <text
            fill="var(--success)"
            fontSize="9.5"
            textAnchor="middle"
            x={Math.max(PAD_L + 26, Math.min(W - PAD_R - 26, xOfW(curve.minPoint.w)))}
            y={PAD_T - 4}
          >
            最低谷 w*≈{curve.minPoint.w.toFixed(2)}
          </text>

          {contextMode === "trained" &&
          learnedW !== undefined &&
          learnedW >= SLICE_MIN_W &&
          learnedW <= SLICE_MAX_W ? (
            <g>
              <line
                stroke="var(--primary)"
                strokeDasharray="2 2"
                strokeOpacity="0.6"
                strokeWidth="1.1"
                x1={xOfW(learnedW)}
                x2={xOfW(learnedW)}
                y1={PAD_T + 8}
                y2={H - PAD_B}
              />
              <text
                fill="var(--primary)"
                fontSize="8.5"
                textAnchor="middle"
                x={Math.max(PAD_L + 32, Math.min(W - PAD_R - 32, xOfW(learnedW)))}
                y={H - PAD_B - 4}
              >
                模型 w={learnedW.toFixed(2)}
              </text>
            </g>
          ) : null}

          <polyline fill="none" points={curvePts} stroke="var(--accent)" strokeWidth="2.4" />

          {activeTrail.slice(0, -1).map((pt, idx) => {
            const nextPt = activeTrail[idx + 1];
            const x1 = xOfW(pt.w);
            const y1 = yOfLoss(pt.loss);
            const x2 = xOfW(nextPt.w);
            const y2 = yOfLoss(nextPt.loss);
            const midX = (x1 + x2) / 2;
            const arcY = Math.min(y1, y2) - Math.min(26, Math.abs(x2 - x1) * 0.22 + 8);
            return (
              <g key={`trail-${idx}`}>
                <path
                  d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${midX.toFixed(1)} ${arcY.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`}
                  fill="none"
                  stroke="var(--muted)"
                  strokeDasharray="3 2"
                  strokeOpacity="0.65"
                  strokeWidth="1.3"
                />
                <circle
                  cx={x1}
                  cy={y1}
                  fill="var(--surface)"
                  r="3.8"
                  stroke="var(--muted)"
                  strokeWidth="1.5"
                />
                <text
                  fill="var(--muted)"
                  fontSize="8.5"
                  textAnchor="middle"
                  x={x1}
                  y={Math.max(PAD_T + 8, y1 - 7)}
                >
                  P{idx}
                </text>
              </g>
            );
          })}

          {rawTangent ? (
            <line
              stroke="var(--warning)"
              strokeWidth="1.8"
              x1={xOfW(rawTangent[0])}
              x2={xOfW(rawTangent[2])}
              y1={yOfLoss(rawTangent[1])}
              y2={yOfLoss(rawTangent[3])}
            />
          ) : null}

          {!previewDescent.isAtMinimum ? (
            <g>
              <line
                stroke="var(--accent)"
                strokeDasharray="4 3"
                strokeOpacity="0.7"
                strokeWidth="1.5"
                x1={curX}
                x2={ghostX}
                y1={curY}
                y2={ghostY}
              />
              <circle
                cx={ghostX}
                cy={ghostY}
                fill="var(--surface)"
                fillOpacity="0.85"
                r="4.5"
                stroke="var(--accent)"
                strokeDasharray="2 2"
                strokeWidth="1.6"
              />
            </g>
          ) : null}

          <circle
            aria-label={`拖动调整词「${selectedWord}」的权重 wⱼ`}
            aria-valuemax={SLICE_MAX_W}
            aria-valuemin={SLICE_MIN_W}
            aria-valuenow={Number(currentEval.w.toFixed(2))}
            className="ml-slice-handle"
            cx={curX}
            cy={curY}
            fill="var(--accent)"
            onKeyDown={handleHandleKeyDown}
            r="7"
            role="slider"
            stroke="var(--surface)"
            strokeWidth="2.2"
            tabIndex={0}
          />
        </svg>
      </div>

      <p className="ml-note-box ml-slice-impact" role="status">
        {contextMode === "zero" ? (
          <>
            当前权重下，模型对这 {currentEval.totalCount} 条含「{selectedWord}
            」短信的平均猜垃圾概率为{" "}
            <strong className="ml-mono">{(currentEval.meanProb * 100).toFixed(1)}%</strong>
            （真实垃圾占 <strong className="ml-mono">{(actualSpamRate * 100).toFixed(1)}%</strong>
            ）；按 50% 门槛判对{" "}
            <strong className="ml-mono">
              {currentEval.correctCount} / {currentEval.totalCount}
            </strong>{" "}
            条。把扣分降到最低，就是让猜测把握度尽量贴近真实比例。
          </>
        ) : (
          <>
            固定其他词权重后，这 {currentEval.totalCount} 条含「{selectedWord}」的短信当前判对{" "}
            <strong className="ml-mono">
              {currentEval.correctCount} / {currentEval.totalCount}
            </strong>{" "}
            条（误拦正常 <strong className="ml-mono">{currentEval.fpCount}</strong> 条 · 漏掉垃圾{" "}
            <strong className="ml-mono">{currentEval.fnCount}</strong> 条）。
          </>
        )}
      </p>

      <div className="ml-micro-metrics">
        <div className="ml-stat-box">
          <span>当前权重 w</span>
          <strong className="ml-mono">{fmtSigned(currentEval.w)}</strong>
          <small>可直接在曲线上左右拖动圆点</small>
        </div>
        <div className="ml-stat-box">
          <span>猜错平均扣分</span>
          <strong className="ml-mono">{currentEval.loss.toFixed(4)}</strong>
          <small>谷底最低扣分：{curve.minPoint.loss.toFixed(4)}</small>
        </div>
        <div className="ml-stat-box">
          <span>当前坡度（往哪边是下坡）</span>
          <strong className="ml-mono">{fmtSigned(currentEval.grad, 4)}</strong>
          <small>
            {previewDescent.isAtMinimum
              ? "坡度接近 0，已在谷底附近"
              : currentEval.grad > 0
                ? "右高左低，顺坡应往左走"
                : "左高右低，顺坡应往右走"}
          </small>
        </div>
        <div className="ml-stat-box">
          <span>下一步会跳多远</span>
          <strong
            className={`ml-mono ${
              previewDescent.actualDelta > 0
                ? "is-pos"
                : previewDescent.actualDelta < 0
                  ? "is-neg"
                  : ""
            }`}
          >
            {fmtSigned(previewDescent.actualDelta)}
          </strong>
          <small>
            {previewDescent.isAtMinimum
              ? "步幅 ≈ 0，靠自动步长已动不了"
              : `将从 ${currentEval.w.toFixed(2)} 跳到 ${previewDescent.to.w.toFixed(2)}`}
          </small>
        </div>
      </div>

      <div className="ml-slice-actions">
        <button
          className="button button-primary"
          onClick={() => triggerStep("descent")}
          type="button"
        >
          顺坡走一步（让模型自己降扣分）
        </button>
        <button className="button button-ghost" onClick={() => triggerStep("left")} type="button">
          ← 往左试推一格（{fmtSigned(previewLeft.actualDelta, 2)} ·{" "}
          {previewDescent.descentSide === "left"
            ? "下坡 ↓"
            : previewDescent.descentSide === "right"
              ? "上坡 ↑"
              : "步长≈0"}
          ）
        </button>
        <button className="button button-ghost" onClick={() => triggerStep("right")} type="button">
          往右试推一格（{fmtSigned(previewRight.actualDelta, 2)} ·{" "}
          {previewDescent.descentSide === "right"
            ? "下坡 ↓"
            : previewDescent.descentSide === "left"
              ? "上坡 ↑"
              : "步长≈0"}
          ）→
        </button>
        <button className="button button-ghost" onClick={triggerFiveSteps} type="button">
          连走 5 步
        </button>
        <button className="button button-ghost" onClick={loadBouncePreset} type="button">
          示例：步子太大跨过头
        </button>
        <button className="button button-ghost" onClick={() => resetPoint()} type="button">
          重置起点
        </button>
      </div>

      {statusHint ? (
        <p className="ml-note-box" role="status">
          {statusHint}
        </p>
      ) : null}

      {comparisonNote ? (
        <p className="ml-note-box ml-slice-insight" role="status">
          {comparisonNote}
        </p>
      ) : null}

      {activeTrail.length > 1 ? (
        <div className="ml-slice-trail" aria-label="跳跃历史轨迹">
          <span className="ml-field-label">跳跃轨迹：</span>
          <ol className="ml-trail-chips">
            {activeTrail.map((pt, idx) => (
              <li className="ml-trail-chip" key={`${idx}-${pt.w}`}>
                <span className="ml-mono">
                  P{idx}: w={pt.w.toFixed(2)}
                </span>
                {pt.deltaW !== null ? (
                  <small className="ml-mono">({fmtSigned(pt.deltaW, 2)})</small>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
