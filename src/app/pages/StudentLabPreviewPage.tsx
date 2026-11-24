/**
 * Admin-only student preview: replay one student's calculator lab exactly as
 * they see it — drafts, unlocked components, stage progress. All interaction
 * is local to this page (no autosave, no judge), so a refresh always
 * restores the student's real state.
 */

import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useReducer, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Icon } from "../../shared/ui/Icon";
import type { CircuitGraph, ComponentDef } from "../../features/calculator/domain/graph";
import { getStage } from "../../features/calculator/domain/stages";
import {
  createCalculatorLessonState,
  transitionCalculatorLesson,
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

function fmtTime(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function InspectMeta({ submission }: { submission: InspectTarget["submission"] }) {
  const categories = submission.testSummary?.categories ?? {};
  return (
    <section aria-label="提交快照信息" className="inspect-meta">
      <p className="inspect-meta-head">
        <strong className={submission.passed ? "is-pass" : "is-fail"}>
          提交快照 · {submission.score}/{submission.total} · {submission.passed ? "通过" : "未通过"}
        </strong>
        <span className="inspect-meta-time">提交于 {fmtTime(submission.submittedAt)}</span>
      </p>
      {submission.testSummary?.error ? (
        <p className="test-error">{submission.testSummary.error}</p>
      ) : null}
      {Object.keys(categories).length > 0 ? (
        <ul className="drawer-categories">
          {Object.entries(categories).map(([category, bucket]) => {
            const ok = bucket.passed === bucket.total;
            return (
              <li className={ok ? "is-pass" : "is-fail"} key={category}>
                <span>{category}</span>
                <span className="drawer-category-score">
                  {bucket.passed}/{bucket.total} <Icon name={ok ? "check" : "x"} size={13} />
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export function StudentLabPreviewPage() {
  const { classId, userId } = useParams({ strict: false }) as {
    classId?: string;
    userId?: string;
  };
  const search = useSearch({ strict: false }) as { stage?: number; submission?: string };
  const navigate = useNavigate();
  const { status, role } = useAuth();
  const requestedStage = useMemo(() => {
    const value = Number(search.stage);
    return Number.isInteger(value) ? value : undefined;
  }, [search]);
  const requestedSubmission =
    typeof search.submission === "string" && search.submission !== ""
      ? search.submission
      : undefined;

  const [state, dispatch] = useReducer(transitionCalculatorLesson, undefined, () =>
    createCalculatorLessonState(1),
  );
  const [student, setStudent] = useState<StudentRef | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionMeta[]>([]);
  const [inspect, setInspect] = useState<InspectTarget | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const stage = getStage(state.stageIndex);

  // One-shot load: drafts + progress + submission index, plus the requested
  // submission snapshot when the URL names one (dashboard cell clicks land
  // straight on the judged snapshot).
  useEffect(() => {
    if (status !== "authenticated" || role !== "admin" || !userId) return;
    let cancelled = false;
    const detailRequest = requestedSubmission
      ? api.get<SubmissionResponse>(
          `${canvasUrl(userId, "submission")}&submission=${requestedSubmission}`,
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
          stageIndex: requestedStage,
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
    // URL params are read once on entry; later navigation is driven by the
    // URL-sync effect below, not by refetching.
  }, [status, role, userId]);

  // Leaving the inspected stage reverts to the live draft automatically —
  // a snapshot belongs to one stage only.
  useEffect(() => {
    if (inspect && inspect.submission.stageIndex !== state.stageIndex) setInspect(null);
  }, [inspect, state.stageIndex]);

  // Keep ?stage= / ?submission= in step so refresh reopens the same view.
  useEffect(() => {
    if (!projectLoaded || !classId || !userId) return;
    const stageParam = state.stageIndex === 1 ? undefined : state.stageIndex;
    const submissionParam = inspect?.submission.id;
    if ((requestedStage ?? 1) === state.stageIndex && requestedSubmission === submissionParam) {
      return;
    }
    void navigate({
      to: "/classes/$classId/students/$userId/labs/calculator",
      params: { classId, userId },
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        stage: stageParam,
        submission: submissionParam,
      }),
      replace: true,
    });
  }, [
    classId,
    inspect,
    navigate,
    projectLoaded,
    requestedStage,
    requestedSubmission,
    state.stageIndex,
    userId,
  ]);

  const openSubmission = (submissionId: string) => {
    if (!userId) return;
    void api
      .get<SubmissionResponse>(`${canvasUrl(userId, "submission")}&submission=${submissionId}`)
      .then((detail) => {
        if (detail.canvas.kind !== "circuit") {
          setLoadError("这份快照不是电路数据，无法在画布中预览。");
          return;
        }
        if (detail.submission.stageIndex !== state.stageIndex) {
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

  const stageSubmissions = submissions.filter((s) => s.stageIndex === state.stageIndex);

  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous" || role !== "admin") {
    return (
      <AppPageLayout className="dashboard-page">
        <main className="not-found" role="status">
          <p className="eyebrow">学生画布 / 无权访问</p>
          <h1>只有管理员可以查看学生画布</h1>
        </main>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout
      className="calculator-lab student-preview"
      topbarProps={{
        subtitle: stage ? <AnnotatedText text={stage.englishTitle} /> : undefined,
        title: student
          ? `${student.studentNo} ${student.name} · ${stage?.title ?? ""}`
          : "学生画布预览",
      }}
    >
      <div className="preview-toolbar">
        <p className="preview-note" role="status">
          <Icon name="circle" size={10} />
          预览模式：可以拖动画布、切换开关，改动只在本页生效，刷新即还原。
        </p>
        <label className="field-select" htmlFor="preview-revision-select">
          <span>版本</span>
          <select
            id="preview-revision-select"
            onChange={(event) =>
              event.target.value ? openSubmission(event.target.value) : setInspect(null)
            }
            value={inspect?.submission.id ?? ""}
          >
            <option value="">当前草稿{updatedAt ? ` · 更新于 ${fmtTime(updatedAt)}` : ""}</option>
            {stageSubmissions.map((submission) => (
              <option key={submission.id} value={submission.id}>
                提交 · {submission.score}/{submission.total} · {fmtTime(submission.submittedAt)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!projectLoaded ? (
        <p className="home-loading" role="status">
          正在载入…
        </p>
      ) : (
        <CalculatorLabWorkspace
          dispatch={dispatch}
          error={loadError}
          inspect={
            inspect
              ? { graph: inspect.graph, meta: <InspectMeta submission={inspect.submission} /> }
              : null
          }
          state={state}
        />
      )}
    </AppPageLayout>
  );
}
