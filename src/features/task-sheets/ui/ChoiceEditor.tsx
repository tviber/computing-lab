/**
 * Multiple-choice question editor: single/multi toggle, option rows with
 * correct-answer marking, and score.
 */

import { Button } from "@ui-sdk/solid/button";
import { createMemo, For, Show } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import { SHEET_LIMITS, type ChoiceQuestion } from "../domain/schema";
import type { EditorAction } from "../lesson/editorActions";
import { blankOption, nextOptionNum } from "../lesson/editorState";
import { NumberInput } from "./NumberInput";
import { TaskCheckbox } from "./TaskCheckbox";

export function ChoiceEditor(props: {
  q: ChoiceQuestion;
  dispatch: (action: EditorAction) => void;
}) {
  const patch = (next: Partial<ChoiceQuestion>) =>
    props.dispatch({ type: "update", question: { ...props.q, ...next } });
  const markCorrect = (id: string, on: boolean) => {
    const next = props.q.multiple
      ? on
        ? [...props.q.correctOptionIds, id]
        : props.q.correctOptionIds.filter((x) => x !== id)
      : on
        ? [id]
        : [];
    patch({ correctOptionIds: next });
  };
  const optionIds = createMemo(() => props.q.options.map((o) => o.id));

  return (
    <div class="ts-q-body">
      <div class="ts-row">
        <TaskCheckbox
          checked={props.q.multiple}
          onChange={(checked) => patch({ multiple: checked, correctOptionIds: [] })}
        >
          允许多选
        </TaskCheckbox>
        <Show when={props.q.multiple}>
          <TaskCheckbox
            checked={props.q.partialCredit === true}
            onChange={(checked) => patch({ partialCredit: checked })}
          >
            漏选给部分分
          </TaskCheckbox>
        </Show>
      </div>
      <For each={optionIds()}>
        {(optId, i) => {
          const opt = createMemo(() => props.q.options.find((o) => o.id === optId));
          return (
            <Show when={opt()}>
              {(current) => (
                <div class="ts-option-row">
                  <input
                    aria-label={`选项 ${i() + 1} 为正确答案`}
                    checked={props.q.correctOptionIds.includes(optId)}
                    name={props.q.multiple ? undefined : `correct-${props.q.id}`}
                    onChange={(e) => markCorrect(optId, e.currentTarget.checked)}
                    type={props.q.multiple ? "checkbox" : "radio"}
                  />
                  <input
                    aria-label={`选项 ${i() + 1} 文本`}
                    class="ts-option-text"
                    onInput={(e) =>
                      patch({
                        options: props.q.options.map((o) =>
                          o.id === optId ? { ...o, text: e.currentTarget.value } : o,
                        ),
                      })
                    }
                    placeholder={`选项 ${i() + 1}`}
                    value={current().text}
                  />
                  <Button
                    aria-label={`删除选项 ${i() + 1}`}
                    class="icon-button"
                    disabled={props.q.options.length <= 2}
                    onClick={() =>
                      patch({
                        options: props.q.options.filter((o) => o.id !== optId),
                        correctOptionIds: props.q.correctOptionIds.filter((id) => id !== optId),
                      })
                    }
                    type="button"
                  >
                    <Icon name="x" size={13} />
                  </Button>
                </div>
              )}
            </Show>
          );
        }}
      </For>
      <Button
        class="button-ghost ts-add-inline"
        disabled={props.q.options.length >= SHEET_LIMITS.optionsPerQuestion}
        onClick={() =>
          patch({ options: [...props.q.options, blankOption(nextOptionNum(props.q.options))] })
        }
        type="button"
      >
        + 添加选项
      </Button>
      <NumberInput label="分值" onChange={(score) => patch({ score })} value={props.q.score} />
    </div>
  );
}
