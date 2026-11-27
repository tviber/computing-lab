// @vitest-environment node
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openMemoryDb } from "../db/client.ts";
import type { AppVariables } from "../http/context.ts";
import { taskAssignmentRoutes } from "./taskAssignments.ts";

const schema = {
  version: 1,
  questions: [{ id: "q1", type: "short", prompt: "解释采样", required: false, maxScore: 5 }],
};
const answers = { q1: { type: "short", text: "离散时间取样" } };
const nonObjects = [
  ["empty body", undefined],
  ["non-JSON", "{"],
  ["null", "null"],
  ["string", '"text"'],
  ["number", "42"],
  ["boolean", "false"],
] as const;

describe("task assignment JSON request contracts", () => {
  let db: ReturnType<typeof openMemoryDb>;
  let app: Hono<{ Variables: AppVariables }>;

  beforeEach(() => {
    db = openMemoryDb();
    db.prepare(
      "INSERT INTO classes (id, name, invite_code) VALUES ('class', '实验班', 'invite')",
    ).run();
    for (const [id, role, membership] of [
      ["teacher", "teacher", "teacher"],
      ["student", "user", "student"],
    ]) {
      db.prepare(
        "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, 'unused', ?)",
      ).run(id, id, id, role);
      db.prepare(
        "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'class', ?, ?)",
      ).run(id, id, membership);
    }
    db.prepare(
      "INSERT INTO task_sheets (id, owner_user_id, title, schema_json) VALUES ('sheet', 'teacher', '原任务', ?)",
    ).run(JSON.stringify(schema));
    db.prepare(
      `INSERT INTO task_assignments (id, sheet_id, class_id, assigned_by, title, schema_json)
       VALUES ('assignment', 'sheet', 'class', 'teacher', '原任务', ?)`,
    ).run(JSON.stringify(schema));
    db.prepare(
      `INSERT INTO task_responses (id, assignment_id, user_id, answers_json, status)
       VALUES ('response', 'assignment', 'student', ?, 'in_progress')`,
    ).run(JSON.stringify(answers));
    app = new Hono<{ Variables: AppVariables }>();
    app.use("*", async (c, next) => {
      c.set("db", db);
      const id = c.req.header("x-test-user") === "student" ? "student" : "teacher";
      c.set("user", { id, studentNo: id, name: id, role: id === "student" ? "user" : "teacher" });
      await next();
    });
    app.route("/api/classes/:classId/task-assignments", taskAssignmentRoutes());
  });

  afterEach(() => db.close());

  function request(method: string, path: string, body?: string, user = "teacher") {
    return app.request(`/api/classes/class/task-assignments${path}`, {
      method,
      headers: { "content-type": "application/json", "x-test-user": user },
      body,
    });
  }

  it.each(nonObjects)("keeps endpoint-specific behavior for %s", async (_label, body) => {
    for (const [method, path] of [
      ["POST", ""],
      ["PATCH", "/assignment"],
      ["PATCH", "/assignment/responses/response/review"],
    ]) {
      db.prepare("UPDATE task_responses SET status = 'submitted'").run();
      const response = await request(method, path, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid-body" });
    }
    db.prepare("UPDATE task_responses SET status = 'in_progress'").run();
    const saved = await request("PUT", "/assignment/response", body, "student");
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ ok: true, savedAt: expect.any(String) });
    const view = await request("GET", "/assignment/response", undefined, "student");
    expect(await view.json()).toMatchObject({ response: { answers: {}, status: "in_progress" } });
  });

  it.each(["[]", "{}"])("continues to accept %s as an object", async (body) => {
    const created = await request("POST", "", body);
    expect(created.status).toBe(400);
    expect(await created.json()).toEqual({ error: "invalid-sheet" });

    const patched = await request("PATCH", "/assignment", body);
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ assignment: { title: "原任务" } });

    const saved = await request("PUT", "/assignment/response", body, "student");
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ ok: true });
    const view = await request("GET", "/assignment/response", undefined, "student");
    expect(await view.json()).toMatchObject({ response: { answers: {} } });

    db.prepare("UPDATE task_responses SET status = 'submitted'").run();
    const reviewed = await request("PATCH", "/assignment/responses/response/review", body);
    expect(reviewed.status).toBe(200);
    expect(await reviewed.json()).toEqual({ ok: true, finalScore: 0, finalTotal: 5 });
  });

  it("preserves valid writes and field validation errors", async () => {
    const created = await request(
      "POST",
      "",
      JSON.stringify({ sheetId: "sheet", title: " 新任务 " }),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ assignment: { title: "新任务" } });

    const badTitle = await request("PATCH", "/assignment", JSON.stringify({ title: " " }));
    expect(badTitle.status).toBe(400);
    expect(await badTitle.json()).toEqual({ error: "invalid-title" });
    const patched = await request("PATCH", "/assignment", JSON.stringify({ title: " 已改名 " }));
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ assignment: { title: "已改名" } });

    const saved = await request(
      "PUT",
      "/assignment/response",
      JSON.stringify({ answers }),
      "student",
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ ok: true });
    const view = await request("GET", "/assignment/response", undefined, "student");
    expect(await view.json()).toMatchObject({ response: { answers } });

    db.prepare("UPDATE task_responses SET status = 'submitted'").run();
    const reviewPath = "/assignment/responses/response/review";
    const badScore = await request(
      "PATCH",
      reviewPath,
      JSON.stringify({ questions: { q1: { score: 6 } } }),
    );
    expect(badScore.status).toBe(400);
    expect(await badScore.json()).toEqual({ error: "invalid-review-score" });
    const reviewed = await request(
      "PATCH",
      reviewPath,
      JSON.stringify({ questions: { q1: { score: 4 } } }),
    );
    expect(reviewed.status).toBe(200);
    expect(await reviewed.json()).toEqual({ ok: true, finalScore: 4, finalTotal: 5 });
  });
});
