import { Hono } from "hono";
import type { AccountRole } from "../auth/session.ts";
import { newId, withTransaction } from "../db/client.ts";
import { jsonError, type AppVariables } from "../http/context.ts";
import { readJsonObject, readString, readTrimmedNonEmpty, STUDENT_NO } from "./adminValidation.ts";

export function adminClassesRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get("/classes", (c) => {
    const classes = c
      .get("db")
      .prepare(
        `SELECT c.id, c.name, c.invite_code AS inviteCode,
                (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS memberCount
         FROM classes c ORDER BY c.name`,
      )
      .all();
    return c.json({ classes });
  });

  app.post("/classes", async (c) => {
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 400, "invalid-body");
    const name = readString(body, "name");
    if (name === null || name.trim().length === 0 || name.length > 64) {
      return jsonError(c, 400, "invalid-name");
    }
    const inviteCode =
      readTrimmedNonEmpty(body, "inviteCode") ?? crypto.randomUUID().slice(0, 8).toUpperCase();
    if (!STUDENT_NO.test(inviteCode)) return jsonError(c, 400, "invalid-invite-code");
    const db = c.get("db");
    const conflict = db.prepare("SELECT id FROM classes WHERE invite_code = ?").get(inviteCode);
    if (conflict) return jsonError(c, 409, "invite-code-taken");
    const id = newId();
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
      id,
      name.trim(),
      inviteCode,
    );
    return c.json({ class: { id, name: name.trim(), inviteCode } }, 201);
  });

  app.delete("/classes/:id", (c) => {
    const db = c.get("db");
    const classId = c.req.param("id");
    const klass = db.prepare("SELECT id FROM classes WHERE id = ?").get(classId);
    if (!klass) return jsonError(c, 404, "class-not-found");
    const { count } = db
      .prepare("SELECT COUNT(*) AS count FROM class_members WHERE class_id = ?")
      .get(classId) as { count: number };
    if (count > 0) return jsonError(c, 409, "class-not-empty");
    withTransaction(db, () => {
      db.prepare(
        `DELETE FROM task_responses WHERE assignment_id IN (
           SELECT id FROM task_assignments WHERE class_id = ?)`,
      ).run(classId);
      db.prepare("DELETE FROM task_assignments WHERE class_id = ?").run(classId);
      db.prepare("DELETE FROM lab_class_settings WHERE class_id = ?").run(classId);
      db.prepare("DELETE FROM classes WHERE id = ?").run(classId);
    });
    return c.json({ deleted: classId });
  });

  app.put("/classes/:classId/members/:userId", (c) => {
    const db = c.get("db");
    const classId = c.req.param("classId");
    const userId = c.req.param("userId");
    const klass = db.prepare("SELECT id FROM classes WHERE id = ?").get(classId);
    if (!klass) return jsonError(c, 404, "class-not-found");
    const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId) as
      { id: string; role: AccountRole } | undefined;
    if (!target) return jsonError(c, 404, "user-not-found");
    const existing = db
      .prepare("SELECT id FROM class_members WHERE class_id = ? AND user_id = ?")
      .get(classId, userId);
    if (existing) return jsonError(c, 409, "already-member");

    const memberRole = target.role === "user" ? "student" : "teacher";
    db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
      newId(),
      classId,
      userId,
      memberRole,
    );
    return c.json({ membership: { classId, userId, role: memberRole } }, 201);
  });

  app.delete("/classes/:classId/members/:userId", (c) => {
    const db = c.get("db");
    const classId = c.req.param("classId");
    const userId = c.req.param("userId");
    const klass = db.prepare("SELECT id FROM classes WHERE id = ?").get(classId);
    if (!klass) return jsonError(c, 404, "class-not-found");
    const result = db
      .prepare("DELETE FROM class_members WHERE class_id = ? AND user_id = ?")
      .run(classId, userId);
    if (result.changes === 0) return jsonError(c, 404, "membership-not-found");
    return c.json({ removed: { classId, userId } });
  });

  return app;
}
