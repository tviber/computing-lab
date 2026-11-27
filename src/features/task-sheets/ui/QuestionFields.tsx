/**
 * Read-only/writeable rendering of the three question types. Shared by the
 * student fill page (editable) and the teacher review drawer (read-only with
 * grading overlays). Never renders answer keys — it receives publicSchema
 * questions from the student path, and the teacher path hides correctOptionIds
 * behind an explicit `showAnswers` flag.
 */

import { createMemo, For, Show } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import type { AnswerValue } from "../domain/grade";
import { splitPromptBlanks, type PublicQuestion } from "../domain/schema";

export type PublicGrading = {
  type: string;
  score: number | null;
  max: number;
  correct?: boolean;
  selected?: string[];
  blanks?: Record<string, { correct: boolean }>;
};

function fillGrading(g: PublicGrading | undefined) {
  return g?.type === "fill" ? g : undefined;
}
function choiceGrading(g: PublicGrading | undefined) {
  return g?.type === "choice" ? g : undefined;
}

export function QuestionAnswer(props: {
  q: PublicQuestion;
  index: number;
  value: AnswerValue | undefined;
  onChange?: (v: AnswerValue) => void;
  grading?: PublicGrading;
  review?: { score?: number; comment?: string };
  readOnly?: boolean;
}) {
  const max = createMemo(() => (props.q.type === "short" ? props.q.maxScore : props.q.score));
  const shownScore = createMemo(() => props.review?.score ?? props.grading?.score);
  const hasScore = createMemo(
    () => props.grading !== undefined || props.review?.score !== undefined,
  );
  const fillQ = createMemo(() => (props.q.type === "fill" ? props.q : null));
  const choiceQ = createMemo(() => (props.q.type === "choice" ? props.q : null));
  const cloze = createMemo(() => {
    const q = fillQ();
    return q ? splitPromptBlanks(q.prompt) : null;
  });
  const hasCloze = createMemo(() => {
    const segments = cloze();
    return segments !== null && segments.some((s) => s.type === "blank");
  });

  return (
    <section aria-label={`第 ${props.index + 1} 题`} class="ts-answer-card">
      <header class="ts-answer-head">
        <span class="ts-card-index">Q{props.index + 1}</span>
        <p class="ts-answer-prompt">
          {hasCloze() ? "" : props.q.prompt}
          <Show when={props.q.required}>
            <span class="ts-required"> *</span>
          </Show>
        </p>
        <span class="ts-answer-max">{max()} 分</span>
        <Show when={hasScore()}>
          <span
            class={`ts-answer-score${shownScore() !== null && shownScore() !== undefined && shownScore()! >= max() ? " is-full" : ""}`}
          >
            {shownScore() ?? "待批"}/{max()}
          </span>
        </Show>
      </header>

      <Show when={hasCloze() ? fillQ() : null}>
        {(q) => (
          <p class="ts-cloze">
            <For each={cloze() ?? []}>
              {(seg) => {
                if (seg.type === "text") return <span>{seg.text}</span>;
                const blank = () => q().blanks[seg.index];
                return (
                  <Show when={blank()}>
                    {(b) => {
                      const mark = () => fillGrading(props.grading)?.blanks?.[b().id];
                      return (
                        <span class="ts-cloze-slot">
                          <input
                            aria-label={`空 ${seg.index + 1}`}
                            class={`ts-blank-inline${mark() ? (mark()!.correct ? " is-right" : " is-wrong") : ""}`}
                            disabled={props.readOnly}
                            onInput={(e) =>
                              props.onChange?.({
                                type: "fill",
                                blanks: {
                                  ...(props.value?.type === "fill" ? props.value.blanks : {}),
                                  [b().id]: e.currentTarget.value,
                                },
                              })
                            }
                            value={
                              props.value?.type === "fill" ? (props.value.blanks[b().id] ?? "") : ""
                            }
                          />
                          <Show when={mark()}>
                            {(m) => (
                              <span
                                class={`ts-blank-mark${m().correct ? " is-right" : " is-wrong"}`}
                              >
                                <Icon name={m().correct ? "check" : "x"} size={12} />
                              </span>
                            )}
                          </Show>
                        </span>
                      );
                    }}
                  </Show>
                );
              }}
            </For>
          </p>
        )}
      </Show>

      <Show when={!hasCloze() ? fillQ() : null}>
        {(q) => (
          <div class="ts-answer-blanks">
            <For each={q().blanks}>
              {(blank, i) => {
                const mark = () => fillGrading(props.grading)?.blanks?.[blank.id];
                return (
                  <label
                    class={`ts-answer-blank${mark() ? (mark()!.correct ? " is-right" : " is-wrong") : ""}`}
                  >
                    <span>空 {i() + 1}</span>
                    <input
                      disabled={props.readOnly}
                      onInput={(e) =>
                        props.onChange?.({
                          type: "fill",
                          blanks: {
                            ...(props.value?.type === "fill" ? props.value.blanks : {}),
                            [blank.id]: e.currentTarget.value,
                          },
                        })
                      }
                      value={
                        props.value?.type === "fill" ? (props.value.blanks[blank.id] ?? "") : ""
                      }
                    />
                    <Show when={mark()}>
                      {(m) => (
                        <span class={`ts-blank-mark${m().correct ? " is-right" : " is-wrong"}`}>
                          <Icon name={m().correct ? "check" : "x"} size={13} />
                        </span>
                      )}
                    </Show>
                  </label>
                );
              }}
            </For>
          </div>
        )}
      </Show>

      <Show when={choiceQ()}>
        {(q) => (
          <div class="ts-answer-options">
            <For each={q().options}>
              {(opt) => {
                const selected = () =>
                  props.value?.type === "choice" ? props.value.optionIds.includes(opt.id) : false;
                return (
                  <label class={`ts-answer-option${selected() ? " is-selected" : ""}`}>
                    <input
                      checked={selected()}
                      disabled={props.readOnly}
                      name={q().multiple ? undefined : `ans-${q().id}`}
                      onChange={(e) => {
                        const current = props.value?.type === "choice" ? props.value.optionIds : [];
                        const next = q().multiple
                          ? e.currentTarget.checked
                            ? [...current, opt.id]
                            : current.filter((id) => id !== opt.id)
                          : [opt.id];
                        props.onChange?.({ type: "choice", optionIds: next });
                      }}
                      type={q().multiple ? "checkbox" : "radio"}
                    />
                    <span>{opt.text}</span>
                  </label>
                );
              }}
            </For>
            <Show when={q().multiple}>
              <p class="ts-hint">多选题</p>
            </Show>
            <Show when={choiceGrading(props.grading)?.correct === false}>
              <p class="ts-hint ts-wrong">答案不正确</p>
            </Show>
          </div>
        )}
      </Show>

      <Show when={props.q.type === "short"}>
        <textarea
          aria-label={`第 ${props.index + 1} 题作答`}
          class="ts-answer-text"
          disabled={props.readOnly}
          onInput={(e) => props.onChange?.({ type: "short", text: e.currentTarget.value })}
          placeholder="输入你的回答…"
          rows={4}
          value={props.value?.type === "short" ? props.value.text : ""}
        />
      </Show>

      <Show when={props.review?.comment}>
        {(comment) => <p class="ts-review-comment">老师评语：{comment()}</p>}
      </Show>
    </section>
  );
}
