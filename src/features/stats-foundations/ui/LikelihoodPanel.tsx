import { MathFormula } from "../../../shared/ui/MathFormula";
import { ConceptQuestion } from "./ConceptQuestion.tsx";
import { useMemo, useState } from "react";
import type { LikelihoodDraft } from "../domain/protocol.ts";
import type { StatsConceptQuestion } from "../domain/stages.ts";
import {
  COIN_HEADS,
  COIN_MLE_OPTIMAL,
  isNearCoinMLE,
  COIN_P_MAX,
  COIN_P_MIN,
  COIN_TAILS,
  COIN_TOSSES,
  coinLikelihood,
  coinNegLogLikelihood,
  roundTo,
  sampleLikelihoodCurve,
} from "../domain/statsMath.ts";

type Props = {
  draft: LikelihoodDraft;
  question?: StatsConceptQuestion;
  passed: boolean;
  onChange: (next: LikelihoodDraft) => void;
};

const SVG_W = 540;
const SVG_H = 270;
const PAD = { left: 56, right: 24, top: 20, bottom: 42 };

export function LikelihoodPanel({ draft, question, passed, onChange }: Props) {
  const [simResult, setSimResult] = useState<string | null>(null);
  const curve = useMemo(() => sampleLikelihoodCurve(90), []);
  const currentL = coinLikelihood(draft.p);
  const currentNll = coinNegLogLikelihood(draft.p);
  const maxL = coinLikelihood(COIN_MLE_OPTIMAL);
  const isNearPeak = isNearCoinMLE(draft.p);

  const isNll = draft.viewMode === "nll";
  const maxY = isNll ? Math.max(...curve.map((point) => point.nll)) : maxL * 1.18;
  const minY = isNll ? 5.5 : 0;

  const mapX = (p: number) => PAD.left + p * (SVG_W - PAD.left - PAD.right);
  const mapY = (val: number) => {
    const clamped = Math.min(maxY, Math.max(minY, val));
    return SVG_H - PAD.bottom - ((clamped - minY) / (maxY - minY)) * (SVG_H - PAD.top - PAD.bottom);
  };

  const pathD = curve
    .map((pt, i) => {
      const x = mapX(pt.p);
      const y = mapY(isNll ? pt.nll : pt.likelihood);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const curX = mapX(draft.p);
  const curY = mapY(isNll ? currentNll : currentL);

  const runSimulation = () => {
    let heads = 0;
    for (let i = 0; i < 10; i++) {
      if (Math.random() < draft.p) heads += 1;
    }
    setSimResult(
      `按你猜的 p = ${roundTo(draft.p, 2)} 模拟抛 10 次：出现 ${heads} 正 ${10 - heads} 反`,
    );
  };

  return (
    <div className="sf-panel">
      <div className="sf-coins-banner">
        <div className="sf-coins-label">
          <strong>实测 10 次抛掷记录：</strong>
          <span>
            {COIN_HEADS} 次正面 · {COIN_TAILS} 次反面
          </span>
        </div>
        <div className="sf-coins-row" aria-label="10次抛硬币记录">
          {COIN_TOSSES.map((side, idx) => (
            <span className={`sf-coin is-${side === "H" ? "heads" : "tails"}`} key={idx}>
              {side === "H" ? "正" : "反"}
            </span>
          ))}
        </div>
      </div>

      <div className="sf-metrics-row">
        <div className={`sf-metric-card ${isNearPeak ? "is-good" : ""}`}>
          <span className="sf-metric-label">你猜的正面概率 p</span>
          <strong className="sf-metric-value sf-mono">{roundTo(draft.p, 2)}</strong>
          <span className="sf-metric-sub">
            {isNearPeak ? "已到达似然峰顶附近！" : "拖动滑块寻找峰顶 / 谷底"}
          </span>
        </div>
        <div className="sf-metric-card">
          <span className="sf-metric-label">
            似然 <MathFormula>{String.raw`L(p)=p^7(1-p)^3`}</MathFormula>
          </span>
          <strong className="sf-metric-value sf-mono">{(currentL * 1000).toFixed(3)} × 10⁻³</strong>
          <span className="sf-metric-sub">越大表示该参数下这串记录越可能出现</span>
        </div>
        <div className="sf-metric-card">
          <span className="sf-metric-label">负对数似然 −ln L(p)</span>
          <strong className="sf-metric-value sf-mono">{roundTo(currentNll, 3)}</strong>
          <span className="sf-metric-sub">越小越好（逻辑回归的损失函数）</span>
        </div>
      </div>

      <div className="sf-workspace-grid">
        <div className="sf-chart-card">
          <div className="sf-chart-header">
            <h3>{isNll ? "负对数似然曲线 −ln L(p)（找最低谷）" : "似然曲线 L(p)（找最高峰）"}</h3>
            <div className="sf-filter-pills" role="group" aria-label="曲线视图">
              <button
                aria-pressed={!isNll}
                className={!isNll ? "is-active" : ""}
                onClick={() => onChange({ ...draft, viewMode: "likelihood" })}
                type="button"
              >
                似然 L(p)
              </button>
              <button
                aria-pressed={isNll}
                className={isNll ? "is-active" : ""}
                onClick={() => onChange({ ...draft, viewMode: "nll" })}
                type="button"
              >
                负对数似然 −ln L(p)
              </button>
            </div>
          </div>

          <svg
            role="img"
            aria-label={isNll ? "负对数似然曲线" : "似然函数曲线"}
            className="sf-svg"
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          >
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((pTick) => (
              <g key={`px-${pTick}`}>
                <line
                  className="sf-grid-line"
                  x1={mapX(pTick)}
                  x2={mapX(pTick)}
                  y1={PAD.top}
                  y2={SVG_H - PAD.bottom}
                />
                <text className="sf-axis-tick" textAnchor="middle" x={mapX(pTick)} y={SVG_H - 22}>
                  {pTick.toFixed(1)}
                </text>
              </g>
            ))}

            <line
              className="sf-axis-line"
              x1={PAD.left}
              x2={SVG_W - PAD.right}
              y1={SVG_H - PAD.bottom}
              y2={SVG_H - PAD.bottom}
            />
            <line
              className="sf-axis-line"
              x1={PAD.left}
              x2={PAD.left}
              y1={PAD.top}
              y2={SVG_H - PAD.bottom}
            />
            <text className="sf-axis-label" textAnchor="middle" x={SVG_W / 2} y={SVG_H - 4}>
              猜测的正面概率 p
            </text>

            {[minY, (minY + maxY) / 2, maxY].map((tick) => (
              <text
                className="sf-axis-tick"
                textAnchor="end"
                x={PAD.left - 5}
                y={mapY(tick) + 3}
                key={tick}
              >
                {isNll ? tick.toFixed(1) : tick.toFixed(4)}
              </text>
            ))}
            {/* Curve */}
            <path className="sf-curve-path" d={pathD} fill="none" />

            {/* Current p marker */}
            <line
              className="sf-guide-line"
              x1={curX}
              x2={curX}
              y1={PAD.top}
              y2={SVG_H - PAD.bottom}
            />
            <circle className="sf-marker-dot" cx={curX} cy={curY} r={6} />
          </svg>
        </div>

        <div className="sf-controls-card">
          <h3>猜测硬币的偏向程度</h3>
          <div className="sf-slider-group">
            <div className="sf-slider-head">
              <label htmlFor="sf-coin-p">正面朝上的概率 p</label>
              <span className="sf-mono">{roundTo(draft.p, 2)}</span>
            </div>
            <input
              id="sf-coin-p"
              max={COIN_P_MAX}
              min={COIN_P_MIN}
              onChange={(e) => onChange({ ...draft, p: Number(e.target.value) })}
              step={0.01}
              type="range"
              value={draft.p}
            />
          </div>

          <div className="sf-note-box">
            <strong>为什么是连乘？</strong>
            <br />
            每次抛硬币相互独立，所以按上面的顺序抛出这 10 个结果的联合概率是：
            <div className="sf-formula-line sf-mono">
              L({roundTo(draft.p, 2)}) = {roundTo(draft.p, 2)}⁷ × {roundTo(1 - draft.p, 2)}³
            </div>
          </div>

          <div className="sf-sim-box">
            <button className="sf-secondary-btn" onClick={runSimulation} type="button">
              用当前 p 模拟再抛 10 次
            </button>
            {simResult && <p className="sf-sim-result">{simResult}</p>}
          </div>
        </div>
      </div>

      {question && (
        <ConceptQuestion
          question={question}
          answer={draft.answer}
          passed={passed}
          onAnswer={(answer) => onChange({ ...draft, answer })}
        />
      )}
    </div>
  );
}
