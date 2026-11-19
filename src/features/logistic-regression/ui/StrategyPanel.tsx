import { useMemo } from "react";
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

export function StrategyPanel({
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
  draft: StrategyDraft;
  passed: boolean;
  result: LogisticRegressionTestSummary | null;
  submitting: boolean;
  hasNextStage: boolean;
  onChange: (draft: StrategyDraft) => void;
  onSubmit: () => void;
  onNextStage: () => void;
}) {
  const evalResult = useMemo(() => evaluateStrategyWeights(draft.weights), [draft.weights]);

  const example = evalResult.items[0];

  const allConceptsDone = stage.prompts.every((p) => draft.concepts[p.id] === p.correct);

  const updateWeight = (word: string, nextVal: number) => {
    onChange({
      ...draft,
      weights: { ...draft.weights, [word]: clampStrategyWeight(nextVal) },
    });
  };

  const resetWeights = () => {
    const zeroW: Record<string, number> = {};
    for (const w of STRATEGY_WORDS) zeroW[w] = 0;
    onChange({ ...draft, weights: zeroW });
  };

  const activeTerms = example.contributions.filter((c) => c.present === 1);

  return (
    <div className="logistic-regression-stage-stack">
      <div className="logistic-regression-score-layout">
        <section className="logistic-regression-panel">
          <div className="logistic-regression-panel-head">
            <h3>词语权重</h3>
            <button className="button button-ghost" onClick={resetWeights} type="button">
              全部清零
            </button>
          </div>
          <p className="logistic-regression-muted-note">
            垃圾短信里更常见的词给正分，正常短信里更常见的词给负分。难以区分的词可以设为 0。
            程序把短信中出现的词的分值相加，总分达到 +{STRATEGY_SCORE_SPAM_THRESHOLD} 就拦截。
          </p>

          <div className="logistic-regression-strategy-list">
            {STRATEGY_WORDS.map((word) => {
              const val = clampStrategyWeight(draft.weights[word] ?? 0);
              const role = roleMeta(val);
              return (
                <div className="logistic-regression-strategy-row" key={word}>
                  <div className="logistic-regression-strategy-word">
                    <span className="logistic-regression-strategy-word-text">{word}</span>
                    <span className={`logistic-regression-strategy-role ${role.cls}`}>
                      {role.label}
                    </span>
                  </div>
                  <div
                    aria-label={`${word} 倾向设置`}
                    className="logistic-regression-tier-group"
                    role="group"
                  >
                    {STRATEGY_WEIGHT_TIERS.map((tier) => {
                      const active = val === tier.value;
                      return (
                        <button
                          aria-pressed={active}
                          className={`logistic-regression-tier-btn is-${tier.role}${active ? " is-active" : ""}`}
                          key={tier.value}
                          onClick={() => updateWeight(word, tier.value)}
                          type="button"
                        >
                          {tier.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="logistic-regression-panel">
          <div className="logistic-regression-panel-head">
            <h3 id="logistic-regression-strategy-results">6 条短信的分类结果</h3>
            <span
              className={`logistic-regression-pill ${evalResult.correctCount === evalResult.totalCount ? "is-success" : "is-warn"}`}
            >
              判对 {evalResult.correctCount} / {evalResult.totalCount}
            </span>
          </div>
          <ul
            aria-labelledby="logistic-regression-strategy-results"
            className="logistic-regression-triage-list"
            role="list"
          >
            {evalResult.items.map((item) => {
              const bar = scoreBarStyle(item.score);
              return (
                <li
                  className={`logistic-regression-triage-card${item.ok ? "" : " is-wrong"}`}
                  key={item.message.id}
                >
                  <div className="logistic-regression-triage-top">
                    <span
                      className={`logistic-regression-pill ${item.message.label === 1 ? "is-danger" : "is-success"}`}
                    >
                      标签 {item.message.label === 1 ? "垃圾" : "正常"}（{item.message.tag}）
                    </span>
                    <span
                      className={`logistic-regression-mono logistic-regression-triage-prob ${item.ok ? "is-ok" : "is-bad"}`}
                    >
                      {item.ok
                        ? item.pred === 1
                          ? "正确拦截"
                          : "正确放行"
                        : item.pred === 1
                          ? "误拦"
                          : "漏拦"}
                    </span>
                  </div>
                  <p className="logistic-regression-triage-text">{item.message.text}</p>
                  <div className="logistic-regression-strategy-meter-row">
                    <span className="logistic-regression-mono logistic-regression-strategy-score-tag">
                      w·x = {fmtSigned(item.score)}
                    </span>
                    <div aria-hidden="true" className="logistic-regression-strategy-meter">
                      <span className="logistic-regression-strategy-meter-zero" />
                      <div
                        className={`logistic-regression-strategy-meter-fill ${bar.cls}`}
                        style={{ left: bar.left, width: bar.width }}
                      />
                      <span
                        className="logistic-regression-strategy-meter-cut"
                        title={`拦截线 +${STRATEGY_SCORE_SPAM_THRESHOLD}`}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="logistic-regression-panel">
        <div className="logistic-regression-panel-head">
          <h3>第一条短信的算分过程</h3>
          <span
            className={`logistic-regression-pill ${example.pred === 1 ? "is-danger" : "is-success"}`}
          >
            {example.pred === 1 ? "拦截" : "放行"}
          </span>
        </div>

        <div className="logistic-regression-strategy-matrix-wrap">
          <table className="logistic-regression-strategy-matrix">
            <thead>
              <tr>
                <th scope="row">词表 10 词</th>
                {example.contributions.map((c) => (
                  <th key={c.word} scope="col">
                    {c.word}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">是否出现 xᵢ</th>
                {example.contributions.map((c) => (
                  <td
                    className={`logistic-regression-mono ${c.present === 1 ? "is-hit" : "is-miss"}`}
                    key={c.word}
                  >
                    {c.present}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">设定分值 wᵢ</th>
                {example.contributions.map((c) => (
                  <td
                    className={`logistic-regression-mono ${c.weight > 0 ? "is-pos" : c.weight < 0 ? "is-neg" : "is-zero"}`}
                    key={c.word}
                  >
                    {fmtSigned(c.weight)}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">单项得分 wᵢ·xᵢ</th>
                {example.contributions.map((c) => (
                  <td
                    className={`logistic-regression-mono ${
                      c.contribution > 0 ? "is-pos" : c.contribution < 0 ? "is-neg" : "is-zero"
                    }`}
                    key={c.word}
                  >
                    {c.present === 0 ? "0" : fmtSigned(c.contribution)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="logistic-regression-strategy-formula">
          <p className="logistic-regression-mono">
            w · x ={" "}
            {activeTerms.length > 0
              ? activeTerms.map((c) => `${c.word}(${fmtSigned(c.weight)})×1`).join(" + ")
              : "0"}
            {" = "}
            <strong>{fmtSigned(example.score)}</strong>
          </p>
          <p className="logistic-regression-muted-note">
            这里直接用总分分类。第 3 关会用 Sigmoid 函数，根据分数估计垃圾短信的概率。
          </p>
        </div>
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
