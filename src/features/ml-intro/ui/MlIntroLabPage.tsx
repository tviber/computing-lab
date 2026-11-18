/**
 * Machine Learning Intro lab page: progressive 6-stage curriculum starting with a
 * 10-word intuition strategy game, then teaching text vectorization, linear scoring
 * + Sigmoid, loss + gradient descent, confusion-matrix tradeoffs, and generalization
 * against a server-side held-out test set.
 */

import { useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useReducer, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { isStaffRole, useAuth } from "../../../shared/auth";
import { SaveIndicator } from "../../../shared/lab/LabGate";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { StageRail } from "../../../shared/lab/StageRail";
import { labMetadata } from "../../../shared/lab/labMetadata";
import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { DismissibleAlert } from "../../../shared/ui/DismissibleAlert";
import { HintDisclosure } from "../../../shared/ui/HintDisclosure";
import type {
  EvaluateDraft,
  GeneralizeDraft,
  MlDraft,
  MlJudgeResult,
  MlProjectExtras,
  ScoreDraft,
  StrategyDraft,
  TokenizeDraft,
  TrainDraft,
} from "../domain/protocol.ts";
import { ML_STAGES, mlStageUnlocked, type MlStageDef } from "../domain/stages.ts";
import {
  createMlLessonState,
  draftOf,
  isStageUnlocked,
  stageOf,
  summaryForStage,
  transitionMlLesson,
  type MlLessonAction,
} from "../lesson/state.ts";
import { EvaluatePanel } from "./EvaluatePanel.tsx";
import { GeneralizePanel } from "./GeneralizePanel.tsx";
import { ScorePanel } from "./ScorePanel.tsx";
import { StrategyPanel } from "./StrategyPanel.tsx";
import { TokenizePanel } from "./TokenizePanel.tsx";
import { TrainPanel } from "./TrainPanel.tsx";
import "./mlIntro.css";

function StageBrief({ stage, passed }: { stage: MlStageDef; passed: boolean }) {
  return (
    <section className="stage-brief">
      <p className="ml-desc">{stage.description}</p>
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
        <div className="ml-hints-list">
          {stage.hints.map((hint, index) => (
            <HintDisclosure key={index}>{hint}</HintDisclosure>
          ))}
        </div>
      )}
    </section>
  );
}

function parseClassroomSearch(raw: unknown): { classroom: boolean; stage: number | null } {
  if (!raw || typeof raw !== "object") return { classroom: false, stage: null };
  const record = raw as Record<string, unknown>;
  const classroom = record.classroom === 1 || record.classroom === "1" || record.classroom === true;
  const rawStage = record.stage;
  const parsedStage =
    typeof rawStage === "number" || (typeof rawStage === "string" && rawStage.trim() !== "")
      ? Number(rawStage)
      : NaN;
  const stage =
    Number.isInteger(parsedStage) && parsedStage >= 1 && parsedStage <= ML_STAGES.length
      ? parsedStage
      : null;
  return { classroom, stage };
}

export function MlIntroLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/ml-intro" });
  const rawSearch = useSearch({ strict: false });
  const initialSearch = parseClassroomSearch(rawSearch);
  const { status, role } = useAuth();
  const isStaff = isStaffRole(role);
  const [state, dispatch] = useReducer(transitionMlLesson, undefined, () =>
    createMlLessonState(
      isStaff || initialSearch.classroom ? initialSearch.stage : null,
      initialSearch.classroom,
      isStaff,
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [judgedStage, setJudgedStage] = useState<number | null>(null);

  const stage = stageOf(state);

  const { projectLoaded, loadError, fetchProject, resetting, saveGeneration, staffControls } =
    useLabProject<MlDraft, MlProjectExtras, MlLessonAction>({
      classId,
      labId: "ml-intro",
      ready: status === "authenticated",
      staff: isStaff,
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
        staffMode: project.staffFreeNavigation ?? isStaff,
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

  useAutosaveDraft<MlDraft>({
    classId,
    labId: "ml-intro",
    saveStatus:
      projectLoaded && !resetting
        ? statusForStage(state.saveStatusByStage, state.stageIndex)
        : "idle",
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    resetVersion: saveGeneration,
    expectedRevisionOf: (s) => state.draftRevisions[s] ?? 0,
    onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
    onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
    onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
    onConflict: (s) => reconcileConflict(s),
  });

  const submitJudge = useCallback(
    async (stageIndex: number, draft: MlDraft) => {
      if (!classId) return;
      if (!isStaff && !mlStageUnlocked(state.passedStages, stageIndex)) {
        setSubmitError(
          "当前处于「课堂自由跳关」预览状态，可完整互动体验；如需正式提交过关记录，请先通过前面的关卡。",
        );
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        const outcome = await api.post<MlJudgeResult>(
          `/api/classes/${classId}/labs/ml-intro/judge`,
          { stageIndex, draft },
        );
        setJudgedStage(stageIndex);
        dispatch({ type: "judge-result", stageIndex, outcome });
      } catch (error) {
        setSubmitError(describeApiError(error));
      } finally {
        setSubmitting(false);
      }
    },
    [classId, isStaff, state.passedStages],
  );

  const passedStages = state.passedStages;
  const activeIndex = stage?.index ?? 1;
  const activePassed = passedStages.includes(activeIndex);
  const formalUnlocked = mlStageUnlocked(passedStages, activeIndex);
  const activeResult = summaryForStage(state, activeIndex, judgedStage);
  const hasNextStage = activeIndex < ML_STAGES.length;
  const selectStage = (stageIndex: number) => {
    setSubmitError(null);
    dispatch({ type: "select-stage", stageIndex });
  };
  const goNextStage = () => {
    if (hasNextStage) selectStage(activeIndex + 1);
  };

  return (
    <AppPageLayout
      className="ml-lab"
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
        title: stage?.title ?? labMetadata["ml-intro"].title,
      }}
    >
      <LabPageShell
        collapsedLabel={stage ? `第 ${stage.index} 关` : undefined}
        labId="ml-intro"
        rail={
          <div className="ml-rail-stack">
            <StageRail
              label={labMetadata["ml-intro"].title}
              onSelect={selectStage}
              passedStages={passedStages}
              stageIndex={state.stageIndex}
              stages={ML_STAGES}
              unlocked={(item) => isStageUnlocked(state, item.index)}
            />
            {!isStaff ? (
              <div className="ml-classroom-toggle-card">
                <button
                  aria-pressed={state.classroomMode}
                  className={`button ${state.classroomMode ? "button-primary" : "button-ghost"} ml-classroom-btn`}
                  onClick={() => {
                    setSubmitError(null);
                    dispatch({ type: "set-classroom-mode", enabled: !state.classroomMode });
                  }}
                  type="button"
                >
                  {state.classroomMode ? "课堂自由跳关：已开启" : "课堂模式：先看后面关卡"}
                </button>
                <p className="ml-muted-note">
                  {state.classroomMode
                    ? "可任意切换全部关卡演示与跟练；正式过关判定仍需按顺序完成前序关卡。"
                    : "上课时还没做完前面关卡？可开启自由跳关直接跟上课堂进度。"}
                </p>
              </div>
            ) : null}
          </div>
        }
        staffControls={staffControls}
      >
        <main aria-label="机器学习入门实验区" className="ml-workspace">
          {stage ? <StageBrief passed={activePassed} stage={stage} /> : null}

          {!isStaff && state.classroomMode && !formalUnlocked ? (
            <p className="ml-note-box ml-classroom-banner" role="note">
              当前为「课堂自由跳关」预览模式：第 {activeIndex}{" "}
              关的训练、画图与交互均可完整使用；如需提交正式过关记录，请先通过前面的关卡。
            </p>
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

          {projectLoaded && stage?.index === 5 ? (
            <EvaluatePanel
              draft={draftOf(state, 5) as EvaluateDraft}
              hasNextStage={hasNextStage}
              onChange={(draft) => dispatch({ type: "update-stage5", draft })}
              onNextStage={goNextStage}
              onSubmit={() => void submitJudge(5, draftOf(state, 5))}
              passed={activePassed}
              result={activeResult}
              stage={stage}
              submitting={submitting}
            />
          ) : null}

          {projectLoaded && stage?.index === 6 ? (
            <GeneralizePanel
              draft={draftOf(state, 6) as GeneralizeDraft}
              hasNextStage={hasNextStage}
              onChange={(draft) => dispatch({ type: "update-stage6", draft })}
              onNextStage={goNextStage}
              onSubmit={() => void submitJudge(6, draftOf(state, 6))}
              passed={activePassed}
              result={activeResult}
              stage={stage}
              submitting={submitting}
            />
          ) : null}
        </main>
      </LabPageShell>
    </AppPageLayout>
  );
}
