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
  type ReconcileDrafts,
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
  usesComponents?: boolean;
  staffNavigation?: boolean;
  stageAffectedByReset?: (fromStage: number, stageIndex: number) => boolean;
  keepSubmodulesOnReset?: (
    library: unknown[],
    preservesStage: (stage: number) => boolean,
  ) => unknown[];
  reconcileDrafts?: ReconcileDrafts<TDraft>;
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
  ) => DraftSaveResult | LabJudgeError;
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
    if (!canAccessLab(c.get("db"), spec.labId, auth.user)) {
      return { error: "lab-not-available", status: 403 };
    }
    return auth;
  };

  const projectOf = (db: DatabaseSync, auth: LabAuth) =>
    getOrCreateProject<TDraft>(db, auth.user.id, auth.membership.classId, spec.labId);

  const canNavigateFreely = (auth: LabAuth) =>
    spec.staffNavigation !== false && isStaffUser(auth.user);

  const projectPayload = (db: DatabaseSync, auth: LabAuth, project: ProjectRow<TDraft>) => {
    const staff = canNavigateFreely(auth);
    return {
      labId: project.labId,
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      drafts: project.drafts,
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
    const project = projectOf(db, auth);
    const repaired = spec.reconcileDrafts?.(project.drafts, project.unlockedSubmodules);
    return c.json({
      ...projectPayload(db, auth, project),
      ...(repaired && repaired.notices.length
        ? { drafts: repaired.drafts, draftNotices: repaired.notices }
        : {}),
    });
  });

  app.post("/reset", async (c) => {
    const auth = requireAccess(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await c.req.json().catch(() => null);
    if (body?.scope !== "lab" && body?.scope !== "stage") {
      return jsonError(c, 400, "invalid-reset-scope");
    }
    const fromStage =
      body.scope === "lab" ? 1 : typeof body.stageIndex === "number" ? stageIndexOf(body) : null;
    if (fromStage === null) return jsonError(c, 400, "invalid-stage");
    const expectedGeneration = parseRequiredGeneration(body);
    if (body.expectedGeneration !== undefined && expectedGeneration === null) {
      return jsonError(c, 400, "invalid-generation");
    }
    const db = c.get("db");
    const project = projectOf(db, auth);
    if (expectedGeneration !== null && expectedGeneration !== project.projectGeneration) {
      return jsonError(c, 409, "stale-project-generation");
    }
    const preservedStages =
      body.scope === "lab"
        ? []
        : Array.from({ length: spec.stageCount }, (_, index) => index + 1).filter(
            (stage) => !(spec.stageAffectedByReset?.(fromStage, stage) ?? stage >= fromStage),
          );
    const reset = resetLabProject<TDraft>(
      db,
      project.id,
      fromStage,
      preservedStages,
      spec.keepSubmodulesOnReset,
      spec.reconcileDrafts,
    );
    return c.json({
      ...projectPayload(db, auth, reset),
      ...(reset.draftNotices.length ? { draftNotices: reset.draftNotices } : {}),
    });
  });

  app.put("/draft", async (c) => {
    const auth = requireAccess(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await c.req.json().catch(() => null);
    const stageIndex = stageIndexOf(body);
    if (stageIndex === null) return jsonError(c, 400, "invalid-stage");
    const rawExpected = body?.expectedRevision;
    const expectedRevision = rawExpected === null ? 0 : rawExpected;
    if (
      typeof expectedRevision !== "number" ||
      !Number.isInteger(expectedRevision) ||
      expectedRevision < 0
    ) {
      return jsonError(c, 400, "invalid-revision");
    }
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
    if ("error" in result) return jsonError(c, result.status, result.error);
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
      staff: canNavigateFreely(auth),
    });
    if ("error" in outcome) {
      return jsonError(c, (outcome as LabJudgeError).status, (outcome as LabJudgeError).error);
    }
    return c.json(outcome);
  });

  return app;
}
