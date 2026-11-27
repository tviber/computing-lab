import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Icon } from "../../../shared/ui/Icon.tsx";
import { MathText } from "../../../shared/ui/MathFormula";
import type { ConceptAnswers } from "../domain/protocol.ts";
import type { ConceptPrompt } from "../domain/stages.ts";

export function ConceptChecklist(props: {
  prompts: readonly ConceptPrompt[];
  answers: ConceptAnswers;
  onSelectCorrect: (promptId: string, optionIndex: number) => void;
}) {
  const [wrongPick, setWrongPick] = createSignal<{ promptId: string; option: number } | null>(null);

  const answeredSet = createMemo(
    () => new Set(props.prompts.filter((p) => props.answers[p.id] === p.correct).map((p) => p.id)),
  );
  const nextIndex = createMemo(() => props.prompts.findIndex((p) => !answeredSet().has(p.id)));

  const handleClick = (prompt: ConceptPrompt, optionIndex: number) => {
    if (optionIndex === prompt.correct) {
      setWrongPick(null);
      props.onSelectCorrect(prompt.id, optionIndex);
      return;
    }
    setWrongPick({ promptId: prompt.id, option: optionIndex });
  };

  return (
    <Show when={props.prompts.length > 0}>
      <section aria-label="概念检查" class="logistic-regression-panel logistic-regression-guide">
        <div class="logistic-regression-panel-head">
          <h3>概念检查</h3>
          <span class="logistic-regression-badge-neutral">
            已答对 {answeredSet().size} / {props.prompts.length}
          </span>
        </div>
        <ol class="logistic-regression-guide-list">
          <For each={props.prompts}>
            {(prompt, index) => {
              const isDone = () => answeredSet().has(prompt.id);
              const isNext = () => index() === nextIndex();
              return (
                <li
                  class={`logistic-regression-guide-item${isDone() ? " is-done" : ""}${isNext() ? " is-next" : ""}`}
                >
                  <p class="logistic-regression-guide-prompt">
                    <Show when={isDone()}>
                      <span aria-hidden="true" class="logistic-regression-guide-check">
                        <Icon name="check" size={13} />
                      </span>
                    </Show>
                    <MathText>{prompt.prompt}</MathText>
                  </p>
                  <Show
                    fallback={
                      <Show when={isNext()}>
                        <div class="logistic-regression-guide-options">
                          <For each={prompt.options}>
                            {(opt, oi) => {
                              const isWrong = () => {
                                const pick = wrongPick();
                                return pick?.promptId === prompt.id && pick.option === oi();
                              };
                              return (
                                <Button
                                  class={`logistic-regression-guide-option${isWrong() ? " is-wrong" : ""}`}
                                  onClick={() => handleClick(prompt, oi())}
                                  type="button"
                                >
                                  <span>
                                    <MathText>{opt.label}</MathText>
                                  </span>
                                  <Show when={isWrong() && opt.note}>
                                    <span class="logistic-regression-guide-note">
                                      <MathText>{opt.note!}</MathText>
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
                    <p class="logistic-regression-guide-reveal">
                      <MathText>{prompt.reveal}</MathText>
                    </p>
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
