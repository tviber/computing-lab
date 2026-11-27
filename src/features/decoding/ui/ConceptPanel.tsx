/**
 * The concept checks of a stage — same shape as the CPU guided checklist:
 * answered prompts pin their reveal, the next unanswered one asks, later
 * ones stay dimmed. An option's note shows only after that option was
 * picked wrong. All prompts must be answered correctly before submit.
 */

import { Button } from "@ui-sdk/solid/button";
import { createMemo, For, Show } from "solid-js";
import type { DecodingStageDef } from "../domain/stages.ts";

export function ConceptPanel(props: {
  stage: DecodingStageDef;
  /** Prompt ids answered correctly so far. */
  answered: ReadonlySet<string>;
  /** The last wrong pick — marks the option red and shows its note. */
  wrongPick: { promptId: string; option: number } | null;
  onAnswer: (promptId: string, option: number) => void;
}) {
  const prompts = () => props.stage.prompts ?? [];
  const nextIndex = createMemo(() => prompts().findIndex((p) => !props.answered.has(p.id)));

  return (
    <Show when={prompts().length > 0}>
      <section aria-label="概念检查" class="decoding-guide">
        <div class="decoding-panel-heading">
          <p class="decoding-panel-note">
            答对 {props.answered.size} / {prompts().length} ——全部答对才能提交判定。
          </p>
        </div>
        <ol class="decoding-guide-list">
          <For each={prompts()}>
            {(prompt, i) => {
              const isAnswered = () => props.answered.has(prompt.id);
              const isNext = () => i() === nextIndex();
              const classes = () =>
                ["decoding-guide-item", isAnswered() ? "is-done" : "", isNext() ? "is-next" : ""]
                  .filter(Boolean)
                  .join(" ");
              return (
                <li class={classes()}>
                  <p class="decoding-guide-prompt">
                    <Show when={isAnswered()}>
                      <span class="decoding-guide-check">✓</span>
                    </Show>
                    {prompt.prompt}
                  </p>
                  <Show
                    fallback={
                      <Show when={isNext()}>
                        <div class="decoding-guide-options">
                          <For each={prompt.options}>
                            {(option, oi) => {
                              const wasPickedWrong = () =>
                                props.wrongPick?.promptId === prompt.id &&
                                props.wrongPick.option === oi();
                              return (
                                <Button
                                  class={`decoding-guide-option${wasPickedWrong() ? " is-wrong" : ""}`}
                                  onClick={() => props.onAnswer(prompt.id, oi())}
                                  type="button"
                                >
                                  {option.label}
                                  <Show when={wasPickedWrong() && option.note}>
                                    <span class="decoding-guide-note">{option.note}</span>
                                  </Show>
                                </Button>
                              );
                            }}
                          </For>
                        </div>
                      </Show>
                    }
                    when={isAnswered()}
                  >
                    <p class="decoding-guide-reveal">{prompt.reveal}</p>
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
