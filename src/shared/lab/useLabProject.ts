import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, describeApiError, type LabProjectPayload } from "../api/client";
import type { LabResetControlsProps, LabResetScope } from "./LabPageShell";
import type { FlushPreservedDrafts } from "./useAutosaveDraft";

export type JudgeSubmissionResult<TOutcome> =
  | { status: "applied"; outcome: TOutcome }
  | { status: "stale" }
  | { status: "error"; error: string };

const resetHandledPayloads = new WeakSet<object>();
const resetSupersededFetches = new WeakSet<Promise<unknown>>();

export function useLabProject<TDraft, TExtras, TAction>(options: {
  classId: string | undefined;
  labId: string;
  ready: boolean;
  stageIndex: number;
  stageAffectedByReset?: (fromStage: number, stageIndex: number) => boolean;
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
  resetProject: (scope: LabResetScope) => Promise<boolean>;
  resetting: boolean;
  resetError: string | null;
  projectGeneration: number;
  saveGeneration: number;
  resetControls: LabResetControlsProps;
  flushPreservedDrafts: { current: FlushPreservedDrafts | null };
} {
  const { classId, labId, ready, stageIndex, stageAffectedByReset, toAction, dispatch } = options;
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [submittingJudge, setSubmittingJudge] = useState(false);
  const [projectGeneration, setProjectGeneration] = useState(0);
  const [saveGeneration, setSaveGeneration] = useState(0);

  const requestSeq = useRef(0);
  const resetSeq = useRef(0);
  const contextSeq = useRef(0);
  const judgeSeq = useRef(0);
  const projectGenerationRef = useRef(0);
  const resettingRef = useRef(false);
  const postingReset = useRef(false);
  const resetCallbackRef = useRef(options.onResetSuccess);
  const toActionRef = useRef(toAction);
  const flushPreservedDrafts = useRef<FlushPreservedDrafts | null>(null);

  useEffect(() => {
    resetCallbackRef.current = options.onResetSuccess;
    toActionRef.current = toAction;
  });

  useEffect(() => {
    if (!classId || !ready) return;
    const ticket = ++requestSeq.current;
    const ctx = contextSeq.current;
    const resetTicket = resetSeq.current;
    resettingRef.current = false;
    postingReset.current = false;
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
        if (
          requestSeq.current !== ticket ||
          contextSeq.current !== ctx ||
          resetSeq.current !== resetTicket ||
          resettingRef.current
        ) {
          return;
        }
        const gen = project.projectGeneration ?? 0;
        projectGenerationRef.current = gen;
        setProjectGeneration(gen);
        dispatch(toAction(project, { isReset: false }));
        setProjectLoaded(true);
      })
      .catch((error) => {
        if (
          requestSeq.current !== ticket ||
          contextSeq.current !== ctx ||
          resetSeq.current !== resetTicket
        ) {
          return;
        }
        setLoadError(describeApiError(error));
        setProjectLoaded(true);
      });
    return () => {
      requestSeq.current += 1;
      resetSeq.current += 1;
      contextSeq.current += 1;
      judgeSeq.current += 1;
      resettingRef.current = false;
      postingReset.current = false;
    };
  }, [classId, labId, ready]);

  const fetchProject = useCallback((): Promise<(LabProjectPayload<TDraft> & TExtras) | null> => {
    if (!classId || !ready) return Promise.resolve(null);
    const ticket = ++requestSeq.current;
    const ctx = contextSeq.current;
    const resetAtStart = resetSeq.current;
    const genAtStart = projectGenerationRef.current;
    const startedDuringReset = resettingRef.current;
    const pending: Promise<(LabProjectPayload<TDraft> & TExtras) | null> = api
      .get<LabProjectPayload<TDraft> & TExtras>(`/api/classes/${classId}/labs/${labId}/project`)
      .then((project) => {
        if (
          contextSeq.current !== ctx ||
          resetSeq.current !== resetAtStart ||
          postingReset.current
        ) {
          resetSupersededFetches.add(pending);
          return null;
        }
        const nextGen = project.projectGeneration ?? 0;
        if (nextGen < projectGenerationRef.current) {
          resetSupersededFetches.add(pending);
          return null;
        }
        if (startedDuringReset && nextGen > genAtStart) return null;
        if (requestSeq.current !== ticket) return null;
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
        if (contextSeq.current !== ctx || resetSeq.current !== resetAtStart) {
          resetSupersededFetches.add(pending);
        }
        return null;
      });
    return pending;
  }, [classId, labId, ready, dispatch]);

  const invalidateJudge = useCallback(() => {
    judgeSeq.current += 1;
    setSubmittingJudge(false);
  }, []);

  const resetProject = useCallback(
    async (scope: LabResetScope): Promise<boolean> => {
      if (!classId || !ready || resettingRef.current) return false;
      const ctx = contextSeq.current;
      const resetTicket = ++resetSeq.current;
      // Invalidate pre-reset GET fetches and pre-reset judge calls without letting
      // subsequent fetchProject() calls cancel this reset's lifecycle.
      requestSeq.current += 1;
      judgeSeq.current += 1;
      setSubmittingJudge(false);
      resettingRef.current = true;
      setResetting(true);
      setResetError(null);
      try {
        const expectedGeneration = projectGenerationRef.current;
        if (scope.scope === "stage" && flushPreservedDrafts.current) {
          const preservesStage = (stage: number) =>
            !(stageAffectedByReset?.(scope.stageIndex, stage) ?? stage >= scope.stageIndex);
          const saved = await flushPreservedDrafts.current(preservesStage);
          if (contextSeq.current !== ctx || resetSeq.current !== resetTicket) return false;
          if (!saved) {
            setResetError("保留关卡的草稿尚未保存。请先解决保存问题，再重试。");
            return false;
          }
        }
        postingReset.current = true;
        const fresh = await api.post<LabProjectPayload<TDraft> & TExtras>(
          `/api/classes/${classId}/labs/${labId}/reset`,
          { ...scope, expectedGeneration },
        );
        if (contextSeq.current !== ctx || resetSeq.current !== resetTicket) return false;
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
        if (contextSeq.current === ctx && resetSeq.current === resetTicket) {
          setResetError(describeApiError(error));
        }
        return false;
      } finally {
        if (contextSeq.current === ctx && resetSeq.current === resetTicket) {
          resettingRef.current = false;
          postingReset.current = false;
          setResetting(false);
        }
      }
    },
    [classId, labId, ready, dispatch, stageAffectedByReset],
  );

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
          const synced = await fetchProject();
          if (
            contextSeq.current !== ctx ||
            judgeSeq.current !== ticket ||
            resettingRef.current ||
            synced
          ) {
            return { status: "stale" };
          }
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
    flushPreservedDrafts,
    resetControls: {
      stageIndex,
      canReset: Boolean(classId && ready && projectLoaded && !loadError),
      resetting,
      resetError,
      onReset: resetProject,
    },
  };
}

export function reconcileConflictedStage<TDraft, TExtras>(options: {
  fetchProject: () => Promise<(LabProjectPayload<TDraft> & TExtras) | null>;
  stageIndex: number;
  onResolved: (stageIndex: number, project: LabProjectPayload<TDraft> & TExtras) => void;
  onSyncError: (stageIndex: number) => void;
}): void {
  const pending = options.fetchProject();
  void pending.then((project) => {
    if (resetSupersededFetches.has(pending)) return;
    if (!project) options.onSyncError(options.stageIndex);
    else if (!resetHandledPayloads.has(project)) options.onResolved(options.stageIndex, project);
  });
}
