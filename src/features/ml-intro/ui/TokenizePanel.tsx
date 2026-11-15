import { useMemo } from "react";
import { getPublicCorpus } from "../domain/corpus.ts";
import type { MlTestSummary, TokenizeDraft } from "../domain/protocol.ts";
import {
  STAGE1_PRESETS,
  STAGE1_PUZZLE_ITEMS,
  STAGE1_PUZZLE_SENTENCE,
  type MlStageDef,
} from "../domain/stages.ts";
import { analyzeTokens, type RawTokenStatus } from "../domain/tokenizer.ts";
import { ConceptChecklist } from "./ConceptChecklist.tsx";
import { JudgeVerdictCard } from "./JudgeVerdictCard.tsx";

const STATUS_META: Record<RawTokenStatus, { label: string; desc: string }> = {
  kept: { label: "入表 x=1", desc: "词表内首次出现" },
  duplicate: { label: "重复(已计1)", desc: "同句再出现不累加" },
  filtered: { label: "标点过滤", desc: "标点符号丢弃" },
  oov: { label: "新词 OOV", desc: "词表从未见过" },
};

const CHOICE_BTNS: { id: RawTokenStatus; label: string }[] = [
  { id: "kept", label: "入表 (x=1)" },
  { id: "duplicate", label: "重复忽略" },
  { id: "filtered", label: "标点过滤" },
  { id: "oov", label: "新词 OOV" },
];

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
  const activePreset = STAGE1_PRESETS.find((p) => p.id === draft.selectedPresetId);

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

  const classifiedCount = STAGE1_PUZZLE_ITEMS.filter(
    (item) => draft.classifications[item.id] !== undefined,
  ).length;
  const allConceptsDone = stage.prompts.every((p) => draft.concepts[p.id] === p.correct);
  const readyToSubmit = classifiedCount === STAGE1_PUZZLE_ITEMS.length && allConceptsDone;

  return (
    <div className="ml-stage-stack">
      <section className="ml-panel">
        <div className="ml-panel-head">
          <h3>短信特征 X 光机（点选例句或自己写一句）</h3>
          <span className="ml-badge-neutral">训练词表总维数 {fullTrainVocab.size}</span>
        </div>

        <div className="ml-preset-row">
          {STAGE1_PRESETS.map((preset) => (
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
          实验文本（修改文字会实时重新切词并检查词表）：
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
              <span className="ml-tok-tag">{STATUS_META[tok.status].label}</span>
            </span>
          ))}
        </div>

        <div className="ml-bow-summary">
          <div>
            <span className="ml-subhead">
              生成的 0/1 词袋活跃特征（共点亮{" "}
              <strong className="ml-mono">{keptWords.length}</strong> / {fullTrainVocab.size} 维）：
            </span>
            <p className="ml-mono ml-vector-preview">
              {keptWords.length > 0
                ? `{ ${keptWords.map((w) => `"${w}": 1`).join(", ")} }`
                : "没有任何已知词进入词表（全 0 稀疏向量）"}
            </p>
          </div>
          <div className="ml-order-compare">
            <p className="ml-subhead">词序盲区对照实验</p>
            <p className="ml-muted-note">
              「朋友请我免费喝奶茶」 → 活跃特征：{" "}
              <code className="ml-mono">{`[${orderPairA.join(", ")}]`}</code>
            </p>
            <p className="ml-muted-note">
              「免费请我朋友喝奶茶」 → 活跃特征：{" "}
              <code className="ml-mono">{`[${orderPairB.join(", ")}]`}</code>（100% 相同）
            </p>
          </div>
        </div>
      </section>

      <section className="ml-panel">
        <div className="ml-panel-head">
          <h3>动手任务：给测验句的每个片段归类</h3>
          <span className="ml-badge-neutral">
            已选择 {classifiedCount} / {STAGE1_PUZZLE_ITEMS.length}
          </span>
        </div>
        <p className="ml-muted-note">
          请判断下面这句短信里的每个切词片段在「仅使用训练集词表的 0/1 词袋模型」中会被怎样处理：
        </p>
        <blockquote className="ml-quote ml-mono">{STAGE1_PUZZLE_SENTENCE}</blockquote>

        <div className="ml-puzzle-list">
          {STAGE1_PUZZLE_ITEMS.map((item) => {
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
                  aria-label={`片段 ${item.text} 的归类`}
                >
                  {CHOICE_BTNS.map((btn) => (
                    <button
                      aria-pressed={chosen === btn.id}
                      className={`ml-pill-choice${chosen === btn.id ? " is-selected" : ""}`}
                      key={btn.id}
                      onClick={() =>
                        onChange({
                          ...draft,
                          classifications: {
                            ...draft.classifications,
                            [item.id]: btn.id,
                          },
                        })
                      }
                      type="button"
                    >
                      {btn.label}
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
          {submitting ? "判题中…" : "提交第 1 关判定"}
        </button>
        {!readyToSubmit ? (
          <span className="ml-muted-note">完成 7 个片段归类并答对全部概念题后即可提交</span>
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
