/**
 * Fill-in-blank question editor: per-blank accept lists, case sensitivity,
 * and score. The prompt textarea lives on QuestionCard — this edits the
 * blanks the ${} markers bind to.
 */

import { Button } from "@ui-sdk/solid/button";
import { createMemo, For, Show } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import { BLANK_MARKER, SHEET_LIMITS, countPromptBlanks, type FillQuestion } from "../domain/schema";
import type { EditorAction } from "../lesson/editorActions";
import { NumberInput } from "./NumberInput";
import { TaskCheckbox } from "./TaskCheckbox";

export function FillEditor(props: { q: FillQuestion; dispatch: (action: EditorAction) => void }) {
  const patch = (next: Partial<FillQuestion>) =>
    props.dispatch({ type: "update", question: { ...props.q, ...next } });
  const markers = createMemo(() => countPromptBlanks(props.q.prompt));
  const blankIds = createMemo(() => props.q.blanks.map((b) => b.id));

  return (
    <div class="ts-q-body">
      <p class="ts-hint">每个空可填多个可接受答案（大小写不敏感，自动忽略空格和全半角差异）。</p>
      <p class="ts-hint">
        题干中已有 {markers()} 个 {BLANK_MARKER} 标记 —— 第 i 个标记就是空 i。
      </p>
      <For each={blankIds()}>
        {(blankId, i) => {
          const blank = createMemo(() => props.q.blanks.find((b) => b.id === blankId));
          return (
            <Show when={blank()}>
              {(current) => (
                <div class="ts-blank-row">
                  <span class="ts-blank-label">空 {i() + 1}</span>
                  <input
                    aria-label={`空 ${i() + 1} 的可接受答案`}
                    onInput={(e) =>
                      patch({
                        blanks: props.q.blanks.map((b) =>
                          b.id === blankId
                            ? { ...b, accept: e.currentTarget.value.split(/[;,；，]/) }
                            : b,
                        ),
                      })
                    }
                    placeholder="可接受答案，多个用逗号分隔"
                    value={current().accept.join(", ")}
                  />
                  <TaskCheckbox
                    checked={current().caseSensitive === true}
                    onChange={(checked) =>
                      patch({
                        blanks: props.q.blanks.map((b) =>
                          b.id === blankId ? { ...b, caseSensitive: checked } : b,
                        ),
                      })
                    }
                  >
                    区分大小写
                  </TaskCheckbox>
                  <Button
                    aria-label={`删除空 ${i() + 1}`}
                    class="icon-button"
                    disabled={props.q.blanks.length <= 1}
                    onClick={() =>
                      patch({ blanks: props.q.blanks.filter((b) => b.id !== blankId) })
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
        disabled={props.q.blanks.length >= SHEET_LIMITS.blanksPerQuestion}
        onClick={() =>
          patch({
            blanks: [
              ...props.q.blanks,
              { id: `b${props.q.blanks.length + 1}-${Date.now() % 1000}`, accept: [""] },
            ],
          })
        }
        type="button"
      >
        + 添加一个空
      </Button>
      <NumberInput label="分值" onChange={(score) => patch({ score })} value={props.q.score} />
    </div>
  );
}
