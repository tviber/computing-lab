import { useMemo, useState } from "react";
import {
  classifyEtaRegime,
  MAX_SAMPLE_SIZE,
  singleUpdateDemo,
  trainLogisticRegression,
} from "../domain/logreg.ts";
import type { MlTestSummary, TrainDraft } from "../domain/protocol.ts";
import { TRAIN_MAX_TRAIN_LOSS, TRAIN_MAX_VAL_LOSS, type MlStageDef } from "../domain/stages.ts";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";
import { LossChartSvg } from "./LossChartSvg.tsx";
import { WeightSpectrum } from "./WeightSpectrum.tsx";

const ETA_PRESETS = [
  { label: "较小 η = 0.002", eta: 0.002, epochs: 12 },
  { label: "适中 η = 0.1", eta: 0.1, epochs: 12 },
  { label: "较大 η = 0.8", eta: 0.8, epochs: 12 },
  { label: "更大 η = 5.0", eta: 5.0, epochs: 12 },
];

export function TrainPanel({
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
  draft: TrainDraft;
  passed: boolean;
  result: MlTestSummary | null;
  submitting: boolean;
  hasNextStage: boolean;
  onChange: (draft: TrainDraft) => void;
  onSubmit: () => void;
  onNextStage: () => void;
}) {
  const [stepTrueY, setStepTrueY] = useState<0 | 1>(1);
  const [stepPredP, setStepPredP] = useState(0.2);

  const stepDemo = useMemo(
    () => singleUpdateDemo(stepPredP, stepTrueY, draft.eta),
    [stepPredP, stepTrueY, draft.eta],
  );

  const run = useMemo(
    () =>
      trainLogisticRegression({
        trainCount: MAX_SAMPLE_SIZE,
        eta: draft.eta,
        epochs: draft.epochs,
        threshold: 0.5,
        includeTrace: true,
        includeBgd: draft.showBgd,
      }),
    [draft.eta, draft.epochs, draft.showBgd],
  );

  const inspectIdx = Math.max(0, Math.min(draft.epochs, draft.inspectEpoch));
  const snapshot = run.epochsHistory[inspectIdx] ?? run.epochsHistory[run.epochsHistory.length - 1];
  const finalEpoch = run.epochsHistory[run.epochsHistory.length - 1];
  const regime = classifyEtaRegime(draft.eta);

  const logSliderVal = Math.log10(Math.max(0.001, Math.min(4.0, draft.eta)));
  const allConceptsDone = stage.prompts.every((p) => draft.concepts[p.id] === p.correct);
  const trOk = finalEpoch.trainLoss <= TRAIN_MAX_TRAIN_LOSS;
  const valOk = finalEpoch.valLoss <= TRAIN_MAX_VAL_LOSS;

  return (
    <div className="ml-stage-stack">
      <section className="ml-panel ml-step-micro">
        <div className="ml-panel-head">
          <h3>模型怎样调整一次权重</h3>
          <span className="ml-mono ml-muted-note">公式：w ← w − η · (p − y)</span>
        </div>
        <div className="ml-micro-controls">
          <div className="ml-segmented" role="group" aria-label="选择真实标签">
            <button
              aria-pressed={stepTrueY === 1}
              className={stepTrueY === 1 ? "is-active" : ""}
              onClick={() => setStepTrueY(1)}
              type="button"
            >
              垃圾短信（y = 1）
            </button>
            <button
              aria-pressed={stepTrueY === 0}
              className={stepTrueY === 0 ? "is-active" : ""}
              onClick={() => setStepTrueY(0)}
              type="button"
            >
              正常短信（y = 0）
            </button>
          </div>
          <label className="ml-inline-slider">
            <span>
              模型预测的垃圾概率 p = <strong className="ml-mono">{stepPredP.toFixed(2)}</strong>
            </span>
            <input
              max={0.98}
              min={0.02}
              onChange={(e) => setStepPredP(Number(e.target.value))}
              step={0.02}
              type="range"
              value={stepPredP}
            />
          </label>
        </div>
        <div className="ml-micro-metrics">
          <div className="ml-stat-box">
            <span>交叉熵损失 Loss</span>
            <strong className="ml-mono">{stepDemo.loss.toFixed(3)}</strong>
            <small>
              {stepDemo.loss > 1.2
                ? "模型对真实标签的预测概率较低"
                : "损失越低，预测越接近真实标签"}
            </small>
          </div>
          <div className="ml-stat-box">
            <span>误差信号 (p − y)</span>
            <strong className="ml-mono">
              {stepDemo.errorSignal >= 0 ? "+" : ""}
              {stepDemo.errorSignal.toFixed(2)}
            </strong>
            <small>{stepTrueY === 1 ? "低估了垃圾概率" : "高估了垃圾概率"}</small>
          </div>
          <div className="ml-stat-box">
            <span>单步更新 Δw = −η·(p−y)</span>
            <strong className={`ml-mono ${stepDemo.deltaW >= 0 ? "is-pos" : "is-neg"}`}>
              {stepDemo.deltaW >= 0 ? "+" : ""}
              {stepDemo.deltaW.toFixed(4)}
            </strong>
            <small>
              {stepDemo.direction === "up"
                ? "模型会增加本条短信中各个词的权重"
                : stepDemo.direction === "down"
                  ? "模型会减少本条短信中各个词的权重"
                  : "预测值等于标签，权重不变"}
            </small>
          </div>
        </div>
      </section>

      <section className="ml-panel">
        <div className="ml-panel-head">
          <h3>用 1,400 条短信训练模型（词表含 {run.vocabSize} 个词）</h3>
          <span className={`ml-pill is-regime-${regime.id}`}>{regime.label}</span>
        </div>

        <div className="ml-preset-row">
          {ETA_PRESETS.map((p) => (
            <button
              className={`ml-chip-btn${Math.abs(draft.eta - p.eta) < 0.0005 ? " is-active" : ""}`}
              key={p.label}
              onClick={() =>
                onChange({
                  ...draft,
                  eta: p.eta,
                  epochs: p.epochs,
                  inspectEpoch: p.epochs,
                })
              }
              type="button"
            >
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        <div className="ml-controls-grid">
          <div className="ml-control-card">
            <div className="ml-control-head">
              <label htmlFor="ml-eta-slider">学习率 η（对数刻度）</label>
              <strong className="ml-mono">{draft.eta.toFixed(4)}</strong>
            </div>
            <input
              id="ml-eta-slider"
              max={0.699}
              min={-3}
              onChange={(e) => {
                const eta = Number((10 ** Number(e.target.value)).toFixed(4));
                onChange({ ...draft, eta });
              }}
              step={0.03}
              type="range"
              value={logSliderVal}
            />
            <p className="ml-muted-note">{regime.summary}</p>
          </div>

          <div className="ml-control-card">
            <div className="ml-control-head">
              <label htmlFor="ml-epochs-slider">训练轮数</label>
              <strong className="ml-mono">{draft.epochs} 轮</strong>
            </div>
            <input
              id="ml-epochs-slider"
              max={25}
              min={1}
              onChange={(e) => {
                const nextEp = Number(e.target.value);
                onChange({
                  ...draft,
                  epochs: nextEp,
                  inspectEpoch: Math.min(draft.inspectEpoch, nextEp),
                });
              }}
              step={1}
              type="range"
              value={draft.epochs}
            />
            <label className="ml-checkbox-row">
              <input
                checked={draft.showBgd}
                onChange={(e) => onChange({ ...draft, showBgd: e.target.checked })}
                type="checkbox"
              />
              <span>同时显示全批量梯度下降（BGD）的曲线</span>
            </label>
          </div>
        </div>

        <div className="ml-target-strip">
          <div className={`ml-stat-box ${trOk ? "is-ok" : "is-warn"}`}>
            <span>最终训练损失（目标 ≤ {TRAIN_MAX_TRAIN_LOSS}）</span>
            <strong className="ml-mono">{finalEpoch.trainLoss.toFixed(4)}</strong>
          </div>
          <div className={`ml-stat-box ${valOk ? "is-ok" : "is-warn"}`}>
            <span>最终验证损失（目标 ≤ {TRAIN_MAX_VAL_LOSS}）</span>
            <strong className="ml-mono">{finalEpoch.valLoss.toFixed(4)}</strong>
          </div>
          <div className="ml-stat-box">
            <span>当前查看：第 {snapshot.epoch} 轮</span>
            <strong className="ml-mono">
              验证损失 {snapshot.valLoss.toFixed(3)} · 偏置 {snapshot.bias.toFixed(2)}
            </strong>
          </div>
        </div>

        <div className="ml-scrubber-row">
          <label htmlFor="ml-epoch-scrubber">
            回放第 <strong className="ml-mono">{snapshot.epoch}</strong> 轮结束时，各个词的权重：
          </label>
          <input
            id="ml-epoch-scrubber"
            max={draft.epochs}
            min={0}
            onChange={(e) => onChange({ ...draft, inspectEpoch: Number(e.target.value) })}
            step={1}
            type="range"
            value={inspectIdx}
          />
        </div>

        <LossChartSvg
          bgdHistory={run.bgdHistory}
          history={run.epochsHistory}
          inspectEpoch={inspectIdx}
          intraTrace={run.intraEpochTrace}
          onSelectEpoch={(ep) => onChange({ ...draft, inspectEpoch: ep })}
          showBgd={draft.showBgd}
        />
      </section>

      <WeightSpectrum
        heading={`第 ${snapshot.epoch} 轮权重较大的词`}
        topHam={snapshot.topHam}
        topSpam={snapshot.topSpam}
        trainCount={run.trainCount}
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
