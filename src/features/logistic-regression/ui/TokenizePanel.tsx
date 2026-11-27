import { Button } from "@ui-sdk/solid/button";
import { createMemo, For, Show } from "solid-js";
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

const STATUS_CHOICES: readonly RawTokenStatus[] = ["kept", "duplicate", "filtered", "oov"];

export function TokenizePanel(props: {
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
  const fullTrainVocab = getPublicCorpus().fullTrainVocab;

  const activePreset = createMemo(() =>
    TOKENIZE_PRESETS.find((p) => p.id === props.draft.selectedPresetId),
  );

  const tokens = createMemo(() => analyzeTokens(props.draft.customText, fullTrainVocab));
  const keptWords = createMemo(() =>
    tokens()
      .filter((t) => t.status === "kept")
      .map((t) => t.text),
  );
  const orderPairA = analyzeTokens("朋友请我免费喝奶茶", fullTrainVocab)
    .filter((t) => t.status === "kept")
    .map((t) => t.text)
    .sort();
  const orderPairB = analyzeTokens("免费请我朋友喝奶茶", fullTrainVocab)
    .filter((t) => t.status === "kept")
    .map((t) => t.text)
    .sort();

  const classifiedCount = createMemo(
    () =>
      TOKENIZE_PUZZLE_ITEMS.filter((item) => props.draft.classifications[item.id] !== undefined)
        .length,
  );
  const allConceptsDone = createMemo(() =>
    props.stage.prompts.every((p) => props.draft.concepts[p.id] === p.correct),
  );
  const readyToSubmit = createMemo(
    () => classifiedCount() === TOKENIZE_PUZZLE_ITEMS.length && allConceptsDone(),
  );

  return (
    <div class="logistic-regression-stage-stack">
      <section class="logistic-regression-panel">
        <div class="logistic-regression-panel-head">
          <h3>分词与编码</h3>
          <span class="logistic-regression-badge-neutral">词表含 {fullTrainVocab.size} 个词</span>
        </div>
        <p class="logistic-regression-rule-strip">
          词表内：出现 = 1，未出现 = 0，重复仍 = 1 · 标点和词表外词不编码
        </p>

        <div class="logistic-regression-preset-row">
          <For each={TOKENIZE_PRESETS}>
            {(preset) => (
              <Button
                class={`logistic-regression-chip-btn${props.draft.selectedPresetId === preset.id ? " is-active" : ""}`}
                onClick={() =>
                  props.onChange({
                    ...props.draft,
                    selectedPresetId: preset.id,
                    customText: preset.text,
                  })
                }
                type="button"
              >
                <span>{preset.label}</span>
                <small>{preset.tag}</small>
              </Button>
            )}
          </For>
        </div>

        <label class="logistic-regression-field-label" for="logistic-regression-stage1-input">
          短信内容
        </label>
        <input
          class="logistic-regression-text-input"
          id="logistic-regression-stage1-input"
          maxlength={240}
          onChange={(e) =>
            props.onChange({
              ...props.draft,
              selectedPresetId: "custom",
              customText: e.currentTarget.value,
            })
          }
          onInput={(e) =>
            props.onChange({
              ...props.draft,
              selectedPresetId: "custom",
              customText: e.currentTarget.value,
            })
          }
          placeholder="输入一句中文短信，例如：免费领取红包元宇宙限时！"
          type="text"
          value={props.draft.customText}
        />

        <Show when={activePreset()}>
          {(preset) => <p class="logistic-regression-note-box">{preset().note}</p>}
        </Show>

        <div class="logistic-regression-token-strip">
          <For each={tokens()}>
            {(tok) => (
              <span class={`logistic-regression-tok is-${tok.status}`} title={tok.note}>
                <span class="logistic-regression-tok-text">{tok.text}</span>
                <span class="logistic-regression-tok-tag">{TOKEN_STATUS_LABELS[tok.status]}</span>
              </span>
            )}
          </For>
        </div>

        <div class="logistic-regression-bow-summary">
          <div>
            <span class="logistic-regression-subhead">
              这条短信中，有 <strong class="logistic-regression-mono">{keptWords().length}</strong>{" "}
              个不同的词在词表里（词表共 {fullTrainVocab.size} 个词）：
            </span>
            <p class="logistic-regression-mono logistic-regression-vector-preview">
              {keptWords().length > 0
                ? `{ ${keptWords()
                    .map((w) => `"${w}": 1`)
                    .join(", ")} }`
                : "没有需要记为 1 的词，所有位置都记为 0。"}
            </p>
          </div>
          <div class="logistic-regression-order-compare">
            <p class="logistic-regression-subhead">交换词序后，向量会变吗？</p>
            <p class="logistic-regression-muted-note">
              「朋友请我免费喝奶茶」 → 记为 1 的词：{" "}
              <code class="logistic-regression-mono">{`[${orderPairA.join(", ")}]`}</code>
            </p>
            <p class="logistic-regression-muted-note">
              「免费请我朋友喝奶茶」 → 记为 1 的词：{" "}
              <code class="logistic-regression-mono">{`[${orderPairB.join(", ")}]`}</code>
              （与上句相同）
            </p>
          </div>
        </div>
      </section>

      <section class="logistic-regression-panel">
        <div class="logistic-regression-panel-head">
          <h3>分词练习</h3>
          <span class="logistic-regression-badge-neutral">
            已选择 {classifiedCount()} / {TOKENIZE_PUZZLE_ITEMS.length}
          </span>
        </div>
        <p class="logistic-regression-muted-note">给每个片段选择一种处理方式。</p>
        <blockquote class="logistic-regression-quote logistic-regression-mono">
          {TOKENIZE_PUZZLE_SENTENCE}
        </blockquote>

        <div class="logistic-regression-puzzle-list">
          <For each={TOKENIZE_PUZZLE_ITEMS}>
            {(item) => {
              const chosen = () => props.draft.classifications[item.id];
              return (
                <div class="logistic-regression-puzzle-row">
                  <div class="logistic-regression-puzzle-token">
                    <strong class="logistic-regression-mono">{item.text}</strong>
                    <span>{item.displayNote}</span>
                  </div>
                  <div
                    aria-label={`片段 ${item.text} 的处理方式`}
                    class="logistic-regression-puzzle-choices"
                    role="group"
                  >
                    <For each={STATUS_CHOICES}>
                      {(status) => (
                        <Button
                          aria-pressed={chosen() === status ? "true" : "false"}
                          class={`logistic-regression-pill-choice${chosen() === status ? " is-selected" : ""}`}
                          onClick={() =>
                            props.onChange({
                              ...props.draft,
                              classifications: {
                                ...props.draft.classifications,
                                [item.id]: status,
                              },
                            })
                          }
                          type="button"
                        >
                          {TOKEN_STATUS_LABELS[status]}
                        </Button>
                      )}
                    </For>
                  </div>
                </div>
              );
            }}
          </For>
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
          disabled={props.submitting || !readyToSubmit()}
          onClick={() => props.onSubmit()}
          type="button"
        >
          {props.submitting ? "判题中…" : `提交第 ${props.stage.index} 关判定`}
        </Button>
        <Show when={!readyToSubmit()}>
          <span class="logistic-regression-muted-note">
            完成下面的 7 个选择，并答对全部概念题后即可提交
          </span>
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
