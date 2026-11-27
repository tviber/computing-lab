import type { QuantJudgeResult } from "../domain/protocol.ts";
import {
  SOURCE_COLOR_COUNT,
  TONER_COUNT,
  sanitizeSubset,
  sanitizeTable,
} from "../domain/quantize.ts";
import {
  COLOR_QUANT_STAGES,
  getQuantStage,
  nextQuantStage,
  quantStageUnlocked,
  type QuantStageDef,
} from "../domain/stages.ts";

export type { SaveStatus } from "../../../shared/lab/contracts";
import {
  markSaveStatus,
  markSyncConflict,
  statusForStage,
  type SaveStatusByStage,
  type SyncConflictByStage,
} from "../../../shared/lab/saveStatus.ts";

export type StageDraft = {
  toners: number[];
  table: number[] | null;
  code: string;
};

export type QuantLessonState = {
  stageIndex: number;
  currentStage: number;
  passedStages: number[];
  freeNavigation: boolean;
  drafts: Record<number, StageDraft>;
  conflictedLocalDrafts: Record<number, StageDraft>;
  draftRevisions: Record<number, number>;
  judgeOutcome: QuantJudgeResult | null;
  saveStatusByStage: SaveStatusByStage;
  unresolvedSyncConflicts: SyncConflictByStage;
  message: string | null;
};

export type QuantLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, StageDraft>;
      draftRevisions?: Record<number, number>;
      freeNavigation?: boolean;
      isReset?: boolean;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-toners"; toners: number[] }
  | { type: "set-table"; table: number[] }
  | { type: "set-code"; code: string }
  | { type: "judge-result"; outcome: QuantJudgeResult }
  | { type: "mark-saving"; stageIndex: number }
  | { type: "mark-saved"; stageIndex: number; revision?: number }
  | { type: "mark-save-error"; stageIndex: number }
  | { type: "mark-save-sync-error"; stageIndex: number }
  | {
      type: "resolve-save-conflict";
      stageIndex: number;
      draft?: StageDraft;
      revision?: number;
    }
  | { type: "restore-conflict-draft"; stageIndex: number }
  | { type: "discard-conflict-draft"; stageIndex: number }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

export function emptyDraft(): StageDraft {
  return { toners: [], table: null, code: "" };
}

export function draftOf(state: QuantLessonState, stageIndex = state.stageIndex): StageDraft {
  return state.drafts[stageIndex] ?? emptyDraft();
}

export function stageOf(state: QuantLessonState): QuantStageDef | undefined {
  return getQuantStage(state.stageIndex);
}

export function isStageUnlocked(state: QuantLessonState, stageIndex: number): boolean {
  return (
    Boolean(getQuantStage(stageIndex)) &&
    (state.freeNavigation || quantStageUnlocked(state.passedStages, stageIndex))
  );
}

export function createQuantLessonState(stageIndex = 1, freeNavigation = false): QuantLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    freeNavigation,
    drafts: {},
    conflictedLocalDrafts: {},
    draftRevisions: {},
    judgeOutcome: null,
    saveStatusByStage: {},
    unresolvedSyncConflicts: {},
    message: null,
  };
}

export function transitionQuantLesson(
  state: QuantLessonState,
  action: QuantLessonAction,
): QuantLessonState {
  switch (action.type) {
    case "load-project": {
      const draftRevisions: Record<number, number> = {};
      for (const [key, rev] of Object.entries(action.draftRevisions ?? {})) {
        draftRevisions[Number(key)] = rev;
      }
      const drafts: Record<number, StageDraft> = {};
      for (const [key, draft] of Object.entries(action.drafts)) {
        const index = Number(key);
        drafts[index] = sanitizeDraft(draft);
      }
      const freeNavigation = action.freeNavigation ?? state.freeNavigation;
      const candidate = action.isReset
        ? action.currentStage
        : freeNavigation
          ? state.stageIndex !== 1 && getQuantStage(state.stageIndex)
            ? state.stageIndex
            : action.currentStage
          : quantStageUnlocked(action.passedStages, state.stageIndex)
            ? state.stageIndex
            : action.currentStage;
      const stageIndex = getQuantStage(candidate) ? candidate : COLOR_QUANT_STAGES.length;
      return {
        ...state,
        freeNavigation,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        conflictedLocalDrafts: {},
        draftRevisions,
        saveStatusByStage: {},
        unresolvedSyncConflicts: {},
        judgeOutcome: null,
        message: action.isReset ? null : state.message,
      };
    }

    case "select-stage": {
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return { ...state, stageIndex: action.stageIndex, judgeOutcome: null };
    }

    case "set-toners": {
      const draft = draftOf(state);
      const toners = sanitizeSubset(action.toners) ?? draft.toners;
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: { ...draft, toners } },
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
        judgeOutcome: null,
      };
    }

    case "set-table": {
      const draft = draftOf(state);
      const table = sanitizeTable(action.table) ?? draft.table;
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: { ...draft, table } },
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
        judgeOutcome: null,
      };
    }

    case "set-code": {
      const draft = draftOf(state);
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: { ...draft, code: action.code } },
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
      };
    }

    case "judge-result": {
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages: action.outcome.passedStages,
        currentStage: nextQuantStage(action.outcome.passedStages),
      };
    }

    case "mark-saving":
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saving"),
      };
    case "mark-saved": {
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      return {
        ...state,
        draftRevisions:
          typeof action.revision === "number"
            ? { ...state.draftRevisions, [action.stageIndex]: action.revision }
            : state.draftRevisions,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved"),
      };
    }
    case "mark-save-error":
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "error"),
      };

    case "mark-save-sync-error": {
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      if (status !== "saving" && status !== "dirty" && status !== "sync-error") return state;
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
      if (status !== "saving" && status !== "dirty" && status !== "sync-error") return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      const localDraft = state.drafts[action.stageIndex];
      if (localDraft !== undefined) conflictedLocalDrafts[action.stageIndex] = localDraft;
      return {
        ...state,
        drafts: { ...state.drafts, [action.stageIndex]: sanitizeDraft(action.draft ?? {}) },
        conflictedLocalDrafts,
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
        draftRevisions:
          typeof action.revision === "number"
            ? { ...state.draftRevisions, [action.stageIndex]: action.revision }
            : state.draftRevisions,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "conflict"),
        judgeOutcome: action.stageIndex === state.stageIndex ? null : state.judgeOutcome,
      };
    }

    case "restore-conflict-draft": {
      const backup = state.conflictedLocalDrafts[action.stageIndex];
      if (backup === undefined) return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      delete conflictedLocalDrafts[action.stageIndex];
      return {
        ...state,
        drafts: { ...state.drafts, [action.stageIndex]: backup },
        conflictedLocalDrafts,
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "dirty"),
        judgeOutcome: action.stageIndex === state.stageIndex ? null : state.judgeOutcome,
      };
    }
    case "discard-conflict-draft": {
      if (state.conflictedLocalDrafts[action.stageIndex] === undefined) return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      delete conflictedLocalDrafts[action.stageIndex];
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      return {
        ...state,
        conflictedLocalDrafts,
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
        saveStatusByStage:
          status === "conflict"
            ? markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved")
            : state.saveStatusByStage,
      };
    }
    case "dismiss-message":
      return { ...state, message: null };
    case "message":
      return { ...state, message: action.text };
  }
}

export function sanitizeDraft(raw: unknown): StageDraft {
  if (!raw || typeof raw !== "object") return emptyDraft();
  const { toners, table, code } = raw as {
    toners?: unknown;
    table?: unknown;
    code?: unknown;
  };
  const cleanToners = (sanitizeSubset(toners) ?? []).slice(0, TONER_COUNT);
  const cleanTable =
    Array.isArray(table) && table.length === SOURCE_COLOR_COUNT ? sanitizeTable(table) : null;
  return {
    toners: cleanToners,
    table: cleanTable,
    code: typeof code === "string" ? code.slice(0, 8000) : "",
  };
}
