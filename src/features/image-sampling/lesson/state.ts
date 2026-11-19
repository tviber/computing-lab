import { MAX_RESOLUTION, MIN_RESOLUTION, type Resolution } from "../domain/downsample.ts";
import type { SamplingJudgeResult } from "../domain/protocol.ts";
import {
  getSamplingStage,
  IMAGE_SAMPLING_STAGES,
  nextSamplingStage,
  samplingStageUnlocked,
  type SamplingStageDef,
} from "../domain/stages.ts";

export type { SaveStatus } from "../../../shared/api/client";
import {
  markSaveStatus,
  markSyncConflict,
  statusForStage,
  type SaveStatusByStage,
  type SyncConflictByStage,
} from "../../../shared/lab/saveStatus.ts";

export type StageDraft = {
  width: number | null;
  height: number | null;
  code: string;
};

export type CellPick = { cx: number; cy: number };

export type SamplingLessonState = {
  stageIndex: number;
  currentStage: number;
  passedStages: number[];
  freeNavigation: boolean;
  drafts: Record<number, StageDraft>;
  conflictedLocalDrafts: Record<number, StageDraft>;
  draftRevisions: Record<number, number>;
  selectedCell: CellPick | null;
  judgeOutcome: SamplingJudgeResult | null;
  saveStatusByStage: SaveStatusByStage;
  unresolvedSyncConflicts: SyncConflictByStage;
  message: string | null;
};

export type SamplingLessonAction =
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
  | { type: "set-resolution"; width: number; height: number }
  | { type: "set-code"; code: string }
  | { type: "select-cell"; cell: CellPick | null }
  | { type: "judge-result"; outcome: SamplingJudgeResult }
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

const clamp = (v: number) => Math.max(MIN_RESOLUTION, Math.min(MAX_RESOLUTION, Math.round(v)));

export function emptyDraft(): StageDraft {
  return { width: null, height: null, code: "" };
}

export function draftOf(state: SamplingLessonState, stageIndex = state.stageIndex): StageDraft {
  return state.drafts[stageIndex] ?? emptyDraft();
}

export function draftResolution(
  state: SamplingLessonState,
  stage: SamplingStageDef = stageOf(state)!,
): Resolution | null {
  const draft = draftOf(state);
  if (draft.width == null || draft.height == null) return null;
  const width = clamp(draft.width);
  const height = stage.mode === "square" ? width : clamp(draft.height);
  return { width, height };
}

export function stageOf(state: SamplingLessonState): SamplingStageDef | undefined {
  return getSamplingStage(state.stageIndex);
}

export function isStageUnlocked(state: SamplingLessonState, stageIndex: number): boolean {
  return (
    Boolean(getSamplingStage(stageIndex)) &&
    (state.freeNavigation || samplingStageUnlocked(state.passedStages, stageIndex))
  );
}

export function createSamplingLessonState(
  stageIndex = 1,
  freeNavigation = false,
): SamplingLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    freeNavigation,
    drafts: {},
    conflictedLocalDrafts: {},
    draftRevisions: {},
    selectedCell: null,
    judgeOutcome: null,
    saveStatusByStage: {},
    unresolvedSyncConflicts: {},
    message: null,
  };
}

export function transitionSamplingLesson(
  state: SamplingLessonState,
  action: SamplingLessonAction,
): SamplingLessonState {
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
          ? state.stageIndex !== 1 && getSamplingStage(state.stageIndex)
            ? state.stageIndex
            : action.currentStage
          : samplingStageUnlocked(action.passedStages, state.stageIndex)
            ? state.stageIndex
            : action.currentStage;
      const stageIndex = getSamplingStage(candidate) ? candidate : IMAGE_SAMPLING_STAGES.length;
      return {
        ...state,
        freeNavigation,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        conflictedLocalDrafts: {},
        draftRevisions,
        selectedCell: null,
        saveStatusByStage: {},
        unresolvedSyncConflicts: {},
        judgeOutcome: null,
        message: action.isReset ? null : state.message,
      };
    }

    case "select-stage": {
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return {
        ...state,
        stageIndex: action.stageIndex,
        selectedCell: null,
        judgeOutcome: null,
      };
    }

    case "set-resolution": {
      const draft = draftOf(state);
      const next: StageDraft = {
        ...draft,
        width: clamp(action.width),
        height: clamp(action.height),
      };
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: next },
        selectedCell: null,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
        judgeOutcome: null,
      };
    }

    case "set-code": {
      const draft = draftOf(state);
      const stage = stageOf(state);
      const next: StageDraft = {
        ...draft,
        code: action.code,
        ...(stage?.requiresChooseSize ? { width: null, height: null } : {}),
      };
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: next },
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
        judgeOutcome: stage?.requiresChooseSize ? null : state.judgeOutcome,
      };
    }

    case "select-cell":
      return { ...state, selectedCell: action.cell };

    case "judge-result": {
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages: action.outcome.passedStages,
        currentStage: nextSamplingStage(action.outcome.passedStages),
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
        selectedCell: action.stageIndex === state.stageIndex ? null : state.selectedCell,
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
        selectedCell: action.stageIndex === state.stageIndex ? null : state.selectedCell,
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
  const { width, height, code } = raw as {
    width?: unknown;
    height?: unknown;
    code?: unknown;
  };
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.max(MIN_RESOLUTION, Math.min(MAX_RESOLUTION, Math.round(v)))
      : null;
  return {
    width: num(width),
    height: num(height),
    code: typeof code === "string" ? code.slice(0, 8000) : "",
  };
}
