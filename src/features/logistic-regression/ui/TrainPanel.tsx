import { useDeferredValue, useId, useMemo, useState } from "react";
import { MathFormula } from "../../../shared/ui/MathFormula";
import {
  binaryLogLoss,
  BLIND_GUESS_LOSS,
  clamp,
  classifyEtaRegime,
  EPS,
  MAX_SAMPLE_SIZE,
  singleUpdateDemo,
  trainLogisticRegression,
} from "../domain/logisticRegression.ts";
import type { LogisticRegressionTestSummary, TrainDraft } from "../domain/protocol.ts";
import {
  TRAIN_MAX_TRAIN_LOSS,
  TRAIN_MAX_VAL_LOSS,
  type LogisticRegressionStageDef,
} from "../domain/stages.ts";
import { ExperimentComparison } from "./ExperimentComparison.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";
import { LossChartSvg } from "./LossChartSvg.tsx";
import { LossDerivationCard } from "./LossDerivationCard.tsx";
import { SingleStepPenaltyVisual } from "./SingleStepPenaltyVisual.tsx";
import { WeightLossSliceExplorer } from "./WeightLossSliceExplorer.tsx";
import { WeightSpectrum } from "./WeightSpectrum.tsx";

const ETA_PRESETS = [
  { label: "较小 η = 0.002", eta: 0.002, epochs: 12 },
  { label: "适中 η = 0.1", eta: 0.1, epochs: 12 },
  { label: "较大 η = 0.8", eta: 0.8, epochs: 12 },
  { label: "更大 η = 5.0", eta: 5.0, epochs: 12 },
];

const SPOTLIGHT_VAL_IDS = [34, 81, 4] as const;

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
  stage: LogisticRegressionStageDef;
  draft: TrainDraft;
  passed: boolean;
  result: LogisticRegressionTestSummary | null;
  submitting: boolean;
  hasNextStage: boolean;
  onChange: (draft: TrainDraft) => void;
  onSubmit: () => void;
  onNextStage: () => void;
}) {
  const [stepTrueY, setStepTrueY] = useState<0 | 1>(1);
  const [stepPredP, setStepPredP] = useState(0.2);
  const [showSliceExplorer, setShowSliceExplorer] = useState(false);
  const slicePanelId = useId();

  const deferredEta = useDeferredValue(draft.eta);
  const deferredEpochs = useDeferredValue(draft.epochs);
  const deferredShowBgd = useDeferredValue(draft.showBgd);
  const isStale =
    deferredEta !== draft.eta ||
    deferredEpochs !== draft.epochs ||
    deferredShowBgd !== draft.showBgd;

  const stepDemo = useMemo(
    () => singleUpdateDemo(stepPredP, stepTrueY, draft.eta),
    [stepPredP, stepTrueY, draft.eta],
  );

  const run = useMemo(
    () =>
      trainLogisticRegression({
        trainCount: MAX_SAMPLE_SIZE,
        eta: deferredEta,
        epochs: deferredEpochs,
        threshold: 0.5,
        includeTrace: true,
        includeBgd: deferredShowBgd,
      }),
    [deferredEta, deferredEpochs, deferredShowBgd],
  );

  const inspectIdx = Math.max(0, Math.min(run.epochsHistory.length - 1, draft.inspectEpoch));
  const snapshot = run.epochsHistory[inspectIdx] ?? run.epochsHistory[run.epochsHistory.length - 1];
  const epoch0 = run.epochsHistory[0];
  const finalEpoch = run.epochsHistory[run.epochsHistory.length - 1];
  const regime = classifyEtaRegime(draft.eta);

  const epoch0Correct = epoch0 ? epoch0.valMetrics.tp + epoch0.valMetrics.tn : 0;
  const epoch0Loss = epoch0 ? epoch0.valLoss : BLIND_GUESS_LOSS;
  const finalCorrect = finalEpoch.valMetrics.tp + finalEpoch.valMetrics.tn;
  const valTotal = finalEpoch.valMetrics.total;
  const epoch0Acc = valTotal > 0 ? epoch0Correct / valTotal : 0;
  const majorityCorrect = Math.round(run.baselineAcc * valTotal);
  const priorSpamRate = clamp(run.trainSpamRate, EPS, 1 - EPS);
  const priorBceLoss =
    valTotal > 0
      ? run.valPredictions.reduce(
          (sum, item) => sum + binaryLogLoss(item.label, priorSpamRate),
          0,
        ) / valTotal
      : BLIND_GUESS_LOSS;
  const beatsAccBaseline = finalEpoch.valMetrics.accuracy > run.baselineAcc;
  const beatsBceBaseline = finalEpoch.valLoss < priorBceLoss;
  const spotlightMsgs = useMemo(
    () =>
      SPOTLIGHT_VAL_IDS.map((id) => run.valPredictions.find((item) => item.id === id)).filter(
        (item): item is NonNullable<typeof item> => item !== undefined,
      ),
    [run.valPredictions],
  );

  const logSliderVal = Math.log10(Math.max(0.001, Math.min(4.0, draft.eta)));
  const trOk = finalEpoch.trainLoss <= TRAIN_MAX_TRAIN_LOSS;
  const valOk = finalEpoch.valLoss <= TRAIN_MAX_VAL_LOSS;

  return (
    <div className="logistic-regression-stage-stack">
      <section className="logistic-regression-panel">
        <div className="logistic-regression-panel-head">
          <h3>用 1,400 条短信自动训练模型（词表含 {run.vocabSize} 个词）</h3>
          <div className="logistic-regression-preset-row">
            {isStale ? (
              <span className="logistic-regression-pill is-warn" role="status">
                正在按新参数重新计算…
              </span>
            ) : null}
            <span className={`logistic-regression-pill is-regime-${regime.id}`}>
              {regime.label}
            </span>
          </div>
        </div>
        <p className="logistic-regression-data-guide">
          第 3 关手调 8 个词就很费劲，这里有 {run.vocabSize} 个词。训练集的{" "}
          {MAX_SAMPLE_SIZE.toLocaleString("en-US")} 条短信用于更新权重；300
          条验证短信用于比较结果，不参与更新。
        </p>

        <div className="logistic-regression-preset-row">
          {ETA_PRESETS.map((p) => (
            <button
              className={`logistic-regression-chip-btn${Math.abs(draft.eta - p.eta) < 0.0005 ? " is-active" : ""}`}
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

        <div className="logistic-regression-controls-grid">
          <div className="logistic-regression-control-card">
            <div className="logistic-regression-control-head">
              <label htmlFor="logistic-regression-eta-slider">学习率 η（对数刻度）</label>
              <strong className="logistic-regression-mono">{draft.eta.toFixed(4)}</strong>
            </div>
            <input
              id="logistic-regression-eta-slider"
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
            <p className="logistic-regression-muted-note">{regime.summary}</p>
          </div>

          <div className="logistic-regression-control-card">
            <div className="logistic-regression-control-head">
              <label htmlFor="logistic-regression-epochs-slider">训练轮数</label>
              <strong className="logistic-regression-mono">{draft.epochs} 轮</strong>
            </div>
            <input
              id="logistic-regression-epochs-slider"
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
            <label className="logistic-regression-checkbox-row">
              <input
                checked={draft.showBgd}
                onChange={(e) => onChange({ ...draft, showBgd: e.target.checked })}
                type="checkbox"
              />
              <span>同时显示全批量梯度下降（BGD）的曲线</span>
            </label>
            <p className="logistic-regression-muted-note logistic-regression-update-guide">
              每轮读完 1,400 条训练短信。每读一条，模型更新一次权重。
            </p>
          </div>
        </div>

        <div className="logistic-regression-before-after" aria-label="训练前后验证短信表现对比">
          <div className="logistic-regression-before-after-head">
            <h4>训练前后对比</h4>
            <span className="logistic-regression-muted-note">
              300 条验证短信中，正常短信占 {(run.baselineAcc * 100).toFixed(1)}%。
            </span>
          </div>
          <div className="logistic-regression-baseline-grid">
            <div className="logistic-regression-stat-box">
              <span>训练前（全 0 权重各猜 50%）</span>
              <strong className="logistic-regression-mono">
                分对 {epoch0Correct} / {valTotal} 条（{(epoch0Acc * 100).toFixed(1)}%）
              </strong>
              <small className="logistic-regression-mono">
                BCE Loss {epoch0Loss.toFixed(4)}（p=0.5 按 p≥0.5 全判垃圾）
              </small>
            </div>
            <div className="logistic-regression-stat-box">
              <span>多数类 / 先验基线（不学词 · 按训练集估计）</span>
              <strong className="logistic-regression-mono">
                分对 {majorityCorrect} / {valTotal} 条（{(run.baselineAcc * 100).toFixed(1)}%）
              </strong>
              <small className="logistic-regression-mono">
                按训练集垃圾占比 {(run.trainSpamRate * 100).toFixed(1)}% 固定猜：BCE Loss{" "}
                {priorBceLoss.toFixed(4)}（查垃圾 0%）
              </small>
            </div>
            <div
              className={`logistic-regression-stat-box ${beatsAccBaseline && beatsBceBaseline ? "is-ok" : "is-warn"}`}
            >
              <span>
                训练后（第 {finalEpoch.epoch} 轮 · η = {run.eta}）
              </span>
              <strong className="logistic-regression-mono">
                分对 {finalCorrect} / {valTotal} 条（
                {(finalEpoch.valMetrics.accuracy * 100).toFixed(1)}
                %）
              </strong>
              <small className="logistic-regression-mono">
                准确率：{beatsAccBaseline ? "已超过" : "未超过"}{" "}
                {(run.baselineAcc * 100).toFixed(1)}% 多数类基线
              </small>
              <small className="logistic-regression-mono">
                BCE Loss {epoch0Loss.toFixed(4)} → {finalEpoch.valLoss.toFixed(4)}（
                {beatsBceBaseline ? "优于" : "高于"}训练集固定先验基线 {priorBceLoss.toFixed(4)}）
              </small>
            </div>
          </div>
          {spotlightMsgs.length > 0 ? (
            <ul className="logistic-regression-spotlight-list">
              {spotlightMsgs.map((item) => {
                const isRight = item.pred === item.label;
                return (
                  <li className="logistic-regression-spotlight-row" key={item.id}>
                    <span
                      className={`logistic-regression-pill ${item.label === 1 ? "is-danger" : "is-success"}`}
                    >
                      真实：{item.label === 1 ? "垃圾" : "正常"}
                    </span>
                    <span className="logistic-regression-spotlight-text">{item.text}</span>
                    <span
                      className={`logistic-regression-mono logistic-regression-spotlight-prob ${isRight ? "is-ok" : "is-bad"}`}
                    >
                      50.0% → {(item.probability * 100).toFixed(1)}%（
                      {isRight ? "判对了" : item.pred === 1 ? "误拦" : "漏报"}）
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="logistic-regression-target-strip">
          <div className={`logistic-regression-stat-box ${trOk ? "is-ok" : "is-warn"}`}>
            <span>最终训练损失（目标 ≤ {TRAIN_MAX_TRAIN_LOSS}）</span>
            <strong className="logistic-regression-mono">{finalEpoch.trainLoss.toFixed(4)}</strong>
          </div>
          <div className={`logistic-regression-stat-box ${valOk ? "is-ok" : "is-warn"}`}>
            <span>最终验证损失（目标 ≤ {TRAIN_MAX_VAL_LOSS}）</span>
            <strong className="logistic-regression-mono">{finalEpoch.valLoss.toFixed(4)}</strong>
          </div>
          <div className="logistic-regression-stat-box">
            <span>当前查看：第 {snapshot.epoch} 轮</span>
            <strong className="logistic-regression-mono">
              验证损失 {snapshot.valLoss.toFixed(3)} · 偏置 {snapshot.bias.toFixed(2)}
            </strong>
          </div>
        </div>

        <p className="logistic-regression-muted-note">
          修改训练参数后，程序会自动重新训练。下面只回放已有结果，不改变最终提交的模型。
        </p>
        <div className="logistic-regression-scrubber-row">
          <label htmlFor="logistic-regression-epoch-scrubber">
            回放第 <strong className="logistic-regression-mono">{snapshot.epoch}</strong>{" "}
            轮结束时，各个词的权重：
          </label>
          <input
            id="logistic-regression-epoch-scrubber"
            max={run.epochsHistory.length - 1}
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
          showBgd={deferredShowBgd}
        />
        <ExperimentComparison
          parameters={[
            { id: "eta", label: "学习率", value: run.eta, display: String(run.eta) },
            { id: "epochs", label: "训练轮数", value: run.epochs, display: `${run.epochs} 轮` },
          ]}
          metrics={[
            {
              id: "train-loss",
              label: "最终训练损失",
              value: finalEpoch.trainLoss,
              display: finalEpoch.trainLoss.toFixed(4),
            },
            {
              id: "val-loss",
              label: "最终验证损失",
              value: finalEpoch.valLoss,
              display: finalEpoch.valLoss.toFixed(4),
            },
          ]}
        />
      </section>

      <WeightSpectrum
        heading={`第 ${snapshot.epoch} 轮权重较大的词`}
        topHam={snapshot.topHam}
        topSpam={snapshot.topSpam}
        trainCount={run.trainCount}
      />

      <section className="logistic-regression-panel logistic-regression-step-micro">
        <div className="logistic-regression-panel-head">
          <h3>一条短信如何更新权重</h3>
          <span className="logistic-regression-mono logistic-regression-muted-note">
            <MathFormula>{String.raw`\Delta w_j=-\eta\,(p-y)\,x_j`}</MathFormula>
          </span>
        </div>
        <div className="logistic-regression-micro-controls">
          <div className="logistic-regression-segmented" role="group" aria-label="选择真实标签">
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
          <label className="logistic-regression-inline-slider">
            <span>
              模型预测的垃圾概率 p ={" "}
              <strong className="logistic-regression-mono">{stepPredP.toFixed(2)}</strong>
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
        <div className="logistic-regression-micro-metrics">
          <div className="logistic-regression-stat-box">
            <span>交叉熵损失</span>
            <strong className="logistic-regression-mono">{stepDemo.loss.toFixed(3)}</strong>
            <small>
              {stepDemo.loss > 1.2
                ? "模型对真实标签的预测概率较低"
                : "真实标签的预测概率越高，损失越小"}
            </small>
          </div>
          <div className="logistic-regression-stat-box">
            <span>
              偏差信号 <MathFormula>p-y</MathFormula>
            </span>
            <strong className="logistic-regression-mono">
              {stepDemo.errorSignal >= 0 ? "+" : ""}
              {stepDemo.errorSignal.toFixed(2)}
            </strong>
            <small>{stepTrueY === 1 ? "低估了垃圾概率" : "高估了垃圾概率"}</small>
          </div>
          <div className="logistic-regression-stat-box">
            <span>
              出现词的权重改变量（<MathFormula>x_j=1</MathFormula>）
            </span>
            <strong
              className={`logistic-regression-mono ${stepDemo.deltaW >= 0 ? "is-pos" : "is-neg"}`}
            >
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
        <SingleStepPenaltyVisual
          deltaW={stepDemo.deltaW}
          eta={draft.eta}
          loss={stepDemo.loss}
          predP={stepPredP}
          trueY={stepTrueY}
        />
        <LossDerivationCard />
      </section>

      <section className="logistic-regression-panel logistic-regression-advanced-box">
        <div className="logistic-regression-panel-head">
          <div>
            <h3>单个权重与损失（选读）</h3>
          </div>
          <button
            aria-controls={slicePanelId}
            aria-expanded={showSliceExplorer}
            className="button button-ghost disclosure-trigger"
            onClick={() => setShowSliceExplorer((v) => !v)}
            type="button"
          >
            {showSliceExplorer ? "收起进阶探索：单维权重切片图" : "展开进阶探索：单维权重切片图"}
          </button>
        </div>
        {showSliceExplorer ? (
          <div id={slicePanelId}>
            <WeightLossSliceExplorer trainedModel={run.finalModel} />
          </div>
        ) : null}
      </section>

      <div className="logistic-regression-submit-bar">
        <button
          className="button button-primary"
          disabled={submitting || isStale}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? "判题中…" : isStale ? "正在重新计算…" : `提交第 ${stage.index} 关判定`}
        </button>
        {isStale ? (
          <span className="logistic-regression-muted-note">
            正在按新参数重新计算模型，完成后即可提交。
          </span>
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
