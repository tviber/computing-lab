import { useState } from "react";
import { MathText } from "../../../shared/ui/MathFormula";
import { Icon } from "../../../shared/ui/Icon.tsx";
import type { ConceptAnswers } from "../domain/protocol.ts";
import type { ConceptPrompt } from "../domain/stages.ts";

export function ConceptChecklist({
  prompts,
  answers,
  onSelectCorrect,
}: {
  prompts: readonly ConceptPrompt[];
  answers: ConceptAnswers;
  onSelectCorrect: (promptId: string, optionIndex: number) => void;
}) {
  const [wrongPick, setWrongPick] = useState<{ promptId: string; option: number } | null>(null);

  if (prompts.length === 0) return null;

  const answeredSet = new Set(prompts.filter((p) => answers[p.id] === p.correct).map((p) => p.id));
  const nextIndex = prompts.findIndex((p) => !answeredSet.has(p.id));

  const handleClick = (prompt: ConceptPrompt, optionIndex: number) => {
    if (optionIndex === prompt.correct) {
      setWrongPick(null);
      onSelectCorrect(prompt.id, optionIndex);
      return;
    }
    setWrongPick({ promptId: prompt.id, option: optionIndex });
  };

  return (
    <section aria-label="概念检查" className="logistic-regression-panel logistic-regression-guide">
      <div className="logistic-regression-panel-head">
        <h3>概念检查</h3>
        <span className="logistic-regression-badge-neutral">
          已答对 {answeredSet.size} / {prompts.length}
        </span>
      </div>
      <ol className="logistic-regression-guide-list">
        {prompts.map((prompt, index) => {
          const isDone = answeredSet.has(prompt.id);
          const isNext = index === nextIndex;
          return (
            <li
              className={`logistic-regression-guide-item${isDone ? " is-done" : ""}${isNext ? " is-next" : ""}`}
              key={prompt.id}
            >
              <p className="logistic-regression-guide-prompt">
                {isDone ? (
                  <span aria-hidden="true" className="logistic-regression-guide-check">
                    <Icon name="check" size={13} />
                  </span>
                ) : null}
                <MathText>{prompt.prompt}</MathText>
              </p>
              {isDone ? (
                <p className="logistic-regression-guide-reveal">
                  <MathText>{prompt.reveal}</MathText>
                </p>
              ) : isNext ? (
                <div className="logistic-regression-guide-options">
                  {prompt.options.map((opt, oi) => {
                    const isWrong = wrongPick?.promptId === prompt.id && wrongPick.option === oi;
                    return (
                      <button
                        className={`logistic-regression-guide-option${isWrong ? " is-wrong" : ""}`}
                        key={oi}
                        onClick={() => handleClick(prompt, oi)}
                        type="button"
                      >
                        <span>
                          <MathText>{opt.label}</MathText>
                        </span>
                        {isWrong && opt.note ? (
                          <span className="logistic-regression-guide-note">
                            <MathText>{opt.note}</MathText>
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
