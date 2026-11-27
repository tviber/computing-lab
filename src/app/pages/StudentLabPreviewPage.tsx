/**
 * Admin-only student preview: replay one student's calculator lab exactly as
 * they see it — drafts, unlocked components, stage progress. All interaction
 * is local to this page (no autosave, no judge), so a refresh always
 * restores the student's real state.
 */

import { useParams, useSearchParams } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  untrack,
} from "solid-js";
import { api, describeApiError } from "../../shared/api/client";
import { useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Icon } from "../../shared/ui/Icon";
import type { CircuitGraph, ComponentDef } from "../../features/calculator/domain/graph";
import { getStage } from "../../features/calculator/domain/stages";
import {
  createCalculatorLessonState,
  transitionCalculatorLesson,
  type CalculatorLessonAction,
} from "../../features/calculator/lesson/state";
import { CalculatorLabWorkspace } from "../../features/calculator/ui/CalculatorLabWorkspace";
import { AnnotatedText } from "../../features/calculator/ui/CalculatorTerms";
import "./dashboard.css";
import "./studentPreview.css";

type CanvasPayload = { kind: "circuit" | "raw"; graph?: unknown; data?: unknown };

type StudentRef = { id: string; studentNo: string; name: string };

type AdminDraftBundle = {
  student: StudentRef;
  labId: string;
  revision: "draft";
  updatedAt: string | null;
  currentStage: number;
  passedStages: number[];
  drafts: Record<string, CanvasPayload>;
  components: ComponentDef[];
};

type SubmissionMeta = {
  id: string;
  stageIndex: number;
  score: number;
  total: number;
  passed: boolean;
  submittedAt: string;
};

type SubmissionIndexResponse = { submissions: SubmissionMeta[] };

type SubmissionResponse = {
  submission: SubmissionMeta & {
    testSummary?: {
      categories?: Record<string, { passed: number; total: number }>;
      error?: string | null;
    };
  };
  canvas: CanvasPayload;
};

type InspectTarget = { submission: SubmissionResponse["submission"]; graph: CircuitGraph };

const canvasUrl = (userId: string, revision: string) =>
  `/api/admin/users/${userId}/labs/calculator/canvas?revision=${revision}`;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function fmtTime(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function InspectMeta(props: { submission: InspectTarget["submission"] }) {
  const categories = createMemo(() =>
    Object.entries(props.submission.testSummary?.categories ?? {}),
  );
  return (
    <section aria-label="提交快照信息" class="inspect-meta">
      <p class="inspect-meta-head">
        <strong class={props.submission.passed ? "is-pass" : "is-fail"}>
          提交快照 · {props.submission.score}/{props.submission.total} ·{" "}
          {props.submission.passed ? "通过" : "未通过"}
        </strong>
        <span class="inspect-meta-time">提交于 {fmtTime(props.submission.submittedAt)}</span>
      </p>
      <Show when={props.submission.testSummary?.error}>
        {(err) => <p class="test-error">{err()}</p>}
      </Show>
      <Show when={categories().length > 0}>
        <ul class="drawer-categories">
          <For each={categories()}>
            {([category, bucket]) => {
              const ok = bucket.passed === bucket.total;
              return (
                <li class={ok ? "is-pass" : "is-fail"}>
                  <span>{category}</span>
                  <span class="drawer-category-score">
                    {bucket.passed}/{bucket.total} <Icon name={ok ? "check" : "x"} size={13} />
                  </span>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </section>
  );
}

export function StudentLabPreviewPage() {
  const params = useParams<{ classId?: string; userId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();

  const requestedStage = createMemo(() => {
    const raw = firstParam(searchParams.stage);
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isInteger(value) ? value : undefined;
  });
  const requestedSubmission = createMemo(() => {
    const raw = firstParam(searchParams.submission);
    return typeof raw === "string" && raw !== "" ? raw : undefined;
  });

  const [state, setState] = createSignal(createCalculatorLessonState(1));
  const dispatch = (action: CalculatorLessonAction) => {
    setState((current) => transitionCalculatorLesson(current, action));
  };
  const [student, setStudent] = createSignal<StudentRef | null>(null);
  const [submissions, setSubmissions] = createSignal<SubmissionMeta[]>([]);
  const [inspect, setInspect] = createSignal<InspectTarget | null>(null);
  const [updatedAt, setUpdatedAt] = createSignal<string | null>(null);
  const [projectLoaded, setProjectLoaded] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);

  const stage = createMemo(() => getStage(state().stageIndex));

  // One-shot load: drafts + progress + submission index, plus the requested
  // submission snapshot when the URL names one (dashboard cell clicks land
  // straight on the judged snapshot).
  const loadKey = createMemo(() =>
    auth.status === "authenticated" && auth.role === "admin" && params.userId ? params.userId : "",
  );

  createEffect(loadKey, (userId) => {
    if (!userId) return;
    let cancelled = false;
    const initialStage = untrack(requestedStage);
    const initialSubmission = untrack(requestedSubmission);
    const detailRequest = initialSubmission
      ? api.get<SubmissionResponse>(
          `${canvasUrl(userId, "submission")}&submission=${initialSubmission}`,
        )
      : Promise.resolve(null);
    void Promise.all([
      api.get<AdminDraftBundle>(canvasUrl(userId, "draft")),
      api.get<SubmissionIndexResponse>(canvasUrl(userId, "submission")),
      detailRequest,
    ])
      .then(([bundle, index, detail]) => {
        if (cancelled) return;
        const drafts: Record<number, CircuitGraph> = {};
        for (const [key, canvas] of Object.entries(bundle.drafts)) {
          if (canvas.kind === "circuit") drafts[Number(key)] = canvas.graph as CircuitGraph;
        }
        setStudent(bundle.student);
        setSubmissions(index.submissions);
        setUpdatedAt(bundle.updatedAt);
        if (detail && detail.canvas.kind === "circuit") {
          setInspect({
            submission: detail.submission,
            graph: detail.canvas.graph as CircuitGraph,
          });
        }
        dispatch({
          type: "load-project",
          currentStage: bundle.currentStage,
          passedStages: bundle.passedStages,
          unlockedSubmodules: bundle.components,
          drafts,
          stageIndex: initialStage,
        });
        // A submission snapshot must open even when its stage sits off the
        // student's current unlock path (progress can be reset while
        // submissions remain).
        if (detail) {
          dispatch({
            type: "select-stage",
            stageIndex: detail.submission.stageIndex,
            force: true,
          });
        }
        setProjectLoaded(true);
      })
      .catch((caught) => {
        if (cancelled) return;
        setLoadError(describeApiError(caught));
        setProjectLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  });

  // Leaving the inspected stage reverts to the live draft automatically —
  // a snapshot belongs to one stage only.
  createEffect(
    () => [inspect()?.submission.stageIndex, state().stageIndex] as const,
    ([inspectStage, currentStage]) => {
      if (inspectStage !== undefined && inspectStage !== currentStage) {
        setInspect(null);
      }
    },
  );

  // Keep ?stage= / ?submission= in step so refresh reopens the same view.
  const urlSyncKey = createMemo(() => {
    if (!projectLoaded() || !params.classId || !params.userId) return "";
    const currentStage = state().stageIndex;
    const submissionParam = inspect()?.submission.id;
    if ((requestedStage() ?? 1) === currentStage && requestedSubmission() === submissionParam) {
      return "";
    }
    return `${currentStage === 1 ? "" : currentStage}\0${submissionParam ?? ""}`;
  });

  createEffect(urlSyncKey, (key) => {
    if (!key) return;
    const currentStage = untrack(() => state().stageIndex);
    const submissionParam = untrack(() => inspect()?.submission.id);
    setSearchParams(
      {
        stage: currentStage === 1 ? undefined : String(currentStage),
        submission: submissionParam,
      },
      { replace: true },
    );
  });

  const openSubmission = (submissionId: string) => {
    const userId = params.userId;
    if (!userId) return;
    void api
      .get<SubmissionResponse>(`${canvasUrl(userId, "submission")}&submission=${submissionId}`)
      .then((detail) => {
        if (detail.canvas.kind !== "circuit") {
          setLoadError("这份快照不是电路数据，无法在画布中预览。");
          return;
        }
        if (detail.submission.stageIndex !== state().stageIndex) {
          dispatch({
            type: "select-stage",
            stageIndex: detail.submission.stageIndex,
            force: true,
          });
        }
        setInspect({ submission: detail.submission, graph: detail.canvas.graph as CircuitGraph });
      })
      .catch((caught) => setLoadError(describeApiError(caught)));
  };

  const stageSubmissions = createMemo(() =>
    submissions().filter((s) => s.stageIndex === state().stageIndex),
  );

  return (
    <Switch
      fallback={
        <AppPageLayout
          class="calculator-lab student-preview"
          topbarProps={{
            subtitle: stage() ? <AnnotatedText text={stage()!.englishTitle} /> : undefined,
            title: student()
              ? `${student()!.studentNo} ${student()!.name} · ${stage()?.title ?? ""}`
              : "学生画布预览",
          }}
        >
          <div class="preview-toolbar">
            <p class="preview-note" role="status">
              <Icon name="circle" size={10} />
              预览模式：可以拖动画布、切换开关，改动只在本页生效，刷新即还原。
            </p>
            <label class="field-select" for="preview-revision-select">
              <span>版本</span>
              <select
                id="preview-revision-select"
                onChange={(event) =>
                  event.currentTarget.value
                    ? openSubmission(event.currentTarget.value)
                    : setInspect(null)
                }
                value={inspect()?.submission.id ?? ""}
              >
                <option value="">
                  当前草稿{updatedAt() ? ` · 更新于 ${fmtTime(updatedAt()!)}` : ""}
                </option>
                <For each={stageSubmissions()}>
                  {(submission) => (
                    <option
                      selected={submission.id === (inspect()?.submission.id ?? "")}
                      value={submission.id}
                    >
                      提交 · {submission.score}/{submission.total} ·{" "}
                      {fmtTime(submission.submittedAt)}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </div>

          <Show
            fallback={
              <p class="home-loading" role="status">
                正在载入…
              </p>
            }
            when={projectLoaded()}
          >
            <CalculatorLabWorkspace
              dispatch={dispatch}
              error={loadError()}
              inspect={
                inspect()
                  ? {
                      graph: inspect()!.graph,
                      meta: <InspectMeta submission={inspect()!.submission} />,
                    }
                  : null
              }
              state={state()}
            />
          </Show>
        </AppPageLayout>
      }
    >
      <Match when={auth.status === "loading"}>
        <p class="home-loading" role="status">
          正在载入…
        </p>
      </Match>
      <Match when={auth.status === "anonymous" || auth.role !== "admin"}>
        <AppPageLayout class="dashboard-page">
          <main class="not-found" role="status">
            <p class="eyebrow">学生画布 / 无权访问</p>
            <h1>只有管理员可以查看学生画布</h1>
          </main>
        </AppPageLayout>
      </Match>
    </Switch>
  );
}
