/**
 * Task-mode dashboard: per-question stats strip and the student × status table.
 * The assignment itself is selected in the page's controls row (it is the
 * second-level option of the 分类 → 任务单 drill-down); the review drawer lives
 * in TaskReviewDrawer.
 */

import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";
import { api, describeApiError } from "../../../shared/api/client";
import { formatDateTime, formatFullDateTime } from "../../../shared/ui/formatDateTime";
import type { SheetSchema } from "../domain/schema";
import { TaskCheckbox } from "./TaskCheckbox";
import { TaskReviewDrawer } from "./TaskReviewDrawer";

export type AssignmentSummary = {
  id: string;
  title: string;
  dueAt: string | null;
  archived: boolean;
  createdAt: string;
  questionCount: number;
  studentCount: number;
  submittedCount: number;
  needsReviewCount: number;
};

export type ResponseRow = {
  userId: string;
  studentNo: string;
  name: string;
  responseId: string | null;
  status: "not_started" | "in_progress" | "submitted" | "reviewed" | "returned";
  autoScore: number | null;
  autoTotal: number | null;
  finalScore: number | null;
  finalTotal: number | null;
  submittedAt: string | null;
  late: boolean;
};

export type QuestionStat =
  | {
      questionId: string;
      type: "fill";
      blanks: {
        blankId: string;
        correctRate: number;
        topWrong: { answer: string; count: number }[];
      }[];
    }
  | {
      questionId: string;
      type: "choice";
      correctRate: number;
      optionCounts: Record<string, number>;
    }
  | { questionId: string; type: "short"; reviewedCount: number; averageScore: number | null };

export type ResponseDetail = {
  id: string;
  userId: string;
  studentNo: string;
  name: string;
  status: string;
  answers: Record<
    string,
    { type: string; blanks?: Record<string, string>; optionIds?: string[]; text?: string }
  >;
  grading: Record<string, import("../domain/grade").QuestionGrading> | null;
  review: { questions: Record<string, { score?: number; comment?: string }>; comment?: string };
  finalScore: number | null;
  finalTotal: number | null;
  submittedAt: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  submitted: "已提交",
  reviewed: "已批改",
  returned: "待重做",
};

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function StatsStrip(props: { stats: QuestionStat[]; schema: SheetSchema; submittedCount: number }) {
  return (
    <Show when={props.submittedCount > 0}>
      <div aria-label="题目统计" class="ts-stat-strip" role="region">
        <p class="ts-stat-row">
          <span class="q-label">题目统计</span>
          <span class="ts-stat-detail">基于 {props.submittedCount} 份已提交答卷</span>
        </p>
        <For each={props.stats}>
          {(stat, i) => {
            const label = () => `Q${i() + 1}`;
            if (stat.type === "fill") {
              const rates = stat.blanks.map((b) => pct(b.correctRate)).join(" / ");
              const worst = stat.blanks.reduce(
                (a, b) => (b.correctRate < a.correctRate ? b : a),
                stat.blanks[0],
              );
              return (
                <p class="ts-stat-row">
                  <span class="q-label">{label()} 填空</span>
                  <span class="ts-stat-pct">各空正确率 {rates}</span>
                  <Show when={worst && worst.topWrong.length > 0}>
                    <span class="ts-stat-detail">
                      高频错答：{worst.topWrong.map((w) => `“${w.answer}”×${w.count}`).join("、")}
                    </span>
                  </Show>
                </p>
              );
            }
            if (stat.type === "choice") {
              const dist = () => {
                const q = props.schema.questions[i()];
                const optionTexts = new Map(
                  q?.type === "choice" ? q.options.map((o) => [o.id, o.text]) : [],
                );
                return Object.entries(stat.optionCounts)
                  .map(([id, n]) => `${optionTexts.get(id) ?? id} ${n}`)
                  .join(" · ");
              };
              return (
                <p class="ts-stat-row">
                  <span class="q-label">{label()} 选择</span>
                  <span class="ts-stat-pct">正确率 {pct(stat.correctRate)}</span>
                  <span class="ts-stat-detail">选项分布：{dist()}</span>
                </p>
              );
            }
            return (
              <p class="ts-stat-row">
                <span class="q-label">{label()} 简答</span>
                <span class="ts-stat-pct">
                  {stat.averageScore === null ? "待批改" : `平均 ${stat.averageScore} 分`}
                </span>
                <span class="ts-stat-detail">
                  已批 {stat.reviewedCount}/{props.submittedCount}
                </span>
              </p>
            );
          }}
        </For>
      </div>
    </Show>
  );
}

export function TaskDashboard(props: {
  classId: string;
  assignment: AssignmentSummary | null;
  onAssignmentsChanged: () => void;
}) {
  const assignmentId = createMemo(() => props.assignment?.id ?? "");
  const [rows, setRows] = createSignal<ResponseRow[]>([]);
  const [stats, setStats] = createSignal<{ stats: QuestionStat[]; submittedCount: number } | null>(
    null,
  );
  const [schema, setSchema] = createSignal<SheetSchema | null>(null);
  const [detail, setDetail] = createSignal<ResponseDetail | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [onlyPending, setOnlyPending] = createSignal(false);

  const loadRows = (classId: string, id: string) => {
    if (!id) {
      setRows([]);
      setStats(null);
      setSchema(null);
      return;
    }
    void api
      .get<{ rows: ResponseRow[]; schema: SheetSchema }>(
        `/api/classes/${classId}/task-assignments/${id}/responses`,
      )
      .then((p) => {
        setRows(p.rows);
        setSchema(p.schema);
      })
      .catch((caught) => setError(describeApiError(caught)));
    void api
      .get<{ stats: QuestionStat[]; submittedCount: number }>(
        `/api/classes/${classId}/task-assignments/${id}/stats`,
      )
      .then(setStats)
      .catch(() => setStats(null));
  };

  const loadKey = createMemo(() => `${props.classId}\0${assignmentId()}`);
  createEffect(loadKey, () => {
    const { classId, id } = untrack(() => ({ classId: props.classId, id: assignmentId() }));
    loadRows(classId, id);
  });

  const openDetail = (responseId: string | null) => {
    if (!responseId) return;
    void api
      .get<{ response: ResponseDetail; schema: SheetSchema }>(
        `/api/classes/${props.classId}/task-assignments/${assignmentId()}/responses/${responseId}`,
      )
      .then((p) => {
        setDetail(p.response);
        setSchema(p.schema);
      })
      .catch((caught) => setError(describeApiError(caught)));
  };

  const archiveAssignment = (target: AssignmentSummary) => {
    if (!window.confirm(`归档「${target.title}」？学生将看不到它，已收答卷保留。`)) return;
    void api
      .patch(`/api/classes/${props.classId}/task-assignments/${target.id}`, { archived: true })
      .then(() => {
        setNotice(`已归档「${target.title}」。`);
        props.onAssignmentsChanged();
      })
      .catch((caught) => setError(describeApiError(caught)));
  };

  const visibleRows = createMemo(() =>
    onlyPending()
      ? rows().filter((r) => r.status !== "submitted" && r.status !== "reviewed")
      : rows(),
  );

  const drawerTarget = createMemo(() => {
    const response = detail();
    const currentSchema = schema();
    return response && currentSchema ? { response, schema: currentSchema } : null;
  });

  return (
    <>
      <div class="dashboard-subbar">
        <Show when={props.assignment}>
          {(current) => (
            <p class="dashboard-submeta">
              已交 {current().submittedCount}/{current().studentCount}
              {current().needsReviewCount > 0 ? ` · ${current().needsReviewCount} 份待批` : ""}
              {current().dueAt ? ` · 截止 ${formatDateTime(current().dueAt)}` : ""}
              <Show when={!current().archived}>
                {" "}
                ·{" "}
                <Button
                  class="cell-score"
                  onClick={() => archiveAssignment(current())}
                  type="button"
                >
                  归档
                </Button>
              </Show>
            </p>
          )}
        </Show>
        <TaskCheckbox checked={onlyPending()} onChange={(checked) => setOnlyPending(checked)}>
          只看未交
        </TaskCheckbox>
      </div>

      <Show when={error()}>
        {(message) => (
          <p class="test-error" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <Show when={notice()}>
        {(message) => (
          <p class="dashboard-note" role="status">
            {message()}
          </p>
        )}
      </Show>

      <Show
        fallback={
          <>
            <Show when={stats() && schema() ? { stats: stats()!, schema: schema()! } : null}>
              {(summary) => (
                <StatsStrip
                  schema={summary().schema}
                  stats={summary().stats.stats}
                  submittedCount={summary().stats.submittedCount}
                />
              )}
            </Show>

            <div aria-label="任务单提交列表" class="matrix-scroll" tabindex={0}>
              <table class="matrix-table">
                <caption class="sr-only">每位学生的任务单提交状态</caption>
                <thead>
                  <tr>
                    <th scope="col">学号</th>
                    <th scope="col">姓名</th>
                    <th scope="col">状态</th>
                    <th scope="col">得分</th>
                    <th scope="col">提交时间</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={visibleRows()}>
                    {(row) => (
                      <tr>
                        <th scope="row">{row.studentNo}</th>
                        <td>{row.name}</td>
                        <td>
                          <span class={`ts-task-badge ${row.status}`}>
                            {STATUS_LABELS[row.status]}
                          </span>{" "}
                          <Show when={row.late}>
                            <span class="ts-task-badge late">迟交</span>
                          </Show>
                        </td>
                        <td>
                          {row.finalScore !== null ? `${row.finalScore}/${row.finalTotal}` : "—"}
                        </td>
                        <td title={formatFullDateTime(row.submittedAt)}>
                          {formatDateTime(row.submittedAt)}
                        </td>
                        <td>
                          <Show fallback={<span class="cell-empty">—</span>} when={row.responseId}>
                            {(responseId) => (
                              <Button
                                class="cell-score"
                                onClick={() => openDetail(responseId())}
                                type="button"
                              >
                                查看
                              </Button>
                            )}
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                  <Show when={visibleRows().length === 0}>
                    <tr>
                      <td colspan={6}>{onlyPending() ? "所有人都交啦。" : "还没有学生。"}</td>
                    </tr>
                  </Show>
                </tbody>
              </table>
            </div>
          </>
        }
        when={props.assignment === null}
      >
        <p class="ts-empty">
          还没有布置过任务单——到「任务单」页创建并布置一份，学生会在这里被你看到。
        </p>
      </Show>

      <Show keyed when={drawerTarget()}>
        {(target) => (
          <TaskReviewDrawer
            assignmentId={assignmentId()}
            classId={props.classId}
            onClose={(changed) => {
              setDetail(null);
              if (changed) {
                loadRows(props.classId, assignmentId());
                props.onAssignmentsChanged();
              }
            }}
            response={target.response}
            schema={target.schema}
          />
        )}
      </Show>
    </>
  );
}
