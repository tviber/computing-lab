import { useMemo } from "react";
import { getPublicCorpus } from "../domain/corpus.ts";
import {
  evaluateManualWeights,
  MAX_MANUAL_BIAS,
  MAX_MANUAL_WEIGHT,
  MIN_MANUAL_BIAS,
  MIN_MANUAL_WEIGHT,
  sigmoid,
} from "../domain/logreg.ts";
import type { MlTestSummary, ScoreDraft } from "../domain/protocol.ts";
import { SCORE_CALIBRATION_SMS, SCORE_WORDS, type MlStageDef } from "../domain/stages.ts";
import { defaultScoreDraft } from "../lesson/state.ts";
import { inspectCorpusMessageWithModel } from "../domain/tokenizer.ts";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";
import { MessageProbeCard } from "./MessageProbeCard.tsx";

function SigmoidCurveSvg({
  bias,
  emptyProb,
  selectedZ,
  selectedProb,
  selectedTag,
}: {
  bias: number;
  emptyProb: number;
  selectedZ: number;
  selectedProb: number;
  selectedTag: string;
}) {
  const W = 440;
  const H = 165;
  const PAD_L = 40;
  const PAD_R = 16;
  const PAD_T = 14;
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

  return (
    <div className="ml-sigmoid-box">
      <div className="ml-chart-head">
        <h4>实时 Sigmoid S 曲线：z = w · x + b → p = σ(z)</h4>
        <div className="ml-legend">
          <span className="ml-leg-item">
            <i className="ml-leg-swatch is-val" /> σ(z) 曲线
          </span>
          <span className="ml-leg-item">
            <i className="ml-leg-dot is-bias" /> 无词基准 b
          </span>
          <span className="ml-leg-item">
            <i className="ml-leg-dot is-msg" /> 当前短信
          </span>
        </div>
      </div>
      <svg
        aria-label="Sigmoid 曲线与当前模型定位"
        className="ml-svg-chart"
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
          stroke={selectedProb >= 0.5 ? "var(--danger)" : "var(--success)"}
          strokeDasharray="2.5 2.5"
          strokeWidth="1"
          x1={mx}
          x2={mx}
          y1={my}
          y2={H - PAD_B}
        />

        <circle
          cx={bx}
          cy={by}
          fill={emptyProb >= 0.5 ? "var(--danger)" : "var(--success)"}
          r="5"
          stroke="var(--surface)"
          strokeWidth="1.5"
        >
          <title>{`无词基准：z = b = ${bias.toFixed(1)}, σ(b) = ${(emptyProb * 100).toFixed(1)}%`}</title>
        </circle>

        <circle
          cx={mx}
          cy={my}
          fill="var(--accent)"
          r="5.5"
          stroke="var(--surface)"
          strokeWidth="1.8"
        >
          <title>{`${selectedTag}：z = ${selectedZ.toFixed(2)}, p = ${(selectedProb * 100).toFixed(1)}%`}</title>
        </circle>
      </svg>
      <p className="ml-muted-note">
        无已知词基准 z=b=<strong>{bias >= 0 ? `+${bias.toFixed(1)}` : bias.toFixed(1)}</strong> 对应{" "}
        <strong>{(emptyProb * 100).toFixed(1)}%</strong>；选中「{selectedTag}」z=
        <strong>{selectedZ >= 0 ? `+${selectedZ.toFixed(2)}` : selectedZ.toFixed(2)}</strong> →{" "}
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
  stage: MlStageDef;
  draft: ScoreDraft;
  passed: boolean;
  result: MlTestSummary | null;
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
    <div className="ml-stage-stack">
      <div className="ml-score-layout">
        <section className="ml-panel">
          <div className="ml-panel-head">
            <h3>调整权重和偏置，观察预测概率</h3>
            <button className="button button-ghost" onClick={resetToBlacklistStarter} type="button">
              恢复起点预设
            </button>
          </div>
          <p className="ml-muted-note">
            起始模型只给广告常用词设置了正权重，偏置是 <strong>b = +0.4</strong>。
            因此，即使短信里没有已知词，模型估计的垃圾概率也超过 50%。你可以先调低
            <strong>偏置 b</strong>，再给「同学」「明天」「一起」设置负权重，检查正常短信能否分对。
          </p>

          <div className="ml-slider-row is-bias">
            <label htmlFor="ml-bias-slider">
              <strong>基准偏置 b</strong>
              <small>
                没有已知词时的垃圾概率：{(evalSummary.emptyProbability * 100).toFixed(1)}%
              </small>
            </label>
            <input
              id="ml-bias-slider"
              max={MAX_MANUAL_BIAS}
              min={MIN_MANUAL_BIAS}
              onChange={(e) => onChange({ ...draft, bias: Number(e.target.value) })}
              step={0.2}
              type="range"
              value={draft.bias}
            />
            <span className={`ml-mono ml-slider-val ${draft.bias < 0 ? "is-neg" : "is-pos"}`}>
              {draft.bias >= 0 ? "+" : ""}
              {draft.bias.toFixed(1)}
            </span>
          </div>

          <div className="ml-sliders-grid">
            {SCORE_WORDS.map((word) => {
              const val = draft.weights[word] ?? 0;
              return (
                <div className="ml-slider-row" key={word}>
                  <label htmlFor={`ml-w-${word}`}>{word}</label>
                  <input
                    id={`ml-w-${word}`}
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
                    className={`ml-mono ml-slider-val ${val > 0 ? "is-pos" : val < 0 ? "is-neg" : ""}`}
                  >
                    {val >= 0 ? "+" : ""}
                    {val.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="ml-panel">
          <div className="ml-panel-head">
            <h3>模型怎样判断这 6 条短信</h3>
            <span
              className={`ml-pill ${evalSummary.correctCount === SCORE_CALIBRATION_SMS.length ? "is-success" : "is-warn"}`}
            >
              分对 {evalSummary.correctCount} / {SCORE_CALIBRATION_SMS.length}
            </span>
          </div>

          <SigmoidCurveSvg
            bias={draft.bias}
            emptyProb={evalSummary.emptyProbability}
            selectedProb={inspection.probability}
            selectedTag={selectedSms.tag}
            selectedZ={inspection.rawZ}
          />

          <ul className="ml-triage-list">
            {SCORE_CALIBRATION_SMS.map((msg, i) => {
              const ev = evalSummary.items[i];
              const isSelected = msg.id === selectedSms.id;
              return (
                <li key={msg.id}>
                  <button
                    className={`ml-triage-card${isSelected ? " is-selected" : ""} ${ev.correct ? "is-ok" : "is-wrong"}`}
                    onClick={() => onChange({ ...draft, selectedMsgId: msg.id })}
                    type="button"
                  >
                    <div className="ml-triage-top">
                      <span className={`ml-pill ${msg.label === 1 ? "is-danger" : "is-success"}`}>
                        真实：{msg.label === 1 ? "垃圾" : "正常"}（{msg.tag}）
                      </span>
                      <span className={`ml-mono ml-triage-prob ${ev.correct ? "is-ok" : "is-bad"}`}>
                        p = {(ev.probability * 100).toFixed(1)}% ·{" "}
                        {ev.correct
                          ? "判对了"
                          : ev.pred === 1
                            ? "误拦了正常短信"
                            : "漏掉了垃圾短信"}
                      </span>
                    </div>
                    <p className="ml-triage-text">{msg.text}</p>
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

      <div className="ml-submit-bar">
        <button
          className="button button-primary"
          disabled={submitting || !allConceptsDone}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? "判题中…" : `提交第 ${stage.index} 关判定`}
        </button>
        {!allConceptsDone ? (
          <span className="ml-muted-note">请先完成上方的概念题，再提交检查。</span>
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
