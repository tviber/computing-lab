import { Button } from "@ui-sdk/solid/button";
import { createMemo, For, Show } from "solid-js";
import { MathFormula } from "../../../shared/ui/MathFormula";
import { SegmentedPicker } from "../../../shared/ui/SegmentedPicker";
import type { LogisticRegressionTestSummary, StrategyDraft } from "../domain/protocol.ts";
import type { LogisticRegressionStageDef } from "../domain/stages.ts";
import {
  clampStrategyWeight,
  evaluateStrategyWeights,
  STRATEGY_SCORE_SPAM_THRESHOLD,
  STRATEGY_WEIGHT_TIERS,
  STRATEGY_WORDS,
} from "../domain/strategy.ts";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";

function fmtSigned(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function roleMeta(weight: number): { label: string; cls: string } {
  if (weight > 0) return { label: "偏垃圾", cls: "is-pos" };
  if (weight < 0) return { label: "偏正常", cls: "is-neg" };
  return { label: "无关", cls: "is-zero" };
}

function scoreBarStyle(score: number): { left: string; width: string; cls: string } {
  const clamped = Math.max(-6, Math.min(6, score));
  const pctFromZero = (Math.abs(clamped) / 6) * 50;
  if (clamped >= 0) {
    return {
      left: "50%",
      width: `${pctFromZero.toFixed(1)}%`,
      cls: clamped >= STRATEGY_SCORE_SPAM_THRESHOLD ? "is-spam" : "is-warn",
    };
  }
  return {
    left: `${(50 - pctFromZero).toFixed(1)}%`,
    width: `${pctFromZero.toFixed(1)}%`,
    cls: "is-ham",
  };
}

export function StrategyPanel(props: {
  stage: LogisticRegressionStageDef;
  draft: StrategyDraft;
  passed: boolean;
  result: LogisticRegressionTestSummary | null;
  submitting: boolean;
  hasNextStage: boolean;
  onChange: (draft: StrategyDraft) => void;
  onSubmit: () => void;
  onNextStage: () => void;
}) {
  const evalResult = createMemo(() => evaluateStrategyWeights(props.draft.weights));
  const example = createMemo(() => evalResult().items[0]);
  const allConceptsDone = createMemo(() =>
    props.stage.prompts.every((p) => props.draft.concepts[p.id] === p.correct),
  );

  const updateWeight = (word: string, nextVal: number) => {
    props.onChange({
      ...props.draft,
      weights: { ...props.draft.weights, [word]: clampStrategyWeight(nextVal) },
    });
  };

  const resetWeights = () => {
    const zeroW: Record<string, number> = {};
    for (const w of STRATEGY_WORDS) zeroW[w] = 0;
    props.onChange({ ...props.draft, weights: zeroW });
  };

  const scoreTerms = createMemo(() =>
    example()
      .contributions.filter((term) => term.present === 1)
      .map((term) => String.raw`\text{${term.word}}(${fmtSigned(term.weight)})\times 1`),
  );

  return (
    <div class="logistic-regression-stage-stack">
      <div class="logistic-regression-score-layout">
        <section class="logistic-regression-panel">
          <div class="logistic-regression-panel-head">
            <h3>词语权重</h3>
            <Button class="button button-ghost" onClick={resetWeights} type="button">
              全部清零
            </Button>
          </div>
          <p class="logistic-regression-rule-strip">
            出现 = 1 · 未出现 = 0 · 重复词仍 = 1 · 标点 / 未登录词 = 0
          </p>
          <p class="logistic-regression-muted-note">
            垃圾短信里更常见的词给正分，正常短信里更常见的词给负分。难以区分的词可以设为 0。
            程序把短信中出现的词的分值相加，总分达到 +{STRATEGY_SCORE_SPAM_THRESHOLD} 就拦截。
          </p>

          <div class="logistic-regression-strategy-list">
            <For each={STRATEGY_WORDS}>
              {(word) => {
                const val = () => clampStrategyWeight(props.draft.weights[word] ?? 0);
                const role = () => roleMeta(val());
                return (
                  <div class="logistic-regression-strategy-row">
                    <div class="logistic-regression-strategy-word">
                      <span class="logistic-regression-strategy-word-text">{word}</span>
                      <span class={`logistic-regression-strategy-role ${role().cls}`}>
                        {role().label}
                      </span>
                    </div>
                    <SegmentedPicker
                      class="logistic-regression-tier-group"
                      itemClass="logistic-regression-tier-btn"
                      label={`${word} 倾向设置`}
                      onChange={(next) => updateWeight(word, Number(next))}
                      options={STRATEGY_WEIGHT_TIERS.map((tier) => ({
                        value: String(tier.value),
                        label: tier.label,
                        class: `is-${tier.role}`,
                      }))}
                      value={String(val())}
                    />
                  </div>
                );
              }}
            </For>
          </div>
        </section>

        <section class="logistic-regression-panel">
          <div class="logistic-regression-panel-head">
            <h3 id="logistic-regression-strategy-results">6 条短信的分类结果</h3>
            <span
              class={`logistic-regression-pill ${evalResult().correctCount === evalResult().totalCount ? "is-success" : "is-warn"}`}
            >
              判对 {evalResult().correctCount} / {evalResult().totalCount}
            </span>
          </div>
          <ul
            aria-labelledby="logistic-regression-strategy-results"
            class="logistic-regression-triage-list"
            role="list"
          >
            <For each={evalResult().items} keyed={(item) => item.message.id}>
              {(item) => {
                const bar = () => scoreBarStyle(item().score);
                return (
                  <li class={`logistic-regression-triage-card${item().ok ? "" : " is-wrong"}`}>
                    <div class="logistic-regression-triage-top">
                      <span
                        class={`logistic-regression-pill ${item().message.label === 1 ? "is-danger" : "is-success"}`}
                      >
                        标签 {item().message.label === 1 ? "垃圾" : "正常"}（{item().message.tag}）
                      </span>
                      <span
                        class={`logistic-regression-mono logistic-regression-triage-prob ${item().ok ? "is-ok" : "is-bad"}`}
                      >
                        {item().ok
                          ? item().pred === 1
                            ? "正确拦截"
                            : "正确放行"
                          : item().pred === 1
                            ? "误拦"
                            : "漏拦"}
                      </span>
                    </div>
                    <p class="logistic-regression-triage-text">{item().message.text}</p>
                    <div class="logistic-regression-strategy-meter-row">
                      <span class="logistic-regression-mono logistic-regression-strategy-score-tag">
                        <MathFormula>{String.raw`w\cdot x = ${fmtSigned(item().score)}`}</MathFormula>
                      </span>
                      <div aria-hidden="true" class="logistic-regression-strategy-meter">
                        <span class="logistic-regression-strategy-meter-zero" />
                        <div
                          class={`logistic-regression-strategy-meter-fill ${bar().cls}`}
                          style={{ left: bar().left, width: bar().width }}
                        />
                        <span
                          class="logistic-regression-strategy-meter-cut"
                          title={`拦截线 +${STRATEGY_SCORE_SPAM_THRESHOLD}`}
                        />
                      </div>
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
        </section>
      </div>

      <section class="logistic-regression-panel">
        <div class="logistic-regression-panel-head">
          <h3>第一条短信的算分过程</h3>
          <span
            class={`logistic-regression-pill ${example().pred === 1 ? "is-danger" : "is-success"}`}
          >
            {example().pred === 1 ? "拦截" : "放行"}
          </span>
        </div>

        <div class="logistic-regression-strategy-matrix-wrap">
          <table class="logistic-regression-strategy-matrix">
            <thead>
              <tr>
                <th scope="row">词表 10 词</th>
                <For each={example().contributions} keyed={(c) => c.word}>
                  {(c) => <th scope="col">{c().word}</th>}
                </For>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  是否出现 <MathFormula>x_i</MathFormula>
                </th>
                <For each={example().contributions} keyed={(c) => c.word}>
                  {(c) => (
                    <td
                      class={`logistic-regression-mono ${c().present === 1 ? "is-hit" : "is-miss"}`}
                    >
                      {c().present}
                    </td>
                  )}
                </For>
              </tr>
              <tr>
                <th scope="row">
                  设定分值 <MathFormula>w_i</MathFormula>
                </th>
                <For each={example().contributions} keyed={(c) => c.word}>
                  {(c) => (
                    <td
                      class={`logistic-regression-mono ${c().weight > 0 ? "is-pos" : c().weight < 0 ? "is-neg" : "is-zero"}`}
                    >
                      {fmtSigned(c().weight)}
                    </td>
                  )}
                </For>
              </tr>
              <tr>
                <th scope="row">
                  单项得分 <MathFormula>{String.raw`w_i\cdot x_i`}</MathFormula>
                </th>
                <For each={example().contributions} keyed={(c) => c.word}>
                  {(c) => (
                    <td
                      class={`logistic-regression-mono ${
                        c().contribution > 0
                          ? "is-pos"
                          : c().contribution < 0
                            ? "is-neg"
                            : "is-zero"
                      }`}
                    >
                      {c().present === 0 ? "0" : fmtSigned(c().contribution)}
                    </td>
                  )}
                </For>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="logistic-regression-strategy-formula">
          <p class="logistic-regression-mono">
            <MathFormula>{String.raw`w\cdot x = ${scoreTerms().join(" + ") || "0"} = ${fmtSigned(example().score)}`}</MathFormula>
          </p>
          <p class="logistic-regression-muted-note">
            这里直接用总分分类。第 3 关会用 Sigmoid 函数，根据分数估计垃圾短信的概率。
          </p>
        </div>
      </section>

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
