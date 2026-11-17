import { useState } from "react";
import type {
  ClassificationMetrics,
  MessagePrediction,
  ThresholdCurvePoint,
  TrainedModel,
} from "../domain/logreg.ts";
import { inspectCorpusMessageWithModel } from "../domain/tokenizer.ts";
import { MessageProbeCard } from "./MessageProbeCard.tsx";

const BUCKET_META: {
  id: "tp" | "fn" | "fp" | "tn";
  title: string;
  meaning: string;
  tone: "ok" | "warn" | "bad" | "neutral";
}[] = [
  { id: "tp", title: "TP · 正确拦截", meaning: "垃圾短信 → 判为垃圾", tone: "ok" },
  { id: "fn", title: "FN · 漏掉垃圾短信", meaning: "垃圾短信 → 判为正常", tone: "warn" },
  { id: "fp", title: "FP · 误拦正常短信", meaning: "正常短信 → 判为垃圾", tone: "bad" },
  { id: "tn", title: "TN · 正常放行", meaning: "正常短信 → 判为正常", tone: "neutral" },
];

/**
 * Interactive 2x2 Confusion Matrix + Threshold PR Tradeoff SVG + click-to-dissect
 * misclassified validation messages.
 */
export function ConfusionPanel({
  metrics,
  curve,
  threshold,
  activeBucket,
  predictions,
  model,
  onSelectBucket,
  onSelectThreshold,
}: {
  metrics: ClassificationMetrics;
  curve: readonly ThresholdCurvePoint[];
  threshold: number;
  activeBucket: "tp" | "fp" | "tn" | "fn";
  predictions: readonly MessagePrediction[];
  model: TrainedModel;
  onSelectBucket: (bucket: "tp" | "fp" | "tn" | "fn") => void;
  onSelectThreshold: (threshold: number) => void;
}) {
  const [selectedMsgId, setSelectedMsgId] = useState<number | null>(null);

  const counts = {
    tp: metrics.tp,
    fn: metrics.fn,
    fp: metrics.fp,
    tn: metrics.tn,
  };

  const bucketItems = predictions.filter((p) => p.bucket === activeBucket);
  const activeMsg = bucketItems.find((item) => item.id === selectedMsgId) ?? bucketItems[0] ?? null;

  const inspection = activeMsg
    ? inspectCorpusMessageWithModel(
        activeMsg,
        model.weightsByWord,
        model.bias,
        model.vocabSet,
        threshold,
        model.wordToIndex,
      )
    : null;

  // Threshold curve SVG coordinates
  const W = 400;
  const H = 175;
  const PAD_L = 38;
  const PAD_R = 14;
  const PAD_T = 16;
  const PAD_B = 26;
  const xOfT = (t: number) => PAD_L + ((t - 0.05) / 0.9) * (W - PAD_L - PAD_R);
  const yOfV = (v: number) => H - PAD_B - v * (H - PAD_T - PAD_B);
  const precPts = curve.map(
    (c) => `${xOfT(c.threshold).toFixed(1)},${yOfV(c.precision).toFixed(1)}`,
  );
  const recPts = curve.map((c) => `${xOfT(c.threshold).toFixed(1)},${yOfV(c.recall).toFixed(1)}`);

  return (
    <div className="ml-eval-stack">
      <div className="ml-eval-split">
        <div className="ml-panel">
          <div className="ml-panel-head">
            <h3>2×2 混淆矩阵（点击格子看具体短信）</h3>
            <span className="ml-muted-note">共 {metrics.total} 条验证短信</span>
          </div>
          <div className="ml-cm-grid">
            {BUCKET_META.map((cell) => (
              <button
                className={`ml-cm-cell is-${cell.tone}${activeBucket === cell.id ? " is-active" : ""}`}
                key={cell.id}
                onClick={() => onSelectBucket(cell.id)}
                type="button"
              >
                <span className="ml-cm-name">{cell.title}</span>
                <strong className="ml-mono ml-cm-count">{counts[cell.id]}</strong>
                <span className="ml-cm-sub">{cell.meaning}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ml-panel">
          <div className="ml-chart-head">
            <h3>分类阈值怎样影响查准率和查全率</h3>
            <div className="ml-legend">
              <span className="ml-leg-item">
                <i className="ml-leg-swatch is-train" /> 查准率 P
              </span>
              <span className="ml-leg-item">
                <i className="ml-leg-swatch is-val" /> 查全率 R
              </span>
            </div>
          </div>
          <svg
            aria-label="阈值与 Precision Recall 权衡曲线"
            className="ml-svg-chart"
            viewBox={`0 0 ${W} ${H}`}
          >
            {[0.5, 0.8, 0.9, 1].map((v) => (
              <g key={v}>
                <line
                  stroke="var(--border)"
                  strokeWidth="0.8"
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={yOfV(v)}
                  y2={yOfV(v)}
                />
                <text
                  fill="var(--muted)"
                  fontSize="9"
                  textAnchor="end"
                  x={PAD_L - 4}
                  y={yOfV(v) + 3}
                >
                  {(v * 100).toFixed(0)}%
                </text>
              </g>
            ))}
            <polyline
              fill="none"
              points={precPts.join(" ")}
              stroke="var(--accent)"
              strokeWidth="2.2"
            />
            <polyline
              fill="none"
              points={recPts.join(" ")}
              stroke="var(--success)"
              strokeWidth="2.2"
            />
            <line
              stroke="var(--warn)"
              strokeDasharray="3 3"
              strokeWidth="1.4"
              x1={xOfT(threshold)}
              x2={xOfT(threshold)}
              y1={PAD_T}
              y2={H - PAD_B}
            />
            {curve.map((pt) => (
              <circle
                cx={xOfT(pt.threshold)}
                cy={yOfV(pt.precision)}
                fill="transparent"
                key={pt.threshold}
                onClick={() => onSelectThreshold(pt.threshold)}
                r="7"
                style={{ cursor: "pointer" }}
              />
            ))}
            <text fill="var(--muted)" fontSize="9" x={PAD_L} y={H - 8}>
              τ=0.05（拦截较多）
            </text>
            <text fill="var(--muted)" fontSize="9" textAnchor="end" x={W - PAD_R} y={H - 8}>
              τ=0.95（拦截较少）
            </text>
          </svg>
        </div>
      </div>

      <section className="ml-panel">
        <div className="ml-panel-head">
          <h3>
            {BUCKET_META.find((b) => b.id === activeBucket)?.title}（共 {bucketItems.length} 条）
          </h3>
          <span className="ml-muted-note">你可以点选一条短信，查看哪些词影响了模型的判断。</span>
        </div>
        {bucketItems.length === 0 ? (
          <p className="ml-muted-note">当前阈值下这一格数量为 0。</p>
        ) : (
          <div className="ml-case-grid">
            <ul className="ml-case-list">
              {bucketItems.slice(0, 12).map((item) => (
                <li key={item.id}>
                  <button
                    className={`ml-case-btn${activeMsg?.id === item.id ? " is-active" : ""}`}
                    onClick={() => setSelectedMsgId(item.id)}
                    type="button"
                  >
                    <span className="ml-mono ml-case-prob">
                      {(item.probability * 100).toFixed(1)}%
                    </span>
                    <span className="ml-case-text">{item.text}</span>
                  </button>
                </li>
              ))}
            </ul>
            {activeMsg && inspection ? (
              <MessageProbeCard
                inspection={inspection}
                threshold={threshold}
                title="模型的评分依据"
                trueLabel={activeMsg.label}
              />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
