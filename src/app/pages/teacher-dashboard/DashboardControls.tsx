import { For, Show } from "solid-js";
import type { AuthState } from "../../../shared/auth";
import type { AssignmentSummary } from "../../../features/task-sheets/ui/TaskDashboard";
import { AppLink } from "../../../shared/ui/AppLink";
import type { DashKind, LabOption } from "./types";

type Membership = NonNullable<AuthState["session"]>["memberships"][number];

export function DashboardControls(props: {
  memberships: readonly Membership[];
  classId?: string;
  kind: DashKind;
  lab: LabOption;
  labOptions: readonly LabOption[];
  assignments: readonly AssignmentSummary[];
  assignment: AssignmentSummary | null;
  onSelectClass: (classId: string) => void;
  onSelectKind: (kind: DashKind) => void;
  onSelectLab: (labId: string) => void;
  onSelectAssignment: (assignmentId: string) => void;
}) {
  return (
    <div class="dashboard-controls">
      <Show when={props.memberships.length > 0}>
        <label class="field-select dashboard-class-control" for="dashboard-class-select">
          <span>班级</span>
          <select
            aria-label="选择班级"
            id="dashboard-class-select"
            onChange={(event) => props.onSelectClass(event.currentTarget.value)}
            value={props.classId ?? ""}
          >
            <For each={props.memberships}>
              {(membership) => (
                <option
                  selected={membership.classId === (props.classId ?? "")}
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
          onChange={(event) => props.onSelectKind(event.currentTarget.value as DashKind)}
          value={props.kind}
        >
          <option value="lab">实验</option>
          <option value="task">任务单</option>
        </select>
      </label>
      <Show
        fallback={
          <label class="field-select dashboard-subject-control" for="dashboard-assignment-select">
            <span>任务单</span>
            <select
              aria-label="选择任务单"
              disabled={props.assignments.length === 0}
              id="dashboard-assignment-select"
              onChange={(event) => props.onSelectAssignment(event.currentTarget.value)}
              value={props.assignment?.id ?? ""}
            >
              <Show when={props.assignments.length === 0}>
                <option value="">尚未布置</option>
              </Show>
              <For each={props.assignments}>
                {(assignment) => (
                  <option
                    selected={assignment.id === (props.assignment?.id ?? "")}
                    value={assignment.id}
                  >
                    {assignment.title}
                    {assignment.archived ? "（已归档）" : ""}
                  </option>
                )}
              </For>
            </select>
          </label>
        }
        when={props.kind === "lab"}
      >
        <label class="field-select dashboard-subject-control" for="dashboard-lab-select">
          <span>实验</span>
          <select
            aria-label="选择实验"
            id="dashboard-lab-select"
            onChange={(event) => props.onSelectLab(event.currentTarget.value)}
            value={props.lab.id}
          >
            <For each={props.labOptions}>
              {(option) => (
                <option selected={option.id === props.lab.id} value={option.id}>
                  {option.title}
                </option>
              )}
            </For>
          </select>
        </label>
      </Show>
      <Show when={props.classId}>
        {(classId) => (
          <AppLink
            class="button button-secondary dashboard-member-control"
            href={`/classes/${classId()}/members`}
          >
            成员管理
          </AppLink>
        )}
      </Show>
    </div>
  );
}
