import { useMemo } from "react";
import { rethresholdPredictions, trainLogisticRegression } from "../domain/logreg.ts";
import type { GeneralizeDraft, MlTestSummary } from "../domain/protocol.ts";
import type { MlStageDef } from "../domain/stages.ts";
import { inspectMessageWithModel } from "../domain/tokenizer.ts";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";
import { LossChartSvg } from "./LossChartSvg.tsx";
import { MessageProbeCard } from "./MessageProbeCard.tsx";
import { WeightSpectrum } from "./WeightSpectrum.tsx";

const SAMPLE_PRESETS = [
  { label: "150 条（小样本）", count: 150 },
  { label: "300 条", count: 300 },
  { label: "600 条（中等规模）", count: 600 },
  { label: "1,000 条", count: 1000 },
  { label: "1,400 条（全量公开训练）", count: 1400 },
];

const PROBE_QUICK_CASES = [
  "免费领取现金红包，回复TD退订",
  "同学说学校明天可以免费看电影，一起去吗",
  "元宇宙盲盒空投到账，点我领取限定礼品",
];

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function GeneralizePanel({
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
  draft: GeneralizeDraft;
  passed: boolean;
  result: MlTestSummary | null;
  submitting: boolean;
  hasNextStage: boolean;
  onChange: (draft: GeneralizeDraft) => void;
  onSubmit: () => void;
  onNextStage: () => void;
}) {
  const baseRun = useMemo(
    () =>
      trainLogisticRegression({
        trainCount: draft.sampleSize,
        eta: draft.eta,
        epochs: draft.epochs,
        threshold: 0.5,
      }),
    [draft.sampleSize, draft.eta, draft.epochs],
  );

  const reEval = useMemo(
    () => rethresholdPredictions(baseRun.valPredictions, draft.threshold),
    [baseRun.valPredictions, draft.threshold],
  );

  const probeInspection = useMemo(
    () =>
      inspectMessageWithModel(
        draft.probeText,
        baseRun.finalModel.weightsByWord,
        baseRun.finalModel.bias,
        baseRun.finalModel.vocabSet,
        draft.threshold,
        baseRun.finalModel.wordToIndex,
      ),
    [draft.probeText, baseRun.finalModel, draft.threshold],
  );

  const lastEpoch = baseRun.epochsHistory[baseRun.epochsHistory.length - 1];
  const vm = reEval.metrics;
  const accGap = lastEpoch.trainAcc - vm.accuracy;
  const allConceptsDone = stage.prompts.every((p) => draft.concepts[p.id] === p.correct);

  return (
    <div className="ml-stage-stack">
      <section className="ml-panel">
        <div className="ml-panel-head">
          <h3>训练样本量怎样影响结果</h3>
          <span className="ml-badge-neutral">当前词表收录 {baseRun.vocabSize} 词</span>
        </div>

        <div className="ml-preset-row">
          {SAMPLE_PRESETS.map((p) => (
            <button
              className={`ml-chip-btn${draft.sampleSize === p.count ? " is-active" : ""}`}
              key={p.count}
              onClick={() => onChange({ ...draft, sampleSize: p.count })}
              type="button"
            >
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        <div className="ml-controls-grid is-four">
          <div className="ml-control-card">
            <div className="ml-control-head">
              <label htmlFor="ml-s5-samples">训练样本量 N</label>
              <strong className="ml-mono">{draft.sampleSize} 条</strong>
            </div>
            <input
              id="ml-s5-samples"
              max={1400}
              min={100}
              onChange={(e) => onChange({ ...draft, sampleSize: Number(e.target.value) })}
              step={50}
              type="range"
              value={draft.sampleSize}
            />
          </div>

          <div className="ml-control-card">
            <div className="ml-control-head">
              <label htmlFor="ml-s5-eta">学习率 η</label>
              <strong className="ml-mono">{draft.eta.toFixed(2)}</strong>
            </div>
            <input
              id="ml-s5-eta"
              max={0.6}
              min={0.02}
              onChange={(e) => onChange({ ...draft, eta: Number(e.target.value) })}
              step={0.02}
              type="range"
              value={Math.min(0.6, Math.max(0.02, draft.eta))}
            />
          </div>

          <div className="ml-control-card">
            <div className="ml-control-head">
              <label htmlFor="ml-s5-epochs">训练轮数</label>
              <strong className="ml-mono">{draft.epochs} 轮</strong>
            </div>
            <input
              id="ml-s5-epochs"
              max={25}
              min={3}
              onChange={(e) => onChange({ ...draft, epochs: Number(e.target.value) })}
              step={1}
              type="range"
              value={Math.min(25, Math.max(3, draft.epochs))}
            />
          </div>

          <div className="ml-control-card">
            <div className="ml-control-head">
              <label htmlFor="ml-s5-thresh">分类阈值 τ</label>
              <strong className="ml-mono">{draft.threshold.toFixed(2)}</strong>
            </div>
            <input
              id="ml-s5-thresh"
              max={0.9}
              min={0.1}
              onChange={(e) => onChange({ ...draft, threshold: Number(e.target.value) })}
              step={0.05}
              type="range"
              value={draft.threshold}
            />
          </div>
        </div>

        <div className="ml-gap-grid">
          <div className="ml-stat-box">
            <span>训练集准确率 / 损失</span>
            <strong className="ml-mono">
              {pct(lastEpoch.trainAcc)} · Loss {lastEpoch.trainLoss.toFixed(3)}
            </strong>
          </div>
          <div className={`ml-stat-box ${vm.accuracy >= 0.95 ? "is-ok" : "is-warn"}`}>
            <span>验证集准确率 / 损失</span>
            <strong className="ml-mono">
              {pct(vm.accuracy)} · Loss {vm.loss.toFixed(3)}
            </strong>
          </div>
          <div className={`ml-stat-box ${vm.recall >= 0.78 ? "is-ok" : "is-warn"}`}>
            <span>验证集查准率 / 查全率</span>
            <strong className="ml-mono">
              P {pct(vm.precision)} · R {pct(vm.recall)}
            </strong>
          </div>
          <div className={`ml-stat-box ${vm.oovRate > 0.4 ? "is-warn" : "is-ok"}`}>
            <span>验证集未见词比例（两组准确率相差 {pct(accGap)}）</span>
            <strong className="ml-mono">{pct(vm.oovRate)}</strong>
          </div>
        </div>

        <LossChartSvg history={baseRun.epochsHistory} />
      </section>

      <WeightSpectrum
        heading={`用 ${draft.sampleSize} 条短信训练后，哪些词的权重较大`}
        topHam={lastEpoch.topHam}
        topSpam={lastEpoch.topSpam}
        trainCount={baseRun.trainCount}
      />

      <section className="ml-panel">
        <div className="ml-panel-head">
          <h3>写一条新短信，试试模型能否分对</h3>
          <span className="ml-muted-note">你可以试试新词，或在正常消息中加入广告常用词</span>
        </div>
        <div className="ml-preset-row">
          {PROBE_QUICK_CASES.map((text, idx) => (
            <button
              className={`ml-chip-btn${draft.probeText === text ? " is-active" : ""}`}
              key={idx}
              onClick={() => onChange({ ...draft, probeText: text })}
              type="button"
            >
              <span>测试例 {idx + 1}</span>
            </button>
          ))}
        </div>
        <input
          aria-label="自定义测试短信"
          className="ml-text-input"
          maxLength={240}
          onChange={(e) => onChange({ ...draft, probeText: e.target.value })}
          placeholder="输入一条短信，查看模型的预测和评分依据…"
          type="text"
          value={draft.probeText}
        />
        <MessageProbeCard
          inspection={probeInspection}
          threshold={draft.threshold}
          title="模型如何判断你写的短信"
        />
      </section>

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
          {submitting ? "正在测试…" : "提交到测试集检查"}
        </button>
        <span className="ml-muted-note">
          {!allConceptsDone
            ? "请先答对概念题，再提交测试。"
            : "服务器只返回测试是否通过。请根据上方验证集的结果调整参数。"}
        </span>
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
