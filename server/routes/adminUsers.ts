import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { MAX_PASSWORD_LENGTH, hashPassword, minPasswordLength } from "../auth/password.ts";
import type { AccountRole } from "../auth/session.ts";
import { newId, withTransaction } from "../db/client.ts";
import { jsonError, type AppVariables } from "../http/context.ts";
import {
  normalizeRole,
  readJsonObject,
  readOptionalString,
  readString,
  readTrimmedNonEmpty,
  STUDENT_NO,
} from "../http/validation.ts";

type ImportRow = {
  line: number;
  studentNo: string;
  name: string;
  password: string;
  role: AccountRole;
  inviteCode: string | null;
};

type ImportResult = {
  line: number;
  studentNo: string;
  status: "created" | "exists" | "error";
  error?: string;
};

/** One CSV row: 学号,姓名,密码[,角色][,班级邀请码]。逗号、全角逗号或 Tab 分隔。 */
function parseCsvLine(line: string): string[] {
  return line.split(/[\t,，]/).map((cell) => cell.trim());
}

function isHeaderRow(cells: string[]): boolean {
  return /学号|student/i.test(cells[0] ?? "") || /姓名|name/i.test(cells[1] ?? "");
}

function rowsFromCsv(csv: string): { rows: ImportRow[]; errors: ImportResult[] } {
  const rows: ImportRow[] = [];
  const errors: ImportResult[] = [];
  const lines = csv.split(/\r?\n/);
  let headerChecked = false;
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === "") return;
    const cells = parseCsvLine(line);
    if (!headerChecked) {
      headerChecked = true;
      if (isHeaderRow(cells)) return;
    }
    const [studentNo = "", name = "", password = "", roleRaw, inviteCode] = cells;
    const role = normalizeRole(roleRaw);
    if (role === null) {
      errors.push({ line: index + 1, studentNo, status: "error", error: "invalid-role" });
      return;
    }
    rows.push({
      line: index + 1,
      studentNo,
      name,
      password,
      role,
      inviteCode: inviteCode ? inviteCode : null,
    });
  });
  return { rows, errors };
}

function rowsFromJson(input: unknown): { rows: ImportRow[]; errors: ImportResult[] } | null {
  if (!Array.isArray(input)) return null;
  const rows: ImportRow[] = [];
  const errors: ImportResult[] = [];
  input.forEach((entry, index) => {
    const line = index + 1;
    if (!entry || typeof entry !== "object") {
      errors.push({ line, studentNo: "", status: "error", error: "invalid-row" });
      return;
    }
    const record = entry as Record<string, unknown>;
    const studentNo = readString(record, "studentNo") ?? "";
    const name = readString(record, "name") ?? "";
    const password = readString(record, "password") ?? "";
    const role = normalizeRole(readOptionalString(record, "role"));
    if (role === null) {
      errors.push({ line, studentNo, status: "error", error: "invalid-role" });
      return;
    }
    rows.push({
      line,
      studentNo,
      name,
      password,
      role,
      inviteCode: readTrimmedNonEmpty(record, "inviteCode"),
    });
  });
  return { rows, errors };
}

function classByInviteCode(db: DatabaseSync, inviteCode: string) {
  return db.prepare("SELECT id, name FROM classes WHERE invite_code = ?").get(inviteCode) as
    { id: string; name: string } | undefined;
}

function validateAccount(row: {
  studentNo: string;
  name: string;
  password: string;
  role: AccountRole;
}): string | null {
  if (!STUDENT_NO.test(row.studentNo)) return "invalid-student-no";
  if (row.name.trim().length === 0 || row.name.length > 64) return "invalid-name";
  if (
    row.password.length < minPasswordLength(row.role) ||
    row.password.length > MAX_PASSWORD_LENGTH
  ) {
    return "weak-password";
  }
  return null;
}

/**
 * Insert one account + optional class membership inside the caller's
 * transaction — do NOT begin a nested transaction here.
 */
function createAccount(
  db: DatabaseSync,
  row: ImportRow,
  passwordHash: string,
): "exists" | string | null {
  const invalid = validateAccount(row);
  if (invalid) return invalid;
  const existing = db.prepare("SELECT id FROM users WHERE student_no = ?").get(row.studentNo);
  if (existing) return "exists";
  const klass = row.inviteCode ? classByInviteCode(db, row.inviteCode) : undefined;
  if (row.inviteCode && !klass) return "class-not-found";

  const userId = newId();
  db.prepare(
    "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
  ).run(userId, row.studentNo, row.name.trim(), passwordHash, row.role);
  if (klass) {
    const memberRole = row.role === "user" ? "student" : "teacher";
    db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
      newId(),
      klass.id,
      userId,
      memberRole,
    );
  }
  return null;
}

export function adminUsersRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get("/users", (c) => {
    const db = c.get("db");
    const rawPage = Number.parseInt(c.req.query("page") ?? "", 10);
    const rawSize = Number.parseInt(c.req.query("pageSize") ?? "", 10);
    const search = (c.req.query("search") ?? "").trim().slice(0, 64);
    const pageSize = Number.isFinite(rawSize) ? Math.min(Math.max(rawSize, 1), 200) : 50;
    const filter = search
      ? "WHERE instr(lower(student_no), lower(?)) > 0 OR instr(lower(name), lower(?)) > 0"
      : "";
    const filterArgs = search ? [search, search] : [];
    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM users ${filter}`)
      .get(...filterArgs) as { total: number };
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Number.isFinite(rawPage) ? Math.min(Math.max(rawPage, 1), pageCount) : 1;
    const users = db
      .prepare(
        `SELECT id, student_no AS studentNo, name, role, created_at AS createdAt
         FROM users ${filter} ORDER BY created_at, student_no LIMIT ? OFFSET ?`,
      )
      .all(...filterArgs, pageSize, (page - 1) * pageSize) as {
      id: string;
      studentNo: string;
      name: string;
      role: AccountRole;
      createdAt: string;
    }[];
    const userIds = users.map((u) => u.id);
    const placeholders = userIds.map(() => "?").join(", ");
    const memberships = userIds.length
      ? (db
          .prepare(
            `SELECT m.user_id AS userId, m.class_id AS classId, c.name AS className, m.role
             FROM class_members m JOIN classes c ON c.id = m.class_id
             WHERE m.user_id IN (${placeholders})`,
          )
          .all(...userIds) as {
          userId: string;
          classId: string;
          className: string;
          role: string;
        }[])
      : [];
    const classesByUser = new Map<string, { classId: string; className: string; role: string }[]>();
    for (const m of memberships) {
      const list = classesByUser.get(m.userId) ?? [];
      list.push({ classId: m.classId, className: m.className, role: m.role });
      classesByUser.set(m.userId, list);
    }
    return c.json({
      users: users.map((u) => ({ ...u, classes: classesByUser.get(u.id) ?? [] })),
      total,
      page,
      pageSize,
      search,
    });
  });

  app.post("/users", async (c) => {
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 400, "invalid-body");
    const studentNo = readString(body, "studentNo");
    const name = readString(body, "name");
    const password = readString(body, "password");
    if (studentNo === null || name === null || password === null) {
      return jsonError(c, 400, "invalid-body");
    }
    const role = normalizeRole(readOptionalString(body, "role"));
    if (role === null) return jsonError(c, 400, "invalid-role");

    const db = c.get("db");
    let resolvedInvite: string | null;
    const classId = readOptionalString(body, "classId");
    if (classId && classId !== "") {
      const klass = db
        .prepare("SELECT invite_code AS inviteCode FROM classes WHERE id = ?")
        .get(classId) as { inviteCode: string } | undefined;
      if (!klass) return jsonError(c, 404, "class-not-found");
      resolvedInvite = klass.inviteCode;
    } else {
      resolvedInvite = readTrimmedNonEmpty(body, "inviteCode");
    }

    const passwordHash = await hashPassword(password);
    const row: ImportRow = {
      line: 1,
      studentNo,
      name,
      password,
      role,
      inviteCode: resolvedInvite,
    };
    const outcome = withTransaction(db, () => createAccount(db, row, passwordHash));
    if (outcome === "exists") return jsonError(c, 409, "student-no-taken");
    if (outcome === "class-not-found") return jsonError(c, 404, "class-not-found");
    if (outcome !== null) return jsonError(c, 400, outcome);
    const created = db
      .prepare("SELECT id, student_no AS studentNo, name, role FROM users WHERE student_no = ?")
      .get(studentNo);
    return c.json({ user: created }, 201);
  });

  app.post("/users/import", async (c) => {
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 400, "invalid-body");
    const csv = readString(body, "csv");

    let parsed: { rows: ImportRow[]; errors: ImportResult[] } | null = null;
    if (csv !== null && csv.trim() !== "") parsed = rowsFromCsv(csv);
    else if (body.users !== undefined) parsed = rowsFromJson(body.users);
    if (!parsed) return jsonError(c, 400, "invalid-import");

    const db = c.get("db");
    const results: ImportResult[] = [...parsed.errors];

    // Validate cheap fields first so hashing only happens for viable rows.
    const valid: { row: ImportRow; passwordHash: string }[] = [];
    for (const row of parsed.rows) {
      const invalid = validateAccount(row);
      if (invalid) {
        results.push({ line: row.line, studentNo: row.studentNo, status: "error", error: invalid });
      }
    }
    const hashable = parsed.rows.filter(
      (row) => !results.some((r) => r.line === row.line && r.status === "error"),
    );
    const hashes = await Promise.all(hashable.map((row) => hashPassword(row.password)));
    hashable.forEach((row, index) => valid.push({ row, passwordHash: hashes[index] }));

    withTransaction(db, () => {
      for (const { row, passwordHash } of valid) {
        const outcome = createAccount(db, row, passwordHash);
        if (outcome === null) {
          results.push({ line: row.line, studentNo: row.studentNo, status: "created" });
        } else if (outcome === "exists") {
          results.push({ line: row.line, studentNo: row.studentNo, status: "exists" });
        } else {
          results.push({
            line: row.line,
            studentNo: row.studentNo,
            status: "error",
            error: outcome,
          });
        }
      }
    });
    results.sort((a, b) => a.line - b.line);
    return c.json({
      created: results.filter((r) => r.status === "created").length,
      exists: results.filter((r) => r.status === "exists").length,
      failed: results.filter((r) => r.status === "error").length,
      rows: results,
    });
  });

  app.put("/users/:id/role", async (c) => {
    const body = (await readJsonObject(c)) ?? {};
    const role = normalizeRole(readOptionalString(body, "role"));
    if (role === null) return jsonError(c, 400, "invalid-role");
    if (role === "admin") return jsonError(c, 400, "admin-role-not-editable");

    const targetId = c.req.param("id");
    const caller = c.get("user")!;
    if (targetId === caller.id) return jsonError(c, 400, "cannot-edit-own-role");

    const db = c.get("db");
    const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(targetId) as
      { id: string; role: AccountRole } | undefined;
    if (!target) return jsonError(c, 404, "user-not-found");

    withTransaction(db, () => {
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, targetId);
      db.prepare("UPDATE class_members SET role = ? WHERE user_id = ?").run(
        role === "teacher" ? "teacher" : "student",
        targetId,
      );
    });
    return c.json({ user: { id: targetId, role } });
  });

  app.put("/users/:id/password", async (c) => {
    const body = await readJsonObject(c);
    const password = body ? readString(body, "password") : null;
    if (password === null) return jsonError(c, 400, "invalid-body");

    const targetId = c.req.param("id");
    const caller = c.get("user")!;
    if (targetId === caller.id) return jsonError(c, 400, "cannot-edit-own-password");

    const db = c.get("db");
    const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(targetId) as
      { id: string; role: AccountRole } | undefined;
    if (!target) return jsonError(c, 404, "user-not-found");
    if (password.length < minPasswordLength(target.role) || password.length > MAX_PASSWORD_LENGTH) {
      return jsonError(c, 400, "weak-password");
    }

    const passwordHash = await hashPassword(password);
    withTransaction(db, () => {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, targetId);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetId);
    });
    return c.json({ ok: true });
  });

  app.delete("/users/:id", (c) => {
    const targetId = c.req.param("id");
    const caller = c.get("user")!;
    if (targetId === caller.id) return jsonError(c, 400, "cannot-delete-self");

    const db = c.get("db");
    const target = db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
    if (!target) return jsonError(c, 404, "user-not-found");

    withTransaction(db, () => {
      db.prepare("DELETE FROM submissions WHERE user_id = ?").run(targetId);
      db.prepare("DELETE FROM student_projects WHERE user_id = ?").run(targetId);
      db.prepare("DELETE FROM task_responses WHERE user_id = ?").run(targetId);
      db.prepare(
        `DELETE FROM task_responses WHERE assignment_id IN (
           SELECT a.id FROM task_assignments a
           LEFT JOIN task_sheets s ON s.id = a.sheet_id
           WHERE a.assigned_by = ? OR s.owner_user_id = ?)`,
      ).run(targetId, targetId);
      db.prepare(
        `DELETE FROM task_assignments
         WHERE assigned_by = ? OR sheet_id IN (SELECT id FROM task_sheets WHERE owner_user_id = ?)`,
      ).run(targetId, targetId);
      db.prepare("DELETE FROM task_sheets WHERE owner_user_id = ?").run(targetId);
      db.prepare("DELETE FROM class_members WHERE user_id = ?").run(targetId);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetId);
      db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
    });
    return c.json({ deleted: targetId });
  });

  app.delete("/users/:id/records", (c) => {
    const targetId = c.req.param("id");
    const db = c.get("db");
    const target = db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
    if (!target) return jsonError(c, 404, "user-not-found");

    let cleared = { submissions: 0, projects: 0, taskResponses: 0 };
    withTransaction(db, () => {
      cleared = {
        submissions: Number(
          db.prepare("DELETE FROM submissions WHERE user_id = ?").run(targetId).changes,
        ),
        projects: Number(
          db.prepare("DELETE FROM student_projects WHERE user_id = ?").run(targetId).changes,
        ),
        taskResponses: Number(
          db.prepare("DELETE FROM task_responses WHERE user_id = ?").run(targetId).changes,
        ),
      };
    });
    return c.json({ cleared });
  });

  return app;
}
