import { useMemo } from "react";
import { getPublicCorpus } from "../domain/corpus.ts";
import type { LogisticRegressionTestSummary, TokenizeDraft } from "../domain/protocol.ts";
import {
  TOKENIZE_PRESETS,
  TOKENIZE_PUZZLE_ITEMS,
  TOKENIZE_PUZZLE_SENTENCE,
  type LogisticRegressionStageDef,
} from "../domain/stages.ts";
import { analyzeTokens, type RawTokenStatus } from "../domain/tokenizer.ts";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";
import { TOKEN_STATUS_LABELS } from "./tokenStatusLabels.ts";

const STATUS_CHOICES: RawTokenStatus[] = ["kept", "duplicate", "filtered", "oov"];

export function TokenizePanel({
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
  draft: TokenizeDraft;
  passed: boolean;
  result: LogisticRegressionTestSummary | null;
  submitting: boolean;
  hasNextStage: boolean;
  onChange: (draft: TokenizeDraft) => void;
  onSubmit: () => void;
  onNextStage: () => void;
}) {
  const { fullTrainVocab } = useMemo(() => getPublicCorpus(), []);
  const activePreset = TOKENIZE_PRESETS.find((p) => p.id === draft.selectedPresetId);

  const tokens = useMemo(
    () => analyzeTokens(draft.customText, fullTrainVocab),
    [draft.customText, fullTrainVocab],
  );
  const keptWords = useMemo(
    () => tokens.filter((t) => t.status === "kept").map((t) => t.text),
    [tokens],
  );
  const orderPairA = useMemo(
    () =>
      analyzeTokens("朋友请我免费喝奶茶", fullTrainVocab)
        .filter((t) => t.status === "kept")
        .map((t) => t.text)
        .sort(),
    [fullTrainVocab],
  );
  const orderPairB = useMemo(
    () =>
      analyzeTokens("免费请我朋友喝奶茶", fullTrainVocab)
        .filter((t) => t.status === "kept")
        .map((t) => t.text)
        .sort(),
    [fullTrainVocab],
  );

  const classifiedCount = TOKENIZE_PUZZLE_ITEMS.filter(
    (item) => draft.classifications[item.id] !== undefined,
  ).length;
  const allConceptsDone = stage.prompts.every((p) => draft.concepts[p.id] === p.correct);
  const readyToSubmit = classifiedCount === TOKENIZE_PUZZLE_ITEMS.length && allConceptsDone;

  return (
    <div className="logistic-regression-stage-stack">
      <section className="logistic-regression-panel">
        <div className="logistic-regression-panel-head">
          <h3>分词与编码</h3>
          <span className="logistic-regression-badge-neutral">
            词表含 {fullTrainVocab.size} 个词
          </span>
        </div>
        <p className="logistic-regression-rule-strip">
          出现 = 1 · 未出现 = 0 · 重复词仍 = 1 · 标点 / 未登录词 = 0
        </p>

        <div className="logistic-regression-preset-row">
          {TOKENIZE_PRESETS.map((preset) => (
            <button
              className={`logistic-regression-chip-btn${draft.selectedPresetId === preset.id ? " is-active" : ""}`}
              key={preset.id}
              onClick={() =>
                onChange({
                  ...draft,
                  selectedPresetId: preset.id,
                  customText: preset.text,
                })
              }
              type="button"
            >
              <span>{preset.label}</span>
              <small>{preset.tag}</small>
            </button>
          ))}
        </div>

        <label
          className="logistic-regression-field-label"
          htmlFor="logistic-regression-stage1-input"
        >
          短信内容
        </label>
        <input
          className="logistic-regression-text-input"
          id="logistic-regression-stage1-input"
          maxLength={240}
          onChange={(e) =>
            onChange({
              ...draft,
              selectedPresetId: "custom",
              customText: e.target.value,
            })
          }
          placeholder="输入一句中文短信，例如：免费领取红包元宇宙限时！"
          type="text"
          value={draft.customText}
        />

        {activePreset ? <p className="logistic-regression-note-box">{activePreset.note}</p> : null}

        <div className="logistic-regression-token-strip">
          {tokens.map((tok, idx) => (
            <span
              className={`logistic-regression-tok is-${tok.status}`}
              key={`${tok.text}-${idx}`}
              title={tok.note}
            >
              <span className="logistic-regression-tok-text">{tok.text}</span>
              <span className="logistic-regression-tok-tag">{TOKEN_STATUS_LABELS[tok.status]}</span>
            </span>
          ))}
        </div>

        <div className="logistic-regression-bow-summary">
          <div>
            <span className="logistic-regression-subhead">
              这条短信中，有{" "}
              <strong className="logistic-regression-mono">{keptWords.length}</strong>{" "}
              个不同的词在词表里（词表共 {fullTrainVocab.size} 个词）：
            </span>
            <p className="logistic-regression-mono logistic-regression-vector-preview">
              {keptWords.length > 0
                ? `{ ${keptWords.map((w) => `"${w}": 1`).join(", ")} }`
                : "没有需要记为 1 的词，所有位置都记为 0。"}
            </p>
          </div>
          <div className="logistic-regression-order-compare">
            <p className="logistic-regression-subhead">交换词序后，向量会变吗？</p>
            <p className="logistic-regression-muted-note">
              「朋友请我免费喝奶茶」 → 记为 1 的词：{" "}
              <code className="logistic-regression-mono">{`[${orderPairA.join(", ")}]`}</code>
            </p>
            <p className="logistic-regression-muted-note">
              「免费请我朋友喝奶茶」 → 记为 1 的词：{" "}
              <code className="logistic-regression-mono">{`[${orderPairB.join(", ")}]`}</code>
              （与上句相同）
            </p>
          </div>
        </div>
      </section>

      <section className="logistic-regression-panel">
        <div className="logistic-regression-panel-head">
          <h3>分词练习</h3>
          <span className="logistic-regression-badge-neutral">
            已选择 {classifiedCount} / {TOKENIZE_PUZZLE_ITEMS.length}
          </span>
        </div>
        <p className="logistic-regression-muted-note">给每个片段选择一种处理方式。</p>
        <blockquote className="logistic-regression-quote logistic-regression-mono">
          {TOKENIZE_PUZZLE_SENTENCE}
        </blockquote>

        <div className="logistic-regression-puzzle-list">
          {TOKENIZE_PUZZLE_ITEMS.map((item) => {
            const chosen = draft.classifications[item.id];
            return (
              <div className="logistic-regression-puzzle-row" key={item.id}>
                <div className="logistic-regression-puzzle-token">
                  <strong className="logistic-regression-mono">{item.text}</strong>
                  <span>{item.displayNote}</span>
                </div>
                <div
                  className="logistic-regression-puzzle-choices"
                  role="group"
                  aria-label={`片段 ${item.text} 的处理方式`}
                >
                  {STATUS_CHOICES.map((status) => (
                    <button
                      aria-pressed={chosen === status}
                      className={`logistic-regression-pill-choice${chosen === status ? " is-selected" : ""}`}
                      key={status}
                      onClick={() =>
                        onChange({
                          ...draft,
                          classifications: {
                            ...draft.classifications,
                            [item.id]: status,
                          },
                        })
                      }
                      type="button"
                    >
                      {TOKEN_STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
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
          disabled={submitting || !readyToSubmit}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? "判题中…" : `提交第 ${stage.index} 关判定`}
        </button>
        {!readyToSubmit ? (
          <span className="logistic-regression-muted-note">
            完成下面的 7 个选择，并答对全部概念题后即可提交
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
