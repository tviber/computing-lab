import type { DashboardStage } from "../../labRegistry";
import type { DrawerCheck, MatrixRow, SubmissionDetail } from "./types";

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function drawerChecks(summary: SubmissionDetail["testSummary"]): DrawerCheck[] {
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

export function stageCompletion(rows: MatrixRow[], stages: readonly DashboardStage[]) {
  const counts = new Map<number, number>();
  for (const stage of stages) {
    let completed = 0;
    for (const row of rows) {
      if (row.cells[String(stage.index)]?.passed) completed += 1;
    }
    counts.set(stage.index, completed);
  }
  return { counts, total: rows.length };
}
