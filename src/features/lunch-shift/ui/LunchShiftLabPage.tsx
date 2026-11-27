import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";
import { useLabRuntime } from "../../../shared/lab/runtime";
import { createReducer } from "../../../shared/lab/createReducer";
import { SaveIndicator } from "../../../shared/lab/SaveIndicator";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { labMetadata, labStageTitle } from "../../../shared/lab/labMetadata";
import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
import { StageLink } from "../../../shared/lab/StageRail";
import { StageTask } from "../../../shared/lab/StageTask";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { DismissibleAlert } from "../../../shared/ui/DismissibleAlert";
import { HintDisclosure } from "../../../shared/ui/HintDisclosure";
import type {
  AiDraft,
  AiIntakeDraft,
  CompensateDraft,
  LunchDraft,
  LunchJudgeResult,
  LunchProjectExtras,
  LunchProjectPayload,
  QueueDraft,
  TrainingDraft,
} from "../domain/protocol.ts";
import { INTAKE_SCENARIO } from "../domain/scenarios.ts";
import { LUNCH_STAGES, lunchStageAffectedByReset, type LunchStageDef } from "../domain/stages.ts";
import {
  createLunchLessonState,
  draftOf,
  isStageUnlocked,
  stageOf,
  transitionLunchLesson,
  type LunchLessonAction,
} from "../lesson/state.ts";
import { AiIntakePanel } from "./AiIntakePanel.tsx";
import { CompensatePanel } from "./CompensatePanel.tsx";
import { warmPyodide } from "./pyodideRunner.ts";
import { QueuePanel } from "./QueuePanel.tsx";
import { TrainingPanel } from "./TrainingPanel.tsx";
import "./lunchShift.css";

const MAIN_STAGES = LUNCH_STAGES.filter((s) => s.index !== 5);

function StageBrief(props: { stage: LunchStageDef; passed: boolean }) {
  return (
    <section class="stage-brief">
      <StageTask>{props.stage.task}</StageTask>
      <Show when={props.passed}>
        <p class="submit-note">判题方式：{props.stage.judgeNote}</p>
        <p class="stage-takeaway">本关收获：{props.stage.takeaway}</p>
      </Show>
      <Show when={!props.passed}>
        <Show keyed when={props.stage.id}>
          {(_) => (
            <For each={props.stage.hints ?? []}>
              {(hint) => <HintDisclosure>{hint}</HintDisclosure>}
            </For>
          )}
        </Show>
      </Show>
    </section>
  );
}

export function LunchShiftLabPage() {
  const runtime = useLabRuntime();
  const isStaff = () => runtime.freeNavigation;
  const [state, dispatch] = createReducer(
    transitionLunchLesson,
    createLunchLessonState(
      1,
      untrack(() => isStaff()),
    ),
  );
  const [submitError, setSubmitError] = createSignal<string | null>(null);
  const [judgedStage, setJudgedStage] = createSignal<number | null>(null);

  const stage = createMemo(() => stageOf(state()));

  const project = useLabProject<LunchDraft, LunchProjectExtras, LunchLessonAction>(() => ({
    scopeId: runtime.scopeId,
    labId: "lunch-shift",
    ready: runtime.ready,
    stageIndex: state().stageIndex,
    stageAffectedByReset: lunchStageAffectedByReset,
    onResetSuccess: () => {
      setSubmitError(null);
      setJudgedStage(null);
    },
    toAction: (proj: LunchProjectPayload, meta) => ({
      type: "load-project",
      currentStage: proj.currentStage,
      passedStages: proj.passedStages,
      draftRevisions: proj.draftRevisions,
      drafts: Object.fromEntries(
        Object.entries(proj.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
      runSummaries: proj.runSummaries,
      training: proj.training,
      aiOrders: proj.aiOrders,
      freeNavigation: proj.staffFreeNavigation ?? isStaff(),
      isReset: meta?.isReset,
    }),
    dispatch,
  }));

  createEffect(
    () => project.projectLoaded,
    (loaded) => {
      if (loaded) warmPyodide();
    },
  );

  const reconcileConflict = (s: number) =>
    reconcileConflictedStage({
      fetchProject: project.fetchProject,
      stageIndex: s,
      onResolved: (stageIndex, proj) =>
        dispatch({
          type: "resolve-save-conflict",
          stageIndex,
          draft: proj.drafts?.[stageIndex],
          revision: proj.draftRevisions?.[stageIndex],
        }),
      onSyncError: (stageIndex) => dispatch({ type: "mark-save-sync-error", stageIndex }),
    });

  useAutosaveDraft<LunchDraft>(() => {
    const currentState = state();
    return {
      flushPreservedDrafts: project.flushPreservedDrafts,
      saveStatuses: project.projectLoaded ? currentState.saveStatusByStage : undefined,
      scopeId: runtime.scopeId,
      labId: "lunch-shift",
      saveStatus:
        project.projectLoaded && !project.resetting
          ? statusForStage(currentState.saveStatusByStage, currentState.stageIndex)
          : "idle",
      stageIndex: currentState.stageIndex,
      draftOf: (index) => draftOf(state(), index),
      deps: [currentState.drafts],
      expectedGeneration: project.projectGeneration,
      resetVersion: project.saveGeneration,
      expectedRevisionOf: (s) => state().draftRevisions[s] ?? 0,
      onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
      onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
      onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
      onConflict: (s) => reconcileConflict(s),
    };
  });

  const submitJudge = async (stageIndex: number, draft: LunchDraft) => {
    if (!runtime.scopeId) return;
    setSubmitError(null);
    const response = await project.postJudge<LunchJudgeResult>({ stageIndex, draft });
    if (response.status === "applied") {
      setJudgedStage(stageIndex);
      dispatch({ type: "judge-result", outcome: response.outcome });
    } else if (response.status === "error") {
      setSubmitError(response.error);
    }
  };
  const submitting = () => project.submittingJudge || project.resetting;

  const passedStages = () => state().passedStages;
  const outcomeForStage = (index: number) =>
    judgedStage() === index ? state().judgeOutcome : null;
  const summaryFor = (index: number, key: "intake" | "queue" | "final" | "compensate") => {
    const outcome = outcomeForStage(index);
    if (outcome) return outcome.testSummary;
    return state().runSummaries[key];
  };

  return (
    <AppPageLayout
      class="lunch-lab"
      topbar={
        <SaveIndicator
          onDiscardLocal={
            state().conflictedLocalDrafts[state().stageIndex] !== undefined
              ? () => dispatch({ type: "discard-conflict-draft", stageIndex: state().stageIndex })
              : undefined
          }
          onRestoreLocal={
            state().conflictedLocalDrafts[state().stageIndex] !== undefined
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
      }
      topbarProps={{
        title: labStageTitle("lunch-shift", stage()?.title),
      }}
    >
      <LabPageShell
        collapsedLabel={stage() ? `第 ${stage()!.index} 关` : undefined}
        labId="lunch-shift"
        rail={
          <aside aria-label="关卡进度" class="lab-rail">
            <p class="eyebrow">{labMetadata["lunch-shift"].title}</p>
            <ol>
              <For each={MAIN_STAGES}>
                {(item) => (
                  <>
                    <li>
                      <StageLink
                        active={item.index === state().stageIndex}
                        onSelect={() => dispatch({ type: "select-stage", stageIndex: item.index })}
                        passed={passedStages().includes(item.index)}
                        title={item.title}
                        unlocked={isStageUnlocked(state(), item.index)}
                      />
                    </li>
                    <Show when={item.index === 3}>
                      <li>
                        <details class="lab-stage-bonus" open={state().stageIndex === 5}>
                          <summary>附加挑战（选做）</summary>
                          <StageLink
                            active={state().stageIndex === 5}
                            onSelect={() => dispatch({ type: "select-stage", stageIndex: 5 })}
                            optional
                            passed={passedStages().includes(5)}
                            title="补偿超时单"
                            unlocked={isStageUnlocked(state(), 5)}
                          />
                        </details>
                      </li>
                    </Show>
                  </>
                )}
              </For>
            </ol>
          </aside>
        }
        resetControls={project.resetControls}
      >
        <Show keyed when={String(project.saveGeneration)}>
          {(_) => (
            <main aria-label="设计餐馆系统实验区" class="lunch-workspace">
              <Show when={stage()}>
                {(current) => (
                  <StageBrief passed={passedStages().includes(current().index)} stage={current()} />
                )}
              </Show>

              <Show when={state().message}>
                {(msg) => (
                  <DismissibleAlert onDismiss={() => dispatch({ type: "dismiss-message" })}>
                    {msg()}
                  </DismissibleAlert>
                )}
              </Show>
              <Show when={project.loadError ?? submitError()}>
                {(err) => (
                  <p class="test-error" role="alert">
                    {err()}
                  </p>
                )}
              </Show>

              <Show when={!project.projectLoaded && !project.loadError}>
                <p class="home-loading" role="status">
                  正在载入…
                </p>
              </Show>

              <Show when={project.projectLoaded && stage()?.index === 1}>
                <TrainingPanel
                  draft={draftOf(state(), 1) as TrainingDraft}
                  onChange={(draft) => dispatch({ type: "update-training", draft })}
                  onSubmit={() => void submitJudge(1, draftOf(state(), 1))}
                  passed={passedStages().includes(1)}
                  submitting={submitting()}
                  training={state().training}
                />
              </Show>

              <Show when={project.projectLoaded && stage()?.index === 2}>
                <AiIntakePanel
                  draft={draftOf(state(), 2) as AiIntakeDraft}
                  onChange={(draft) => dispatch({ type: "update-intake", draft })}
                  onSubmit={() => void submitJudge(2, draftOf(state(), 2))}
                  orders={INTAKE_SCENARIO.orders}
                  result={summaryFor(2, "intake")}
                  submitting={submitting()}
                  variant="practice"
                />
              </Show>

              <Show when={project.projectLoaded && stage()?.index === 3}>
                <QueuePanel
                  draft={draftOf(state(), 3) as QueueDraft}
                  onChange={(draft) => dispatch({ type: "update-queue", draft })}
                  onSubmit={() => void submitJudge(3, draftOf(state(), 3))}
                  passed={passedStages().includes(3)}
                  result={summaryFor(3, "queue")}
                  submitting={submitting()}
                />
              </Show>

              <Show when={project.projectLoaded && stage()?.index === 4}>
                <AiIntakePanel
                  draft={draftOf(state(), 4) as AiDraft}
                  onChange={(draft) => dispatch({ type: "update-final", draft })}
                  onSubmit={() => void submitJudge(4, draftOf(state(), 4))}
                  orders={state().aiOrders ?? []}
                  result={summaryFor(4, "final")}
                  submitting={submitting()}
                  variant="final"
                />
              </Show>

              <Show when={project.projectLoaded && stage()?.index === 5}>
                <CompensatePanel
                  draft={draftOf(state(), 5) as CompensateDraft}
                  onChange={(draft) => dispatch({ type: "update-compensate", draft })}
                  onSubmit={() => void submitJudge(5, draftOf(state(), 5))}
                  result={summaryFor(5, "compensate")}
                  submitted={passedStages().includes(5)}
                  submitting={submitting()}
                />
              </Show>
            </main>
          )}
        </Show>
      </LabPageShell>
    </AppPageLayout>
  );
}
