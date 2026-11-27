/**
 * Teacher-side preview of a task sheet exactly as students will see it:
 * questions rendered through publicSchema() (answer keys stripped) with the
 * same QuestionAnswer cards used by the assignment page. Answers are held in
 * local state only — previewing never touches the network or saves anything.
 */

import { Button } from "@ui-sdk/solid/button";
import { createSignal, For, Show } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import type { AnswerMap, AnswerValue } from "../domain/grade";
import type { PublicQuestion } from "../domain/schema";
import { QuestionAnswer } from "./QuestionFields";

export function TaskSheetPreview(props: {
  title: string;
  description: string;
  questions: PublicQuestion[];
  onClose: () => void;
}) {
  const [answers, setAnswers] = createSignal<AnswerMap>({});
  const setAnswer = (qid: string, value: AnswerValue) =>
    setAnswers((a) => ({ ...a, [qid]: value }));

  return (
    <div class="ts-preview-scrim" onClick={() => props.onClose()} role="presentation">
      <div
        aria-label={`预览「${props.title}」`}
        class="ts-preview"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header class="ts-preview-head">
          <div>
            <p class="eyebrow">任务单 / 预览</p>
            <h2>{props.title}</h2>
            <Show when={props.description.trim() !== ""}>
              <p class="ts-preview-desc">{props.description}</p>
            </Show>
          </div>
          <Button
            aria-label="关闭预览"
            class="icon-button ts-preview-close"
            onClick={() => props.onClose()}
            type="button"
          >
            <Icon name="x" size={16} />
          </Button>
        </header>

        <p class="ts-preview-note" role="status">
          预览模式——这是学生看到的作答页。这里的填写不会被保存，也不会产生提交。
        </p>

        <Show
          fallback={
            <div class="ts-answer-list">
              <For each={props.questions}>
                {(q, i) => (
                  <QuestionAnswer
                    index={i()}
                    onChange={(v) => setAnswer(q.id, v)}
                    q={q}
                    value={answers()[q.id]}
                  />
                )}
              </For>
            </div>
          }
          when={props.questions.length === 0}
        >
          <p class="ts-empty">这份任务单还没有题目。</p>
        </Show>

        <div class="ts-actions">
          <Button class="button button-primary" disabled type="button">
            提交
          </Button>
          <Button class="button button-secondary" onClick={() => props.onClose()} type="button">
            关闭预览
          </Button>
        </div>
      </div>
    </div>
  );
}
