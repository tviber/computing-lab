import { useSearchParams } from "@solidjs/router";
import { createMemo, createSignal, Match, Show, Switch, untrack } from "solid-js";
import { useLabRuntime } from "../../../shared/lab/runtime";
import { createReducer } from "../../../shared/lab/createReducer";
import { LabSaveIndicator, useLabSession } from "../../../shared/lab/useLabSession";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { labMetadata, labStageTitle } from "../../../shared/lab/labMetadata";
import { StageBrief } from "../../../shared/lab/StageBrief";
import { StageRail } from "../../../shared/lab/StageRail";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { DismissibleAlert } from "../../../shared/ui/DismissibleAlert";
import { MathText } from "../../../shared/ui/MathFormula";
import type {
  ExperienceSubmission,
  LogisticRegressionDraft,
  LogisticRegressionJudgeResult,
  LogisticRegressionProjectExtras,
  ScoreDraft,
  SgdCodeDraft,
  StrategyDraft,
  TokenizeDraft,
  TrainDraft,
} from "../domain/protocol.ts";
import { LOGISTIC_REGRESSION_STAGES, logisticRegressionStageUnlocked } from "../domain/stages.ts";
import {
  createLogisticRegressionLessonState,
  draftOf,
  isStageUnlocked,
  stageOf,
  summaryForStage,
  transitionLogisticRegressionLesson,
  type LogisticRegressionLessonAction,
  type LogisticRegressionLessonState,
} from "../lesson/state.ts";
import { ExperiencePanel } from "./ExperiencePanel.tsx";
import { ScorePanel } from "./ScorePanel.tsx";
import { SgdCodePanel } from "./SgdCodePanel.tsx";
import { StrategyPanel } from "./StrategyPanel.tsx";
import { TokenizePanel } from "./TokenizePanel.tsx";
import { TrainPanel } from "./TrainPanel.tsx";
import "./logisticRegression.css";

function parseRequestedStage(raw: unknown): number | null {
  const rawValue = (raw as { stage?: unknown } | null)?.stage;
  const rawStage = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const parsedStage =
    typeof rawStage === "number" || (typeof rawStage === "string" && rawStage.trim() !== "")
      ? Number(rawStage)
      : NaN;
  return Number.isInteger(parsedStage) && parsedStage >= 1 && parsedStage <= 6
    ? Math.min(parsedStage, 6)
    : null;
}

export function LogisticRegressionLabPage() {
  const [searchParams] = useSearchParams();
  const runtime = useLabRuntime();
  const [state, dispatch] = createReducer(
    transitionLogisticRegressionLesson,
    createLogisticRegressionLessonState(untrack(() => parseRequestedStage(searchParams))),
  );
  const [submitError, setSubmitError] = createSignal<string | null>(null);
  const [judgedStage, setJudgedStage] = createSignal<number | null>(null);

  const stage = createMemo(() => stageOf(state()));

  const session = useLabSession<
    LogisticRegressionDraft,
    LogisticRegressionProjectExtras,
    LogisticRegressionLessonAction,
    LogisticRegressionLessonState
  >(() => ({
    scopeId: () => runtime.scopeId,
    ready: () => runtime.ready,
    labId: "logistic-regression",
    state,
    dispatch,
    draftOf: (stageIndex) => (stageIndex === 5 ? undefined : draftOf(state(), stageIndex)),
    onResetSuccess: () => {
      setSubmitError(null);
      setJudgedStage(null);
    },
    toAction: (loaded, meta) => ({
      type: "load-project",
      currentStage: loaded.currentStage,
      passedStages: loaded.passedStages,
      draftRevisions: loaded.draftRevisions,
      drafts: Object.fromEntries(
        Object.entries(loaded.drafts ?? {}).map(([k, v]) => [Number(k), v]),
      ),
      runSummaries: loaded.runSummaries,
      trainedSettings: loaded.trainedSettings,
      isReset: meta?.isReset,
    }),
  }));
  const { project } = session;

  const submitJudge = async (
    stageIndex: number,
    draft: LogisticRegressionDraft | ExperienceSubmission,
  ) => {
    if (!runtime.scopeId || !logisticRegressionStageUnlocked(state().passedStages, stageIndex)) {
      return;
    }
    setSubmitError(null);
    const response = await project.postJudge<LogisticRegressionJudgeResult>({ stageIndex, draft });
    if (response.status === "applied") {
      setJudgedStage(stageIndex);
      dispatch({ type: "judge-result", stageIndex, outcome: response.outcome });
    } else if (response.status === "error") {
      setSubmitError(response.error);
    }
  };

  const submitting = () => project.submittingJudge || project.resetting;
  const activeIndex = () => stage()?.index ?? 1;
  const activePassed = createMemo(() => state().passedStages.includes(activeIndex()));
  const activeResult = createMemo(() => summaryForStage(state(), activeIndex(), judgedStage()));
  const hasNextStage = () => activeIndex() < 5;

  const selectStage = (stageIndex: number) => {
    setSubmitError(null);
    dispatch({ type: "select-stage", stageIndex });
  };
  const goNextStage = () => {
    if (hasNextStage()) selectStage(activeIndex() + 1);
  };

  const experienceKey = createMemo(() => {
    const current = stage();
    if (!project.projectLoaded || current?.id !== "experience") return null;
    const trained = state().trainedSettings;
    return `${runtime.scopeId ?? ""}:${project.projectGeneration}:${trained?.eta}:${trained?.epochs}`;
  });

  const activeError = () => project.loadError ?? submitError();

  return (
    <AppPageLayout
      class="logistic-regression-lab"
      topbar={<LabSaveIndicator controls={session.saveIndicator} />}
      topbarProps={{
        title: labStageTitle("logistic-regression", stage()?.title),
      }}
    >
      <LabPageShell
        collapsedLabel={stage() ? `第 ${stage()!.index} 关` : undefined}
        labId="logistic-regression"
        rail={
          <StageRail
            label={labMetadata["logistic-regression"].title}
            onSelect={selectStage}
            passedStages={state().passedStages}
            stageIndex={state().stageIndex}
            stages={LOGISTIC_REGRESSION_STAGES}
            unlocked={(item) => isStageUnlocked(state(), item.index)}
          />
        }
        resetControls={project.resetControls}
      >
        <Show keyed when={project.saveGeneration + 1}>
          <main aria-label="逻辑回归实验区" class="logistic-regression-workspace">
            <Show keyed when={stage()?.id !== "experience" ? stage() : null}>
              {(currentStage) => (
                <StageBrief
                  description={<MathText>{currentStage.description}</MathText>}
                  hints={currentStage.hints.map((hint) => (
                    <MathText>{hint}</MathText>
                  ))}
                  judgeNote={<MathText>{currentStage.judgeNote}</MathText>}
                  passed={activePassed()}
                  takeaway={<MathText>{currentStage.takeaway}</MathText>}
                  task={<MathText>{currentStage.task}</MathText>}
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

            <Show when={activeError()}>
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

            <Show when={project.projectLoaded && stage()}>
              {(currentStage) => (
                <Switch>
                  <Match when={currentStage().index === 1}>
                    <StrategyPanel
                      draft={draftOf(state(), 1) as StrategyDraft}
                      hasNextStage={hasNextStage()}
                      onChange={(draft) => dispatch({ type: "update-stage1", draft })}
                      onNextStage={goNextStage}
                      onSubmit={() => void submitJudge(1, draftOf(state(), 1))}
                      passed={activePassed()}
                      result={activeResult()}
                      stage={currentStage()}
                      submitting={submitting()}
                    />
                  </Match>
                  <Match when={currentStage().index === 2}>
                    <TokenizePanel
                      draft={draftOf(state(), 2) as TokenizeDraft}
                      hasNextStage={hasNextStage()}
                      onChange={(draft) => dispatch({ type: "update-stage2", draft })}
                      onNextStage={goNextStage}
                      onSubmit={() => void submitJudge(2, draftOf(state(), 2))}
                      passed={activePassed()}
                      result={activeResult()}
                      stage={currentStage()}
                      submitting={submitting()}
                    />
                  </Match>
                  <Match when={currentStage().index === 3}>
                    <ScorePanel
                      draft={draftOf(state(), 3) as ScoreDraft}
                      hasNextStage={hasNextStage()}
                      onChange={(draft) => dispatch({ type: "update-stage3", draft })}
                      onNextStage={goNextStage}
                      onSubmit={() => void submitJudge(3, draftOf(state(), 3))}
                      passed={activePassed()}
                      result={activeResult()}
                      stage={currentStage()}
                      submitting={submitting()}
                    />
                  </Match>
                  <Match when={currentStage().index === 4}>
                    <TrainPanel
                      draft={draftOf(state(), 4) as TrainDraft}
                      hasNextStage={hasNextStage()}
                      onBonusStage={() => selectStage(6)}
                      onChange={(draft) => dispatch({ type: "update-stage4", draft })}
                      onNextStage={goNextStage}
                      onSubmit={() => void submitJudge(4, draftOf(state(), 4))}
                      passed={activePassed()}
                      result={activeResult()}
                      stage={currentStage()}
                      submitting={submitting()}
                    />
                  </Match>
                  <Match when={currentStage().id === "experience"}>
                    <Show keyed when={experienceKey()}>
                      {(_) => (
                        <ExperiencePanel
                          hasSubmittedModel={state().trainedSettings !== undefined}
                          onComplete={(submission) => void submitJudge(5, submission)}
                          onReviewTraining={() => selectStage(4)}
                          passed={activePassed()}
                          submitting={submitting()}
                          training={state().trainedSettings ?? (draftOf(state(), 4) as TrainDraft)}
                        />
                      )}
                    </Show>
                  </Match>
                  <Match when={currentStage().index === 6}>
                    <SgdCodePanel
                      draft={draftOf(state(), 6) as SgdCodeDraft}
                      onChange={(draft) => dispatch({ type: "update-stage6", draft })}
                      onSubmit={() => void submitJudge(6, draftOf(state(), 6))}
                      passed={activePassed()}
                      result={activeResult()}
                      stage={currentStage()}
                      submitting={submitting()}
                    />
                  </Match>
                </Switch>
              )}
            </Show>
          </main>
        </Show>
      </LabPageShell>
    </AppPageLayout>
  );
}
