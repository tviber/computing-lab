// @vitest-environment node
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openMemoryDb } from "../db/client.ts";
import type { AppVariables } from "../http/context.ts";
import { isValidReviewScore, taskAssignmentRoutes } from "./taskAssignments.ts";

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

  async function request(method: string, path: string, body?: string, user = "teacher") {
    return app.request(`/api/classes/class/task-assignments${path}`, {
      method,
      headers: { "content-type": "application/json", "x-test-user": user },
      body,
    });
  }

  function delayedJsonRequest(method: string, path: string, body: unknown, user = "teacher") {
    let bodyRead!: () => void;
    const reading = new Promise<void>((resolve) => {
      bodyRead = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const encoded = new TextEncoder().encode(JSON.stringify(body));
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        bodyRead();
        await gate;
        controller.enqueue(encoded);
        controller.close();
      },
    });
    const input = new Request(`http://localhost/api/classes/class/task-assignments${path}`, {
      method,
      headers: { "content-type": "application/json", "x-test-user": user },
      body: stream,
      duplex: "half",
    } as RequestInit);
    return {
      bodyRead: reading,
      release,
      response: Promise.resolve(app.request(input)),
    };
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

  it("compares due and submitted timestamps by instant", async () => {
    const cases = [
      {
        due: "2026-11-28T10:00:00-05:00", // 15:00Z
        submitted: "2026-11-28T12:00:00.000Z",
        late: false,
      },
      {
        due: "2026-11-28T10:00:00+08:00", // 02:00Z
        submitted: "2026-11-28T02:30:00.000Z",
        late: true,
      },
      {
        due: "2026-11-28T10:00:00Z",
        submitted: "2026-11-28T10:00:00.000Z",
        late: false,
      },
    ] as const;

    for (const item of cases) {
      db.prepare("UPDATE task_assignments SET due_at = ? WHERE id = 'assignment'").run(item.due);
      db.prepare("UPDATE task_responses SET submitted_at = ? WHERE id = 'response'").run(
        item.submitted,
      );
      const response = await request("GET", "/assignment/responses");
      expect(response.status).toBe(200);
      const body = (await response.json()) as { rows: { late: boolean }[] };
      expect(body.rows[0]?.late).toBe(item.late);
    }
  });

  it("requires an explicit UTC offset on due dates", async () => {
    for (const dueAt of [
      "2026-11-28",
      "2026-11-28 10:00:00",
      "2026-11-28T10:00:00",
      "2026-13-01T10:00:00Z",
    ]) {
      const response = await request("PATCH", "/assignment", JSON.stringify({ dueAt }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid-due-at" });
    }
    for (const dueAt of [
      "2026-11-28T10:00:00Z",
      "2026-11-28T10:00:00.000Z",
      "2026-11-28T10:00:00+08:00",
      "2026-11-28T10:00:00-05:00",
    ]) {
      const response = await request("PATCH", "/assignment", JSON.stringify({ dueAt }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ assignment: { due_at: dueAt } });
    }
  });

  it("rejects non-finite review scores", () => {
    expect(isValidReviewScore(NaN, 5)).toBe(false);
    expect(isValidReviewScore(Infinity, 5)).toBe(false);
    expect(isValidReviewScore(-Infinity, 5)).toBe(false);
    expect(isValidReviewScore(0, 5)).toBe(true);
    expect(isValidReviewScore(5, 5)).toBe(true);
    expect(isValidReviewScore(5.01, 5)).toBe(false);
  });

  it("rejects an overflowing JSON score as non-finite", async () => {
    db.prepare("UPDATE task_responses SET status = 'submitted'").run();
    const response = await request(
      "PATCH",
      "/assignment/responses/response/review",
      '{"questions":{"q1":{"score":1e400}}}',
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-review-score" });
  });

  it("does not create a response when submit validation fails", async () => {
    db.prepare("DELETE FROM task_responses").run();
    db.prepare("UPDATE task_assignments SET schema_json = ? WHERE id = 'assignment'").run(
      JSON.stringify({
        version: 1,
        questions: [{ id: "q1", type: "short", prompt: "必答", required: true, maxScore: 5 }],
      }),
    );

    const response = await request("POST", "/assignment/response/submit", undefined, "student");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "required-question-unanswered" });
    const row = db.prepare("SELECT COUNT(*) AS count FROM task_responses").get() as {
      count: number;
    };
    expect(row.count).toBe(0);
  });

  it("allows one concurrent submit and locks the other", async () => {
    const statuses = await Promise.all([
      request("POST", "/assignment/response/submit", undefined, "student").then((r) => r.status),
      request("POST", "/assignment/response/submit", undefined, "student").then((r) => r.status),
    ]);
    expect(statuses.sort()).toEqual([200, 409]);

    const row = db
      .prepare("SELECT status, auto_score AS autoScore FROM task_responses WHERE id = 'response'")
      .get() as { status: string; autoScore: number | null };
    expect(row.status).toBe("submitted");
    expect(row.autoScore).toBe(0);
  });

  it("does not let a delayed autosave reopen a submitted response", async () => {
    const delayed = delayedJsonRequest(
      "PUT",
      "/assignment/response",
      { answers: { q1: { type: "short", text: "迟到的自动保存" } } },
      "student",
    );
    await delayed.bodyRead;

    const submitted = await request("POST", "/assignment/response/submit", undefined, "student");
    expect(submitted.status).toBe(200);

    delayed.release();
    const saved = await delayed.response;
    expect(saved.status).toBe(409);
    expect(await saved.json()).toEqual({ error: "response-locked" });

    const row = db
      .prepare(
        "SELECT status, answers_json AS answersJson FROM task_responses WHERE id = 'response'",
      )
      .get() as { status: string; answersJson: string };
    expect(row.status).toBe("submitted");
    expect(JSON.parse(row.answersJson)).toEqual(answers);
  });

  it("does not let a delayed review revive a returned response", async () => {
    db.prepare("UPDATE task_responses SET status = 'submitted'").run();
    const delayed = delayedJsonRequest("PATCH", "/assignment/responses/response/review", {
      questions: { q1: { score: 4 } },
    });
    await delayed.bodyRead;

    const returned = await request("POST", "/assignment/responses/response/return");
    expect(returned.status).toBe(200);

    delayed.release();
    const reviewed = await delayed.response;
    expect(reviewed.status).toBe(409);
    expect(await reviewed.json()).toEqual({ error: "response-not-submitted" });

    const row = db
      .prepare("SELECT status, review_json AS reviewJson FROM task_responses WHERE id = 'response'")
      .get() as { status: string; reviewJson: string | null };
    expect(row.status).toBe("returned");
    expect(row.reviewJson).toBeNull();
  });

  it("rolls back a created response when the submit write fails", async () => {
    db.prepare("DELETE FROM task_responses").run();
    const originalPrepare = db.prepare.bind(db);
    const prepare = vi.spyOn(db, "prepare").mockImplementation((sql: string) => {
      if (sql.includes("UPDATE task_responses") && sql.includes("status = 'submitted'")) {
        throw new Error("forced submit write failure");
      }
      return originalPrepare(sql);
    });

    try {
      const response = await request("POST", "/assignment/response/submit", undefined, "student");
      expect(response.status).toBe(500);
    } finally {
      prepare.mockRestore();
    }

    const row = db.prepare("SELECT COUNT(*) AS count FROM task_responses").get() as {
      count: number;
    };
    expect(row.count).toBe(0);
  });
});
