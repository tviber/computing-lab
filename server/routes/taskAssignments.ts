import { Hono } from "hono";
import type { Context } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { newId, parseJsonColumn, withTransaction } from "../db/client.ts";
import {
  jsonError,
  requireMembership,
  type AppVariables,
  type GuardFailure,
  type Membership,
} from "../http/context.ts";
import { readJsonObject } from "../http/validation.ts";
import type { SessionUser } from "../auth/session.ts";
import {
  publicSchema,
  validateSheetSchema,
  type SheetSchema,
} from "../../src/features/task-sheets/domain/schema.ts";
import {
  autoGrade,
  publicGrading,
  sanitizeAnswers,
  validateAnswers,
  type AnswerMap,
  type QuestionGrading,
} from "../../src/features/task-sheets/domain/grade.ts";

type AssignmentRow = {
  id: string;
  sheet_id: string | null;
  class_id: string;
  assigned_by: string;
  title: string;
  schema_json: string;
  due_at: string | null;
  archived: number;
  created_at: string;
};

type ResponseRow = {
  id: string;
  assignment_id: string;
  user_id: string;
  answers_json: string;
  auto_score: number | null;
  auto_total: number | null;
  grading_json: string | null;
  review_json: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  final_score: number | null;
  final_total: number | null;
  status: "in_progress" | "submitted" | "reviewed" | "returned";
  submitted_at: string | null;
  updated_at: string;
};

type ReviewPatch = {
  questions: Record<string, { score?: number; comment?: string }>;
  comment?: string;
};

type Auth = { user: SessionUser; membership: Membership };
type TeacherAuth = Auth & { membership: Membership & { role: "teacher" } };

function teacherOnly(c: Context<{ Variables: AppVariables }>): TeacherAuth | GuardFailure {
  const auth = requireMembership(c, "teacher");
  if ("error" in auth) return auth;
  return auth as TeacherAuth;
}

function studentOnly(c: Context<{ Variables: AppVariables }>): Auth | GuardFailure {
  const auth = requireMembership(c);
  if ("error" in auth) return auth;
  // Admins get a synthesized teacher membership, so this also excludes admins —
  // consistent with the lab rule that staff accounts never produce answers.
  if (auth.membership.role !== "student") return { error: "student-required", status: 403 };
  return auth;
}

function assignmentOf(db: DatabaseSync, classId: string, id: string) {
  return db
    .prepare("SELECT * FROM task_assignments WHERE id = ? AND class_id = ?")
    .get(id, classId) as AssignmentRow | undefined;
}

function responseOf(db: DatabaseSync, assignmentId: string, userId: string) {
  return db
    .prepare("SELECT * FROM task_responses WHERE assignment_id = ? AND user_id = ?")
    .get(assignmentId, userId) as ResponseRow | undefined;
}

function getOrCreateResponse(db: DatabaseSync, assignmentId: string, userId: string) {
  // INSERT OR IGNORE + re-select: atomic under UNIQUE (assignment_id,
  // user_id), so a repeat write can never crash on a duplicate key.
  db.prepare(
    "INSERT OR IGNORE INTO task_responses (id, assignment_id, user_id) VALUES (?, ?, ?)",
  ).run(newId(), assignmentId, userId);
  return responseOf(db, assignmentId, userId)!;
}

/** Corrupt schema_json degrades to an empty sheet rather than a 500. */
const EMPTY_SCHEMA: SheetSchema = { version: 1, questions: [] };
const assignmentSchema = (row: { schema_json: string }): SheetSchema =>
  parseJsonColumn<SheetSchema>(row.schema_json, EMPTY_SCHEMA);

function parseReview(raw: string | null): ReviewPatch {
  if (!raw) return { questions: {} };
  try {
    const parsed = JSON.parse(raw) as ReviewPatch;
    return { questions: parsed.questions ?? {}, comment: parsed.comment };
  } catch {
    return { questions: {} };
  }
}

/** Recompute final_score/final_total from grading + review overrides. */
function recomputeFinal(
  schema: SheetSchema,
  grading: Record<string, QuestionGrading>,
  review: ReviewPatch,
) {
  let score = 0;
  let total = 0;
  let allShortReviewed = true;
  for (const q of schema.questions) {
    const g = grading[q.id];
    const max = q.type === "short" ? q.maxScore : q.score;
    total += max;
    const override = review.questions[q.id]?.score;
    if (typeof override === "number") {
      score += Math.max(0, Math.min(override, max));
      continue;
    }
    if (q.type === "short") {
      allShortReviewed = false;
      continue;
    }
    score += g?.score ?? 0;
  }
  return {
    finalScore: Math.round(score * 100) / 100,
    finalTotal: total,
    allShortReviewed,
  };
}

function isoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function assignmentMeta(row: AssignmentRow, schema: SheetSchema) {
  return {
    id: row.id,
    sheetId: row.sheet_id,
    classId: row.class_id,
    assignedBy: row.assigned_by,
    title: row.title,
    dueAt: row.due_at,
    archived: row.archived === 1,
    createdAt: row.created_at,
    questionCount: schema.questions.length,
  };
}

export function taskAssignmentRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  // Assign a sheet to this class. The snapshot freezes grading data at assign
  // time — later template edits never reach this assignment.
  app.post("/", async (c) => {
    const auth = teacherOnly(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 400, "invalid-body");
    const { sheetId, title, dueAt } = body;
    if (typeof sheetId !== "string") return jsonError(c, 400, "invalid-sheet");

    const db = c.get("db");
    const sheet = db.prepare("SELECT * FROM task_sheets WHERE id = ?").get(sheetId) as
      { id: string; owner_user_id: string; title: string; schema_json: string } | undefined;
    // v1 rule: only the owner (or admin) may assign a sheet. Future sharing
    // grants assign-rights without weakening this check's ownership semantics.
    if (!sheet || (sheet.owner_user_id !== auth.user.id && auth.user.role !== "admin")) {
      return jsonError(c, 404, "sheet-not-found");
    }
    // Assigning freezes the snapshot, so the stored draft must be complete:
    // re-validate strictly here rather than trusting the sheet row.
    const sheetSchema = parseJsonColumn<SheetSchema | null>(sheet.schema_json, null);
    const strict = sheetSchema
      ? validateSheetSchema(sheetSchema)
      : ({ ok: false, error: "invalid-schema" } as const);
    if (!strict.ok) return jsonError(c, 400, "sheet-incomplete");
    const schema = strict.schema;
    if (schema.questions.length === 0) return jsonError(c, 400, "sheet-empty");
    const finalTitle =
      typeof title === "string" && title.trim() !== "" ? title.trim().slice(0, 120) : sheet.title;
    if (dueAt !== undefined && dueAt !== null && !isoDate(dueAt)) {
      return jsonError(c, 400, "invalid-due-at");
    }
    const id = newId();
    db.prepare(
      `INSERT INTO task_assignments (id, sheet_id, class_id, assigned_by, title, schema_json, due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      sheetId,
      auth.membership.classId,
      auth.user.id,
      finalTitle,
      sheet.schema_json,
      typeof dueAt === "string" ? dueAt : null,
    );
    return c.json({ assignment: assignmentOf(db, auth.membership.classId, id) }, 201);
  });

  // List assignments. Teachers get submission stats; students get their own
  // status and never see archived ones.
  app.get("/", (c) => {
    const auth = requireMembership(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const classId = auth.membership.classId;

    if (auth.membership.role === "teacher") {
      const rows = db
        .prepare(
          `SELECT a.*,
             (SELECT COUNT(*) FROM class_members m WHERE m.class_id = a.class_id AND m.role='student') AS studentCount,
             (SELECT COUNT(*) FROM task_responses r WHERE r.assignment_id = a.id
               AND r.status IN ('submitted','reviewed')) AS submittedCount,
             (SELECT COUNT(*) FROM task_responses r WHERE r.assignment_id = a.id
               AND r.status = 'submitted') AS needsReviewCount
           FROM task_assignments a WHERE a.class_id = ? ORDER BY a.created_at DESC`,
        )
        .all(classId) as (AssignmentRow & {
        studentCount: number;
        submittedCount: number;
        needsReviewCount: number;
      })[];
      return c.json({
        assignments: rows.map((row) => ({
          ...assignmentMeta(row, assignmentSchema(row)),
          studentCount: row.studentCount,
          submittedCount: row.submittedCount,
          needsReviewCount: row.needsReviewCount,
        })),
      });
    }

    const rows = db
      .prepare(
        `SELECT a.id, a.title, a.due_at, a.created_at, a.schema_json,
                r.status AS responseStatus, r.final_score AS finalScore, r.final_total AS finalTotal,
                r.submitted_at AS submittedAt
         FROM task_assignments a
         LEFT JOIN task_responses r ON r.assignment_id = a.id AND r.user_id = ?
         WHERE a.class_id = ? AND a.archived = 0
         ORDER BY a.created_at DESC`,
      )
      .all(auth.user.id, classId) as {
      id: string;
      title: string;
      due_at: string | null;
      created_at: string;
      schema_json: string;
      responseStatus: string | null;
      finalScore: number | null;
      finalTotal: number | null;
      submittedAt: string | null;
    }[];
    return c.json({
      assignments: rows.map((row) => ({
        id: row.id,
        title: row.title,
        dueAt: row.due_at,
        createdAt: row.created_at,
        questionCount: assignmentSchema(row).questions.length,
        status: row.responseStatus ?? "not_started",
        finalScore: row.finalScore,
        finalTotal: row.finalTotal,
        submittedAt: row.submittedAt,
      })),
    });
  });

  // Teacher: update title/due date/archive. Schema is editable only while no
  // response rows exist — after that, re-assign the sheet instead.
  app.patch("/:id", async (c) => {
    const auth = teacherOnly(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const row = assignmentOf(db, auth.membership.classId, c.req.param("id"));
    if (!row) return jsonError(c, 404, "assignment-not-found");
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 400, "invalid-body");
    const patch = body;

    let title = row.title;
    let dueAt = row.due_at;
    let archived = row.archived;
    let schemaJson = row.schema_json;

    if (patch.title !== undefined) {
      if (
        typeof patch.title !== "string" ||
        patch.title.trim() === "" ||
        patch.title.length > 120
      ) {
        return jsonError(c, 400, "invalid-title");
      }
      title = patch.title.trim();
    }
    if (patch.dueAt !== undefined) {
      if (patch.dueAt !== null && !isoDate(patch.dueAt)) return jsonError(c, 400, "invalid-due-at");
      dueAt = patch.dueAt as string | null;
    }
    if (patch.archived !== undefined) archived = patch.archived === true ? 1 : 0;
    if (patch.schema !== undefined) {
      const { count } = db
        .prepare("SELECT COUNT(*) AS count FROM task_responses WHERE assignment_id = ?")
        .get(row.id) as { count: number };
      if (count > 0) return jsonError(c, 409, "assignment-has-responses");
      const validated = validateSheetSchema(patch.schema);
      if (!validated.ok) return jsonError(c, 400, validated.error);
      if (validated.schema.questions.length === 0) return jsonError(c, 400, "sheet-empty");
      schemaJson = JSON.stringify(validated.schema);
    }

    db.prepare(
      "UPDATE task_assignments SET title = ?, due_at = ?, archived = ?, schema_json = ? WHERE id = ?",
    ).run(title, dueAt, archived, schemaJson, row.id);
    return c.json({ assignment: assignmentOf(db, auth.membership.classId, row.id) });
  });

  // Delete is only allowed before any response exists; afterwards archive it.
  app.delete("/:id", (c) => {
    const auth = teacherOnly(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const row = assignmentOf(db, auth.membership.classId, c.req.param("id"));
    if (!row) return jsonError(c, 404, "assignment-not-found");
    const { count } = db
      .prepare("SELECT COUNT(*) AS count FROM task_responses WHERE assignment_id = ?")
      .get(row.id) as { count: number };
    if (count > 0) return jsonError(c, 409, "assignment-has-responses");
    db.prepare("DELETE FROM task_assignments WHERE id = ?").run(row.id);
    return c.json({ deleted: row.id });
  });

  // Student: my response view — public (answer-free) schema plus own answers,
  // grading (also answer-free), and review comments once available.
  app.get("/:id/response", (c) => {
    const auth = studentOnly(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const row = assignmentOf(db, auth.membership.classId, c.req.param("id"));
    if (!row || row.archived === 1) return jsonError(c, 404, "assignment-not-found");
    const schema = assignmentSchema(row);
    const response = responseOf(db, row.id, auth.user.id);
    return c.json({
      assignment: assignmentMeta(row, schema),
      schema: publicSchema(schema),
      response: response
        ? {
            id: response.id,
            status: response.status,
            answers: parseJsonColumn<AnswerMap>(response.answers_json, {}),
            autoScore: response.auto_score,
            autoTotal: response.auto_total,
            grading: response.grading_json
              ? publicGrading(parseJsonColumn(response.grading_json, {}))
              : null,
            review: response.status === "reviewed" ? parseReview(response.review_json) : null,
            finalScore: response.final_score,
            finalTotal: response.final_total,
            submittedAt: response.submitted_at,
          }
        : { status: "not_started", answers: {} },
    });
  });

  // Student: autosave draft answers.
  app.put("/:id/response", async (c) => {
    const auth = studentOnly(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const row = assignmentOf(db, auth.membership.classId, c.req.param("id"));
    if (!row || row.archived === 1) return jsonError(c, 404, "assignment-not-found");
    const schema = assignmentSchema(row);
    const existing = responseOf(db, row.id, auth.user.id);
    if (existing && (existing.status === "submitted" || existing.status === "reviewed")) {
      return jsonError(c, 409, "response-locked");
    }
    const body = await readJsonObject(c);
    const answers = sanitizeAnswers(schema, body?.answers);
    // Create-if-missing plus the answer write commit together.
    withTransaction(db, () => {
      const resp = existing ?? getOrCreateResponse(db, row.id, auth.user.id);
      db.prepare(
        `UPDATE task_responses SET answers_json = ?, status = 'in_progress',
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      ).run(JSON.stringify(answers), resp.id);
    });
    return c.json({ ok: true, savedAt: new Date().toISOString() });
  });

  // Student: submit — authoritative grading happens here, never on the client.
  app.post("/:id/response/submit", (c) => {
    const auth = studentOnly(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const row = assignmentOf(db, auth.membership.classId, c.req.param("id"));
    if (!row || row.archived === 1) return jsonError(c, 404, "assignment-not-found");
    const schema = assignmentSchema(row);
    const existing = responseOf(db, row.id, auth.user.id);
    if (existing && (existing.status === "submitted" || existing.status === "reviewed")) {
      return jsonError(c, 409, "response-locked");
    }
    const resp = withTransaction(
      db,
      () => existing ?? getOrCreateResponse(db, row.id, auth.user.id),
    );
    const answers = parseJsonColumn<AnswerMap>(resp.answers_json, {});
    const invalid = validateAnswers(schema, answers);
    if (invalid) return jsonError(c, 400, invalid);

    const graded = autoGrade(schema, answers);
    const review = parseReview(null);
    const { finalScore, finalTotal } = recomputeFinal(schema, graded.perQuestion, review);
    db.prepare(
      `UPDATE task_responses
       SET status = 'submitted', submitted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           auto_score = ?, auto_total = ?, grading_json = ?, review_json = NULL,
           reviewed_by = NULL, reviewed_at = NULL, final_score = ?, final_total = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    ).run(
      graded.autoScore,
      graded.autoTotal,
      JSON.stringify(graded.perQuestion),
      finalScore,
      finalTotal,
      resp.id,
    );
    return c.json({
      ok: true,
      autoScore: graded.autoScore,
      autoTotal: graded.autoTotal,
      grading: publicGrading(graded.perQuestion),
      finalScore,
      finalTotal,
    });
  });

  // Teacher: per-student rows for the dashboard matrix.
  app.get("/:id/responses", (c) => {
    const auth = teacherOnly(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const row = assignmentOf(db, auth.membership.classId, c.req.param("id"));
    if (!row) return jsonError(c, 404, "assignment-not-found");
    const rows = db
      .prepare(
        `SELECT u.id AS userId, u.student_no AS studentNo, u.name,
                r.id AS responseId, r.status, r.auto_score AS autoScore, r.auto_total AS autoTotal,
                r.final_score AS finalScore, r.final_total AS finalTotal,
                r.submitted_at AS submittedAt, r.updated_at AS updatedAt
         FROM class_members m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN task_responses r ON r.assignment_id = ? AND r.user_id = u.id
         WHERE m.class_id = ? AND m.role = 'student'
         ORDER BY u.student_no`,
      )
      .all(row.id, auth.membership.classId) as {
      userId: string;
      studentNo: string;
      name: string;
      responseId: string | null;
      status: string | null;
      autoScore: number | null;
      autoTotal: number | null;
      finalScore: number | null;
      finalTotal: number | null;
      submittedAt: string | null;
      updatedAt: string | null;
    }[];
    return c.json({
      assignment: assignmentMeta(row, assignmentSchema(row)),
      schema: assignmentSchema(row),
      rows: rows.map((r) => ({
        ...r,
        status: r.status ?? "not_started",
        late: row.due_at !== null && r.submittedAt !== null && r.submittedAt > row.due_at,
      })),
    });
  });

  // Teacher: full response detail — full schema with answers, full grading.
  app.get("/:id/responses/:responseId", (c) => {
    const auth = teacherOnly(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const row = assignmentOf(db, auth.membership.classId, c.req.param("id"));
    if (!row) return jsonError(c, 404, "assignment-not-found");
    const resp = db
      .prepare(
        `SELECT r.*, u.student_no AS studentNo, u.name
         FROM task_responses r JOIN users u ON u.id = r.user_id
         WHERE r.id = ? AND r.assignment_id = ?`,
      )
      .get(c.req.param("responseId"), row.id) as
      | (ResponseRow & {
          studentNo: string;
          name: string;
        })
      | undefined;
    if (!resp) return jsonError(c, 404, "response-not-found");
    return c.json({
      assignment: assignmentMeta(row, assignmentSchema(row)),
      schema: assignmentSchema(row),
      response: {
        id: resp.id,
        userId: resp.user_id,
        studentNo: resp.studentNo,
        name: resp.name,
        status: resp.status,
        answers: parseJsonColumn<AnswerMap>(resp.answers_json, {}),
        autoScore: resp.auto_score,
        autoTotal: resp.auto_total,
        grading: resp.grading_json
          ? parseJsonColumn<Record<string, QuestionGrading>>(resp.grading_json, {})
          : null,
        review: parseReview(resp.review_json),
        reviewedBy: resp.reviewed_by,
        reviewedAt: resp.reviewed_at,
        finalScore: resp.final_score,
        finalTotal: resp.final_total,
        submittedAt: resp.submitted_at,
      },
    });
  });

  // Teacher: per-question review. Any question's score may be overridden
  // (teachers can re-mark auto-graded items); short answers get their score.
  app.patch("/:id/responses/:responseId/review", async (c) => {
    const auth = teacherOnly(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const row = assignmentOf(db, auth.membership.classId, c.req.param("id"));
    if (!row) return jsonError(c, 404, "assignment-not-found");
    const target = db
      .prepare("SELECT * FROM task_responses WHERE id = ? AND assignment_id = ?")
      .get(c.req.param("responseId"), row.id) as ResponseRow | undefined;
    if (!target) return jsonError(c, 404, "response-not-found");
    if (target.status !== "submitted" && target.status !== "reviewed") {
      return jsonError(c, 409, "response-not-submitted");
    }
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 400, "invalid-body");
    const patch = body;
    const schema = assignmentSchema(row);
    const grading = parseJsonColumn<Record<string, QuestionGrading>>(target.grading_json, {});
    const review = parseReview(target.review_json);

    if (patch.questions && typeof patch.questions === "object") {
      for (const [qid, entry] of Object.entries(patch.questions)) {
        const q = schema.questions.find((x) => x.id === qid);
        if (!q || !entry || typeof entry !== "object") continue;
        const next = { ...(review.questions[qid] ?? {}) };
        if (entry.score !== undefined) {
          const max = q.type === "short" ? q.maxScore : q.score;
          if (typeof entry.score !== "number" || entry.score < 0 || entry.score > max) {
            return jsonError(c, 400, "invalid-review-score");
          }
          next.score = entry.score;
        }
        if (entry.comment !== undefined) {
          next.comment =
            typeof entry.comment === "string" ? entry.comment.slice(0, 2000) : undefined;
        }
        review.questions[qid] = next;
      }
    }
    if (patch.comment !== undefined) {
      review.comment = typeof patch.comment === "string" ? patch.comment.slice(0, 2000) : undefined;
    }

    const { finalScore, finalTotal } = recomputeFinal(schema, grading, review);
    db.prepare(
      `UPDATE task_responses
       SET review_json = ?, status = 'reviewed', reviewed_by = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           final_score = ?, final_total = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    ).run(JSON.stringify(review), auth.user.id, finalScore, finalTotal, target.id);
    return c.json({ ok: true, finalScore, finalTotal });
  });

  // Teacher: return a submission for rework — student edits and resubmits.
  app.post("/:id/responses/:responseId/return", (c) => {
    const auth = teacherOnly(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const row = assignmentOf(db, auth.membership.classId, c.req.param("id"));
    if (!row) return jsonError(c, 404, "assignment-not-found");
    const target = db
      .prepare("SELECT * FROM task_responses WHERE id = ? AND assignment_id = ?")
      .get(c.req.param("responseId"), row.id) as ResponseRow | undefined;
    if (!target) return jsonError(c, 404, "response-not-found");
    if (target.status !== "submitted" && target.status !== "reviewed") {
      return jsonError(c, 409, "response-not-submitted");
    }
    db.prepare(
      `UPDATE task_responses SET status = 'returned',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(target.id);
    return c.json({ ok: true });
  });

  // Teacher: per-question statistics — correct rates, option distribution,
  // common wrong fill answers. Powers the 题目统计 strip in the dashboard.
  app.get("/:id/stats", (c) => {
    const auth = teacherOnly(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const row = assignmentOf(db, auth.membership.classId, c.req.param("id"));
    if (!row) return jsonError(c, 404, "assignment-not-found");
    const schema = assignmentSchema(row);
    const responses = db
      .prepare(
        `SELECT grading_json, review_json, status FROM task_responses
         WHERE assignment_id = ? AND status IN ('submitted','reviewed')`,
      )
      .all(row.id) as { grading_json: string | null; review_json: string | null; status: string }[];

    const stats = schema.questions.map((q) => {
      if (q.type === "fill") {
        const perBlank: Record<string, { correct: number; wrong: Record<string, number> }> = {};
        for (const b of q.blanks) perBlank[b.id] = { correct: 0, wrong: {} };
        for (const r of responses) {
          const g = r.grading_json
            ? parseJsonColumn<Record<string, QuestionGrading>>(r.grading_json, {})
            : null;
          const fq = g?.[q.id];
          if (!fq || fq.type !== "fill") continue;
          for (const b of q.blanks) {
            const entry = fq.blanks[b.id];
            if (!entry) continue;
            if (entry.correct) perBlank[b.id].correct += 1;
            else if (entry.answer.trim() !== "") {
              const key = entry.answer.trim();
              perBlank[b.id].wrong[key] = (perBlank[b.id].wrong[key] ?? 0) + 1;
            }
          }
        }
        return {
          questionId: q.id,
          type: "fill",
          blanks: Object.entries(perBlank).map(([blankId, s]) => ({
            blankId,
            correctRate: responses.length === 0 ? 0 : s.correct / responses.length,
            topWrong: Object.entries(s.wrong)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([answer, count]) => ({ answer, count })),
          })),
        };
      }
      if (q.type === "choice") {
        let correct = 0;
        const optionCounts: Record<string, number> = {};
        for (const o of q.options) optionCounts[o.id] = 0;
        for (const r of responses) {
          const g = r.grading_json
            ? parseJsonColumn<Record<string, QuestionGrading>>(r.grading_json, {})
            : null;
          const cq = g?.[q.id];
          if (!cq || cq.type !== "choice") continue;
          if (cq.correct) correct += 1;
          for (const id of cq.selected) if (id in optionCounts) optionCounts[id] += 1;
        }
        return {
          questionId: q.id,
          type: "choice",
          correctRate: responses.length === 0 ? 0 : correct / responses.length,
          optionCounts,
        };
      }
      let reviewed = 0;
      let scoreSum = 0;
      for (const r of responses) {
        const review = parseReview(r.review_json);
        const s = review.questions[q.id]?.score;
        if (typeof s === "number") {
          reviewed += 1;
          scoreSum += s;
        }
      }
      return {
        questionId: q.id,
        type: "short",
        reviewedCount: reviewed,
        averageScore: reviewed === 0 ? null : Math.round((scoreSum / reviewed) * 100) / 100,
      };
    });

    return c.json({ submittedCount: responses.length, stats });
  });

  return app;
}
