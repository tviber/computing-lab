import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { calculatorRoutes } from "./calculator.ts";

/**
 * Component-library OCC: the calculator saves carry the stage graph AND the
 * learner's component library. The library has its own revision — a save may
 * only write it when `expectedComponentsRevision` still matches, and a stale
 * compare bounces the WHOLE write (the stage graph may reference components
 * it was drawn against). A save that omits components touches only its stage.
 */

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
  app.route("/api/classes/:classId/labs/calculator", calculatorRoutes());
  const cookie = `lab_session=${createSession(db, studentId).id}`;
  return { app, classId, cookie, db };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/calculator${path}`;

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
    drafts: Record<string, { nodes?: unknown[] }>;
    draftRevisions: Record<string, number>;
    unlockedSubmodules: { name: string; custom?: boolean }[];
  };
};

const graph = { nodes: [], edges: [] };
const customComponent = (name: string) => ({ name, graph, custom: true });

describe("component-library optimistic concurrency", () => {
  it("requires expectedComponentsRevision when components are sent", async () => {
    const { app, classId, cookie } = await setup();
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      graph,
      components: [customComponent("MyGate")],
      expectedRevision: 0,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid-revision" });
    // Nothing was written — the library and the stage are both untouched.
    const project = await projectOf(app, classId, cookie);
    expect(project.unlockedSubmodules).toEqual([]);
    expect(project.drafts["1"]).toBeUndefined();
  });

  it("applies a library write and reports its own revision", async () => {
    const { app, classId, cookie } = await setup();
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      graph,
      components: [customComponent("MyGate")],
      expectedRevision: 0,
      expectedComponentsRevision: 0,
    });
    expect(await res.json()).toMatchObject({
      applied: true,
      revision: 1,
      componentsRevision: 1,
    });
    const project = await projectOf(app, classId, cookie);
    expect(project.unlockedSubmodules.map((c) => c.name)).toEqual(["MyGate"]);
    expect(project.draftRevisions.components).toBe(1);
  });

  it("lets an unrelated stage save omitting components apply while the library moved", async () => {
    const { app, classId, cookie } = await setup();
    // Tab B on stage 1 creates a component and saves: components rev → 1.
    await putDraft(app, classId, cookie, {
      stageIndex: 1,
      graph,
      components: [customComponent("BGate")],
      expectedRevision: 0,
      expectedComponentsRevision: 0,
    });
    // Tab A on stage 2 saves an ordinary draft — library unchanged, so its
    // stale copy stays out of the request entirely and can never clobber B.
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 2,
      graph: { nodes: [{ id: "n1" }], edges: [] },
      expectedRevision: 0,
    });
    expect(await res.json()).toMatchObject({ applied: true, revision: 1 });
    const project = await projectOf(app, classId, cookie);
    expect(project.unlockedSubmodules.map((c) => c.name)).toEqual(["BGate"]);
    expect(project.draftRevisions.components).toBe(1);
    expect(project.drafts["2"]).toBeDefined();
  });

  it("bounces the whole write when the library compare is stale", async () => {
    const { app, classId, cookie } = await setup();
    // Tab B lands its library: stored components revision 1.
    await putDraft(app, classId, cookie, {
      stageIndex: 1,
      graph,
      components: [customComponent("BGate")],
      expectedRevision: 0,
      expectedComponentsRevision: 0,
    });
    // Tab A's stale library (rev 0, carrying only AGate) must not clobber
    // B's — and its stage draft must not apply either: the whole write
    // bounces so the client reconciles library AND draft together.
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 2,
      graph: { nodes: [{ id: "a-node" }], edges: [] },
      components: [customComponent("AGate")],
      expectedRevision: 0,
      expectedComponentsRevision: 0,
    });
    expect(await res.json()).toMatchObject({
      applied: false,
      revision: 0,
      componentsRevision: 1,
    });
    const project = await projectOf(app, classId, cookie);
    expect(project.unlockedSubmodules.map((c) => c.name)).toEqual(["BGate"]);
    expect(project.drafts["2"]).toBeUndefined();
  });

  it("re-sends a restored library with the reconciled revision", async () => {
    const { app, classId, cookie } = await setup();
    await putDraft(app, classId, cookie, {
      stageIndex: 1,
      graph,
      components: [customComponent("BGate")],
      expectedRevision: 0,
      expectedComponentsRevision: 0,
    });
    // After reconciling, the learner's restored library (BGate + AGate)
    // supersedes legitimately at the fresh components revision.
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      graph,
      components: [customComponent("BGate"), customComponent("AGate")],
      expectedRevision: 1,
      expectedComponentsRevision: 1,
    });
    expect(await res.json()).toMatchObject({
      applied: true,
      revision: 2,
      componentsRevision: 2,
    });
    const project = await projectOf(app, classId, cookie);
    expect(project.unlockedSubmodules.map((c) => c.name)).toEqual(["BGate", "AGate"]);
  });
});
