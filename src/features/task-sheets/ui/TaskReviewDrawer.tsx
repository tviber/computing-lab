/**
 * Teacher review drawer: one student's full response with per-question score
 * overrides and comments. Teachers see the complete schema (accepted answers,
 * correct options, reference answers) — this component is never mounted for
 * students.
 */

import { Button } from "@ui-sdk/solid/button";
import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@ui-sdk/solid/drawer";
import { createMemo, createSignal, For, Match, Show, Switch, untrack } from "solid-js";
import { api, describeApiError } from "../../../shared/api/client";
import { Icon } from "../../../shared/ui/Icon";
import type { QuestionGrading } from "../domain/grade";
import { splitPromptBlanks, type Question, type SheetSchema } from "../domain/schema";
import type { ResponseDetail } from "./TaskDashboard";

function AnswerView(props: {
  q: Question;
  answer: ResponseDetail["answers"][string] | undefined;
  grading: QuestionGrading | undefined;
}) {
  const fillQ = createMemo(() => (props.q.type === "fill" ? props.q : null));
  const choiceQ = createMemo(() => (props.q.type === "choice" ? props.q : null));
  const shortQ = createMemo(() => (props.q.type === "short" ? props.q : null));

  return (
    <Switch>
      <Match when={fillQ()}>
        {(q) => {
          const segments = createMemo(() => splitPromptBlanks(q().prompt));
          const hasCloze = createMemo(() => segments().some((s) => s.type === "blank"));
          const blankText = (id: string) =>
            props.answer?.type === "fill" ? (props.answer.blanks?.[id] ?? "") : "";
          return (
            <>
              <Show when={hasCloze()}>
                <p class="ts-cloze ts-cloze-review">
                  <For each={segments()}>
                    {(seg) => {
                      if (seg.type === "text") return <span>{seg.text}</span>;
                      const blank = () => q().blanks[seg.index];
                      return (
                        <Show when={blank()}>
                          {(b) => {
                            const g = () =>
                              props.grading?.type === "fill"
                                ? props.grading.blanks[b().id]
                                : undefined;
                            return (
                              <span
                                class={`ts-cloze-fill${g() ? (g()!.correct ? " is-right" : " is-wrong") : ""}`}
                              >
                                {g()?.answer?.trim() ? g()!.answer : "未作答"}
                              </span>
                            );
                          }}
                        </Show>
                      );
                    }}
                  </For>
                </p>
              </Show>
              <ul class="ts-review-answers">
                <For each={q().blanks}>
                  {(blank, i) => {
                    const g = () =>
                      props.grading?.type === "fill" ? props.grading.blanks[blank.id] : undefined;
                    return (
                      <li>
                        <span class="q-label">空 {i() + 1}</span>{" "}
                        <span class={g()?.correct ? "is-right" : "is-wrong"}>
                          {blankText(blank.id).trim() ? blankText(blank.id) : <em>未作答</em>}
                        </span>{" "}
                        <Show when={g()}>
                          {(mark) => <Icon name={mark().correct ? "check" : "x"} size={12} />}
                        </Show>
                        <span class="ts-stat-detail">答案：{blank.accept.join(" / ")}</span>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </>
          );
        }}
      </Match>
      <Match when={choiceQ()}>
        {(q) => {
          const selected = createMemo(
            () => new Set(props.answer?.type === "choice" ? props.answer.optionIds : []),
          );
          const correct = createMemo(() => new Set(q().correctOptionIds));
          return (
            <ul class="ts-review-answers">
              <For each={q().options}>
                {(opt) => (
                  <li>
                    <span class={`ts-pick-dot${selected().has(opt.id) ? " is-picked" : ""}`} />
                    <span class={selected().has(opt.id) ? "is-picked" : ""}>{opt.text}</span>
                    <Show when={correct().has(opt.id)}>
                      <span class="ts-stat-detail">
                        {" "}
                        <Icon name="check" size={11} /> 正确
                      </span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          );
        }}
      </Match>
      <Match when={shortQ()}>
        {(q) => (
          <>
            <p class="ts-review-short">
              {props.answer?.type === "short" && (props.answer.text ?? "").trim() !== "" ? (
                props.answer.text
              ) : (
                <em>未作答</em>
              )}
            </p>
            <Show when={q().referenceAnswer}>
              {(ref) => <p class="ts-stat-detail">参考答案:{ref()}</p>}
            </Show>
          </>
        )}
      </Match>
    </Switch>
  );
}

export function TaskReviewDrawer(props: {
  classId: string;
  assignmentId: string;
  response: ResponseDetail;
  schema: SheetSchema;
  onClose: (changed: boolean) => void;
}) {
  const [scores, setScores] = createSignal<Record<string, number | undefined>>(
    untrack(() => {
      const initial: Record<string, number | undefined> = {};
      for (const q of props.schema.questions) {
        const existing = props.response.review.questions[q.id]?.score;
        if (typeof existing === "number") {
          initial[q.id] = existing;
        } else if (q.type !== "short") {
          initial[q.id] = props.response.grading?.[q.id]?.score ?? undefined;
        }
      }
      return initial;
    }),
  );
  const [comments, setComments] = createSignal<Record<string, string>>(
    untrack(() =>
      Object.fromEntries(
        props.schema.questions
          .map((q) => [q.id, props.response.review.questions[q.id]?.comment ?? ""])
          .filter(([, v]) => v !== ""),
      ),
    ),
  );
  const [overall, setOverall] = createSignal(untrack(() => props.response.review.comment ?? ""));
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const submitted = createMemo(
    () => props.response.status === "submitted" || props.response.status === "reviewed",
  );
  const total = createMemo(() =>
    props.schema.questions.reduce((sum, q) => sum + (q.type === "short" ? q.maxScore : q.score), 0),
  );
  const previewScore = createMemo(() =>
    props.schema.questions.reduce((sum, q) => {
      const override = scores()[q.id];
      if (typeof override === "number")
        return sum + Math.max(0, Math.min(override, q.type === "short" ? q.maxScore : q.score));
      if (q.type === "short") return sum;
      return sum + (props.response.grading?.[q.id]?.score ?? 0);
    }, 0),
  );

  const save = () => {
    setBusy(true);
    setError(null);
    const currentScores = scores();
    const currentComments = comments();
    void api
      .patch(
        `/api/classes/${props.classId}/task-assignments/${props.assignmentId}/responses/${props.response.id}/review`,
        {
          questions: Object.fromEntries(
            props.schema.questions.map((q) => [
              q.id,
              {
                ...(currentScores[q.id] !== undefined ? { score: currentScores[q.id] } : {}),
                ...(currentComments[q.id] ? { comment: currentComments[q.id] } : {}),
              },
            ]),
          ),
          comment: overall() || undefined,
        },
      )
      .then(() => props.onClose(true))
      .catch((caught) => {
        setError(describeApiError(caught));
        setBusy(false);
      });
  };

  const sendBack = () => {
    if (!window.confirm("退回这份答卷？学生可以修改后重新提交。")) return;
    setBusy(true);
    void api
      .post(
        `/api/classes/${props.classId}/task-assignments/${props.assignmentId}/responses/${props.response.id}/return`,
      )
      .then(() => props.onClose(true))
      .catch((caught) => {
        setError(describeApiError(caught));
        setBusy(false);
      });
  };

  return (
    <Drawer
      dismissible={!busy()}
      onOpenChange={(open) => {
        if (!open && !busy()) props.onClose(false);
      }}
      open={true}
      side="right"
    >
      <DrawerBackdrop class="drawer-scrim ts-review-drawer-backdrop" />
      <DrawerContent aria-label="答卷详情" class="drawer ts-review-drawer">
        <header>
          <p class="eyebrow">
            {props.response.studentNo} {props.response.name}
          </p>
          <DrawerTitle>
            答卷 · {Math.round(previewScore() * 100) / 100} / {total()}
          </DrawerTitle>
          <DrawerClose aria-label="关闭详情" class="drawer-close" disabled={busy()} type="button">
            <Icon name="x" size={16} />
          </DrawerClose>
        </header>

        <For each={props.schema.questions}>
          {(q, i) => {
            const grading = () => props.response.grading?.[q.id];
            const max = q.type === "short" ? q.maxScore : q.score;
            return (
              <section class="ts-review-q">
                <p class="ts-review-q-head">
                  <span class="q-label">Q{i() + 1}</span>
                  <span>{q.prompt}</span>
                  <span class="ts-answer-max">{max} 分</span>
                </p>
                <AnswerView answer={props.response.answers[q.id]} grading={grading()} q={q} />
                <div class="ts-review-score">
                  <input
                    aria-label={`第 ${i() + 1} 题得分`}
                    max={max}
                    min={0}
                    onInput={(e) =>
                      setScores((s) => ({
                        ...s,
                        [q.id]:
                          e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value),
                      }))
                    }
                    placeholder={q.type === "short" ? "打分" : undefined}
                    step={0.5}
                    type="number"
                    value={scores()[q.id] ?? ""}
                  />
                  <span>
                    / {max} 分
                    {q.type !== "short" && grading() ? `（自动 ${grading()!.score}）` : ""}
                  </span>
                </div>
                <input
                  aria-label={`第 ${i() + 1} 题评语`}
                  class="ts-review-comment"
                  onInput={(e) => setComments((c) => ({ ...c, [q.id]: e.currentTarget.value }))}
                  placeholder="本题评语（可选）"
                  value={comments()[q.id] ?? ""}
                />
              </section>
            );
          }}
        </For>

        <label class="ts-field">
          <span>整体评语</span>
          <textarea
            class="ts-review-comment"
            onInput={(e) => setOverall(e.currentTarget.value)}
            rows={2}
            value={overall()}
          />
        </label>

        <Show when={error()}>
          {(message) => (
            <p class="test-error" role="alert">
              {message()}
            </p>
          )}
        </Show>

        <div class="ts-review-actions">
          <Button
            class="button button-primary"
            disabled={busy() || !submitted()}
            onClick={save}
            type="button"
          >
            保存批改
          </Button>
          <Button
            class="button button-secondary"
            disabled={busy() || !submitted()}
            onClick={sendBack}
            type="button"
          >
            退回重做
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
