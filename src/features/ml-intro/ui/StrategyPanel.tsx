import { useMemo, useState } from "react";
import type { MlTestSummary, StrategyDraft } from "../domain/protocol.ts";
import type { MlStageDef } from "../domain/stages.ts";
import {
  clampStrategyWeight,
  evaluateStrategyWeights,
  MAX_STRATEGY_WEIGHT,
  MIN_STRATEGY_WEIGHT,
  STRATEGY_WEIGHT_STEP,
  STRATEGY_WORDS,
} from "../domain/strategy.ts";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";

function fmtSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1).replace(/\.0$/, "")}`;
}

function roleMeta(weight: number): { label: string; cls: string } {
  if (weight > 0) return { label: "正相关", cls: "is-pos" };
  if (weight < 0) return { label: "负相关", cls: "is-neg" };
  return { label: "无关", cls: "is-zero" };
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
  const [editingWord, setEditingWord] = useState<{ word: string; raw: string } | null>(null);

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
    setEditingWord(null);
    onChange({ ...draft, weights: zeroW });
  };

  const activeTerms = selectedEval.contributions.filter((c) => c.present === 1);

  return (
    <div className="ml-stage-stack">
      <div className="ml-score-layout">
        <section className="ml-panel">
          <div className="ml-panel-head">
            <h3>10 词策略面板：拖滑块或输入权重</h3>
            <button className="button button-ghost" onClick={resetWeights} type="button">
              全部清零
            </button>
          </div>
          <p className="ml-muted-note">
            范围 {MIN_STRATEGY_WEIGHT} 到 +{MAX_STRATEGY_WEIGHT}
            ：正数（+）推高垃圾概率，负数（−）保护正常消息，0 代表与判断无关。
          </p>

          <div className="ml-strategy-list">
            {STRATEGY_WORDS.map((word) => {
              const val = draft.weights[word] ?? 0;
              const role = roleMeta(val);
              const numberText =
                editingWord?.word === word ? editingWord.raw : String(Number(val.toFixed(1)));
              return (
                <div className="ml-strategy-row" key={word}>
                  <div className="ml-strategy-word">
                    <label htmlFor={`ml-st-range-${word}`}>{word}</label>
                    <span className={`ml-strategy-role ${role.cls}`}>{role.label}</span>
                  </div>
                  <input
                    aria-label={`${word} 权重滑块`}
                    id={`ml-st-range-${word}`}
                    max={MAX_STRATEGY_WEIGHT}
                    min={MIN_STRATEGY_WEIGHT}
                    onChange={(e) => {
                      setEditingWord(null);
                      updateWeight(word, Number(e.target.value));
                    }}
                    step={STRATEGY_WEIGHT_STEP}
                    type="range"
                    value={val}
                  />
                  <input
                    aria-label={`${word} 权重数值`}
                    className={`ml-mono ml-strategy-num ${role.cls}`}
                    max={MAX_STRATEGY_WEIGHT}
                    min={MIN_STRATEGY_WEIGHT}
                    onBlur={() => setEditingWord(null)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setEditingWord({ word, raw });
                      if (raw.trim() !== "") {
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed)) {
                          updateWeight(word, parsed);
                        }
                      }
                    }}
                    step={STRATEGY_WEIGHT_STEP}
                    type="number"
                    value={numberText}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="ml-panel">
          <div className="ml-panel-head">
            <h3>6 条 10 词短信实时预测（点击拆解点积）</h3>
            <span
              className={`ml-pill ${evalResult.correctCount === evalResult.totalCount ? "is-success" : "is-warn"}`}
            >
              判对 {evalResult.correctCount} / {evalResult.totalCount}
            </span>
          </div>
          <p className="ml-muted-note">
            当前策略：{evalResult.positiveWordCount} 个正相关 · {evalResult.negativeWordCount}{" "}
            个负相关 ·{" "}
            {STRATEGY_WORDS.length - evalResult.positiveWordCount - evalResult.negativeWordCount}{" "}
            个无关
          </p>

          <ul className="ml-triage-list">
            {evalResult.items.map((item) => {
              const isSelected = item.message.id === selectedEval.message.id;
              const pctText = `${(item.prob * 100).toFixed(1)}%`;
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
                        垃圾概率 {pctText} ·{" "}
                        {item.ok ? "判对了" : item.pred === 1 ? "误杀成垃圾" : "漏放成正常"}
                      </span>
                    </div>
                    <p className="ml-triage-text">{item.message.text}</p>
                    <div className="ml-strategy-meter-row">
                      <span className="ml-mono ml-strategy-score-tag">
                        w·x = {fmtSigned(item.score)}
                      </span>
                      <div aria-hidden="true" className="ml-strategy-meter">
                        <div
                          className={`ml-strategy-meter-fill ${item.pred === 1 ? "is-spam" : "is-ham"}`}
                          style={{ width: `${Math.round(item.prob * 100)}%` }}
                        />
                        <span className="ml-strategy-meter-cut" />
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
          <h3>点积拆解（10 维向量 × 你的权重）：{selectedEval.message.tag}</h3>
          <span className={`ml-pill ${selectedEval.pred === 1 ? "is-danger" : "is-success"}`}>
            w·x = {fmtSigned(selectedEval.score)} → 垃圾概率 {(selectedEval.prob * 100).toFixed(1)}
            %（
            {selectedEval.pred === 1 ? "判为垃圾" : "判为正常"}）
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
                <th scope="row">设定权重 wᵢ</th>
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
            规则游戏换算（第 1 关采用 15% 低先验分段规则，尚未引入逻辑回归）：w · x = 0 时维持 15.0%
            正常底色（不象无偏置逻辑回归那样落在 50% 模棱两可），总分越过 +0.9 后跨过 50% 判为垃圾。
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
