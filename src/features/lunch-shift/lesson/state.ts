/**
 * Lunch-shift lesson state: which stage, the per-stage draft, the last
 * judge verdict. Pure transitions — no React, no network. Mirrors the
 * is-sim reducer's save-status/conflict machinery so autosave behaves the
 * same across labs.
 */

import type { SaveStatus } from "../../../shared/api/client";
import {
  markSaveStatus,
  markSyncConflict,
  statusForStage,
  type SaveStatusByStage,
  type SyncConflictByStage,
} from "../../../shared/lab/saveStatus.ts";
import { sanitizeBlockDrafts } from "../domain/blockStrategy.ts";
import { emptyBlockDrafts, isFocus, TABLES, type Focus } from "../domain/contracts.ts";
import { sanitizeSystemCheckAnswers } from "../domain/systemCheck.ts";
import {
  getLunchStage,
  LUNCH_STAGES,
  lunchStageUnlocked,
  nextLunchStage,
  type LunchStageDef,
} from "../domain/stages.ts";
import type {
  ChallengeDraft,
  LunchDraft,
  LunchJudgeResult,
  LunchProjectExtras,
  SystemCheckDraft,
  TrainingDraft,
} from "../domain/protocol.ts";

export type { SaveStatus };

export type LunchLessonState = {
  stageIndex: number;
  /** Next unpassed stage (mainline pointer). */
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, LunchDraft>;
  /** The local drafts a save conflict replaced — kept so the learner can
   *  restore their unsaved version explicitly after reconciling. */
  conflictedLocalDrafts: Record<number, LunchDraft>;
  draftRevisions: Record<number, number>;
  judgeOutcome: LunchJudgeResult | null;
  /** Latest recorded run per challenge stage, from GET /project extras. */
  runSummaries: LunchProjectExtras["runSummaries"];
  saveStatusByStage: SaveStatusByStage;
  unresolvedSyncConflicts: SyncConflictByStage;
  message: string | null;
};

export type LunchLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, LunchDraft>;
      draftRevisions?: Record<number, number>;
      runSummaries?: LunchProjectExtras["runSummaries"];
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "update-training"; draft: TrainingDraft }
  | { type: "update-check"; draft: SystemCheckDraft }
  | { type: "update-challenge"; draft: ChallengeDraft }
  | { type: "judge-result"; outcome: LunchJudgeResult }
  | { type: "mark-saving"; stageIndex: number }
  | { type: "mark-saved"; stageIndex: number; revision?: number }
  | { type: "mark-save-error"; stageIndex: number }
  | { type: "mark-save-sync-error"; stageIndex: number }
  | { type: "resolve-save-conflict"; stageIndex: number; draft?: LunchDraft; revision?: number }
  | { type: "restore-conflict-draft"; stageIndex: number }
  | { type: "discard-conflict-draft"; stageIndex: number }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

export function stageOf(state: LunchLessonState): LunchStageDef | undefined {
  return getLunchStage(state.stageIndex);
}

export function isStageUnlocked(state: LunchLessonState, stageIndex: number): boolean {
  return lunchStageUnlocked(state.passedStages, stageIndex);
}

export function emptyTrainingDraft(): TrainingDraft {
  return { step: "record", ticket: null, kitchenChoice: null, deliveredTable: null };
}

export function emptyCheckDraft(): SystemCheckDraft {
  return { answers: {}, explanation: "", attempts: 0 };
}

export function emptyChallengeDraft(): ChallengeDraft {
  return { focus: null, blocks: emptyBlockDrafts() };
}

/**
 * The draft for a stage: the stored copy, or a fresh default. The final
 * stage seeds its rules from the practice draft so tuning carries over.
 */
export function draftOf(state: LunchLessonState, stageIndex = state.stageIndex): LunchDraft {
  const stored = state.drafts[stageIndex];
  if (stored !== undefined) return stored;
  if (stageIndex === 1) return emptyTrainingDraft();
  if (stageIndex === 2) return emptyCheckDraft();
  if (stageIndex === 4 && state.drafts[3] !== undefined) {
    return sanitizeChallengeDraft(state.drafts[3]);
  }
  return emptyChallengeDraft();
}

function isTicketShape(value: unknown): value is TrainingDraft["ticket"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.item === "string" &&
    typeof t.note === "string" &&
    typeof t.table === "string" &&
    typeof t.urgent === "boolean"
  );
}

export function sanitizeTrainingDraft(raw: unknown): TrainingDraft {
  const draft = emptyTrainingDraft();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return draft;
  const record = raw as Record<string, unknown>;
  if (
    record.step === "record" ||
    record.step === "cook" ||
    record.step === "deliver" ||
    record.step === "done"
  ) {
    draft.step = record.step;
  }
  if (isTicketShape(record.ticket)) draft.ticket = record.ticket;
  if (record.kitchenChoice === "urgent" || record.kitchenChoice === "normal") {
    draft.kitchenChoice = record.kitchenChoice;
  }
  if (
    typeof record.deliveredTable === "string" &&
    (TABLES as readonly string[]).includes(record.deliveredTable)
  ) {
    draft.deliveredTable = record.deliveredTable;
  }
  return draft;
}

export function sanitizeCheckDraft(raw: unknown): SystemCheckDraft {
  const draft = emptyCheckDraft();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return draft;
  const record = raw as Record<string, unknown>;
  draft.answers = sanitizeSystemCheckAnswers(record.answers);
  if (typeof record.explanation === "string") {
    draft.explanation = record.explanation.slice(0, 300);
  }
  if (Number.isInteger(record.attempts) && (record.attempts as number) > 0) {
    draft.attempts = record.attempts as number;
  }
  return draft;
}

export function sanitizeChallengeDraft(raw: unknown): ChallengeDraft {
  const draft = emptyChallengeDraft();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return draft;
  const record = raw as Record<string, unknown>;
  if (isFocus(record.focus)) draft.focus = record.focus as Focus;
  draft.blocks = sanitizeBlockDrafts(record.blocks);
  return draft;
}

/** Bound a restored draft at the domain edge, dispatched by stage. */
export function sanitizeLunchDraft(stageIndex: number, raw: unknown): LunchDraft {
  if (stageIndex === 1) return sanitizeTrainingDraft(raw);
  if (stageIndex === 2) return sanitizeCheckDraft(raw);
  return sanitizeChallengeDraft(raw);
}

function withDraft(state: LunchLessonState, draft: LunchDraft): LunchLessonState {
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [state.stageIndex]: sanitizeLunchDraft(state.stageIndex, draft),
    },
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
    judgeOutcome: null,
  };
}

export function createLunchLessonState(stageIndex = 1): LunchLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    conflictedLocalDrafts: {},
    draftRevisions: {},
    judgeOutcome: null,
    runSummaries: { practice: null, final: null },
    saveStatusByStage: {},
    unresolvedSyncConflicts: {},
    message: null,
  };
}

export function transitionLunchLesson(
  state: LunchLessonState,
  action: LunchLessonAction,
): LunchLessonState {
  switch (action.type) {
    case "load-project": {
      const draftRevisions: Record<number, number> = {};
      for (const [key, rev] of Object.entries(action.draftRevisions ?? {})) {
        draftRevisions[Number(key)] = rev;
      }
      const drafts: Record<number, LunchDraft> = {};
      for (const [key, draft] of Object.entries(action.drafts)) {
        const stageIndex = Number(key);
        drafts[stageIndex] = sanitizeLunchDraft(stageIndex, draft);
      }
      // currentStage can point one past the last stage once every stage
      // passed — clamp to a real stage so the workspace never goes blank.
      const candidate = lunchStageUnlocked(action.passedStages, action.currentStage)
        ? action.currentStage
        : lunchStageUnlocked(action.passedStages, state.stageIndex)
          ? state.stageIndex
          : 1;
      const stageIndex = getLunchStage(candidate) ? candidate : LUNCH_STAGES.length;
      return {
        ...state,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        conflictedLocalDrafts: {},
        draftRevisions,
        saveStatusByStage: {},
        unresolvedSyncConflicts: {},
        judgeOutcome: null,
        runSummaries: action.runSummaries ?? { practice: null, final: null },
      };
    }

    case "select-stage": {
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return { ...state, stageIndex: action.stageIndex, judgeOutcome: null };
    }

    case "update-training":
      return state.stageIndex === 1 ? withDraft(state, action.draft) : state;
    case "update-check":
      return state.stageIndex === 2 ? withDraft(state, action.draft) : state;
    case "update-challenge":
      return state.stageIndex >= 3 ? withDraft(state, action.draft) : state;

    case "judge-result":
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages: action.outcome.passedStages,
        currentStage: nextLunchStage(action.outcome.passedStages),
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
        drafts: {
          ...state.drafts,
          [action.stageIndex]: sanitizeLunchDraft(action.stageIndex, action.draft ?? {}),
        },
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
      const isCurrent = action.stageIndex === state.stageIndex;
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
        judgeOutcome: isCurrent ? null : state.judgeOutcome,
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
