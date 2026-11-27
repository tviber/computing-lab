/**
 * Multi-device persistence, OCC conflict reconciliation, recovery, project
 * loading, and judge-result synchronization for the calculator lesson state.
 *
 * Key invariants:
 * - Stage and library revisions (`draftRevisions[s]`, `componentsRevision`)
 *   and `componentsConfirmedSeq` are monotonic; stale responses never regress them.
 * - Server library snapshots are adopted atomically as `(unlockedSubmodules,
 *   componentsRevision)` pairs only when `serverRevision >= state.componentsRevision`.
 * - Replaced local drafts/components stay stashed until explicit restore,
 *   explicit discard, overwrite by a newer conflict, or full project load.
 */

import {
  markSaveStatus,
  markSyncConflict,
  statusForStage,
} from "../../../shared/lab/saveStatus.ts";
import { emptyGraph, type CircuitGraph } from "../domain/graph";
import { getStage, nextMainlineStage, stagePrerequisites } from "../domain/stages";
import {
  graphOf,
  withScaffold,
  type CalculatorLessonAction,
  type CalculatorLessonState,
} from "./stateTypes.ts";

export function loadProject(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "load-project" }>,
): CalculatorLessonState {
  const drafts: Record<number, CircuitGraph> = {};
  for (const [key, graph] of Object.entries(action.drafts)) {
    drafts[Number(key)] = graph;
  }
  const draftRevisions: Record<number, number> = {};
  for (const [key, rev] of Object.entries(action.draftRevisions ?? {})) {
    if (Number.isInteger(Number(key))) draftRevisions[Number(key)] = rev;
  }
  const requested = action.stageIndex ?? state.stageIndex;
  const requestedStage = getStage(requested);
  const canOpen =
    requestedStage !== undefined &&
    (action.forceStage ||
      stagePrerequisites(requestedStage).every((i) => action.passedStages.includes(i)));
  const stageIndex = canOpen ? requested : Math.min(state.stageIndex, action.currentStage);
  drafts[stageIndex] = withScaffold(drafts[stageIndex] ?? emptyGraph(), stageIndex);
  return {
    ...state,
    stageIndex,
    currentStage: action.currentStage,
    passedStages: action.passedStages,
    guideAcknowledged: state.guideAcknowledged || !!action.guideAcknowledged,
    unlockedSubmodules: action.unlockedSubmodules,
    componentsRevision: action.componentsRevision ?? 0,
    componentsEditSeq: 0,
    componentsConfirmedSeq: 0,
    componentsChanged: false,
    conflictedComponents: null,
    drafts,
    conflictedLocalDrafts: {},
    draftRevisions,
    past: [],
    nodeMove: null,
    ...(action.isReset ? { selectedNodeId: null, pendingWire: null, message: null } : null),
    ...(action.draftNotice ? { message: action.draftNotice } : {}),
    saveStatusByStage: {},
    unresolvedSyncConflicts: {},
    runOutcome: null,
    judgeOutcome: null,
  };
}

export function markSaving(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "mark-saving" }>,
): CalculatorLessonState {
  return {
    ...state,
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saving"),
  };
}

export function markSaved(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "mark-saved" }>,
): CalculatorLessonState {
  if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
  const confirmedComponentsSeq =
    typeof action.componentsSeq === "number"
      ? Math.max(state.componentsConfirmedSeq, action.componentsSeq)
      : state.componentsConfirmedSeq;
  return {
    ...state,
    componentsRevision:
      typeof action.componentsRevision === "number"
        ? Math.max(state.componentsRevision, action.componentsRevision)
        : state.componentsRevision,
    componentsConfirmedSeq: confirmedComponentsSeq,
    componentsChanged: state.componentsEditSeq > confirmedComponentsSeq,
    draftRevisions:
      typeof action.revision === "number"
        ? {
            ...state.draftRevisions,
            [action.stageIndex]: Math.max(
              state.draftRevisions[action.stageIndex] ?? 0,
              action.revision,
            ),
          }
        : state.draftRevisions,
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved"),
  };
}

export function markSaveError(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "mark-save-error" }>,
): CalculatorLessonState {
  if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
  return {
    ...state,
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "error"),
  };
}

export function markSaveSyncError(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "mark-save-sync-error" }>,
): CalculatorLessonState {
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

export function resolveSaveConflict(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "resolve-save-conflict" }>,
): CalculatorLessonState {
  const status = statusForStage(state.saveStatusByStage, action.stageIndex);
  if (status !== "saving" && status !== "dirty" && status !== "sync-error") return state;
  const isCurrent = action.stageIndex === state.stageIndex;
  const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
  const localDraft = state.drafts[action.stageIndex];
  if (localDraft !== undefined) conflictedLocalDrafts[action.stageIndex] = localDraft;

  const adoptsServerLibrary =
    action.unlockedSubmodules !== undefined &&
    typeof action.componentsRevision === "number" &&
    action.componentsRevision >= state.componentsRevision;
  const libraryDiffers =
    adoptsServerLibrary &&
    JSON.stringify(action.unlockedSubmodules) !== JSON.stringify(state.unlockedSubmodules);

  return {
    ...state,
    drafts: {
      ...state.drafts,
      [action.stageIndex]: withScaffold(action.draft ?? emptyGraph(), action.stageIndex),
    },
    conflictedLocalDrafts,
    unresolvedSyncConflicts: markSyncConflict(
      state.unresolvedSyncConflicts,
      action.stageIndex,
      false,
    ),
    unlockedSubmodules: adoptsServerLibrary
      ? (action.unlockedSubmodules ?? state.unlockedSubmodules)
      : state.unlockedSubmodules,
    conflictedComponents: libraryDiffers ? state.unlockedSubmodules : state.conflictedComponents,
    componentsRevision: adoptsServerLibrary
      ? (action.componentsRevision ?? state.componentsRevision)
      : state.componentsRevision,
    componentsConfirmedSeq: libraryDiffers ? state.componentsEditSeq : state.componentsConfirmedSeq,
    componentsChanged: libraryDiffers ? false : state.componentsChanged,
    draftRevisions:
      typeof action.revision === "number"
        ? {
            ...state.draftRevisions,
            [action.stageIndex]: Math.max(
              state.draftRevisions[action.stageIndex] ?? 0,
              action.revision,
            ),
          }
        : state.draftRevisions,
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "conflict"),
    nodeMove: isCurrent ? null : state.nodeMove,
    selectedNodeId: isCurrent ? null : state.selectedNodeId,
    pendingWire: isCurrent ? null : state.pendingWire,
    runOutcome: isCurrent ? null : state.runOutcome,
    judgeOutcome: isCurrent ? null : state.judgeOutcome,
  };
}

export function restoreConflictDraft(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "restore-conflict-draft" }>,
): CalculatorLessonState {
  const backup = state.conflictedLocalDrafts[action.stageIndex];
  const components = state.conflictedComponents;
  if (backup === undefined && components === null) return state;
  const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
  delete conflictedLocalDrafts[action.stageIndex];
  const isCurrent = action.stageIndex === state.stageIndex;
  return {
    ...state,
    drafts: backup === undefined ? state.drafts : { ...state.drafts, [action.stageIndex]: backup },
    conflictedLocalDrafts,
    unresolvedSyncConflicts: markSyncConflict(
      state.unresolvedSyncConflicts,
      action.stageIndex,
      false,
    ),
    unlockedSubmodules: components ?? state.unlockedSubmodules,
    componentsEditSeq: components !== null ? state.componentsEditSeq + 1 : state.componentsEditSeq,
    componentsChanged: components !== null ? true : state.componentsChanged,
    conflictedComponents: null,
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "dirty"),
    nodeMove: isCurrent ? null : state.nodeMove,
    selectedNodeId: isCurrent ? null : state.selectedNodeId,
    pendingWire: isCurrent ? null : state.pendingWire,
    runOutcome: isCurrent ? null : state.runOutcome,
    judgeOutcome: isCurrent ? null : state.judgeOutcome,
  };
}

export function discardConflictDraft(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "discard-conflict-draft" }>,
): CalculatorLessonState {
  if (
    state.conflictedLocalDrafts[action.stageIndex] === undefined &&
    state.conflictedComponents === null
  ) {
    return state;
  }
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
    conflictedComponents: null,
    saveStatusByStage:
      status === "conflict"
        ? markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved")
        : state.saveStatusByStage,
  };
}

export function applyJudgeResult(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "judge-result" }>,
): CalculatorLessonState {
  const unlocked = action.outcome.unlockedComponent;
  const serverLibrary = action.outcome.unlockedSubmodules ?? undefined;
  const adoptsServerLibrary =
    serverLibrary !== undefined &&
    typeof action.outcome.componentsRevision === "number" &&
    action.outcome.componentsRevision >= state.componentsRevision;
  const submodules = adoptsServerLibrary
    ? serverLibrary
    : serverLibrary === undefined && unlocked
      ? [
          ...state.unlockedSubmodules.filter(
            (s) => s.name.toLocaleLowerCase() !== unlocked.toLocaleLowerCase(),
          ),
          { name: unlocked, graph: graphOf(state) },
        ]
      : state.unlockedSubmodules;
  const libraryDiffers =
    adoptsServerLibrary &&
    JSON.stringify(serverLibrary) !== JSON.stringify(state.unlockedSubmodules);
  const passedStages = [
    ...new Set([
      ...state.passedStages,
      ...action.outcome.passedStages,
      ...(action.outcome.passed ? [action.stageIndex] : []),
    ]),
  ].sort((a, b) => a - b);
  const onSubmittedStage = action.stageIndex === state.stageIndex;
  return {
    ...state,
    judgeOutcome: onSubmittedStage ? action.outcome : state.judgeOutcome,
    passedStages,
    currentStage: nextMainlineStage(passedStages),
    unlockedSubmodules: submodules,
    conflictedComponents:
      libraryDiffers && state.componentsChanged
        ? state.unlockedSubmodules
        : state.conflictedComponents,
    componentsRevision: adoptsServerLibrary
      ? (action.outcome.componentsRevision ?? state.componentsRevision)
      : state.componentsRevision,
    componentsConfirmedSeq: libraryDiffers ? state.componentsEditSeq : state.componentsConfirmedSeq,
    componentsChanged: libraryDiffers ? false : state.componentsChanged,
    message: !onSubmittedStage
      ? state.message
      : action.outcome.passed
        ? unlocked
          ? `${getStage(action.stageIndex)?.title ?? "本关"}完成。组件 ${unlocked} 已加入「我的组件」，下一关可以直接使用。`
          : `${getStage(action.stageIndex)?.title ?? "本关"}完成。全部隐藏用例都正确。`
        : `得分 ${action.outcome.score} / ${action.outcome.total}，还没有全部通过。`,
  };
}
