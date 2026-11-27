/**
 * Short-answer question editor: max score plus the teacher-only reference
 * answer shown while grading.
 */

import type { ShortQuestion } from "../domain/schema";
import type { EditorAction } from "../lesson/editorActions";
import { NumberInput } from "./NumberInput";

export function ShortEditor(props: { q: ShortQuestion; dispatch: (action: EditorAction) => void }) {
  const patch = (next: Partial<ShortQuestion>) =>
    props.dispatch({ type: "update", question: { ...props.q, ...next } });
  return (
    <div class="ts-q-body">
      <NumberInput
        label="满分"
        onChange={(maxScore) => patch({ maxScore })}
        value={props.q.maxScore}
      />
      <label class="ts-field">
        <span>参考答案（教师批卷时参考，学生不可见）</span>
        <textarea
          onInput={(e) => patch({ referenceAnswer: e.currentTarget.value })}
          rows={2}
          value={props.q.referenceAnswer ?? ""}
        />
      </label>
    </div>
  );
}
