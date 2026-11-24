import { useParams } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useReducer, useState } from "react";
import { isStaffRole, useAuth } from "../../../shared/auth";
import { SaveIndicator } from "../../../shared/lab/LabGate";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { StageTask } from "../../../shared/lab/StageTask";
import { StageLink } from "../../../shared/lab/StageRail";
import { labMetadata, labStageTitle } from "../../../shared/lab/labMetadata";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { DismissibleAlert } from "../../../shared/ui/DismissibleAlert";
import { HintDisclosure } from "../../../shared/ui/HintDisclosure";
import type {
  AiDraft,
  AiIntakeDraft,
  LunchDraft,
  LunchJudgeResult,
  LunchProjectExtras,
  LunchProjectPayload,
  CompensateDraft,
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
import { QueuePanel } from "./QueuePanel.tsx";
import { TrainingPanel } from "./TrainingPanel.tsx";
import { warmPyodide } from "./pyodideRunner.ts";
import "./lunchShift.css";

function StageBrief({ stage, passed }: { stage: LunchStageDef; passed: boolean }) {
  return (
    <section className="stage-brief">
      <StageTask>{stage.task}</StageTask>
      {passed ? (
        <>
          <p className="submit-note">判题方式：{stage.judgeNote}</p>
          <p className="stage-takeaway">本关收获：{stage.takeaway}</p>
        </>
      ) : null}
      {passed
        ? null
        : stage.hints?.map((hint, index) => (
            <HintDisclosure key={`${stage.id}-${index}`}>{hint}</HintDisclosure>
          ))}
    </section>
  );
}

export function LunchShiftLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/lunch-shift" });
  const { status, role } = useAuth();
  const isStaff = isStaffRole(role);
  const [state, dispatch] = useReducer(transitionLunchLesson, undefined, () =>
    createLunchLessonState(1, isStaff),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [judgedStage, setJudgedStage] = useState<number | null>(null);

  const stage = stageOf(state);

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
  } = useLabProject<LunchDraft, LunchProjectExtras, LunchLessonAction>({
    classId,
    labId: "lunch-shift",
    ready: status === "authenticated",
    stageIndex: state.stageIndex,
    stageAffectedByReset: lunchStageAffectedByReset,
    onResetSuccess: () => {
      setSubmitError(null);
      setJudgedStage(null);
    },
    toAction: (project: LunchProjectPayload, meta) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      draftRevisions: project.draftRevisions,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
      runSummaries: project.runSummaries,
      training: project.training,
      aiOrders: project.aiOrders,
      freeNavigation: project.staffFreeNavigation ?? isStaff,
      isReset: meta?.isReset,
    }),
    dispatch,
  });

  useEffect(() => {
    if (projectLoaded) warmPyodide();
  }, [projectLoaded]);

  const reconcileConflict = (s: number) =>
    reconcileConflictedStage({
      fetchProject,
      stageIndex: s,
      onResolved: (stageIndex, project) =>
        dispatch({
          type: "resolve-save-conflict",
          stageIndex,
          draft: project.drafts?.[stageIndex],
          revision: project.draftRevisions?.[stageIndex],
        }),
      onSyncError: (stageIndex) => dispatch({ type: "mark-save-sync-error", stageIndex }),
    });

  useAutosaveDraft<LunchDraft>({
    flushPreservedDrafts,
    saveStatuses: projectLoaded ? state.saveStatusByStage : undefined,
    classId,
    labId: "lunch-shift",
    saveStatus:
      projectLoaded && !resetting
        ? statusForStage(state.saveStatusByStage, state.stageIndex)
        : "idle",
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    expectedGeneration: projectGeneration,
    resetVersion: saveGeneration,
    expectedRevisionOf: (s) => state.draftRevisions[s] ?? 0,
    onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
    onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
    onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
    onConflict: (s) => reconcileConflict(s),
  });

  const submitJudge = useCallback(
    async (stageIndex: number, draft: LunchDraft) => {
      if (!classId) return;
      setSubmitError(null);
      const response = await postJudge<LunchJudgeResult>({ stageIndex, draft });
      if (response.status === "applied") {
        setJudgedStage(stageIndex);
        dispatch({ type: "judge-result", outcome: response.outcome });
      } else if (response.status === "error") {
        setSubmitError(response.error);
      }
    },
    [classId, postJudge],
  );
  const submitting = submittingJudge || resetting;

  const passedStages = state.passedStages;
  const outcomeForStage = (index: number) => (judgedStage === index ? state.judgeOutcome : null);
  const summaryFor = (index: number, key: "intake" | "queue" | "final" | "compensate") => {
    const outcome = outcomeForStage(index);
    if (outcome) return outcome.testSummary;
    return state.runSummaries[key];
  };
  const finalResult = summaryFor(4, "final");

  return (
    <AppPageLayout
      className="lunch-lab"
      topbar={
        <SaveIndicator
          status={statusForStage(state.saveStatusByStage, state.stageIndex)}
          unresolvedSyncConflict={syncConflictForStage(
            state.unresolvedSyncConflicts,
            state.stageIndex,
          )}
          onRetrySync={() => reconcileConflict(state.stageIndex)}
          onRestoreLocal={
            state.conflictedLocalDrafts[state.stageIndex] !== undefined
              ? () => dispatch({ type: "restore-conflict-draft", stageIndex: state.stageIndex })
              : undefined
          }
          onDiscardLocal={
            state.conflictedLocalDrafts[state.stageIndex] !== undefined
              ? () => dispatch({ type: "discard-conflict-draft", stageIndex: state.stageIndex })
              : undefined
          }
        />
      }
      topbarProps={{
        title: labStageTitle("lunch-shift", stage?.title),
      }}
    >
      <LabPageShell
        collapsedLabel={stage ? `第 ${stage.index} 关` : undefined}
        labId="lunch-shift"
        rail={
          <aside aria-label="关卡进度" className="lab-rail">
            <p className="eyebrow">{labMetadata["lunch-shift"].title}</p>
            <ol>
              {LUNCH_STAGES.filter((s) => s.index !== 5).map((stage) => (
                <Fragment key={stage.id}>
                  <li>
                    <StageLink
                      active={stage.index === state.stageIndex}
                      onSelect={() => dispatch({ type: "select-stage", stageIndex: stage.index })}
                      passed={passedStages.includes(stage.index)}
                      title={stage.title}
                      unlocked={isStageUnlocked(state, stage.index)}
                    />
                  </li>
                  {stage.index === 3 ? (
                    <li>
                      <details className="lab-stage-bonus" open={state.stageIndex === 5}>
                        <summary>附加挑战（选做）</summary>
                        <StageLink
                          active={state.stageIndex === 5}
                          onSelect={() => dispatch({ type: "select-stage", stageIndex: 5 })}
                          optional
                          passed={passedStages.includes(5)}
                          title="补偿超时单"
                          unlocked={isStageUnlocked(state, 5)}
                        />
                      </details>
                    </li>
                  ) : null}
                </Fragment>
              ))}
            </ol>
          </aside>
        }
        resetControls={resetControls}
      >
        <main aria-label="设计餐馆系统实验区" className="lunch-workspace" key={saveGeneration}>
          {stage ? <StageBrief stage={stage} passed={passedStages.includes(stage.index)} /> : null}

          {state.message ? (
            <DismissibleAlert onDismiss={() => dispatch({ type: "dismiss-message" })}>
              {state.message}
            </DismissibleAlert>
          ) : null}
          {(loadError ?? submitError) ? (
            <p className="test-error" role="alert">
              {loadError ?? submitError}
            </p>
          ) : null}

          {!projectLoaded && !loadError ? (
            <p className="home-loading" role="status">
              正在载入…
            </p>
          ) : null}

          {projectLoaded && stage?.index === 1 ? (
            <TrainingPanel
              draft={draftOf(state, 1) as TrainingDraft}
              training={state.training}
              onChange={(draft) => dispatch({ type: "update-training", draft })}
              onSubmit={() => void submitJudge(1, draftOf(state, 1))}
              passed={passedStages.includes(1)}
              submitting={submitting}
            />
          ) : null}

          {projectLoaded && stage?.index === 2 ? (
            <AiIntakePanel
              variant="practice"
              draft={draftOf(state, 2) as AiIntakeDraft}
              orders={INTAKE_SCENARIO.orders}
              onChange={(draft) => dispatch({ type: "update-intake", draft })}
              onSubmit={() => void submitJudge(2, draftOf(state, 2))}
              result={summaryFor(2, "intake")}
              submitting={submitting}
            />
          ) : null}

          {projectLoaded && stage?.index === 3 ? (
            <QueuePanel
              draft={draftOf(state, 3) as QueueDraft}
              onChange={(draft) => dispatch({ type: "update-queue", draft })}
              onSubmit={() => void submitJudge(3, draftOf(state, 3))}
              result={summaryFor(3, "queue")}
              passed={passedStages.includes(3)}
              submitting={submitting}
            />
          ) : null}

          {projectLoaded && stage?.index === 4 ? (
            <AiIntakePanel
              variant="final"
              draft={draftOf(state, 4) as AiDraft}
              orders={state.aiOrders ?? []}
              onChange={(draft) => dispatch({ type: "update-final", draft })}
              onSubmit={() => void submitJudge(4, draftOf(state, 4))}
              result={finalResult}
              submitting={submitting}
            />
          ) : null}

          {projectLoaded && stage?.index === 5 ? (
            <CompensatePanel
              draft={draftOf(state, 5) as CompensateDraft}
              onChange={(draft) => dispatch({ type: "update-compensate", draft })}
              onSubmit={() => void submitJudge(5, draftOf(state, 5))}
              result={summaryFor(5, "compensate")}
              submitted={passedStages.includes(5)}
              submitting={submitting}
            />
          ) : null}
        </main>
      </LabPageShell>
    </AppPageLayout>
  );
}
