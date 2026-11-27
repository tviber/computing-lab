import { useLabRuntime } from "./runtime";
import { createEffect, createMemo, createSignal, untrack } from "solid-js";
import { LabRuntimeError, describeRuntimeError, type LabProjectPayload } from "./contracts";
import type { LabResetControlsProps, LabResetScope } from "./LabPageShell";
import type { FlushPreservedDrafts } from "./useAutosaveDraft";

export type JudgeSubmissionResult<TOutcome> =
  | { status: "applied"; outcome: TOutcome }
  | { status: "stale" }
  | { status: "error"; error: string };

const resetHandledPayloads = new WeakSet<object>();
const resetSupersededFetches = new WeakSet<Promise<unknown>>();

export type UseLabProjectOptions<TDraft, TExtras, TAction> = {
  scopeId: string | undefined;
  labId: string;
  ready: boolean;
  stageIndex: number;
  stageAffectedByReset?: (fromStage: number, stageIndex: number) => boolean;
  onResetSuccess?: () => void;
  toAction: (project: LabProjectPayload<TDraft> & TExtras, meta?: { isReset?: boolean }) => TAction;
  dispatch: (action: TAction) => void;
};

export function useLabProject<TDraft, TExtras, TAction>(
  getOptions: () => UseLabProjectOptions<TDraft, TExtras, TAction>,
): {
  readonly projectLoaded: boolean;
  readonly loadError: string | null;
  fetchProject: () => Promise<(LabProjectPayload<TDraft> & TExtras) | null>;
  postJudge: <TOutcome>(
    body: Record<string, unknown>,
    options?: { isStillCurrent?: () => boolean },
  ) => Promise<JudgeSubmissionResult<TOutcome>>;
  invalidateJudge: () => void;
  readonly submittingJudge: boolean;
  resetProject: (scope: LabResetScope) => Promise<boolean>;
  readonly resetting: boolean;
  readonly resetError: string | null;
  readonly projectGeneration: number;
  readonly saveGeneration: number;
  readonly resetControls: LabResetControlsProps;
  flushPreservedDrafts: { current: FlushPreservedDrafts | null };
} {
  const { transport } = useLabRuntime();
  const [projectLoaded, setProjectLoaded] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [resetting, setResetting] = createSignal(false);
  const [resetError, setResetError] = createSignal<string | null>(null);
  const [submittingJudge, setSubmittingJudge] = createSignal(false);
  const [projectGeneration, setProjectGeneration] = createSignal(0);
  const [saveGeneration, setSaveGeneration] = createSignal(0);

  let requestSeq = 0;
  let resetSeq = 0;
  let contextSeq = 0;
  let judgeSeq = 0;
  let projectGenerationRef = 0;
  let resettingRef = false;
  let postingReset = false;
  const flushPreservedDrafts: { current: FlushPreservedDrafts | null } = { current: null };

  const latestOptions = () => untrack(getOptions);

  const loadKey = createMemo(() => {
    const opts = getOptions();
    return `${opts.ready ? 1 : 0}\0${opts.labId}\0${opts.scopeId ?? ""}`;
  });

  createEffect(loadKey, () => {
    const { scopeId, labId, ready } = latestOptions();
    if (!scopeId || !ready) return;
    const ticket = ++requestSeq;
    const ctx = contextSeq;
    const resetTicket = resetSeq;
    resettingRef = false;
    postingReset = false;
    judgeSeq += 1;
    projectGenerationRef = 0;
    setProjectGeneration(0);
    setSubmittingJudge(false);
    setProjectLoaded(false);
    setLoadError(null);
    setResetting(false);
    setResetError(null);
    void transport
      .load<LabProjectPayload<TDraft> & TExtras>(scopeId, labId)
      .then((project) => {
        if (
          requestSeq !== ticket ||
          contextSeq !== ctx ||
          resetSeq !== resetTicket ||
          resettingRef
        ) {
          return;
        }
        const gen = project.projectGeneration ?? 0;
        projectGenerationRef = gen;
        setProjectGeneration(gen);
        const opts = latestOptions();
        opts.dispatch(opts.toAction(project, { isReset: false }));
        setProjectLoaded(true);
      })
      .catch((error) => {
        if (requestSeq !== ticket || contextSeq !== ctx || resetSeq !== resetTicket) {
          return;
        }
        setLoadError(describeRuntimeError(error));
        setProjectLoaded(true);
      });
    return () => {
      requestSeq += 1;
      resetSeq += 1;
      contextSeq += 1;
      judgeSeq += 1;
      resettingRef = false;
      postingReset = false;
    };
  });

  const fetchProject = (): Promise<(LabProjectPayload<TDraft> & TExtras) | null> => {
    const opts = latestOptions();
    if (!opts.scopeId || !opts.ready) return Promise.resolve(null);
    const ticket = ++requestSeq;
    const ctx = contextSeq;
    const resetAtStart = resetSeq;
    const genAtStart = projectGenerationRef;
    const startedDuringReset = resettingRef;
    const pending: Promise<(LabProjectPayload<TDraft> & TExtras) | null> = transport
      .load<LabProjectPayload<TDraft> & TExtras>(opts.scopeId, opts.labId)
      .then((project) => {
        if (contextSeq !== ctx || resetSeq !== resetAtStart || postingReset) {
          resetSupersededFetches.add(pending);
          return null;
        }
        const nextGen = project.projectGeneration ?? 0;
        if (nextGen < projectGenerationRef) {
          resetSupersededFetches.add(pending);
          return null;
        }
        if (startedDuringReset && nextGen > genAtStart) return null;
        if (requestSeq !== ticket) return null;
        if (nextGen > projectGenerationRef) {
          projectGenerationRef = nextGen;
          setProjectGeneration(nextGen);
          judgeSeq += 1;
          setSubmittingJudge(false);
          setSaveGeneration((g) => g + 1);
          const currentOpts = latestOptions();
          currentOpts.dispatch(currentOpts.toAction(project, { isReset: true }));
          currentOpts.onResetSuccess?.();
          resetHandledPayloads.add(project);
        }
        setProjectLoaded(true);
        setLoadError(null);
        return project;
      })
      .catch(() => {
        if (contextSeq !== ctx || resetSeq !== resetAtStart) {
          resetSupersededFetches.add(pending);
        }
        return null;
      });
    return pending;
  };

  const invalidateJudge = () => {
    judgeSeq += 1;
    setSubmittingJudge(false);
  };

  const resetProject = async (scope: LabResetScope): Promise<boolean> => {
    const opts = latestOptions();
    if (!opts.scopeId || !opts.ready || resettingRef) return false;
    const ctx = contextSeq;
    const resetTicket = ++resetSeq;
    requestSeq += 1;
    judgeSeq += 1;
    setSubmittingJudge(false);
    resettingRef = true;
    setResetting(true);
    setResetError(null);
    try {
      const expectedGeneration = projectGenerationRef;
      if (scope.scope === "stage" && flushPreservedDrafts.current) {
        const preservesStage = (stage: number) =>
          !(opts.stageAffectedByReset?.(scope.stageIndex, stage) ?? stage >= scope.stageIndex);
        const saved = await flushPreservedDrafts.current(preservesStage);
        if (contextSeq !== ctx || resetSeq !== resetTicket) return false;
        if (!saved) {
          setResetError("保留关卡的草稿尚未保存。请先解决保存问题，再重试。");
          return false;
        }
      }
      postingReset = true;
      const fresh = await transport.reset<LabProjectPayload<TDraft> & TExtras>(
        opts.scopeId,
        opts.labId,
        { ...scope, expectedGeneration },
      );
      if (contextSeq !== ctx || resetSeq !== resetTicket) return false;
      const nextGen = fresh.projectGeneration ?? projectGenerationRef + 1;
      projectGenerationRef = nextGen;
      setProjectGeneration(nextGen);
      setSaveGeneration((g) => g + 1);
      const currentOpts = latestOptions();
      currentOpts.dispatch(currentOpts.toAction(fresh, { isReset: true }));
      currentOpts.onResetSuccess?.();
      setProjectLoaded(true);
      setLoadError(null);
      return true;
    } catch (error) {
      if (contextSeq === ctx && resetSeq === resetTicket) {
        setResetError(describeRuntimeError(error));
      }
      return false;
    } finally {
      if (contextSeq === ctx && resetSeq === resetTicket) {
        resettingRef = false;
        postingReset = false;
        setResetting(false);
      }
    }
  };

  const postJudge = async <TOutcome>(
    body: Record<string, unknown>,
    judgeOptions?: { isStillCurrent?: () => boolean },
  ): Promise<JudgeSubmissionResult<TOutcome>> => {
    const opts = latestOptions();
    if (!opts.scopeId || !opts.ready || resettingRef) return { status: "stale" };
    const ctx = contextSeq;
    const ticket = ++judgeSeq;
    const expectedGeneration = projectGenerationRef;
    setSubmittingJudge(true);
    try {
      const outcome = await transport.judge<TOutcome>(opts.scopeId, opts.labId, {
        ...body,
        expectedGeneration,
      });
      const current =
        contextSeq === ctx &&
        judgeSeq === ticket &&
        projectGenerationRef === expectedGeneration &&
        !resettingRef &&
        (judgeOptions?.isStillCurrent?.() ?? true);
      if (!current) return { status: "stale" };
      return { status: "applied", outcome };
    } catch (error) {
      if (contextSeq !== ctx || judgeSeq !== ticket || resettingRef) {
        return { status: "stale" };
      }
      if (error instanceof LabRuntimeError && error.code === "stale-project-generation") {
        const synced = await fetchProject();
        if (contextSeq !== ctx || judgeSeq !== ticket || resettingRef || synced) {
          return { status: "stale" };
        }
      }
      return { status: "error", error: describeRuntimeError(error) };
    } finally {
      if (contextSeq === ctx && judgeSeq === ticket) {
        setSubmittingJudge(false);
      }
    }
  };

  const resetControls: LabResetControlsProps = {
    get stageIndex() {
      return getOptions().stageIndex;
    },
    get canReset() {
      const opts = getOptions();
      return Boolean(opts.scopeId && opts.ready && projectLoaded() && !loadError());
    },
    get resetting() {
      return resetting();
    },
    get resetError() {
      return resetError();
    },
    onReset: resetProject,
  };

  return {
    get projectLoaded() {
      return projectLoaded();
    },
    get loadError() {
      return loadError();
    },
    fetchProject,
    postJudge,
    invalidateJudge,
    get submittingJudge() {
      return submittingJudge();
    },
    resetProject,
    get resetting() {
      return resetting();
    },
    get resetError() {
      return resetError();
    },
    get projectGeneration() {
      return projectGeneration();
    },
    get saveGeneration() {
      return saveGeneration();
    },
    flushPreservedDrafts,
    resetControls,
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
