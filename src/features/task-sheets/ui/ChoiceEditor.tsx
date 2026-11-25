/**
 * Multiple-choice question editor: single/multi toggle, option rows with
 * correct-answer marking, and score.
 */

import { TaskCheckbox } from "./TaskCheckbox";
import type { Dispatch } from "react";
import { Icon } from "../../../shared/ui/Icon";
import { SHEET_LIMITS, type ChoiceQuestion } from "../domain/schema";
import type { EditorAction } from "../lesson/editorActions";
import { blankOption, nextOptionNum } from "../lesson/editorState";
import { NumberInput } from "./NumberInput";

export function ChoiceEditor({
  q,
  dispatch,
}: {
  q: ChoiceQuestion;
  dispatch: Dispatch<EditorAction>;
}) {
  const patch = (next: Partial<ChoiceQuestion>) =>
    dispatch({ type: "update", question: { ...q, ...next } });
  const markCorrect = (id: string, on: boolean) => {
    const next = q.multiple
      ? on
        ? [...q.correctOptionIds, id]
        : q.correctOptionIds.filter((x) => x !== id)
      : on
        ? [id]
        : [];
    patch({ correctOptionIds: next });
  };
  return (
    <div className="ts-q-body">
      <div className="ts-row">
        <TaskCheckbox
          checked={q.multiple}
          onChange={(checked) => patch({ multiple: checked, correctOptionIds: [] })}
        >
          允许多选
        </TaskCheckbox>
        {q.multiple ? (
          <TaskCheckbox
            checked={q.partialCredit === true}
            onChange={(checked) => patch({ partialCredit: checked })}
          >
            漏选给部分分
          </TaskCheckbox>
        ) : null}
      </div>
      {q.options.map((opt, i) => (
        <div className="ts-option-row" key={opt.id}>
          <input
            aria-label={`选项 ${i + 1} 为正确答案`}
            checked={q.correctOptionIds.includes(opt.id)}
            name={q.multiple ? undefined : `correct-${q.id}`}
            onChange={(e) => markCorrect(opt.id, e.target.checked)}
            type={q.multiple ? "checkbox" : "radio"}
          />
          <input
            aria-label={`选项 ${i + 1} 文本`}
            className="ts-option-text"
            onChange={(e) =>
              patch({
                options: q.options.map((o) =>
                  o.id === opt.id ? { ...o, text: e.target.value } : o,
                ),
              })
            }
            placeholder={`选项 ${i + 1}`}
            value={opt.text}
          />
          <button
            aria-label={`删除选项 ${i + 1}`}
            className="icon-button"
            disabled={q.options.length <= 2}
            onClick={() =>
              patch({
                options: q.options.filter((o) => o.id !== opt.id),
                correctOptionIds: q.correctOptionIds.filter((id) => id !== opt.id),
              })
            }
            type="button"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <button
        className="button-ghost ts-add-inline"
        disabled={q.options.length >= SHEET_LIMITS.optionsPerQuestion}
        onClick={() => patch({ options: [...q.options, blankOption(nextOptionNum(q.options))] })}
        type="button"
      >
        + 添加选项
      </button>
      <NumberInput label="分值" onChange={(score) => patch({ score })} value={q.score} />
    </div>
  );
}
