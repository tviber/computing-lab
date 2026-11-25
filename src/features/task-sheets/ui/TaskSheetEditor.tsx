/**
 * 问卷星-style sheet editor: a question palette plus a vertical flow of
 * editable question cards. Local validity is checked per card before the
 * debounced whole-document save reaches the server. Pure editing logic —
 * the reducer and the completeness/save checks — lives in lesson/ and
 * domain/; this file only composes the visual layer.
 */

import { TaskCheckbox } from "./TaskCheckbox";
import { useRef, type Dispatch } from "react";
import { Icon } from "../../../shared/ui/Icon";
import { BLANK_MARKER, SHEET_LIMITS, type Question } from "../domain/schema";
import { questionProblem } from "../domain/validation";
import type { EditorAction } from "../lesson/editorActions";
import type { EditorState } from "../lesson/editorState";
import { ChoiceEditor } from "./ChoiceEditor";
import { FillEditor } from "./FillEditor";
import { ShortEditor } from "./ShortEditor";

export const QUESTION_KIND_LABELS: Record<Question["type"], string> = {
  fill: "填空题",
  choice: "选择题",
  short: "简答题",
};

function QuestionCard({
  q,
  index,
  total,
  dispatch,
}: {
  q: Question;
  index: number;
  total: number;
  dispatch: Dispatch<EditorAction>;
}) {
  const problem = questionProblem(q);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const insertBlankMarker = () => {
    if (q.type !== "fill" || q.blanks.length >= SHEET_LIMITS.blanksPerQuestion) return;
    const el = promptRef.current;
    const start = el?.selectionStart ?? q.prompt.length;
    const end = el?.selectionEnd ?? start;
    const prompt = q.prompt.slice(0, start) + BLANK_MARKER + q.prompt.slice(end);
    const blanks = [
      ...q.blanks,
      { id: `b${q.blanks.length + 1}-${Date.now() % 1000}`, accept: [""] },
    ];
    dispatch({ type: "update", question: { ...q, prompt, blanks } });
    requestAnimationFrame(() => {
      const caret = start + BLANK_MARKER.length;
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  return (
    <section
      aria-label={`第 ${index + 1} 题`}
      className={`ts-card${problem ? " has-problem" : ""}`}
    >
      <header className="ts-card-head">
        <span className="ts-card-index">Q{index + 1}</span>
        <span className="ts-badge">{QUESTION_KIND_LABELS[q.type]}</span>
        <TaskCheckbox
          checked={q.required}
          onChange={(checked) =>
            dispatch({ type: "update", question: { ...q, required: checked } })
          }
        >
          必答
        </TaskCheckbox>
        <span className="ts-card-actions">
          <button
            aria-label="上移"
            className="icon-button"
            disabled={index === 0}
            onClick={() => dispatch({ type: "move", id: q.id, dir: -1 })}
            type="button"
          >
            <Icon name="chevron-up" size={13} />
          </button>
          <button
            aria-label="下移"
            className="icon-button"
            disabled={index === total - 1}
            onClick={() => dispatch({ type: "move", id: q.id, dir: 1 })}
            type="button"
          >
            <Icon name="chevron-down" size={13} />
          </button>
          <button
            aria-label="复制本题"
            className="icon-button"
            onClick={() => dispatch({ type: "duplicate", id: q.id })}
            type="button"
          >
            <Icon name="copy" size={13} />
          </button>
          <button
            aria-label="删除本题"
            className="icon-button danger"
            onClick={() => dispatch({ type: "remove", id: q.id })}
            type="button"
          >
            <Icon name="x" size={14} />
          </button>
        </span>
      </header>
      <label className="ts-field ts-prompt">
        <textarea
          aria-label="题干"
          onChange={(e) => dispatch({ type: "update", question: { ...q, prompt: e.target.value } })}
          placeholder={
            q.type === "fill" ? `输入题干…在需要填空的位置输入 ${BLANK_MARKER}` : "输入题干…"
          }
          ref={promptRef}
          rows={2}
          value={q.prompt}
        />
      </label>
      {q.type === "fill" ? (
        <button
          className="button-ghost ts-add-inline"
          disabled={q.blanks.length >= SHEET_LIMITS.blanksPerQuestion}
          onClick={insertBlankMarker}
          type="button"
        >
          + 插入空格
        </button>
      ) : null}
      {q.type === "fill" ? (
        <FillEditor dispatch={dispatch} q={q} />
      ) : q.type === "choice" ? (
        <ChoiceEditor dispatch={dispatch} q={q} />
      ) : (
        <ShortEditor dispatch={dispatch} q={q} />
      )}
      {problem ? (
        <p className="ts-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

export function TaskSheetEditor({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}) {
  return (
    <div className="ts-editor">
      <div className="ts-meta">
        <label className="ts-field">
          <span>任务单标题</span>
          <input
            maxLength={SHEET_LIMITS.title}
            onChange={(e) => dispatch({ type: "meta", title: e.target.value })}
            placeholder="例如：第一章 · 数制与编码"
            value={state.title}
          />
        </label>
        <label className="ts-field">
          <span>说明（学生作答前可见）</span>
          <textarea
            onChange={(e) => dispatch({ type: "meta", description: e.target.value })}
            placeholder="给学生的说明、要求或提交须知…"
            rows={2}
            value={state.description}
          />
        </label>
      </div>

      <div className="ts-palette" role="group" aria-label="添加题目">
        <span className="eyebrow">添加题目</span>
        {(Object.keys(QUESTION_KIND_LABELS) as Question["type"][]).map((kind) => (
          <button
            className="button button-secondary ts-palette-btn"
            key={kind}
            onClick={() => dispatch({ type: "add", kind })}
            type="button"
          >
            + {QUESTION_KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <div className="ts-flow">
        {state.questions.map((q, i) => (
          <QuestionCard
            dispatch={dispatch}
            index={i}
            key={q.id}
            q={q}
            total={state.questions.length}
          />
        ))}
        {state.questions.length === 0 ? (
          <p className="ts-empty">还没有题目——从上方选择题型开始出题。</p>
        ) : null}
      </div>
    </div>
  );
}
