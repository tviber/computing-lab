import { useMemo } from "react";
import type { MlTestSummary, StrategyDraft } from "../domain/protocol.ts";
import type { MlStageDef } from "../domain/stages.ts";
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
  // Map integer risk scores in [-6, +6] onto a zero-centered signed meter; cutoff is +1 (~58.3%).
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
  stage: MlStageDef;
  draft: StrategyDraft;
  passed: boolean;
  result: MlTestSummary | null;
  submitting: boolean;
  hasNextStage: boolean;
  onChange: (draft: StrategyDraft) => void;
  onSubmit: () => void;
  onNextStage: () => void;
}) {
  const evalResult = useMemo(() => evaluateStrategyWeights(draft.weights), [draft.weights]);

  const selectedEval =
    evalResult.items.find((item) => item.message.id === draft.selectedMsgId) ?? evalResult.items[0];

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

  const activeTerms = selectedEval.contributions.filter((c) => c.present === 1);

  return (
    <div className="ml-stage-stack">
      <div className="ml-score-layout">
        <section className="ml-panel">
          <div className="ml-panel-head">
            <h3>10 词策略面板：点击设定每个词的倾向</h3>
            <button className="button button-ghost" onClick={resetWeights} type="button">
              全部清零
            </button>
          </div>
          <p className="ml-muted-note">
            只需判断倾向不用算小数：<strong>正分</strong>提高垃圾风险，<strong>负分</strong>
            保护正常日常，<strong>0</strong> 代表与判断无关；规则：净风险分{" "}
            <strong className="ml-mono">w · x ≥ +1</strong> 判为垃圾。
          </p>

          <div className="ml-strategy-list">
            {STRATEGY_WORDS.map((word) => {
              const val = clampStrategyWeight(draft.weights[word] ?? 0);
              const role = roleMeta(val);
              return (
                <div className="ml-strategy-row" key={word}>
                  <div className="ml-strategy-word">
                    <span className="ml-strategy-word-text">{word}</span>
                    <span className={`ml-strategy-role ${role.cls}`}>{role.label}</span>
                  </div>
                  <div aria-label={`${word} 倾向设置`} className="ml-tier-group" role="group">
                    {STRATEGY_WEIGHT_TIERS.map((tier) => {
                      const active = val === tier.value;
                      return (
                        <button
                          aria-pressed={active}
                          className={`ml-tier-btn is-${tier.role}${active ? " is-active" : ""}`}
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

        <section className="ml-panel">
          <div className="ml-panel-head">
            <h3>6 条 10 词短信实时判分（点击拆解点积）</h3>
            <span
              className={`ml-pill ${evalResult.correctCount === evalResult.totalCount ? "is-success" : "is-warn"}`}
            >
              判对 {evalResult.correctCount} / {evalResult.totalCount}
            </span>
          </div>
          <p className="ml-muted-note">
            当前策略：{evalResult.positiveWordCount} 个偏垃圾 · {evalResult.negativeWordCount}{" "}
            个偏正常 ·{" "}
            {STRATEGY_WORDS.length - evalResult.positiveWordCount - evalResult.negativeWordCount}{" "}
            个无关（门槛 w·x ≥ +{STRATEGY_SCORE_SPAM_THRESHOLD}）
          </p>

          <ul className="ml-triage-list">
            {evalResult.items.map((item) => {
              const isSelected = item.message.id === selectedEval.message.id;
              const bar = scoreBarStyle(item.score);
              const ruleText =
                item.pred === 1
                  ? `≥ +${STRATEGY_SCORE_SPAM_THRESHOLD} 判垃圾`
                  : `< +${STRATEGY_SCORE_SPAM_THRESHOLD} 放行`;
              return (
                <li key={item.message.id}>
                  <button
                    className={`ml-triage-card${isSelected ? " is-selected" : ""} ${item.ok ? "is-ok" : "is-wrong"}`}
                    onClick={() => onChange({ ...draft, selectedMsgId: item.message.id })}
                    type="button"
                  >
                    <div className="ml-triage-top">
                      <span
                        className={`ml-pill ${item.message.label === 1 ? "is-danger" : "is-success"}`}
                      >
                        真实：{item.message.label === 1 ? "垃圾" : "正常"}（{item.message.tag}）
                      </span>
                      <span className={`ml-mono ml-triage-prob ${item.ok ? "is-ok" : "is-bad"}`}>
                        风险分 {fmtSigned(item.score)}（{ruleText}） ·{" "}
                        {item.ok ? "判对了" : item.pred === 1 ? "误杀成垃圾" : "漏放成正常"}
                      </span>
                    </div>
                    <p className="ml-triage-text">{item.message.text}</p>
                    <div className="ml-strategy-meter-row">
                      <span className="ml-mono ml-strategy-score-tag">
                        w·x = {fmtSigned(item.score)}
                      </span>
                      <div aria-hidden="true" className="ml-strategy-meter">
                        <span className="ml-strategy-meter-zero" />
                        <div
                          className={`ml-strategy-meter-fill ${bar.cls}`}
                          style={{ left: bar.left, width: bar.width }}
                        />
                        <span
                          className="ml-strategy-meter-cut"
                          title={`拦截线 +${STRATEGY_SCORE_SPAM_THRESHOLD}`}
                        />
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="ml-panel">
        <div className="ml-panel-head">
          <h3>点积拆解（10 维向量 × 你的策略分）：{selectedEval.message.tag}</h3>
          <span className={`ml-pill ${selectedEval.pred === 1 ? "is-danger" : "is-success"}`}>
            风险分 w·x = {fmtSigned(selectedEval.score)} →{" "}
            {selectedEval.pred === 1
              ? `≥ +${STRATEGY_SCORE_SPAM_THRESHOLD} 判为垃圾`
              : `< +${STRATEGY_SCORE_SPAM_THRESHOLD} 放行正常`}
          </span>
        </div>

        <div className="ml-strategy-matrix-wrap">
          <table className="ml-strategy-matrix">
            <thead>
              <tr>
                <th scope="row">词表 10 词</th>
                {selectedEval.contributions.map((c) => (
                  <th key={c.word} scope="col">
                    {c.word}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">是否出现 xᵢ</th>
                {selectedEval.contributions.map((c) => (
                  <td className={`ml-mono ${c.present === 1 ? "is-hit" : "is-miss"}`} key={c.word}>
                    {c.present}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">设定分值 wᵢ</th>
                {selectedEval.contributions.map((c) => (
                  <td
                    className={`ml-mono ${c.weight > 0 ? "is-pos" : c.weight < 0 ? "is-neg" : "is-zero"}`}
                    key={c.word}
                  >
                    {fmtSigned(c.weight)}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">单项得分 wᵢ·xᵢ</th>
                {selectedEval.contributions.map((c) => (
                  <td
                    className={`ml-mono ${
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

        <div className="ml-strategy-formula">
          <p className="ml-mono">
            w · x ={" "}
            {activeTerms.length > 0
              ? activeTerms.map((c) => `${c.word}(${fmtSigned(c.weight)})×1`).join(" + ")
              : "0"}
            {" = "}
            <strong>{fmtSigned(selectedEval.score)}</strong>
          </p>
          <p className="ml-muted-note">
            规则游戏说明：本关只比较人工加减出的<strong>净风险分</strong>（规定 w·x ≥ +
            {STRATEGY_SCORE_SPAM_THRESHOLD} 才判垃圾，还不涉及真实概率）；第 3 关才会引入偏置 b 与
            Sigmoid 函数，把总分连续转换为 0%~100% 概率。
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
