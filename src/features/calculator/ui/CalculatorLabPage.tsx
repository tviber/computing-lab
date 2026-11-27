import { useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, Show, untrack } from "solid-js";
import { useLabRuntime } from "../../../shared/lab/runtime";
import { createReducer } from "../../../shared/lab/createReducer";
import { SaveIndicator } from "../../../shared/lab/SaveIndicator";
import { labStageTitle } from "../../../shared/lab/labMetadata";
import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import type { CircuitGraph } from "../domain/graph";
import type {
  CalculatorJudgeResult,
  CalculatorProjectPayload,
  CalculatorSubmission,
} from "../domain/protocol";
import { calculatorStageAffectedByReset } from "../domain/stages";
import {
  createCalculatorLessonState,
  graphOf,
  stageOf,
  transitionCalculatorLesson,
  type CalculatorLessonAction,
} from "../lesson/state";
import { CalculatorLabWorkspace } from "./CalculatorLabWorkspace";
import { AnnotatedText } from "./CalculatorTerms";
import { FullAdderGuide } from "./FullAdderGuide";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function CalculatorLabPage() {
  const runtime = useLabRuntime();
  return (
    <Show keyed when={runtime.learnerId}>
      {(_) => <CalculatorProjectPage />}
    </Show>
  );
}

function CalculatorProjectPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const runtime = useLabRuntime();
  const isStaff = createMemo(() => runtime.freeNavigation);
  const requestedStage = createMemo(() => {
    const raw = firstParam(searchParams.stage);
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isInteger(value) ? value : undefined;
  });

  const [state, dispatch] = createReducer(
    transitionCalculatorLesson,
    createCalculatorLessonState(1),
  );
  const [submitError, setSubmitError] = createSignal<string | null>(null);

  const graph = createMemo(() => graphOf(state()));
  const stage = createMemo(() => stageOf(state()));
  const stageIndex = createMemo(() => state().stageIndex);

  const project = useLabProject<CircuitGraph, CalculatorProjectPayload, CalculatorLessonAction>(
    () => ({
      scopeId: runtime.scopeId,
      labId: "calculator",
      ready: runtime.ready,
      stageIndex: state().stageIndex,
      stageAffectedByReset: calculatorStageAffectedByReset,
      onResetSuccess: () => setSubmitError(null),
      toAction: (loaded, meta) => ({
        type: "load-project",
        currentStage: loaded.currentStage,
        passedStages: loaded.passedStages,
        guideAcknowledged: loaded.fullAdderGuideAcknowledged,
        draftNotice: loaded.draftNotices?.join(" "),
        unlockedSubmodules: loaded.unlockedSubmodules,
        draftRevisions: loaded.draftRevisions,
        componentsRevision: loaded.draftRevisions?.components ?? 0,
        drafts: Object.fromEntries(
          Object.entries(loaded.drafts ?? {}).map(([key, value]) => [Number(key), value]),
        ),
        stageIndex: meta?.isReset ? loaded.currentStage : untrack(requestedStage),
        forceStage: untrack(isStaff),
        isReset: meta?.isReset,
      }),
      dispatch,
    }),
  );

  const urlSyncKey = createMemo(() => {
    if (!project.projectLoaded || !runtime.scopeId) return "";
    const current = state().stageIndex;
    if ((requestedStage() ?? 1) === current) return "";
    return String(current);
  });

  createEffect(urlSyncKey, (key) => {
    if (!key) return;
    const current = untrack(() => state().stageIndex);
    setSearchParams({ stage: current === 1 ? undefined : String(current) }, { replace: true });
  });

  const reconcileConflict = (s: number) =>
    reconcileConflictedStage<CircuitGraph, CalculatorProjectPayload>({
      fetchProject: project.fetchProject,
      stageIndex: s,
      onResolved: (resolvedStageIndex, loaded) =>
        dispatch({
          type: "resolve-save-conflict",
          stageIndex: resolvedStageIndex,
          draft: loaded.drafts?.[resolvedStageIndex],
          revision: loaded.draftRevisions?.[resolvedStageIndex],
          unlockedSubmodules: loaded.unlockedSubmodules,
          componentsRevision: loaded.draftRevisions?.components,
        }),
      onSyncError: (failedStageIndex) =>
        dispatch({ type: "mark-save-sync-error", stageIndex: failedStageIndex }),
    });

  useAutosaveDraft<CircuitGraph>(() => {
    const current = state();
    const currentGraph = graph();
    return {
      scopeId: runtime.scopeId,
      labId: "calculator",
      saveStatus:
        project.projectLoaded && !project.resetting
          ? statusForStage(current.saveStatusByStage, current.stageIndex)
          : "idle",
      expectedGeneration: project.projectGeneration,
      resetVersion: project.saveGeneration,
      stageIndex: current.stageIndex,
      saveStatuses: project.projectLoaded ? current.saveStatusByStage : undefined,
      flushPreservedDrafts: project.flushPreservedDrafts,
      draftOf: (s) => graphOf(current, s),
      bodyFor: (index, draft) => ({
        stageIndex: index,
        graph: draft,
        ...(current.componentsChanged ? { components: current.unlockedSubmodules } : {}),
      }),
      holdSend: (_stage, draft) => {
        const known = new Set(current.unlockedSubmodules.map((component) => component.name));
        return draft.nodes.some(
          (node) => node.kind === "component" && node.name !== undefined && !known.has(node.name),
        );
      },
      deps: [currentGraph, current.unlockedSubmodules, current.saveStatusByStage],
      expectedRevisionOf: (s) => current.draftRevisions[s] ?? 0,
      expectedComponentsRevisionOf: () => current.componentsRevision,
      componentsSeqOf: () => current.componentsEditSeq,
      onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
      onSaved: (s, revision, componentsRevision, componentsSeq) =>
        dispatch({
          type: "mark-saved",
          stageIndex: s,
          revision,
          componentsRevision,
          componentsSeq,
        }),
      onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
      onConflict: (s) => reconcileConflict(s),
    };
  });

  const onSubmit = async () => {
    if (!runtime.scopeId) return;
    setSubmitError(null);
    const currentStageIndex = stageIndex();
    const submission: CalculatorSubmission = {
      stageIndex: currentStageIndex,
      graph: graph(),
      components: state().unlockedSubmodules,
    };
    const response = await project.postJudge<CalculatorJudgeResult>(submission);
    if (response.status === "applied") {
      const result = response.outcome;
      dispatch({
        type: "judge-result",
        stageIndex: currentStageIndex,
        outcome: {
          score: result.score,
          total: result.total,
          passed: result.passed,
          categories: result.testSummary.categories,
          counterexample: result.testSummary.counterexample,
          passedStages: result.passedStages,
          error: result.testSummary.error,
          unlockedComponent: result.unlockedComponent,
          unlockedSubmodules: result.unlockedSubmodules,
          componentsRevision: result.componentsRevision,
        },
      });
    } else if (response.status === "error") {
      setSubmitError(response.error);
    }
  };

  const showFullAdderGuide = createMemo(() => {
    const current = state();
    return Boolean(
      project.projectLoaded &&
      runtime.scopeId &&
      stage()?.id === "full-adder" &&
      current.passedStages.includes(2) &&
      !current.guideAcknowledged &&
      current.unlockedSubmodules.some(
        (component) => component.name === "HalfAdder" && !component.custom,
      ),
    );
  });

  const hasConflictBackup = createMemo(() => {
    const current = state();
    return (
      current.conflictedLocalDrafts[current.stageIndex] !== undefined ||
      current.conflictedComponents !== null
    );
  });

  return (
    <AppPageLayout
      class="calculator-lab"
      footer={
        <Show when={showFullAdderGuide() ? runtime.scopeId : undefined}>
          {(cid) => (
            <FullAdderGuide
              scopeId={cid()}
              onAcknowledged={() => dispatch({ type: "acknowledge-full-adder-guide" })}
            />
          )}
        </Show>
      }
      topbar={
        <div class="calculator-status">
          <SaveIndicator
            onDiscardLocal={
              hasConflictBackup()
                ? () => dispatch({ type: "discard-conflict-draft", stageIndex: state().stageIndex })
                : undefined
            }
            onRestoreLocal={
              hasConflictBackup()
                ? () => dispatch({ type: "restore-conflict-draft", stageIndex: state().stageIndex })
                : undefined
            }
            onRetrySync={() => reconcileConflict(state().stageIndex)}
            status={statusForStage(state().saveStatusByStage, state().stageIndex)}
            unresolvedSyncConflict={syncConflictForStage(
              state().unresolvedSyncConflicts,
              state().stageIndex,
            )}
          />
        </div>
      }
      topbarProps={{
        subtitle: stage() ? <AnnotatedText text={stage()!.englishTitle} /> : undefined,
        title: labStageTitle("calculator", stage()?.title),
      }}
    >
      <CalculatorLabWorkspace
        dispatch={dispatch}
        error={project.loadError ?? submitError()}
        freeNavigation={isStaff()}
        onSubmit={() => void onSubmit()}
        resetControls={project.resetControls}
        state={state()}
        submitting={project.submittingJudge || project.resetting}
      />
    </AppPageLayout>
  );
}
