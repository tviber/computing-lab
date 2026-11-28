import { Button } from "@ui-sdk/solid/button";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Icon } from "../ui/Icon";

export type ConceptChecklistOption = {
  label: string;
  note?: string;
};

export type ConceptChecklistPrompt = {
  id: string;
  prompt: string;
  options: readonly ConceptChecklistOption[];
  correct: number;
  reveal: string;
};

export type ConceptWrongPick = { promptId: string; option: number } | null;

export type ConceptChecklistProps = {
  prompts: readonly ConceptChecklistPrompt[];
  /** Prompt ids already answered correctly. */
  answered: ReadonlySet<string>;
  onAnswer: (promptId: string, optionIndex: number, correct: boolean) => void;
  /** Optional externally tracked wrong pick, for labs that preview it. */
  wrongPick?: ConceptWrongPick;
  onWrongPickChange?: (pick: ConceptWrongPick) => void;
  title?: string;
  class?: string;
  renderText?: (text: string) => JSX.Element;
};

/**
 * The one concept-check widget for every lab. A wrong pick is marked and its
 * reason is shown immediately; the next unanswered prompt asks, later ones
 * stay dimmed; a correct answer pins its reveal.
 */
export function ConceptChecklist(props: ConceptChecklistProps) {
  const [localWrongPick, setLocalWrongPick] = createSignal<ConceptWrongPick>(null);
  const wrongPick = () => (props.wrongPick !== undefined ? props.wrongPick : localWrongPick());
  const renderText = (text: string) => (props.renderText ? props.renderText(text) : text);

  const nextIndex = createMemo(() =>
    props.prompts.findIndex((prompt) => !props.answered.has(prompt.id)),
  );

  const setWrong = (pick: ConceptWrongPick) => {
    if (props.wrongPick === undefined) setLocalWrongPick(pick);
    props.onWrongPickChange?.(pick);
  };

  const handleClick = (prompt: ConceptChecklistPrompt, optionIndex: number) => {
    const correct = optionIndex === prompt.correct;
    if (correct) {
      setWrong(null);
    } else {
      setWrong({ promptId: prompt.id, option: optionIndex });
    }
    props.onAnswer(prompt.id, optionIndex, correct);
  };

  return (
    <Show when={props.prompts.length > 0}>
      <section
        aria-label={props.title ?? "概念检查"}
        class={`concept-checklist${props.class ? ` ${props.class}` : ""}`}
      >
        <div class="concept-checklist-head">
          <h3>{props.title ?? "概念检查"}</h3>
          <span class="concept-checklist-count">
            已答对 {props.answered.size} / {props.prompts.length}
          </span>
        </div>
        <ol class="concept-checklist-list">
          <For each={props.prompts}>
            {(prompt, index) => {
              const isDone = () => props.answered.has(prompt.id);
              const isNext = () => index() === nextIndex();
              return (
                <li
                  class={`concept-checklist-item${isDone() ? " is-done" : ""}${isNext() ? " is-next" : ""}`}
                >
                  <p class="concept-checklist-prompt">
                    <Show when={isDone()}>
                      <span aria-hidden="true" class="concept-checklist-check">
                        <Icon name="check" size={13} />
                      </span>
                    </Show>
                    <span>{renderText(prompt.prompt)}</span>
                  </p>
                  <Show
                    fallback={
                      <Show when={isNext()}>
                        <div class="concept-checklist-options">
                          <For each={prompt.options}>
                            {(option, optionIndex) => {
                              const isWrong = () => {
                                const pick = wrongPick();
                                return (
                                  pick?.promptId === prompt.id && pick.option === optionIndex()
                                );
                              };
                              return (
                                <Button
                                  aria-invalid={isWrong() ? "true" : undefined}
                                  class={`concept-checklist-option${isWrong() ? " is-wrong" : ""}`}
                                  onClick={() => handleClick(prompt, optionIndex())}
                                  type="button"
                                >
                                  <span>{renderText(option.label)}</span>
                                  <Show when={isWrong()}>
                                    <span class="concept-checklist-note">
                                      {renderText(
                                        option.note ?? "再想想：这个选项没有解释题目里的现象。",
                                      )}
                                    </span>
                                  </Show>
                                </Button>
                              );
                            }}
                          </For>
                        </div>
                      </Show>
                    }
                    when={isDone()}
                  >
                    <p class="concept-checklist-reveal">{renderText(prompt.reveal)}</p>
                  </Show>
                </li>
              );
            }}
          </For>
        </ol>
      </section>
    </Show>
  );
}
