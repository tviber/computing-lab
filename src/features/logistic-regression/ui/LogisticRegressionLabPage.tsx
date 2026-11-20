import { useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useReducer, useState } from "react";
import { useAuth } from "../../../shared/auth";
import { SaveIndicator } from "../../../shared/lab/LabGate";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { StageRail } from "../../../shared/lab/StageRail";
import { labMetadata, labStageTitle } from "../../../shared/lab/labMetadata";
import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { DismissibleAlert } from "../../../shared/ui/DismissibleAlert";
import { HintDisclosure } from "../../../shared/ui/HintDisclosure";
import type {
  ExperienceSubmission,
  LogisticRegressionDraft,
  LogisticRegressionJudgeResult,
  LogisticRegressionProjectExtras,
  ScoreDraft,
  StrategyDraft,
  TokenizeDraft,
  TrainDraft,
} from "../domain/protocol.ts";
import {
  LOGISTIC_REGRESSION_STAGES,
  logisticRegressionStageUnlocked,
  type LogisticRegressionStageDef,
} from "../domain/stages.ts";
import {
  createLogisticRegressionLessonState,
  draftOf,
  isStageUnlocked,
  stageOf,
  summaryForStage,
  transitionLogisticRegressionLesson,
  type LogisticRegressionLessonAction,
} from "../lesson/state.ts";
import { ExperiencePanel } from "./ExperiencePanel.tsx";
import { ScorePanel } from "./ScorePanel.tsx";
import { StrategyPanel } from "./StrategyPanel.tsx";
import { TokenizePanel } from "./TokenizePanel.tsx";
import { TrainPanel } from "./TrainPanel.tsx";
import "./logisticRegression.css";

function StageBrief({ stage, passed }: { stage: LogisticRegressionStageDef; passed: boolean }) {
  return (
    <section className="stage-brief">
      <p className="logistic-regression-desc">{stage.description}</p>
      <p className="stage-task">
        <strong>任务：</strong>
        {stage.task}
      </p>
      {passed ? (
        <>
          <p className="submit-note">判题方式：{stage.judgeNote}</p>
          <p className="stage-takeaway">本关收获：{stage.takeaway}</p>
        </>
      ) : (
        <div className="logistic-regression-hints-list">
          {stage.hints.map((hint, index) => (
            <HintDisclosure key={index}>{hint}</HintDisclosure>
          ))}
        </div>
      )}
    </section>
  );
}

function parseRequestedStage(raw: unknown): number | null {
  const rawStage = (raw as { stage?: unknown } | null)?.stage;
  const parsedStage =
    typeof rawStage === "number" || (typeof rawStage === "string" && rawStage.trim() !== "")
      ? Number(rawStage)
      : NaN;
  return Number.isInteger(parsedStage) && parsedStage >= 1 && parsedStage <= 6
    ? Math.min(parsedStage, LOGISTIC_REGRESSION_STAGES.length)
    : null;
}

export function LogisticRegressionLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/logistic-regression" });
  const rawSearch = useSearch({ strict: false });
  const { status } = useAuth();
  const [state, dispatch] = useReducer(transitionLogisticRegressionLesson, undefined, () =>
    createLogisticRegressionLessonState(parseRequestedStage(rawSearch)),
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
  } = useLabProject<
    LogisticRegressionDraft,
    LogisticRegressionProjectExtras,
    LogisticRegressionLessonAction
  >({
    classId,
    labId: "logistic-regression",
    ready: status === "authenticated",
    stageIndex: state.stageIndex,
    onResetSuccess: () => {
      setSubmitError(null);
      setJudgedStage(null);
    },
    toAction: (project, meta) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      draftRevisions: project.draftRevisions,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([k, v]) => [Number(k), v]),
      ),
      runSummaries: project.runSummaries,
      trainedSettings: project.trainedSettings,
      isReset: meta?.isReset,
    }),
    dispatch,
  });

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

  useAutosaveDraft<LogisticRegressionDraft>({
    flushPreservedDrafts,
    saveStatuses: projectLoaded ? state.saveStatusByStage : undefined,
    classId,
    labId: "logistic-regression",
    saveStatus:
      projectLoaded && !resetting
        ? statusForStage(state.saveStatusByStage, state.stageIndex)
        : "idle",
    stageIndex: state.stageIndex,
    draftOf: (index) => (index === 5 ? undefined : draftOf(state, index)),
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
    async (stageIndex: number, draft: LogisticRegressionDraft | ExperienceSubmission) => {
      if (!classId || !logisticRegressionStageUnlocked(state.passedStages, stageIndex)) return;
      setSubmitError(null);
      const response = await postJudge<LogisticRegressionJudgeResult>({ stageIndex, draft });
      if (response.status === "applied") {
        setJudgedStage(stageIndex);
        dispatch({ type: "judge-result", stageIndex, outcome: response.outcome });
      } else if (response.status === "error") {
        setSubmitError(response.error);
      }
    },
    [classId, state.passedStages, postJudge],
  );
  const submitting = submittingJudge || resetting;

  const passedStages = state.passedStages;
  const activeIndex = stage?.index ?? 1;
  const activePassed = passedStages.includes(activeIndex);
  const activeResult = summaryForStage(state, activeIndex, judgedStage);
  const hasNextStage = activeIndex < LOGISTIC_REGRESSION_STAGES.length;
  const selectStage = (stageIndex: number) => {
    setSubmitError(null);
    dispatch({ type: "select-stage", stageIndex });
  };
  const goNextStage = () => {
    if (hasNextStage) selectStage(activeIndex + 1);
  };

  return (
    <AppPageLayout
      className="logistic-regression-lab"
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
        title: labStageTitle("logistic-regression", stage?.title),
      }}
    >
      <LabPageShell
        collapsedLabel={stage ? `第 ${stage.index} 关` : undefined}
        labId="logistic-regression"
        rail={
          <StageRail
            label={labMetadata["logistic-regression"].title}
            onSelect={selectStage}
            passedStages={passedStages}
            stageIndex={state.stageIndex}
            stages={LOGISTIC_REGRESSION_STAGES}
            unlocked={(item) => isStageUnlocked(state, item.index)}
          />
        }
        resetControls={resetControls}
      >
        <main
          aria-label="逻辑回归实验区"
          className="logistic-regression-workspace"
          key={saveGeneration}
        >
          {stage && stage.id !== "experience" ? (
            <StageBrief passed={activePassed} stage={stage} />
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
            <StrategyPanel
              draft={draftOf(state, 1) as StrategyDraft}
              hasNextStage={hasNextStage}
              onChange={(draft) => dispatch({ type: "update-stage1", draft })}
              onNextStage={goNextStage}
              onSubmit={() => void submitJudge(1, draftOf(state, 1))}
              passed={activePassed}
              result={activeResult}
              stage={stage}
              submitting={submitting}
            />
          ) : null}

          {projectLoaded && stage?.index === 2 ? (
            <TokenizePanel
              draft={draftOf(state, 2) as TokenizeDraft}
              hasNextStage={hasNextStage}
              onChange={(draft) => dispatch({ type: "update-stage2", draft })}
              onNextStage={goNextStage}
              onSubmit={() => void submitJudge(2, draftOf(state, 2))}
              passed={activePassed}
              result={activeResult}
              stage={stage}
              submitting={submitting}
            />
          ) : null}

          {projectLoaded && stage?.index === 3 ? (
            <ScorePanel
              draft={draftOf(state, 3) as ScoreDraft}
              hasNextStage={hasNextStage}
              onChange={(draft) => dispatch({ type: "update-stage3", draft })}
              onNextStage={goNextStage}
              onSubmit={() => void submitJudge(3, draftOf(state, 3))}
              passed={activePassed}
              result={activeResult}
              stage={stage}
              submitting={submitting}
            />
          ) : null}

          {projectLoaded && stage?.index === 4 ? (
            <TrainPanel
              draft={draftOf(state, 4) as TrainDraft}
              hasNextStage={hasNextStage}
              onChange={(draft) => dispatch({ type: "update-stage4", draft })}
              onNextStage={goNextStage}
              onSubmit={() => void submitJudge(4, draftOf(state, 4))}
              passed={activePassed}
              result={activeResult}
              stage={stage}
              submitting={submitting}
            />
          ) : null}

          {projectLoaded && stage?.id === "experience" ? (
            <ExperiencePanel
              key={`${classId}:${projectGeneration}:${state.trainedSettings?.eta}:${state.trainedSettings?.epochs}`}
              training={state.trainedSettings ?? (draftOf(state, 4) as TrainDraft)}
              hasSubmittedModel={state.trainedSettings !== undefined}
              onComplete={(submission) => void submitJudge(5, submission)}
              onReviewTraining={() => selectStage(4)}
              passed={activePassed}
              submitting={submitting}
            />
          ) : null}
        </main>
      </LabPageShell>
    </AppPageLayout>
  );
}
