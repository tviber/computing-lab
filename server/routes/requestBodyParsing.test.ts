import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession, sessionCookieValue } from "../auth/session.ts";
import { newId, openMemoryDb } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { authRoutes } from "./auth.ts";
import { classMemberRoutes } from "./classMembers.ts";
import { labRoutes } from "./labRoutes.ts";
import { taskSheetRoutes } from "./taskSheets.ts";
import { teacherRoutes } from "./teacher.ts";

async function createTestServer() {
  const db = openMemoryDb();
  const classId = newId();
  const teacherId = newId();
  const studentId = newId();
  const outsiderId = newId();
  const sheetId = newId();

  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    classId,
    "一班",
    "inv-1",
  );
  const hash = await hashPassword("secret-pass");
  db.prepare(
    "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
  ).run(teacherId, "t001", "老师", hash, "teacher");
  db.prepare(
    "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
  ).run(studentId, "s001", "学生甲", hash, "user");
  db.prepare(
    "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
  ).run(outsiderId, "s002", "学生乙", hash, "user");
  db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
    newId(),
    classId,
    teacherId,
    "teacher",
  );
  db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
    newId(),
    classId,
    studentId,
    "student",
  );
  db.prepare(
    "INSERT INTO task_sheets (id, owner_user_id, title, description, schema_json) VALUES (?, ?, ?, ?, ?)",
  ).run(sheetId, teacherId, "原任务单", "", JSON.stringify({ version: 1, questions: [] }));

  const teacherSession = createSession(db, teacherId);
  const studentSession = createSession(db, studentId);
  const teacherCookie = sessionCookieValue(teacherSession.id, teacherSession.expiresAt).split(
    ";",
    1,
  )[0];
  const studentCookie = sessionCookieValue(studentSession.id, studentSession.expiresAt).split(
    ";",
    1,
  )[0];

  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/auth", authRoutes());
  app.route("/api/classes/:classId/members", classMemberRoutes());
  app.route("/api/teacher", teacherRoutes());
  app.route("/api/task-sheets", taskSheetRoutes());
  app.route(
    "/api/classes/:classId/labs/calculator",
    labRoutes({
      labId: "calculator",
      stageCount: 6,
      saveDraft: () => ({ applied: true, revision: 1, projectGeneration: 0 }),
      judge: () => ({ passed: true, score: 1, total: 1 }),
    }),
  );

  return { app, db, classId, studentId, sheetId, teacherCookie, studentCookie };
}

async function sendRaw(
  app: Hono<{ Variables: AppVariables }>,
  method: string,
  path: string,
  cookie: string | null,
  rawBody: string,
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return app.fetch(new Request(`http://lab.test${path}`, { method, headers, body: rawBody }));
}

describe("readJsonObject contract across the 12 hardened route endpoints", () => {
  it("preserves status and error codes for empty, malformed, array, and valid bodies on auth routes", async () => {
    const { app, teacherCookie } = await createTestServer();

    for (const raw of ["", "{bad", "[]"]) {
      const loginRes = await sendRaw(app, "POST", "/api/auth/login", null, raw);
      expect(loginRes.status).toBe(400);
      expect(await loginRes.json()).toEqual({ error: "invalid-body" });

      const cpRes = await sendRaw(app, "POST", "/api/auth/change-password", teacherCookie, raw);
      expect(cpRes.status).toBe(400);
      expect(await cpRes.json()).toEqual({ error: "invalid-body" });
    }

    const okLogin = await sendRaw(
      app,
      "POST",
      "/api/auth/login",
      null,
      JSON.stringify({ studentNo: "t001", password: "secret-pass" }),
    );
    expect(okLogin.status).toBe(200);
  });

  it("preserves status and error codes on classMembers routes", async () => {
    const { app, classId, studentId, teacherCookie } = await createTestServer();

    for (const raw of ["", "{bad", "[]"]) {
      const enroll = await sendRaw(
        app,
        "POST",
        `/api/classes/${classId}/members`,
        teacherCookie,
        raw,
      );
      expect(enroll.status).toBe(400);
      expect(await enroll.json()).toEqual({ error: "invalid-body" });

      const create = await sendRaw(
        app,
        "POST",
        `/api/classes/${classId}/members/students`,
        teacherCookie,
        raw,
      );
      expect(create.status).toBe(400);
      expect(await create.json()).toEqual({ error: "invalid-body" });

      const rename = await sendRaw(
        app,
        "PATCH",
        `/api/classes/${classId}/members/${studentId}`,
        teacherCookie,
        raw,
      );
      expect(rename.status).toBe(400);
      expect(await rename.json()).toEqual({ error: "invalid-name" });

      const resetPw = await sendRaw(
        app,
        "PUT",
        `/api/classes/${classId}/members/${studentId}/password`,
        teacherCookie,
        raw,
      );
      expect(resetPw.status).toBe(400);
      expect(await resetPw.json()).toEqual({ error: "invalid-body" });
    }

    const okEnroll = await sendRaw(
      app,
      "POST",
      `/api/classes/${classId}/members`,
      teacherCookie,
      JSON.stringify({ studentNo: "s002" }),
    );
    expect(okEnroll.status).toBe(201);

    const okRename = await sendRaw(
      app,
      "PATCH",
      `/api/classes/${classId}/members/${studentId}`,
      teacherCookie,
      JSON.stringify({ name: "新名字" }),
    );
    expect(okRename.status).toBe(200);
  });

  it("preserves status and error codes on teacher lab-open route", async () => {
    const { app, classId, teacherCookie } = await createTestServer();
    const path = `/api/teacher/labs/calculator/classes/${classId}/open`;

    for (const raw of ["", "{bad", "[]"]) {
      const res = await sendRaw(app, "PUT", path, teacherCookie, raw);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid-body" });
    }

    const ok = await sendRaw(app, "PUT", path, teacherCookie, JSON.stringify({ open: false }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ open: false });
  });

  it("preserves status and error codes on labRoutes (reset, draft, judge)", async () => {
    const { app, classId, studentCookie } = await createTestServer();
    const base = `/api/classes/${classId}/labs/calculator`;

    for (const raw of ["", "{bad", "[]"]) {
      const resetRes = await sendRaw(app, "POST", `${base}/reset`, studentCookie, raw);
      expect(resetRes.status).toBe(400);
      expect(await resetRes.json()).toEqual({ error: "invalid-reset-scope" });

      const draftRes = await sendRaw(app, "PUT", `${base}/draft`, studentCookie, raw);
      expect(draftRes.status).toBe(400);
      expect(await draftRes.json()).toEqual({ error: "invalid-stage" });

      const judgeRes = await sendRaw(app, "POST", `${base}/judge`, studentCookie, raw);
      expect(judgeRes.status).toBe(400);
      expect(await judgeRes.json()).toEqual({ error: "invalid-stage" });
    }

    const okDraft = await sendRaw(
      app,
      "PUT",
      `${base}/draft`,
      studentCookie,
      JSON.stringify({ stageIndex: 1, expectedRevision: 0, expectedGeneration: 0 }),
    );
    expect(okDraft.status).toBe(200);

    const okJudge = await sendRaw(
      app,
      "POST",
      `${base}/judge`,
      studentCookie,
      JSON.stringify({ stageIndex: 1, expectedGeneration: 0 }),
    );
    expect(okJudge.status).toBe(200);

    const okReset = await sendRaw(
      app,
      "POST",
      `${base}/reset`,
      studentCookie,
      JSON.stringify({ scope: "lab", expectedGeneration: 0 }),
    );
    expect(okReset.status).toBe(200);
  });

  it("preserves status and error codes on taskSheets routes", async () => {
    const { app, sheetId, teacherCookie } = await createTestServer();

    for (const raw of ["", "{bad", "[]"]) {
      const createRes = await sendRaw(app, "POST", "/api/task-sheets", teacherCookie, raw);
      expect(createRes.status).toBe(400);
      expect(await createRes.json()).toEqual({ error: "invalid-title" });
    }

    for (const raw of ["", "{bad"]) {
      const patchRes = await sendRaw(
        app,
        "PATCH",
        `/api/task-sheets/${sheetId}`,
        teacherCookie,
        raw,
      );
      expect(patchRes.status).toBe(400);
      expect(await patchRes.json()).toEqual({ error: "invalid-body" });
    }

    // Legacy contract: JSON array is treated as an object with no patch fields.
    const arrayPatch = await sendRaw(
      app,
      "PATCH",
      `/api/task-sheets/${sheetId}`,
      teacherCookie,
      "[]",
    );
    expect(arrayPatch.status).toBe(200);

    const okCreate = await sendRaw(
      app,
      "POST",
      "/api/task-sheets",
      teacherCookie,
      JSON.stringify({ title: "新任务单" }),
    );
    expect(okCreate.status).toBe(201);

    const okPatch = await sendRaw(
      app,
      "PATCH",
      `/api/task-sheets/${sheetId}`,
      teacherCookie,
      JSON.stringify({ title: "更新后标题" }),
    );
    expect(okPatch.status).toBe(200);
  });
});
