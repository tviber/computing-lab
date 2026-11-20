import { useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { isStaffRole, useAuth } from "../../../shared/auth";
import { SaveIndicator } from "../../../shared/lab/LabGate";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { labMetadata, labStageTitle } from "../../../shared/lab/labMetadata";
import { StageRail } from "../../../shared/lab/StageRail";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { Icon } from "../../../shared/ui/Icon";
import type { SamplingJudgeResult, SamplingSubmission } from "../domain/protocol.ts";
import { IMAGE_SAMPLING_STAGES, type SamplingStageDef } from "../domain/stages.ts";
import {
  createSamplingLessonState,
  draftOf,
  draftResolution,
  isStageUnlocked,
  stageOf,
  transitionSamplingLesson,
  type SamplingLessonAction,
  type StageDraft,
} from "../lesson/state.ts";
import {
  encodeSamplingScenario,
  parseSamplingScenario,
  samplingScenarioActions,
} from "../lesson/scenario.ts";
import { ChooseSizePanel } from "./ChooseSizePanel.tsx";
import { DownsampleExplorer } from "./DownsampleExplorer.tsx";
import { GuidedCellTask } from "./GuidedCellTask.tsx";
import { warmPyodide } from "./pyodideRunner.ts";
import { RecognitionPanel } from "./RecognitionPanel.tsx";
import "./imageSampling.css";

function StageBrief({ stage }: { stage: SamplingStageDef }) {
  const resolutionSource = stage.requiresChooseSize ? "choose_size(images) 算出的" : "你选的";
  const axisNote =
    stage.mode === "square"
      ? "本关只允许正方形（宽=高）。"
      : stage.mode === "tall"
        ? "本关要求高度大于宽度（高 > 宽）。"
        : "本关宽和高可以不同。";
  return (
    <section className="stage-brief">
      <p className="stage-mission">{stage.mission}</p>
      <p>{stage.description}</p>
      <p className="submit-note">
        判定方式：{resolutionSource} {stage.mode === "square" ? "n×n" : "宽×高"}
        会套用到完整图谱上（包括你没见过的隐藏成员）。接收端凭格子图认人——≥
        {Math.round(stage.requiredAccuracy * 100)}% 的成员仍能被认出才算通过，且格子数 ≤
        {stage.cellBudget}。
        {stage.requiresChooseSize
          ? `本关必须先写并运行 choose_size(images)，不能手动指定分辨率。${axisNote}`
          : axisNote}
      </p>
      <details className="stage-details">
        <summary>提示</summary>
        <p>{stage.hint}</p>
      </details>
    </section>
  );
}

export function ImageSamplingLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/image-sampling" });
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { status, role } = useAuth();
  const isStaff = isStaffRole(role);
  const [state, dispatch] = useReducer(transitionSamplingLesson, undefined, () =>
    createSamplingLessonState(1, isStaff),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const scenarioApplied = useRef(false);

  const stage = stageOf(state);
  const draft = draftOf(state);

  useEffect(() => warmPyodide(), []);

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
  } = useLabProject<StageDraft, Record<never, never>, SamplingLessonAction>({
    classId,
    labId: "image-sampling",
    ready: status === "authenticated",
    stageIndex: state.stageIndex,
    onResetSuccess: () => setSubmitError(null),
    toAction: (project, meta) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      draftRevisions: project.draftRevisions,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
      freeNavigation: project.staffFreeNavigation ?? isStaff,
      isReset: meta?.isReset,
    }),
    dispatch,
  });

  useEffect(() => {
    if (scenarioApplied.current || !projectLoaded) return;
    scenarioApplied.current = true;
    const scenario = parseSamplingScenario(search);
    const actions = samplingScenarioActions(state, scenario);
    actions.forEach((action) => dispatch(action));
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

  useAutosaveDraft<StageDraft>({
    flushPreservedDrafts,
    saveStatuses: projectLoaded ? state.saveStatusByStage : undefined,
    classId,
    labId: "image-sampling",
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

  const onSubmit = useCallback(async () => {
    if (!classId || !stage) return;
    const resolution = draftResolution(state, stage);
    if (stage.requiresChooseSize && !draft.code.trim()) {
      dispatch({ type: "message", text: "本关必须先填写并运行 choose_size(images)。" });
      return;
    }
    if (!resolution) {
      dispatch({
        type: "message",
        text: stage.requiresChooseSize
          ? "先运行 choose_size(images) 生成分辨率。"
          : "先选一个分辨率再提交。",
      });
      return;
    }
    setSubmitError(null);
    const submission: SamplingSubmission = {
      stageIndex: stage.index,
      width: resolution.width,
      height: resolution.height,
      code: draft.code || undefined,
    };
    const response = await postJudge<SamplingJudgeResult>(submission);
    if (response.status === "applied") {
      dispatch({ type: "judge-result", outcome: response.outcome });
    } else if (response.status === "error") {
      setSubmitError(response.error);
    }
  }, [classId, stage, state, draft.code, postJudge]);
  const submitting = submittingJudge || resetting;

  const resolution = stage ? draftResolution(state, stage) : null;
  const previewWidth = draft.width ?? 8;
  const previewHeight = stage?.mode === "square" ? previewWidth : (draft.height ?? 8);

  const shareSearch =
    stage && isStaffRole(role) && !stage.requiresChooseSize
      ? encodeSamplingScenario({
          stageIndex: stage.index,
          width: previewWidth,
          height: previewHeight,
        })
      : undefined;

  return (
    <AppPageLayout
      className="sampling-lab"
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
        subtitle: stage?.englishTitle,
        title: labStageTitle("image-sampling", stage?.title),
      }}
    >
      <LabPageShell
        collapsedLabel={stage ? `第 ${stage.index} 关` : undefined}
        labId="image-sampling"
        rail={
          <StageRail
            label={labMetadata["image-sampling"].title}
            onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
            passedStages={state.passedStages}
            stageIndex={state.stageIndex}
            stages={IMAGE_SAMPLING_STAGES}
            unlocked={(item) => isStageUnlocked(state, item.index)}
          />
        }
        resetControls={resetControls}
      >
        <main aria-label="图像采样实验区" className="sampling-workspace" key={saveGeneration}>
          {stage ? <StageBrief stage={stage} /> : null}

          {state.message ? (
            <p className="test-error" role="alert">
              {state.message}
              <button onClick={() => dispatch({ type: "dismiss-message" })} type="button">
                <Icon name="x" size={12} />
              </button>
            </p>
          ) : null}
          {(loadError ?? submitError) ? (
            <p className="test-error" role="alert">
              {loadError ?? submitError}
            </p>
          ) : null}

          {stage ? (
            <>
              <DownsampleExplorer
                height={previewHeight}
                onCellPick={(cell) => dispatch({ type: "select-cell", cell })}
                onResolution={(w, h) => dispatch({ type: "set-resolution", width: w, height: h })}
                ruleCode={draftOf(state, 1).code}
                resolutionReady={resolution != null}
                selectedCell={state.selectedCell}
                shareSearch={shareSearch}
                stage={stage}
                width={previewWidth}
              />

              {stage.guided ? (
                <GuidedCellTask
                  code={draft.code}
                  onCodeChange={(code) => dispatch({ type: "set-code", code })}
                />
              ) : null}

              {!stage.guided ? (
                <ChooseSizePanel
                  code={draft.code}
                  helperCode={draftOf(state, 1).code}
                  onCodeChange={(code) => dispatch({ type: "set-code", code })}
                  onResolution={(w, h) => dispatch({ type: "set-resolution", width: w, height: h })}
                  stage={stage}
                />
              ) : null}

              <div className="submit-row">
                <button
                  className="button button-primary"
                  disabled={
                    submitting || !resolution || (stage.requiresChooseSize && !draft.code.trim())
                  }
                  onClick={() => void onSubmit()}
                  type="button"
                >
                  {submitting ? "判定中…" : "提交判定"}
                </button>
                <span className="submit-note">
                  {resolution
                    ? stage.requiresChooseSize && !draft.code.trim()
                      ? "先填写并运行 choose_size(images)。"
                      : `将以 ${resolution.width}×${resolution.height}（${resolution.width * resolution.height} 格）把整组信号发给接收端判定。`
                    : stage.requiresChooseSize
                      ? "先运行 choose_size(images) 生成分辨率。"
                      : "先选一个分辨率。"}
                </span>
              </div>

              {state.judgeOutcome ? (
                <RecognitionPanel outcome={state.judgeOutcome} stage={stage} />
              ) : null}
            </>
          ) : null}
        </main>
      </LabPageShell>
    </AppPageLayout>
  );
}
