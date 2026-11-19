/**
 * Shared lab judge pipeline. Every lab judge runs the same authority chain —
 * the lab plugs in its stage table, sanitizer, and hidden judgement; the
 * surrounding record-keeping lives here once:
 *
 *   gate the stage → sanitize the submission → run hidden judgement →
 *   record the submission row → advance stage progress
 *
 * The client only ever runs public cases; grading authority is server-side
 * and a submission row plus the project progress update commit as one write
 * unit — a crash between them would record a pass the student never got
 * credit for.
 */

import type { DatabaseSync } from "node:sqlite";
import { newId, parseJsonColumn, withTransaction } from "../db/client.ts";

/** Machine-readable failure returned by any lab judge before grading starts. */
export type LabJudgeError = { error: string; status: number };

/**
 * `student_projects` row decoded into camelCase. `drafts` is typed per-lab via
 * `TDraft` — the column stores whatever shape the lab's draft type defines.
 */
export type ProjectRow<TDraft = unknown> = {
  id: string;
  userId: string;
  classId: string;
  labId: string;
  currentStage: number;
  passedStages: number[];
  /** Lab-defined submodule payload (e.g. calculator component defs). */
  unlockedSubmodules: unknown[];
  drafts: Record<string, TDraft>;
  /** Server-assigned revision of the latest applied write per stage. Draft
   *  saves are compare-and-swap on this counter: the client sends the
   *  revision it last saw applied (`expectedRevision`) and the server only
   *  applies the write when it still matches, assigning `stored + 1`. */
  draftRevisions: Record<string, number>;
  /** Monotonic counter bumped on every server reset so pre-reset saves and
   *  judges cannot land even after `draftRevisions` clears back to `{}`. */
  projectGeneration: number;
};

/** Outcome of a compare-and-swap draft write: `revision` is the newly
 *  assigned revision when applied, or the current stored one when refused.
 *  `componentsRevision` is set when the write carried the component library
 *  (calculator): the newly assigned library revision, or the stored one on
 *  a refused compare. */
export type DraftSaveResult = {
  applied: boolean;
  revision: number;
  projectGeneration?: number;
  componentsRevision?: number;
};

/** The calculator component library's OCC counter lives in draft_revisions
 *  under this reserved non-stage key — it shares the same transaction and
 *  needs no column of its own. */
export const COMPONENTS_REVISION_KEY = "components";

type RawProject = {
  id: string;
  user_id: string;
  class_id: string;
  lab_id: string;
  current_stage: number;
  passed_stages: string;
  unlocked_submodules: string;
  draft_graph: string;
  draft_revisions: string;
  project_generation: number;
};

function toProject<TDraft>(row: RawProject): ProjectRow<TDraft> {
  return {
    id: row.id,
    userId: row.user_id,
    classId: row.class_id,
    labId: row.lab_id,
    currentStage: row.current_stage,
    passedStages: parseJsonColumn<number[]>(row.passed_stages, []),
    unlockedSubmodules: parseJsonColumn<unknown[]>(row.unlocked_submodules, []),
    drafts: parseJsonColumn<Record<string, TDraft>>(row.draft_graph, {}),
    draftRevisions: toDraftRevisions(
      parseJsonColumn<Record<string, number | { revision?: unknown }>>(row.draft_revisions, {}),
    ),
    projectGeneration: row.project_generation ?? 0,
  };
}

/** Rows pre-dating server revisions stored a bare number, and the short-lived
 *  client-clock protocol stored `{revision, saveToken}` objects — read every
 *  shape as a plain counter. */
function toDraftRevisions(
  raw: Record<string, number | { revision?: unknown }>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      const revision = typeof value === "number" ? value : Number(value?.revision);
      return Number.isFinite(revision) ? [[key, revision]] : [];
    }),
  );
}

export function getOrCreateProject<TDraft = unknown>(
  db: DatabaseSync,
  userId: string,
  classId: string,
  labId: string,
): ProjectRow<TDraft> {
  // INSERT OR IGNORE makes the get-or-create atomic under (user_id, lab_id);
  // a concurrent insert wins and is returned instead of a UNIQUE crash.
  db.prepare(
    "INSERT OR IGNORE INTO student_projects (id, user_id, class_id, lab_id) VALUES (?, ?, ?, ?)",
  ).run(newId(), userId, classId, labId);
  const row = db
    .prepare("SELECT * FROM student_projects WHERE user_id = ? AND lab_id = ?")
    .get(userId, labId) as RawProject;
  return toProject<TDraft>(row);
}

/**
 * Stage gate shared by every lab judge: the stage must exist and the lab's
 * own unlock rule must hold (linear for the image labs, prerequisite list
 * for the calculator). Returns the narrowed stage on success so callers can
 * keep `stage` typed after the gate.
 */
export function gateStage<TStage>(
  stage: TStage | undefined,
  unlocked: (stage: TStage) => boolean,
  options?: { bypassLock?: boolean },
): { stage: TStage } | LabJudgeError {
  if (!stage) return { error: "unknown-stage", status: 400 };
  if (!options?.bypassLock && !unlocked(stage)) return { error: "stage-locked", status: 409 };
  return { stage };
}

/**
 * Persists one stage's already-sanitized draft into the project's drafts map
 * via optimistic concurrency: the write applies only when
 * `extras.expectedRevision` still equals the stage's stored revision, and is
 * then assigned `stored + 1` — client clocks never order writes, so a stale
 * device can never resurrect an older draft, and a normal device is never
 * locked out by another device's fast clock. A refused write reports the
 * current stored revision so the caller can reconcile.
 *
 * The compare and the write run inside one IMMEDIATE transaction and the
 * stored row is re-read inside it, so two writes racing the same stage
 * serialize deterministically: the loser sees the winner's revision and is
 * refused. `extras.unlockedSubmodules` additionally rewrites the component
 * library in the same update (calculator autosaves learner-made components
 * with drafts).
 */
export function saveStageDraft<TDraft>(
  db: DatabaseSync,
  project: ProjectRow<TDraft>,
  stageIndex: number,
  draft: TDraft,
  extras?: {
    unlockedSubmodules?: unknown[];
    expectedRevision?: number;
    expectedComponentsRevision?: number;
    expectedGeneration?: number;
  },
): DraftSaveResult {
  const key = String(stageIndex);
  // Route callers always pass a validated number; an absent expectedRevision
  // means an unconditional write — only internal callers (judge tests, seeds)
  // use it that way.
  const expected = extras?.expectedRevision;
  return withTransaction(db, () => {
    const row = db
      .prepare(
        "SELECT draft_graph, draft_revisions, project_generation FROM student_projects WHERE id = ?",
      )
      .get(project.id) as
      { draft_graph: string; draft_revisions: string; project_generation: number } | undefined;
    const storedGeneration = row?.project_generation ?? 0;
    const revisions = toDraftRevisions(
      parseJsonColumn<Record<string, number | { revision?: unknown }>>(row?.draft_revisions, {}),
    );
    const stored = revisions[key] ?? 0;
    const carriesLibrary = extras?.unlockedSubmodules !== undefined;
    const storedComponents = revisions[COMPONENTS_REVISION_KEY] ?? 0;
    if (
      extras?.expectedGeneration !== undefined &&
      storedGeneration !== extras.expectedGeneration
    ) {
      return {
        applied: false,
        revision: stored,
        projectGeneration: storedGeneration,
        ...(carriesLibrary ? { componentsRevision: storedComponents } : {}),
      };
    }
    if (expected !== undefined && stored !== expected) {
      return {
        applied: false,
        revision: stored,
        projectGeneration: storedGeneration,
        ...(carriesLibrary ? { componentsRevision: storedComponents } : {}),
      };
    }
    // The library compare rides the same transaction as the stage compare:
    // a stale component list bounces the WHOLE write — the stage graph may
    // reference the components it was written against, so applying the
    // draft alone would corrupt consistency.
    if (
      carriesLibrary &&
      (extras?.expectedComponentsRevision === undefined ||
        storedComponents !== extras.expectedComponentsRevision)
    ) {
      return {
        applied: false,
        revision: stored,
        projectGeneration: storedGeneration,
        componentsRevision: storedComponents,
      };
    }
    const revision = stored + 1;
    const drafts = {
      ...parseJsonColumn<Record<string, TDraft>>(row?.draft_graph, {}),
      [key]: draft,
    };
    revisions[key] = revision;
    if (!carriesLibrary) {
      db.prepare(
        "UPDATE student_projects SET draft_graph = ?, draft_revisions = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      ).run(JSON.stringify(drafts), JSON.stringify(revisions), project.id);
      return { applied: true, revision, projectGeneration: storedGeneration };
    }
    const componentsRevision = storedComponents + 1;
    revisions[COMPONENTS_REVISION_KEY] = componentsRevision;
    db.prepare(
      "UPDATE student_projects SET draft_graph = ?, draft_revisions = ?, unlocked_submodules = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ).run(
      JSON.stringify(drafts),
      JSON.stringify(revisions),
      JSON.stringify(extras.unlockedSubmodules),
      project.id,
    );
    return { applied: true, revision, projectGeneration: storedGeneration, componentsRevision };
  });
}

/**
 * The component library's revision must move on EVERY unlocked_submodules
 * write, not only draft saves — a judgement that merges learner components
 * rewrites the library without CAS; bumping the counter keeps a concurrent
 * save's compare honest instead of silently clobbering the judge's merge.
 * Call inside the writer's own transaction. Returns the new revision.
 */
export function bumpComponentsRevision(db: DatabaseSync, projectId: string): number {
  const row = db
    .prepare("SELECT draft_revisions FROM student_projects WHERE id = ?")
    .get(projectId) as { draft_revisions: string } | undefined;
  const revisions = toDraftRevisions(
    parseJsonColumn<Record<string, number | { revision?: unknown }>>(row?.draft_revisions, {}),
  );
  const next = (revisions[COMPONENTS_REVISION_KEY] ?? 0) + 1;
  revisions[COMPONENTS_REVISION_KEY] = next;
  db.prepare("UPDATE student_projects SET draft_revisions = ? WHERE id = ?").run(
    JSON.stringify(revisions),
    projectId,
  );
  return next;
}

/**
 * Writes the submissions row and returns its id. Callers wrap this with the
 * progress update in one `withTransaction` so the two never diverge.
 */
export function insertSubmission(
  db: DatabaseSync,
  entry: {
    projectId: string;
    userId: string;
    labId: string;
    stageIndex: number;
    snapshot: unknown;
    score: number;
    total: number;
    passed: boolean;
    testSummary: unknown;
  },
): string {
  const submissionId = newId();
  db.prepare(
    `INSERT INTO submissions
       (id, project_id, user_id, lab_id, stage_index, snapshot_graph, score, total, passed, test_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    submissionId,
    entry.projectId,
    entry.userId,
    entry.labId,
    entry.stageIndex,
    JSON.stringify(entry.snapshot),
    entry.score,
    entry.total,
    entry.passed ? 1 : 0,
    JSON.stringify(entry.testSummary),
  );
  return submissionId;
}

/**
 * Records a passed stage: merges it into the sorted, deduplicated
 * passedStages set and asks the lab's own `nextStage` where the student's
 * pointer goes. `extras.unlockedSubmodules` additionally rewrites the
 * component library in the same update (calculator component unlocks).
 */
export function advanceStage<TDraft>(
  db: DatabaseSync,
  project: ProjectRow<TDraft>,
  stageIndex: number,
  nextStage: (passedStages: readonly number[]) => number,
  extras?: { unlockedSubmodules?: unknown[] },
): { currentStage: number; passedStages: number[] } {
  // Passes may arrive out of order; keep the set sorted and deduplicated.
  const passedStages = [...new Set([...project.passedStages, stageIndex])].sort((a, b) => a - b);
  const currentStage = nextStage(passedStages);
  if (extras?.unlockedSubmodules === undefined) {
    db.prepare(
      `UPDATE student_projects
       SET current_stage = ?, passed_stages = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    ).run(currentStage, JSON.stringify(passedStages), project.id);
    return { currentStage, passedStages };
  }
  db.prepare(
    `UPDATE student_projects
     SET current_stage = ?, passed_stages = ?, unlocked_submodules = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  ).run(
    currentStage,
    JSON.stringify(passedStages),
    JSON.stringify(extras.unlockedSubmodules),
    project.id,
  );
  return { currentStage, passedStages };
}

/**
 * Resets the caller's own lab project row and clears its submission history so
 * teachers and admins can cleanly replay or demo the lab from stage 1 without
 * disturbing any other user's data.
 */
export function resetLabProject<TDraft = unknown>(
  db: DatabaseSync,
  projectId: string,
): ProjectRow<TDraft> {
  return withTransaction(db, () => {
    db.prepare("DELETE FROM submissions WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM cpu_guided_first_answers WHERE project_id = ?").run(projectId);
    db.prepare(
      `UPDATE student_projects
       SET current_stage = 1,
           passed_stages = '[]',
           unlocked_submodules = '[]',
           draft_graph = '{}',
           draft_revisions = '{}',
           project_generation = project_generation + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    ).run(projectId);
    const row = db
      .prepare("SELECT * FROM student_projects WHERE id = ?")
      .get(projectId) as RawProject;
    return toProject<TDraft>(row);
  });
}
