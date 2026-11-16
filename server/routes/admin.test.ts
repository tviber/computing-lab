import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { canAccessLab, LAB_REGISTRY } from "../labs.ts";
import { labMetadata } from "../../src/shared/lab/labMetadata.ts";
import { adminRoutes } from "./admin.ts";
import { authRoutes } from "./auth.ts";
import { calculatorRoutes } from "./calculator.ts";
import { dashboardRoutes } from "./dashboard.ts";
import { labsRoutes } from "./labs.ts";
import { mlIntroRoutes } from "./mlIntro.ts";

async function setup() {
  const db = openMemoryDb();
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    "c1",
    "测试班级",
    "CLASS26",
  );
  const seed = async (studentNo: string, name: string, role: string, password = "pw") => {
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    ).run(newId(), studentNo, name, await hashPassword(password), role);
  };
  await seed("admin", "管理员", "admin", "admin-pass");
  await seed("teacher", "教师", "teacher", "teacher-pass");
  await seed("20260101", "张三", "user", "student-pass");

  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/auth", authRoutes());
  app.route("/api/admin", adminRoutes());
  app.route("/api/classes/:classId/dashboard", dashboardRoutes());
  app.route("/api/classes/:classId/labs/calculator", calculatorRoutes());
  app.route("/api/classes/:classId/labs/ml-intro", mlIntroRoutes());
  app.route("/api/labs", labsRoutes());
  return { db, app };
}

async function login(app: Hono<{ Variables: AppVariables }>, studentNo: string, password: string) {
  const response = await app.fetch(
    new Request("http://lab.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentNo, password }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";", 1)[0];
}

function post(
  app: Hono<{ Variables: AppVariables }>,
  path: string,
  body: unknown,
  cookie?: string,
) {
  return app.fetch(
    new Request(`http://lab.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

function request(
  app: Hono<{ Variables: AppVariables }>,
  method: string,
  path: string,
  body: unknown,
  cookie?: string,
) {
  return app.fetch(
    new Request(`http://lab.test${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

describe("admin guard", () => {
  it("rejects anonymous, student, and teacher callers", async () => {
    const { app } = await setup();
    const anonymous = await post(app, "/api/admin/users", {});
    expect(anonymous.status).toBe(401);

    const student = await post(
      app,
      "/api/admin/users",
      {},
      await login(app, "20260101", "student-pass"),
    );
    expect(student.status).toBe(403);
    expect(await student.json()).toEqual({ error: "admin-required" });

    const teacher = await post(
      app,
      "/api/admin/users",
      {},
      await login(app, "teacher", "teacher-pass"),
    );
    expect(teacher.status).toBe(403);
  });
});

describe("single account creation", () => {
  it("creates a student account that can log in", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const response = await post(
      app,
      "/api/admin/users",
      { studentNo: "20260102", name: "李四", password: "pw-1234", classId: "c1" },
      cookie,
    );
    expect(response.status).toBe(201);
    const row = db
      .prepare("SELECT role, password_hash AS passwordHash FROM users WHERE student_no = ?")
      .get("20260102") as { role: string; passwordHash: string };
    expect(row.role).toBe("user");
    expect(await verifyPassword("pw-1234", row.passwordHash)).toBe(true);
    const member = db
      .prepare(
        `SELECT m.role FROM class_members m JOIN users u ON u.id = m.user_id
         WHERE u.student_no = ? AND m.class_id = 'c1'`,
      )
      .get("20260102") as { role: string };
    expect(member.role).toBe("student");

    const loginResponse = await app.fetch(
      new Request("http://lab.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentNo: "20260102", password: "pw-1234" }),
      }),
    );
    expect(loginResponse.status).toBe(200);
  });

  it("rejects a duplicate student number with 409", async () => {
    const { app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const response = await post(
      app,
      "/api/admin/users",
      { studentNo: "20260101", name: "重复", password: "pw-1234" },
      cookie,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "student-no-taken" });
  });
});

describe("batch import", () => {
  it("imports CSV rows, assigns classes, and reports per-row failures", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const csv = [
      "学号,姓名,密码,角色,班级邀请码",
      "20260110,王五,pw-a,学生,CLASS26",
      "t1001,赵老师,pw-teacher-b,教师,CLASS26",
      "20260101,重复学号,pw-c",
      "bad no,坏学号,pw-d",
      "20260111,无班级,pw-e,,NOPE",
    ].join("\n");
    const response = await post(app, "/api/admin/users/import", { csv }, cookie);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      created: number;
      exists: number;
      failed: number;
      rows: { line: number; studentNo: string; status: string; error?: string }[];
    };
    expect(payload.created).toBe(2);
    expect(payload.exists).toBe(1);
    expect(payload.failed).toBe(2);

    const teacherRow = db
      .prepare(
        `SELECT u.role, m.role AS memberRole FROM users u
         JOIN class_members m ON m.user_id = u.id WHERE u.student_no = 't1001'`,
      )
      .get() as { role: string; memberRole: string };
    expect(teacherRow).toEqual({ role: "teacher", memberRole: "teacher" });

    const missing = payload.rows.find((row) => row.studentNo === "20260111");
    expect(missing?.status).toBe("error");
    expect(missing?.error).toBe("class-not-found");
  });

  it("imports a JSON users array", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const response = await post(
      app,
      "/api/admin/users/import",
      { users: [{ studentNo: "20260120", name: "JSON 学生", password: "pw-json" }] },
      cookie,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { created: number };
    expect(payload.created).toBe(1);
    expect(db.prepare("SELECT role FROM users WHERE student_no = '20260120'").get()).toEqual({
      role: "user",
    });
  });
});

describe("class management", () => {
  it("creates a class and lists it with its invite code", async () => {
    const { app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const created = await post(app, "/api/admin/classes", { name: "2026-新班" }, cookie);
    expect(created.status).toBe(201);
    const { class: klass } = (await created.json()) as { class: { inviteCode: string } };
    expect(klass.inviteCode).toMatch(/^[A-Z0-9]{8}$/);

    const list = await app.fetch(
      new Request("http://lab.test/api/admin/classes", { headers: { cookie } }),
    );
    const { classes } = (await list.json()) as {
      classes: { name: string; inviteCode: string }[];
    };
    expect(classes.map((c) => c.name)).toContain("2026-新班");
  });

  it("deletes an empty class but refuses a class with members", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const created = await post(app, "/api/admin/classes", { name: "空班级" }, cookie);
    const { class: empty } = (await created.json()) as { class: { id: string } };

    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'student')",
    ).run(newId(), studentId);

    const refused = await request(app, "DELETE", "/api/admin/classes/c1", undefined, cookie);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "class-not-empty" });

    const removed = await request(
      app,
      "DELETE",
      `/api/admin/classes/${empty.id}`,
      undefined,
      cookie,
    );
    expect(removed.status).toBe(200);
    expect(db.prepare("SELECT id FROM classes WHERE id = ?").get(empty.id)).toBeUndefined();
  });
});

describe("role editing", () => {
  it("promotes a user to teacher and syncs membership role", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'student')",
    ).run(newId(), studentId);

    const response = await request(
      app,
      "PUT",
      `/api/admin/users/${studentId}/role`,
      { role: "teacher" },
      cookie,
    );
    expect(response.status).toBe(200);
    expect(db.prepare("SELECT role FROM users WHERE id = ?").get(studentId)).toEqual({
      role: "teacher",
    });
    expect(
      db
        .prepare("SELECT role FROM class_members WHERE class_id = 'c1' AND user_id = ?")
        .get(studentId),
    ).toEqual({ role: "teacher" });

    const dashboard = await app.fetch(
      new Request("http://lab.test/api/classes/c1/dashboard", {
        headers: { cookie: await login(app, "20260101", "student-pass") },
      }),
    );
    expect(dashboard.status).toBe(200);
  });

  it("refuses to set anyone's role to admin", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;
    const response = await request(
      app,
      "PUT",
      `/api/admin/users/${studentId}/role`,
      { role: "admin" },
      cookie,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "admin-role-not-editable" });
  });

  it("refuses to edit the caller's own role", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const adminId = (
      db.prepare("SELECT id FROM users WHERE student_no = 'admin'").get() as { id: string }
    ).id;
    const response = await request(
      app,
      "PUT",
      `/api/admin/users/${adminId}/role`,
      { role: "user" },
      cookie,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "cannot-edit-own-role" });
  });
});

describe("password reset", () => {
  it("resets the password, drops the target's sessions, and keeps the role", async () => {
    const { db, app } = await setup();
    const adminCookie = await login(app, "admin", "admin-pass");
    const studentCookie = await login(app, "20260101", "student-pass");
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;

    const response = await request(
      app,
      "PUT",
      `/api/admin/users/${studentId}/password`,
      { password: "new-pass-1" },
      adminCookie,
    );
    expect(response.status).toBe(200);

    const row = db
      .prepare("SELECT role, password_hash AS passwordHash FROM users WHERE id = ?")
      .get(studentId) as { role: string; passwordHash: string };
    expect(row.role).toBe("user");
    expect(await verifyPassword("new-pass-1", row.passwordHash)).toBe(true);

    const stale = await app.fetch(
      new Request("http://lab.test/api/auth/me", { headers: { cookie: studentCookie } }),
    );
    expect(stale.status).toBe(401);

    await login(app, "20260101", "new-pass-1");
  });

  it("rejects a weak or missing password", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;

    const weak = await request(
      app,
      "PUT",
      `/api/admin/users/${studentId}/password`,
      { password: "abc" },
      cookie,
    );
    expect(weak.status).toBe(400);
    expect(await weak.json()).toEqual({ error: "weak-password" });

    const missing = await request(app, "PUT", `/api/admin/users/${studentId}/password`, {}, cookie);
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "invalid-body" });
  });

  it("returns 404 for an unknown user and refuses the caller's own password", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");

    const missing = await request(
      app,
      "PUT",
      "/api/admin/users/nobody/password",
      { password: "new-pass-1" },
      cookie,
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "user-not-found" });

    const adminId = (
      db.prepare("SELECT id FROM users WHERE student_no = 'admin'").get() as { id: string }
    ).id;
    const own = await request(
      app,
      "PUT",
      `/api/admin/users/${adminId}/password`,
      { password: "new-pass-1" },
      cookie,
    );
    expect(own.status).toBe(400);
    expect(await own.json()).toEqual({ error: "cannot-edit-own-password" });
  });
});

describe("user listing pagination", () => {
  it("pages users with a default page size of 50 and clamps out-of-range pages", async () => {
    const { app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");

    const first = await request(
      app,
      "GET",
      "/api/admin/users?pageSize=2&page=1",
      undefined,
      cookie,
    );
    const firstPayload = (await first.json()) as {
      users: { studentNo: string; classes: unknown[] }[];
      total: number;
      page: number;
      pageSize: number;
    };
    expect(firstPayload.total).toBe(3);
    expect(firstPayload.pageSize).toBe(2);
    expect(firstPayload.page).toBe(1);
    expect(firstPayload.users).toHaveLength(2);
    expect(firstPayload.users[0]).toHaveProperty("classes");

    const second = await request(
      app,
      "GET",
      "/api/admin/users?pageSize=2&page=2",
      undefined,
      cookie,
    );
    const secondPayload = (await second.json()) as { users: { studentNo: string }[] };
    expect(secondPayload.users).toHaveLength(1);

    const firstIds = firstPayload.users.map((u) => u.studentNo);
    expect(secondPayload.users.map((u) => u.studentNo)).not.toContain(firstIds[0]);

    const beyond = await request(
      app,
      "GET",
      "/api/admin/users?pageSize=2&page=99",
      undefined,
      cookie,
    );
    const beyondPayload = (await beyond.json()) as { page: number; users: unknown[] };
    expect(beyondPayload.page).toBe(2);

    const unparam = await request(app, "GET", "/api/admin/users", undefined, cookie);
    const unparamPayload = (await unparam.json()) as { pageSize: number; users: unknown[] };
    expect(unparamPayload.pageSize).toBe(50);
    expect(unparamPayload.users).toHaveLength(3);
  });

  it("searches users by student number or name", async () => {
    const { app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");

    const byStudentNo = await request(
      app,
      "GET",
      "/api/admin/users?pageSize=2&page=1&search=202601",
      undefined,
      cookie,
    );
    const studentPayload = (await byStudentNo.json()) as {
      users: { studentNo: string }[];
      total: number;
      search: string;
    };
    expect(studentPayload.search).toBe("202601");
    expect(studentPayload.total).toBe(1);
    expect(studentPayload.users.map((user) => user.studentNo)).toEqual(["20260101"]);

    const byName = await request(app, "GET", "/api/admin/users?search=张", undefined, cookie);
    const namePayload = (await byName.json()) as {
      users: { name: string }[];
      total: number;
    };
    expect(namePayload.total).toBe(1);
    expect(namePayload.users.map((user) => user.name)).toEqual(["张三"]);
  });
});

describe("class assignment", () => {
  it("adds a student and a teacher to a class with matching member roles", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const idOf = (studentNo: string) =>
      (db.prepare("SELECT id FROM users WHERE student_no = ?").get(studentNo) as { id: string }).id;

    const student = await request(
      app,
      "PUT",
      `/api/admin/classes/c1/members/${idOf("20260101")}`,
      undefined,
      cookie,
    );
    expect(student.status).toBe(201);
    expect(
      db
        .prepare("SELECT role FROM class_members WHERE class_id = 'c1' AND user_id = ?")
        .get(idOf("20260101")),
    ).toEqual({ role: "student" });

    const teacher = await request(
      app,
      "PUT",
      `/api/admin/classes/c1/members/${idOf("teacher")}`,
      undefined,
      cookie,
    );
    expect(teacher.status).toBe(201);
    expect(
      db
        .prepare("SELECT role FROM class_members WHERE class_id = 'c1' AND user_id = ?")
        .get(idOf("teacher")),
    ).toEqual({ role: "teacher" });
  });

  it("rejects duplicates and missing class or user", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'student')",
    ).run(newId(), studentId);

    const duplicate = await request(
      app,
      "PUT",
      `/api/admin/classes/c1/members/${studentId}`,
      undefined,
      cookie,
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "already-member" });

    const noClass = await request(
      app,
      "PUT",
      `/api/admin/classes/nope/members/${studentId}`,
      undefined,
      cookie,
    );
    expect(noClass.status).toBe(404);
    expect(await noClass.json()).toEqual({ error: "class-not-found" });

    const noUser = await request(
      app,
      "PUT",
      "/api/admin/classes/c1/members/nobody",
      undefined,
      cookie,
    );
    expect(noUser.status).toBe(404);
    expect(await noUser.json()).toEqual({ error: "user-not-found" });
  });
});

describe("account deletion", () => {
  it("deletes the account together with records, memberships, and sessions", async () => {
    const { db, app } = await setup();
    const adminCookie = await login(app, "admin", "admin-pass");
    const studentCookie = await login(app, "20260101", "student-pass");
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'student')",
    ).run(newId(), studentId);
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id) VALUES (?, ?, 'c1', 'calculator')",
    ).run("p1", studentId);
    db.prepare(
      `INSERT INTO submissions (id, project_id, user_id, lab_id, stage_index, snapshot_graph,
         score, total, passed, test_summary)
       VALUES ('s1', 'p1', ?, 'calculator', 1, '{}', 3, 3, 1, '{}')`,
    ).run(studentId);

    const response = await request(
      app,
      "DELETE",
      `/api/admin/users/${studentId}`,
      undefined,
      adminCookie,
    );
    expect(response.status).toBe(200);
    expect(db.prepare("SELECT id FROM users WHERE id = ?").get(studentId)).toBeUndefined();
    expect(db.prepare("SELECT id FROM submissions WHERE user_id = ?").all(studentId)).toHaveLength(
      0,
    );
    expect(
      db.prepare("SELECT id FROM student_projects WHERE user_id = ?").all(studentId),
    ).toHaveLength(0);
    expect(
      db.prepare("SELECT id FROM class_members WHERE user_id = ?").all(studentId),
    ).toHaveLength(0);
    expect(db.prepare("SELECT id FROM sessions WHERE user_id = ?").all(studentId)).toHaveLength(0);

    const stale = await app.fetch(
      new Request("http://lab.test/api/auth/me", { headers: { cookie: studentCookie } }),
    );
    expect(stale.status).toBe(401);
  });

  it("refuses self-deletion and returns 404 for unknown users", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const adminId = (
      db.prepare("SELECT id FROM users WHERE student_no = 'admin'").get() as { id: string }
    ).id;

    const own = await request(app, "DELETE", `/api/admin/users/${adminId}`, undefined, cookie);
    expect(own.status).toBe(400);
    expect(await own.json()).toEqual({ error: "cannot-delete-self" });

    const missing = await request(app, "DELETE", "/api/admin/users/nobody", undefined, cookie);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "user-not-found" });
  });
});

describe("record clearing", () => {
  it("clears submissions and projects while keeping the account and membership", async () => {
    const { db, app } = await setup();
    const adminCookie = await login(app, "admin", "admin-pass");
    const studentCookie = await login(app, "20260101", "student-pass");
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'student')",
    ).run(newId(), studentId);
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id) VALUES ('p1', ?, 'c1', 'calculator')",
    ).run(studentId);
    for (const [id, stage] of [
      ["s1", 1],
      ["s2", 2],
    ]) {
      db.prepare(
        `INSERT INTO submissions (id, project_id, user_id, lab_id, stage_index, snapshot_graph,
           score, total, passed, test_summary)
         VALUES (?, 'p1', ?, 'calculator', ?, '{}', 3, 3, 1, '{}')`,
      ).run(id, studentId, stage);
    }

    const response = await request(
      app,
      "DELETE",
      `/api/admin/users/${studentId}/records`,
      undefined,
      adminCookie,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cleared: { submissions: 2, projects: 1, taskResponses: 0 },
    });
    expect(db.prepare("SELECT id FROM submissions WHERE user_id = ?").all(studentId)).toHaveLength(
      0,
    );
    expect(
      db.prepare("SELECT id FROM student_projects WHERE user_id = ?").all(studentId),
    ).toHaveLength(0);
    expect(
      db.prepare("SELECT id FROM class_members WHERE user_id = ?").all(studentId),
    ).toHaveLength(1);

    // The account stays valid — an active session is not kicked out.
    const me = await app.fetch(
      new Request("http://lab.test/api/auth/me", { headers: { cookie: studentCookie } }),
    );
    expect(me.status).toBe(200);
  });

  it("returns 404 for an unknown user", async () => {
    const { app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const response = await request(
      app,
      "DELETE",
      "/api/admin/users/nobody/records",
      undefined,
      cookie,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "user-not-found" });
  });
});

describe("member removal", () => {
  it("removes a member while other memberships survive", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES ('c2', '二班', 'CLASS2')").run();
    for (const classId of ["c1", "c2"]) {
      db.prepare(
        "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, 'student')",
      ).run(newId(), classId, studentId);
    }

    const removed = await request(
      app,
      "DELETE",
      `/api/admin/classes/c1/members/${studentId}`,
      undefined,
      cookie,
    );
    expect(removed.status).toBe(200);
    const remaining = db
      .prepare("SELECT class_id AS classId FROM class_members WHERE user_id = ?")
      .all(studentId) as { classId: string }[];
    expect(remaining.map((row) => row.classId)).toEqual(["c2"]);

    const again = await request(
      app,
      "DELETE",
      `/api/admin/classes/c1/members/${studentId}`,
      undefined,
      cookie,
    );
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: "membership-not-found" });
  });
});

describe("admin teacher access", () => {
  it("lets an admin read a class dashboard without a membership row", async () => {
    const { app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const response = await app.fetch(
      new Request("http://lab.test/api/classes/c1/dashboard", { headers: { cookie } }),
    );
    expect(response.status).toBe(200);
  });

  it("denies dashboard access to a student member", async () => {
    const { db, app } = await setup();
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as {
        id: string;
      }
    ).id;
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, 'student')",
    ).run(newId(), "c1", studentId);
    const cookie = await login(app, "20260101", "student-pass");
    const response = await app.fetch(
      new Request("http://lab.test/api/classes/c1/dashboard", { headers: { cookie } }),
    );
    expect(response.status).toBe(403);
  });
});

describe("student canvas forensics", () => {
  const seedCanvas = (db: ReturnType<typeof openMemoryDb>, studentId: string) => {
    db.prepare(
      `INSERT INTO student_projects
         (id, user_id, class_id, lab_id, draft_graph, current_stage, passed_stages)
       VALUES (?, ?, 'c1', 'calculator', ?, 3, '[1,2]')`,
    ).run(
      "p1",
      studentId,
      JSON.stringify({
        "1": {
          nodes: [{ id: "a", kind: "input", name: "A", value: 0, x: 0, y: 0 }],
          edges: [],
        },
      }),
    );
    db.prepare(
      `INSERT INTO submissions (id, project_id, user_id, lab_id, stage_index, snapshot_graph,
         score, total, passed, test_summary)
       VALUES ('s1', 'p1', ?, 'calculator', 1, '{"nodes":[],"edges":[]}', 0, 1, 0, '{"error":"x"}')`,
    ).run(studentId);
  };

  it("serves drafts and submission snapshots to an admin only", async () => {
    const { db, app } = await setup();
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;
    seedCanvas(db, studentId);

    const teacher = await request(
      app,
      "GET",
      `/api/admin/users/${studentId}/labs/calculator/canvas`,
      undefined,
      await login(app, "teacher", "teacher-pass"),
    );
    expect(teacher.status).toBe(403);
    const student = await request(
      app,
      "GET",
      `/api/admin/users/${studentId}/labs/calculator/canvas`,
      undefined,
      await login(app, "20260101", "student-pass"),
    );
    expect(student.status).toBe(403);

    const admin = await login(app, "admin", "admin-pass");
    const drafts = await request(
      app,
      "GET",
      `/api/admin/users/${studentId}/labs/calculator/canvas?revision=draft`,
      undefined,
      admin,
    );
    expect(drafts.status).toBe(200);
    const draftPayload = (await drafts.json()) as {
      revision: string;
      currentStage: number;
      passedStages: number[];
      drafts: Record<string, { kind: string; graph: { nodes: unknown[] } }>;
    };
    expect(draftPayload.revision).toBe("draft");
    expect(draftPayload.currentStage).toBe(3);
    expect(draftPayload.passedStages).toEqual([1, 2]);
    expect(draftPayload.drafts["1"].kind).toBe("circuit");
    expect(draftPayload.drafts["1"].graph.nodes).toHaveLength(1);

    const index = await request(
      app,
      "GET",
      `/api/admin/users/${studentId}/labs/calculator/canvas?revision=submission`,
      undefined,
      admin,
    );
    const { submissions } = (await index.json()) as {
      submissions: { id: string; stageIndex: number; passed: boolean }[];
    };
    expect(submissions).toEqual([
      {
        id: "s1",
        stageIndex: 1,
        score: 0,
        total: 1,
        passed: false,
        submittedAt: expect.any(String),
      },
    ]);

    const snapshot = await request(
      app,
      "GET",
      `/api/admin/users/${studentId}/labs/calculator/canvas?revision=submission&submission=s1`,
      undefined,
      admin,
    );
    expect(snapshot.status).toBe(200);
    const snapshotPayload = (await snapshot.json()) as {
      submission: { id: string; testSummary: { error: string } };
      canvas: { kind: string };
    };
    expect(snapshotPayload.submission.id).toBe("s1");
    expect(snapshotPayload.submission.testSummary.error).toBe("x");
    expect(snapshotPayload.canvas.kind).toBe("circuit");
  });

  it("returns 404s for unknown users, stages, and submissions", async () => {
    const { db, app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;

    const noUser = await request(
      app,
      "GET",
      "/api/admin/users/nobody/labs/calculator/canvas",
      undefined,
      cookie,
    );
    expect(noUser.status).toBe(404);
    expect(await noUser.json()).toEqual({ error: "user-not-found" });

    const noLab = await request(
      app,
      "GET",
      `/api/admin/users/${studentId}/labs/nope/canvas`,
      undefined,
      cookie,
    );
    expect(noLab.status).toBe(404);
    expect(await noLab.json()).toEqual({ error: "unknown-lab" });

    const noStage = await request(
      app,
      "GET",
      `/api/admin/users/${studentId}/labs/calculator/canvas?revision=draft&stage=99`,
      undefined,
      cookie,
    );
    expect(noStage.status).toBe(404);
    expect(await noStage.json()).toEqual({ error: "not-found" });

    const noSubmission = await request(
      app,
      "GET",
      `/api/admin/users/${studentId}/labs/calculator/canvas?revision=submission&submission=s9`,
      undefined,
      cookie,
    );
    expect(noSubmission.status).toBe(404);

    const badRevision = await request(
      app,
      "GET",
      `/api/admin/users/${studentId}/labs/calculator/canvas?revision=bogus`,
      undefined,
      cookie,
    );
    expect(badRevision.status).toBe(400);
    expect(await badRevision.json()).toEqual({ error: "invalid-revision" });
  });
});

describe("lab visibility", () => {
  const memberOf = (db: ReturnType<typeof openMemoryDb>, studentNo: string) => {
    const { id } = db.prepare("SELECT id FROM users WHERE student_no = ?").get(studentNo) as {
      id: string;
    };
    return id;
  };

  it("rejects anonymous, student, and teacher callers on the toggle", async () => {
    const { app } = await setup();
    const anonymous = await request(app, "PUT", "/api/admin/labs/calculator/visibility", {
      hidden: true,
    });
    expect(anonymous.status).toBe(401);

    const student = await login(app, "20260101", "student-pass");
    const teacher = await login(app, "teacher", "teacher-pass");
    for (const cookie of [student, teacher]) {
      const res = await request(
        app,
        "PUT",
        "/api/admin/labs/calculator/visibility",
        { hidden: true },
        cookie,
      );
      expect(res.status).toBe(403);
    }
  });

  it("rejects unknown labs and malformed bodies", async () => {
    const { app } = await setup();
    const cookie = await login(app, "admin", "admin-pass");
    const unknown = await request(
      app,
      "PUT",
      "/api/admin/labs/nope/visibility",
      { hidden: true },
      cookie,
    );
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "unknown-lab" });
    for (const body of [
      {},
      { hidden: "yes" },
      { hidden: 1 },
      { hidden: false, openClassIds: "c1" },
      { hidden: false, openClassIds: [1] },
    ]) {
      const res = await request(app, "PUT", "/api/admin/labs/calculator/visibility", body, cookie);
      expect(res.status).toBe(400);
    }

    const missingClass = await request(
      app,
      "PUT",
      "/api/admin/labs/calculator/visibility",
      { hidden: false, openClassIds: ["c1", "nope"] },
      cookie,
    );
    expect(missingClass.status).toBe(404);
    expect(await missingClass.json()).toEqual({ error: "class-not-found" });
  });

  it("requires auth for the catalog and reflects the toggle", async () => {
    const { app } = await setup();
    const anonymous = await request(app, "GET", "/api/labs", undefined);
    expect(anonymous.status).toBe(401);

    const cookie = await login(app, "admin", "admin-pass");
    const before = (await (await request(app, "GET", "/api/labs", undefined, cookie)).json()) as {
      labs: { id: string; hidden: boolean; openClassIds: string[] | null; visible: boolean }[];
    };
    expect(before.labs.map((lab) => lab.id)).toEqual(LAB_REGISTRY.map((lab) => lab.id));
    expect(before.labs.some((lab) => lab.id === "ml-intro")).toBe(true);
    expect(before.labs.map((lab) => lab.id)).not.toContain("cpu");
    expect(before.labs.map((lab) => lab.id)).not.toContain("audio-encoding");
    expect(before.labs.map((lab) => lab.id)).not.toContain("is-sim");
    expect(before.labs.every((lab) => lab.hidden === false)).toBe(true);
    expect(before.labs.every((lab) => lab.openClassIds === null)).toBe(true);
    expect(before.labs.every((lab) => lab.visible === true)).toBe(true);

    const toggled = await request(
      app,
      "PUT",
      "/api/admin/labs/decoding/visibility",
      { hidden: true },
      cookie,
    );
    expect(toggled.status).toBe(200);
    const after = (await (await request(app, "GET", "/api/labs", undefined, cookie)).json()) as {
      labs: { id: string; hidden: boolean; openClassIds: string[] | null; visible: boolean }[];
    };
    expect(after.labs.find((lab) => lab.id === "decoding")?.hidden).toBe(true);
    expect(after.labs.find((lab) => lab.id === "calculator")?.hidden).toBe(false);
    // Admins keep `visible` even on hidden labs so they can preview them.
    expect(after.labs.find((lab) => lab.id === "decoding")?.visible).toBe(true);
  });

  it("revokes a globally open lab after a student's last class membership is removed", async () => {
    const { app, db } = await setup();
    const studentId = memberOf(db, "20260101");
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'student')",
    ).run(newId(), studentId);

    const admin = await login(app, "admin", "admin-pass");
    const student = await login(app, "20260101", "student-pass");
    const opened = await request(
      app,
      "PUT",
      "/api/admin/labs/decoding/visibility",
      { hidden: false, openClassIds: null },
      admin,
    );
    expect(opened.status).toBe(200);

    const decodingVisible = async () => {
      const response = await request(app, "GET", "/api/labs", undefined, student);
      const payload = (await response.json()) as {
        labs: { id: string; visible: boolean }[];
      };
      return payload.labs.find((lab) => lab.id === "decoding")?.visible;
    };

    expect(await decodingVisible()).toBe(true);
    db.prepare("DELETE FROM class_members WHERE user_id = ?").run(studentId);
    expect(await decodingVisible()).toBe(false);
    expect(
      canAccessLab(db, "decoding", {
        id: studentId,
        studentNo: "20260101",
        name: "张三",
        role: "user",
      }),
    ).toBe(false);
  });

  it("blocks students and teachers from a hidden lab until reopened", async () => {
    const { db, app } = await setup();
    const admin = await login(app, "admin", "admin-pass");
    const teacher = await login(app, "teacher", "teacher-pass");
    const student = await login(app, "20260101", "student-pass");
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'teacher')",
    ).run(newId(), memberOf(db, "teacher"));
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'student')",
    ).run(newId(), memberOf(db, "20260101"));

    await request(app, "PUT", "/api/admin/labs/calculator/visibility", { hidden: true }, admin);

    const project = (cookie: string) =>
      request(app, "GET", "/api/classes/c1/labs/calculator/project", undefined, cookie);
    expect((await project(student)).status).toBe(403);
    expect(await (await project(student)).json()).toEqual({ error: "lab-not-available" });
    expect((await project(teacher)).status).toBe(403);
    expect(
      (await request(app, "GET", "/api/classes/c1/dashboard?lab=calculator", undefined, teacher))
        .status,
    ).toBe(403);
    const draft = await request(
      app,
      "PUT",
      "/api/classes/c1/labs/calculator/draft",
      { stageIndex: 1, graph: {} },
      student,
    );
    expect(draft.status).toBe(403);

    // Admins keep full access — they preview and reopen hidden labs.
    expect((await project(admin)).status).toBe(200);
    expect(
      (await request(app, "GET", "/api/classes/c1/dashboard?lab=calculator", undefined, admin))
        .status,
    ).toBe(200);

    await request(app, "PUT", "/api/admin/labs/calculator/visibility", { hidden: false }, admin);
    expect((await project(student)).status).toBe(200);
    expect(
      (await request(app, "GET", "/api/classes/c1/dashboard?lab=calculator", undefined, teacher))
        .status,
    ).toBe(200);
  });

  it("scopes an open lab to the checked classes", async () => {
    const { db, app } = await setup();
    const admin = await login(app, "admin", "admin-pass");
    const teacher = await login(app, "teacher", "teacher-pass");
    const student = await login(app, "20260101", "student-pass");
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES ('c2', '二班', 'C2')").run();
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'teacher')",
    ).run(newId(), memberOf(db, "teacher"));
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c2', ?, 'teacher')",
    ).run(newId(), memberOf(db, "teacher"));
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'student')",
    ).run(newId(), memberOf(db, "20260101"));
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, 'user')",
    ).run(newId(), "20260102", "李四", await hashPassword("pw-1234"));
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c2', ?, 'student')",
    ).run(newId(), memberOf(db, "20260102"));
    const student2 = await login(app, "20260102", "pw-1234");

    // Open to c2 only: c1 members lose the lab, c2 members keep it.
    const scoped = await request(
      app,
      "PUT",
      "/api/admin/labs/calculator/visibility",
      { hidden: false, openClassIds: ["c2"] },
      admin,
    );
    expect(scoped.status).toBe(200);
    expect(await scoped.json()).toEqual({
      lab: { id: "calculator", hidden: false, openClassIds: ["c2"] },
    });

    const project = (cookie: string, classId = "c1") =>
      request(app, "GET", `/api/classes/${classId}/labs/calculator/project`, undefined, cookie);
    expect((await project(student)).status).toBe(403);
    expect(await (await project(student)).json()).toEqual({ error: "lab-not-available" });
    expect((await project(student2, "c2")).status).toBe(200);
    expect((await project(admin)).status).toBe(200);

    // The catalog reports the per-user verdict: c1's student sees visible=false
    // while the admin row stays visible for preview.
    const studentCatalog = (await (
      await request(app, "GET", "/api/labs", undefined, student)
    ).json()) as { labs: { id: string; visible: boolean }[] };
    expect(studentCatalog.labs.find((lab) => lab.id === "calculator")?.visible).toBe(false);
    const adminCatalog = (await (
      await request(app, "GET", "/api/labs", undefined, admin)
    ).json()) as { labs: { id: string; visible: boolean }[] };
    expect(adminCatalog.labs.find((lab) => lab.id === "calculator")?.visible).toBe(true);

    // The dashboard follows the viewed class: c1's dashboard is closed, c2's works.
    expect(
      (await request(app, "GET", "/api/classes/c1/dashboard?lab=calculator", undefined, teacher))
        .status,
    ).toBe(403);
    expect(
      (await request(app, "GET", "/api/classes/c2/dashboard?lab=calculator", undefined, teacher))
        .status,
    ).toBe(200);

    // An empty scope admits no class at all; null reopens to every class.
    await request(
      app,
      "PUT",
      "/api/admin/labs/calculator/visibility",
      { hidden: false, openClassIds: [] },
      admin,
    );
    expect((await project(student2, "c2")).status).toBe(403);
    await request(
      app,
      "PUT",
      "/api/admin/labs/calculator/visibility",
      { hidden: false, openClassIds: null },
      admin,
    );
    expect((await project(student)).status).toBe(200);
  });

  it("registers ml-intro in both the visibility registry and shared lab metadata", async () => {
    const { app, db } = await setup();
    const admin = await login(app, "admin", "admin-pass");
    const teacher = await login(app, "teacher", "teacher-pass");
    const student = await login(app, "20260101", "student-pass");
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'teacher')",
    ).run(newId(), memberOf(db, "teacher"));
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'student')",
    ).run(newId(), memberOf(db, "20260101"));

    for (const lab of LAB_REGISTRY) {
      expect(labMetadata[lab.id as keyof typeof labMetadata]?.title).toBeTruthy();
    }

    const catalogRes = await request(app, "GET", "/api/labs", undefined, admin);
    expect(catalogRes.status).toBe(200);
    const { labs } = (await catalogRes.json()) as {
      labs: { id: string; stageCount: number; hidden: boolean; openClassIds: string[] | null }[];
    };
    expect(labs.find((lab) => lab.id === "ml-intro")).toMatchObject({
      id: "ml-intro",
      stageCount: 6,
      hidden: false,
      openClassIds: null,
    });

    await request(app, "PUT", "/api/admin/labs/ml-intro/visibility", { hidden: true }, admin);
    expect(
      (await request(app, "GET", "/api/classes/c1/labs/ml-intro/project", undefined, student))
        .status,
    ).toBe(403);
    expect(
      (await request(app, "GET", "/api/classes/c1/dashboard?lab=ml-intro", undefined, teacher))
        .status,
    ).toBe(403);
    expect(
      (await request(app, "GET", "/api/classes/c1/dashboard?lab=ml-intro", undefined, admin))
        .status,
    ).toBe(200);

    await request(
      app,
      "PUT",
      "/api/admin/labs/ml-intro/visibility",
      { hidden: false, openClassIds: ["c1"] },
      admin,
    );
    expect(
      (await request(app, "GET", "/api/classes/c1/labs/ml-intro/project", undefined, student))
        .status,
    ).toBe(200);
    expect(
      (await request(app, "GET", "/api/classes/c1/dashboard?lab=ml-intro", undefined, teacher))
        .status,
    ).toBe(200);
  });
});
