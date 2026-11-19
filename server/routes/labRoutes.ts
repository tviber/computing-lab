/**
 * Shared lab pipeline: every lab exposes GET /project, PUT /draft, and
 * POST /judge under /api/classes/:classId/labs/<lab>. Each route file only
 * declares its stage contract and the three data functions — access control,
 * stage validation, and payload shape live here once.
 */

import { Hono, type Context } from "hono";
import type { DatabaseSync } from "node:sqlite";
import type { SessionUser } from "../auth/session.ts";
import {
  jsonError,
  requireMembership,
  type AppVariables,
  type GuardFailure,
  type Membership,
} from "../http/context.ts";
import {
  getOrCreateProject,
  resetLabProject,
  type DraftSaveResult,
  type LabJudgeError,
  type ProjectRow,
} from "../judge/pipeline.ts";
import { canAccessLab } from "../labs.ts";

type LabContext = Context<{ Variables: AppVariables }>;
type LabAuth = { user: SessionUser; membership: Membership };

function isStaffUser(user: SessionUser): boolean {
  return user.role === "teacher" || user.role === "admin";
}

type LabSpec<TDraft, TOutcome> = {
  labId: string;
  stageCount: number;
  /** The draft body may carry `components` — then `expectedComponentsRevision`
   *  is required and CAS'd alongside the stage revision (calculator). */
  usesComponents?: boolean;
  /** Extra top-level fields merged into the GET /project and POST /reset payloads. */
  projectExtras?: (
    db: DatabaseSync,
    project: ProjectRow<TDraft>,
    options: { staff: boolean },
  ) => Record<string, unknown>;
  saveDraft: (
    db: DatabaseSync,
    project: ProjectRow<TDraft>,
    stageIndex: number,
    body: Record<string, unknown>,
    expectedRevision: number,
    expectedComponentsRevision?: number,
    expectedGeneration?: number,
  ) => DraftSaveResult;
  judge: (
    db: DatabaseSync,
    project: ProjectRow<TDraft>,
    stageIndex: number,
    body: Record<string, unknown>,
    options: { staff: boolean },
  ) => TOutcome | LabJudgeError;
};

export function labRoutes<TDraft, TOutcome extends object>(
  spec: LabSpec<TDraft, TOutcome>,
): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();

  const requireAccess = (c: LabContext): LabAuth | GuardFailure => {
    const auth = requireMembership(c);
    if ("error" in auth) return auth;
    // Hidden labs are admin-only; open labs admit members of the checked
    // classes (all classes when no scope is pinned).
    if (!canAccessLab(c.get("db"), spec.labId, auth.user)) {
      return { error: "lab-not-available", status: 403 };
    }
    return auth;
  };

  const projectOf = (db: DatabaseSync, auth: LabAuth) =>
    getOrCreateProject<TDraft>(db, auth.user.id, auth.membership.classId, spec.labId);

  const projectPayload = (db: DatabaseSync, auth: LabAuth, project: ProjectRow<TDraft>) => {
    const staff = isStaffUser(auth.user);
    return {
      labId: project.labId,
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      drafts: project.drafts,
      // Per-stage revision of the latest applied write — the client seeds its
      // expectedRevision from this so its next save is a compare-and-swap.
      draftRevisions: project.draftRevisions,
      projectGeneration: project.projectGeneration,
      staffFreeNavigation: staff,
      ...(spec.projectExtras?.(db, project, { staff }) ?? {}),
    };
  };

  const stageIndexOf = (body: unknown): number | null => {
    const stageIndex = Number((body as { stageIndex?: unknown } | null)?.stageIndex);
    return Number.isInteger(stageIndex) && stageIndex >= 1 && stageIndex <= spec.stageCount
      ? stageIndex
      : null;
  };

  const parseRequiredGeneration = (body: unknown): number | null => {
    const raw = (body as { expectedGeneration?: unknown } | null)?.expectedGeneration;
    return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : null;
  };

  app.get("/project", (c) => {
    const auth = requireAccess(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    return c.json(projectPayload(db, auth, projectOf(db, auth)));
  });

  app.post("/reset", (c) => {
    const auth = requireAccess(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    if (!isStaffUser(auth.user)) return jsonError(c, 403, "teacher-required");
    const db = c.get("db");
    const reset = resetLabProject<TDraft>(db, projectOf(db, auth).id);
    return c.json(projectPayload(db, auth, reset));
  });

  app.put("/draft", async (c) => {
    const auth = requireAccess(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await c.req.json().catch(() => null);
    const stageIndex = stageIndexOf(body);
    if (stageIndex === null) return jsonError(c, 400, "invalid-stage");
    // Optimistic concurrency: the client states which server revision its
    // write builds on (0/null on the first write); the server applies it only
    // while that is still the stored revision, assigning stored+1 itself.
    const rawExpected = body?.expectedRevision;
    const expectedRevision = rawExpected === null ? 0 : rawExpected;
    if (
      typeof expectedRevision !== "number" ||
      !Number.isInteger(expectedRevision) ||
      expectedRevision < 0
    ) {
      return jsonError(c, 400, "invalid-revision");
    }
    // A component-library write needs its own expected revision — without
    // one it cannot be compared and must not write anything.
    const rawExpectedComponents = body?.expectedComponentsRevision;
    const expectedComponentsRevision = rawExpectedComponents === null ? 0 : rawExpectedComponents;
    if (spec.usesComponents && body?.components !== undefined) {
      if (
        typeof expectedComponentsRevision !== "number" ||
        !Number.isInteger(expectedComponentsRevision) ||
        expectedComponentsRevision < 0
      ) {
        return jsonError(c, 400, "invalid-revision");
      }
    }
    const expectedGeneration = parseRequiredGeneration(body);
    if (expectedGeneration === null) return jsonError(c, 400, "invalid-generation");
    const db = c.get("db");
    const result = spec.saveDraft(
      db,
      projectOf(db, auth),
      stageIndex,
      body as Record<string, unknown>,
      expectedRevision,
      expectedComponentsRevision as number | undefined,
      expectedGeneration,
    );
    return c.json({
      ok: true,
      applied: result.applied,
      revision: result.revision,
      ...(result.projectGeneration !== undefined
        ? { projectGeneration: result.projectGeneration }
        : {}),
      ...(result.componentsRevision !== undefined
        ? { componentsRevision: result.componentsRevision }
        : {}),
      savedAt: new Date().toISOString(),
    });
  });

  app.post("/judge", async (c) => {
    const auth = requireAccess(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await c.req.json().catch(() => null);
    const stageIndex = stageIndexOf(body);
    if (stageIndex === null) return jsonError(c, 400, "invalid-stage");
    const expectedGeneration = parseRequiredGeneration(body);
    if (expectedGeneration === null) return jsonError(c, 400, "invalid-generation");
    const db = c.get("db");
    const project = projectOf(db, auth);
    if (project.projectGeneration !== expectedGeneration) {
      return jsonError(c, 409, "stale-project-generation");
    }
    const outcome = spec.judge(db, project, stageIndex, body as Record<string, unknown>, {
      staff: isStaffUser(auth.user),
    });
    if ("error" in outcome) {
      return jsonError(c, (outcome as LabJudgeError).status, (outcome as LabJudgeError).error);
    }
    return c.json(outcome);
  });

  return app;
}
