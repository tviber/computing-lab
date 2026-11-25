/**
 * Task-mode dashboard: per-question stats strip and the student × status table.
 * The assignment itself is selected in the page's controls row (it is the
 * second-level option of the 分类 → 任务单 drill-down); the review drawer lives
 * in TaskReviewDrawer.
 */

import { TaskCheckbox } from "./TaskCheckbox";
import { useCallback, useEffect, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { TaskReviewDrawer } from "./TaskReviewDrawer";
import type { SheetSchema } from "../domain/schema";

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

function timeOf(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function StatsStrip({
  stats,
  schema,
  submittedCount,
}: {
  stats: QuestionStat[];
  schema: SheetSchema;
  submittedCount: number;
}) {
  if (submittedCount === 0) return null;
  return (
    <div className="ts-stat-strip" role="region" aria-label="题目统计">
      <p className="ts-stat-row">
        <span className="q-label">题目统计</span>
        <span className="ts-stat-detail">基于 {submittedCount} 份已提交答卷</span>
      </p>
      {stats.map((stat, i) => {
        const q = schema.questions[i];
        const label = `Q${i + 1}`;
        if (stat.type === "fill") {
          const rates = stat.blanks.map((b) => pct(b.correctRate)).join(" / ");
          const worst = stat.blanks.reduce(
            (a, b) => (b.correctRate < a.correctRate ? b : a),
            stat.blanks[0],
          );
          return (
            <p className="ts-stat-row" key={stat.questionId}>
              <span className="q-label">{label} 填空</span>
              <span className="ts-stat-pct">各空正确率 {rates}</span>
              {worst && worst.topWrong.length > 0 ? (
                <span className="ts-stat-detail">
                  高频错答：{worst.topWrong.map((w) => `“${w.answer}”×${w.count}`).join("、")}
                </span>
              ) : null}
            </p>
          );
        }
        if (stat.type === "choice") {
          const optionTexts = new Map(
            q?.type === "choice" ? q.options.map((o) => [o.id, o.text]) : [],
          );
          const dist = Object.entries(stat.optionCounts)
            .map(([id, n]) => `${optionTexts.get(id) ?? id} ${n}`)
            .join(" · ");
          return (
            <p className="ts-stat-row" key={stat.questionId}>
              <span className="q-label">{label} 选择</span>
              <span className="ts-stat-pct">正确率 {pct(stat.correctRate)}</span>
              <span className="ts-stat-detail">选项分布：{dist}</span>
            </p>
          );
        }
        return (
          <p className="ts-stat-row" key={stat.questionId}>
            <span className="q-label">{label} 简答</span>
            <span className="ts-stat-pct">
              {stat.averageScore === null ? "待批改" : `平均 ${stat.averageScore} 分`}
            </span>
            <span className="ts-stat-detail">
              已批 {stat.reviewedCount}/{submittedCount}
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function TaskDashboard({
  classId,
  assignment,
  onAssignmentsChanged,
}: {
  classId: string;
  assignment: AssignmentSummary | null;
  onAssignmentsChanged: () => void;
}) {
  const assignmentId = assignment?.id ?? "";
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [stats, setStats] = useState<{ stats: QuestionStat[]; submittedCount: number } | null>(
    null,
  );
  const [schema, setSchema] = useState<SheetSchema | null>(null);
  const [detail, setDetail] = useState<ResponseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);

  const loadRows = useCallback(() => {
    if (!assignmentId) {
      setRows([]);
      setStats(null);
      setSchema(null);
      return;
    }
    void api
      .get<{ rows: ResponseRow[]; schema: SheetSchema }>(
        `/api/classes/${classId}/task-assignments/${assignmentId}/responses`,
      )
      .then((p) => {
        setRows(p.rows);
        setSchema(p.schema);
      })
      .catch((caught) => setError(describeApiError(caught)));
    void api
      .get<{ stats: QuestionStat[]; submittedCount: number }>(
        `/api/classes/${classId}/task-assignments/${assignmentId}/stats`,
      )
      .then(setStats)
      .catch(() => setStats(null));
  }, [classId, assignmentId]);

  useEffect(loadRows, [loadRows]);

  const openDetail = (responseId: string | null) => {
    if (!responseId) return;
    void api
      .get<{ response: ResponseDetail; schema: SheetSchema }>(
        `/api/classes/${classId}/task-assignments/${assignmentId}/responses/${responseId}`,
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
      .patch(`/api/classes/${classId}/task-assignments/${target.id}`, { archived: true })
      .then(() => {
        setNotice(`已归档「${target.title}」。`);
        onAssignmentsChanged();
      })
      .catch((caught) => setError(describeApiError(caught)));
  };

  const visibleRows = onlyPending
    ? rows.filter((r) => r.status !== "submitted" && r.status !== "reviewed")
    : rows;
  const current = assignment;

  return (
    <>
      <div className="dashboard-subbar">
        {current ? (
          <p className="dashboard-submeta">
            已交 {current.submittedCount}/{current.studentCount}
            {current.needsReviewCount > 0 ? ` · ${current.needsReviewCount} 份待批` : ""}
            {current.dueAt ? ` · 截止 ${timeOf(current.dueAt)}` : ""}
            {!current.archived ? (
              <>
                {" "}
                ·{" "}
                <button
                  className="cell-score"
                  onClick={() => archiveAssignment(current)}
                  type="button"
                >
                  归档
                </button>
              </>
            ) : null}
          </p>
        ) : null}
        <TaskCheckbox checked={onlyPending} onChange={(checked) => setOnlyPending(checked)}>
          只看未交
        </TaskCheckbox>
      </div>

      {error ? (
        <p className="test-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="dashboard-note" role="status">
          {notice}
        </p>
      ) : null}

      {assignment === null ? (
        <p className="ts-empty">
          还没有布置过任务单——到「任务单」页创建并布置一份，学生会在这里被你看到。
        </p>
      ) : (
        <>
          {stats && schema ? (
            <StatsStrip schema={schema} stats={stats.stats} submittedCount={stats.submittedCount} />
          ) : null}

          <div aria-label="任务单提交列表" className="matrix-scroll" tabIndex={0}>
            <table className="matrix-table">
              <caption className="sr-only">每位学生的任务单提交状态</caption>
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
                {visibleRows.map((row) => (
                  <tr key={row.userId}>
                    <th scope="row">{row.studentNo}</th>
                    <td>{row.name}</td>
                    <td>
                      <span className={`ts-task-badge ${row.status}`}>
                        {STATUS_LABELS[row.status]}
                      </span>{" "}
                      {row.late ? <span className="ts-task-badge late">迟交</span> : null}
                    </td>
                    <td>{row.finalScore !== null ? `${row.finalScore}/${row.finalTotal}` : "—"}</td>
                    <td>{timeOf(row.submittedAt)}</td>
                    <td>
                      {row.responseId ? (
                        <button
                          className="cell-score"
                          onClick={() => openDetail(row.responseId)}
                          type="button"
                        >
                          查看
                        </button>
                      ) : (
                        <span className="cell-empty">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>{onlyPending ? "所有人都交啦。" : "还没有学生。"}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detail && schema ? (
        <TaskReviewDrawer
          classId={classId}
          assignmentId={assignmentId}
          onClose={(changed) => {
            setDetail(null);
            if (changed) {
              loadRows();
              onAssignmentsChanged();
            }
          }}
          response={detail}
          schema={schema}
        />
      ) : null}
    </>
  );
}
