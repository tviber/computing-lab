import { createMemo, For } from "solid-js";
import { binaryLogLoss } from "../domain/logisticRegression.ts";

const W = 320;
const H = 136;
const PAD_L = 36;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 22;
const MAX_LOSS = 4.0;
const LOSS_TICKS = [0, 1, 2, 3, 4] as const;

const xOfP = (p: number) => PAD_L + ((p - 0.02) / 0.96) * (W - PAD_L - PAD_R);
const yOfL = (v: number) => {
  const c = Math.max(0, Math.min(MAX_LOSS, v));
  return H - PAD_B - (c / MAX_LOSS) * (H - PAD_T - PAD_B);
};

function buildCurve(y: 0 | 1): string {
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const p = 0.02 + (0.96 * i) / 48;
    pts.push(`${xOfP(p).toFixed(1)},${yOfL(binaryLogLoss(y, p)).toFixed(1)}`);
  }
  return pts.join(" ");
}

const CURVE_Y1 = buildCurve(1);
const CURVE_Y0 = buildCurve(0);

export function SingleStepPenaltyVisual(props: {
  trueY: 0 | 1;
  predP: number;
  eta: number;
  loss: number;
  deltaW: number;
}) {
  const activeCurve = () => (props.trueY === 1 ? CURVE_Y1 : CURVE_Y0);
  const otherCurve = () => (props.trueY === 1 ? CURVE_Y0 : CURVE_Y1);

  const cx = createMemo(() => xOfP(props.predP));
  const cy = createMemo(() => yOfL(props.loss));
  const halfPct = createMemo(() => {
    const scaleRef = Math.max(0.1, props.eta);
    return Math.min(50, (Math.abs(props.deltaW) / scaleRef) * 50);
  });
  const leftPct = createMemo(() => (props.deltaW >= 0 ? 50 : 50 - halfPct()));

  const penaltyBadge = createMemo(() =>
    props.loss > 1.2
      ? { label: "损失较大", cls: "is-danger" }
      : props.loss > 0.35
        ? { label: "损失中等", cls: "is-warn" }
        : { label: "损失较小", cls: "is-success" },
  );

  return (
    <div class="logistic-regression-penalty-grid">
      <div class="logistic-regression-chart-box">
        <div class="logistic-regression-chart-head">
          <h4>损失曲线（{props.trueY === 1 ? "垃圾短信" : "正常短信"}）</h4>
          <span class={`logistic-regression-pill ${penaltyBadge().cls}`}>
            {penaltyBadge().label}
          </span>
        </div>
        <svg
          aria-label="预测概率与损失"
          class="logistic-regression-svg-chart"
          viewBox={`0 0 ${W} ${H}`}
        >
          <For each={LOSS_TICKS}>
            {(v) => (
              <g>
                <line
                  stroke="var(--border)"
                  stroke-width="0.8"
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={yOfL(v)}
                  y2={yOfL(v)}
                />
                <text
                  fill="var(--muted)"
                  font-size="9"
                  text-anchor="end"
                  x={PAD_L - 5}
                  y={yOfL(v) + 3}
                >
                  {v}
                </text>
              </g>
            )}
          </For>
          <polyline
            fill="none"
            points={otherCurve()}
            stroke="var(--border-strong)"
            stroke-dasharray="3 3"
            stroke-width="1.2"
          />
          <polyline fill="none" points={activeCurve()} stroke="var(--accent)" stroke-width="2.3" />
          <line
            stroke="var(--accent)"
            stroke-dasharray="3 2"
            stroke-opacity="0.6"
            stroke-width="1"
            x1={cx()}
            x2={cx()}
            y1={cy()}
            y2={H - PAD_B}
          />
          <circle
            cx={cx()}
            cy={cy()}
            fill={props.loss > 1.2 ? "var(--danger)" : "var(--accent)"}
            r="5.5"
            stroke="var(--surface)"
            stroke-width="1.8"
          />
          <text fill="var(--muted)" font-size="9" x={PAD_L} y={H - 7}>
            猜 2% 垃圾
          </text>
          <text fill="var(--muted)" font-size="9" text-anchor="middle" x={xOfP(0.5)} y={H - 7}>
            50%
          </text>
          <text fill="var(--muted)" font-size="9" text-anchor="end" x={W - PAD_R} y={H - 7}>
            猜 98% 垃圾
          </text>
        </svg>
      </div>

      <div class="logistic-regression-chart-box logistic-regression-nudge-card">
        <div class="logistic-regression-chart-head">
          <h4>权重改变量</h4>
          <span
            class={`logistic-regression-mono logistic-regression-nudge-val ${props.deltaW >= 0 ? "is-pos" : "is-neg"}`}
          >
            {props.deltaW >= 0 ? "+" : ""}
            {props.deltaW.toFixed(4)}
          </span>
        </div>
        <p class="logistic-regression-muted-note">
          这条短信中出现的词都按下图的幅度更新。未出现的词保持原来的权重。
        </p>
        <div class="logistic-regression-nudge-labels">
          <span class="is-neg">减少</span>
          <span>0</span>
          <span class="is-pos">增加</span>
        </div>
        <div
          aria-hidden="true"
          class="logistic-regression-strategy-meter logistic-regression-nudge-meter"
        >
          <span class="logistic-regression-strategy-meter-zero" />
          <div
            class={`logistic-regression-strategy-meter-fill ${props.deltaW >= 0 ? "is-spam" : "is-ham"}`}
            style={{ left: `${leftPct().toFixed(1)}%`, width: `${halfPct().toFixed(1)}%` }}
          />
        </div>
        <p class="logistic-regression-role-desc">
          {props.deltaW > 1e-6
            ? "模型低估了这条垃圾短信的概率，因此增加这些词的权重。"
            : props.deltaW < -1e-6
              ? "模型高估了这条正常短信的垃圾概率，因此减少这些词的权重。"
              : "预测与真实标签基本一致，出现过的词几乎不用改权重。"}
        </p>
      </div>
    </div>
  );
}
