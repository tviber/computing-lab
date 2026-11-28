import { createEffect, createMemo, createSignal, untrack } from "solid-js";
import { api, describeApiError } from "../../../shared/api/client";
import type { AuthState } from "../../../shared/auth";
import type { AssignmentSummary } from "../../../features/task-sheets/ui/TaskDashboard";
import type { LabId } from "../../../shared/lab/labMetadata";
import { createLatestRequest } from "./latestRequest";
import type { DashKind, MatrixPayload, MatrixRow, SubmissionDetail } from "./types";

export type TeacherDashboardDataOptions = {
  authStatus: () => AuthState["status"];
  classId: () => string | undefined;
  kind: () => DashKind;
  labId: () => LabId;
};

export function useTeacherDashboardData(options: TeacherDashboardDataOptions) {
  const [matrix, setMatrix] = createSignal<{ labId: LabId; payload: MatrixPayload } | null>(null);
  const [assignments, setAssignments] = createSignal<AssignmentSummary[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [detailOpen, setDetailOpen] = createSignal(false);
  const [detail, setDetail] = createSignal<SubmissionDetail | null>(null);
  const [detailError, setDetailError] = createSignal<string | null>(null);
  const matrixRequest = createLatestRequest();
  const assignmentsRequest = createLatestRequest();
  const detailRequest = createLatestRequest();

  const loadMatrix = async () => {
    const classId = untrack(options.classId);
    const labId = untrack(options.labId);
    if (!classId) return;
    setError(null);
    const result = await matrixRequest.run(() =>
      api.get<MatrixPayload>(`/api/classes/${classId}/dashboard?lab=${labId}`),
    );
    if (result.status === "applied") {
      setError(null);
      setMatrix({ labId, payload: result.value });
    } else if (result.status === "error") {
      setError(describeApiError(result.error));
    }
  };

  const loadAssignments = async () => {
    const classId = untrack(options.classId);
    if (!classId) return;
    setError(null);
    const result = await assignmentsRequest.run(() =>
      api.get<{ assignments: AssignmentSummary[] }>(`/api/classes/${classId}/task-assignments`),
    );
    if (result.status === "applied") {
      setError(null);
      setAssignments(result.value.assignments);
    } else if (result.status === "error") {
      setError(describeApiError(result.error));
    }
  };

  const loadKey = createMemo(() => {
    if (options.authStatus() !== "authenticated") return "";
    const classId = options.classId();
    if (!classId) return "";
    return options.kind() === "task" ? `task:${classId}` : `lab:${classId}:${options.labId()}`;
  });

  createEffect(loadKey, (key) => {
    if (!key) {
      matrixRequest.cancel();
      assignmentsRequest.cancel();
      return;
    }
    if (key.startsWith("task:")) {
      matrixRequest.cancel();
      void loadAssignments();
    } else {
      assignmentsRequest.cancel();
      void loadMatrix();
    }
  });

  const detailResetKey = createMemo(
    () => [options.classId() ?? "", options.kind(), options.labId(), options.authStatus()] as const,
    {
      equals: (prev, next) =>
        prev[0] === next[0] && prev[1] === next[1] && prev[2] === next[2] && prev[3] === next[3],
    },
  );
  createEffect(detailResetKey, () => {
    detailRequest.cancel();
    setDetailOpen(false);
    setDetail(null);
    setDetailError(null);
  });

  const openDetail = (submissionId: string) => {
    const classId = options.classId();
    if (!classId) return;
    setDetail(null);
    setDetailError(null);
    setDetailOpen(true);
    void detailRequest
      .run(() =>
        api.get<SubmissionDetail>(`/api/classes/${classId}/dashboard/submissions/${submissionId}`),
      )
      .then((result) => {
        if (result.status === "applied") setDetail(result.value);
        else if (result.status === "error") setDetailError(describeApiError(result.error));
      });
  };

  const closeDetail = (nextOpen: boolean) => {
    if (!nextOpen) {
      detailRequest.cancel();
      setDetail(null);
      setDetailError(null);
    }
    setDetailOpen(nextOpen);
  };

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
        void loadMatrix();
      })
      .catch((caught) => setError(describeApiError(caught)));
  };

  return {
    matrix,
    assignments,
    error,
    notice,
    detail,
    detailError,
    detailOpen,
    openDetail,
    closeDetail,
    clearRecords,
    loadAssignments,
  };
}
