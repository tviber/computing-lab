import type { MessageInspection, RawTokenStatus } from "../domain/tokenizer.ts";

const STATUS_LABEL: Record<RawTokenStatus, string> = {
  kept: "入表 x=1",
  duplicate: "重复(已计1)",
  oov: "新词 OOV",
  filtered: "标点过滤",
};

function stableSigmoid(z: number): number {
  if (z >= 35) return 1;
  if (z <= -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Inspects any SMS message end-to-end: token status chips, cumulative
 * linear evidence waterfall, and Sigmoid curve with movable decision boundary.
 */
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
    <div className="ml-probe-card">
      <div className="ml-probe-head">
        <div>
          <p className="eyebrow">{title}</p>
          <p className="ml-probe-text">{inspection.text}</p>
        </div>
        <div className="ml-probe-badges">
          {trueLabel !== undefined ? (
            <span className={`ml-pill ${trueLabel === 1 ? "is-danger" : "is-success"}`}>
              真实：{trueLabel === 1 ? "垃圾短信" : "正常短信"}
            </span>
          ) : null}
          <span className={`ml-pill ${isSpamPred ? "is-danger" : "is-success"}`}>
            模型判定：{isSpamPred ? "垃圾" : "正常"}（{(inspection.probability * 100).toFixed(1)}%）
          </span>
        </div>
      </div>

      <div className="ml-token-strip">
        {inspection.tokens.map((tok, i) => (
          <span className={`ml-tok is-${tok.status}`} key={`${tok.text}-${i}`} title={tok.note}>
            <span className="ml-tok-text">{tok.text}</span>
            <span className="ml-tok-tag">{STATUS_LABEL[tok.status]}</span>
          </span>
        ))}
      </div>

      <div className="ml-probe-grid">
        <div className="ml-waterfall">
          <p className="ml-subhead">
            线性打分过程（总分 z = <strong className="ml-mono">{inspection.rawZ.toFixed(2)}</strong>
            ）
          </p>
          <ul className="ml-waterfall-list">
            {inspection.terms.map((term, idx) => {
              const barPct = Math.min(100, (Math.abs(term.weight) / maxAbsTerm) * 100);
              const tone =
                term.weight > 0.001 ? "is-pos" : term.weight < -0.001 ? "is-neg" : "is-zero";
              return (
                <li className="ml-waterfall-row" key={`${term.word}-${idx}`}>
                  <span className="ml-waterfall-word">
                    {term.kind === "bias" ? term.word : `词「${term.word}」`}
                  </span>
                  <span className="ml-waterfall-bar-wrap">
                    <span className={`ml-waterfall-bar ${tone}`} style={{ width: `${barPct}%` }} />
                  </span>
                  <span className={`ml-mono ml-waterfall-val ${tone}`}>
                    {term.weight >= 0 ? "+" : ""}
                    {term.weight.toFixed(2)}
                  </span>
                  <span className="ml-mono ml-waterfall-sum">→ {term.cumulativeZ.toFixed(2)}</span>
                </li>
              );
            })}
          </ul>
          {inspection.terms.length === 1 ? (
            <p className="ml-muted-note">这条短信没有命中词表中的词，模型只根据偏置 b 计算概率。</p>
          ) : null}
        </div>

        <div className="ml-sigmoid-box">
          <p className="ml-subhead">Sigmoid 概率映射（阈值 τ = {safeThreshold.toFixed(2)}）</p>
          <svg aria-label="Sigmoid 概率曲线" className="ml-svg-chart" viewBox={`0 0 ${W} ${H}`}>
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
