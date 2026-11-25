/**
 * Fill-in-blank question editor: per-blank accept lists, case sensitivity,
 * and score. The prompt textarea lives on QuestionCard — this edits the
 * blanks the ${} markers bind to.
 */

import { TaskCheckbox } from "./TaskCheckbox";
import type { Dispatch } from "react";
import { Icon } from "../../../shared/ui/Icon";
import { BLANK_MARKER, SHEET_LIMITS, countPromptBlanks, type FillQuestion } from "../domain/schema";
import type { EditorAction } from "../lesson/editorActions";
import { NumberInput } from "./NumberInput";

export function FillEditor({ q, dispatch }: { q: FillQuestion; dispatch: Dispatch<EditorAction> }) {
  const patch = (next: Partial<FillQuestion>) =>
    dispatch({ type: "update", question: { ...q, ...next } });
  const markers = countPromptBlanks(q.prompt);
  return (
    <div className="ts-q-body">
      <p className="ts-hint">
        每个空可填多个可接受答案（大小写不敏感，自动忽略空格和全半角差异）。
      </p>
      <p className="ts-hint">
        题干中已有 {markers} 个 {BLANK_MARKER} 标记 —— 第 i 个标记就是空 i。
      </p>
      {q.blanks.map((blank, i) => (
        <div className="ts-blank-row" key={blank.id}>
          <span className="ts-blank-label">空 {i + 1}</span>
          <input
            aria-label={`空 ${i + 1} 的可接受答案`}
            onChange={(e) =>
              patch({
                blanks: q.blanks.map((b) =>
                  b.id === blank.id ? { ...b, accept: e.target.value.split(/[;,；，]/) } : b,
                ),
              })
            }
            placeholder="可接受答案，多个用逗号分隔"
            value={blank.accept.join(", ")}
          />
          <TaskCheckbox
            checked={blank.caseSensitive === true}
            onChange={(checked) =>
              patch({
                blanks: q.blanks.map((b) =>
                  b.id === blank.id ? { ...b, caseSensitive: checked } : b,
                ),
              })
            }
          >
            区分大小写
          </TaskCheckbox>
          <button
            aria-label={`删除空 ${i + 1}`}
            className="icon-button"
            disabled={q.blanks.length <= 1}
            onClick={() => patch({ blanks: q.blanks.filter((b) => b.id !== blank.id) })}
            type="button"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <button
        className="button-ghost ts-add-inline"
        disabled={q.blanks.length >= SHEET_LIMITS.blanksPerQuestion}
        onClick={() =>
          patch({
            blanks: [
              ...q.blanks,
              { id: `b${q.blanks.length + 1}-${Date.now() % 1000}`, accept: [""] },
            ],
          })
        }
        type="button"
      >
        + 添加一个空
      </button>
      <NumberInput label="分值" onChange={(score) => patch({ score })} value={q.score} />
    </div>
  );
}
