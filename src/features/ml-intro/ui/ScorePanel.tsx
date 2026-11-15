import { useMemo } from "react";
import { getPublicCorpus } from "../domain/corpus.ts";
import {
  evaluateManualWeights,
  MAX_MANUAL_BIAS,
  MAX_MANUAL_WEIGHT,
  MIN_MANUAL_BIAS,
  MIN_MANUAL_WEIGHT,
} from "../domain/logreg.ts";
import type { MlTestSummary, ScoreDraft } from "../domain/protocol.ts";
import { STAGE2_CALIBRATION_SMS, STAGE2_WORDS, type MlStageDef } from "../domain/stages.ts";
import { inspectMessageWithModel } from "../domain/tokenizer.ts";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";
import { MessageProbeCard } from "./MessageProbeCard.tsx";

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
    () => evaluateManualWeights(draft.weights, draft.bias, STAGE2_CALIBRATION_SMS, 0.5),
    [draft.weights, draft.bias],
  );

  const selectedSms =
    STAGE2_CALIBRATION_SMS.find((m) => m.id === draft.selectedMsgId) ?? STAGE2_CALIBRATION_SMS[0];

  const weightMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, v] of Object.entries(draft.weights)) m.set(k, v);
    return m;
  }, [draft.weights]);

  const inspection = useMemo(
    () => inspectMessageWithModel(selectedSms.text, weightMap, draft.bias, fullTrainVocab, 0.5),
    [selectedSms.text, weightMap, draft.bias, fullTrainVocab],
  );

  const allConceptsDone = stage.prompts.every((p) => draft.concepts[p.id] === p.correct);

  const resetWeights = () => {
    const zeroW: Record<string, number> = {};
    for (const w of STAGE2_WORDS) zeroW[w] = 0;
    onChange({ ...draft, weights: zeroW, bias: -1 });
  };

  return (
    <div className="ml-stage-stack">
      <div className="ml-score-layout">
        <section className="ml-panel">
          <div className="ml-panel-head">
            <h3>动手调权：给 8 个词配权重和偏置 b</h3>
            <button className="button button-ghost" onClick={resetWeights} type="button">
              清零重置
            </button>
          </div>
          <p className="ml-muted-note">
            正权重（+）把短信推向「垃圾」，负权重（−）拉回「正常」。偏置 b
            决定没有任何词命中时的默认倾向。
          </p>

          <div className="ml-slider-row is-bias">
            <label htmlFor="ml-bias-slider">
              <strong>基准偏置 b</strong>
              <small>全生词/空消息概率：{(evalSummary.emptyProbability * 100).toFixed(1)}%</small>
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
            {STAGE2_WORDS.map((word) => {
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
            <h3>6 条分诊短信实时测试（点卡片拆解分数）</h3>
            <span
              className={`ml-pill ${evalSummary.correctCount === STAGE2_CALIBRATION_SMS.length ? "is-success" : "is-warn"}`}
            >
              分对 {evalSummary.correctCount} / {STAGE2_CALIBRATION_SMS.length}
            </span>
          </div>

          <ul className="ml-triage-list">
            {STAGE2_CALIBRATION_SMS.map((msg, i) => {
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
                        {ev.correct ? "判对了" : ev.pred === 1 ? "误杀成垃圾" : "漏放成正常"}
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
          {submitting ? "判题中…" : "提交第 2 关判定"}
        </button>
        {!allConceptsDone ? (
          <span className="ml-muted-note">请先答对下方全部概念题再提交</span>
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
