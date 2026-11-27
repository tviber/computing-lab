/**
 * Calculator lab lesson state: public reducer entry point and re-exports.
 * Pure transitions only — no UI framework, no network.
 */

import {
  addNode,
  completeWire,
  deleteEdge,
  deleteNodes,
  moveNode,
  resetStage,
  runPublicTests,
  selectStage,
  startNodeMove,
  toggleCollapseNode,
  toggleInput,
  undoEdit,
} from "./canvasTransitions.ts";
import {
  componentizeSelectionAction,
  deleteCustomComponent,
  editCustomComponent,
  expandComponent,
} from "./componentTransitions.ts";
import {
  finishNodeMove,
  type CalculatorLessonAction,
  type CalculatorLessonState,
} from "./stateTypes.ts";
import {
  applyJudgeResult,
  discardConflictDraft,
  loadProject,
  markSaved,
  markSaveError,
  markSaveSyncError,
  markSaving,
  resolveSaveConflict,
  restoreConflictDraft,
} from "./syncTransitions.ts";

export {
  componentCatalog,
  componentMap,
  createCalculatorLessonState,
  graphOf,
  isStageUnlocked,
  portsForNode,
  scaffoldGraph,
  stageOf,
  type CalculatorLessonAction,
  type CalculatorLessonState,
  type ComponentCatalog,
  type Counterexample,
  type JudgeOutcome,
  type PendingWire,
  type RunOutcome,
  type SaveStatus,
} from "./stateTypes.ts";

export function transitionCalculatorLesson(
  state: CalculatorLessonState,
  action: CalculatorLessonAction,
): CalculatorLessonState {
  switch (action.type) {
    case "load-project":
      return loadProject(state, action);
    case "select-stage":
      return selectStage(state, action);
    case "add-node":
      return addNode(state, action);
    case "start-node-move":
      return startNodeMove(state, action);
    case "finish-node-move":
      return finishNodeMove(state);
    case "toggle-collapse-node":
      return toggleCollapseNode(state, action);
    case "componentize-selection":
      return componentizeSelectionAction(state, action);
    case "edit-custom-component":
      return editCustomComponent(state, action);
    case "expand-component":
      return expandComponent(state, action);
    case "delete-custom-component":
      return deleteCustomComponent(state, action);
    case "move-node":
      return moveNode(state, action);
    case "select-node":
      return { ...state, selectedNodeId: action.id };
    case "delete-node":
      return deleteNodes(state, [action.id]);
    case "delete-nodes":
      return deleteNodes(state, action.ids);
    case "toggle-input":
      return toggleInput(state, action);
    case "start-wire":
      return { ...state, pendingWire: { from: action.from } };
    case "cancel-wire":
      return { ...state, pendingWire: null };
    case "complete-wire":
      return completeWire(state, action);
    case "delete-edge":
      return deleteEdge(state, action);
    case "reset-stage":
      return resetStage(state);
    case "undo":
      return undoEdit(state);
    case "run-public-tests":
      return runPublicTests(state);
    case "mark-saving":
      return markSaving(state, action);
    case "mark-saved":
      return markSaved(state, action);
    case "mark-save-error":
      return markSaveError(state, action);
    case "mark-save-sync-error":
      return markSaveSyncError(state, action);
    case "resolve-save-conflict":
      return resolveSaveConflict(state, action);
    case "restore-conflict-draft":
      return restoreConflictDraft(state, action);
    case "discard-conflict-draft":
      return discardConflictDraft(state, action);
    case "judge-result":
      return applyJudgeResult(state, action);
    case "acknowledge-full-adder-guide":
      return { ...state, guideAcknowledged: true };
    case "dismiss-message":
      return { ...state, message: null };
  }
}
