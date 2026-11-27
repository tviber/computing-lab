import { createMemo, For, Show } from "solid-js";
import {
  BLIND_GUESS_LOSS,
  type BgdEpochPoint,
  type EpochSnapshot,
  type IntraEpochPoint,
} from "../domain/logisticRegression.ts";

const W = 440;
const H = 190;
const PAD_L = 42;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 26;
const LOSS_TICKS = [0, 0.25, 0.5, 0.75] as const;
const INTRA_EPOCHS = [1, 2, 3] as const;

export function LossChartSvg(props: {
  history: readonly EpochSnapshot[];
  bgdHistory?: readonly BgdEpochPoint[];
  intraTrace?: readonly IntraEpochPoint[];
  inspectEpoch?: number;
  showBgd?: boolean;
  referenceHistory?: readonly EpochSnapshot[];
  onSelectEpoch?: (epoch: number) => void;
}) {
  const maxEpoch = createMemo(() =>
    Math.max(1, props.history[props.history.length - 1]?.epoch ?? 1),
  );

  const maxLoss = createMemo(() => {
    const allVals = [
      BLIND_GUESS_LOSS,
      ...props.history.map((h) => h.trainLoss),
      ...props.history.map((h) => h.valLoss),
      ...(props.showBgd && props.bgdHistory ? props.bgdHistory.map((b) => b.bgdValLoss) : []),
      ...(props.referenceHistory ?? []).map((h) => h.valLoss),
    ];
    return Math.max(0.8, Math.min(1.6, Math.max(...allVals) * 1.08));
  });

  const xOfEp = (ep: number) => PAD_L + (ep / maxEpoch()) * (W - PAD_L - PAD_R);
  const yOfLoss = (v: number) => {
    const clamped = Math.max(0, Math.min(maxLoss(), v));
    return H - PAD_B - (clamped / maxLoss()) * (H - PAD_T - PAD_B);
  };

  const trainPts = createMemo(() =>
    props.history
      .map((h) => `${xOfEp(h.epoch).toFixed(1)},${yOfLoss(h.trainLoss).toFixed(1)}`)
      .join(" "),
  );
  const valPts = createMemo(() =>
    props.history
      .map((h) => `${xOfEp(h.epoch).toFixed(1)},${yOfLoss(h.valLoss).toFixed(1)}`)
      .join(" "),
  );
  const bgdPts = createMemo(() =>
    props.showBgd && props.bgdHistory
      ? props.bgdHistory.map(
          (b) => `${xOfEp(b.epoch).toFixed(1)},${yOfLoss(b.bgdValLoss).toFixed(1)}`,
        )
      : [],
  );
  const referencePts = createMemo(
    () =>
      props.referenceHistory?.map(
        (h) => `${xOfEp(h.epoch).toFixed(1)},${yOfLoss(h.valLoss).toFixed(1)}`,
      ) ?? [],
  );

  return (
    <div class="logistic-regression-charts-grid">
      <div class="logistic-regression-chart-box">
        <div class="logistic-regression-chart-head">
          <h4>每轮训练后的损失</h4>
          <div class="logistic-regression-legend">
            <span class="logistic-regression-leg-item">
              <i class="logistic-regression-leg-swatch is-train" /> 训练损失
            </span>
            <span class="logistic-regression-leg-item">
              <i class="logistic-regression-leg-swatch is-val" /> 验证损失
            </span>
            <Show when={props.showBgd && bgdPts().length > 0}>
              <span class="logistic-regression-leg-item">
                <i class="logistic-regression-leg-swatch is-bgd" /> 全批量 BGD
              </span>
            </Show>
            <Show when={referencePts().length > 0}>
              <span class="logistic-regression-leg-item">
                <i class="logistic-regression-leg-swatch is-reference" />
                参考 SGD
              </span>
            </Show>
          </div>
        </div>
        <svg
          aria-label="每轮损失变化曲线"
          class="logistic-regression-svg-chart"
          viewBox={`0 0 ${W} ${H}`}
        >
          <For each={LOSS_TICKS}>
            {(v) => (
              <Show when={v <= maxLoss()}>
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
                    font-size="9"
                    text-anchor="end"
                    x={PAD_L - 5}
                    y={yOfLoss(v) + 3}
                  >
                    {v.toFixed(2)}
                  </text>
                </g>
              </Show>
            )}
          </For>
          <line
            stroke="var(--warn)"
            stroke-dasharray="4 3"
            stroke-width="1.1"
            x1={PAD_L}
            x2={W - PAD_R}
            y1={yOfLoss(BLIND_GUESS_LOSS)}
            y2={yOfLoss(BLIND_GUESS_LOSS)}
          />
          <text fill="var(--warn)" font-size="9" x={PAD_L + 4} y={yOfLoss(BLIND_GUESS_LOSS) - 4}>
            p=0.5 时 ln2 ≈ 0.693
          </text>
          <Show when={bgdPts().length > 0}>
            <polyline
              fill="none"
              points={bgdPts().join(" ")}
              stroke="var(--warn)"
              stroke-dasharray="5 3"
              stroke-width="1.8"
            />
          </Show>
          <Show when={referencePts().length > 0}>
            <polyline
              fill="none"
              points={referencePts().join(" ")}
              stroke="var(--success)"
              stroke-dasharray="4 3"
              stroke-width="1.8"
            />
          </Show>
          <polyline fill="none" points={trainPts()} stroke="var(--accent)" stroke-width="2.2" />
          <polyline fill="none" points={valPts()} stroke="var(--success)" stroke-width="2.2" />
          <Show when={props.inspectEpoch !== undefined}>
            <line
              stroke="var(--ink)"
              stroke-dasharray="2 2"
              stroke-opacity="0.45"
              stroke-width="1.2"
              x1={xOfEp(props.inspectEpoch!)}
              x2={xOfEp(props.inspectEpoch!)}
              y1={PAD_T}
              y2={H - PAD_B}
            />
          </Show>
          <For each={props.history}>
            {(h) => (
              <circle
                cx={xOfEp(h.epoch)}
                cy={yOfLoss(h.valLoss)}
                fill={props.inspectEpoch === h.epoch ? "var(--ink)" : "var(--success)"}
                onClick={props.onSelectEpoch ? () => props.onSelectEpoch?.(h.epoch) : undefined}
                r={props.inspectEpoch === h.epoch ? 4.2 : 2.6}
                style={props.onSelectEpoch ? { cursor: "pointer" } : undefined}
              />
            )}
          </For>
          <text fill="var(--muted)" font-size="9" x={PAD_L} y={H - 8}>
            Epoch 0
          </text>
          <text fill="var(--muted)" font-size="9" text-anchor="end" x={W - PAD_R} y={H - 8}>
            Epoch {maxEpoch()}
          </text>
        </svg>
      </div>

      <Show when={props.intraTrace && props.intraTrace.length > 1 ? props.intraTrace : null}>
        {(trace) => <IntraEpochSvg bgdHistory={props.bgdHistory} intraTrace={trace()} />}
      </Show>
    </div>
  );
}

function IntraEpochSvg(props: {
  intraTrace: readonly IntraEpochPoint[];
  bgdHistory?: readonly BgdEpochPoint[];
}) {
  const maxEpF = createMemo(() =>
    Math.max(1, props.intraTrace[props.intraTrace.length - 1]?.epochFloat ?? 3),
  );
  const maxLoss = createMemo(() => {
    const traceMax = Math.max(BLIND_GUESS_LOSS, ...props.intraTrace.map((pt) => pt.sgdValLoss));
    return Math.max(0.8, Math.min(2.2, traceMax * 1.08));
  });

  const xOf = (epF: number) => PAD_L + (epF / maxEpF()) * (W - PAD_L - PAD_R);
  const yOf = (v: number) => {
    const clamped = Math.max(0, Math.min(maxLoss(), v));
    return H - PAD_B - (clamped / maxLoss()) * (H - PAD_T - PAD_B);
  };

  const sgdPts = createMemo(() =>
    props.intraTrace
      .map((p) => `${xOf(p.epochFloat).toFixed(1)},${yOf(p.sgdValLoss).toFixed(1)}`)
      .join(" "),
  );
  const bgdPts = createMemo(() => {
    const bgdSliced = (props.bgdHistory ?? []).filter((b) => b.epoch <= Math.ceil(maxEpF()));
    return bgdSliced.map((b) => `${xOf(b.epoch).toFixed(1)},${yOf(b.bgdValLoss).toFixed(1)}`);
  });

  return (
    <div class="logistic-regression-chart-box">
      <div class="logistic-regression-chart-head">
        <h4>前 3 轮的验证损失（每轮采样 10 次）</h4>
        <div class="logistic-regression-legend">
          <span class="logistic-regression-leg-item">
            <i class="logistic-regression-leg-swatch is-train" /> SGD 验证损失采样
          </span>
          <Show when={bgdPts().length > 0}>
            <span class="logistic-regression-leg-item">
              <i class="logistic-regression-leg-swatch is-bgd" /> 全批量 BGD
            </span>
          </Show>
        </div>
      </div>
      <svg
        aria-label="前 3 轮验证损失采样曲线"
        class="logistic-regression-svg-chart"
        viewBox={`0 0 ${W} ${H}`}
      >
        <For each={INTRA_EPOCHS}>
          {(ep) => (
            <Show when={ep <= maxEpF()}>
              <g>
                <line
                  stroke="var(--border)"
                  stroke-dasharray="2 3"
                  stroke-width="0.9"
                  x1={xOf(ep)}
                  x2={xOf(ep)}
                  y1={PAD_T}
                  y2={H - PAD_B}
                />
                <text fill="var(--muted)" font-size="9" text-anchor="middle" x={xOf(ep)} y={H - 8}>
                  第{ep}轮结束
                </text>
              </g>
            </Show>
          )}
        </For>
        <line
          stroke="var(--border)"
          stroke-width="0.8"
          x1={PAD_L}
          x2={W - PAD_R}
          y1={yOf(0)}
          y2={yOf(0)}
        />
        <Show when={bgdPts().length > 0}>
          <polyline
            fill="none"
            points={bgdPts().join(" ")}
            stroke="var(--warn)"
            stroke-dasharray="5 3"
            stroke-width="2"
          />
        </Show>
        <polyline fill="none" points={sgdPts()} stroke="var(--accent)" stroke-width="1.9" />
        <text
          fill="var(--muted)"
          font-size="9"
          text-anchor="end"
          x={PAD_L - 5}
          y={yOf(BLIND_GUESS_LOSS)}
        >
          0.69
        </text>
        <text fill="var(--muted)" font-size="9" text-anchor="end" x={PAD_L - 5} y={yOf(0)}>
          0
        </text>
      </svg>
    </div>
  );
}
