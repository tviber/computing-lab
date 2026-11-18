import { useCallback, useEffect, useRef, useState } from "react";
import { api, describeApiError, type LabProjectPayload } from "../api/client";
import type { LabStaffControlsProps } from "./LabPageShell";

/**
 * Fetches `GET /api/classes/:classId/labs/:labId/project` once the caller is
 * authenticated, then hands the payload to `toAction` so the lab's own
 * reducer folds it into lesson state. Lab-specific payload fields flow
 * through the `TExtras` generic.
 *
 * Every request is ticketed: a response only dispatches while it is still
 * the latest request, so a slow fetch for a previous classId/labId can never
 * overwrite the state the newer request belongs to.
 *
 * `fetchProject()` re-fetches on a fresh ticket and resolves with the raw
 * payload instead of dispatching — used to reconcile one stage's draft after
 * the server reports a newer write exists (save conflict), without touching
 * the other stages' local state. It resolves `null` when the response is
 * superseded or the request fails, and never touches `projectLoaded`/`loadError`
 * so the workspace doesn't flicker.
 */
export function useLabProject<TDraft, TExtras, TAction>(options: {
  classId: string | undefined;
  labId: string;
  /** Gate on auth — fetch only once status is "authenticated". */
  ready: boolean;
  /** Caller holds teacher/admin role: unlocks shared self-reset & free-navigation controls. */
  staff?: boolean;
  /** Invoked when a staff self-reset succeeds so page-local state (errors, exec channels) clears cleanly. */
  onResetSuccess?: () => void;
  toAction: (project: LabProjectPayload<TDraft> & TExtras, meta?: { isReset?: boolean }) => TAction;
  dispatch: (action: TAction) => void;
}): {
  projectLoaded: boolean;
  loadError: string | null;
  fetchProject: () => Promise<(LabProjectPayload<TDraft> & TExtras) | null>;
  resetProject: () => Promise<boolean>;
  resetting: boolean;
  resetError: string | null;
  saveGeneration: number;
  staffControls: LabStaffControlsProps | undefined;
} {
  const { classId, labId, ready, staff = false, toAction, dispatch } = options;
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [saveGeneration, setSaveGeneration] = useState(0);
  const requestSeq = useRef(0);
  const resetCallbackRef = useRef(options.onResetSuccess);
  const toActionRef = useRef(toAction);

  useEffect(() => {
    resetCallbackRef.current = options.onResetSuccess;
    toActionRef.current = toAction;
  });

  useEffect(() => {
    if (!classId || !ready) return;
    const ticket = ++requestSeq.current;
    setProjectLoaded(false);
    setLoadError(null);
    setResetting(false);
    setResetError(null);
    void api
      .get<LabProjectPayload<TDraft> & TExtras>(`/api/classes/${classId}/labs/${labId}/project`)
      .then((project) => {
        if (requestSeq.current !== ticket) return;
        dispatch(toAction(project, { isReset: false }));
        setProjectLoaded(true);
      })
      .catch((error) => {
        if (requestSeq.current !== ticket) return;
        setLoadError(describeApiError(error));
        setProjectLoaded(true);
      });
    return () => {
      // Superseded by a newer request (or unmounted): invalidate every in-flight
      // fetch/reset so a late response can never mutate a stale context.
      requestSeq.current += 1;
    };
  }, [classId, labId, ready]);

  const fetchProject = useCallback((): Promise<(LabProjectPayload<TDraft> & TExtras) | null> => {
    if (!classId || !ready) return Promise.resolve(null);
    const ticket = ++requestSeq.current;
    return api
      .get<LabProjectPayload<TDraft> & TExtras>(`/api/classes/${classId}/labs/${labId}/project`)
      .then((project) => {
        if (requestSeq.current !== ticket) return null;
        setProjectLoaded(true);
        setLoadError(null);
        return project;
      })
      .catch(() => {
        // Best-effort reconcile: a failed refetch leaves the current state
        // untouched and reports null — the caller still settles the flag.
        return null;
      });
  }, [classId, labId, ready]);

  const resetProject = useCallback(async (): Promise<boolean> => {
    if (!classId || !ready) return false;
    const ticket = ++requestSeq.current;
    setResetting(true);
    setResetError(null);
    try {
      const fresh = await api.post<LabProjectPayload<TDraft> & TExtras>(
        `/api/classes/${classId}/labs/${labId}/reset`,
        {},
      );
      if (requestSeq.current !== ticket) return false;
      // Bump save generation together with the reset snapshot so any pre-reset
      // debounced or in-flight autosave is fenced off and revision counters start at 0.
      setSaveGeneration((g) => g + 1);
      dispatch(toActionRef.current(fresh, { isReset: true }));
      resetCallbackRef.current?.();
      setProjectLoaded(true);
      setLoadError(null);
      return true;
    } catch (error) {
      if (requestSeq.current === ticket) setResetError(describeApiError(error));
      return false;
    } finally {
      if (requestSeq.current === ticket) setResetting(false);
    }
  }, [classId, labId, ready, dispatch]);

  const staffControls: LabStaffControlsProps | undefined = staff
    ? {
        freeNavigation: true,
        canReset: Boolean(classId && ready && projectLoaded),
        resetting,
        resetError,
        onReset: () => {
          void resetProject();
        },
      }
    : undefined;

  return {
    projectLoaded,
    loadError,
    fetchProject,
    resetProject,
    resetting,
    resetError,
    saveGeneration,
    staffControls,
  };
}

/**
 * One conflict reconcile step shared by every lab's `onConflict`/retry: the
 * refetch resolves with the payload (reconcile landed — swap the stage's
 * draft for the server's copy) or `null` (superseded or offline — flag the
 * stage as sync-error and keep the local draft; an explicit retry is the
 * only path that can lift the save fence again).
 */
export function reconcileConflictedStage<TDraft, TExtras>(options: {
  fetchProject: () => Promise<(LabProjectPayload<TDraft> & TExtras) | null>;
  stageIndex: number;
  onResolved: (stageIndex: number, project: LabProjectPayload<TDraft> & TExtras) => void;
  onSyncError: (stageIndex: number) => void;
}): void {
  void options.fetchProject().then((project) => {
    if (project) options.onResolved(options.stageIndex, project);
    else options.onSyncError(options.stageIndex);
  });
}
