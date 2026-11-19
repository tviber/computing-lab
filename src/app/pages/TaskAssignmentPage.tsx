import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Icon } from "../../shared/ui/Icon";
import {
  QuestionAnswer,
  type AnswerMap,
  type AnswerValue,
  type PublicGrading,
  type PublicSheetSchema,
} from "../../features/task-sheets";
import "../../features/task-sheets/ui/taskSheets.css";
import "./dashboard.css";

type ResponseState = {
  status: "not_started" | "in_progress" | "submitted" | "reviewed" | "returned";
  answers: AnswerMap;
  grading?: Record<string, PublicGrading> | null;
  review?: {
    questions: Record<string, { score?: number; comment?: string }>;
    comment?: string;
  } | null;
  finalScore?: number | null;
  finalTotal?: number | null;
  submittedAt?: string | null;
};

type Payload = {
  assignment: { id: string; title: string; dueAt: string | null; archived: boolean };
  schema: PublicSheetSchema;
  response: ResponseState;
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  submitted: "已提交",
  reviewed: "已批改",
  returned: "待重做",
};

export function TaskAssignmentPage() {
  const { classId, assignmentId } = useParams({ strict: false }) as {
    classId?: string;
    assignmentId?: string;
  };
  const { status } = useAuth();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url =
    classId && assignmentId
      ? `/api/classes/${classId}/task-assignments/${assignmentId}/response`
      : null;

  const load = useCallback(() => {
    if (!url) return;
    void api
      .get<Payload>(url)
      .then((p) => {
        setPayload(p);
        setAnswers(p.response.answers ?? {});
      })
      .catch((caught) => setError(describeApiError(caught)));
  }, [url]);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  const editable =
    payload !== null &&
    (payload.response.status === "not_started" ||
      payload.response.status === "in_progress" ||
      payload.response.status === "returned");

  const setAnswer = (qid: string, value: AnswerValue) => {
    if (!editable || !url) return;
    const next = { ...answers, [qid]: value };
    setAnswers(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void api
        .put(url, { answers: next })
        .then((r) => setSavedAt((r as { savedAt: string }).savedAt))
        .catch((caught) => setError(describeApiError(caught)));
    }, 600);
  };

  const submit = () => {
    if (!url || !window.confirm("提交后不能再修改，确定提交？")) return;
    setSubmitting(true);
    void api
      .post(`${url}/submit`)
      .then(() => {
        setSubmitting(false);
        load();
      })
      .catch((caught) => {
        setSubmitting(false);
        setError(describeApiError(caught));
      });
  };

  if (status === "loading" || (status === "authenticated" && !payload && !error)) {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }

  const assignment = payload?.assignment;
  const response = payload?.response;
  const statusKey = response?.status ?? "not_started";
  const overdue =
    assignment?.dueAt && response?.status !== "submitted" && response?.status !== "reviewed"
      ? new Date(assignment.dueAt).getTime() < Date.now()
      : false;

  return (
    <AppPageLayout className="dashboard-page">
      <main className="page-content">
        <div className="dashboard-heading">
          <div className="dashboard-heading-copy">
            <p className="eyebrow">任务单</p>
            <h1>{assignment?.title ?? "任务单"}</h1>
            <p>
              <span className={`ts-task-badge ${statusKey}`}>{STATUS_LABELS[statusKey]}</span>{" "}
              {assignment?.dueAt
                ? `截止 ${new Date(assignment.dueAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                : "无截止时间"}
              {overdue ? "（已过截止，仍可提交，会标记为迟交）" : ""}
            </p>
          </div>
          <span aria-live="polite" className="save-indicator">
            {editable && savedAt ? (
              <>
                草稿已保存 <Icon name="check" size={12} />
              </>
            ) : null}
          </span>
        </div>

        {error ? (
          <p className="test-error" role="alert">
            {error}
          </p>
        ) : null}

        {response?.status === "returned" ? (
          <p className="test-error" role="alert">
            老师退回了这份任务单，请修改后重新提交。
          </p>
        ) : null}

        {response && (response.status === "submitted" || response.status === "reviewed") ? (
          <div className="ts-stat-strip" role="status">
            <p className="ts-stat-row">
              <span className="q-label">得分</span>
              <span className="ts-stat-pct">
                {response.finalScore ?? "—"} / {response.finalTotal ?? "—"}
              </span>
              <span className="ts-stat-detail">
                {response.status === "reviewed"
                  ? "老师已批改"
                  : "客观题已自动判分，简答题待老师批改"}
              </span>
            </p>
            {response.review?.comment ? (
              <p className="ts-stat-row">
                <span className="q-label">评语</span>
                <span>{response.review.comment}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="ts-answer-list">
          {(payload?.schema.questions ?? []).map((q, i) => (
            <QuestionAnswer
              grading={response?.grading?.[q.id]}
              index={i}
              key={q.id}
              onChange={(v) => setAnswer(q.id, v)}
              q={q}
              readOnly={!editable}
              review={response?.review?.questions[q.id]}
              value={answers[q.id]}
            />
          ))}
        </div>

        {editable ? (
          <div className="ts-actions">
            <button
              className="button button-primary"
              disabled={submitting}
              onClick={submit}
              type="button"
            >
              {response?.status === "returned" ? "重新提交" : "提交"}
            </button>
          </div>
        ) : null}
      </main>
    </AppPageLayout>
  );
}
