import { useState } from "react";
import { Icon } from "../../../shared/ui/Icon.tsx";
import type { ConceptAnswers } from "../domain/protocol.ts";
import type { ConceptPrompt } from "../domain/stages.ts";

/**
 * Progressive concept check list (one prompt active at a time, completed prompts
 * keep their takeaway visible, wrong choices display their misconception note).
 */
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
    <section aria-label="概念检查" className="ml-panel ml-guide">
      <div className="ml-panel-head">
        <h3>概念检查</h3>
        <span className="ml-badge-neutral">
          已答对 {answeredSet.size} / {prompts.length}
        </span>
      </div>
      <ol className="ml-guide-list">
        {prompts.map((prompt, index) => {
          const isDone = answeredSet.has(prompt.id);
          const isNext = index === nextIndex;
          return (
            <li
              className={`ml-guide-item${isDone ? " is-done" : ""}${isNext ? " is-next" : ""}`}
              key={prompt.id}
            >
              <p className="ml-guide-prompt">
                {isDone ? (
                  <span aria-hidden="true" className="ml-guide-check">
                    <Icon name="check" size={13} />
                  </span>
                ) : null}
                {prompt.prompt}
              </p>
              {isDone ? (
                <p className="ml-guide-reveal">{prompt.reveal}</p>
              ) : isNext ? (
                <div className="ml-guide-options">
                  {prompt.options.map((opt, oi) => {
                    const isWrong = wrongPick?.promptId === prompt.id && wrongPick.option === oi;
                    return (
                      <button
                        className={`ml-guide-option${isWrong ? " is-wrong" : ""}`}
                        key={oi}
                        onClick={() => handleClick(prompt, oi)}
                        type="button"
                      >
                        <span>{opt.label}</span>
                        {isWrong && opt.note ? (
                          <span className="ml-guide-note">{opt.note}</span>
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
