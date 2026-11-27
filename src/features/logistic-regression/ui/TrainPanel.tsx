import { Button } from "@ui-sdk/solid/button";
import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox";
import { SegmentedControl, SegmentedControlItem } from "@ui-sdk/solid/segmented-control";
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
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
import { SingleStepPenaltyVisual } from "./SingleStepPenaltyVisual.tsx";
import { WeightSpectrum } from "./WeightSpectrum.tsx";

const ETA_PRESETS = [
  { label: "较小 η = 0.002", eta: 0.002, epochs: 12 },
  { label: "适中 η = 0.1", eta: 0.1, epochs: 12 },
  { label: "较大 η = 0.8", eta: 0.8, epochs: 12 },
  { label: "更大 η = 5.0", eta: 5.0, epochs: 12 },
] as const;

const SPOTLIGHT_VAL_IDS = [34, 81, 4] as const;

export function TrainPanel(props: {
  stage: LogisticRegressionStageDef;
  draft: TrainDraft;
  passed: boolean;
  result: LogisticRegressionTestSummary | null;
  submitting: boolean;
  hasNextStage: boolean;
  onChange: (draft: TrainDraft) => void;
  onSubmit: () => void;
  onNextStage: () => void;
  onBonusStage: () => void;
}) {
  const [stepTrueY, setStepTrueY] = createSignal<0 | 1>(1);
  const [stepPredP, setStepPredP] = createSignal(0.2);

  const [settledParams, setSettledParams] = createSignal(
    untrack(() => ({
      eta: props.draft.eta,
      epochs: props.draft.epochs,
      showBgd: props.draft.showBgd,
    })),
  );

  const paramKey = createMemo(
    () => `${props.draft.eta}\0${props.draft.epochs}\0${props.draft.showBgd ? 1 : 0}`,
  );
  let initialSync = true;
  createEffect(paramKey, () => {
    const next = untrack(() => ({
      eta: props.draft.eta,
      epochs: props.draft.epochs,
      showBgd: props.draft.showBgd,
    }));
    if (initialSync) {
      initialSync = false;
      return;
    }
    const timer = setTimeout(() => setSettledParams(next), 0);
    return () => clearTimeout(timer);
  });

  const isStale = createMemo(() => {
    const settled = settledParams();
    return (
      settled.eta !== props.draft.eta ||
      settled.epochs !== props.draft.epochs ||
      settled.showBgd !== props.draft.showBgd
    );
  });

  const stepDemo = createMemo(() => singleUpdateDemo(stepPredP(), stepTrueY(), props.draft.eta));

  const run = createMemo(() => {
    const settled = settledParams();
    return trainLogisticRegression({
      trainCount: MAX_SAMPLE_SIZE,
      eta: settled.eta,
      epochs: settled.epochs,
      threshold: 0.5,
      includeTrace: true,
      includeBgd: settled.showBgd,
    });
  });

  const inspectIdx = createMemo(() =>
    Math.max(0, Math.min(run().epochsHistory.length - 1, props.draft.inspectEpoch)),
  );
  const snapshot = createMemo(
    () => run().epochsHistory[inspectIdx()] ?? run().epochsHistory[run().epochsHistory.length - 1],
  );
  const epoch0 = createMemo(() => run().epochsHistory[0]);
  const finalEpoch = createMemo(() => run().epochsHistory[run().epochsHistory.length - 1]);
  const regime = createMemo(() => classifyEtaRegime(props.draft.eta));

  const stats = createMemo(() => {
    const currentRun = run();
    const ep0 = epoch0();
    const fin = finalEpoch();
    const epoch0Correct = ep0 ? ep0.valMetrics.tp + ep0.valMetrics.tn : 0;
    const epoch0Loss = ep0 ? ep0.valLoss : BLIND_GUESS_LOSS;
    const finalCorrect = fin.valMetrics.tp + fin.valMetrics.tn;
    const valTotal = fin.valMetrics.total;
    const epoch0Acc = valTotal > 0 ? epoch0Correct / valTotal : 0;
    const majorityCorrect = Math.round(currentRun.baselineAcc * valTotal);
    const priorSpamRate = clamp(currentRun.trainSpamRate, EPS, 1 - EPS);
    const priorBceLoss =
      valTotal > 0
        ? currentRun.valPredictions.reduce(
            (sum, item) => sum + binaryLogLoss(item.label, priorSpamRate),
            0,
          ) / valTotal
        : BLIND_GUESS_LOSS;
    return {
      epoch0Correct,
      epoch0Loss,
      finalCorrect,
      valTotal,
      epoch0Acc,
      majorityCorrect,
      priorBceLoss,
      beatsAccBaseline: fin.valMetrics.accuracy > currentRun.baselineAcc,
      beatsBceBaseline: fin.valLoss < priorBceLoss,
    };
  });

  const spotlightMsgs = createMemo(() =>
    SPOTLIGHT_VAL_IDS.map((id) => run().valPredictions.find((item) => item.id === id)).filter(
      (item): item is NonNullable<typeof item> => item !== undefined,
    ),
  );

  const logSliderVal = () => Math.log10(Math.max(0.001, Math.min(4.0, props.draft.eta)));
  const trOk = () => finalEpoch().trainLoss <= TRAIN_MAX_TRAIN_LOSS;
  const valOk = () => finalEpoch().valLoss <= TRAIN_MAX_VAL_LOSS;

  const updateEtaFromSlider = (raw: string) => {
    const eta = Number((10 ** Number(raw)).toFixed(4));
    props.onChange({ ...props.draft, eta });
  };

  const updateEpochsFromSlider = (raw: string) => {
    const nextEp = Number(raw);
    props.onChange({
      ...props.draft,
      epochs: nextEp,
      inspectEpoch: Math.min(props.draft.inspectEpoch, nextEp),
    });
  };

  return (
    <div class="logistic-regression-stage-stack">
      <section class="logistic-regression-panel">
        <p class="logistic-regression-old-knowledge">
          联系线性回归：单样本平方误差的梯度是 2×（预测 − 真实）× 输入。逻辑回归使用交叉熵损失，
          梯度为 <MathFormula>{String.raw`(p-y)x_j`}</MathFormula>，其中 p 是预测的垃圾概率，y
          是真实标签。 这一关先观察模型如何用它更新权重；完整求导和单权重切片放在附加挑战里。
        </p>
        <div class="logistic-regression-panel-head">
          <h3>用 1,400 条短信自动训练模型（词表含 {run().vocabSize} 个词）</h3>
          <div class="logistic-regression-preset-row">
            <Show when={isStale()}>
              <span class="logistic-regression-pill is-warn" role="status">
                正在按新参数重新计算…
              </span>
            </Show>
            <span class={`logistic-regression-pill is-regime-${regime().id}`}>
              {regime().label}
            </span>
          </div>
        </div>
        <p class="logistic-regression-data-guide">
          第 3 关手调 8 个词就很费劲，这里有 {run().vocabSize} 个词。训练集的{" "}
          {MAX_SAMPLE_SIZE.toLocaleString("en-US")} 条短信用于更新权重；300
          条验证短信用于比较学习率和轮数，不参与权重更新。训练损失反映对已学短信的拟合程度，
          验证损失帮助判断对未参与训练的短信是否也有效。
        </p>

        <div class="logistic-regression-preset-row">
          <For each={ETA_PRESETS}>
            {(p) => (
              <Button
                class={`logistic-regression-chip-btn${Math.abs(props.draft.eta - p.eta) < 0.0005 ? " is-active" : ""}`}
                onClick={() =>
                  props.onChange({
                    ...props.draft,
                    eta: p.eta,
                    epochs: p.epochs,
                    inspectEpoch: p.epochs,
                  })
                }
                type="button"
              >
                <span>{p.label}</span>
              </Button>
            )}
          </For>
        </div>

        <div class="logistic-regression-controls-grid">
          <div class="logistic-regression-control-card">
            <div class="logistic-regression-control-head">
              <label for="logistic-regression-eta-slider">学习率 η（对数刻度）</label>
              <strong class="logistic-regression-mono">{props.draft.eta.toFixed(4)}</strong>
            </div>
            <input
              id="logistic-regression-eta-slider"
              max={0.699}
              min={-3}
              onChange={(e) => updateEtaFromSlider(e.currentTarget.value)}
              onInput={(e) => updateEtaFromSlider(e.currentTarget.value)}
              step={0.03}
              type="range"
              value={logSliderVal()}
            />
            <p class="logistic-regression-muted-note">{regime().summary}</p>
          </div>

          <div class="logistic-regression-control-card">
            <div class="logistic-regression-control-head">
              <label for="logistic-regression-epochs-slider">训练轮数</label>
              <strong class="logistic-regression-mono">{props.draft.epochs} 轮</strong>
            </div>
            <input
              id="logistic-regression-epochs-slider"
              max={25}
              min={1}
              onChange={(e) => updateEpochsFromSlider(e.currentTarget.value)}
              onInput={(e) => updateEpochsFromSlider(e.currentTarget.value)}
              step={1}
              type="range"
              value={props.draft.epochs}
            />
            <label class="logistic-regression-checkbox-row">
              <Checkbox
                checked={props.draft.showBgd}
                onCheckedChange={(next) =>
                  props.onChange({ ...props.draft, showBgd: next === true })
                }
              >
                <CheckboxIndicator>
                  <Icon name="check" size={12} />
                </CheckboxIndicator>
              </Checkbox>
              <span>同时显示全批量梯度下降（BGD）的曲线</span>
            </label>
            <p class="logistic-regression-muted-note logistic-regression-update-guide">
              每轮读完 1,400 条训练短信。SGD 每读一条就更新一次；BGD 则先对整批短信的梯度取平均，
              每轮只更新一次。同样的轮数，两者的更新次数不同。
            </p>
          </div>
        </div>

        <div aria-label="训练前后验证短信表现对比" class="logistic-regression-before-after">
          <div class="logistic-regression-before-after-head">
            <h4>训练前后对比</h4>
            <span class="logistic-regression-muted-note">
              300 条验证短信中，正常短信占 {(run().baselineAcc * 100).toFixed(1)}%。
            </span>
          </div>
          <div class="logistic-regression-baseline-grid">
            <div class="logistic-regression-stat-box">
              <span>训练前（全 0 权重各猜 50%）</span>
              <strong class="logistic-regression-mono">
                分对 {stats().epoch0Correct} / {stats().valTotal} 条（
                {(stats().epoch0Acc * 100).toFixed(1)}%）
              </strong>
              <small class="logistic-regression-mono">
                BCE Loss {stats().epoch0Loss.toFixed(4)}（p=0.5 按 p≥0.5 全判垃圾）
              </small>
            </div>
            <div class="logistic-regression-stat-box">
              <span>多数类 / 先验基线（不学词 · 按训练集估计）</span>
              <strong class="logistic-regression-mono">
                分对 {stats().majorityCorrect} / {stats().valTotal} 条（
                {(run().baselineAcc * 100).toFixed(1)}%）
              </strong>
              <small class="logistic-regression-mono">
                按训练集垃圾占比 {(run().trainSpamRate * 100).toFixed(1)}% 固定猜：BCE Loss{" "}
                {stats().priorBceLoss.toFixed(4)}（垃圾短信召回率 0%，即全部漏掉）
              </small>
            </div>
            <div
              class={`logistic-regression-stat-box ${stats().beatsAccBaseline && stats().beatsBceBaseline ? "is-ok" : "is-warn"}`}
            >
              <span>
                训练后（第 {finalEpoch().epoch} 轮 · η = {run().eta}）
              </span>
              <strong class="logistic-regression-mono">
                分对 {stats().finalCorrect} / {stats().valTotal} 条（
                {(finalEpoch().valMetrics.accuracy * 100).toFixed(1)}
                %）
              </strong>
              <small class="logistic-regression-mono">
                准确率：{stats().beatsAccBaseline ? "已超过" : "未超过"}{" "}
                {(run().baselineAcc * 100).toFixed(1)}% 多数类基线
              </small>
              <small class="logistic-regression-mono">
                BCE Loss {stats().epoch0Loss.toFixed(4)} → {finalEpoch().valLoss.toFixed(4)}（
                {stats().beatsBceBaseline ? "优于" : "高于"}训练集固定先验基线{" "}
                {stats().priorBceLoss.toFixed(4)}）
              </small>
            </div>
          </div>
          <Show when={spotlightMsgs().length > 0}>
            <ul class="logistic-regression-spotlight-list">
              <For each={spotlightMsgs()}>
                {(item) => {
                  const isRight = item.pred === item.label;
                  return (
                    <li class="logistic-regression-spotlight-row">
                      <span
                        class={`logistic-regression-pill ${item.label === 1 ? "is-danger" : "is-success"}`}
                      >
                        真实：{item.label === 1 ? "垃圾" : "正常"}
                      </span>
                      <span class="logistic-regression-spotlight-text">{item.text}</span>
                      <span
                        class={`logistic-regression-mono logistic-regression-spotlight-prob ${isRight ? "is-ok" : "is-bad"}`}
                      >
                        50.0% → {(item.probability * 100).toFixed(1)}%（
                        {isRight ? "判对了" : item.pred === 1 ? "误拦" : "漏报"}）
                      </span>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </div>

        <div class="logistic-regression-target-strip">
          <div class={`logistic-regression-stat-box ${trOk() ? "is-ok" : "is-warn"}`}>
            <span>最终训练损失（目标 ≤ {TRAIN_MAX_TRAIN_LOSS}）</span>
            <strong class="logistic-regression-mono">{finalEpoch().trainLoss.toFixed(4)}</strong>
          </div>
          <div class={`logistic-regression-stat-box ${valOk() ? "is-ok" : "is-warn"}`}>
            <span>最终验证损失（目标 ≤ {TRAIN_MAX_VAL_LOSS}）</span>
            <strong class="logistic-regression-mono">{finalEpoch().valLoss.toFixed(4)}</strong>
          </div>
          <div class="logistic-regression-stat-box">
            <span>当前查看：第 {snapshot().epoch} 轮</span>
            <strong class="logistic-regression-mono">
              验证损失 {snapshot().valLoss.toFixed(3)} · 偏置 {snapshot().bias.toFixed(2)}
            </strong>
          </div>
        </div>

        <p class="logistic-regression-muted-note">
          修改训练参数后，程序会自动重新训练。下面只回放已有结果，不改变最终提交的模型。
        </p>
        <div class="logistic-regression-scrubber-row">
          <label for="logistic-regression-epoch-scrubber">
            回放第 <strong class="logistic-regression-mono">{snapshot().epoch}</strong>{" "}
            轮结束时，各个词的权重：
          </label>
          <input
            id="logistic-regression-epoch-scrubber"
            max={run().epochsHistory.length - 1}
            min={0}
            onChange={(e) =>
              props.onChange({ ...props.draft, inspectEpoch: Number(e.currentTarget.value) })
            }
            onInput={(e) =>
              props.onChange({ ...props.draft, inspectEpoch: Number(e.currentTarget.value) })
            }
            step={1}
            type="range"
            value={inspectIdx()}
          />
        </div>

        <LossChartSvg
          bgdHistory={run().bgdHistory}
          history={run().epochsHistory}
          inspectEpoch={inspectIdx()}
          intraTrace={run().intraEpochTrace}
          onSelectEpoch={(ep) => props.onChange({ ...props.draft, inspectEpoch: ep })}
          showBgd={settledParams().showBgd}
        />
        <ExperimentComparison
          metrics={[
            {
              id: "train-loss",
              label: "最终训练损失",
              value: finalEpoch().trainLoss,
              display: finalEpoch().trainLoss.toFixed(4),
            },
            {
              id: "val-loss",
              label: "最终验证损失",
              value: finalEpoch().valLoss,
              display: finalEpoch().valLoss.toFixed(4),
            },
          ]}
          parameters={[
            { id: "eta", label: "学习率", value: run().eta, display: String(run().eta) },
            { id: "epochs", label: "训练轮数", value: run().epochs, display: `${run().epochs} 轮` },
          ]}
        />
      </section>

      <WeightSpectrum
        heading={`第 ${snapshot().epoch} 轮权重较大的词`}
        topHam={snapshot().topHam}
        topSpam={snapshot().topSpam}
        trainCount={run().trainCount}
      />

      <section class="logistic-regression-panel logistic-regression-step-micro">
        <div class="logistic-regression-panel-head">
          <h3>一条短信如何更新权重</h3>
          <span class="logistic-regression-mono logistic-regression-muted-note">
            <MathFormula>{String.raw`\Delta w_j=-\eta\,(p-y)\,x_j`}</MathFormula>
          </span>
        </div>
        <div class="logistic-regression-micro-controls">
          <SegmentedControl<"1" | "0">
            aria-label="选择真实标签"
            class="logistic-regression-segmented"
            onValueChange={(next) => {
              if (next === "1" || next === "0") setStepTrueY(next === "1" ? 1 : 0);
            }}
            value={stepTrueY() === 1 ? "1" : "0"}
          >
            <SegmentedControlItem value="1">垃圾短信（y = 1）</SegmentedControlItem>
            <SegmentedControlItem value="0">正常短信（y = 0）</SegmentedControlItem>
          </SegmentedControl>
          <label class="logistic-regression-inline-slider">
            <span>
              模型预测的垃圾概率 p ={" "}
              <strong class="logistic-regression-mono">{stepPredP().toFixed(2)}</strong>
            </span>
            <input
              max={0.98}
              min={0.02}
              onChange={(e) => setStepPredP(Number(e.currentTarget.value))}
              onInput={(e) => setStepPredP(Number(e.currentTarget.value))}
              step={0.02}
              type="range"
              value={stepPredP()}
            />
          </label>
        </div>
        <div class="logistic-regression-micro-metrics">
          <div class="logistic-regression-stat-box">
            <span>交叉熵损失</span>
            <strong class="logistic-regression-mono">{stepDemo().loss.toFixed(3)}</strong>
            <small>
              {stepDemo().loss > 1.2
                ? "模型对真实标签的预测概率较低"
                : "真实标签的预测概率越高，损失越小"}
            </small>
          </div>
          <div class="logistic-regression-stat-box">
            <span>
              偏差信号 <MathFormula>p-y</MathFormula>
            </span>
            <strong class="logistic-regression-mono">
              {stepDemo().errorSignal >= 0 ? "+" : ""}
              {stepDemo().errorSignal.toFixed(2)}
            </strong>
            <small>{stepTrueY() === 1 ? "低估了垃圾概率" : "高估了垃圾概率"}</small>
          </div>
          <div class="logistic-regression-stat-box">
            <span>
              出现词的权重改变量（<MathFormula>x_j=1</MathFormula>）
            </span>
            <strong
              class={`logistic-regression-mono ${stepDemo().deltaW >= 0 ? "is-pos" : "is-neg"}`}
            >
              {stepDemo().deltaW >= 0 ? "+" : ""}
              {stepDemo().deltaW.toFixed(4)}
            </strong>
            <small>
              {stepDemo().direction === "up"
                ? "模型会增加本条短信中各个词的权重"
                : stepDemo().direction === "down"
                  ? "模型会减少本条短信中各个词的权重"
                  : "预测值等于标签，权重不变"}
            </small>
          </div>
        </div>
        <SingleStepPenaltyVisual
          deltaW={stepDemo().deltaW}
          eta={props.draft.eta}
          loss={stepDemo().loss}
          predP={stepPredP()}
          trueY={stepTrueY()}
        />
        <p class="logistic-regression-muted-note">
          代入上面的预测 p 和真实标签 y，就能算出这一条短信出现过的词要增加还是减少权重。
          想追到导数怎么来、不同权重为什么有不同坡度，可以进入附加挑战「梯度维修台」继续拆解。
        </p>
      </section>

      <div class="logistic-regression-submit-bar">
        <Button
          class="button button-primary"
          disabled={props.submitting || isStale()}
          onClick={() => props.onSubmit()}
          type="button"
        >
          {props.submitting
            ? "判题中…"
            : isStale()
              ? "正在重新计算…"
              : `提交第 ${props.stage.index} 关判定`}
        </Button>
        <Show when={isStale()}>
          <span class="logistic-regression-muted-note">
            正在按新参数重新计算模型，完成后即可提交。
          </span>
        </Show>
      </div>

      <JudgeVerdictCard
        hasNextStage={props.hasNextStage}
        onNextStage={props.onNextStage}
        passed={props.passed}
        summary={props.result}
      />
      <Show when={props.passed}>
        <Button class="button button-ghost" onClick={() => props.onBonusStage()} type="button">
          可选挑战：揭开引擎盖，亲手写 4 行梯度下降 ↗
        </Button>
      </Show>
    </div>
  );
}
