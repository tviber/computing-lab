/**
 * Lunch-shift lab page: stage rail plus four stage panels — 订单旅程,
 * 修接单, 修排队, 正式挑战. Same wiring as the other labs: project load →
 * autosaved drafts → server judge. The Pyodide worker is warmed as soon as
 * the project loads so the stage-2 run doesn't wait on the download.
 */

import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { StageRail } from "../../../shared/lab/StageRail";
import { useLabCatalog } from "../../../shared/lab/labs";
import { labMetadata } from "../../../shared/lab/labMetadata";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { DismissibleAlert } from "../../../shared/ui/DismissibleAlert";
import { HintDisclosure } from "../../../shared/ui/HintDisclosure";
import type {
  FinalDraft,
  IntakeDraft,
  LunchDraft,
  LunchJudgeResult,
  LunchProjectExtras,
  LunchProjectPayload,
  QueueDraft,
  TrainingDraft,
} from "../domain/protocol.ts";
import { LUNCH_STAGES, lunchStageUnlocked, type LunchStageDef } from "../domain/stages.ts";
import {
  createLunchLessonState,
  draftOf,
  stageOf,
  transitionLunchLesson,
  type LunchLessonAction,
} from "../lesson/state.ts";
import { FinalPanel } from "./FinalPanel.tsx";
import { IntakePanel } from "./IntakePanel.tsx";
import { QueuePanel } from "./QueuePanel.tsx";
import { TrainingPanel } from "./TrainingPanel.tsx";
import { warmPyodide } from "./pyodideRunner.ts";
import "./lunchShift.css";

function StageBrief({ stage, passed }: { stage: LunchStageDef; passed: boolean }) {
  return (
    <section className="stage-brief">
      <p className="lunch-task">
        <strong>任务：</strong>
        {stage.task}
      </p>
      {passed ? (
        <>
          <p className="submit-note">判题方式：{stage.judgeNote}</p>
          <p className="stage-takeaway">本关收获：{stage.takeaway}</p>
        </>
      ) : null}
      {passed
        ? null
        : stage.hints?.map((hint, index) => <HintDisclosure key={index}>{hint}</HintDisclosure>)}
    </section>
  );
}

export function LunchShiftLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/lunch-shift" });
  const { status, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const [state, dispatch] = useReducer(transitionLunchLesson, undefined, () =>
    createLunchLessonState(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Which stage the latest judge outcome belongs to — the outcome itself
  // carries no stageIndex.
  const [judgedStage, setJudgedStage] = useState<number | null>(null);

  const stage = stageOf(state);

  const { projectLoaded, loadError, fetchProject } = useLabProject<
    LunchDraft,
    LunchProjectExtras,
    LunchLessonAction
  >({
    classId,
    labId: "lunch-shift",
    ready: status === "authenticated",
    toAction: (project: LunchProjectPayload) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      draftRevisions: project.draftRevisions,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
      runSummaries: project.runSummaries,
      training: project.training,
    }),
    dispatch,
  });

  // Warm the Python worker while the student is still on 订单旅程.
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
    classId,
    labId: "lunch-shift",
    saveStatus: projectLoaded ? statusForStage(state.saveStatusByStage, state.stageIndex) : "idle",
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    expectedRevisionOf: (s) => state.draftRevisions[s] ?? 0,
    onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
    onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
    onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
    onConflict: (s) => reconcileConflict(s),
  });

  const submitJudge = useCallback(
    async (stageIndex: number, draft: LunchDraft) => {
      if (!classId) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const outcome = await api.post<LunchJudgeResult>(
          `/api/classes/${classId}/labs/lunch-shift/judge`,
          { stageIndex, draft },
        );
        setJudgedStage(stageIndex);
        dispatch({ type: "judge-result", outcome });
      } catch (error) {
        setSubmitError(describeApiError(error));
      } finally {
        setSubmitting(false);
      }
    },
    [classId],
  );

  const passedStages = state.passedStages;
  const outcomeForStage = (index: number) => (judgedStage === index ? state.judgeOutcome : null);
  const summaryFor = (index: number, key: "intake" | "queue" | "final") => {
    const outcome = outcomeForStage(index);
    if (outcome) return outcome.testSummary;
    return state.runSummaries[key];
  };
  const finalResult = summaryFor(4, "final");
  const finalSubmitted = passedStages.includes(4) || finalResult !== null;

  return (
    <LabAccessGate
      classId={classId}
      closed={catalog?.get("lunch-shift")?.visible === false}
      labName={labMetadata["lunch-shift"].title}
      role={role}
      status={status}
    >
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
          title: stage?.title ?? labMetadata["lunch-shift"].title,
        }}
      >
        <LabPageShell
          collapsedLabel={stage ? `第 ${stage.index} 关` : undefined}
          labId="lunch-shift"
          rail={
            <StageRail
              label={labMetadata["lunch-shift"].title}
              onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
              passedStages={passedStages}
              stageIndex={state.stageIndex}
              stages={LUNCH_STAGES}
              unlocked={(s) => lunchStageUnlocked(passedStages, s.index)}
            />
          }
        >
          <main aria-label="设计餐馆系统实验区" className="lunch-workspace">
            {stage ? (
              <StageBrief stage={stage} passed={passedStages.includes(stage.index)} />
            ) : null}

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
              <IntakePanel
                draft={draftOf(state, 2) as IntakeDraft}
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
              <FinalPanel
                draft={draftOf(state, 4) as FinalDraft}
                onChange={(draft) => dispatch({ type: "update-final", draft })}
                onSubmit={() => void submitJudge(4, draftOf(state, 4))}
                result={finalResult}
                submitted={finalSubmitted}
                submitting={submitting}
              />
            ) : null}
          </main>
        </LabPageShell>
      </AppPageLayout>
    </LabAccessGate>
  );
}
