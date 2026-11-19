import { describe, expect, it } from "vitest";
import { Hono, type MiddlewareHandler } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { newId, openMemoryDb } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { LAB_IDS, type LabId } from "../../src/shared/lab/labMetadata.ts";
import { calculatorRoutes } from "./calculator.ts";
import { colorQuantizationRoutes } from "./colorQuantization.ts";
import { decodingRoutes } from "./decoding.ts";
import { imageSamplingRoutes } from "./imageSampling.ts";
import { lunchShiftRoutes } from "./lunchShift.ts";
import { logisticRegressionRoutes } from "./logisticRegression.ts";

type LabCase = {
  labId: LabId;
  mount: () => Hono<{ Variables: AppVariables }>;
  gatedStage: number;
  draftBody: Record<string, unknown>;
  judgeBody: Record<string, unknown>;
};

const LAB_CASES: LabCase[] = [
  {
    labId: "calculator",
    mount: calculatorRoutes,
    gatedStage: 7,
    draftBody: {
      stageIndex: 1,
      expectedRevision: 0,
      expectedGeneration: 0,
      graph: { nodes: [], edges: [] },
    },
    judgeBody: { stageIndex: 7, expectedGeneration: 0, graph: { nodes: [], edges: [] } },
  },
  {
    labId: "decoding",
    mount: decodingRoutes,
    gatedStage: 2,
    draftBody: {
      stageIndex: 1,
      expectedRevision: 0,
      expectedGeneration: 0,
      draft: { fills: { "1": "ord(c)" } },
    },
    judgeBody: { stageIndex: 2, expectedGeneration: 0, artifact: { text: "AB" }, code: "" },
  },
  {
    labId: "lunch-shift",
    mount: lunchShiftRoutes,
    gatedStage: 3,
    draftBody: {
      stageIndex: 2,
      expectedRevision: 0,
      expectedGeneration: 0,
      draft: { confirmCode: "return True" },
    },
    judgeBody: {
      stageIndex: 3,
      expectedGeneration: 0,
      draft: { code: "def priority(u, w, c): return u", priority: null },
    },
  },
  {
    labId: "logistic-regression",
    mount: logisticRegressionRoutes,
    gatedStage: 4,
    draftBody: {
      stageIndex: 1,
      expectedRevision: 0,
      expectedGeneration: 0,
      draft: { weights: { 中奖: 2 } },
    },
    judgeBody: { stageIndex: 4, expectedGeneration: 0, draft: { eta: 0.1, epochs: 12 } },
  },
  {
    labId: "image-sampling",
    mount: imageSamplingRoutes,
    gatedStage: 3,
    draftBody: {
      stageIndex: 1,
      expectedRevision: 0,
      expectedGeneration: 0,
      draft: { width: 16, height: 16, code: "x" },
    },
    judgeBody: {
      stageIndex: 3,
      expectedGeneration: 0,
      width: 16,
      height: 16,
      code: "def choose_size(imgs):\n return 16",
    },
  },
  {
    labId: "color-quantization",
    mount: colorQuantizationRoutes,
    gatedStage: 3,
    draftBody: {
      stageIndex: 2,
      expectedRevision: 0,
      expectedGeneration: 0,
      draft: { toners: [0, 1], code: "x" },
    },
    judgeBody: {
      stageIndex: 3,
      expectedGeneration: 0,
      toners: [0, 1, 2, 3],
      table: null,
      code: "",
    },
  },
];

async function setupEnv() {
  const db = openMemoryDb();
  const classId = newId();
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    classId,
    "教师测试班",
    "invite-staff",
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
  app.use(
    "/api/*",
    attachDb(db),
    attachSession() as MiddlewareHandler<{ Variables: AppVariables }>,
  );
  for (const c of LAB_CASES) {
    app.route(`/api/classes/:classId/labs/${c.labId}`, c.mount());
  }

  const cookieFor = (userId: string) => `lab_session=${createSession(db, userId).id}`;
  return { db, classId, studentId, teacherId, adminId, app, cookieFor };
}

const labUrl = (classId: string, labId: LabId, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/${labId}${path}`;

describe("shared staff privilege abstraction across all 6 labs", () => {
  it("covers every registered LAB_ID", () => {
    expect(LAB_CASES.map((c) => c.labId).sort()).toEqual([...LAB_IDS].sort());
  });

  it.each(LAB_CASES)(
    "$labId: applies navigation policy and grants all roles isolated self-reset",
    async ({ labId, gatedStage, draftBody, judgeBody }) => {
      const { db, classId, studentId, teacherId, adminId, app, cookieFor } = await setupEnv();
      const studentCookie = cookieFor(studentId);
      const teacherCookie = cookieFor(teacherId);
      const adminCookie = cookieFor(adminId);
      const staffFreeNavigation = labId !== "logistic-regression";

      const stuProjRes = await app.fetch(
        new Request(labUrl(classId, labId, "/project"), { headers: { cookie: studentCookie } }),
      );
      expect(stuProjRes.status).toBe(200);
      expect(await stuProjRes.json()).toMatchObject({ staffFreeNavigation: false });

      const teaProjRes = await app.fetch(
        new Request(labUrl(classId, labId, "/project"), { headers: { cookie: teacherCookie } }),
      );
      expect(teaProjRes.status).toBe(200);
      expect(await teaProjRes.json()).toMatchObject({ staffFreeNavigation });

      const admProjRes = await app.fetch(
        new Request(labUrl(classId, labId, "/project"), { headers: { cookie: adminCookie } }),
      );
      expect(admProjRes.status).toBe(200);
      expect(await admProjRes.json()).toMatchObject({ staffFreeNavigation });

      const stuJudge = await app.fetch(
        new Request(labUrl(classId, labId, "/judge"), {
          method: "POST",
          headers: { cookie: studentCookie, "content-type": "application/json" },
          body: JSON.stringify(judgeBody),
        }),
      );
      expect(stuJudge.status).toBe(409);
      expect(await stuJudge.json()).toMatchObject({ error: "stage-locked" });

      const stuDraft = await app.fetch(
        new Request(labUrl(classId, labId, "/draft"), {
          method: "PUT",
          headers: { cookie: studentCookie, "content-type": "application/json" },
          body: JSON.stringify(draftBody),
        }),
      );
      expect(stuDraft.status).toBe(200);

      for (const [userId, cookie] of [
        [teacherId, teacherCookie],
        [adminId, adminCookie],
      ] as const) {
        const putDraft = await app.fetch(
          new Request(labUrl(classId, labId, "/draft"), {
            method: "PUT",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify(draftBody),
          }),
        );
        expect(putDraft.status).toBe(200);

        const judgeRes = await app.fetch(
          new Request(labUrl(classId, labId, "/judge"), {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify(judgeBody),
          }),
        );
        expect(judgeRes.status).toBe(staffFreeNavigation ? 200 : 409);
        if (!staffFreeNavigation) {
          expect(await judgeRes.json()).toMatchObject({ error: "stage-locked" });
        }

        const projectRow = db
          .prepare(
            "SELECT id FROM student_projects WHERE class_id = ? AND user_id = ? AND lab_id = ?",
          )
          .get(classId, userId, labId) as { id: string };
        db.prepare(
          "INSERT INTO cpu_guided_first_answers (project_id, stage_index, prompt_id, option_index) VALUES (?, ?, ?, ?)",
        ).run(projectRow.id, gatedStage, "probe", 0);

        const beforeResetSubs = db
          .prepare("SELECT COUNT(*) AS n FROM submissions WHERE project_id = ?")
          .get(projectRow.id) as { n: number };
        expect(beforeResetSubs.n).toBe(staffFreeNavigation ? 1 : 0);

        const resetRes = await app.fetch(
          new Request(labUrl(classId, labId, "/reset"), {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ scope: "lab" }),
          }),
        );
        expect(resetRes.status).toBe(200);
        expect(await resetRes.json()).toMatchObject({
          labId,
          currentStage: 1,
          passedStages: [],
          drafts: {},
          draftRevisions: {},
          projectGeneration: 1,
          staffFreeNavigation,
        });

        const staleDraftRes = await app.fetch(
          new Request(labUrl(classId, labId, "/draft"), {
            method: "PUT",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ ...draftBody, expectedRevision: 0, expectedGeneration: 0 }),
          }),
        );
        expect(staleDraftRes.status).toBe(200);
        expect(await staleDraftRes.json()).toMatchObject({
          applied: false,
          revision: 0,
          projectGeneration: 1,
        });

        const staleJudgeRes = await app.fetch(
          new Request(labUrl(classId, labId, "/judge"), {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ ...judgeBody, expectedGeneration: 0 }),
          }),
        );
        expect(staleJudgeRes.status).toBe(409);
        expect(await staleJudgeRes.json()).toMatchObject({ error: "stale-project-generation" });

        const freshDraftRes = await app.fetch(
          new Request(labUrl(classId, labId, "/draft"), {
            method: "PUT",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ ...draftBody, expectedRevision: 0, expectedGeneration: 1 }),
          }),
        );
        expect(freshDraftRes.status).toBe(200);
        expect(await freshDraftRes.json()).toMatchObject({
          applied: true,
          revision: 1,
          projectGeneration: 1,
        });
        await app.fetch(
          new Request(labUrl(classId, labId, "/reset"), {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ scope: "lab" }),
          }),
        );

        const afterResetSubs = db
          .prepare("SELECT COUNT(*) AS n FROM submissions WHERE project_id = ?")
          .get(projectRow.id) as { n: number };
        expect(afterResetSubs.n).toBe(0);

        const afterResetGuided = db
          .prepare("SELECT COUNT(*) AS n FROM cpu_guided_first_answers WHERE project_id = ?")
          .get(projectRow.id) as { n: number };
        expect(afterResetGuided.n).toBe(0);
      }

      const stuAfter = await app.fetch(
        new Request(labUrl(classId, labId, "/project"), { headers: { cookie: studentCookie } }),
      );
      const stuBody = (await stuAfter.json()) as { drafts: Record<string, unknown> };
      expect(Object.keys(stuBody.drafts).length).toBeGreaterThan(0);
      const stuReset = await app.request(labUrl(classId, labId, "/reset"), {
        method: "POST",
        headers: { cookie: studentCookie, "content-type": "application/json" },
        body: JSON.stringify({ scope: "lab" }),
      });
      expect(stuReset.status).toBe(200);
      expect(await stuReset.json()).toMatchObject({
        currentStage: 1,
        drafts: {},
        projectGeneration: 1,
      });
    },
  );

  it("resets the chosen stage and every later record while preserving earlier work", async () => {
    const { db, classId, studentId, teacherId, app, cookieFor } = await setupEnv();
    const labId = "logistic-regression";
    const projectId = newId();
    db.prepare(
      `INSERT INTO student_projects
      (id, user_id, class_id, lab_id, current_stage, passed_stages, draft_graph, draft_revisions)
      VALUES (?, ?, ?, ?, 6, '[1,2,3,4,5]', '{"1":{},"2":{},"4":{}}', '{"1":8,"2":2,"4":4}')`,
    ).run(projectId, studentId, classId, labId);
    for (const stage of [1, 2, 4, 7]) {
      db.prepare(
        `INSERT INTO submissions
        (id, project_id, user_id, lab_id, stage_index, snapshot_graph, score, total, passed, test_summary)
        VALUES (?, ?, ?, ?, ?, '{}', 1, 1, 1, '{}')`,
      ).run(newId(), projectId, studentId, labId, stage);
      db.prepare(
        "INSERT INTO cpu_guided_first_answers (project_id, stage_index, prompt_id, option_index) VALUES (?, ?, 'probe', 0)",
      ).run(projectId, stage);
    }
    const resetUrl = labUrl(classId, labId, "/reset");
    const reset = (body: unknown, cookie = cookieFor(studentId)) =>
      app.request(resetUrl, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await reset({ scope: "stage", stageIndex: 2 }, "")).status).toBe(401);
    expect((await reset({})).status).toBe(400);
    for (const stageIndex of [null, true, "2", 0, 1.5, 6]) {
      expect((await reset({ scope: "stage", stageIndex })).status).toBe(400);
    }
    expect((await reset({ scope: "lab", userId: studentId }, cookieFor(teacherId))).status).toBe(
      200,
    );
    const response = await reset({ scope: "stage", stageIndex: 2 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      currentStage: 2,
      passedStages: [1],
      drafts: { 1: {} },
      draftRevisions: { 1: 8 },
      projectGeneration: 1,
      runSummaries: { s1: {}, s2: null, s4: null },
    });
    for (const table of ["submissions", "cpu_guided_first_answers"]) {
      const rows = db
        .prepare(`SELECT stage_index AS stage FROM ${table} WHERE project_id = ?`)
        .all(projectId);
      expect(rows).toEqual([{ stage: 1 }]);
    }
  });

  it("lunch-shift ships final aiOrders immediately to teacher/admin before stage 4 unlocks", async () => {
    const { classId, studentId, teacherId, adminId, app, cookieFor } = await setupEnv();

    const stuBody = (await (
      await app.fetch(
        new Request(labUrl(classId, "lunch-shift", "/project"), {
          headers: { cookie: cookieFor(studentId) },
        }),
      )
    ).json()) as { aiOrders: unknown };
    expect(stuBody.aiOrders).toBeNull();

    for (const staffId of [teacherId, adminId]) {
      const staffBody = (await (
        await app.fetch(
          new Request(labUrl(classId, "lunch-shift", "/project"), {
            headers: { cookie: cookieFor(staffId) },
          }),
        )
      ).json()) as { aiOrders: unknown[] | null; staffFreeNavigation: boolean };
      expect(staffBody.staffFreeNavigation).toBe(true);
      expect(Array.isArray(staffBody.aiOrders)).toBe(true);
      expect((staffBody.aiOrders ?? []).length).toBeGreaterThan(0);
    }
  });

  it("requires valid non-negative integer expectedGeneration on /draft and /judge", async () => {
    const { classId, teacherId, app, cookieFor } = await setupEnv();
    const cookie = cookieFor(teacherId);

    for (const expectedGeneration of [undefined, -1, "0", 1.5, null]) {
      const draftRes = await app.fetch(
        new Request(labUrl(classId, "logistic-regression", "/draft"), {
          method: "PUT",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({
            stageIndex: 1,
            expectedRevision: 0,
            expectedGeneration,
            draft: { weights: { 中奖: 2 } },
          }),
        }),
      );
      expect(draftRes.status).toBe(400);
      expect(await draftRes.json()).toMatchObject({ error: "invalid-generation" });

      const judgeRes = await app.fetch(
        new Request(labUrl(classId, "logistic-regression", "/judge"), {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({
            stageIndex: 1,
            expectedGeneration,
            draft: { weights: { 中奖: 2 } },
          }),
        }),
      );
      expect(judgeRes.status).toBe(400);
      expect(await judgeRes.json()).toMatchObject({ error: "invalid-generation" });
    }
  });
});
