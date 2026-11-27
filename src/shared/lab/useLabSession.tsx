import {
  reconcileConflictedStage,
  useLabProject,
  type UseLabProjectOptions,
} from "./useLabProject";
import { useAutosaveDraft } from "./useAutosaveDraft";
import { SaveIndicator } from "./SaveIndicator";
import {
  statusForStage,
  syncConflictForStage,
  type SaveStatusByStage,
  type SyncConflictByStage,
} from "./saveStatus";
import type { LabProjectPayload } from "./contracts";

/**
 * The slice of lesson state every lab page already keeps: the current stage,
 * per-stage drafts and revisions, plus the autosave/sync bookkeeping. Pages
 * still own their domain state; this only lets the shared session wiring read
 * the fields it needs without knowing the lesson's action union.
 */
export type LabSessionState<TDraft> = {
  stageIndex: number;
  drafts: Record<number, TDraft>;
  draftRevisions: Record<number, number>;
  saveStatusByStage: SaveStatusByStage;
  unresolvedSyncConflicts: SyncConflictByStage;
  conflictedLocalDrafts: Partial<Record<number, TDraft>>;
};

export type LabSessionAutosaveOptions<TDraft, TState extends LabSessionState<TDraft>> = {
  /** Override which project state allows autosave (defaults to projectLoaded). */
  ready?: (project: { projectLoaded: boolean; loadError: string | null }) => boolean;
  bodyFor?: (stageIndex: number, draft: TDraft) => Record<string, unknown>;
  holdSend?: (stageIndex: number, draft: TDraft) => boolean;
  deps?: (state: TState) => unknown[];
  expectedComponentsRevisionOf?: (state: TState) => number;
  componentsSeqOf?: (state: TState) => number;
};

export type LabSessionOptions<TDraft, TExtras, TAction, TState extends LabSessionState<TDraft>> = {
  scopeId: () => string | undefined;
  ready: () => boolean;
  labId: string;
  state: () => TState;
  dispatch: (action: TAction) => void;
  draftOf: (stageIndex: number) => TDraft | undefined;
  toAction: UseLabProjectOptions<TDraft, TExtras, TAction>["toAction"];
  onResetSuccess?: () => void;
  stageAffectedByReset?: UseLabProjectOptions<TDraft, TExtras, TAction>["stageAffectedByReset"];
  /** Whether the page still holds a recoverable local copy for the current stage. */
  hasConflictBackup?: (state: TState) => boolean;
  autosave?: LabSessionAutosaveOptions<TDraft, TState>;
  actions?: {
    /** Pages with extra save payloads (component libraries) map their own action. */
    saved?: (
      stageIndex: number,
      revision?: number,
      componentsRevision?: number,
      componentsSeq?: number,
    ) => TAction;
    /** Pages that restore more than a draft map their own conflict action. */
    resolvedConflict?: (
      stageIndex: number,
      project: LabProjectPayload<TDraft> & TExtras,
    ) => TAction;
  };
};

export type LabSaveIndicatorControls = {
  status: () => ReturnType<typeof statusForStage>;
  unresolvedSyncConflict: () => boolean;
  onRetrySync: () => void;
  onRestoreLocal: () => (() => void) | undefined;
  onDiscardLocal: () => (() => void) | undefined;
};

/** The shared topbar save control, driven by a session's accessors. */
export function LabSaveIndicator(props: { controls: LabSaveIndicatorControls }) {
  return (
    <SaveIndicator
      onDiscardLocal={props.controls.onDiscardLocal()}
      onRestoreLocal={props.controls.onRestoreLocal()}
      onRetrySync={props.controls.onRetrySync}
      status={props.controls.status()}
      unresolvedSyncConflict={props.controls.unresolvedSyncConflict()}
    />
  );
}

/**
 * Wires the repeated lab plumbing — project load/judge/reset, conflict
 * reconciliation, per-stage autosave, and the save indicator — around a
 * page's reducer state. Domain lesson logic stays in the feature.
 */
export function useLabSession<TDraft, TExtras, TAction, TState extends LabSessionState<TDraft>>(
  getOptions: () => LabSessionOptions<TDraft, TExtras, TAction, TState>,
) {
  const latestOptions = () => getOptions();

  const sessionAction = (action: unknown) => action as TAction;

  const project = useLabProject<TDraft, TExtras, TAction>(() => {
    const options = latestOptions();
    return {
      scopeId: options.scopeId(),
      labId: options.labId,
      ready: options.ready(),
      stageIndex: options.state().stageIndex,
      stageAffectedByReset: options.stageAffectedByReset,
      onResetSuccess: options.onResetSuccess,
      toAction: options.toAction,
      dispatch: options.dispatch,
    };
  });

  const reconcileConflict = (stageIndex: number) => {
    const options = latestOptions();
    reconcileConflictedStage<TDraft, TExtras>({
      fetchProject: project.fetchProject,
      stageIndex,
      onResolved: (resolvedStage, loaded) => {
        const action =
          options.actions?.resolvedConflict?.(resolvedStage, loaded) ??
          sessionAction({
            type: "resolve-save-conflict",
            stageIndex: resolvedStage,
            draft: loaded.drafts?.[resolvedStage],
            revision: loaded.draftRevisions?.[resolvedStage],
          });
        options.dispatch(action);
      },
      onSyncError: (failedStage) =>
        options.dispatch(sessionAction({ type: "mark-save-sync-error", stageIndex: failedStage })),
    });
  };

  useAutosaveDraft<TDraft>(() => {
    const options = latestOptions();
    const currentState = options.state();
    const autosave = options.autosave;
    const ready = autosave?.ready
      ? autosave.ready({
          projectLoaded: project.projectLoaded,
          loadError: project.loadError,
        })
      : project.projectLoaded;
    return {
      flushPreservedDrafts: project.flushPreservedDrafts,
      saveStatuses: ready ? currentState.saveStatusByStage : undefined,
      scopeId: options.scopeId(),
      labId: options.labId,
      saveStatus:
        ready && !project.resetting
          ? statusForStage(currentState.saveStatusByStage, currentState.stageIndex)
          : "idle",
      stageIndex: currentState.stageIndex,
      draftOf: options.draftOf,
      deps: autosave?.deps?.(currentState) ?? [currentState.drafts],
      expectedGeneration: project.projectGeneration,
      resetVersion: project.saveGeneration,
      expectedRevisionOf: (stageIndex) => currentState.draftRevisions[stageIndex] ?? 0,
      bodyFor: autosave?.bodyFor,
      holdSend: autosave?.holdSend,
      expectedComponentsRevisionOf: autosave?.expectedComponentsRevisionOf
        ? () => autosave.expectedComponentsRevisionOf?.(options.state()) ?? 0
        : undefined,
      componentsSeqOf: autosave?.componentsSeqOf
        ? () => autosave.componentsSeqOf?.(options.state()) ?? 0
        : undefined,
      onSaving: (stageIndex) =>
        options.dispatch(sessionAction({ type: "mark-saving", stageIndex })),
      onSaved: (stageIndex, revision, componentsRevision, componentsSeq) => {
        const action =
          options.actions?.saved?.(stageIndex, revision, componentsRevision, componentsSeq) ??
          sessionAction({ type: "mark-saved", stageIndex, revision });
        options.dispatch(action);
      },
      onError: (stageIndex) =>
        options.dispatch(sessionAction({ type: "mark-save-error", stageIndex })),
      onConflict: reconcileConflict,
    };
  });

  const saveIndicator: LabSaveIndicatorControls = {
    status: () => {
      const current = latestOptions().state();
      return statusForStage(current.saveStatusByStage, current.stageIndex);
    },
    unresolvedSyncConflict: () => {
      const current = latestOptions().state();
      return syncConflictForStage(current.unresolvedSyncConflicts, current.stageIndex);
    },
    onRetrySync: () => reconcileConflict(latestOptions().state().stageIndex),
    onRestoreLocal: () => {
      const options = latestOptions();
      const current = options.state();
      const hasBackup =
        options.hasConflictBackup?.(current) ??
        current.conflictedLocalDrafts[current.stageIndex] !== undefined;
      if (!hasBackup) return undefined;
      return () =>
        options.dispatch(
          sessionAction({
            type: "restore-conflict-draft",
            stageIndex: latestOptions().state().stageIndex,
          }),
        );
    },
    onDiscardLocal: () => {
      const options = latestOptions();
      const current = options.state();
      const hasBackup =
        options.hasConflictBackup?.(current) ??
        current.conflictedLocalDrafts[current.stageIndex] !== undefined;
      if (!hasBackup) return undefined;
      return () =>
        options.dispatch(
          sessionAction({
            type: "discard-conflict-draft",
            stageIndex: latestOptions().state().stageIndex,
          }),
        );
    },
  };

  return {
    project,
    reconcileConflict,
    saveIndicator,
  };
}
