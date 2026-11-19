import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { imageSamplingRoutes } from "./imageSampling.ts";

async function setup() {
  const db = openMemoryDb();
  const classId = newId();
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    classId,
    "实验班",
    "invite-1",
  );
  const mkUser = async (no: string, role: string, memberRole: string | null) => {
    const id = newId();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    ).run(id, no, no, await hashPassword("pass"), role);
    if (memberRole) {
      db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
        newId(),
        classId,
        id,
        memberRole,
      );
    }
    return id;
  };
  const studentId = await mkUser("stu-1", "user", "student");
  const teacherId = await mkUser("tea-1", "teacher", "teacher");
  const adminId = await mkUser("adm-1", "admin", null);
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/classes/:classId/labs/image-sampling", imageSamplingRoutes());
  const cookieFor = (userId: string) => `lab_session=${createSession(db, userId).id}`;
  return { db, classId, studentId, teacherId, adminId, app, cookieFor };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/image-sampling${path}`;

describe("image-sampling routes", () => {
  it("creates and returns a project for a student member", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(studentId) } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      labId: "image-sampling",
      currentStage: 1,
      passedStages: [],
    });
  });

  it("admins reach the lab even without class membership", async () => {
    const { app, classId, adminId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(adminId) } }),
    );
    expect(res.status).toBe(200);
  });

  it("class teachers can access the lab", async () => {
    const { app, classId, teacherId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(teacherId) } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ labId: "image-sampling" });
  });

  it("unauthenticated requests get 401", async () => {
    const { app, classId } = await setup();
    const res = await app.fetch(new Request(url(classId, "/project")));
    expect(res.status).toBe(401);
  });

  it("saves a draft and reads it back", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const put = await app.fetch(
      new Request(url(classId, "/draft"), {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          stageIndex: 1,
          expectedRevision: 0,
          expectedGeneration: 0,
          draft: { width: 16, height: 16, code: "x" },
        }),
      }),
    );
    expect(put.status).toBe(200);
    const project = await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    const body = (await project.json()) as { drafts: Record<string, unknown> };
    expect(body.drafts["1"]).toEqual({ width: 16, height: 16, code: "x" });
  });

  it("judges a submission end-to-end", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/judge"), {
        method: "POST",
        headers: { cookie: cookieFor(studentId), "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: 1, expectedGeneration: 0, width: 16, height: 16 }),
      }),
    );
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as { passed: boolean; accuracy: number };
    expect(outcome.passed).toBe(true);
    expect(outcome.accuracy).toBe(1);
  });

  it("requires choose_size code when judging stage 2", async () => {
    const { app, classId, studentId, cookieFor, db } = await setup();
    await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(studentId) } }),
    );
    const project = db
      .prepare("SELECT id FROM student_projects WHERE user_id = ? AND class_id = ?")
      .get(studentId, classId) as { id: string };
    db.prepare("UPDATE student_projects SET passed_stages = ?, current_stage = 2 WHERE id = ?").run(
      JSON.stringify([1]),
      project.id,
    );
    const res = await app.fetch(
      new Request(url(classId, "/judge"), {
        method: "POST",
        headers: { cookie: cookieFor(studentId), "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: 2, expectedGeneration: 0, width: 24, height: 24 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "choose-size-required" });
  });
});
