import { dynamic } from "@solidjs/web";
import type { SubmissionCheck } from "../../shared/lab/submissionPresentation";
import { formatDateTime, formatFullDateTime } from "../../shared/ui/formatDateTime";
import { useLocation, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { Button } from "@ui-sdk/solid/button";
import { Dialog, DialogBackdrop, DialogClose, DialogContent } from "@ui-sdk/solid/dialog";
import { Meter, MeterIndicator, MeterTrack, MeterValue } from "@ui-sdk/solid/meter";
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
import { isStaffRole, useAuth } from "../../shared/auth";
import { TaskDashboard, type AssignmentSummary } from "../../features/task-sheets/ui/TaskDashboard";
import { useLabCatalog } from "../../shared/lab/labs";
import { LAB_IDS, labMetadata, type LabId } from "../../shared/lab/labMetadata";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { AppLink } from "../../shared/ui/AppLink";
import { Icon } from "../../shared/ui/Icon";
import { useScrollEdges } from "../../shared/ui/scrollEdges";
import { APP_LABS, type AppLabEntry, type DashboardStage } from "../labRegistry";
import "./dashboard.css";
import "../../features/task-sheets/ui/taskSheets.css";

type DashKind = "lab" | "task";

type LabOption = {
  id: LabId;
  title: string;
  stages: readonly DashboardStage[];
  supportsCanvasPreview: boolean;
  submissionCheck?: AppLabEntry["submissionCheck"];
};

const LAB_OPTIONS: LabOption[] = LAB_IDS.map((id) => {
  const appLab: AppLabEntry = APP_LABS[id];
  return {
    id,
    title: labMetadata[id].title,
    stages: appLab.dashboardStages,
    supportsCanvasPreview: appLab.supportsCanvasPreview ?? false,
    submissionCheck: appLab.submissionCheck,
  };
});

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
    parts?: (SubmissionCheck & { ok: boolean })[];
    error?: string | null;
    detail?: string;
  };
};

type DrawerCheck = SubmissionCheck & {
  passed: number;
  total: number;
  detail?: string | null;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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
    feedback: part.feedback,
    answerSummary: part.answerSummary,
  }));
}

function CellView(props: {
  cell: MatrixCell | undefined;
  onOpen?: (event: MouseEvent) => void;
  openTitle?: string;
  opensDialog?: boolean;
}) {
  return (
    <Switch fallback={<span class="cell-empty">—</span>}>
      <Match when={props.cell?.passed}>
        <Show
          fallback={
            <span class="cell-pass">
              <Icon name="check" size={14} />
            </span>
          }
          when={props.onOpen}
        >
          {(open) => (
            <Button
              class="cell-pass"
              onClick={(event) => open()(event)}
              title={props.openTitle ?? "查看提交详情"}
              type="button"
            >
              <Icon name="check" size={14} />
            </Button>
          )}
        </Show>
      </Match>
      <Match when={props.cell}>
        {(cell) => (
          <Show
            fallback={
              <span class="cell-score">
                {cell().score}/{cell().total}
              </span>
            }
            when={props.onOpen}
          >
            {(open) => (
              <Button
                aria-haspopup={props.opensDialog ? "dialog" : undefined}
                class="cell-score"
                onClick={(event) => open()(event)}
                type="button"
              >
                {cell().score}/{cell().total}
              </Button>
            )}
          </Show>
        )}
      </Match>
    </Switch>
  );
}

export function TeacherDashboardPage() {
  const params = useParams<{ classId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const [matrix, setMatrix] = createSignal<{ labId: LabId; payload: MatrixPayload } | null>(null);
  const [assignments, setAssignments] = createSignal<AssignmentSummary[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [detailOpen, setDetailOpen] = createSignal(false);
  const [detail, setDetail] = createSignal<SubmissionDetail | null>(null);
  const [detailError, setDetailError] = createSignal<string | null>(null);
  const matrixScrollRef = useScrollEdges<HTMLDivElement>();

  let detailSeq = 0;
  let loadSeq = 0;
  let assignmentsSeq = 0;

  const classId = createMemo(() => params.classId);
  const isAdmin = createMemo(() => auth.role === "admin");
  const kind = createMemo<DashKind>(() =>
    firstParam(searchParams.kind) === "task" ? "task" : "lab",
  );
  const labParam = createMemo(() => firstParam(searchParams.lab));
  const assignmentParam = createMemo(() => firstParam(searchParams.assignment));

  createEffect(labParam, (currentLab) => {
    if (currentLab === "ml-intro") {
      setSearchParams({ lab: "logistic-regression" }, { replace: true });
    }
  });

  const catalog = useLabCatalog(() => auth.status === "authenticated");
  const labOptions = createMemo(() => {
    const admin = isAdmin();
    const cat = catalog();
    const cid = classId();
    return LAB_OPTIONS.filter((l) => {
      if (admin) return true;
      const entry = cat?.get(l.id);
      if (entry?.visible === false) return false;
      return !entry?.visibleClassIds || !cid || entry.visibleClassIds.includes(cid);
    });
  });

  const lab = createMemo(() => {
    const options = labOptions();
    const requested = labParam();
    return options.find((l) => l.id === requested) ?? options[0] ?? LAB_OPTIONS[0];
  });

  const payload = createMemo(() => {
    const currentMatrix = matrix();
    const cid = classId();
    return currentMatrix?.labId === lab().id && currentMatrix.payload.classId === cid
      ? currentMatrix.payload
      : null;
  });

  const assignment = createMemo(() => {
    const list = assignments();
    const requested = assignmentParam();
    return list.find((a) => a.id === requested) ?? list[0] ?? null;
  });

  const stageCompletion = createMemo(() => {
    const currentRows = payload()?.rows ?? [];
    const counts = new Map<number, number>();
    for (const stage of lab().stages) {
      let completed = 0;
      for (const row of currentRows) {
        if (row.cells[String(stage.index)]?.passed) completed += 1;
      }
      counts.set(stage.index, completed);
    }
    return { counts, total: currentRows.length };
  });

  const detailResetKey = createMemo(
    () => [classId() ?? "", kind(), lab().id, auth.status] as const,
    {
      equals: (prev, next) =>
        prev[0] === next[0] && prev[1] === next[1] && prev[2] === next[2] && prev[3] === next[3],
    },
  );
  createEffect(detailResetKey, () => {
    ++detailSeq;
    setDetailOpen(false);
  });

  const load = () => {
    const cid = untrack(classId);
    const currentLabId = untrack(() => lab().id);
    if (!cid) return;
    const seq = ++loadSeq;
    setError(null);
    void api
      .get<MatrixPayload>(`/api/classes/${cid}/dashboard?lab=${currentLabId}`)
      .then((next) => {
        if (loadSeq !== seq) return;
        setError(null);
        setMatrix({ labId: currentLabId, payload: next });
      })
      .catch((caught) => {
        if (loadSeq !== seq) return;
        setError(describeApiError(caught));
      });
  };

  const loadAssignments = () => {
    const cid = untrack(classId);
    if (!cid) return;
    const seq = ++assignmentsSeq;
    setError(null);
    void api
      .get<{ assignments: AssignmentSummary[] }>(`/api/classes/${cid}/task-assignments`)
      .then((p) => {
        if (assignmentsSeq !== seq) return;
        setError(null);
        setAssignments(p.assignments);
      })
      .catch((caught) => {
        if (assignmentsSeq !== seq) return;
        setError(describeApiError(caught));
      });
  };

  const loadKey = createMemo(() => {
    if (auth.status !== "authenticated") return "";
    const cid = classId();
    if (!cid) return "";
    return kind() === "task" ? `task:${cid}` : `lab:${cid}:${lab().id}`;
  });

  createEffect(loadKey, (key) => {
    if (!key) return;
    if (key.startsWith("task:")) loadAssignments();
    else load();
  });

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
    const cid = classId();
    if (!cid || detailOpen()) return;
    const seq = ++detailSeq;
    setDetail(null);
    setDetailError(null);
    setDetailOpen(true);

    void api
      .get<SubmissionDetail>(`/api/classes/${cid}/dashboard/submissions/${submissionId}`)
      .then((next) => {
        if (detailSeq === seq && detailOpen()) setDetail(next);
      })
      .catch((caught) => {
        if (detailSeq === seq && detailOpen()) setDetailError(describeApiError(caught));
      });
  };

  const openPreview = (row: MatrixRow, cell?: MatrixCell) => {
    const cid = classId();
    if (!cid) return;
    const qs = cell?.submissionId
      ? `?submission=${encodeURIComponent(cell.submissionId)}`
      : `?stage=${row.currentStage}`;
    navigate(`/classes/${cid}/students/${row.userId}/labs/calculator${qs}`);
  };

  const selectClass = (nextClassId: string) => {
    navigate(`/classes/${nextClassId}/dashboard${location.search}`);
  };

  const selectKind = (next: DashKind) => {
    if (next === "task") {
      setSearchParams({ kind: "task", lab: undefined, assignment: undefined });
    } else {
      setSearchParams({ kind: "lab", lab: lab().id, assignment: undefined });
    }
  };

  const selectLab = (labId: string) => {
    setSearchParams({ kind: "lab", lab: labId, assignment: undefined });
  };

  const selectAssignment = (nextAssignmentId: string) => {
    setSearchParams({ kind: "task", assignment: nextAssignmentId, lab: undefined });
  };

  return (
    <Switch
      fallback={
        <AppPageLayout>
          <main aria-label="学生进度矩阵" class="page-content">
            <div class="dashboard-heading">
              <div class="dashboard-heading-copy">
                <p class="eyebrow">班级看板</p>
                <h1>{kind() === "task" ? "任务单提交" : "学生进度"}</h1>
                <p>
                  {kind() === "task"
                    ? "查看每次任务单布置的提交与批改。"
                    : "按关卡查看当前班级每位学生的最新提交结果。"}
                </p>
              </div>
            </div>
            <div class="dashboard-controls">
              <Show when={(auth.session?.memberships.length ?? 0) > 0}>
                <label class="field-select dashboard-class-control" for="dashboard-class-select">
                  <span>班级</span>
                  <select
                    aria-label="选择班级"
                    id="dashboard-class-select"
                    onChange={(event) => selectClass(event.currentTarget.value)}
                    value={classId() ?? ""}
                  >
                    <For each={auth.session?.memberships ?? []}>
                      {(membership) => (
                        <option
                          selected={membership.classId === (classId() ?? "")}
                          value={membership.classId}
                        >
                          {membership.className}
                        </option>
                      )}
                    </For>
                  </select>
                </label>
              </Show>
              <label class="field-select dashboard-kind-control" for="dashboard-kind-select">
                <span>分类</span>
                <select
                  aria-label="看板分类"
                  id="dashboard-kind-select"
                  onChange={(event) => selectKind(event.currentTarget.value as DashKind)}
                  value={kind()}
                >
                  <option value="lab">实验</option>
                  <option value="task">任务单</option>
                </select>
              </label>
              <Show
                fallback={
                  <label
                    class="field-select dashboard-subject-control"
                    for="dashboard-assignment-select"
                  >
                    <span>任务单</span>
                    <select
                      aria-label="选择任务单"
                      disabled={assignments().length === 0}
                      id="dashboard-assignment-select"
                      onChange={(event) => selectAssignment(event.currentTarget.value)}
                      value={assignment()?.id ?? ""}
                    >
                      <Show when={assignments().length === 0}>
                        <option value="">尚未布置</option>
                      </Show>
                      <For each={assignments()}>
                        {(a) => (
                          <option selected={a.id === (assignment()?.id ?? "")} value={a.id}>
                            {a.title}
                            {a.archived ? "（已归档）" : ""}
                          </option>
                        )}
                      </For>
                    </select>
                  </label>
                }
                when={kind() === "lab"}
              >
                <label class="field-select dashboard-subject-control" for="dashboard-lab-select">
                  <span>实验</span>
                  <select
                    aria-label="选择实验"
                    id="dashboard-lab-select"
                    onChange={(event) => selectLab(event.currentTarget.value)}
                    value={lab().id}
                  >
                    <For each={labOptions()}>
                      {(option) => (
                        <option selected={option.id === lab().id} value={option.id}>
                          {option.title}
                        </option>
                      )}
                    </For>
                  </select>
                </label>
              </Show>
              <Show when={classId()}>
                {(cid) => (
                  <AppLink
                    class="button button-secondary dashboard-member-control"
                    href={`/classes/${cid()}/members`}
                  >
                    成员管理
                  </AppLink>
                )}
              </Show>
            </div>
            <Show when={error()}>
              {(msg) => (
                <p class="test-error" role="alert">
                  {msg()}
                </p>
              )}
            </Show>
            <Show when={notice()}>
              {(msg) => (
                <p class="dashboard-note" role="status">
                  {msg()}
                </p>
              )}
            </Show>

            <Show
              fallback={
                <div
                  aria-label="学生进度横向滚动区"
                  class="matrix-scroll"
                  ref={matrixScrollRef}
                  tabindex={0}
                >
                  <table class="matrix-table">
                    <caption class="sr-only">
                      按关卡显示每位学生的最新提交结果，并标注每关完成人数与班级人数
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">学号</th>
                        <th scope="col">姓名</th>
                        <For each={lab().stages}>
                          {(stage) => {
                            const completed = () => stageCompletion().counts.get(stage.index) ?? 0;
                            const total = () => stageCompletion().total;
                            return (
                              <th aria-label={stage.title} scope="col" title={stage.englishTitle}>
                                <span aria-hidden="true" class="matrix-stage-index">
                                  {String(stage.index).padStart(2, "0")}
                                </span>
                                <span class="matrix-stage-title">{stage.title}</span>
                                <Show
                                  fallback={
                                    <span class="matrix-stage-completion is-empty">完成 —</span>
                                  }
                                  when={total() > 0}
                                >
                                  <Meter
                                    aria-label={`${stage.title}完成人数`}
                                    class={(state) =>
                                      state.percent === 100
                                        ? "matrix-stage-meter is-complete"
                                        : "matrix-stage-meter"
                                    }
                                    format={(value) => `${value}/${total()}`}
                                    getValueLabel={(value, details) =>
                                      `${value} / ${details.max} 人已完成`
                                    }
                                    max={total()}
                                    title={`${completed()} 人已完成，${total() - completed()} 人未完成`}
                                    value={completed()}
                                  >
                                    <span aria-hidden="true" class="matrix-stage-meter-label">
                                      完成
                                    </span>
                                    <MeterValue class="matrix-stage-meter-value" />
                                    <MeterTrack class="matrix-stage-meter-track">
                                      <MeterIndicator class="matrix-stage-meter-fill" />
                                    </MeterTrack>
                                  </Meter>
                                </Show>
                              </th>
                            );
                          }}
                        </For>
                        <th scope="col">最后活动</th>
                        <Show when={isAdmin()}>
                          <th scope="col">操作</th>
                        </Show>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={payload()?.rows ?? []}>
                        {(row) => (
                          <tr>
                            <th scope="row">{row.studentNo}</th>
                            <td>{row.name}</td>
                            <For each={lab().stages}>
                              {(stage) => {
                                const cell = () => row.cells[String(stage.index)];
                                const canPreview = () => isAdmin() && lab().supportsCanvasPreview;
                                return (
                                  <td>
                                    <CellView
                                      cell={cell()}
                                      onOpen={(() => {
                                        const c = cell();
                                        if (!c) return undefined;
                                        if (canPreview()) return () => openPreview(row, c);
                                        if (c.passed) return undefined;
                                        return () => openDetail(c.submissionId);
                                      })()}
                                      opensDialog={!canPreview()}
                                      openTitle={canPreview() ? "预览学生画布" : undefined}
                                    />
                                  </td>
                                );
                              }}
                            </For>
                            <td title={formatFullDateTime(row.lastActiveAt)}>
                              {formatDateTime(row.lastActiveAt)}
                            </td>
                            <Show when={isAdmin()}>
                              <td>
                                <div class="matrix-row-actions">
                                  <Show when={lab().supportsCanvasPreview}>
                                    <Button
                                      class="matrix-action"
                                      onClick={() => openPreview(row)}
                                      title="模拟该学生看到的画布（仅前端预览，刷新还原）"
                                      type="button"
                                    >
                                      预览画布
                                    </Button>
                                  </Show>
                                  <Button
                                    class="matrix-action is-destructive"
                                    onClick={() => clearRecords(row)}
                                    title="删除该学生的全部提交和关卡进度"
                                    type="button"
                                  >
                                    清空记录
                                  </Button>
                                </div>
                              </td>
                            </Show>
                          </tr>
                        )}
                      </For>
                      <Show when={payload() && payload()!.rows.length === 0}>
                        <tr>
                          <td colspan={lab().stages.length + (isAdmin() ? 4 : 3)}>
                            还没有学生加入这个班级。
                          </td>
                        </tr>
                      </Show>
                    </tbody>
                  </table>
                </div>
              }
              when={kind() === "task" && classId()}
            >
              {(cid) => (
                <TaskDashboard
                  assignment={assignment()}
                  classId={cid()}
                  onAssignmentsChanged={loadAssignments}
                />
              )}
            </Show>
          </main>

          <Dialog
            onOpenChange={(next) => {
              if (!next) ++detailSeq;
              setDetailOpen(next);
            }}
            open={detailOpen()}
          >
            <DialogBackdrop class="drawer-backdrop" />
            <DialogContent aria-label="提交详情" class="drawer submission-dialog">
              <div class="submission-dialog-content">
                <DialogClose aria-label="关闭详情" class="drawer-close" type="button">
                  <Icon name="x" size={16} />
                </DialogClose>
                <Switch
                  fallback={
                    <p class="drawer-note" role="status">
                      正在载入提交详情…
                    </p>
                  }
                >
                  <Match when={detail()}>
                    {(d) => (
                      <>
                        <header>
                          <p class="eyebrow">
                            {d().studentNo} {d().name}
                          </p>
                          <h2>
                            第 {d().stageIndex} 关 · {d().score} / {d().total}
                          </h2>
                          <p>
                            {
                              lab().stages.find((stage) => stage.index === d().stageIndex)
                                ?.englishTitle
                            }
                          </p>
                        </header>
                        <Show
                          when={
                            d().testSummary.detail &&
                            !d().testSummary.parts?.length &&
                            !d().testSummary.categories
                          }
                        >
                          <p>{d().testSummary.detail}</p>
                        </Show>
                        <Show when={d().testSummary.error}>
                          {(err) => <p class="test-error">{err()}</p>}
                        </Show>
                        <ul class="drawer-categories">
                          <For each={drawerChecks(d().testSummary)}>
                            {(check) => {
                              const ok = check.passed === check.total;
                              const CheckContent = dynamic(() => lab().submissionCheck);
                              return (
                                <li class={ok ? "is-pass" : "is-fail"}>
                                  <span>
                                    <Show
                                      when={lab().submissionCheck}
                                      fallback={
                                        <>
                                          {check.label}
                                          <Show when={check.detail}>
                                            {(detail) => <small>{detail()}</small>}
                                          </Show>
                                        </>
                                      }
                                    >
                                      <CheckContent
                                        check={check}
                                        summary={d().testSummary.detail}
                                      />
                                    </Show>
                                  </span>
                                  <span class="drawer-category-score">
                                    {check.passed}/{check.total}{" "}
                                    <Icon name={ok ? "check" : "x"} size={13} />
                                  </span>
                                </li>
                              );
                            }}
                          </For>
                        </ul>
                        <p class="drawer-note" title={formatFullDateTime(d().submittedAt)}>
                          提交时间 {formatDateTime(d().submittedAt)}
                        </p>
                      </>
                    )}
                  </Match>
                  <Match when={detailError()}>
                    {(err) => (
                      <p class="test-error" role="alert">
                        {err()}
                      </p>
                    )}
                  </Match>
                </Switch>
              </div>
            </DialogContent>
          </Dialog>
        </AppPageLayout>
      }
    >
      <Match when={auth.status === "loading"}>
        <p class="home-loading" role="status">
          正在载入…
        </p>
      </Match>
      <Match when={auth.status === "anonymous" || (auth.role && !isStaffRole(auth.role))}>
        <AppPageLayout class="dashboard-page">
          <main class="not-found" role="status">
            <p class="eyebrow">看板 / 无权访问</p>
            <h1>只有教师或管理员可以查看班级看板</h1>
          </main>
        </AppPageLayout>
      </Match>
    </Switch>
  );
}
