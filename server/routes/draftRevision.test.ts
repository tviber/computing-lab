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
  const studentId = newId();
  db.prepare(
    "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
  ).run(studentId, "stu-1", "stu-1", await hashPassword("pass"), "user");
  db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
    newId(),
    classId,
    studentId,
    "student",
  );
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/classes/:classId/labs/image-sampling", imageSamplingRoutes());
  const cookie = `lab_session=${createSession(db, studentId).id}`;
  return { app, classId, cookie, db, studentId };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/image-sampling${path}`;

const putDraft = (
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
  body: Record<string, unknown>,
) =>
  app.fetch(
    new Request(url(classId, "/draft"), {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ expectedGeneration: 0, ...body }),
    }),
  );

const projectOf = async (
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
) => {
  const project = await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
  return (await project.json()) as {
    drafts: Record<string, { code?: string }>;
    draftRevisions: Record<string, number>;
  };
};

describe("draft optimistic concurrency", () => {
  it("rejects saves without expectedRevision", async () => {
    const { app, classId, cookie } = await setup();
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      draft: { a: 1 },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid-revision" });
  });

  it("rejects non-numeric or negative expectedRevision", async () => {
    const { app, classId, cookie } = await setup();
    for (const expectedRevision of ["12", -1, 1.5]) {
      const res = await putDraft(app, classId, cookie, {
        stageIndex: 1,
        expectedRevision,
        draft: { a: 1 },
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid-revision" });
    }
  });

  it("applies the first write at expected 0 and assigns revision 1", async () => {
    const { app, classId, cookie } = await setup();
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 0,
      draft: { code: "first" },
    });
    expect(await res.json()).toMatchObject({ ok: true, applied: true, revision: 1 });
    expect((await projectOf(app, classId, cookie)).drafts["1"].code).toBe("first");
  });

  it("assigns strictly increasing revisions per accepted write", async () => {
    const { app, classId, cookie } = await setup();
    await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 0,
      draft: { code: "a" },
    });
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 1,
      draft: { code: "b" },
    });
    expect(await res.json()).toMatchObject({ applied: true, revision: 2 });
    expect((await projectOf(app, classId, cookie)).drafts["1"].code).toBe("b");
  });

  it("rejects a stale expected revision and reports the stored one", async () => {
    const { app, classId, cookie } = await setup();
    // Device A lands two writes: stored revision is now 2.
    await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 0,
      draft: { code: "a1" },
    });
    await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 1,
      draft: { code: "a2" },
    });

    // Device B still believes revision 1 is latest — its write is refused
    // rather than resurrecting older data, and it learns the true revision.
    const stale = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 1,
      draft: { code: "from-b" },
    });
    expect(stale.status).toBe(200);
    expect(await stale.json()).toMatchObject({ ok: true, applied: false, revision: 2 });
    expect((await projectOf(app, classId, cookie)).drafts["1"].code).toBe("a2");
  });

  it("rejects a write that skips ahead of the stored revision", async () => {
    const { app, classId, cookie } = await setup();
    await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 0,
      draft: { code: "a" },
    });
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 3,
      draft: { code: "jump" },
    });
    expect(await res.json()).toMatchObject({ applied: false, revision: 1 });
    expect((await projectOf(app, classId, cookie)).drafts["1"].code).toBe("a");
  });

  it("tracks revisions independently per stage", async () => {
    const { app, classId, cookie } = await setup();
    const one = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 0,
      draft: { code: "s1" },
    });
    expect(await one.json()).toMatchObject({ applied: true, revision: 1 });
    // Stage 2 starts its own counter — stage 1's revision does not lift it.
    const two = await putDraft(app, classId, cookie, {
      stageIndex: 2,
      expectedRevision: 0,
      draft: { code: "s2" },
    });
    expect(await two.json()).toMatchObject({ applied: true, revision: 1 });
  });

  it("serializes concurrent same-stage writes deterministically", async () => {
    const { app, classId, cookie } = await setup();
    // Two tabs both believe revision 0 is current and write at once: exactly
    // one wins; the other learns the stored revision instead of clobbering.
    const [a, b] = await Promise.all([
      putDraft(app, classId, cookie, {
        stageIndex: 1,
        expectedRevision: 0,
        draft: { code: "from-a" },
      }),
      putDraft(app, classId, cookie, {
        stageIndex: 1,
        expectedRevision: 0,
        draft: { code: "from-b" },
      }),
    ]);
    const bodies = (await Promise.all([a.json(), b.json()])) as {
      applied: boolean;
      revision: number;
    }[];
    expect(bodies.map((r) => r.applied).sort()).toEqual([false, true]);
    const winner = bodies.find((r) => r.applied);
    const loser = bodies.find((r) => !r.applied);
    expect(winner?.revision).toBe(1);
    expect(loser?.revision).toBe(1);
    expect((await projectOf(app, classId, cookie)).drafts["1"].code).toMatch(/from-(a|b)/);
  });

  it("round-trips expectedRevision through the project payload", async () => {
    const { app, classId, cookie } = await setup();
    await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 0,
      draft: { code: "a1" },
    });
    const second = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 1,
      draft: { code: "a2" },
    });
    expect(await second.json()).toMatchObject({ applied: true, revision: 2 });

    // After a reload the client reads the stored revision back from the
    // project payload and uses it as the next expectedRevision.
    const project = await projectOf(app, classId, cookie);
    expect(project.draftRevisions["1"]).toBe(2);
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: project.draftRevisions["1"],
      draft: { code: "a3" },
    });
    expect(await res.json()).toMatchObject({ applied: true, revision: 3 });
  });

  it("a rejected writer recovers by rebasing on the stored revision", async () => {
    const { app, classId, cookie } = await setup();
    await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 0,
      draft: { code: "a1" },
    });
    const stale = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 0,
      draft: { code: "b-stale" },
    });
    expect(await stale.json()).toMatchObject({ applied: false, revision: 1 });

    // The conflict-recovery client refetches and rewrites under the revision
    // the server actually holds — the write then applies.
    const retry = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 1,
      draft: { code: "b-rebased" },
    });
    expect(await retry.json()).toMatchObject({ applied: true, revision: 2 });
    expect((await projectOf(app, classId, cookie)).drafts["1"].code).toBe("b-rebased");
  });

  it("still reads legacy {revision, saveToken} revision objects", async () => {
    const { app, classId, cookie, db, studentId } = await setup();
    // Rows migrated from the client-clock protocol carry object revisions —
    // they must keep reading as plain numbers so saves keep converging.
    const first = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 0,
      draft: { code: "a1" },
    });
    expect(await first.json()).toMatchObject({ applied: true });
    db.prepare("UPDATE student_projects SET draft_revisions = ? WHERE user_id = ?").run(
      JSON.stringify({ "1": { revision: 5, saveToken: "old" } }),
      studentId,
    );
    const project = await projectOf(app, classId, cookie);
    expect(project.draftRevisions["1"]).toBe(5);
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      expectedRevision: 5,
      draft: { code: "a2" },
    });
    expect(await res.json()).toMatchObject({ applied: true, revision: 6 });
  });
});
