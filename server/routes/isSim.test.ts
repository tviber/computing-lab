import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { isSimRoutes } from "./isSim.ts";

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
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/classes/:classId/labs/is-sim", isSimRoutes());
  const cookieFor = (userId: string) => `lab_session=${createSession(db, userId).id}`;
  return { db, classId, studentId, teacherId, app, cookieFor };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/is-sim${path}`;

/** Stage-1 reference: prefill scanner + db, one wire. */
const SOLVED_S1 = {
  nodes: [
    {
      id: "scan",
      kind: "sensor",
      label: "扫码枪",
      x: 0,
      y: 0,
      fixed: true,
      fixedParams: true,
      params: { interval: 0, base: 0, noise: 0 },
    },
    { id: "books", kind: "db", label: "书目库", x: 3, y: 0, fixed: true, params: {} },
  ],
  links: [{ from: "scan", to: "books", port: "write" }],
};

const judge = (
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
  body: unknown,
) =>
  app.fetch(
    new Request(url(classId, "/judge"), {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("is-sim routes", () => {
  it("creates a project", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(studentId) } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      labId: "is-sim",
      currentStage: 1,
      passedStages: [],
    });
  });

  it("teachers reach the lab", async () => {
    const { app, classId, teacherId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(teacherId) } }),
    );
    expect(res.status).toBe(200);
  });

  it("saves a draft and reads it back sanitized", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const dirty = {
      nodes: [
        ...SOLVED_S1.nodes,
        {
          id: "bogus node!",
          kind: "db",
          label: "x".repeat(99),
          x: 99,
          y: -4,
          params: { threshold: 1 },
        },
        { id: "scan", kind: "db", label: "重复id", x: 1, y: 1, params: {} },
      ],
      links: [
        { from: "scan", to: "books", port: "write" },
        { from: "ghost", to: "books", port: "write" },
        { from: "scan", to: "books", port: "bogus-port" },
      ],
    };
    const put = await app.fetch(
      new Request(url(classId, "/draft"), {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: 1, expectedRevision: 0, draft: dirty }),
      }),
    );
    expect(put.status).toBe(200);
    const project = await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    const body = (await project.json()) as { drafts: Record<string, typeof SOLVED_S1> };
    const saved = body.drafts["1"];
    expect(saved.nodes.map((n) => n.id)).toEqual(["scan", "books"]);
    expect(saved.links).toEqual([{ from: "scan", to: "books", port: "write" }]);
  });

  it("judges the stage-1 reference topology end-to-end", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: SOLVED_S1,
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      score: number;
      total: number;
      currentStage: number;
    };
    expect(outcome).toMatchObject({ passed: true, score: outcome.total, currentStage: 2 });
  });

  it("judges with stage prefill params even when the draft retunes a frozen device", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    // The S1 scanner is fixedParams; a crafted request claiming an
    // auto-emit interval would otherwise flood the db with junk records.
    const tampered = {
      nodes: SOLVED_S1.nodes.map((n) =>
        n.id === "scan"
          ? { ...n, fixedParams: false, params: { interval: 2, base: 500, noise: 0 } }
          : n,
      ),
      links: SOLVED_S1.links,
    };
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: tampered,
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as { passed: boolean; score: number; total: number };
    expect(outcome.passed).toBe(true);
    expect(outcome.score).toBe(outcome.total);
  });

  it("refuses a locked stage", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 3,
      draft: SOLVED_S1,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stage-locked" });
  });

  it("fails an unwired draft with a replayable counterexample", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: { nodes: SOLVED_S1.nodes, links: [] },
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      testSummary: {
        counterexample: {
          trace: { step: number; node: string }[];
          scenario: { script: unknown[]; horizon: number };
          dbDiff: { node: string }[];
        } | null;
      };
    };
    expect(outcome.passed).toBe(false);
    const counterexample = outcome.testSummary.counterexample;
    expect(counterexample).not.toBeNull();
    expect(counterexample!.trace.length).toBeGreaterThan(0);
    expect(counterexample!.scenario.horizon).toBeGreaterThan(0);
    expect(counterexample!.dbDiff[0]?.node).toBe("books");
  });

  it("rate-limits the 21st judge call within the window", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await judge(app, classId, cookie, { stageIndex: 1, draft: SOLVED_S1 });
      last = res.status;
    }
    expect(last).toBe(429);
    const res = await judge(app, classId, cookie, { stageIndex: 1, draft: {} });
    expect(await res.json()).toEqual({ error: "rate-limited" });
  });
});
