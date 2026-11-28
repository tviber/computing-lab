import { useLocation, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, Match, Show, Switch } from "solid-js";
import { TaskDashboard } from "../../features/task-sheets/ui/TaskDashboard";
import { isStaffRole, useAuth } from "../../shared/auth";
import { useLabCatalog } from "../../shared/lab/labs";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { DashboardControls } from "./teacher-dashboard/DashboardControls";
import { firstParam } from "./teacher-dashboard/model";
import { LAB_OPTIONS } from "./teacher-dashboard/options";
import { ProgressMatrix } from "./teacher-dashboard/ProgressMatrix";
import { SubmissionDetailDrawer } from "./teacher-dashboard/SubmissionDetailDrawer";
import type { DashKind, MatrixCell, MatrixRow } from "./teacher-dashboard/types";
import { useTeacherDashboardData } from "./teacher-dashboard/useTeacherDashboardData";
import "./dashboard.css";
import "../../features/task-sheets/ui/taskSheets.css";

export function TeacherDashboardPage() {
  const params = useParams<{ classId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();

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
    return LAB_OPTIONS.filter((labOption) => {
      if (admin) return true;
      const entry = cat?.get(labOption.id);
      if (entry?.visible === false) return false;
      return !entry?.visibleClassIds || !cid || entry.visibleClassIds.includes(cid);
    });
  });

  const lab = createMemo(() => {
    const options = labOptions();
    const requested = labParam();
    return options.find((option) => option.id === requested) ?? options[0] ?? LAB_OPTIONS[0];
  });

  const data = useTeacherDashboardData({
    authStatus: () => auth.status,
    classId,
    kind,
    labId: () => lab().id,
  });

  const payload = createMemo(() => {
    const currentMatrix = data.matrix();
    const cid = classId();
    return currentMatrix?.labId === lab().id && currentMatrix.payload.classId === cid
      ? currentMatrix.payload
      : null;
  });

  const assignment = createMemo(() => {
    const list = data.assignments();
    const requested = assignmentParam();
    return list.find((item) => item.id === requested) ?? list[0] ?? null;
  });

  const openPreview = (row: MatrixRow, cell?: MatrixCell) => {
    const cid = classId();
    if (!cid) return;
    const query = cell?.submissionId
      ? `?submission=${encodeURIComponent(cell.submissionId)}`
      : `?stage=${row.currentStage}`;
    navigate(`/classes/${cid}/students/${row.userId}/labs/calculator${query}`);
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
            <DashboardControls
              assignment={assignment()}
              assignments={data.assignments()}
              classId={classId()}
              kind={kind()}
              lab={lab()}
              labOptions={labOptions()}
              memberships={auth.session?.memberships ?? []}
              onSelectAssignment={selectAssignment}
              onSelectClass={selectClass}
              onSelectKind={selectKind}
              onSelectLab={selectLab}
            />
            <Show when={data.error()}>
              {(message) => (
                <p class="test-error" role="alert">
                  {message()}
                </p>
              )}
            </Show>
            <Show when={data.notice()}>
              {(message) => (
                <p class="dashboard-note" role="status">
                  {message()}
                </p>
              )}
            </Show>

            <Show
              fallback={
                <ProgressMatrix
                  isAdmin={isAdmin()}
                  lab={lab()}
                  onClearRecords={data.clearRecords}
                  onOpenDetail={data.openDetail}
                  onOpenPreview={openPreview}
                  payload={payload()}
                />
              }
              when={kind() === "task" && classId()}
            >
              {(cid) => (
                <TaskDashboard
                  assignment={assignment()}
                  classId={cid()}
                  onAssignmentsChanged={() => void data.loadAssignments()}
                />
              )}
            </Show>
          </main>

          <SubmissionDetailDrawer
            detail={data.detail()}
            detailError={data.detailError()}
            lab={lab()}
            onOpenChange={data.closeDetail}
            open={data.detailOpen()}
          />
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
