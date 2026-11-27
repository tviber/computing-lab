import { createMemo } from "solid-js";
import { ConceptChecklist as SharedConceptChecklist } from "../../../shared/lab/ConceptChecklist";
import { MathText } from "../../../shared/ui/MathFormula";
import type { ConceptAnswers } from "../domain/protocol.ts";
import type { ConceptPrompt } from "../domain/stages.ts";

export function ConceptChecklist(props: {
  prompts: readonly ConceptPrompt[];
  answers: ConceptAnswers;
  onSelectCorrect: (promptId: string, optionIndex: number) => void;
}) {
  const answered = createMemo(
    () =>
      new Set(
        props.prompts
          .filter((prompt) => props.answers[prompt.id] === prompt.correct)
          .map((prompt) => prompt.id),
      ),
  );

  return (
    <SharedConceptChecklist
      answered={answered()}
      onAnswer={(promptId, optionIndex, correct) => {
        if (correct) props.onSelectCorrect(promptId, optionIndex);
      }}
      prompts={props.prompts}
      renderText={(text) => <MathText>{text}</MathText>}
    />
  );
}
