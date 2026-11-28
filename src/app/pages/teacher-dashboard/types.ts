import type { SubmissionCheck } from "../../../shared/lab/submissionPresentation";
import type { LabId } from "../../../shared/lab/labMetadata";
import type { AppLabEntry, DashboardStage } from "../../labRegistry";

export type DashKind = "lab" | "task";

export type LabOption = {
  id: LabId;
  title: string;
  stages: readonly DashboardStage[];
  supportsCanvasPreview: boolean;
  submissionCheck?: AppLabEntry["submissionCheck"];
};

export type MatrixCell = {
  stageIndex: number;
  score: number;
  total: number;
  passed: boolean;
  submissionId: string;
  submittedAt: string;
};

export type MatrixRow = {
  userId: string;
  studentNo: string;
  name: string;
  currentStage: number;
  cells: Record<string, MatrixCell>;
  lastActiveAt: string | null;
};

export type MatrixPayload = { classId: string; className: string; rows: MatrixRow[] };

export type SubmissionDetail = {
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

export type DrawerCheck = SubmissionCheck & {
  passed: number;
  total: number;
  detail?: string | null;
};
