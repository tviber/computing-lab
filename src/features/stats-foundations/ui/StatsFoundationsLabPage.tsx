import { useSearchParams } from "@solidjs/router";
import { Button } from "@ui-sdk/solid/button";
import { createMemo, createSignal, For, Match, Show, Switch, untrack } from "solid-js";
import { useLabRuntime } from "../../../shared/lab/runtime";
import { createReducer } from "../../../shared/lab/createReducer";
import { SaveIndicator } from "../../../shared/lab/SaveIndicator";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { labMetadata, labStageTitle } from "../../../shared/lab/labMetadata";
import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
import { StageRail } from "../../../shared/lab/StageRail";
import { StageTask } from "../../../shared/lab/StageTask";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { HintDisclosure } from "../../../shared/ui/HintDisclosure";
import type {
  ConditionalProbDraft,
  LikelihoodDraft,
  LinearRegressionDraft,
  SigmoidBridgeDraft,
  StatsFoundationsDraft,
  StatsFoundationsJudgeResult,
} from "../domain/protocol.ts";
import { STATS_FOUNDATIONS_STAGES, type StatsFoundationsStageDef } from "../domain/stages.ts";
import {
  createStatsFoundationsLessonState,
  draftOf,
  isStageUnlocked,
  stageOf,
  transitionStatsFoundationsLesson,
  type StatsFoundationsLessonAction,
} from "../lesson/state.ts";
import { ConditionalProbPanel } from "./ConditionalProbPanel.tsx";
import { LikelihoodPanel } from "./LikelihoodPanel.tsx";
import { LinearRegressionPanel } from "./LinearRegressionPanel.tsx";
import { SigmoidBridgePanel } from "./SigmoidBridgePanel.tsx";
import "./statsFoundations.css";

function parseRequestedStage(raw: unknown): number | null {
  const rawValue = (raw as { stage?: unknown } | null)?.stage;
  const rawStage = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const parsed =
    typeof rawStage === "number" || (typeof rawStage === "string" && rawStage.trim() !== "")
      ? Number(rawStage)
      : NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= STATS_FOUNDATIONS_STAGES.length
    ? parsed
    : null;
}

function StageBrief(props: { stage: StatsFoundationsStageDef; passed: boolean }) {
  return (
    <section class="stage-brief">
      <StageTask>{props.stage.task}</StageTask>
      <p>{props.stage.description}</p>
      <Show
        fallback={
          <div class="sf-hints-list">
            <For each={props.stage.hints}>{(hint) => <HintDisclosure>{hint}</HintDisclosure>}</For>
          </div>
        }
        when={props.passed}
      >
        <p class="submit-note">判题方式：{props.stage.judgeNote}</p>
        <p class="stage-takeaway">本关收获：{props.stage.takeaway}</p>
      </Show>
    </section>
  );
}

const RAIL_STAGES = STATS_FOUNDATIONS_STAGES.map((s) => ({ ...s, id: s.slug }));

export function StatsFoundationsLabPage() {
  const [searchParams] = useSearchParams();
  const runtime = useLabRuntime();
  const freeNavigation = () => runtime.freeNavigation;

  const [state, dispatch] = createReducer(
    transitionStatsFoundationsLesson,
    createStatsFoundationsLessonState(untrack(() => parseRequestedStage(searchParams))),
  );
  const [submitError, setSubmitError] = createSignal<string | null>(null);

  const stage = createMemo(() => stageOf(state()));
  const currentDraft = createMemo(() => draftOf<StatsFoundationsDraft>(state(), stage().index));
  const passed = createMemo(() => state().passedStages.includes(stage().index));

  const project = useLabProject<
    StatsFoundationsDraft,
    Record<string, never>,
    StatsFoundationsLessonAction
  >(() => ({
    scopeId: runtime.scopeId,
    labId: "stats-foundations",
    ready: runtime.ready,
    stageIndex: state().stageIndex,
    onResetSuccess: () => {
      setSubmitError(null);
    },
    toAction: (loaded, meta) => ({
      type: "load-project",
      currentStage: loaded.currentStage,
      passedStages: loaded.passedStages,
      draftRevisions: loaded.draftRevisions,
      drafts: Object.fromEntries(
        Object.entries(loaded.drafts ?? {}).map(([k, v]) => [Number(k), v]),
      ),
      freeNavigation: freeNavigation(),
      isReset: meta?.isReset,
    }),
    dispatch,
  }));

  const projectReady = createMemo(() => project.projectLoaded && project.loadError === null);
  const reconcileConflict = (s: number) =>
    reconcileConflictedStage({
      fetchProject: project.fetchProject,
      stageIndex: s,
      onResolved: (stageIndex, loaded) =>
        dispatch({
          type: "resolve-save-conflict",
          stageIndex,
          draft: loaded.drafts?.[stageIndex],
          revision: loaded.draftRevisions?.[stageIndex],
        }),
      onSyncError: (stageIndex) => dispatch({ type: "mark-save-sync-error", stageIndex }),
    });

  useAutosaveDraft<StatsFoundationsDraft>(() => ({
    flushPreservedDrafts: project.flushPreservedDrafts,
    saveStatuses: projectReady() ? state().saveStatusByStage : undefined,
    scopeId: runtime.scopeId,
    labId: "stats-foundations",
    saveStatus:
      projectReady() && !project.resetting
        ? statusForStage(state().saveStatusByStage, state().stageIndex)
        : "idle",
    stageIndex: state().stageIndex,
    draftOf: (index) => draftOf(state(), index),
    deps: [state().drafts],
    expectedGeneration: project.projectGeneration,
    resetVersion: project.saveGeneration,
    expectedRevisionOf: (s) => state().draftRevisions[s] ?? 0,
    onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
    onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
    onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
    onConflict: (s) => reconcileConflict(s),
  }));

  const handleDraftChange = (next: StatsFoundationsDraft) => {
    dispatch({ type: "update-draft", stageIndex: stage().index, draft: next });
  };

  const handleJudge = async () => {
    if (!projectReady()) return;
    setSubmitError(null);
    const response = await project.postJudge<StatsFoundationsJudgeResult>({
      stageIndex: stage().index,
      draft: currentDraft(),
    });
    if (response.status === "applied") {
      dispatch({ type: "judge-result", result: response.outcome });
    } else if (response.status === "error") {
      setSubmitError(response.error);
    }
  };

  const submitting = () => project.submittingJudge || project.resetting;
  const activeError = () => project.loadError ?? submitError();
  const stageJudge = createMemo(() => {
    const last = state().lastJudge;
    return last && last.stageIndex === stage().index ? last : null;
  });

  return (
    <AppPageLayout
      topbar={
        <SaveIndicator
          onDiscardLocal={
            state().conflictedLocalDrafts[stage().index]
              ? () => dispatch({ type: "discard-conflict-draft", stageIndex: stage().index })
              : undefined
          }
          onRestoreLocal={
            state().conflictedLocalDrafts[stage().index]
              ? () => dispatch({ type: "restore-conflict-draft", stageIndex: stage().index })
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
        title: labStageTitle("stats-foundations", stage().title),
      }}
    >
      <LabPageShell
        collapsedLabel={`第 ${stage().index} 关`}
        labId="stats-foundations"
        rail={
          <StageRail
            label={labMetadata["stats-foundations"].title}
            onSelect={(idx) =>
              dispatch({ type: "select-stage", stageIndex: idx, freeNavigation: freeNavigation() })
            }
            passedStages={state().passedStages}
            stageIndex={stage().index}
            stages={RAIL_STAGES}
            unlocked={(item) =>
              projectReady() && isStageUnlocked(state(), item.index, freeNavigation())
            }
          />
        }
        resetControls={project.resetControls}
      >
        <Show keyed when={project.saveGeneration + 1}>
          <main aria-label="统计基础实验区" class="sf-page-content" data-stage={stage().slug}>
            <Show when={activeError()}>
              {(message) => (
                <p class="test-error" role="alert">
                  {message()}
                </p>
              )}
            </Show>

            <Show
              fallback={
                <Show when={!project.loadError}>
                  <p class="home-loading" role="status">
                    正在载入…
                  </p>
                </Show>
              }
              when={projectReady()}
            >
              <Show keyed when={stage()}>
                {(currentStage) => <StageBrief passed={passed()} stage={currentStage} />}
              </Show>

              <Switch>
                <Match when={stage().index === 1}>
                  <LinearRegressionPanel
                    draft={draftOf<LinearRegressionDraft>(state(), 1)}
                    onChange={handleDraftChange}
                    passed={passed()}
                    question={stage().question}
                  />
                </Match>
                <Match when={stage().index === 2}>
                  <ConditionalProbPanel
                    draft={draftOf<ConditionalProbDraft>(state(), 2)}
                    onChange={handleDraftChange}
                    passed={passed()}
                    question={stage().question}
                  />
                </Match>
                <Match when={stage().index === 3}>
                  <LikelihoodPanel
                    draft={draftOf<LikelihoodDraft>(state(), 3)}
                    onChange={handleDraftChange}
                    passed={passed()}
                    question={stage().question}
                  />
                </Match>
                <Match when={stage().index === 4}>
                  <SigmoidBridgePanel
                    draft={draftOf<SigmoidBridgeDraft>(state(), 4)}
                    onChange={handleDraftChange}
                  />
                </Match>
              </Switch>

              <Show when={stageJudge()}>
                {(judge) => (
                  <div
                    class={`sf-feedback ${judge().passed ? "is-pass" : "is-fail"}`}
                    role="status"
                  >
                    {judge().feedback}
                  </div>
                )}
              </Show>

              <div class="sf-actions-bar">
                <Button
                  class="sf-submit-btn"
                  disabled={submitting() || !projectReady()}
                  onClick={() => void handleJudge()}
                  type="button"
                >
                  {submitting() ? "正在判题…" : "提交检查本关"}
                </Button>

                <Show when={passed() && stage().index < STATS_FOUNDATIONS_STAGES.length}>
                  <Button
                    class="sf-next-link"
                    onClick={() =>
                      dispatch({
                        type: "select-stage",
                        stageIndex: stage().index + 1,
                        freeNavigation: freeNavigation(),
                      })
                    }
                    type="button"
                  >
                    进入第 {stage().index + 1} 关 →
                  </Button>
                </Show>
              </div>
            </Show>
          </main>
        </Show>
      </LabPageShell>
    </AppPageLayout>
  );
}
