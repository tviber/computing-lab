/**
 * 问卷星-style sheet editor: a question palette plus a vertical flow of
 * editable question cards. Local validity is checked per card before the
 * debounced whole-document save reaches the server. Pure editing logic —
 * the reducer and the completeness/save checks — lives in lesson/ and
 * domain/; this file only composes the visual layer.
 */

import { Button } from "@ui-sdk/solid/button";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { Icon } from "../../../shared/ui/Icon";
import { BLANK_MARKER, SHEET_LIMITS, type Question } from "../domain/schema";
import { questionProblem } from "../domain/validation";
import type { EditorAction } from "../lesson/editorActions";
import type { EditorState } from "../lesson/editorState";
import { ChoiceEditor } from "./ChoiceEditor";
import { FillEditor } from "./FillEditor";
import { ShortEditor } from "./ShortEditor";
import { TaskCheckbox } from "./TaskCheckbox";

export const QUESTION_KIND_LABELS: Record<Question["type"], string> = {
  fill: "填空题",
  choice: "选择题",
  short: "简答题",
};

const QUESTION_KINDS = Object.keys(QUESTION_KIND_LABELS) as Question["type"][];

function QuestionCard(props: {
  q: Question;
  index: number;
  total: number;
  dispatch: (action: EditorAction) => void;
}) {
  const problem = createMemo(() => questionProblem(props.q));
  const fillQ = createMemo(() => (props.q.type === "fill" ? props.q : null));
  const choiceQ = createMemo(() => (props.q.type === "choice" ? props.q : null));
  const shortQ = createMemo(() => (props.q.type === "short" ? props.q : null));
  let promptEl: HTMLTextAreaElement | undefined;

  const insertBlankMarker = () => {
    const q = fillQ();
    if (!q || q.blanks.length >= SHEET_LIMITS.blanksPerQuestion) return;
    const el = promptEl;
    const start = el?.selectionStart ?? q.prompt.length;
    const end = el?.selectionEnd ?? start;
    const prompt = q.prompt.slice(0, start) + BLANK_MARKER + q.prompt.slice(end);
    const blanks = [
      ...q.blanks,
      { id: `b${q.blanks.length + 1}-${Date.now() % 1000}`, accept: [""] },
    ];
    props.dispatch({ type: "update", question: { ...q, prompt, blanks } });
    requestAnimationFrame(() => {
      const caret = start + BLANK_MARKER.length;
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  return (
    <section
      aria-label={`第 ${props.index + 1} 题`}
      class={`ts-card${problem() ? " has-problem" : ""}`}
    >
      <header class="ts-card-head">
        <span class="ts-card-index">Q{props.index + 1}</span>
        <span class="ts-badge">{QUESTION_KIND_LABELS[props.q.type]}</span>
        <TaskCheckbox
          checked={props.q.required}
          onChange={(checked) =>
            props.dispatch({ type: "update", question: { ...props.q, required: checked } })
          }
        >
          必答
        </TaskCheckbox>
        <span class="ts-card-actions">
          <Button
            aria-label="上移"
            class="icon-button"
            disabled={props.index === 0}
            onClick={() => props.dispatch({ type: "move", id: props.q.id, dir: -1 })}
            type="button"
          >
            <Icon name="chevron-up" size={13} />
          </Button>
          <Button
            aria-label="下移"
            class="icon-button"
            disabled={props.index === props.total - 1}
            onClick={() => props.dispatch({ type: "move", id: props.q.id, dir: 1 })}
            type="button"
          >
            <Icon name="chevron-down" size={13} />
          </Button>
          <Button
            aria-label="复制本题"
            class="icon-button"
            onClick={() => props.dispatch({ type: "duplicate", id: props.q.id })}
            type="button"
          >
            <Icon name="copy" size={13} />
          </Button>
          <Button
            aria-label="删除本题"
            class="icon-button danger"
            onClick={() => props.dispatch({ type: "remove", id: props.q.id })}
            type="button"
          >
            <Icon name="x" size={14} />
          </Button>
        </span>
      </header>
      <label class="ts-field ts-prompt">
        <textarea
          aria-label="题干"
          onInput={(e) =>
            props.dispatch({
              type: "update",
              question: { ...props.q, prompt: e.currentTarget.value },
            })
          }
          placeholder={
            props.q.type === "fill" ? `输入题干…在需要填空的位置输入 ${BLANK_MARKER}` : "输入题干…"
          }
          ref={(el) => {
            promptEl = el;
          }}
          rows={2}
          value={props.q.prompt}
        />
      </label>
      <Show when={fillQ()}>
        {(q) => (
          <Button
            class="button-ghost ts-add-inline"
            disabled={q().blanks.length >= SHEET_LIMITS.blanksPerQuestion}
            onClick={insertBlankMarker}
            type="button"
          >
            + 插入空格
          </Button>
        )}
      </Show>
      <Switch>
        <Match when={fillQ()}>{(q) => <FillEditor dispatch={props.dispatch} q={q()} />}</Match>
        <Match when={choiceQ()}>{(q) => <ChoiceEditor dispatch={props.dispatch} q={q()} />}</Match>
        <Match when={shortQ()}>{(q) => <ShortEditor dispatch={props.dispatch} q={q()} />}</Match>
      </Switch>
      <Show when={problem()}>
        {(message) => (
          <p class="ts-problem" role="alert">
            {message()}
          </p>
        )}
      </Show>
    </section>
  );
}

export function TaskSheetEditor(props: {
  state: EditorState;
  dispatch: (action: EditorAction) => void;
}) {
  const questionIds = createMemo(() => props.state.questions.map((q) => q.id));

  return (
    <div class="ts-editor">
      <div class="ts-meta">
        <label class="ts-field">
          <span>任务单标题</span>
          <input
            maxlength={SHEET_LIMITS.title}
            onInput={(e) => props.dispatch({ type: "meta", title: e.currentTarget.value })}
            placeholder="例如：第一章 · 数制与编码"
            value={props.state.title}
          />
        </label>
        <label class="ts-field">
          <span>说明（学生作答前可见）</span>
          <textarea
            onInput={(e) => props.dispatch({ type: "meta", description: e.currentTarget.value })}
            placeholder="给学生的说明、要求或提交须知…"
            rows={2}
            value={props.state.description}
          />
        </label>
      </div>

      <div aria-label="添加题目" class="ts-palette" role="group">
        <span class="eyebrow">添加题目</span>
        <For each={QUESTION_KINDS}>
          {(kind) => (
            <Button
              class="button button-secondary ts-palette-btn"
              onClick={() => props.dispatch({ type: "add", kind })}
              type="button"
            >
              + {QUESTION_KIND_LABELS[kind]}
            </Button>
          )}
        </For>
      </div>

      <div class="ts-flow">
        <For each={questionIds()}>
          {(qid, i) => {
            const question = createMemo(() => props.state.questions.find((q) => q.id === qid));
            return (
              <Show when={question()}>
                {(q) => (
                  <QuestionCard
                    dispatch={props.dispatch}
                    index={i()}
                    q={q()}
                    total={props.state.questions.length}
                  />
                )}
              </Show>
            );
          }}
        </For>
        <Show when={props.state.questions.length === 0}>
          <p class="ts-empty">还没有题目——从上方选择题型开始出题。</p>
        </Show>
      </div>
    </div>
  );
}
