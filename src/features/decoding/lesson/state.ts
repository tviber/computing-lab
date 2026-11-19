/**
 * Decoding lesson state: which stage, the draft per stage (code,
 * concept answers, per-file verdicts), and the last judge verdict. Pure
 * transitions — no React, no network.
 */

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
  /** Next unpassed stage (mainline pointer). */
  currentStage: number;
  passedStages: number[];
  freeNavigation: boolean;
  drafts: Record<number, DecodingDraft>;
  /** The local drafts a save conflict replaced — kept so the learner can
   *  restore their unsaved version explicitly after reconciling. */
  conflictedLocalDrafts: Record<number, DecodingDraft>;
  /** Server-assigned revision of each stage's latest applied write — the
   *  next autosave for that stage sends it back as `expectedRevision`. */
  draftRevisions: Record<number, number>;
  /** Per-user stage payloads issued by the server at project load. */
  payloads: Record<number, LabPayload>;
  /** Per-stage counter over the code/fills input — bumped on each edit so
   * an execution result can be stamped with the input it ran under and
   * dropped once the draft moves on (edit-after-run invalidation). */
  inputRevisions: Record<number, number>;
  judgeOutcome: DecodingJudgeResult | null;
  saveStatusByStage: SaveStatusByStage;
  /** Stages with an unreconciled sync-error — the retry stays visible
   *  while set, even after further edits flip the save flag to dirty. */
  unresolvedSyncConflicts: SyncConflictByStage;
  message: string | null;
};

export type DecodingLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, DecodingDraft>;
      /** Server revisions of the applied drafts, seeded into expectedRevision. */
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
      /** Stage the verdict was pinned on — drops stale async writes. */
      stageIndex: number;
      verdict: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix } | null;
      /** Sync writes only when the pinned verdict still picks this decoder. */
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
      /** The draft the server holds for the stage; absent → the stage's empty draft. */
      draft?: DecodingDraft;
      /** Server revision now stored for the stage — seeds the next save. */
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

/** Prompt ids already answered correctly in the current stage's draft. */
export function answeredPromptIds(state: DecodingLessonState): Set<string> {
  return new Set(Object.keys(draftOf(state).conceptAnswers));
}

/** Every concept prompt of the stage answered — required before submit. */
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

/** Code/fills changed — the stage's run-input version advances; a run
 * stamped with the old number no longer describes the current draft. */
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
      // Resume where the server's mainline pointer says, provided it's still
      // unlocked (or staff free navigation is active). On reset return to stage 1.
      const candidate = action.isReset
        ? 1
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
      // Only correct picks are recorded — a wrong option just shows its note.
      const prompt = stage?.prompts?.find((p) => p.id === action.promptId);
      if (!prompt || !(prompt.options[action.option]?.correct === true)) return state;
      return touchDraft(state, {
        ...draft,
        conceptAnswers: { ...draft.conceptAnswers, [action.promptId]: action.option },
      });
    }

    case "set-verdict": {
      // A decoder run finishing after a stage switch must not scribble its
      // verdict into the newly-selected stage's draft.
      if (action.stageIndex !== state.stageIndex) return state;
      const draft = draftOf(state);
      // Same for a run that landed after the student re-pinned the decoder.
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
      // Only a save started from the stage's current dirty state may settle it.
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      // A saved write does NOT drop the stage's conflict backup — the
      // recoverable local copy stays until the learner restores or
      // explicitly discards it.
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
      // The refused write's reconcile fetch failed: the local draft is
      // untouched and the stage stays fenced (its revision never advanced)
      // — only an explicit retry's resolve lifts the fence. Distinct from
      // "conflict": nothing was loaded, so "已载入最新进度" would be a lie.
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
      // Per-stage reconcile after a refused write: swap ONLY the conflicted
      // stage's draft for the server's copy and land its conflict flag in the
      // same transition — every other stage's local draft and save flag is
      // left untouched. The replaced local draft is stashed in
      // conflictedLocalDrafts so the learner can still recover it. Settles
      // while the stage waits on its save — and on a dirty flag too: a
      // fenced stage cannot retry its own save, so the reconcile must still
      // land (the stash keeps those newer edits recoverable the same way).
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      // "sync-error" is the same refusal, still unreconciled — a retry's
      // payload lands here too.
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
      // The learner explicitly keeps their pre-conflict version: it returns
      // as a dirty draft and autosave re-arms — expectedRevision is now the
      // reconciled server revision, so the write supersedes legitimately
      // (or loses OCC to an even newer write → a fresh conflict).
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
      // The learner accepts the server's draft: drop the recoverable local
      // copy for good. A "conflict" flag settles to "saved" — the content
      // on screen is the server's applied write; other flags stay put.
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

/** Bound a restored draft at the domain edge; junk fields drop to defaults. */
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
