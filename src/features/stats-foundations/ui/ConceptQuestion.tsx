import { createMemo } from "solid-js";
import { ConceptChecklist } from "../../../shared/lab/ConceptChecklist";
import type { StatsConceptQuestion } from "../domain/stages.ts";

export function ConceptQuestion(props: {
  question: StatsConceptQuestion;
  answer: number | null;
  onAnswer: (index: number) => void;
}) {
  const answered = createMemo(() =>
    props.answer === props.question.correct ? new Set([props.question.id]) : new Set<string>(),
  );
  const wrongPick = () =>
    props.answer !== null && props.answer !== props.question.correct
      ? { promptId: props.question.id, option: props.answer }
      : null;

  return (
    <ConceptChecklist
      answered={answered()}
      onAnswer={(_, optionIndex) => props.onAnswer(optionIndex)}
      prompts={[props.question]}
      title="直觉小问答"
      wrongPick={wrongPick()}
    />
  );
}
