import {
  markSaveStatus,
  markSyncConflict,
  statusForStage,
  type SaveStatusByStage,
  type SyncConflictByStage,
} from "../../../shared/lab/saveStatus.ts";
import type { StatsFoundationsDraft, StatsFoundationsJudgeResult } from "../domain/protocol.ts";
import {
  getStatsFoundationsStage,
  STATS_FOUNDATIONS_STAGES,
  statsFoundationsStageUnlocked,
  type StatsFoundationsStageDef,
} from "../domain/stages.ts";
import { clamp } from "../domain/statsMath.ts";
import { defaultDraftForStage, sanitizeStatsFoundationsDraft } from "../domain/drafts.ts";

export type StatsFoundationsLessonState = {
  stageIndex: number;
  requestedStage: number | null;
  passedStages: number[];
  drafts: Record<number, StatsFoundationsDraft>;
  draftRevisions: Record<number, number>;
  saveStatusByStage: SaveStatusByStage;
  unresolvedSyncConflicts: SyncConflictByStage;
  conflictedLocalDrafts: Partial<Record<number, StatsFoundationsDraft>>;
  lastJudge: StatsFoundationsJudgeResult | null;
};

export function createStatsFoundationsLessonState(
  requestedStage: number | null = null,
): StatsFoundationsLessonState {
  return {
    stageIndex: requestedStage ?? 1,
    requestedStage,
    passedStages: [],
    drafts: Object.fromEntries(
      STATS_FOUNDATIONS_STAGES.map(({ index }) => [index, defaultDraftForStage(index)]),
    ),
    draftRevisions: {},
    saveStatusByStage: {},
    unresolvedSyncConflicts: {},
    conflictedLocalDrafts: {},
    lastJudge: null,
  };
}

export type StatsFoundationsLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, unknown>;
      draftRevisions?: Record<number, number>;
      freeNavigation: boolean;
      isReset?: boolean;
    }
  | { type: "select-stage"; stageIndex: number; freeNavigation?: boolean }
  | { type: "update-draft"; stageIndex: number; draft: StatsFoundationsDraft }
  | { type: "mark-saving"; stageIndex: number }
  | { type: "mark-saved"; stageIndex: number; revision?: number }
  | { type: "mark-save-error"; stageIndex: number }
  | { type: "mark-save-sync-error"; stageIndex: number }
  | { type: "resolve-save-conflict"; stageIndex: number; draft?: unknown; revision?: number }
  | { type: "restore-conflict-draft" | "discard-conflict-draft"; stageIndex: number }
  | { type: "judge-result"; result: StatsFoundationsJudgeResult };

export function stageOf(state: StatsFoundationsLessonState): StatsFoundationsStageDef {
  return getStatsFoundationsStage(state.stageIndex) ?? STATS_FOUNDATIONS_STAGES[0];
}

export function draftOf<T extends StatsFoundationsDraft>(
  state: StatsFoundationsLessonState,
  stageIndex: number,
): T {
  return (state.drafts[stageIndex] ?? defaultDraftForStage(stageIndex)) as T;
}

export function isStageUnlocked(
  state: StatsFoundationsLessonState,
  stageIndex: number,
  freeNavigation: boolean,
): boolean {
  if (freeNavigation) return true;
  return statsFoundationsStageUnlocked(stageIndex, state.passedStages);
}

export function transitionStatsFoundationsLesson(
  state: StatsFoundationsLessonState,
  action: StatsFoundationsLessonAction,
): StatsFoundationsLessonState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, StatsFoundationsDraft> = {};
      for (const s of STATS_FOUNDATIONS_STAGES) {
        drafts[s.index] = sanitizeStatsFoundationsDraft(s.index, action.drafts[s.index]);
      }
      const maxStage = STATS_FOUNDATIONS_STAGES.length;
      const clampedCurrent = clamp(Math.round(action.currentStage || 1), 1, maxStage);
      let nextStage = clampedCurrent;
      if (!action.isReset && state.requestedStage !== null) {
        const req = clamp(state.requestedStage, 1, maxStage);
        if (action.freeNavigation || statsFoundationsStageUnlocked(req, action.passedStages)) {
          nextStage = req;
        }
      }
      return {
        ...state,
        stageIndex: nextStage,
        requestedStage: null,
        passedStages: [...action.passedStages],
        drafts,
        draftRevisions: { ...(action.draftRevisions ?? {}) },
        saveStatusByStage: {},
        unresolvedSyncConflicts: {},
        conflictedLocalDrafts: {},
        lastJudge: null,
      };
    }
    case "select-stage": {
      const target = clamp(action.stageIndex, 1, STATS_FOUNDATIONS_STAGES.length);
      if (!action.freeNavigation && !statsFoundationsStageUnlocked(target, state.passedStages)) {
        return state;
      }
      return {
        ...state,
        stageIndex: target,
        lastJudge: null,
      };
    }
    case "update-draft": {
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.stageIndex]: action.draft,
        },
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "dirty"),
      };
    }
    case "mark-saving": {
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saving"),
      };
    }
    case "mark-saved": {
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      return {
        ...state,
        draftRevisions:
          action.revision !== undefined
            ? { ...state.draftRevisions, [action.stageIndex]: action.revision }
            : state.draftRevisions,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved"),
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
      };
    }
    case "mark-save-error": {
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "error"),
      };
    }
    case "mark-save-sync-error": {
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "sync-error"),
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          true,
        ),
      };
    }
    case "resolve-save-conflict": {
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      if (status !== "dirty" && status !== "saving" && status !== "sync-error") return state;
      return {
        ...state,
        conflictedLocalDrafts: {
          ...state.conflictedLocalDrafts,
          [action.stageIndex]: state.drafts[action.stageIndex],
        },
        lastJudge: state.lastJudge?.stageIndex === action.stageIndex ? null : state.lastJudge,
        drafts: {
          ...state.drafts,
          [action.stageIndex]: sanitizeStatsFoundationsDraft(action.stageIndex, action.draft),
        },
        draftRevisions:
          action.revision !== undefined
            ? { ...state.draftRevisions, [action.stageIndex]: action.revision }
            : state.draftRevisions,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "conflict"),
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
      };
    }
    case "restore-conflict-draft":
    case "discard-conflict-draft": {
      const local = state.conflictedLocalDrafts[action.stageIndex];
      if (!local) return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      delete conflictedLocalDrafts[action.stageIndex];
      if (action.type === "restore-conflict-draft") {
        return {
          ...state,
          conflictedLocalDrafts,
          drafts: { ...state.drafts, [action.stageIndex]: local },
          saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "dirty"),
        };
      }
      return {
        ...state,
        conflictedLocalDrafts,
        saveStatusByStage:
          statusForStage(state.saveStatusByStage, action.stageIndex) === "conflict"
            ? markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved")
            : state.saveStatusByStage,
      };
    }
    case "judge-result": {
      return {
        ...state,
        passedStages: [...action.result.passedStages],
        lastJudge: action.result,
      };
    }
  }
}
