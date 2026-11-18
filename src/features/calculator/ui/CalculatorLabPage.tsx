import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
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
  // The current stage rides in the URL so a refresh reopens the same canvas
  // instead of dropping back to stage 1.
  const requestedStage = useMemo(() => {
    const value = Number(search.stage);
    return Number.isInteger(value) ? value : undefined;
  }, [search]);
  const [state, dispatch] = useReducer(transitionCalculatorLesson, undefined, () =>
    createCalculatorLessonState(1),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const graph = graphOf(state);
  const components = useMemo(() => componentMap(state), [state.unlockedSubmodules]);
  const stage = stageOf(state);
  const stageIndex = state.stageIndex;

  const { projectLoaded, loadError, fetchProject, resetting, saveGeneration, staffControls } =
    useLabProject<CircuitGraph, { unlockedSubmodules: ComponentDef[] }, CalculatorLessonAction>({
      classId,
      labId: "calculator",
      ready: status === "authenticated",
      staff: isStaff,
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
        stageIndex: meta?.isReset ? 1 : requestedStage,
        forceStage: isStaff,
        isReset: meta?.isReset,
      }),
      dispatch,
    });

  // Keep the URL in step with the stage the learner actually ended on — rail
  // clicks, coach jumps, and the load-project fallback all funnel here.
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

  // Live preview: evaluate with the pins' current toggle values.
  const preview = useMemo(() => evaluateGraph(graph, {}, components), [graph, components]);
  const coach = useCalculatorCoach(state, preview.pins, projectLoaded, dispatch);

  // Reconcile one conflicted stage against the server's copy — also used by
  // the explicit retry the sync-error state offers; a failed refetch flags
  // sync-error and keeps the local draft, never a fake "已载入最新进度".
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

  // Stages besides the one on screen whose drafts also wait on a save — a
  // component rename rewrites references across every stage's draft, and
  // those stages must autosave too, not only when the learner revisits them.
  const dirtyStages = useMemo(
    () =>
      Object.keys(state.saveStatusByStage)
        .map(Number)
        .filter(
          (s) => s !== state.stageIndex && statusForStage(state.saveStatusByStage, s) === "dirty",
        ),
    [state.saveStatusByStage, state.stageIndex],
  );

  useAutosaveDraft<CircuitGraph>({
    classId,
    labId: "calculator",
    // While the (new class's) project is loading the flags on screen still
    // belong to the previous context — nothing may schedule writes for it.
    saveStatus:
      projectLoaded && !resetting
        ? statusForStage(state.saveStatusByStage, state.stageIndex)
        : "idle",
    resetVersion: saveGeneration,
    stageIndex,
    dirtyStages,
    draftOf: (s) => graphOf(state, s),
    bodyFor: (index, draft) => ({
      stageIndex: index,
      graph: draft,
      // The component library rides the save only while the learner
      // actually changed it, CAS'd on its own revision — an unchanged
      // library's stale list can never clobber another device's write.
      // expectedComponentsRevision is merged in by the hook at send time.
      ...(state.componentsChanged ? { components: state.unlockedSubmodules } : {}),
    }),
    // A draft that names a component the library no longer holds — e.g. the
    // definition moved into the conflict backup after a reconcile — may not
    // write clean: the persisted graph would reference a definition the
    // server lacks. Hold the send until the learner restores the backup (or
    // rewires the node); the stage keeps its dirty flag meanwhile.
    holdSend: (_stage, draft) => {
      const known = new Set(state.unlockedSubmodules.map((component) => component.name));
      return draft.nodes.some(
        (node) => node.kind === "component" && node.name !== undefined && !known.has(node.name),
      );
    },
    deps: [graph, state.unlockedSubmodules, state.saveStatusByStage],
    expectedRevisionOf: (s) => state.draftRevisions[s] ?? 0,
    expectedComponentsRevisionOf: () => state.componentsRevision,
    // The library edit seq a send carried — echoed back through mark-saved
    // so only those edits are confirmed; edits after the send stay dirty.
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
    // The server dropped this write because a newer one already exists
    // elsewhere: refetch so local state reconciles to the winning draft,
    // then flag the conflict briefly on the stage.
    onConflict: (s) => reconcileConflict(s),
  });

  const onSubmit = useCallback(async () => {
    if (!classId) return;
    setSubmitting(true);
    try {
      const submission: CalculatorSubmission = {
        stageIndex,
        graph,
        components: state.unlockedSubmodules,
      };
      const result = await api.post<CalculatorJudgeResult>(
        `/api/classes/${classId}/labs/calculator/judge`,
        submission,
      );
      dispatch({
        type: "judge-result",
        // The stage this submission ran on — captured now, not whenever the
        // response lands, so a stage switch in between can never steal the
        // verdict or its pass.
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
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stageIndex, graph, state.unlockedSubmodules]);

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
        staffControls={staffControls}
        state={state}
        submitting={submitting}
      />
    </AppPageLayout>
  );
}
