import { useMemo } from "react";
import {
  MAX_SAMPLE_SIZE,
  rethresholdPredictions,
  sweepThresholds,
  trainLogisticRegression,
} from "../domain/logreg.ts";
import type { EvaluateDraft, MlTestSummary } from "../domain/protocol.ts";
import {
  EVAL_MIN_ACCURACY,
  EVAL_MIN_PRECISION,
  EVAL_MIN_RECALL,
  type MlStageDef,
} from "../domain/stages.ts";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { ConfusionPanel } from "./ConfusionPanel.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function EvaluatePanel({
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
  draft: EvaluateDraft;
  passed: boolean;
  result: MlTestSummary | null;
  submitting: boolean;
  hasNextStage: boolean;
  onChange: (draft: EvaluateDraft) => void;
  onSubmit: () => void;
  onNextStage: () => void;
}) {
  const baseRun = useMemo(
    () =>
      trainLogisticRegression({
        trainCount: MAX_SAMPLE_SIZE,
        eta: draft.eta,
        epochs: draft.epochs,
        threshold: 0.5,
      }),
    [draft.eta, draft.epochs],
  );

  const reEval = useMemo(
    () => rethresholdPredictions(baseRun.valPredictions, draft.threshold),
    [baseRun.valPredictions, draft.threshold],
  );
  const prCurve = useMemo(() => sweepThresholds(baseRun.valPredictions), [baseRun.valPredictions]);

  const m = reEval.metrics;
  const accOk = m.accuracy >= EVAL_MIN_ACCURACY;
  const precOk = m.precision >= EVAL_MIN_PRECISION;
  const recOk = m.recall >= EVAL_MIN_RECALL;
  const allConceptsDone = stage.prompts.every((p) => draft.concepts[p.id] === p.correct);

  return (
    <div className="ml-stage-stack">
      <section className="ml-panel ml-trap-banner">
        <div className="ml-trap-col">
          <p className="eyebrow">对照：始终预测正常</p>
          <h4>一律猜「正常短信（0）」</h4>
          <p className="ml-muted-note">
            在 300 条验证集里有 258 条正常短信、42 条垃圾短信。如果一个模型永远输出 0：
          </p>
          <div className="ml-mini-kpis">
            <span>
              准确率 Accuracy：<strong className="ml-mono">{pct(baseRun.baselineAcc)}</strong>
            </span>
            <span>
              查全率 Recall：<strong className="ml-mono is-bad">0.0%（没有拦截垃圾短信）</strong>
            </span>
          </div>
        </div>

        <div className="ml-trap-col">
          <p className="eyebrow">你的分类器</p>
          <h4>阈值 τ = {draft.threshold.toFixed(2)}（p ≥ τ 判垃圾）</h4>
          <div className="ml-metric-pills">
            <div className={`ml-stat-box ${accOk ? "is-ok" : "is-warn"}`}>
              <span>准确率（目标 ≥ 95%）</span>
              <strong className="ml-mono">{pct(m.accuracy)}</strong>
            </div>
            <div className={`ml-stat-box ${precOk ? "is-ok" : "is-warn"}`}>
              <span>Precision 查准率（目标 ≥ 90%）</span>
              <strong className="ml-mono">{pct(m.precision)}</strong>
            </div>
            <div className={`ml-stat-box ${recOk ? "is-ok" : "is-warn"}`}>
              <span>Recall 查全率（目标 ≥ 80%）</span>
              <strong className="ml-mono">{pct(m.recall)}</strong>
            </div>
            <div className="ml-stat-box">
              <span>F1 分数</span>
              <strong className="ml-mono">{pct(m.f1)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="ml-panel">
        <div className="ml-panel-head">
          <h3>调整分类阈值和训练参数</h3>
          <button
            className="button button-ghost"
            onClick={() => onChange({ ...draft, eta: 0.1, epochs: 12, threshold: 0.4 })}
            type="button"
          >
            恢复推荐初值
          </button>
        </div>

        <div className="ml-controls-grid is-three">
          <div className="ml-control-card">
            <div className="ml-control-head">
              <label htmlFor="ml-thresh-slider">分类阈值 τ</label>
              <strong className="ml-mono">{draft.threshold.toFixed(2)}</strong>
            </div>
            <input
              id="ml-thresh-slider"
              max={0.95}
              min={0.05}
              onChange={(e) => onChange({ ...draft, threshold: Number(e.target.value) })}
              step={0.05}
              type="range"
              value={draft.threshold}
            />
            <p className="ml-muted-note">
              提高阈值后，模型会少拦截一些短信；降低阈值后，模型会多拦截一些。请观察误报和漏报的数量。
            </p>
          </div>

          <div className="ml-control-card">
            <div className="ml-control-head">
              <label htmlFor="ml-s4-eta">学习率 η</label>
              <strong className="ml-mono">{draft.eta.toFixed(3)}</strong>
            </div>
            <input
              id="ml-s4-eta"
              max={0.6}
              min={0.02}
              onChange={(e) => onChange({ ...draft, eta: Number(e.target.value) })}
              step={0.02}
              type="range"
              value={Math.min(0.6, Math.max(0.02, draft.eta))}
            />
            <p className="ml-muted-note">
              你改变学习率后，模型会重新训练，短信的预测概率也可能改变。
            </p>
          </div>

          <div className="ml-control-card">
            <div className="ml-control-head">
              <label htmlFor="ml-s4-epochs">训练轮数</label>
              <strong className="ml-mono">{draft.epochs} 轮</strong>
            </div>
            <input
              id="ml-s4-epochs"
              max={20}
              min={4}
              onChange={(e) => onChange({ ...draft, epochs: Number(e.target.value) })}
              step={1}
              type="range"
              value={Math.min(20, Math.max(4, draft.epochs))}
            />
            <p className="ml-muted-note">你可以比较不同轮数的验证结果，再选择分类阈值。</p>
          </div>
        </div>
      </section>

      <ConfusionPanel
        activeBucket={draft.activeBucket}
        curve={prCurve}
        metrics={m}
        model={baseRun.finalModel}
        onSelectBucket={(activeBucket) => onChange({ ...draft, activeBucket })}
        onSelectThreshold={(threshold) => onChange({ ...draft, threshold })}
        predictions={reEval.predictions}
        threshold={draft.threshold}
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
          <span className="ml-muted-note">请先答对概念题，再提交检查。</span>
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
