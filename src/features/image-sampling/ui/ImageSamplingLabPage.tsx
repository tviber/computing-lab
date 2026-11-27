import { MathText } from "../../../shared/ui/MathFormula";
import { useSearchParams } from "@solidjs/router";
import { Button } from "@ui-sdk/solid/button";
import { createEffect, createMemo, createSignal, onSettled, Show, untrack } from "solid-js";
import { useLabRuntime } from "../../../shared/lab/runtime";
import { createReducer } from "../../../shared/lab/createReducer";
import { LabSaveIndicator, useLabSession } from "../../../shared/lab/useLabSession";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { labMetadata, labStageTitle } from "../../../shared/lab/labMetadata";
import { StageBrief } from "../../../shared/lab/StageBrief";
import { StageRail } from "../../../shared/lab/StageRail";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { DismissibleAlert } from "../../../shared/ui/DismissibleAlert";
import type { SamplingJudgeResult, SamplingSubmission } from "../domain/protocol.ts";
import { IMAGE_SAMPLING_STAGES, type SamplingStageDef } from "../domain/stages.ts";
import {
  encodeSamplingScenario,
  parseSamplingScenario,
  samplingScenarioActions,
} from "../lesson/scenario.ts";
import {
  createSamplingLessonState,
  draftOf,
  draftResolution,
  isStageUnlocked,
  stageOf,
  transitionSamplingLesson,
  type SamplingLessonAction,
  type SamplingLessonState,
  type StageDraft,
} from "../lesson/state.ts";
import { ChooseSizePanel } from "./ChooseSizePanel.tsx";
import { DownsampleExplorer } from "./DownsampleExplorer.tsx";
import { GuidedCellTask } from "./GuidedCellTask.tsx";
import { warmPyodide } from "./pyodideRunner.ts";
import { ReceiverExercise } from "./ReceiverExercise.tsx";
import { RecognitionPanel } from "./RecognitionPanel.tsx";
import "./imageSampling.css";

function samplingJudgeNote(stage: SamplingStageDef): string {
  const resolutionSource = stage.requiresChooseSize ? "choose_size(images) 算出的" : "你选的";
  const axisNote =
    stage.mode === "square"
      ? "本关只允许正方形（宽=高）。"
      : stage.mode === "tall"
        ? "本关要求高度大于宽度（高 > 宽）。"
        : "本关宽和高可以不同。";
  return `${resolutionSource} ${stage.mode === "square" ? "$n\\times n$" : "$\\text{宽}\\times\\text{高}$"}会套用到判题图谱上。接收端凭格子图认人，至少 ${Math.round(stage.requiredAccuracy * 100)}% 的成员仍能被认出才算通过，且格子数不超过 ${stage.cellBudget}。${
    stage.requiresChooseSize
      ? `本关必须先写并运行 choose_size(images)，不能手动指定分辨率。${axisNote}`
      : axisNote
  }`;
}

export function ImageSamplingLabPage() {
  const [searchParams] = useSearchParams();
  const runtime = useLabRuntime();
  const isStaff = () => runtime.freeNavigation;
  const [state, dispatch] = createReducer(
    transitionSamplingLesson,
    createSamplingLessonState(
      1,
      untrack(() => isStaff()),
    ),
  );
  const [submitError, setSubmitError] = createSignal<string | null>(null);
  let scenarioApplied = false;

  const stage = createMemo(() => stageOf(state()));
  const draft = createMemo(() => draftOf(state()));

  onSettled(() => {
    warmPyodide();
  });

  const session = useLabSession<
    StageDraft,
    Record<never, never>,
    SamplingLessonAction,
    SamplingLessonState
  >(() => ({
    scopeId: () => runtime.scopeId,
    ready: () => runtime.ready,
    labId: "image-sampling",
    state,
    dispatch,
    dispatchSession: dispatch,
    draftOf: (stageIndex) => draftOf(state(), stageIndex),
    onResetSuccess: () => setSubmitError(null),
    toAction: (proj, meta) => ({
      type: "load-project",
      currentStage: proj.currentStage,
      passedStages: proj.passedStages,
      draftRevisions: proj.draftRevisions,
      drafts: Object.fromEntries(
        Object.entries(proj.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
      freeNavigation: proj.staffFreeNavigation ?? isStaff(),
      isReset: meta?.isReset,
    }),
  }));
  const { project } = session;

  createEffect(
    () => project.projectLoaded,
    (loaded) => {
      if (scenarioApplied || !loaded) return;
      scenarioApplied = true;
      const scenario = parseSamplingScenario(untrack(() => ({ ...searchParams })));
      const actions = samplingScenarioActions(untrack(state), scenario);
      actions.forEach((action) => dispatch(action));
    },
  );

  const onSubmit = async () => {
    const scopeId = runtime.scopeId;
    const currentStage = stage();
    const currentState = state();
    const currentDraft = draft();
    if (!scopeId || !currentStage) return;
    const resolution = draftResolution(currentState, currentStage);
    if (currentStage.requiresChooseSize && !currentDraft.code.trim()) {
      dispatch({ type: "message", text: "本关必须先填写并运行 choose_size(images)。" });
      return;
    }
    if (!resolution) {
      dispatch({
        type: "message",
        text: currentStage.requiresChooseSize
          ? "先运行 choose_size(images) 生成分辨率。"
          : "先选一个分辨率再提交。",
      });
      return;
    }
    setSubmitError(null);
    const submission: SamplingSubmission = {
      stageIndex: currentStage.index,
      width: resolution.width,
      height: resolution.height,
      code: currentDraft.code || undefined,
    };
    const response = await project.postJudge<SamplingJudgeResult>(submission);
    if (response.status === "applied") {
      dispatch({ type: "judge-result", outcome: response.outcome });
    } else if (response.status === "error") {
      setSubmitError(response.error);
    }
  };
  const submitting = () => project.submittingJudge || project.resetting;

  const resolution = createMemo(() => {
    const currentStage = stage();
    return currentStage ? draftResolution(state(), currentStage) : null;
  });
  const previewWidth = () => draft().width ?? 8;
  const previewHeight = () => (stage()?.mode === "square" ? previewWidth() : (draft().height ?? 8));

  const shareSearch = createMemo(() => {
    const currentStage = stage();
    if (!currentStage || !isStaff() || currentStage.requiresChooseSize) return undefined;
    return encodeSamplingScenario({
      stageIndex: currentStage.index,
      width: previewWidth(),
      height: previewHeight(),
    });
  });

  return (
    <AppPageLayout
      class="sampling-lab"
      topbar={<LabSaveIndicator controls={session.saveIndicator} />}
      topbarProps={{
        subtitle: stage()?.englishTitle,
        title: labStageTitle("image-sampling", stage()?.title),
      }}
    >
      <LabPageShell
        collapsedLabel={stage() ? `第 ${stage()!.index} 关` : undefined}
        labId="image-sampling"
        rail={
          <StageRail
            label={labMetadata["image-sampling"].title}
            onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
            passedStages={state().passedStages}
            stageIndex={state().stageIndex}
            stages={IMAGE_SAMPLING_STAGES}
            unlocked={(item) => isStageUnlocked(state(), item.index)}
          />
        }
        resetControls={project.resetControls}
      >
        <Show keyed when={String(project.saveGeneration)}>
          {(_) => (
            <main aria-label="图像采样实验区" class="sampling-workspace">
              <Show when={stage()}>
                {(current) => (
                  <StageBrief
                    description={<MathText>{current().description}</MathText>}
                    hints={[<MathText>{current().hint}</MathText>]}
                    judgeNote={<MathText>{samplingJudgeNote(current())}</MathText>}
                    passed={state().passedStages.includes(current().index)}
                    takeaway={<MathText>{current().takeaway}</MathText>}
                    task={<MathText>{current().mission}</MathText>}
                  />
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

              <Show when={stage()}>
                {(current) => (
                  <ReceiverExercise canSkipPrediction={isStaff()} enabled={current().index === 1}>
                    <DownsampleExplorer
                      height={previewHeight()}
                      onCellPick={(cell) => dispatch({ type: "select-cell", cell })}
                      onResolution={(w, h) =>
                        dispatch({ type: "set-resolution", width: w, height: h })
                      }
                      resolutionReady={resolution() != null}
                      ruleCode={draftOf(state(), 1).code}
                      selectedCell={state().selectedCell}
                      shareSearch={shareSearch()}
                      stage={current()}
                      width={previewWidth()}
                    />

                    <Show when={current().guided}>
                      <GuidedCellTask
                        code={draft().code}
                        onCodeChange={(code) => dispatch({ type: "set-code", code })}
                      />
                    </Show>

                    <Show when={!current().guided}>
                      <ChooseSizePanel
                        code={draft().code}
                        helperCode={draftOf(state(), 1).code}
                        onCodeChange={(code) => dispatch({ type: "set-code", code })}
                        onResolution={(w, h) =>
                          dispatch({ type: "set-resolution", width: w, height: h })
                        }
                        stage={current()}
                      />
                    </Show>

                    <div class="submit-row">
                      <Button
                        class="button button-primary"
                        disabled={
                          submitting() ||
                          !resolution() ||
                          (current().requiresChooseSize && !draft().code.trim())
                        }
                        onClick={() => void onSubmit()}
                        type="button"
                      >
                        {submitting() ? "判定中…" : "提交判定"}
                      </Button>
                      <span class="submit-note">
                        {resolution()
                          ? current().requiresChooseSize && !draft().code.trim()
                            ? "先填写并运行 choose_size(images)。"
                            : `将以 ${resolution()!.width}×${resolution()!.height}（${resolution()!.width * resolution()!.height} 格）把整组信号发给接收端判定。`
                          : current().requiresChooseSize
                            ? "先运行 choose_size(images) 生成分辨率。"
                            : "先选一个分辨率。"}
                      </span>
                    </div>

                    <Show when={state().judgeOutcome}>
                      {(outcome) => <RecognitionPanel outcome={outcome()} stage={current()} />}
                    </Show>
                  </ReceiverExercise>
                )}
              </Show>
            </main>
          )}
        </Show>
      </LabPageShell>
    </AppPageLayout>
  );
}
