import { useMemo } from "react";
import { getPublicCorpus } from "../domain/corpus.ts";
import type { MlTestSummary, TokenizeDraft } from "../domain/protocol.ts";
import {
  TOKENIZE_PRESETS,
  TOKENIZE_PUZZLE_ITEMS,
  TOKENIZE_PUZZLE_SENTENCE,
  type MlStageDef,
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
  stage: MlStageDef;
  draft: TokenizeDraft;
  passed: boolean;
  result: MlTestSummary | null;
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
    <div className="ml-stage-stack">
      <section className="ml-panel">
        <div className="ml-panel-head">
          <h3>看看程序怎样把短信变成数字</h3>
          <span className="ml-badge-neutral">词表含 {fullTrainVocab.size} 个词</span>
        </div>

        <div className="ml-preset-row">
          {TOKENIZE_PRESETS.map((preset) => (
            <button
              className={`ml-chip-btn${draft.selectedPresetId === preset.id ? " is-active" : ""}`}
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

        <label className="ml-field-label" htmlFor="ml-stage1-input">
          修改下面的短信，看看哪些词在词表里：
        </label>
        <input
          className="ml-text-input"
          id="ml-stage1-input"
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

        {activePreset ? <p className="ml-note-box">{activePreset.note}</p> : null}

        <div className="ml-token-strip">
          {tokens.map((tok, idx) => (
            <span className={`ml-tok is-${tok.status}`} key={`${tok.text}-${idx}`} title={tok.note}>
              <span className="ml-tok-text">{tok.text}</span>
              <span className="ml-tok-tag">{TOKEN_STATUS_LABELS[tok.status]}</span>
            </span>
          ))}
        </div>

        <div className="ml-bow-summary">
          <div>
            <span className="ml-subhead">
              这条短信中，有 <strong className="ml-mono">{keptWords.length}</strong>{" "}
              个不同的词在词表里（词表共 {fullTrainVocab.size} 个词）：
            </span>
            <p className="ml-mono ml-vector-preview">
              {keptWords.length > 0
                ? `{ ${keptWords.map((w) => `"${w}": 1`).join(", ")} }`
                : "没有需要记为 1 的词，所有位置都记为 0。"}
            </p>
          </div>
          <div className="ml-order-compare">
            <p className="ml-subhead">交换词序后，向量会变吗？</p>
            <p className="ml-muted-note">
              「朋友请我免费喝奶茶」 → 记为 1 的词：{" "}
              <code className="ml-mono">{`[${orderPairA.join(", ")}]`}</code>
            </p>
            <p className="ml-muted-note">
              「免费请我朋友喝奶茶」 → 记为 1 的词：{" "}
              <code className="ml-mono">{`[${orderPairB.join(", ")}]`}</code>（与上句相同）
            </p>
          </div>
        </div>
      </section>

      <section className="ml-panel">
        <div className="ml-panel-head">
          <h3>练一练：程序会怎样处理下面的词和标点？</h3>
          <span className="ml-badge-neutral">
            已选择 {classifiedCount} / {TOKENIZE_PUZZLE_ITEMS.length}
          </span>
        </div>
        <p className="ml-muted-note">
          给下面的词和标点各选一种处理方式。你可以参考上方的切词结果。
        </p>
        <blockquote className="ml-quote ml-mono">{TOKENIZE_PUZZLE_SENTENCE}</blockquote>

        <div className="ml-puzzle-list">
          {TOKENIZE_PUZZLE_ITEMS.map((item) => {
            const chosen = draft.classifications[item.id];
            return (
              <div className="ml-puzzle-row" key={item.id}>
                <div className="ml-puzzle-token">
                  <strong className="ml-mono">{item.text}</strong>
                  <span>{item.displayNote}</span>
                </div>
                <div
                  className="ml-puzzle-choices"
                  role="group"
                  aria-label={`片段 ${item.text} 的处理方式`}
                >
                  {STATUS_CHOICES.map((status) => (
                    <button
                      aria-pressed={chosen === status}
                      className={`ml-pill-choice${chosen === status ? " is-selected" : ""}`}
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

      <div className="ml-submit-bar">
        <button
          className="button button-primary"
          disabled={submitting || !readyToSubmit}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? "判题中…" : `提交第 ${stage.index} 关判定`}
        </button>
        {!readyToSubmit ? (
          <span className="ml-muted-note">完成下面的 7 个选择，并答对全部概念题后即可提交</span>
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
