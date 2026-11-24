import type { StatsConceptQuestion } from "../domain/stages.ts";

export function ConceptQuestion({
  question,
  answer,
  passed,
  onAnswer,
}: {
  question: StatsConceptQuestion;
  answer: number | null;
  passed: boolean;
  onAnswer: (index: number) => void;
}) {
  return (
    <fieldset className="sf-question-card">
      <legend>直觉小问答</legend>
      <p className="sf-question-prompt">{question.prompt}</p>
      <div className="sf-options-list">
        {question.options.map((opt, idx) => (
          <label
            className={`sf-option-item ${answer === idx ? "is-selected" : ""}`}
            key={opt.label}
          >
            <input
              checked={answer === idx}
              name={`q-${question.id}`}
              onChange={() => onAnswer(idx)}
              type="radio"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      {passed && <p className="sf-reveal">{question.reveal}</p>}
    </fieldset>
  );
}
