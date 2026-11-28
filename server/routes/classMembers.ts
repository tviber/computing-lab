import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { MAX_PASSWORD_LENGTH, hashPassword, minPasswordLength } from "../auth/password.ts";
import type { AccountRole } from "../auth/session.ts";
import { newId, withTransaction } from "../db/client.ts";
import { jsonError, requireMembership, type AppVariables } from "../http/context.ts";
import { STUDENT_NO, readJsonObject, readString, readTrimmedNonEmpty } from "../http/validation.ts";
const MAX_NAME_LENGTH = 64;

type MemberRow = { userId: string; studentNo: string; name: string };

function listMembers(db: DatabaseSync, classId: string, role: "student" | "teacher") {
  return db
    .prepare(
      `SELECT u.id AS userId, u.student_no AS studentNo, u.name
       FROM class_members m JOIN users u ON u.id = m.user_id
       WHERE m.class_id = ? AND m.role = ?
       ORDER BY u.student_no`,
    )
    .all(classId, role) as MemberRow[];
}

function membershipRole(db: DatabaseSync, classId: string, userId: string): string | null {
  const row = db
    .prepare("SELECT role FROM class_members WHERE class_id = ? AND user_id = ?")
    .get(classId, userId) as { role: string } | undefined;
  return row?.role ?? null;
}

/**
 * Per-class roster management for the class's own teachers. Every route is
 * scoped by requireMembership("teacher") — teachers only reach classes they
 * teach (admins keep teacher-equivalent access everywhere, matching the
 * dashboard and lab-switch routes).
 *
 * Only 'student' members are manageable here: co-teacher seats, account
 * deletion, and record wipes stay admin operations in /api/admin.
 */
export function classMemberRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get("/", (c) => {
    const auth = requireMembership(c, "teacher");
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const classId = auth.membership.classId;
    return c.json({
      classId,
      className: auth.membership.className,
      students: listMembers(db, classId, "student"),
      teachers: listMembers(db, classId, "teacher"),
    });
  });

  // Enroll an existing account as a student of this class, by 学号 — the
  // roster key a teacher actually has. Staff accounts are refused: seating
  // a teacher (or admin) in a student row is an admin decision.
  app.post("/", async (c) => {
    const auth = requireMembership(c, "teacher");
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await readJsonObject(c);
    const studentNo = body ? readTrimmedNonEmpty(body, "studentNo") : null;
    if (studentNo === null) {
      return jsonError(c, 400, "invalid-body");
    }

    const db = c.get("db");
    const classId = auth.membership.classId;
    const target = db
      .prepare("SELECT id, student_no AS studentNo, name, role FROM users WHERE student_no = ?")
      .get(studentNo) as
      { id: string; studentNo: string; name: string; role: AccountRole } | undefined;
    if (!target) return jsonError(c, 404, "user-not-found");
    if (target.role !== "user") return jsonError(c, 400, "not-a-student-account");
    if (membershipRole(db, classId, target.id) !== null) {
      return jsonError(c, 409, "already-member");
    }

    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, 'student')",
    ).run(newId(), classId, target.id);
    return c.json(
      { member: { userId: target.id, studentNo: target.studentNo, name: target.name } },
      201,
    );
  });

  // Create a brand-new student account and seat it in this class in one
  // transaction — the transfer-student path, which used to require an admin.
  app.post("/students", async (c) => {
    const auth = requireMembership(c, "teacher");
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 400, "invalid-body");
    const studentNo = readString(body, "studentNo");
    const name = readString(body, "name");
    const password = readString(body, "password");
    if (studentNo === null || name === null || password === null) {
      return jsonError(c, 400, "invalid-body");
    }
    if (!STUDENT_NO.test(studentNo)) return jsonError(c, 400, "invalid-student-no");
    if (name.trim().length === 0 || name.length > MAX_NAME_LENGTH) {
      return jsonError(c, 400, "invalid-name");
    }
    if (password.length < minPasswordLength("user") || password.length > MAX_PASSWORD_LENGTH) {
      return jsonError(c, 400, "weak-password");
    }

    const db = c.get("db");
    const classId = auth.membership.classId;
    if (db.prepare("SELECT id FROM users WHERE student_no = ?").get(studentNo)) {
      return jsonError(c, 409, "student-no-taken");
    }

    const passwordHash = await hashPassword(password);
    const userId = newId();
    withTransaction(db, () => {
      db.prepare(
        "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, 'user')",
      ).run(userId, studentNo, name.trim(), passwordHash);
      db.prepare(
        "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, 'student')",
      ).run(newId(), classId, userId);
    });
    return c.json({ member: { userId, studentNo, name: name.trim() } }, 201);
  });

  // Rename a student member — fixes roster typos without an admin round-trip.
  app.patch("/:userId", async (c) => {
    const auth = requireMembership(c, "teacher");
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await readJsonObject(c);
    const name = body ? readString(body, "name") : null;
    if (name === null || name.trim().length === 0 || name.length > MAX_NAME_LENGTH) {
      return jsonError(c, 400, "invalid-name");
    }

    const db = c.get("db");
    const classId = auth.membership.classId;
    const userId = c.req.param("userId");
    const memberRole = membershipRole(db, classId, userId);
    if (memberRole === null) return jsonError(c, 404, "membership-not-found");
    if (memberRole !== "student") return jsonError(c, 403, "student-member-required");

    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name.trim(), userId);
    return c.json({ member: { userId, name: name.trim() } });
  });

  // Reset a student member's password; all of their sessions are dropped so
  // the old password cannot keep a live session going (same rule as admin).
  app.put("/:userId/password", async (c) => {
    const auth = requireMembership(c, "teacher");
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await readJsonObject(c);
    const password = body ? readString(body, "password") : null;
    if (password === null) return jsonError(c, 400, "invalid-body");

    const db = c.get("db");
    const classId = auth.membership.classId;
    const userId = c.req.param("userId");
    const memberRole = membershipRole(db, classId, userId);
    if (memberRole === null) return jsonError(c, 404, "membership-not-found");
    if (memberRole !== "student") return jsonError(c, 403, "student-member-required");
    if (password.length < minPasswordLength("user") || password.length > MAX_PASSWORD_LENGTH) {
      return jsonError(c, 400, "weak-password");
    }

    const passwordHash = await hashPassword(password);
    withTransaction(db, () => {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    });
    return c.json({ ok: true });
  });

  // Remove a student from this class. The account, its other memberships,
  // and its lab records all stay — only this class's seat goes away.
  app.delete("/:userId", (c) => {
    const auth = requireMembership(c, "teacher");
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    const classId = auth.membership.classId;
    const userId = c.req.param("userId");
    const memberRole = membershipRole(db, classId, userId);
    if (memberRole === null) return jsonError(c, 404, "membership-not-found");
    if (memberRole !== "student") return jsonError(c, 403, "student-member-required");

    db.prepare("DELETE FROM class_members WHERE class_id = ? AND user_id = ?").run(classId, userId);
    return c.json({ removed: { classId, userId } });
  });

  return app;
}
