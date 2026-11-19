import {
  BLIND_GUESS_LOSS,
  type BgdEpochPoint,
  type EpochSnapshot,
  type IntraEpochPoint,
} from "../domain/logisticRegression.ts";

export function LossChartSvg({
  history,
  bgdHistory,
  intraTrace,
  inspectEpoch,
  showBgd,
  onSelectEpoch,
}: {
  history: readonly EpochSnapshot[];
  bgdHistory?: readonly BgdEpochPoint[];
  intraTrace?: readonly IntraEpochPoint[];
  inspectEpoch?: number;
  showBgd?: boolean;
  onSelectEpoch?: (epoch: number) => void;
}) {
  const W = 440;
  const H = 190;
  const PAD_L = 42;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 26;

  const maxEpoch = Math.max(1, history[history.length - 1]?.epoch ?? 1);
  const allVals = [
    BLIND_GUESS_LOSS,
    ...history.map((h) => h.trainLoss),
    ...history.map((h) => h.valLoss),
    ...(showBgd && bgdHistory ? bgdHistory.map((b) => b.bgdValLoss) : []),
  ];
  const maxLoss = Math.max(0.8, Math.min(1.6, Math.max(...allVals) * 1.08));

  const xOfEp = (ep: number) => PAD_L + (ep / maxEpoch) * (W - PAD_L - PAD_R);
  const yOfLoss = (v: number) => {
    const clamped = Math.max(0, Math.min(maxLoss, v));
    return H - PAD_B - (clamped / maxLoss) * (H - PAD_T - PAD_B);
  };

  const trainPts = history.map(
    (h) => `${xOfEp(h.epoch).toFixed(1)},${yOfLoss(h.trainLoss).toFixed(1)}`,
  );
  const valPts = history.map(
    (h) => `${xOfEp(h.epoch).toFixed(1)},${yOfLoss(h.valLoss).toFixed(1)}`,
  );
  const bgdPts =
    showBgd && bgdHistory
      ? bgdHistory.map((b) => `${xOfEp(b.epoch).toFixed(1)},${yOfLoss(b.bgdValLoss).toFixed(1)}`)
      : [];

  return (
    <div className="logistic-regression-charts-grid">
      <div className="logistic-regression-chart-box">
        <div className="logistic-regression-chart-head">
          <h4>每轮训练后的损失</h4>
          <div className="logistic-regression-legend">
            <span className="logistic-regression-leg-item">
              <i className="logistic-regression-leg-swatch is-train" /> 训练损失
            </span>
            <span className="logistic-regression-leg-item">
              <i className="logistic-regression-leg-swatch is-val" /> 验证损失
            </span>
            {showBgd && bgdPts.length > 0 ? (
              <span className="logistic-regression-leg-item">
                <i className="logistic-regression-leg-swatch is-bgd" /> 全批量 BGD
              </span>
            ) : null}
          </div>
        </div>
        <svg
          aria-label="每轮损失变化曲线"
          className="logistic-regression-svg-chart"
          viewBox={`0 0 ${W} ${H}`}
        >
          {[0, 0.25, 0.5, 0.75].map((v) =>
            v <= maxLoss ? (
              <g key={v}>
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
                  fontSize="9"
                  textAnchor="end"
                  x={PAD_L - 5}
                  y={yOfLoss(v) + 3}
                >
                  {v.toFixed(2)}
                </text>
              </g>
            ) : null,
          )}
          <line
            stroke="var(--warn)"
            strokeDasharray="4 3"
            strokeWidth="1.1"
            x1={PAD_L}
            x2={W - PAD_R}
            y1={yOfLoss(BLIND_GUESS_LOSS)}
            y2={yOfLoss(BLIND_GUESS_LOSS)}
          />
          <text fill="var(--warn)" fontSize="9" x={PAD_L + 4} y={yOfLoss(BLIND_GUESS_LOSS) - 4}>
            p=0.5 时 ln2 ≈ 0.693
          </text>
          {bgdPts.length > 0 ? (
            <polyline
              fill="none"
              points={bgdPts.join(" ")}
              stroke="var(--warn)"
              strokeDasharray="5 3"
              strokeWidth="1.8"
            />
          ) : null}
          <polyline
            fill="none"
            points={trainPts.join(" ")}
            stroke="var(--accent)"
            strokeWidth="2.2"
          />
          <polyline
            fill="none"
            points={valPts.join(" ")}
            stroke="var(--success)"
            strokeWidth="2.2"
          />
          {inspectEpoch !== undefined ? (
            <line
              stroke="var(--ink)"
              strokeDasharray="2 2"
              strokeOpacity="0.45"
              strokeWidth="1.2"
              x1={xOfEp(inspectEpoch)}
              x2={xOfEp(inspectEpoch)}
              y1={PAD_T}
              y2={H - PAD_B}
            />
          ) : null}
          {history.map((h) => (
            <circle
              cx={xOfEp(h.epoch)}
              cy={yOfLoss(h.valLoss)}
              fill={inspectEpoch === h.epoch ? "var(--ink)" : "var(--success)"}
              key={h.epoch}
              onClick={onSelectEpoch ? () => onSelectEpoch(h.epoch) : undefined}
              r={inspectEpoch === h.epoch ? 4.2 : 2.6}
              style={onSelectEpoch ? { cursor: "pointer" } : undefined}
            />
          ))}
          <text fill="var(--muted)" fontSize="9" x={PAD_L} y={H - 8}>
            Epoch 0
          </text>
          <text fill="var(--muted)" fontSize="9" textAnchor="end" x={W - PAD_R} y={H - 8}>
            Epoch {maxEpoch}
          </text>
        </svg>
      </div>

      {intraTrace && intraTrace.length > 1 ? (
        <IntraEpochSvg bgdHistory={bgdHistory} intraTrace={intraTrace} />
      ) : null}
    </div>
  );
}

function IntraEpochSvg({
  intraTrace,
  bgdHistory,
}: {
  intraTrace: readonly IntraEpochPoint[];
  bgdHistory?: readonly BgdEpochPoint[];
}) {
  const W = 440;
  const H = 190;
  const PAD_L = 42;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 26;

  const maxEpF = Math.max(1, intraTrace[intraTrace.length - 1]?.epochFloat ?? 3);
  const traceMax = Math.max(BLIND_GUESS_LOSS, ...intraTrace.map((pt) => pt.sgdValLoss));
  const maxLoss = Math.max(0.8, Math.min(2.2, traceMax * 1.08));

  const xOf = (epF: number) => PAD_L + (epF / maxEpF) * (W - PAD_L - PAD_R);
  const yOf = (v: number) => {
    const clamped = Math.max(0, Math.min(maxLoss, v));
    return H - PAD_B - (clamped / maxLoss) * (H - PAD_T - PAD_B);
  };

  const sgdPts = intraTrace.map(
    (p) => `${xOf(p.epochFloat).toFixed(1)},${yOf(p.sgdValLoss).toFixed(1)}`,
  );
  const bgdSliced = (bgdHistory ?? []).filter((b) => b.epoch <= Math.ceil(maxEpF));
  const bgdPts = bgdSliced.map((b) => `${xOf(b.epoch).toFixed(1)},${yOf(b.bgdValLoss).toFixed(1)}`);

  return (
    <div className="logistic-regression-chart-box">
      <div className="logistic-regression-chart-head">
        <h4>前 3 轮的验证损失（每轮采样 10 次）</h4>
        <div className="logistic-regression-legend">
          <span className="logistic-regression-leg-item">
            <i className="logistic-regression-leg-swatch is-train" /> SGD 验证损失采样
          </span>
          {bgdPts.length > 0 ? (
            <span className="logistic-regression-leg-item">
              <i className="logistic-regression-leg-swatch is-bgd" /> 全批量 BGD
            </span>
          ) : null}
        </div>
      </div>
      <svg
        aria-label="前 3 轮验证损失采样曲线"
        className="logistic-regression-svg-chart"
        viewBox={`0 0 ${W} ${H}`}
      >
        {[1, 2, 3].map((ep) =>
          ep <= maxEpF ? (
            <g key={ep}>
              <line
                stroke="var(--border)"
                strokeDasharray="2 3"
                strokeWidth="0.9"
                x1={xOf(ep)}
                x2={xOf(ep)}
                y1={PAD_T}
                y2={H - PAD_B}
              />
              <text fill="var(--muted)" fontSize="9" textAnchor="middle" x={xOf(ep)} y={H - 8}>
                第{ep}轮结束
              </text>
            </g>
          ) : null,
        )}
        <line
          stroke="var(--border)"
          strokeWidth="0.8"
          x1={PAD_L}
          x2={W - PAD_R}
          y1={yOf(0)}
          y2={yOf(0)}
        />
        {bgdPts.length > 0 ? (
          <polyline
            fill="none"
            points={bgdPts.join(" ")}
            stroke="var(--warn)"
            strokeDasharray="5 3"
            strokeWidth="2"
          />
        ) : null}
        <polyline fill="none" points={sgdPts.join(" ")} stroke="var(--accent)" strokeWidth="1.9" />
        <text
          fill="var(--muted)"
          fontSize="9"
          textAnchor="end"
          x={PAD_L - 5}
          y={yOf(BLIND_GUESS_LOSS)}
        >
          0.69
        </text>
        <text fill="var(--muted)" fontSize="9" textAnchor="end" x={PAD_L - 5} y={yOf(0)}>
          0
        </text>
      </svg>
    </div>
  );
}
