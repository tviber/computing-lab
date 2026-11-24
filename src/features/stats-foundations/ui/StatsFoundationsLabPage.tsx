import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useReducer, useState } from "react";
import { isStaffRole, useAuth } from "../../../shared/auth";
import { SaveIndicator } from "../../../shared/lab/LabGate";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { StageTask } from "../../../shared/lab/StageTask";
import { StageRail } from "../../../shared/lab/StageRail";
import { labMetadata, labStageTitle } from "../../../shared/lab/labMetadata";
import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
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
  const rawStage = (raw as { stage?: unknown } | null)?.stage;
  const parsed =
    typeof rawStage === "number" || (typeof rawStage === "string" && rawStage.trim() !== "")
      ? Number(rawStage)
      : NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= STATS_FOUNDATIONS_STAGES.length
    ? parsed
    : null;
}

function StageBrief({ stage, passed }: { stage: StatsFoundationsStageDef; passed: boolean }) {
  return (
    <section className="stage-brief">
      <StageTask>{stage.task}</StageTask>
      <p>{stage.description}</p>
      {passed ? (
        <>
          <p className="submit-note">判题方式：{stage.judgeNote}</p>
          <p className="stage-takeaway">本关收获：{stage.takeaway}</p>
        </>
      ) : (
        <div className="sf-hints-list">
          {stage.hints.map((hint, index) => (
            <HintDisclosure key={index}>{hint}</HintDisclosure>
          ))}
        </div>
      )}
    </section>
  );
}

const RAIL_STAGES = STATS_FOUNDATIONS_STAGES.map((s) => ({ ...s, id: s.slug }));

export function StatsFoundationsLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/stats-foundations" });
  const rawSearch = useSearch({ strict: false });
  const auth = useAuth();
  const freeNavigation = isStaffRole(auth.role);

  const [state, dispatch] = useReducer(transitionStatsFoundationsLesson, undefined, () =>
    createStatsFoundationsLessonState(parseRequestedStage(rawSearch)),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stage = stageOf(state);
  const currentDraft = draftOf<StatsFoundationsDraft>(state, stage.index);
  const passed = state.passedStages.includes(stage.index);

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
  } = useLabProject<StatsFoundationsDraft, Record<string, never>, StatsFoundationsLessonAction>({
    classId,
    labId: "stats-foundations",
    ready: auth.status === "authenticated",
    stageIndex: state.stageIndex,
    onResetSuccess: () => {
      setSubmitError(null);
    },
    toAction: (project, meta) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      draftRevisions: project.draftRevisions,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([k, v]) => [Number(k), v]),
      ),
      freeNavigation,
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

  useAutosaveDraft<StatsFoundationsDraft>({
    flushPreservedDrafts,
    saveStatuses: projectLoaded ? state.saveStatusByStage : undefined,
    classId,
    labId: "stats-foundations",
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

  const handleDraftChange = (next: StatsFoundationsDraft) => {
    dispatch({ type: "update-draft", stageIndex: stage.index, draft: next });
  };

  const handleJudge = useCallback(async () => {
    setSubmitError(null);
    const response = await postJudge<StatsFoundationsJudgeResult>({
      stageIndex: stage.index,
      draft: currentDraft,
    });
    if (response.status === "applied") {
      dispatch({ type: "judge-result", result: response.outcome });
    } else if (response.status === "error") {
      setSubmitError(response.error);
    }
  }, [currentDraft, postJudge, stage.index]);

  const submitting = submittingJudge || resetting;

  return (
    <AppPageLayout
      topbar={
        <SaveIndicator
          onRetrySync={() => reconcileConflict(state.stageIndex)}
          status={statusForStage(state.saveStatusByStage, state.stageIndex)}
          unresolvedSyncConflict={syncConflictForStage(
            state.unresolvedSyncConflicts,
            state.stageIndex,
          )}
        />
      }
      topbarProps={{
        title: labStageTitle("stats-foundations", stage.title),
      }}
    >
      <LabPageShell
        collapsedLabel={`第 ${stage.index} 关`}
        labId="stats-foundations"
        rail={
          <StageRail
            label={labMetadata["stats-foundations"].title}
            onSelect={(idx) => dispatch({ type: "select-stage", stageIndex: idx, freeNavigation })}
            passedStages={state.passedStages}
            stageIndex={stage.index}
            stages={RAIL_STAGES}
            unlocked={(item) => isStageUnlocked(state, item.index, freeNavigation)}
          />
        }
        resetControls={resetControls}
      >
        <main aria-label="统计基础实验区" className="sf-page-content" key={saveGeneration}>
          {(loadError ?? submitError) ? (
            <p className="test-error" role="alert">
              {loadError ?? submitError}
            </p>
          ) : null}

          {!projectLoaded ? (
            loadError ? null : (
              <p className="home-loading" role="status">
                正在载入…
              </p>
            )
          ) : (
            <>
              <StageBrief key={stage.index} passed={passed} stage={stage} />

              {stage.index === 1 && (
                <LinearRegressionPanel
                  draft={draftOf<LinearRegressionDraft>(state, 1)}
                  onChange={handleDraftChange}
                  passed={passed}
                  question={stage.question}
                />
              )}
              {stage.index === 2 && (
                <ConditionalProbPanel
                  draft={draftOf<ConditionalProbDraft>(state, 2)}
                  onChange={handleDraftChange}
                  passed={passed}
                  question={stage.question}
                />
              )}
              {stage.index === 3 && (
                <LikelihoodPanel
                  draft={draftOf<LikelihoodDraft>(state, 3)}
                  onChange={handleDraftChange}
                  passed={passed}
                  question={stage.question}
                />
              )}
              {stage.index === 4 && (
                <SigmoidBridgePanel
                  draft={draftOf<SigmoidBridgeDraft>(state, 4)}
                  onChange={handleDraftChange}
                />
              )}

              {state.lastJudge && state.lastJudge.stageIndex === stage.index && (
                <div
                  role="status"
                  className={`sf-feedback ${state.lastJudge.passed ? "is-pass" : "is-fail"}`}
                >
                  {state.lastJudge.feedback}
                </div>
              )}

              <div className="sf-actions-bar">
                <button
                  className="sf-submit-btn"
                  disabled={submitting || !projectLoaded}
                  onClick={() => void handleJudge()}
                  type="button"
                >
                  {submitting ? "正在判题…" : "提交检查本关"}
                </button>

                {passed && stage.index < STATS_FOUNDATIONS_STAGES.length && (
                  <button
                    className="sf-next-link"
                    onClick={() =>
                      dispatch({
                        type: "select-stage",
                        stageIndex: stage.index + 1,
                        freeNavigation,
                      })
                    }
                    type="button"
                  >
                    进入第 {stage.index + 1} 关 →
                  </button>
                )}

                {passed && stage.index === STATS_FOUNDATIONS_STAGES.length && (
                  <Link
                    className="sf-next-link"
                    params={{ classId }}
                    to="/classes/$classId/labs/logistic-regression"
                  >
                    前往下一课：逻辑回归 →
                  </Link>
                )}
              </div>
            </>
          )}
        </main>
      </LabPageShell>
    </AppPageLayout>
  );
}
