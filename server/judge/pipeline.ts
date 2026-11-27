import type { ReconcileDrafts } from "../../src/shared/lab/judging.ts";
export { gateStage } from "../../src/shared/lab/judging.ts";
export type { ReconcileDrafts } from "../../src/shared/lab/judging.ts";
import type { DatabaseSync } from "node:sqlite";
import { newId, parseJsonColumn, withTransaction } from "../db/client.ts";

export type LabJudgeError = { error: string; status: number };

export type ProjectRow<TDraft = unknown> = {
  id: string;
  userId: string;
  classId: string;
  labId: string;
  currentStage: number;
  passedStages: number[];
  unlockedSubmodules: unknown[];
  drafts: Record<string, TDraft>;
  draftRevisions: Record<string, number>;
  projectGeneration: number;
};

export type DraftSaveResult = {
  applied: boolean;
  revision: number;
  projectGeneration?: number;
  componentsRevision?: number;
};

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
  db.prepare(
    "INSERT OR IGNORE INTO student_projects (id, user_id, class_id, lab_id) VALUES (?, ?, ?, ?)",
  ).run(newId(), userId, classId, labId);
  const row = db
    .prepare("SELECT * FROM student_projects WHERE user_id = ? AND lab_id = ?")
    .get(userId, labId) as RawProject;
  return toProject<TDraft>(row);
}

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

export function advanceStage<TDraft>(
  db: DatabaseSync,
  project: ProjectRow<TDraft>,
  stageIndex: number,
  nextStage: (passedStages: readonly number[]) => number,
  extras?: { unlockedSubmodules?: unknown[] },
): { currentStage: number; passedStages: number[] } {
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

function repairedProject<TDraft>(
  project: ProjectRow<TDraft>,
  reconcile: ReconcileDrafts<TDraft>,
  originalLibrary: unknown[],
) {
  const { drafts, notices } = reconcile(
    project.drafts,
    project.unlockedSubmodules,
    originalLibrary,
  );
  const changed = Object.keys(drafts).filter((stage) => drafts[stage] !== project.drafts[stage]);
  const draftRevisions = { ...project.draftRevisions };
  for (const stage of changed) draftRevisions[stage] = (draftRevisions[stage] ?? 0) + 1;
  return { project: { ...project, drafts, draftRevisions }, notices, changed: changed.length > 0 };
}

export function loadRepairedProject<TDraft>(
  db: DatabaseSync,
  load: () => ProjectRow<TDraft>,
  reconcile: ReconcileDrafts<TDraft>,
) {
  return withTransaction(db, () => {
    const stored = load();
    const { project, changed, notices } = repairedProject(
      stored,
      reconcile,
      stored.unlockedSubmodules,
    );
    if (changed) {
      db.prepare(
        `UPDATE student_projects SET draft_graph = ?, draft_revisions = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      ).run(JSON.stringify(project.drafts), JSON.stringify(project.draftRevisions), project.id);
    }
    return { project, notices };
  });
}

export function resetLabProject<TDraft = unknown>(
  db: DatabaseSync,
  projectId: string,
  fromStage: number,
  preservedStages: number[],
  keepSubmodules?: (library: unknown[], preservesStage: (stage: number) => boolean) => unknown[],
  reconcileDrafts?: ReconcileDrafts<TDraft>,
): ProjectRow<TDraft> & { draftNotices: string[] } {
  return withTransaction(db, () => {
    const project = toProject<TDraft>(
      db.prepare("SELECT * FROM student_projects WHERE id = ?").get(projectId) as RawProject,
    );
    const preserved = new Set(preservedStages);
    const preservesStage = (stage: number) => preserved.has(stage);
    const drafts = Object.fromEntries(
      Object.entries(project.drafts).filter(([key]) => preservesStage(Number(key))),
    );
    const draftRevisions = Object.fromEntries(
      Object.entries(project.draftRevisions).filter(
        ([key]) =>
          preservesStage(Number(key)) || (preserved.size > 0 && key === COMPONENTS_REVISION_KEY),
      ),
    );
    const passedStages = project.passedStages.filter(preservesStage);
    const library =
      preserved.size === 0
        ? []
        : (keepSubmodules?.(project.unlockedSubmodules, preservesStage) ??
          project.unlockedSubmodules);
    const retained = { ...project, drafts, draftRevisions, unlockedSubmodules: library };
    const repaired = reconcileDrafts
      ? repairedProject(retained, reconcileDrafts, project.unlockedSubmodules)
      : { project: retained, notices: [] };
    const stageFilter =
      preserved.size === 0
        ? ""
        : ` AND stage_index NOT IN (${preservedStages.map(() => "?").join(", ")})`;
    db.prepare(`DELETE FROM submissions WHERE project_id = ?${stageFilter}`).run(
      projectId,
      ...preservedStages,
    );
    db.prepare(`DELETE FROM cpu_guided_first_answers WHERE project_id = ?${stageFilter}`).run(
      projectId,
      ...preservedStages,
    );
    const row = db
      .prepare(
        `UPDATE student_projects
       SET current_stage = ?,
           passed_stages = ?,
           unlocked_submodules = ?,
           draft_graph = ?,
           draft_revisions = ?,
           project_generation = project_generation + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ? RETURNING *`,
      )
      .get(
        Math.min(project.currentStage, fromStage),
        JSON.stringify(passedStages),
        JSON.stringify(library),
        JSON.stringify(repaired.project.drafts),
        JSON.stringify(repaired.project.draftRevisions),
        projectId,
      ) as RawProject;
    return { ...toProject<TDraft>(row), draftNotices: repaired.notices };
  });
}
