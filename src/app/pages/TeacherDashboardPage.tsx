import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { CALCULATOR_STAGES } from "../../features/calculator";
import { CPU_STAGES } from "../../features/cpu";
import { DECODING_STAGES } from "../../features/decoding";
import { IS_SIM_STAGES } from "../../features/is-sim";
import { LUNCH_STAGES } from "../../features/lunch-shift";
import { IMAGE_SAMPLING_STAGES } from "../../features/image-sampling/domain/stages";
import { COLOR_QUANT_STAGES } from "../../features/color-quantization/domain/stages";
import { TaskDashboard, type AssignmentSummary } from "../../features/task-sheets/ui/TaskDashboard";
import { useLabCatalog } from "../../shared/lab/labs";
import { labMetadata } from "../../shared/lab/labMetadata";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Icon } from "../../shared/ui/Icon";
import "./dashboard.css";
import "../../features/task-sheets/ui/taskSheets.css";

/** First-level dashboard category: lab matrix vs task-sheet responses. */
type DashKind = "lab" | "task";

type LabOption = {
  id: string;
  title: string;
  stages: { index: number; englishTitle: string; title: string }[];
};

const LAB_OPTIONS: LabOption[] = [
  { id: "calculator", title: labMetadata.calculator.title, stages: CALCULATOR_STAGES },
  { id: "cpu", title: labMetadata.cpu.title, stages: CPU_STAGES },
  { id: "decoding", title: labMetadata.decoding.title, stages: DECODING_STAGES },
  { id: "is-sim", title: labMetadata["is-sim"].title, stages: IS_SIM_STAGES },
  { id: "lunch-shift", title: labMetadata["lunch-shift"].title, stages: LUNCH_STAGES },
  {
    id: "image-sampling",
    title: labMetadata["image-sampling"].title,
    stages: IMAGE_SAMPLING_STAGES,
  },
  {
    id: "color-quantization",
    title: labMetadata["color-quantization"].title,
    stages: COLOR_QUANT_STAGES,
  },
];

type MatrixCell = {
  stageIndex: number;
  score: number;
  total: number;
  passed: boolean;
  submissionId: string;
  submittedAt: string;
};

type MatrixRow = {
  userId: string;
  studentNo: string;
  name: string;
  currentStage: number;
  cells: Record<string, MatrixCell>;
  lastActiveAt: string | null;
};

type MatrixPayload = { classId: string; className: string; rows: MatrixRow[] };

type SubmissionDetail = {
  id: string;
  studentNo: string;
  name: string;
  stageIndex: number;
  score: number;
  total: number;
  passed: boolean;
  submittedAt: string;
  testSummary: {
    categories?: Record<string, { passed: number; total: number }>;
    parts?: { id: string; label: string; ok: boolean; detail: string | null }[];
    predictions?: {
      promptId: string;
      prompt: string;
      selected: string;
      correct: boolean;
    }[];
    error?: string | null;
  };
};

type DrawerCheck = {
  id: string;
  label: string;
  passed: number;
  total: number;
  detail?: string | null;
};

function drawerChecks(summary: SubmissionDetail["testSummary"]): DrawerCheck[] {
  const categories = Object.entries(summary.categories ?? {});
  if (categories.length > 0) {
    return categories.map(([label, bucket]) => ({
      id: label,
      label,
      passed: bucket.passed,
      total: bucket.total,
    }));
  }
  return (summary.parts ?? []).map((part) => ({
    id: part.id,
    label: part.label,
    passed: part.ok ? 1 : 0,
    total: 1,
    detail: part.detail,
  }));
}

function timeOf(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function CellView({
  cell,
  onOpen,
  openTitle,
}: {
  cell: MatrixCell | undefined;
  onOpen?: () => void;
  openTitle?: string;
}) {
  if (!cell) return <span className="cell-empty">—</span>;
  if (cell.passed) {
    return onOpen ? (
      <button
        className="cell-pass"
        onClick={onOpen}
        title={openTitle ?? "查看提交详情"}
        type="button"
      >
        <Icon name="check" size={14} />
      </button>
    ) : (
      <span className="cell-pass">
        <Icon name="check" size={14} />
      </span>
    );
  }
  return onOpen ? (
    <button className="cell-score" onClick={onOpen} type="button">
      {cell.score}/{cell.total}
    </button>
  ) : (
    <span className="cell-score">
      {cell.score}/{cell.total}
    </span>
  );
}

export function TeacherDashboardPage() {
  const { classId } = useParams({ strict: false }) as { classId?: string };
  const search = useSearch({ strict: false }) as {
    kind?: string;
    lab?: string;
    assignment?: string;
  };
  const navigate = useNavigate();
  const { status, role, session } = useAuth();
  const [payload, setPayload] = useState<MatrixPayload | null>(null);
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const isAdmin = role === "admin";

  const kind: DashKind = search.kind === "task" ? "task" : "lab";
  const catalog = useLabCatalog(status === "authenticated");
  // The dashboard reports one class's progress, so only labs open to THIS
  // class's students stay in the picker; admins keep full access.
  const labOptions = LAB_OPTIONS.filter((l) => {
    if (isAdmin) return true;
    const entry = catalog?.get(l.id);
    if (entry?.visible === false) return false;
    return !entry?.visibleClassIds || !classId || entry.visibleClassIds.includes(classId);
  });
  const lab = labOptions.find((l) => l.id === search.lab) ?? labOptions[0] ?? LAB_OPTIONS[0];
  const assignment = assignments.find((a) => a.id === search.assignment) ?? assignments[0] ?? null;

  const load = useCallback(() => {
    if (!classId) return;
    void api
      .get<MatrixPayload>(`/api/classes/${classId}/dashboard?lab=${lab.id}`)
      .then(setPayload)
      .catch((caught) => setError(describeApiError(caught)));
  }, [classId, lab.id]);

  const loadAssignments = useCallback(() => {
    if (!classId) return;
    void api
      .get<{ assignments: AssignmentSummary[] }>(`/api/classes/${classId}/task-assignments`)
      .then((p) => setAssignments(p.assignments))
      .catch((caught) => setError(describeApiError(caught)));
  }, [classId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (kind === "task") loadAssignments();
    else load();
  }, [status, kind, load, loadAssignments]);

  const clearRecords = (row: MatrixRow) => {
    if (
      !window.confirm(
        `确定清空 ${row.name}（${row.studentNo}）的全部做题记录？该学生的关卡进度会被重置。`,
      )
    ) {
      return;
    }
    setNotice(null);
    void api
      .del<{ cleared: { submissions: number; projects: number } }>(
        `/api/admin/users/${row.userId}/records`,
      )
      .then((result) => {
        setNotice(`已清空 ${row.name} 的做题记录（${result.cleared.submissions} 条提交）。`);
        load();
      })
      .catch((caught) => setError(describeApiError(caught)));
  };

  const openDetail = (submissionId: string) => {
    void api
      .get<SubmissionDetail>(`/api/classes/${classId}/dashboard/submissions/${submissionId}`)
      .then(setDetail)
      .catch((caught) => setError(describeApiError(caught)));
  };

  /** Admin replay of a student's lab — own route, own page, never writes back. */
  const openPreview = (row: MatrixRow, cell?: MatrixCell) => {
    if (!classId) return;
    void navigate({
      to: "/classes/$classId/students/$userId/labs/calculator",
      params: { classId, userId: row.userId },
      search: cell?.submissionId ? { submission: cell.submissionId } : { stage: row.currentStage },
    });
  };

  const selectClass = (nextClassId: string) => {
    void navigate({
      params: { classId: nextClassId },
      search,
      to: "/classes/$classId/dashboard",
    });
  };

  const selectKind = (next: DashKind) => {
    void navigate({
      params: { classId: classId ?? "" },
      search: next === "task" ? { kind: "task" } : { kind: "lab", lab: lab.id },
      to: "/classes/$classId/dashboard",
    });
  };

  const selectLab = (labId: string) => {
    void navigate({
      params: { classId: classId ?? "" },
      search: { kind: "lab", lab: labId },
      to: "/classes/$classId/dashboard",
    });
  };

  const selectAssignment = (nextAssignmentId: string) => {
    void navigate({
      params: { classId: classId ?? "" },
      search: { kind: "task", assignment: nextAssignmentId },
      to: "/classes/$classId/dashboard",
    });
  };

  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous" || (role && !isStaffRole(role))) {
    return (
      <AppPageLayout className="dashboard-page">
        <main className="not-found" role="status">
          <p className="eyebrow">看板 / 无权访问</p>
          <h1>只有教师或管理员可以查看班级看板</h1>
        </main>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout className="dashboard-page">
      <main aria-label="学生进度矩阵" className="page-content">
        <div className="dashboard-heading">
          <div className="dashboard-heading-copy">
            <p className="eyebrow">班级看板</p>
            <h1>{kind === "task" ? "任务单提交" : "学生进度"}</h1>
            <p>
              {kind === "task"
                ? "查看每次任务单布置的提交与批改。"
                : "按关卡查看当前班级每位学生的最新提交结果。"}
            </p>
          </div>
          <div className="dashboard-controls">
            {(session?.memberships.length ?? 0) > 0 ? (
              <label className="field-select" htmlFor="dashboard-class-select">
                <span>班级</span>
                <select
                  aria-label="选择班级"
                  id="dashboard-class-select"
                  onChange={(event) => selectClass(event.target.value)}
                  value={classId ?? ""}
                >
                  {session?.memberships.map((membership) => (
                    <option key={membership.classId} value={membership.classId}>
                      {membership.className}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field-select" htmlFor="dashboard-kind-select">
              <span>分类</span>
              <select
                aria-label="看板分类"
                id="dashboard-kind-select"
                onChange={(event) => selectKind(event.target.value as DashKind)}
                value={kind}
              >
                <option value="lab">实验</option>
                <option value="task">任务单</option>
              </select>
            </label>
            {classId ? (
              <Link
                className="button button-ghost"
                params={{ classId }}
                to="/classes/$classId/members"
              >
                成员管理
              </Link>
            ) : null}
            {kind === "lab" ? (
              <label className="field-select" htmlFor="dashboard-lab-select">
                <span>实验</span>
                <select
                  aria-label="选择实验"
                  id="dashboard-lab-select"
                  onChange={(event) => selectLab(event.target.value)}
                  value={lab.id}
                >
                  {labOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field-select" htmlFor="dashboard-assignment-select">
                <span>任务单</span>
                <select
                  aria-label="选择任务单"
                  disabled={assignments.length === 0}
                  id="dashboard-assignment-select"
                  onChange={(event) => selectAssignment(event.target.value)}
                  value={assignment?.id ?? ""}
                >
                  {assignments.length === 0 ? <option value="">尚未布置</option> : null}
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                      {a.archived ? "（已归档）" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
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

        {kind === "task" && classId ? (
          <TaskDashboard
            assignment={assignment}
            classId={classId}
            onAssignmentsChanged={loadAssignments}
          />
        ) : (
          <div aria-label="学生进度横向滚动区" className="matrix-scroll" tabIndex={0}>
            <table className="matrix-table">
              <caption className="sr-only">按关卡显示每位学生的最新提交结果</caption>
              <thead>
                <tr>
                  <th scope="col">学号</th>
                  <th scope="col">姓名</th>
                  {lab.stages.map((stage) => (
                    <th key={stage.index} scope="col" title={stage.title}>
                      {stage.englishTitle}
                    </th>
                  ))}
                  <th scope="col">最后活动</th>
                  {isAdmin ? <th scope="col">操作</th> : null}
                </tr>
              </thead>
              <tbody>
                {(payload?.rows ?? []).map((row) => (
                  <tr key={row.studentNo}>
                    <th scope="row">{row.studentNo}</th>
                    <td>{row.name}</td>
                    {lab.stages.map((stage) => (
                      <td key={stage.index}>
                        <CellView
                          cell={row.cells[String(stage.index)]}
                          onOpen={(() => {
                            const cell = row.cells[String(stage.index)];
                            if (!cell) return undefined;
                            if (isAdmin && lab.id === "calculator") {
                              return () => openPreview(row, cell);
                            }
                            if (lab.id === "cpu") return () => openDetail(cell.submissionId);
                            return cell.passed ? undefined : () => openDetail(cell.submissionId);
                          })()}
                          openTitle={
                            isAdmin && lab.id === "calculator" ? "预览学生画布" : undefined
                          }
                        />
                      </td>
                    ))}
                    <td>{timeOf(row.lastActiveAt)}</td>
                    {isAdmin ? (
                      <td>
                        <div className="matrix-row-actions">
                          {lab.id === "calculator" ? (
                            <button
                              className="cell-score"
                              onClick={() => openPreview(row)}
                              title="模拟该学生看到的画布（仅前端预览，刷新还原）"
                              type="button"
                            >
                              预览画布
                            </button>
                          ) : null}
                          <button
                            className="cell-score"
                            onClick={() => clearRecords(row)}
                            title="删除该学生的全部提交和关卡进度"
                            type="button"
                          >
                            清空记录
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {payload && payload.rows.length === 0 ? (
                  <tr>
                    <td colSpan={lab.stages.length + (isAdmin ? 4 : 3)}>
                      还没有学生加入这个班级。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {detail ? (
        <div className="drawer-scrim" role="presentation" onClick={() => setDetail(null)}>
          <aside
            aria-label="提交详情"
            className="drawer"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <p className="eyebrow">
                {detail.studentNo} {detail.name}
              </p>
              <h2>
                第 {detail.stageIndex} 关 · {detail.score} / {detail.total}
              </h2>
              <button
                aria-label="关闭详情"
                className="drawer-close"
                onClick={() => setDetail(null)}
                type="button"
              >
                <Icon name="x" size={16} />
              </button>
            </header>

            {detail.testSummary.error ? (
              <p className="test-error">{detail.testSummary.error}</p>
            ) : null}

            <ul className="drawer-categories">
              {drawerChecks(detail.testSummary).map((check) => {
                const ok = check.passed === check.total;
                return (
                  <li className={ok ? "is-pass" : "is-fail"} key={check.id}>
                    <span>
                      {check.label}
                      {check.detail ? <small>{check.detail}</small> : null}
                    </span>
                    <span className="drawer-category-score">
                      {check.passed}/{check.total} <Icon name={ok ? "check" : "x"} size={13} />
                    </span>
                  </li>
                );
              })}
            </ul>
            {detail.testSummary.predictions && detail.testSummary.predictions.length > 0 ? (
              <section aria-label="预测首答">
                <h3>预测首答</h3>
                <ul className="drawer-categories drawer-predictions">
                  {detail.testSummary.predictions.map((prediction) => (
                    <li
                      className={prediction.correct ? "is-pass" : "is-fail"}
                      key={prediction.promptId}
                    >
                      <span>{prediction.prompt}</span>
                      <span>首答：{prediction.selected}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <p className="drawer-note">提交时间 {timeOf(detail.submittedAt)}</p>
          </aside>
        </div>
      ) : null}
    </AppPageLayout>
  );
}
