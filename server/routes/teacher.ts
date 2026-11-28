import { Hono } from "hono";
import {
  jsonError,
  membershipsOf,
  requireMembership,
  requireStaff,
  type AppVariables,
} from "../http/context.ts";
import { readBoolean, readJsonObject } from "../http/validation.ts";
import { labInfo, setLabClassOpen, teacherLabView } from "../labs.ts";

/**
 * Teacher-level lab management. Teachers never touch the admin layer
 * (hidden/open radio or the class scope) — they can only close or reopen a
 * lab for classes they teach, which gates that class's students.
 */
export function teacherRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", async (c, next) => {
    const auth = requireStaff(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    return next();
  });

  // Labs × the caller's own classes: each cell reports whether the admin
  // scope admits the class, the teacher's stored switch, and the verdict the
  // class's students get.
  app.get("/labs", (c) => {
    const db = c.get("db");
    const classes = membershipsOf(db, c.get("user")!).filter((m) => m.role === "teacher");
    return c.json({
      classes: classes.map((m) => ({ id: m.classId, name: m.className })),
      labs: teacherLabView(
        db,
        classes.map((m) => m.classId),
      ),
    });
  });

  // Set the caller's own switch for one class they teach.
  app.put("/labs/:labId/classes/:classId/open", async (c) => {
    const labId = c.req.param("labId");
    if (!labInfo(labId)) return jsonError(c, 404, "unknown-lab");
    const auth = requireMembership(c, "teacher");
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await readJsonObject(c);
    const open = body ? readBoolean(body, "open") : null;
    if (open === null) return jsonError(c, 400, "invalid-body");
    const classId = auth.membership.classId;
    setLabClassOpen(c.get("db"), labId, classId, open);
    return c.json({ labId, classId, open });
  });

  return app;
}
