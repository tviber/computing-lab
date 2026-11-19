import { binaryLogLoss } from "../domain/logisticRegression.ts";

export function SingleStepPenaltyVisual({
  trueY,
  predP,
  eta,
  loss,
  deltaW,
}: {
  trueY: 0 | 1;
  predP: number;
  eta: number;
  loss: number;
  deltaW: number;
}) {
  const W = 320;
  const H = 136;
  const PAD_L = 36;
  const PAD_R = 14;
  const PAD_T = 14;
  const PAD_B = 22;
  const maxLoss = 4.0;

  const xOfP = (p: number) => PAD_L + ((p - 0.02) / 0.96) * (W - PAD_L - PAD_R);
  const yOfL = (v: number) => {
    const c = Math.max(0, Math.min(maxLoss, v));
    return H - PAD_B - (c / maxLoss) * (H - PAD_T - PAD_B);
  };

  const activeCurve: string[] = [];
  const otherCurve: string[] = [];
  const otherY: 0 | 1 = trueY === 1 ? 0 : 1;
  for (let i = 0; i <= 48; i++) {
    const p = 0.02 + (0.96 * i) / 48;
    activeCurve.push(`${xOfP(p).toFixed(1)},${yOfL(binaryLogLoss(trueY, p)).toFixed(1)}`);
    otherCurve.push(`${xOfP(p).toFixed(1)},${yOfL(binaryLogLoss(otherY, p)).toFixed(1)}`);
  }

  const cx = xOfP(predP);
  const cy = yOfL(loss);
  const scaleRef = Math.max(0.1, eta);
  const halfPct = Math.min(50, (Math.abs(deltaW) / scaleRef) * 50);
  const isRight = deltaW >= 0;
  const leftPct = isRight ? 50 : 50 - halfPct;

  const penaltyBadge =
    loss > 1.2
      ? { label: "损失较大", cls: "is-danger" }
      : loss > 0.35
        ? { label: "损失中等", cls: "is-warn" }
        : { label: "损失较小", cls: "is-success" };

  return (
    <div className="logistic-regression-penalty-grid">
      <div className="logistic-regression-chart-box">
        <div className="logistic-regression-chart-head">
          <h4>损失曲线（{trueY === 1 ? "垃圾短信" : "正常短信"}）</h4>
          <span className={`logistic-regression-pill ${penaltyBadge.cls}`}>
            {penaltyBadge.label}
          </span>
        </div>
        <svg
          aria-label="预测概率与损失"
          className="logistic-regression-svg-chart"
          viewBox={`0 0 ${W} ${H}`}
        >
          {[0, 1, 2, 3, 4].map((v) => (
            <g key={v}>
              <line
                stroke="var(--border)"
                strokeWidth="0.8"
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yOfL(v)}
                y2={yOfL(v)}
              />
              <text fill="var(--muted)" fontSize="9" textAnchor="end" x={PAD_L - 5} y={yOfL(v) + 3}>
                {v}
              </text>
            </g>
          ))}
          <polyline
            fill="none"
            points={otherCurve.join(" ")}
            stroke="var(--border-strong)"
            strokeDasharray="3 3"
            strokeWidth="1.2"
          />
          <polyline
            fill="none"
            points={activeCurve.join(" ")}
            stroke="var(--accent)"
            strokeWidth="2.3"
          />
          <line
            stroke="var(--accent)"
            strokeDasharray="3 2"
            strokeOpacity="0.6"
            strokeWidth="1"
            x1={cx}
            x2={cx}
            y1={cy}
            y2={H - PAD_B}
          />
          <circle
            cx={cx}
            cy={cy}
            fill={loss > 1.2 ? "var(--danger)" : "var(--accent)"}
            r="5.5"
            stroke="var(--surface)"
            strokeWidth="1.8"
          />
          <text fill="var(--muted)" fontSize="9" x={PAD_L} y={H - 7}>
            猜 2% 垃圾
          </text>
          <text fill="var(--muted)" fontSize="9" textAnchor="middle" x={xOfP(0.5)} y={H - 7}>
            50%
          </text>
          <text fill="var(--muted)" fontSize="9" textAnchor="end" x={W - PAD_R} y={H - 7}>
            猜 98% 垃圾
          </text>
        </svg>
      </div>

      <div className="logistic-regression-chart-box logistic-regression-nudge-card">
        <div className="logistic-regression-chart-head">
          <h4>权重改变量</h4>
          <span
            className={`logistic-regression-mono logistic-regression-nudge-val ${deltaW >= 0 ? "is-pos" : "is-neg"}`}
          >
            {deltaW >= 0 ? "+" : ""}
            {deltaW.toFixed(4)}
          </span>
        </div>
        <p className="logistic-regression-muted-note">
          这条短信中出现的词都按下图的幅度更新。未出现的词保持原来的权重。
        </p>
        <div className="logistic-regression-nudge-labels">
          <span className="is-neg">减少</span>
          <span>0</span>
          <span className="is-pos">增加</span>
        </div>
        <div
          aria-hidden="true"
          className="logistic-regression-strategy-meter logistic-regression-nudge-meter"
        >
          <span className="logistic-regression-strategy-meter-zero" />
          <div
            className={`logistic-regression-strategy-meter-fill ${deltaW >= 0 ? "is-spam" : "is-ham"}`}
            style={{ left: `${leftPct.toFixed(1)}%`, width: `${halfPct.toFixed(1)}%` }}
          />
        </div>
        <p className="logistic-regression-role-desc">
          {deltaW > 1e-6
            ? "模型低估了这条垃圾短信的概率，因此增加这些词的权重。"
            : deltaW < -1e-6
              ? "模型高估了这条正常短信的垃圾概率，因此减少这些词的权重。"
              : "预测与真实标签基本一致，出现过的词几乎不用改权重。"}
        </p>
      </div>
    </div>
  );
}
