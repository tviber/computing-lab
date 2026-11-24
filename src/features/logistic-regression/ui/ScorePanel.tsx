import { useMemo } from "react";
import { MathFormula } from "../../../shared/ui/MathFormula";
import { getPublicCorpus } from "../domain/corpus.ts";
import {
  evaluateManualWeights,
  MAX_MANUAL_BIAS,
  MAX_MANUAL_WEIGHT,
  MIN_MANUAL_BIAS,
  MIN_MANUAL_WEIGHT,
  sigmoid,
  type ManualEvalItem,
} from "../domain/logisticRegression.ts";
import type { LogisticRegressionTestSummary, ScoreDraft } from "../domain/protocol.ts";
import {
  SCORE_CALIBRATION_SMS,
  SCORE_WORDS,
  type LogisticRegressionStageDef,
} from "../domain/stages.ts";
import { defaultScoreDraft } from "../lesson/state.ts";
import { inspectCorpusMessageWithModel } from "../domain/tokenizer.ts";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";
import { MessageProbeCard } from "./MessageProbeCard.tsx";

type SigmoidPlotItem = {
  item: ManualEvalItem;
  tag: string;
};

function SigmoidCurveSvg({
  bias,
  emptyProb,
  items,
  selectedId,
  selectedZ,
  selectedProb,
  selectedTag,
  onSelectMsg,
}: {
  bias: number;
  emptyProb: number;
  items: readonly SigmoidPlotItem[];
  selectedId: string;
  selectedZ: number;
  selectedProb: number;
  selectedTag: string;
  onSelectMsg: (id: string) => void;
}) {
  const W = 440;
  const H = 175;
  const PAD_L = 40;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 24;
  const zMin = -6;
  const zMax = 6;

  const xOfZ = (z: number) => {
    const c = Math.max(zMin, Math.min(zMax, z));
    return PAD_L + ((c - zMin) / (zMax - zMin)) * (W - PAD_L - PAD_R);
  };
  const yOfP = (p: number) => H - PAD_B - p * (H - PAD_T - PAD_B);

  const curvePts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const z = zMin + ((zMax - zMin) * i) / 48;
    curvePts.push(`${xOfZ(z).toFixed(1)},${yOfP(sigmoid(z)).toFixed(1)}`);
  }

  const bx = xOfZ(bias);
  const by = yOfP(emptyProb);
  const mx = xOfZ(selectedZ);
  const my = yOfP(selectedProb);

  const placed = items.map((entry, idx) => {
    const cx = xOfZ(entry.item.rawZ);
    const cy = yOfP(entry.item.probability);
    let slot = 0;
    let groupCount = 0;
    for (let j = 0; j < items.length; j++) {
      const ox = xOfZ(items[j].item.rawZ);
      const oy = yOfP(items[j].item.probability);
      if (Math.hypot(cx - ox, cy - oy) < 9) {
        if (j < idx) slot++;
        groupCount++;
      }
    }
    const offsetY = groupCount > 1 ? (slot - (groupCount - 1) / 2) * 8 : 0;
    return { ...entry, cx, cy: Math.max(PAD_T + 4, Math.min(H - PAD_B - 4, cy + offsetY)) };
  });

  const sortedPlaced = [...placed].sort((a, b) => {
    if (a.item.id === selectedId) return 1;
    if (b.item.id === selectedId) return -1;
    return 0;
  });

  return (
    <div className="logistic-regression-sigmoid-box">
      <div className="logistic-regression-chart-head">
        <h4>6 条短信的分数与概率</h4>
        <div className="logistic-regression-legend">
          <span className="logistic-regression-leg-item">
            <i className="logistic-regression-leg-swatch is-val" /> 概率曲线
          </span>
          <span className="logistic-regression-leg-item">
            <i className="logistic-regression-leg-dot is-spam-dot" /> 真实垃圾
          </span>
          <span className="logistic-regression-leg-item">
            <i className="logistic-regression-leg-dot is-ham-dot" /> 真实正常
          </span>
          <span className="logistic-regression-leg-item">
            <i className="logistic-regression-leg-dot is-bias" /> 只看偏置 b
          </span>
        </div>
      </div>
      <p className="logistic-regression-muted-note">
        垃圾短信的预测概率应达到 50%，正常短信应低于 50%。调整偏置会平移所有短信的分数。
        点击圆点可查看该条短信。
      </p>
      <svg
        aria-label="Sigmoid 曲线与当前模型定位"
        className="logistic-regression-svg-chart"
        viewBox={`0 0 ${W} ${H}`}
      >
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line
              stroke={p === 0.5 ? "var(--danger)" : "var(--border)"}
              strokeDasharray={p === 0.5 ? "4 3" : undefined}
              strokeWidth={p === 0.5 ? "1.1" : "0.8"}
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yOfP(p)}
              y2={yOfP(p)}
            />
            <text fill="var(--muted)" fontSize="9.5" textAnchor="end" x={PAD_L - 5} y={yOfP(p) + 3}>
              {Math.round(p * 100)}%
            </text>
          </g>
        ))}

        <line
          stroke="var(--border)"
          strokeDasharray="3 3"
          strokeWidth="1"
          x1={xOfZ(0)}
          x2={xOfZ(0)}
          y1={PAD_T}
          y2={H - PAD_B}
        />

        {[-6, -3, 0, 3, 6].map((z) => (
          <text
            fill="var(--muted)"
            fontSize="9.5"
            key={z}
            textAnchor="middle"
            x={xOfZ(z)}
            y={H - 7}
          >
            {z > 0 ? `+${z}` : z}
          </text>
        ))}

        <polyline
          fill="none"
          points={curvePts.join(" ")}
          stroke="var(--accent)"
          strokeWidth="2.4"
        />

        <line
          stroke="var(--accent)"
          strokeDasharray="2.5 2.5"
          strokeWidth="1"
          x1={mx}
          x2={mx}
          y1={my}
          y2={H - PAD_B}
        />

        <polygon
          fill="var(--surface)"
          points={`${bx},${by - 5.5} ${bx + 5.5},${by} ${bx},${by + 5.5} ${bx - 5.5},${by}`}
          stroke="var(--primary)"
          strokeWidth="1.8"
        >
          <title>{`所有词都不在词表中时：z = b = ${bias.toFixed(1)}, σ(b) = ${(emptyProb * 100).toFixed(1)}%`}</title>
        </polygon>

        {sortedPlaced.map(({ item, tag, cx, cy }) => {
          const isSelected = item.id === selectedId;
          const fill = item.label === 1 ? "var(--danger)" : "var(--success)";
          return (
            <g key={item.id} onClick={() => onSelectMsg(item.id)} style={{ cursor: "pointer" }}>
              {isSelected ? (
                <circle
                  cx={cx}
                  cy={cy}
                  fill="none"
                  r="8.5"
                  stroke="var(--accent)"
                  strokeWidth="2"
                />
              ) : !item.correct ? (
                <circle
                  cx={cx}
                  cy={cy}
                  fill="none"
                  r="7"
                  stroke="var(--warning)"
                  strokeDasharray="2 2"
                  strokeWidth="1.4"
                />
              ) : null}
              <circle
                cx={cx}
                cy={cy}
                fill={fill}
                r={isSelected ? "5.2" : "4.5"}
                stroke="var(--surface)"
                strokeWidth="1.5"
              >
                <title>{`${tag}（真实：${item.label === 1 ? "垃圾" : "正常"}）：z = ${item.rawZ.toFixed(2)}, p = ${(item.probability * 100).toFixed(1)}% · ${item.correct ? "判对了" : "分错了"}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <p className="logistic-regression-muted-note">
        只看偏置时，<MathFormula>{`z=b=${bias >= 0 ? "+" : ""}${bias.toFixed(1)}`}</MathFormula>{" "}
        对应 <strong>{(emptyProb * 100).toFixed(1)}%</strong>；选中「{selectedTag}」
        <MathFormula>{`z=${selectedZ >= 0 ? "+" : ""}${selectedZ.toFixed(2)}`}</MathFormula> →{" "}
        <strong>{(selectedProb * 100).toFixed(1)}%</strong>
      </p>
    </div>
  );
}

export function ScorePanel({
  stage,
  draft,
  passed,
  result,
  submitting,
  hasNextStage,
  onChange,
  onSubmit,
  onNextStage,
}: {
  stage: LogisticRegressionStageDef;
  draft: ScoreDraft;
  passed: boolean;
  result: LogisticRegressionTestSummary | null;
  submitting: boolean;
  hasNextStage: boolean;
  onChange: (draft: ScoreDraft) => void;
  onSubmit: () => void;
  onNextStage: () => void;
}) {
  const { fullTrainVocab } = useMemo(() => getPublicCorpus(), []);

  const evalSummary = useMemo(
    () => evaluateManualWeights(draft.weights, draft.bias, SCORE_CALIBRATION_SMS, 0.5),
    [draft.weights, draft.bias],
  );

  const selectedSms =
    SCORE_CALIBRATION_SMS.find((m) => m.id === draft.selectedMsgId) ?? SCORE_CALIBRATION_SMS[0];

  const weightMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, v] of Object.entries(draft.weights)) m.set(k, v);
    return m;
  }, [draft.weights]);

  const inspection = useMemo(
    () => inspectCorpusMessageWithModel(selectedSms, weightMap, draft.bias, fullTrainVocab, 0.5),
    [selectedSms, weightMap, draft.bias, fullTrainVocab],
  );

  const allConceptsDone = stage.prompts.every((p) => draft.concepts[p.id] === p.correct);

  const resetToBlacklistStarter = () => {
    const starter = defaultScoreDraft();
    onChange({
      ...draft,
      weights: starter.weights,
      bias: starter.bias,
    });
  };

  return (
    <div className="logistic-regression-stage-stack">
      <div className="logistic-regression-score-layout">
        <section className="logistic-regression-panel">
          <div className="logistic-regression-panel-head">
            <h3>权重与偏置</h3>
            <button className="button button-ghost" onClick={resetToBlacklistStarter} type="button">
              恢复起点预设
            </button>
          </div>
          <p className="logistic-regression-muted-note">
            起始模型只给广告常用词设置了正权重，偏置是 <MathFormula>b=+0.4</MathFormula>。
            因此，即使短信里没有已知词，模型估计的垃圾概率也超过 50%。你可以先调低
            <strong>偏置 b</strong>，再给「同学」「明天」「一起」设置负权重，检查正常短信能否分对。
          </p>

          <div className="logistic-regression-slider-row is-bias">
            <label htmlFor="logistic-regression-bias-slider">
              <strong>偏置 b</strong>
              <small>
                没有已知词时的垃圾概率：{(evalSummary.emptyProbability * 100).toFixed(1)}%
              </small>
            </label>
            <input
              id="logistic-regression-bias-slider"
              max={MAX_MANUAL_BIAS}
              min={MIN_MANUAL_BIAS}
              onChange={(e) => onChange({ ...draft, bias: Number(e.target.value) })}
              step={0.2}
              type="range"
              value={draft.bias}
            />
            <span
              className={`logistic-regression-mono logistic-regression-slider-val ${draft.bias < 0 ? "is-neg" : "is-pos"}`}
            >
              {draft.bias >= 0 ? "+" : ""}
              {draft.bias.toFixed(1)}
            </span>
          </div>

          <div className="logistic-regression-sliders-grid">
            {SCORE_WORDS.map((word) => {
              const val = draft.weights[word] ?? 0;
              return (
                <div className="logistic-regression-slider-row" key={word}>
                  <label htmlFor={`logistic-regression-w-${word}`}>{word}</label>
                  <input
                    id={`logistic-regression-w-${word}`}
                    max={MAX_MANUAL_WEIGHT}
                    min={MIN_MANUAL_WEIGHT}
                    onChange={(e) =>
                      onChange({
                        ...draft,
                        weights: { ...draft.weights, [word]: Number(e.target.value) },
                      })
                    }
                    step={0.2}
                    type="range"
                    value={val}
                  />
                  <span
                    className={`logistic-regression-mono logistic-regression-slider-val ${val > 0 ? "is-pos" : val < 0 ? "is-neg" : ""}`}
                  >
                    {val >= 0 ? "+" : ""}
                    {val.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="logistic-regression-panel">
          <div className="logistic-regression-panel-head">
            <h3>6 条短信的预测结果</h3>
            <span
              className={`logistic-regression-pill ${evalSummary.correctCount === SCORE_CALIBRATION_SMS.length ? "is-success" : "is-warn"}`}
            >
              分对 {evalSummary.correctCount} / {SCORE_CALIBRATION_SMS.length}
            </span>
          </div>

          <SigmoidCurveSvg
            bias={draft.bias}
            emptyProb={evalSummary.emptyProbability}
            items={evalSummary.items.map((item, idx) => ({
              item,
              tag: SCORE_CALIBRATION_SMS[idx]?.tag ?? item.id,
            }))}
            onSelectMsg={(selectedMsgId) => onChange({ ...draft, selectedMsgId })}
            selectedId={selectedSms.id}
            selectedProb={inspection.probability}
            selectedTag={selectedSms.tag}
            selectedZ={inspection.rawZ}
          />

          <ul className="logistic-regression-triage-list">
            {SCORE_CALIBRATION_SMS.map((msg, i) => {
              const ev = evalSummary.items[i];
              const isSelected = msg.id === selectedSms.id;
              return (
                <li key={msg.id}>
                  <button
                    className={`logistic-regression-triage-card${isSelected ? " is-selected" : ""} ${ev.correct ? "is-ok" : "is-wrong"}`}
                    onClick={() => onChange({ ...draft, selectedMsgId: msg.id })}
                    type="button"
                  >
                    <div className="logistic-regression-triage-top">
                      <span
                        className={`logistic-regression-pill ${msg.label === 1 ? "is-danger" : "is-success"}`}
                      >
                        真实：{msg.label === 1 ? "垃圾" : "正常"}（{msg.tag}）
                      </span>
                      <span
                        className={`logistic-regression-mono logistic-regression-triage-prob ${ev.correct ? "is-ok" : "is-bad"}`}
                      >
                        <MathFormula>{String.raw`p = ${(ev.probability * 100).toFixed(1)}\%`}</MathFormula>{" "}
                        ·{" "}
                        {ev.correct
                          ? "判对了"
                          : ev.pred === 1
                            ? "误拦了正常短信"
                            : "漏掉了垃圾短信"}
                      </span>
                    </div>
                    <p className="logistic-regression-triage-text">{msg.text}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <MessageProbeCard
        inspection={inspection}
        threshold={0.5}
        title={`当前选中的短信拆解：${selectedSms.tag}`}
        trueLabel={selectedSms.label}
      />

      <ConceptChecklist
        answers={draft.concepts}
        onSelectCorrect={(promptId, optionIndex) =>
          onChange({
            ...draft,
            concepts: { ...draft.concepts, [promptId]: optionIndex },
          })
        }
        prompts={stage.prompts}
      />

      <div className="logistic-regression-submit-bar">
        <button
          className="button button-primary"
          disabled={submitting || !allConceptsDone}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? "判题中…" : `提交第 ${stage.index} 关判定`}
        </button>
        {!allConceptsDone ? (
          <span className="logistic-regression-muted-note">请先完成上方的概念题，再提交检查。</span>
        ) : null}
      </div>

      <JudgeVerdictCard
        hasNextStage={hasNextStage}
        onNextStage={onNextStage}
        passed={passed}
        summary={result}
      />
    </div>
  );
}
