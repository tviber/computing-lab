import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, describeApiError, type LabProjectPayload } from "../api/client";
import type { LabStaffControlsProps } from "./LabPageShell";

export type JudgeSubmissionResult<TOutcome> =
  | { status: "applied"; outcome: TOutcome }
  | { status: "stale" }
  | { status: "error"; error: string };

// Tracks `/project` payloads that already applied a cross-tab project reset inside
// `fetchProject` so `reconcileConflictedStage` skips single-stage conflict backup.
const resetHandledPayloads = new WeakSet<object>();

/**
 * Fetches `GET /api/classes/:classId/labs/:labId/project` once the caller is
 * authenticated, then hands the payload to `toAction` so the lab's own
 * reducer folds it into lesson state. Lab-specific payload fields flow
 * through the `TExtras` generic.
 *
 * Also owns the concurrency boundary around staff self-reset (`projectGeneration`,
 * `saveGeneration`, `postJudge`, and `invalidateJudge`) so delayed autosaves and
 * pre-reset judge requests/responses are rejected both on the server and client.
 */
export function useLabProject<TDraft, TExtras, TAction>(options: {
  classId: string | undefined;
  labId: string;
  /** Gate on auth — fetch only once status is "authenticated". */
  ready: boolean;
  /** Caller holds teacher/admin role: unlocks shared self-reset & free-navigation controls. */
  staff?: boolean;
  /** Invoked when a staff self-reset (or cross-tab reset sync) settles so page-local state clears cleanly. */
  onResetSuccess?: () => void;
  toAction: (project: LabProjectPayload<TDraft> & TExtras, meta?: { isReset?: boolean }) => TAction;
  dispatch: (action: TAction) => void;
}): {
  projectLoaded: boolean;
  loadError: string | null;
  fetchProject: () => Promise<(LabProjectPayload<TDraft> & TExtras) | null>;
  postJudge: <TOutcome>(
    body: Record<string, unknown>,
    options?: { isStillCurrent?: () => boolean },
  ) => Promise<JudgeSubmissionResult<TOutcome>>;
  invalidateJudge: () => void;
  submittingJudge: boolean;
  resetProject: () => Promise<boolean>;
  resetting: boolean;
  resetError: string | null;
  projectGeneration: number;
  saveGeneration: number;
  staffControls: LabStaffControlsProps | undefined;
} {
  const { classId, labId, ready, staff = false, toAction, dispatch } = options;
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [submittingJudge, setSubmittingJudge] = useState(false);
  const [projectGeneration, setProjectGeneration] = useState(0);
  const [saveGeneration, setSaveGeneration] = useState(0);

  const requestSeq = useRef(0);
  const contextSeq = useRef(0);
  const judgeSeq = useRef(0);
  const projectGenerationRef = useRef(0);
  const resettingRef = useRef(false);
  const resetCallbackRef = useRef(options.onResetSuccess);
  const toActionRef = useRef(toAction);

  useEffect(() => {
    resetCallbackRef.current = options.onResetSuccess;
    toActionRef.current = toAction;
  });

  useEffect(() => {
    if (!classId || !ready) return;
    const ticket = ++requestSeq.current;
    resettingRef.current = false;
    judgeSeq.current += 1;
    projectGenerationRef.current = 0;
    setProjectGeneration(0);
    setSubmittingJudge(false);
    setProjectLoaded(false);
    setLoadError(null);
    setResetting(false);
    setResetError(null);
    void api
      .get<LabProjectPayload<TDraft> & TExtras>(`/api/classes/${classId}/labs/${labId}/project`)
      .then((project) => {
        if (requestSeq.current !== ticket) return;
        const gen = project.projectGeneration ?? 0;
        projectGenerationRef.current = gen;
        setProjectGeneration(gen);
        dispatch(toAction(project, { isReset: false }));
        setProjectLoaded(true);
      })
      .catch((error) => {
        if (requestSeq.current !== ticket) return;
        setLoadError(describeApiError(error));
        setProjectLoaded(true);
      });
    return () => {
      // Superseded by a newer context (or unmounted): invalidate every in-flight
      // fetch, reset, or judge call so a late response never mutates stale state.
      requestSeq.current += 1;
      contextSeq.current += 1;
      judgeSeq.current += 1;
      resettingRef.current = false;
    };
  }, [classId, labId, ready]);

  const fetchProject = useCallback((): Promise<(LabProjectPayload<TDraft> & TExtras) | null> => {
    if (!classId || !ready) return Promise.resolve(null);
    const ticket = ++requestSeq.current;
    const ctx = contextSeq.current;
    return api
      .get<LabProjectPayload<TDraft> & TExtras>(`/api/classes/${classId}/labs/${labId}/project`)
      .then((project) => {
        if (requestSeq.current !== ticket || contextSeq.current !== ctx) return null;
        const nextGen = project.projectGeneration ?? 0;
        if (nextGen > projectGenerationRef.current) {
          projectGenerationRef.current = nextGen;
          setProjectGeneration(nextGen);
          judgeSeq.current += 1;
          setSubmittingJudge(false);
          setSaveGeneration((g) => g + 1);
          dispatch(toActionRef.current(project, { isReset: true }));
          resetCallbackRef.current?.();
          resetHandledPayloads.add(project);
        }
        setProjectLoaded(true);
        setLoadError(null);
        return project;
      })
      .catch(() => {
        // Best-effort reconcile: a failed refetch leaves the current state
        // untouched and reports null — the caller still settles the flag.
        return null;
      });
  }, [classId, labId, ready, dispatch]);

  const invalidateJudge = useCallback(() => {
    judgeSeq.current += 1;
    setSubmittingJudge(false);
  }, []);

  const resetProject = useCallback(async (): Promise<boolean> => {
    if (!classId || !ready || resettingRef.current) return false;
    const ticket = ++requestSeq.current;
    // Bump judgeSeq as soon as reset starts so an in-flight pre-reset judge
    // response landing after reset cannot dispatch stale verdicts or stages.
    judgeSeq.current += 1;
    setSubmittingJudge(false);
    resettingRef.current = true;
    setResetting(true);
    setResetError(null);
    try {
      const fresh = await api.post<LabProjectPayload<TDraft> & TExtras>(
        `/api/classes/${classId}/labs/${labId}/reset`,
        {},
      );
      if (requestSeq.current !== ticket) return false;
      const nextGen = fresh.projectGeneration ?? projectGenerationRef.current + 1;
      projectGenerationRef.current = nextGen;
      setProjectGeneration(nextGen);
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
      if (requestSeq.current === ticket) {
        resettingRef.current = false;
        setResetting(false);
      }
    }
  }, [classId, labId, ready, dispatch]);

  const postJudge = useCallback(
    async <TOutcome>(
      body: Record<string, unknown>,
      judgeOptions?: { isStillCurrent?: () => boolean },
    ): Promise<JudgeSubmissionResult<TOutcome>> => {
      if (!classId || !ready || resettingRef.current) return { status: "stale" };
      const ctx = contextSeq.current;
      const ticket = ++judgeSeq.current;
      const expectedGeneration = projectGenerationRef.current;
      setSubmittingJudge(true);
      try {
        const outcome = await api.post<TOutcome>(`/api/classes/${classId}/labs/${labId}/judge`, {
          ...body,
          expectedGeneration,
        });
        const current =
          contextSeq.current === ctx &&
          judgeSeq.current === ticket &&
          projectGenerationRef.current === expectedGeneration &&
          !resettingRef.current &&
          (judgeOptions?.isStillCurrent?.() ?? true);
        if (!current) return { status: "stale" };
        return { status: "applied", outcome };
      } catch (error) {
        if (contextSeq.current !== ctx || judgeSeq.current !== ticket || resettingRef.current) {
          return { status: "stale" };
        }
        if (error instanceof ApiError && error.code === "stale-project-generation") {
          await fetchProject();
          if (contextSeq.current !== ctx || resettingRef.current) return { status: "stale" };
        }
        return { status: "error", error: describeApiError(error) };
      } finally {
        if (contextSeq.current === ctx && judgeSeq.current === ticket) {
          setSubmittingJudge(false);
        }
      }
    },
    [classId, labId, ready, fetchProject],
  );

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
    postJudge,
    invalidateJudge,
    submittingJudge,
    resetProject,
    resetting,
    resetError,
    projectGeneration,
    saveGeneration,
    staffControls,
  };
}

/**
 * One conflict reconcile step shared by every lab's `onConflict`/retry: the
 * refetch resolves with the payload (reconcile landed — swap the stage's
 * draft for the server's copy, or apply a cross-tab project reset already
 * handled in `fetchProject`) or `null` (superseded or offline — flag the
 * stage as sync-error and keep the local draft).
 */
export function reconcileConflictedStage<TDraft, TExtras>(options: {
  fetchProject: () => Promise<(LabProjectPayload<TDraft> & TExtras) | null>;
  stageIndex: number;
  onResolved: (stageIndex: number, project: LabProjectPayload<TDraft> & TExtras) => void;
  onSyncError: (stageIndex: number) => void;
}): void {
  void options.fetchProject().then((project) => {
    if (!project) options.onSyncError(options.stageIndex);
    else if (!resetHandledPayloads.has(project)) options.onResolved(options.stageIndex, project);
  });
}
