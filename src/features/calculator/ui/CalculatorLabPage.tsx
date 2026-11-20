import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { isStaffRole, useAuth } from "../../../shared/auth";
import { SaveIndicator } from "../../../shared/lab/LabGate";
import { labMetadata } from "../../../shared/lab/labMetadata";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { evaluateGraph } from "../domain/evaluate";
import type { CircuitGraph, ComponentDef } from "../domain/graph";
import type { CalculatorJudgeResult, CalculatorSubmission } from "../domain/protocol";
import { calculatorStageAffectedByReset } from "../domain/stages";
import {
  componentMap,
  createCalculatorLessonState,
  graphOf,
  stageOf,
  transitionCalculatorLesson,
  type CalculatorLessonAction,
} from "../lesson/state";
import { CalculatorLabWorkspace } from "./CalculatorLabWorkspace";
import { useCalculatorCoach } from "./CoachCard";
import { AnnotatedText } from "./CalculatorTerms";

export function CalculatorLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/calculator" });
  const search = useSearch({ from: "/classes/$classId/labs/calculator" });
  const navigate = useNavigate();
  const { status, role } = useAuth();
  const isStaff = isStaffRole(role);
  const requestedStage = useMemo(() => {
    const value = Number(search.stage);
    return Number.isInteger(value) ? value : undefined;
  }, [search]);
  const [state, dispatch] = useReducer(transitionCalculatorLesson, undefined, () =>
    createCalculatorLessonState(1),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const graph = graphOf(state);
  const components = useMemo(() => componentMap(state), [state.unlockedSubmodules]);
  const stage = stageOf(state);
  const stageIndex = state.stageIndex;

  const {
    projectLoaded,
    loadError,
    fetchProject,
    postJudge,
    submittingJudge,
    projectGeneration,
    resetting,
    saveGeneration,
    resetControls,
    flushPreservedDrafts,
  } = useLabProject<CircuitGraph, { unlockedSubmodules: ComponentDef[] }, CalculatorLessonAction>({
    classId,
    labId: "calculator",
    ready: status === "authenticated",
    stageIndex: state.stageIndex,
    stageAffectedByReset: calculatorStageAffectedByReset,
    onResetSuccess: () => setSubmitError(null),
    toAction: (project, meta) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      unlockedSubmodules: project.unlockedSubmodules,
      draftRevisions: project.draftRevisions,
      componentsRevision: project.draftRevisions?.components ?? 0,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
      stageIndex: meta?.isReset ? project.currentStage : requestedStage,
      forceStage: isStaff,
      isReset: meta?.isReset,
    }),
    dispatch,
  });

  useEffect(() => {
    if (!projectLoaded) return;
    if ((requestedStage ?? 1) === state.stageIndex) return;
    void navigate({
      to: "/classes/$classId/labs/calculator",
      params: { classId: classId as string },
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        stage: state.stageIndex === 1 ? undefined : state.stageIndex,
      }),
      replace: true,
    });
  }, [classId, navigate, projectLoaded, requestedStage, state.stageIndex]);

  const preview = useMemo(() => evaluateGraph(graph, {}, components), [graph, components]);
  const coach = useCalculatorCoach(state, preview.pins, projectLoaded, dispatch);

  const reconcileConflict = (s: number) =>
    reconcileConflictedStage<CircuitGraph, { unlockedSubmodules: ComponentDef[] }>({
      fetchProject,
      stageIndex: s,
      onResolved: (stageIndex, project) =>
        dispatch({
          type: "resolve-save-conflict",
          stageIndex,
          draft: project.drafts?.[stageIndex],
          revision: project.draftRevisions?.[stageIndex],
          unlockedSubmodules: project.unlockedSubmodules,
          componentsRevision: project.draftRevisions?.components,
        }),
      onSyncError: (stageIndex) => dispatch({ type: "mark-save-sync-error", stageIndex }),
    });

  useAutosaveDraft<CircuitGraph>({
    classId,
    labId: "calculator",
    saveStatus:
      projectLoaded && !resetting
        ? statusForStage(state.saveStatusByStage, state.stageIndex)
        : "idle",
    expectedGeneration: projectGeneration,
    resetVersion: saveGeneration,
    stageIndex,
    saveStatuses: projectLoaded ? state.saveStatusByStage : undefined,
    flushPreservedDrafts,
    draftOf: (s) => graphOf(state, s),
    bodyFor: (index, draft) => ({
      stageIndex: index,
      graph: draft,
      ...(state.componentsChanged ? { components: state.unlockedSubmodules } : {}),
    }),
    holdSend: (_stage, draft) => {
      const known = new Set(state.unlockedSubmodules.map((component) => component.name));
      return draft.nodes.some(
        (node) => node.kind === "component" && node.name !== undefined && !known.has(node.name),
      );
    },
    deps: [graph, state.unlockedSubmodules, state.saveStatusByStage],
    expectedRevisionOf: (s) => state.draftRevisions[s] ?? 0,
    expectedComponentsRevisionOf: () => state.componentsRevision,
    componentsSeqOf: () => state.componentsEditSeq,
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
  });

  const onSubmit = useCallback(async () => {
    if (!classId) return;
    setSubmitError(null);
    const submission: CalculatorSubmission = {
      stageIndex,
      graph,
      components: state.unlockedSubmodules,
    };
    const response = await postJudge<CalculatorJudgeResult>(submission);
    if (response.status === "applied") {
      const result = response.outcome;
      dispatch({
        type: "judge-result",
        stageIndex,
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
  }, [classId, stageIndex, graph, state.unlockedSubmodules, postJudge]);

  return (
    <AppPageLayout
      className="calculator-lab"
      topbar={
        <div className="calculator-status">
          <SaveIndicator
            status={statusForStage(state.saveStatusByStage, state.stageIndex)}
            unresolvedSyncConflict={syncConflictForStage(
              state.unresolvedSyncConflicts,
              state.stageIndex,
            )}
            onRetrySync={() => reconcileConflict(state.stageIndex)}
            onRestoreLocal={
              state.conflictedLocalDrafts[state.stageIndex] !== undefined ||
              state.conflictedComponents !== null
                ? () => dispatch({ type: "restore-conflict-draft", stageIndex: state.stageIndex })
                : undefined
            }
            onDiscardLocal={
              state.conflictedLocalDrafts[state.stageIndex] !== undefined ||
              state.conflictedComponents !== null
                ? () => dispatch({ type: "discard-conflict-draft", stageIndex: state.stageIndex })
                : undefined
            }
          />
        </div>
      }
      topbarProps={{
        subtitle: stage ? <AnnotatedText text={stage.englishTitle} /> : undefined,
        title: stage?.title ?? labMetadata.calculator.title,
      }}
    >
      <CalculatorLabWorkspace
        coach={coach}
        dispatch={dispatch}
        error={loadError ?? submitError}
        freeNavigation={isStaff}
        onSubmit={() => void onSubmit()}
        projectLoaded={projectLoaded}
        resetControls={resetControls}
        state={state}
        submitting={submittingJudge || resetting}
      />
    </AppPageLayout>
  );
}
