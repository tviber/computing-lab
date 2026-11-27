import { useParams } from "@solidjs/router";
import { Button } from "@ui-sdk/solid/button";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
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
  const params = useParams<{ classId?: string; assignmentId?: string }>();
  const auth = useAuth();
  const [payload, setPayload] = createSignal<Payload | null>(null);
  const [answers, setAnswers] = createSignal<AnswerMap>({});
  const [error, setError] = createSignal<string | null>(null);
  const [savedAt, setSavedAt] = createSignal<string | null>(null);
  const [submitting, setSubmitting] = createSignal(false);
  const [reloadTick, setReloadTick] = createSignal(0);

  let timer: ReturnType<typeof setTimeout> | null = null;
  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  const url = createMemo(() =>
    params.classId && params.assignmentId
      ? `/api/classes/${params.classId}/task-assignments/${params.assignmentId}/response`
      : null,
  );

  const load = () => setReloadTick((n) => n + 1);

  const fetchKey = createMemo(() => {
    const u = url();
    return auth.status === "authenticated" && u ? `${u}\0${reloadTick()}` : "";
  });

  createEffect(fetchKey, (key) => {
    if (!key) return;
    const currentUrl = key.slice(0, key.indexOf("\0"));
    let active = true;
    void api
      .get<Payload>(currentUrl)
      .then((p) => {
        if (!active) return;
        setPayload(p);
        setAnswers(p.response.answers ?? {});
      })
      .catch((caught) => {
        if (active) setError(describeApiError(caught));
      });
    return () => {
      active = false;
    };
  });

  const editable = createMemo(() => {
    const p = payload();
    return (
      p !== null &&
      (p.response.status === "not_started" ||
        p.response.status === "in_progress" ||
        p.response.status === "returned")
    );
  });

  const setAnswer = (qid: string, value: AnswerValue) => {
    const currentUrl = url();
    if (!editable() || !currentUrl) return;
    const next = { ...answers(), [qid]: value };
    setAnswers(next);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void api
        .put(currentUrl, { answers: next })
        .then((r) => setSavedAt((r as { savedAt: string }).savedAt))
        .catch((caught) => setError(describeApiError(caught)));
    }, 600);
  };

  const submit = () => {
    const currentUrl = url();
    if (!currentUrl || !window.confirm("提交后不能再修改，确定提交？")) return;
    setSubmitting(true);
    void api
      .post(`${currentUrl}/submit`)
      .then(() => {
        setSubmitting(false);
        load();
      })
      .catch((caught) => {
        setSubmitting(false);
        setError(describeApiError(caught));
      });
  };

  const assignment = createMemo(() => payload()?.assignment);
  const response = createMemo(() => payload()?.response);
  const statusKey = createMemo(() => response()?.status ?? "not_started");
  const overdue = createMemo(() => {
    const a = assignment();
    const r = response();
    return a?.dueAt && r?.status !== "submitted" && r?.status !== "reviewed"
      ? new Date(a.dueAt).getTime() < Date.now()
      : false;
  });

  return (
    <Switch
      fallback={
        <AppPageLayout class="dashboard-page">
          <main class="page-content">
            <div class="dashboard-heading">
              <div class="dashboard-heading-copy">
                <p class="eyebrow">任务单</p>
                <h1>{assignment()?.title ?? "任务单"}</h1>
                <p>
                  <span class={`ts-task-badge ${statusKey()}`}>{STATUS_LABELS[statusKey()]}</span>{" "}
                  {assignment()?.dueAt
                    ? `截止 ${new Date(assignment()!.dueAt!).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                    : "无截止时间"}
                  {overdue() ? "（已过截止，仍可提交，会标记为迟交）" : ""}
                </p>
              </div>
              <span aria-live="polite" class="save-indicator">
                <Show when={editable() && savedAt()}>
                  草稿已保存 <Icon name="check" size={12} />
                </Show>
              </span>
            </div>

            <Show when={error()}>
              {(msg) => (
                <p class="test-error" role="alert">
                  {msg()}
                </p>
              )}
            </Show>

            <Show when={response()?.status === "returned"}>
              <p class="test-error" role="alert">
                老师退回了这份任务单，请修改后重新提交。
              </p>
            </Show>

            <Show
              when={
                response() &&
                (response()!.status === "submitted" || response()!.status === "reviewed")
              }
            >
              <div class="ts-stat-strip" role="status">
                <p class="ts-stat-row">
                  <span class="q-label">得分</span>
                  <span class="ts-stat-pct">
                    {response()?.finalScore ?? "—"} / {response()?.finalTotal ?? "—"}
                  </span>
                  <span class="ts-stat-detail">
                    {response()?.status === "reviewed"
                      ? "老师已批改"
                      : "客观题已自动判分，简答题待老师批改"}
                  </span>
                </p>
                <Show when={response()?.review?.comment}>
                  {(comment) => (
                    <p class="ts-stat-row">
                      <span class="q-label">评语</span>
                      <span>{comment()}</span>
                    </p>
                  )}
                </Show>
              </div>
            </Show>

            <div class="ts-answer-list">
              <For each={payload()?.schema.questions ?? []}>
                {(q, index) => (
                  <QuestionAnswer
                    grading={response()?.grading?.[q.id]}
                    index={index()}
                    onChange={(v) => setAnswer(q.id, v)}
                    q={q}
                    readOnly={!editable()}
                    review={response()?.review?.questions[q.id]}
                    value={answers()[q.id]}
                  />
                )}
              </For>
            </div>

            <Show when={editable()}>
              <div class="ts-actions">
                <Button
                  class="button button-primary"
                  disabled={submitting()}
                  onClick={submit}
                  type="button"
                >
                  {response()?.status === "returned" ? "重新提交" : "提交"}
                </Button>
              </div>
            </Show>
          </main>
        </AppPageLayout>
      }
    >
      <Match
        when={
          auth.status === "loading" || (auth.status === "authenticated" && !payload() && !error())
        }
      >
        <p class="home-loading" role="status">
          正在载入…
        </p>
      </Match>
    </Switch>
  );
}
