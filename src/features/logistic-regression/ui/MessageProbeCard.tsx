import type { MessageInspection } from "../domain/tokenizer.ts";
import { TOKEN_STATUS_LABELS } from "./tokenStatusLabels.ts";

function stableSigmoid(z: number): number {
  if (z >= 35) return 1;
  if (z <= -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

export function MessageProbeCard({
  inspection,
  threshold = 0.5,
  trueLabel,
  title = "这条短信的评分依据",
}: {
  inspection: MessageInspection;
  threshold?: number;
  trueLabel?: 0 | 1;
  title?: string;
}) {
  const safeThreshold = Math.max(0.05, Math.min(0.95, threshold));
  const zCut = Math.log(safeThreshold / (1 - safeThreshold));

  const W = 280;
  const H = 140;
  const PAD = 24;
  const zMin = -6;
  const zMax = 6;
  const xOfZ = (z: number) =>
    PAD + ((Math.max(zMin, Math.min(zMax, z)) - zMin) / (zMax - zMin)) * (W - PAD * 2);
  const yOfP = (p: number) => H - PAD - p * (H - PAD * 2);

  const curvePts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const z = zMin + ((zMax - zMin) * i) / 48;
    const p = stableSigmoid(z);
    curvePts.push(`${xOfZ(z).toFixed(1)},${yOfP(p).toFixed(1)}`);
  }

  const maxAbsTerm = Math.max(1, ...inspection.terms.map((t) => Math.abs(t.weight)));
  const isSpamPred = inspection.probability >= safeThreshold;

  return (
    <div className="logistic-regression-probe-card">
      <div className="logistic-regression-probe-head">
        <div>
          <p className="eyebrow">{title}</p>
          <p className="logistic-regression-probe-text">{inspection.text}</p>
        </div>
        <div className="logistic-regression-probe-badges">
          {trueLabel !== undefined ? (
            <span
              className={`logistic-regression-pill ${trueLabel === 1 ? "is-danger" : "is-success"}`}
            >
              真实：{trueLabel === 1 ? "垃圾短信" : "正常短信"}
            </span>
          ) : null}
          <span className={`logistic-regression-pill ${isSpamPred ? "is-danger" : "is-success"}`}>
            模型判定：{isSpamPred ? "垃圾" : "正常"}（{(inspection.probability * 100).toFixed(1)}%）
          </span>
        </div>
      </div>

      <div className="logistic-regression-token-strip">
        {inspection.tokens.map((tok, i) => (
          <span
            className={`logistic-regression-tok is-${tok.status}`}
            key={`${tok.text}-${i}`}
            title={tok.note}
          >
            <span className="logistic-regression-tok-text">{tok.text}</span>
            <span className="logistic-regression-tok-tag">{TOKEN_STATUS_LABELS[tok.status]}</span>
          </span>
        ))}
      </div>

      <div className="logistic-regression-probe-grid">
        <div className="logistic-regression-waterfall">
          <p className="logistic-regression-subhead">
            这些词的分数怎样相加（总分 z ={" "}
            <strong className="logistic-regression-mono">{inspection.rawZ.toFixed(2)}</strong>）
          </p>
          <ul className="logistic-regression-waterfall-list">
            {inspection.terms.map((term, idx) => {
              const barPct = Math.min(100, (Math.abs(term.weight) / maxAbsTerm) * 100);
              const tone =
                term.weight > 0.001 ? "is-pos" : term.weight < -0.001 ? "is-neg" : "is-zero";
              return (
                <li className="logistic-regression-waterfall-row" key={`${term.word}-${idx}`}>
                  <span className="logistic-regression-waterfall-word">
                    {term.kind === "bias" ? term.word : `词「${term.word}」`}
                  </span>
                  <span className="logistic-regression-waterfall-bar-wrap">
                    <span
                      className={`logistic-regression-waterfall-bar ${tone}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </span>
                  <span
                    className={`logistic-regression-mono logistic-regression-waterfall-val ${tone}`}
                  >
                    {term.weight >= 0 ? "+" : ""}
                    {term.weight.toFixed(2)}
                  </span>
                  <span className="logistic-regression-mono logistic-regression-waterfall-sum">
                    → {term.cumulativeZ.toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>
          {inspection.terms.length === 1 ? (
            <p className="logistic-regression-muted-note">
              没有词参与加分或减分，模型只根据偏置 b 计算概率。
            </p>
          ) : null}
        </div>

        <div className="logistic-regression-sigmoid-box">
          <p className="logistic-regression-subhead">
            把总分换成概率（分类阈值 τ = {safeThreshold.toFixed(2)}）
          </p>
          <svg
            aria-label="Sigmoid 概率曲线"
            className="logistic-regression-svg-chart"
            viewBox={`0 0 ${W} ${H}`}
          >
            <line
              stroke="var(--border)"
              strokeWidth="1"
              x1={PAD}
              x2={W - PAD}
              y1={yOfP(0)}
              y2={yOfP(0)}
            />
            <line
              stroke="var(--border)"
              strokeDasharray="3 3"
              strokeWidth="1"
              x1={PAD}
              x2={W - PAD}
              y1={yOfP(safeThreshold)}
              y2={yOfP(safeThreshold)}
            />
            <line
              stroke="var(--warn)"
              strokeDasharray="3 3"
              strokeWidth="1.2"
              x1={xOfZ(zCut)}
              x2={xOfZ(zCut)}
              y1={PAD}
              y2={H - PAD}
            />
            <polyline
              fill="none"
              points={curvePts.join(" ")}
              stroke="var(--accent)"
              strokeWidth="2.2"
            />
            <circle
              cx={xOfZ(inspection.rawZ)}
              cy={yOfP(inspection.probability)}
              fill={isSpamPred ? "var(--danger)" : "var(--success)"}
              r="5"
              stroke="var(--surface)"
              strokeWidth="1.5"
            />
            <text fill="var(--muted)" fontSize="9" x={PAD} y={yOfP(safeThreshold) - 4}>
              阈值 {(safeThreshold * 100).toFixed(0)}%
            </text>
            <text fill="var(--muted)" fontSize="9" textAnchor="middle" x={xOfZ(0)} y={H - 6}>
              z = 0
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}
