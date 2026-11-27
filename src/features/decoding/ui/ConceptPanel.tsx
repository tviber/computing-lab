/**
 * The concept checks of a stage — the shared checklist handles wrong-pick
 * marking, note feedback, the next-question flow and pinned reveals.
 */

import { createMemo } from "solid-js";
import { ConceptChecklist } from "../../../shared/lab/ConceptChecklist";
import type { DecodingStageDef } from "../domain/stages.ts";

export function ConceptPanel(props: {
  stage: DecodingStageDef;
  /** Prompt ids answered correctly so far. */
  answered: ReadonlySet<string>;
  /** The last wrong pick — marks the option red and shows its note. */
  wrongPick: { promptId: string; option: number } | null;
  onAnswer: (promptId: string, option: number) => void;
}) {
  const prompts = createMemo(() =>
    (props.stage.prompts ?? []).map((prompt) => ({
      id: prompt.id,
      prompt: prompt.prompt,
      options: prompt.options.map((option) => ({ label: option.label, note: option.note })),
      correct: prompt.options.findIndex((option) => option.correct),
      reveal: prompt.reveal,
    })),
  );

  return (
    <ConceptChecklist
      answered={props.answered}
      onAnswer={(promptId, option) => props.onAnswer(promptId, option)}
      prompts={prompts()}
      wrongPick={props.wrongPick}
    />
  );
}
