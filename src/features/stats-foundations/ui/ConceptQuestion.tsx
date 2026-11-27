import { For, Show } from "solid-js";
import type { StatsConceptQuestion } from "../domain/stages.ts";

export function ConceptQuestion(props: {
  question: StatsConceptQuestion;
  answer: number | null;
  passed: boolean;
  onAnswer: (index: number) => void;
}) {
  return (
    <fieldset class="sf-question-card">
      <legend>直觉小问答</legend>
      <p class="sf-question-prompt">{props.question.prompt}</p>
      <div class="sf-options-list">
        <For each={props.question.options}>
          {(opt, idx) => (
            <label class={`sf-option-item ${props.answer === idx() ? "is-selected" : ""}`}>
              <input
                checked={props.answer === idx()}
                name={`q-${props.question.id}`}
                onChange={() => props.onAnswer(idx())}
                type="radio"
              />
              <span>{opt.label}</span>
            </label>
          )}
        </For>
      </div>
      <Show when={props.passed}>
        <p class="sf-reveal">{props.question.reveal}</p>
      </Show>
    </fieldset>
  );
}
