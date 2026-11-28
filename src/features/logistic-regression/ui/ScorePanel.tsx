import { Button } from "@ui-sdk/solid/button";
import { createMemo, For, Show } from "solid-js";
import { LabeledSlider } from "../../../shared/ui/LabeledSlider";
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
import { inspectCorpusMessageWithModel } from "../domain/tokenizer.ts";
import { defaultScoreDraft } from "../lesson/state.ts";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";
import { MessageProbeCard } from "./MessageProbeCard.tsx";

type SigmoidPlotItem = {
  item: ManualEvalItem;
  tag: string;
};

const W = 440;
const H = 175;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 24;
const Z_MIN = -6;
const Z_MAX = 6;
const PROB_TICKS = [0, 0.5, 1] as const;
const Z_TICKS = [-6, -3, 0, 3, 6] as const;

const xOfZ = (z: number) => {
  const c = Math.max(Z_MIN, Math.min(Z_MAX, z));
  return PAD_L + ((c - Z_MIN) / (Z_MAX - Z_MIN)) * (W - PAD_L - PAD_R);
};
const yOfP = (p: number) => H - PAD_B - p * (H - PAD_T - PAD_B);

const CURVE_POINTS = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const z = Z_MIN + ((Z_MAX - Z_MIN) * i) / 48;
    pts.push(`${xOfZ(z).toFixed(1)},${yOfP(sigmoid(z)).toFixed(1)}`);
  }
  return pts.join(" ");
})();

function SigmoidCurveSvg(props: {
  bias: number;
  emptyProb: number;
  items: readonly SigmoidPlotItem[];
  selectedId: string;
  selectedZ: number;
  selectedProb: number;
  selectedTag: string;
  onSelectMsg: (id: string) => void;
}) {
  const bx = () => xOfZ(props.bias);
  const by = () => yOfP(props.emptyProb);
  const mx = () => xOfZ(props.selectedZ);
  const my = () => yOfP(props.selectedProb);

  const sortedPlaced = createMemo(() => {
    const placed = props.items.map((entry, idx) => {
      const cx = xOfZ(entry.item.rawZ);
      const cy = yOfP(entry.item.probability);
      let slot = 0;
      let groupCount = 0;
      for (let j = 0; j < props.items.length; j++) {
        const ox = xOfZ(props.items[j].item.rawZ);
        const oy = yOfP(props.items[j].item.probability);
        if (Math.hypot(cx - ox, cy - oy) < 9) {
          if (j < idx) slot++;
          groupCount++;
        }
      }
      const offsetY = groupCount > 1 ? (slot - (groupCount - 1) / 2) * 8 : 0;
      return { ...entry, cx, cy: Math.max(PAD_T + 4, Math.min(H - PAD_B - 4, cy + offsetY)) };
    });

    return [...placed].sort((a, b) => {
      if (a.item.id === props.selectedId) return 1;
      if (b.item.id === props.selectedId) return -1;
      return 0;
    });
  });

  return (
    <div class="logistic-regression-sigmoid-box">
      <div class="logistic-regression-chart-head">
        <h4>6 条短信的分数与概率</h4>
        <div class="logistic-regression-legend">
          <span class="logistic-regression-leg-item">
            <i class="logistic-regression-leg-swatch is-val" /> 概率曲线
          </span>
          <span class="logistic-regression-leg-item">
            <i class="logistic-regression-leg-dot is-spam-dot" /> 真实垃圾
          </span>
          <span class="logistic-regression-leg-item">
            <i class="logistic-regression-leg-dot is-ham-dot" /> 真实正常
          </span>
          <span class="logistic-regression-leg-item">
            <i class="logistic-regression-leg-dot is-bias" /> 只看偏置 b
          </span>
        </div>
      </div>
      <p class="logistic-regression-muted-note">
        垃圾短信的预测概率应达到 50%，正常短信应低于 50%。调整偏置会平移所有短信的分数。
        点击圆点可查看该条短信。
      </p>
      <svg
        aria-label="Sigmoid 曲线与当前模型定位"
        class="logistic-regression-svg-chart"
        viewBox={`0 0 ${W} ${H}`}
      >
        <For each={PROB_TICKS}>
          {(p) => (
            <g>
              <line
                stroke={p === 0.5 ? "var(--danger)" : "var(--border)"}
                stroke-dasharray={p === 0.5 ? "4 3" : undefined}
                stroke-width={p === 0.5 ? "1.1" : "0.8"}
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yOfP(p)}
                y2={yOfP(p)}
              />
              <text
                fill="var(--muted)"
                font-size="9.5"
                text-anchor="end"
                x={PAD_L - 5}
                y={yOfP(p) + 3}
              >
                {Math.round(p * 100)}%
              </text>
            </g>
          )}
        </For>

        <line
          stroke="var(--border)"
          stroke-dasharray="3 3"
          stroke-width="1"
          x1={xOfZ(0)}
          x2={xOfZ(0)}
          y1={PAD_T}
          y2={H - PAD_B}
        />

        <For each={Z_TICKS}>
          {(z) => (
            <text fill="var(--muted)" font-size="9.5" text-anchor="middle" x={xOfZ(z)} y={H - 7}>
              {z > 0 ? `+${z}` : z}
            </text>
          )}
        </For>

        <polyline fill="none" points={CURVE_POINTS} stroke="var(--accent)" stroke-width="2.4" />

        <line
          stroke="var(--accent)"
          stroke-dasharray="2.5 2.5"
          stroke-width="1"
          x1={mx()}
          x2={mx()}
          y1={my()}
          y2={H - PAD_B}
        />

        <polygon
          fill="var(--surface)"
          points={`${bx()},${by() - 5.5} ${bx() + 5.5},${by()} ${bx()},${by() + 5.5} ${bx() - 5.5},${by()}`}
          stroke="var(--primary)"
          stroke-width="1.8"
        >
          <title>{`所有词都不在词表中时：z = b = ${props.bias.toFixed(1)}, σ(b) = ${(props.emptyProb * 100).toFixed(1)}%`}</title>
        </polygon>

        <For each={sortedPlaced()}>
          {(entry) => {
            const isSelected = () => entry.item.id === props.selectedId;
            const fill = entry.item.label === 1 ? "var(--danger)" : "var(--success)";
            return (
              <g onClick={() => props.onSelectMsg(entry.item.id)} style={{ cursor: "pointer" }}>
                <Show
                  fallback={
                    <Show when={!entry.item.correct}>
                      <circle
                        cx={entry.cx}
                        cy={entry.cy}
                        fill="none"
                        r="7"
                        stroke="var(--warning)"
                        stroke-dasharray="2 2"
                        stroke-width="1.4"
                      />
                    </Show>
                  }
                  when={isSelected()}
                >
                  <circle
                    cx={entry.cx}
                    cy={entry.cy}
                    fill="none"
                    r="8.5"
                    stroke="var(--accent)"
                    stroke-width="2"
                  />
                </Show>
                <circle
                  cx={entry.cx}
                  cy={entry.cy}
                  fill={fill}
                  r={isSelected() ? "5.2" : "4.5"}
                  stroke="var(--surface)"
                  stroke-width="1.5"
                >
                  <title>{`${entry.tag}（真实：${entry.item.label === 1 ? "垃圾" : "正常"}）：z = ${entry.item.rawZ.toFixed(2)}, p = ${(entry.item.probability * 100).toFixed(1)}% · ${entry.item.correct ? "判对了" : "分错了"}`}</title>
                </circle>
              </g>
            );
          }}
        </For>
      </svg>
      <p class="logistic-regression-muted-note">
        只看偏置时，
        <MathFormula>{`z=b=${props.bias >= 0 ? "+" : ""}${props.bias.toFixed(1)}`}</MathFormula>{" "}
        对应 <strong>{(props.emptyProb * 100).toFixed(1)}%</strong>；选中「{props.selectedTag}」
        <MathFormula>{`z=${props.selectedZ >= 0 ? "+" : ""}${props.selectedZ.toFixed(2)}`}</MathFormula>{" "}
        → <strong>{(props.selectedProb * 100).toFixed(1)}%</strong>
      </p>
    </div>
  );
}

export function ScorePanel(props: {
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
  const fullTrainVocab = getPublicCorpus().fullTrainVocab;

  const evalSummary = createMemo(() =>
    evaluateManualWeights(props.draft.weights, props.draft.bias, SCORE_CALIBRATION_SMS, 0.5),
  );

  const selectedSms = createMemo(
    () =>
      SCORE_CALIBRATION_SMS.find((m) => m.id === props.draft.selectedMsgId) ??
      SCORE_CALIBRATION_SMS[0],
  );

  const weightMap = createMemo(() => {
    const m = new Map<string, number>();
    for (const [k, v] of Object.entries(props.draft.weights)) m.set(k, v);
    return m;
  });

  const inspection = createMemo(() =>
    inspectCorpusMessageWithModel(
      selectedSms(),
      weightMap(),
      props.draft.bias,
      fullTrainVocab,
      0.5,
    ),
  );

  const plotItems = createMemo(() =>
    evalSummary().items.map((item, idx) => ({
      item,
      tag: SCORE_CALIBRATION_SMS[idx]?.tag ?? item.id,
    })),
  );

  const allConceptsDone = createMemo(() =>
    props.stage.prompts.every((p) => props.draft.concepts[p.id] === p.correct),
  );

  const resetToBlacklistStarter = () => {
    const starter = defaultScoreDraft();
    props.onChange({
      ...props.draft,
      weights: starter.weights,
      bias: starter.bias,
    });
  };

  const handleBiasUpdate = (nextBias: number) => {
    props.onChange({ ...props.draft, bias: nextBias });
  };

  const handleWordUpdate = (word: string, nextVal: number) => {
    props.onChange({
      ...props.draft,
      weights: { ...props.draft.weights, [word]: nextVal },
    });
  };

  return (
    <div class="logistic-regression-stage-stack">
      <div class="logistic-regression-score-layout">
        <section class="logistic-regression-panel">
          <p class="logistic-regression-bridge-note">
            联系前面的复习时长例子：先把输入算成分数 <MathFormula>{String.raw`z`}</MathFormula>
            ，再交给 Sigmoid 转成概率。 这里把单个输入扩展为多个词的 0/1 特征，分数是{" "}
            <MathFormula>{String.raw`z=w\cdot x+b`}</MathFormula>。
          </p>
          <div class="logistic-regression-panel-head">
            <h3>权重与偏置</h3>
            <Button class="button button-ghost" onClick={resetToBlacklistStarter} type="button">
              恢复起点预设
            </Button>
          </div>
          <p class="logistic-regression-muted-note">
            起始模型只给广告常用词设置了正权重，偏置是 <MathFormula>b=+0.4</MathFormula>。
            因此，即使短信里没有已知词，模型估计的垃圾概率也超过 50%。你可以先调低
            <strong>
              偏置 <MathFormula>{String.raw`b`}</MathFormula>
            </strong>
            ，再给「同学」「明天」「一起」设置负权重，检查正常短信能否分对。
          </p>

          <LabeledSlider
            class="logistic-regression-slider-row is-bias"
            label={
              <>
                <strong>
                  偏置 <MathFormula>{String.raw`b`}</MathFormula>
                </strong>
                <small>
                  没有已知词时的垃圾概率：{(evalSummary().emptyProbability * 100).toFixed(1)}%
                </small>
              </>
            }
            max={MAX_MANUAL_BIAS}
            min={MIN_MANUAL_BIAS}
            onChange={handleBiasUpdate}
            step={0.2}
            value={props.draft.bias}
            valueClass={props.draft.bias < 0 ? "is-neg" : "is-pos"}
            valueText={`${props.draft.bias >= 0 ? "+" : ""}${props.draft.bias.toFixed(1)}`}
          />

          <div class="logistic-regression-sliders-grid">
            <For each={SCORE_WORDS}>
              {(word) => {
                const val = () => props.draft.weights[word] ?? 0;
                return (
                  <LabeledSlider
                    label={word}
                    max={MAX_MANUAL_WEIGHT}
                    min={MIN_MANUAL_WEIGHT}
                    onChange={(next) => handleWordUpdate(word, next)}
                    step={0.2}
                    value={val()}
                    valueClass={val() > 0 ? "is-pos" : val() < 0 ? "is-neg" : ""}
                    valueText={`${val() >= 0 ? "+" : ""}${val().toFixed(1)}`}
                  />
                );
              }}
            </For>
          </div>
        </section>

        <section class="logistic-regression-panel">
          <div class="logistic-regression-panel-head">
            <h3>6 条短信的预测结果</h3>
            <span
              class={`logistic-regression-pill ${evalSummary().correctCount === SCORE_CALIBRATION_SMS.length ? "is-success" : "is-warn"}`}
            >
              分对 {evalSummary().correctCount} / {SCORE_CALIBRATION_SMS.length}
            </span>
          </div>

          <SigmoidCurveSvg
            bias={props.draft.bias}
            emptyProb={evalSummary().emptyProbability}
            items={plotItems()}
            onSelectMsg={(selectedMsgId) => props.onChange({ ...props.draft, selectedMsgId })}
            selectedId={selectedSms().id}
            selectedProb={inspection().probability}
            selectedTag={selectedSms().tag}
            selectedZ={inspection().rawZ}
          />

          <ul class="logistic-regression-triage-list">
            <For each={SCORE_CALIBRATION_SMS}>
              {(msg, i) => {
                const ev = () => evalSummary().items[i()];
                const isSelected = () => msg.id === selectedSms().id;
                return (
                  <li>
                    <Button
                      class={`logistic-regression-triage-card${isSelected() ? " is-selected" : ""} ${ev().correct ? "is-ok" : "is-wrong"}`}
                      onClick={() => props.onChange({ ...props.draft, selectedMsgId: msg.id })}
                      type="button"
                    >
                      <div class="logistic-regression-triage-top">
                        <span
                          class={`logistic-regression-pill ${msg.label === 1 ? "is-danger" : "is-success"}`}
                        >
                          真实：{msg.label === 1 ? "垃圾" : "正常"}（{msg.tag}）
                        </span>
                        <span
                          class={`logistic-regression-mono logistic-regression-triage-prob ${ev().correct ? "is-ok" : "is-bad"}`}
                        >
                          <MathFormula>{String.raw`p = ${(ev().probability * 100).toFixed(1)}\%`}</MathFormula>{" "}
                          ·{" "}
                          {ev().correct
                            ? "判对了"
                            : ev().pred === 1
                              ? "误拦了正常短信"
                              : "漏掉了垃圾短信"}
                        </span>
                      </div>
                      <p class="logistic-regression-triage-text">{msg.text}</p>
                    </Button>
                  </li>
                );
              }}
            </For>
          </ul>
        </section>
      </div>

      <MessageProbeCard
        inspection={inspection()}
        threshold={0.5}
        title={`当前选中的短信拆解：${selectedSms().tag}`}
        trueLabel={selectedSms().label}
      />

      <ConceptChecklist
        answers={props.draft.concepts}
        onSelectCorrect={(promptId, optionIndex) =>
          props.onChange({
            ...props.draft,
            concepts: { ...props.draft.concepts, [promptId]: optionIndex },
          })
        }
        prompts={props.stage.prompts}
      />

      <div class="logistic-regression-submit-bar">
        <Button
          class="button button-primary"
          disabled={props.submitting || !allConceptsDone()}
          onClick={() => props.onSubmit()}
          type="button"
        >
          {props.submitting ? "判题中…" : `提交第 ${props.stage.index} 关判定`}
        </Button>
        <Show when={!allConceptsDone()}>
          <span class="logistic-regression-muted-note">请先完成上方的概念题，再提交检查。</span>
        </Show>
      </div>

      <JudgeVerdictCard
        hasNextStage={props.hasNextStage}
        onNextStage={props.onNextStage}
        passed={props.passed}
        summary={props.result}
      />
    </div>
  );
}
