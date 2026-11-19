import { Hono } from "hono";
import { jsonError, requireMembership, type AppVariables } from "../http/context.ts";
import { parseJsonColumn } from "../db/client.ts";
import { isLabOpenToClass, labInfo } from "../labs.ts";

type MatrixCell = {
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
  cells: Record<number, MatrixCell>;
  lastActiveAt: string | null;
};

const DEFAULT_LAB_ID = "calculator";

export function dashboardRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get("/", (c) => {
    const auth = requireMembership(c, "teacher");
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const labId = c.req.query("lab") ?? DEFAULT_LAB_ID;
    const lab = labInfo(labId);
    if (!lab) return jsonError(c, 404, "unknown-lab");
    const db = c.get("db");
    if (auth.user.role !== "admin" && !isLabOpenToClass(db, labId, auth.membership.classId)) {
      return jsonError(c, 403, "lab-not-available");
    }
    const classId = auth.membership.classId;

    const students = db
      .prepare(
        `SELECT u.student_no AS studentNo, u.name, u.id AS userId
         FROM class_members m JOIN users u ON u.id = m.user_id
         WHERE m.class_id = ? AND m.role = 'student'
         ORDER BY u.student_no`,
      )
      .all(classId) as { studentNo: string; name: string; userId: string }[];

    const latest = db
      .prepare(
        `SELECT s.user_id AS userId, s.stage_index AS stageIndex, s.score, s.total, s.passed,
                s.id AS submissionId, s.submitted_at AS submittedAt
         FROM submissions s
         JOIN class_members m ON m.user_id = s.user_id AND m.class_id = ?
         WHERE s.lab_id = ? AND s.stage_index BETWEEN 1 AND ?
           AND s.submitted_at = (
             SELECT MAX(x.submitted_at) FROM submissions x
             WHERE x.user_id = s.user_id AND x.stage_index = s.stage_index AND x.lab_id = s.lab_id
           )`,
      )
      .all(classId, labId, lab.stageCount) as {
      userId: string;
      stageIndex: number;
      score: number;
      total: number;
      passed: number;
      submissionId: string;
      submittedAt: string;
    }[];

    const projects = db
      .prepare(
        `SELECT p.user_id AS userId, p.current_stage AS currentStage, p.updated_at AS updatedAt
         FROM student_projects p
         JOIN class_members m ON m.user_id = p.user_id AND m.class_id = ?
         WHERE p.lab_id = ?`,
      )
      .all(classId, labId) as { userId: string; currentStage: number; updatedAt: string }[];

    const cellsByUser = new Map<string, Record<number, MatrixCell>>();
    const lastByUser = new Map<string, string>();
    for (const row of latest) {
      const cells = cellsByUser.get(row.userId) ?? {};
      cells[row.stageIndex] = {
        stageIndex: row.stageIndex,
        score: row.score,
        total: row.total,
        passed: row.passed === 1,
        submissionId: row.submissionId,
        submittedAt: row.submittedAt,
      };
      cellsByUser.set(row.userId, cells);
      const prev = lastByUser.get(row.userId);
      if (!prev || row.submittedAt > prev) lastByUser.set(row.userId, row.submittedAt);
    }

    const stageByUser = new Map<string, number>();
    for (const row of projects) {
      stageByUser.set(row.userId, row.currentStage);
      const prev = lastByUser.get(row.userId);
      if (!prev || row.updatedAt > prev) lastByUser.set(row.userId, row.updatedAt);
    }

    const rows: MatrixRow[] = students.map((s) => ({
      userId: s.userId,
      studentNo: s.studentNo,
      name: s.name,
      currentStage: stageByUser.get(s.userId) ?? 1,
      cells: cellsByUser.get(s.userId) ?? {},
      lastActiveAt: lastByUser.get(s.userId) ?? null,
    }));

    return c.json({ classId, className: auth.membership.className, labId, rows });
  });

  app.get("/submissions/:submissionId", (c) => {
    const auth = requireMembership(c, "teacher");
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const submissionId = c.req.param("submissionId");
    if (!submissionId) return jsonError(c, 400, "invalid-submission");

    const row = c
      .get("db")
      .prepare(
        `SELECT s.id, s.stage_index AS stageIndex, s.score, s.total, s.passed,
                s.test_summary AS testSummary, s.submitted_at AS submittedAt,
                u.student_no AS studentNo, u.name
         FROM submissions s
         JOIN users u ON u.id = s.user_id
         JOIN class_members m ON m.user_id = s.user_id AND m.class_id = ?
         WHERE s.id = ?`,
      )
      .get(auth.membership.classId, submissionId) as
      | {
          id: string;
          stageIndex: number;
          score: number;
          total: number;
          passed: number;
          testSummary: string;
          submittedAt: string;
          studentNo: string;
          name: string;
        }
      | undefined;
    if (!row) return jsonError(c, 404, "not-found");
    return c.json({
      ...row,
      passed: row.passed === 1,
      testSummary: parseJsonColumn(row.testSummary, null),
    });
  });

  return app;
}
