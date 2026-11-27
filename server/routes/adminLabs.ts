import { Hono } from "hono";
import { jsonError, type AppVariables } from "../http/context.ts";
import { labInfo, setLabVisibility } from "../labs.ts";
import {
  readBoolean,
  readJsonObject,
  readOptionalNullableStringArray,
} from "../http/validation.ts";

export function adminLabsRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.put("/labs/:labId/visibility", async (c) => {
    const labId = c.req.param("labId");
    if (!labInfo(labId)) return jsonError(c, 404, "unknown-lab");
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 400, "invalid-body");
    const hidden = readBoolean(body, "hidden");
    const openClassIds = readOptionalNullableStringArray(body, "openClassIds");
    if (hidden === null || !openClassIds.ok) return jsonError(c, 400, "invalid-body");

    const db = c.get("db");
    if (Array.isArray(openClassIds.value) && openClassIds.value.length > 0) {
      const known = new Set(
        (db.prepare("SELECT id FROM classes").all() as { id: string }[]).map((row) => row.id),
      );
      if (openClassIds.value.some((id) => !known.has(id))) {
        return jsonError(c, 404, "class-not-found");
      }
    }

    const next = setLabVisibility(db, labId, {
      hidden,
      openClassIds: openClassIds.value,
    });
    return c.json({ lab: { id: labId, ...next } });
  });

  /**
   * Admin-only forensics: a student's live draft or submission snapshot.
   *   ?revision=draft[&stage=N]
   *   ?revision=submission[&submission=<id>|&stage=N]
   */
  app.get("/users/:userId/labs/:labId/canvas", (c) => {
    const labId = c.req.param("labId");
    if (!labInfo(labId)) return jsonError(c, 404, "unknown-lab");
    const db = c.get("db");
    const userId = c.req.param("userId");
    const student = db
      .prepare("SELECT id, student_no AS studentNo, name FROM users WHERE id = ?")
      .get(userId) as { id: string; studentNo: string; name: string } | undefined;
    if (!student) return jsonError(c, 404, "user-not-found");

    const project = db
      .prepare(
        `SELECT unlocked_submodules AS submodules, draft_graph AS draftGraph,
                current_stage AS currentStage, passed_stages AS passedStages,
                updated_at AS updatedAt
         FROM student_projects WHERE user_id = ? AND lab_id = ?`,
      )
      .get(userId, labId) as
      | {
          submodules: string;
          draftGraph: string;
          currentStage: number;
          passedStages: string;
          updatedAt: string;
        }
      | undefined;
    const components = project ? JSON.parse(project.submodules) : [];
    const wrap = (raw: unknown) =>
      labId === "calculator" ? { kind: "circuit", graph: raw } : { kind: "raw", data: raw };

    const revision = c.req.query("revision") ?? "draft";
    if (revision === "draft") {
      const drafts = project ? (JSON.parse(project.draftGraph) as Record<string, unknown>) : {};
      const stageParam = c.req.query("stage");
      if (stageParam !== undefined) {
        const raw = drafts[stageParam];
        if (raw === undefined) return jsonError(c, 404, "not-found");
        return c.json({
          student,
          labId,
          revision,
          updatedAt: project?.updatedAt ?? null,
          stage: Number(stageParam),
          canvas: wrap(raw),
          components,
        });
      }
      return c.json({
        student,
        labId,
        revision,
        updatedAt: project?.updatedAt ?? null,
        currentStage: project?.currentStage ?? 1,
        passedStages: project ? JSON.parse(project.passedStages) : [],
        drafts: Object.fromEntries(
          Object.keys(drafts).map((stage) => [stage, wrap(drafts[stage])]),
        ),
        components,
      });
    }

    if (revision === "submission") {
      const submissionId = c.req.query("submission");
      const stageParam = c.req.query("stage");
      if (submissionId === undefined && stageParam === undefined) {
        const rows = db
          .prepare(
            `SELECT id, stage_index AS stageIndex, score, total, passed,
                    submitted_at AS submittedAt
             FROM submissions WHERE user_id = ? AND lab_id = ?
             ORDER BY submitted_at DESC, id DESC`,
          )
          .all(userId, labId) as {
          id: string;
          stageIndex: number;
          score: number;
          total: number;
          passed: number;
          submittedAt: string;
        }[];
        return c.json({
          student,
          labId,
          revision,
          submissions: rows.map((row) => ({ ...row, passed: row.passed === 1 })),
        });
      }
      const row = (
        submissionId !== undefined
          ? db
              .prepare(
                `SELECT id, stage_index AS stageIndex, snapshot_graph AS snapshotGraph,
                        score, total, passed, test_summary AS testSummary,
                        submitted_at AS submittedAt
                 FROM submissions WHERE id = ? AND user_id = ? AND lab_id = ?`,
              )
              .get(submissionId, userId, labId)
          : db
              .prepare(
                `SELECT id, stage_index AS stageIndex, snapshot_graph AS snapshotGraph,
                        score, total, passed, test_summary AS testSummary,
                        submitted_at AS submittedAt
                 FROM submissions WHERE user_id = ? AND lab_id = ? AND stage_index = ?
                 ORDER BY submitted_at DESC, id DESC LIMIT 1`,
              )
              .get(userId, labId, Number(stageParam))
      ) as
        | {
            id: string;
            stageIndex: number;
            snapshotGraph: string;
            score: number;
            total: number;
            passed: number;
            testSummary: string;
            submittedAt: string;
          }
        | undefined;
      if (!row) return jsonError(c, 404, "not-found");
      const snapshot = JSON.parse(row.snapshotGraph);
      return c.json({
        student,
        labId,
        revision,
        submission: {
          id: row.id,
          stageIndex: row.stageIndex,
          score: row.score,
          total: row.total,
          passed: row.passed === 1,
          testSummary: JSON.parse(row.testSummary),
          submittedAt: row.submittedAt,
        },
        canvas: wrap(snapshot),
        components,
      });
    }

    return jsonError(c, 400, "invalid-revision");
  });

  return app;
}
