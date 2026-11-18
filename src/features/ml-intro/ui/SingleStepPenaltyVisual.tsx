import { binaryLogLoss } from "../domain/logreg.ts";

/**
 * Visualizes what cross-entropy Loss and the (p - y) update signal actually do
 * on a single SMS: a steep "mistake penalty curve" plus a directional push meter
 * showing how hard the active words' weights get nudged.
 */
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
      ? { label: "自信猜错，扣分陡增", cls: "is-danger" }
      : loss > 0.35
        ? { label: "把握不大，轻微扣分", cls: "is-warn" }
        : { label: "猜对方向，扣分很少", cls: "is-success" };

  return (
    <div className="ml-penalty-grid">
      <div className="ml-chart-box">
        <div className="ml-chart-head">
          <h4>猜错扣分曲线（当前：{trueY === 1 ? "真垃圾 y=1" : "真正常 y=0"}）</h4>
          <span className={`ml-pill ${penaltyBadge.cls}`}>{penaltyBadge.label}</span>
        </div>
        <svg aria-label="预测概率与猜错扣分曲线" className="ml-svg-chart" viewBox={`0 0 ${W} ${H}`}>
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

      <div className="ml-chart-box ml-nudge-card">
        <div className="ml-chart-head">
          <h4>这次会怎么推权重？</h4>
          <span className={`ml-mono ml-nudge-val ${deltaW >= 0 ? "is-pos" : "is-neg"}`}>
            {deltaW >= 0 ? "+" : ""}
            {deltaW.toFixed(4)}
          </span>
        </div>
        <p className="ml-muted-note">
          越自信地猜错，推力越猛；猜得越准，推力几乎归零。下面的长度代表本条短信里出现的词被推动的幅度：
        </p>
        <div className="ml-nudge-labels">
          <span className="is-neg">← 往「正常 (−)」拉</span>
          <span>0（不动）</span>
          <span className="is-pos">往「垃圾 (+)」推 →</span>
        </div>
        <div aria-hidden="true" className="ml-strategy-meter ml-nudge-meter">
          <span className="ml-strategy-meter-zero" />
          <div
            className={`ml-strategy-meter-fill ${deltaW >= 0 ? "is-spam" : "is-ham"}`}
            style={{ left: `${leftPct.toFixed(1)}%`, width: `${halfPct.toFixed(1)}%` }}
          />
        </div>
        <p className="ml-role-desc">
          {deltaW > 1e-6
            ? `这条真是垃圾，模型却低估了它——把出现过的词往「偏垃圾 (+)」推 +${deltaW.toFixed(4)}，下次再见就更敢拦。`
            : deltaW < -1e-6
              ? `这条本来正常，模型却误抬了分数——把出现过的词往「偏正常 (−)」拉 ${deltaW.toFixed(4)}，下次就不容易误拦。`
              : "预测与真实标签基本一致，出现过的词几乎不用改权重。"}
        </p>
      </div>
    </div>
  );
}
