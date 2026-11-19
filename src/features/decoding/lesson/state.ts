import type { PixelMatrix } from "../domain/bmp.ts";
import type {
  DecodingDraft,
  DecodingJudgeResult,
  DecoderChoice,
  LabPayload,
} from "../domain/protocol.ts";
import {
  DECODING_STAGES,
  decodingStageUnlocked,
  getDecodingStage,
  nextDecodingStage,
  type DecodingStageDef,
} from "../domain/stages.ts";

export type { SaveStatus } from "../../../shared/api/client";
import {
  markSaveStatus,
  markSyncConflict,
  statusForStage,
  type SaveStatusByStage,
  type SyncConflictByStage,
} from "../../../shared/lab/saveStatus.ts";

export type DecodingLessonState = {
  stageIndex: number;
  currentStage: number;
  passedStages: number[];
  freeNavigation: boolean;
  drafts: Record<number, DecodingDraft>;
  conflictedLocalDrafts: Record<number, DecodingDraft>;
  draftRevisions: Record<number, number>;
  payloads: Record<number, LabPayload>;
  inputRevisions: Record<number, number>;
  judgeOutcome: DecodingJudgeResult | null;
  saveStatusByStage: SaveStatusByStage;
  unresolvedSyncConflicts: SyncConflictByStage;
  message: string | null;
};

export type DecodingLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, DecodingDraft>;
      draftRevisions?: Record<number, number>;
      payloads: Record<number, LabPayload>;
      freeNavigation?: boolean;
      isReset?: boolean;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-code"; code: string }
  | { type: "set-fill"; blankId: string; value: string }
  | { type: "answer-prompt"; promptId: string; option: number }
  | {
      type: "set-verdict";
      fileIndex: number;
      stageIndex: number;
      verdict: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix } | null;
      expectDecoder?: DecoderChoice;
    }
  | { type: "judge-result"; outcome: DecodingJudgeResult }
  | { type: "mark-saving"; stageIndex: number }
  | { type: "mark-saved"; stageIndex: number; revision?: number }
  | { type: "mark-save-error"; stageIndex: number }
  | { type: "mark-save-sync-error"; stageIndex: number }
  | {
      type: "resolve-save-conflict";
      stageIndex: number;
      draft?: DecodingDraft;
      revision?: number;
    }
  | { type: "restore-conflict-draft"; stageIndex: number }
  | { type: "discard-conflict-draft"; stageIndex: number }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

export function emptyDraft(): DecodingDraft {
  return { code: "", fills: {}, conceptAnswers: {}, verdicts: [] };
}

export function draftOf(state: DecodingLessonState, stageIndex = state.stageIndex): DecodingDraft {
  return state.drafts[stageIndex] ?? emptyDraft();
}

export function stageOf(state: DecodingLessonState): DecodingStageDef | undefined {
  return getDecodingStage(state.stageIndex);
}

export function isStageUnlocked(state: DecodingLessonState, stageIndex: number): boolean {
  return (
    Boolean(getDecodingStage(stageIndex)) &&
    (state.freeNavigation || decodingStageUnlocked(state.passedStages, stageIndex))
  );
}

export function answeredPromptIds(state: DecodingLessonState): Set<string> {
  return new Set(Object.keys(draftOf(state).conceptAnswers));
}

export function allPromptsAnswered(state: DecodingLessonState): boolean {
  const stage = stageOf(state);
  if (!stage?.prompts?.length) return true;
  const answered = answeredPromptIds(state);
  return stage.prompts.every((p) => answered.has(p.id));
}

export function createDecodingLessonState(
  stageIndex = 1,
  freeNavigation = false,
): DecodingLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    freeNavigation,
    drafts: {},
    conflictedLocalDrafts: {},
    draftRevisions: {},
    payloads: {},
    inputRevisions: {},
    judgeOutcome: null,
    saveStatusByStage: {},
    unresolvedSyncConflicts: {},
    message: null,
  };
}

function touchDraft(state: DecodingLessonState, draft: DecodingDraft): DecodingLessonState {
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: draft },
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
  };
}

function bumpInputRevision(state: DecodingLessonState): DecodingLessonState {
  const current = state.inputRevisions[state.stageIndex] ?? 0;
  return {
    ...state,
    inputRevisions: { ...state.inputRevisions, [state.stageIndex]: current + 1 },
  };
}

export function transitionDecodingLesson(
  state: DecodingLessonState,
  action: DecodingLessonAction,
): DecodingLessonState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, DecodingDraft> = {};
      const draftRevisions: Record<number, number> = {};
      for (const [key, rev] of Object.entries(action.draftRevisions ?? {})) {
        draftRevisions[Number(key)] = rev;
      }
      for (const [key, draft] of Object.entries(action.drafts)) {
        drafts[Number(key)] = sanitizeDraft(draft);
      }
      const freeNavigation = action.freeNavigation ?? state.freeNavigation;
      const candidate = action.isReset
        ? action.currentStage
        : freeNavigation
          ? action.currentStage
          : decodingStageUnlocked(action.passedStages, action.currentStage)
            ? action.currentStage
            : nextDecodingStage(action.passedStages);
      const stageIndex = getDecodingStage(candidate) ? candidate : DECODING_STAGES.length;
      return {
        ...state,
        freeNavigation,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        conflictedLocalDrafts: {},
        draftRevisions,
        payloads: action.payloads,
        inputRevisions: {},
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

    case "set-code":
      return bumpInputRevision(touchDraft(state, { ...draftOf(state), code: action.code }));

    case "set-fill": {
      const draft = draftOf(state);
      return bumpInputRevision(
        touchDraft(state, {
          ...draft,
          fills: { ...draft.fills, [action.blankId]: action.value },
        }),
      );
    }

    case "answer-prompt": {
      const draft = draftOf(state);
      const stage = stageOf(state);
      const prompt = stage?.prompts?.find((p) => p.id === action.promptId);
      if (!prompt || !(prompt.options[action.option]?.correct === true)) return state;
      return touchDraft(state, {
        ...draft,
        conceptAnswers: { ...draft.conceptAnswers, [action.promptId]: action.option },
      });
    }

    case "set-verdict": {
      if (action.stageIndex !== state.stageIndex) return state;
      const draft = draftOf(state);
      if (
        action.expectDecoder &&
        draft.verdicts[action.fileIndex]?.decoder !== action.expectDecoder
      ) {
        return state;
      }
      const verdicts = [...draft.verdicts];
      verdicts[action.fileIndex] = action.verdict;
      return touchDraft(state, { ...draft, verdicts });
    }

    case "judge-result":
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages: action.outcome.passedStages,
        currentStage: nextDecodingStage(action.outcome.passedStages),
      };

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

export function sanitizeDraft(raw: unknown): DecodingDraft {
  if (!raw || typeof raw !== "object") return emptyDraft();
  const { code, fills, conceptAnswers, verdicts } = raw as {
    code?: unknown;
    fills?: unknown;
    conceptAnswers?: unknown;
    verdicts?: unknown;
  };
  const fillMap: Record<string, string> = {};
  if (fills && typeof fills === "object") {
    for (const [key, value] of Object.entries(fills as Record<string, unknown>).slice(0, 32)) {
      if (typeof value === "string") fillMap[key.slice(0, 16)] = value.slice(0, 300);
    }
  }
  const answers: Record<string, number> = {};
  if (conceptAnswers && typeof conceptAnswers === "object") {
    for (const [key, value] of Object.entries(conceptAnswers as Record<string, unknown>).slice(
      0,
      32,
    )) {
      if (typeof key === "string" && Number.isInteger(value) && (value as number) >= 0) {
        answers[key.slice(0, 64)] = value as number;
      }
    }
  }
  const verdictList: DecodingDraft["verdicts"] = [];
  if (Array.isArray(verdicts)) {
    for (const entry of verdicts.slice(0, 8)) {
      if (!entry || typeof entry !== "object") {
        verdictList.push(null);
        continue;
      }
      const { decoder, text, pixels } = entry as {
        decoder?: unknown;
        text?: unknown;
        pixels?: unknown;
      };
      if (decoder !== "text" && decoder !== "image") {
        verdictList.push(null);
        continue;
      }
      const verdict: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix } = { decoder };
      if (typeof text === "string") verdict.text = text.slice(0, 200);
      if (Array.isArray(pixels)) verdict.pixels = pixels as PixelMatrix;
      verdictList.push(verdict);
    }
  }
  return {
    code: typeof code === "string" ? code.slice(0, 12000) : "",
    fills: fillMap,
    conceptAnswers: answers,
    verdicts: verdictList,
  };
}
