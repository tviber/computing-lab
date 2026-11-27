import type { SaveStatus } from "./contracts";

/**
 * Autosave flags kept per stage. Save timers are armed per stage, so a save
 * that resolves after a stage switch must only settle its own stage's flag —
 * it can never overwrite the flag of the stage the student is looking at.
 */
export type SaveStatusByStage = Readonly<Partial<Record<number, SaveStatus>>>;

/** The flag for one stage; a stage with no save activity reads "idle". */
export function statusForStage(map: SaveStatusByStage, stageIndex: number): SaveStatus {
  return map[stageIndex] ?? "idle";
}

/** Sets one stage's flag without disturbing the other stages' entries. */
export function markSaveStatus(
  map: SaveStatusByStage,
  stageIndex: number,
  status: SaveStatus,
): SaveStatusByStage {
  if (status === "idle") {
    if (map[stageIndex] === undefined) return map;
    const next = { ...map };
    delete next[stageIndex];
    return next;
  }
  if (map[stageIndex] === status) return map;
  return { ...map, [stageIndex]: status };
}

/**
 * Stages whose post-refusal reconcile fetch failed ("sync-error"): the save
 * fence still blocks them until an explicit retry reconciles, so the flag is
 * tracked apart from the save flag — a further edit flipping the stage back
 * to "dirty" must never hide the retry control. Cleared only by a successful
 * reconcile, a restore/discard, or a project reload — never by editing.
 */
export type SyncConflictByStage = Readonly<Partial<Record<number, true>>>;

/** Whether the stage still has an unreconciled sync-error pending. */
export function syncConflictForStage(map: SyncConflictByStage, stageIndex: number): boolean {
  return map[stageIndex] === true;
}

/** Sets one stage's sync-conflict flag without disturbing the others'. */
export function markSyncConflict(
  map: SyncConflictByStage,
  stageIndex: number,
  pending: boolean,
): SyncConflictByStage {
  if (!pending) {
    if (map[stageIndex] === undefined) return map;
    const next = { ...map };
    delete next[stageIndex];
    return next;
  }
  if (map[stageIndex] === true) return map;
  return { ...map, [stageIndex]: true };
}
