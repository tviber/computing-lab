import { useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { isStaffRole, useAuth } from "../../../shared/auth";
import { SaveIndicator } from "../../../shared/lab/LabGate";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { labMetadata } from "../../../shared/lab/labMetadata";
import { StageRail } from "../../../shared/lab/StageRail";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { Icon } from "../../../shared/ui/Icon";
import type { QuantJudgeResult, QuantSubmission } from "../domain/protocol.ts";
import { COLOR_QUANT_STAGES, type QuantStageDef } from "../domain/stages.ts";
import {
  createQuantLessonState,
  draftOf,
  isStageUnlocked,
  stageOf,
  transitionQuantLesson,
  type QuantLessonAction,
  type StageDraft,
} from "../lesson/state.ts";
import {
  encodeQuantScenario,
  parseQuantScenario,
  quantScenarioActions,
} from "../lesson/scenario.ts";
import { ChooseTonersPanel } from "./ChooseTonersPanel.tsx";
import { FreeMapPanel } from "./FreeMapPanel.tsx";
import { GuidedTonerTask } from "./GuidedTonerTask.tsx";
import { warmPyodide } from "./pyodideRunner.ts";
import { QuantExplorer } from "./QuantExplorer.tsx";
import { QuantResultPanel } from "./QuantResultPanel.tsx";
import "./colorQuantization.css";

function StageBrief({ stage }: { stage: QuantStageDef }) {
  return (
    <section className="quant-brief">
      <p className="quant-mission">{stage.mission}</p>
      <p>{stage.description}</p>
      <p className="quant-submit-note">
        判定方式：图谱里每台机器人（包括你没见过的隐藏成员）都按你的选择印一遍发出去，
        接收端凭印出的图认人——≥
        {Math.round(stage.requiredAccuracy * 100)}% 能被认出才算通过
        {stage.mode === "pick"
          ? `，且最多装 ${stage.tonerSlots} 种粉（纸白不计）`
          : `，粉盒固定，映射最多改 ${stage.overrideBudget} 条默认值`}
        。
      </p>
      <p className="quant-hidden-note">
        注意：提交时除了你看到的这些，还会混入<strong>没见过的同类机器人</strong>一起判定。
        这是为了检查你的方法是真的理解了规则，而不只是记住了这几张图的答案——
        在公开图谱上全对，不代表隐藏成员也能分开。
      </p>
      <details className="quant-details">
        <summary>提示</summary>
        <p>{stage.hint}</p>
      </details>
    </section>
  );
}

export function ColorQuantizationLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/color-quantization" });
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { status, role } = useAuth();
  const isStaff = isStaffRole(role);
  const [state, dispatch] = useReducer(transitionQuantLesson, undefined, () =>
    createQuantLessonState(1, isStaff),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const scenarioApplied = useRef(false);

  const stage = stageOf(state);
  const draft = draftOf(state);

  // Start downloading the Python runtime as soon as the lab opens,
  // so the first run doesn't spend its load budget on the fetch itself.
  useEffect(() => warmPyodide(), []);

  const { projectLoaded, loadError, fetchProject, resetting, saveGeneration, staffControls } =
    useLabProject<StageDraft, Record<never, never>, QuantLessonAction>({
      classId,
      labId: "color-quantization",
      ready: status === "authenticated",
      staff: isStaff,
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

  // Apply a shared scenario (?stage=&toners=/&table=) once — but only after
  // the project loads, or unlocked stages would look locked at mount.
  useEffect(() => {
    if (scenarioApplied.current || !projectLoaded) return;
    scenarioApplied.current = true;
    const scenario = parseQuantScenario(search);
    const actions = quantScenarioActions(state, scenario);
    actions.forEach((action) => dispatch(action));
    // A shared scenario link is a starting point, not a live binding to the URL.
    // projectLoaded flips in the same batch as load-project, so `state` is fresh.
  }, [projectLoaded]);

  // Reconcile one conflicted stage against the server's copy — also used by
  // the explicit retry the sync-error state offers; a failed refetch flags
  // sync-error and keeps the local draft, never a fake "已载入最新进度".
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
    classId,
    labId: "color-quantization",
    // While the (new class's) project is loading the flags on screen still
    // belong to the previous context — nothing may schedule writes for it.
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
    // The server dropped this write because a newer one already exists
    // elsewhere: refetch so local state reconciles to the winning draft,
    // then flag the conflict briefly on the stage.
    onConflict: (s) => reconcileConflict(s),
  });

  const canSubmit =
    stage?.mode === "pick"
      ? draft.toners.length > 0
      : draft.table !== null && draft.table.length > 0;

  const onSubmit = useCallback(async () => {
    if (!classId || !stage) return;
    if (stage.mode === "pick" && draft.toners.length === 0) {
      dispatch({ type: "message", text: "先选要装哪几种粉再提交。" });
      return;
    }
    if (stage.mode === "free" && !draft.table) {
      dispatch({ type: "message", text: "先生成一张映射表再提交。" });
      return;
    }
    setSubmitting(true);
    try {
      const submission: QuantSubmission = {
        stageIndex: stage.index,
        ...(stage.mode === "pick" ? { toners: draft.toners } : { table: draft.table ?? undefined }),
        code: draft.code || undefined,
      };
      const outcome = await api.post<QuantJudgeResult>(
        `/api/classes/${classId}/labs/color-quantization/judge`,
        submission,
      );
      dispatch({ type: "judge-result", outcome });
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stage, state, draft]);

  const shareSearch =
    stage && isStaffRole(role)
      ? stage.mode === "pick"
        ? encodeQuantScenario({ stageIndex: stage.index, toners: draft.toners })
        : encodeQuantScenario({ stageIndex: stage.index, table: draft.table })
      : undefined;

  return (
    <AppPageLayout
      className="quant-lab"
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
        title: stage?.title ?? labMetadata["color-quantization"].title,
      }}
    >
      <LabPageShell
        collapsedLabel={stage ? `第 ${stage.index} 关` : undefined}
        labId="color-quantization"
        rail={
          <StageRail
            label={labMetadata["color-quantization"].title}
            onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
            passedStages={state.passedStages}
            stageIndex={state.stageIndex}
            stages={COLOR_QUANT_STAGES}
            unlocked={(item) => isStageUnlocked(state, item.index)}
          />
        }
        staffControls={staffControls}
      >
        <main aria-label="颜色量化实验区" className="quant-workspace">
          {stage ? <StageBrief stage={stage} /> : null}

          {state.message ? (
            <p className="quant-error" role="alert">
              {state.message}
              <button onClick={() => dispatch({ type: "dismiss-message" })} type="button">
                <Icon name="x" size={12} />
              </button>
            </p>
          ) : null}
          {(loadError ?? submitError) ? (
            <p className="quant-error" role="alert">
              {loadError ?? submitError}
            </p>
          ) : null}

          {stage ? (
            <>
              <QuantExplorer
                draft={draft}
                onTable={(table) => dispatch({ type: "set-table", table })}
                onToners={(toners) => dispatch({ type: "set-toners", toners })}
                ruleCode={draftOf(state, 1).code}
                shareSearch={shareSearch}
                stage={stage}
              />

              {stage.guided ? (
                <GuidedTonerTask
                  code={draft.code}
                  onCodeChange={(code) => dispatch({ type: "set-code", code })}
                />
              ) : null}

              {!stage.guided && stage.mode === "pick" ? (
                <ChooseTonersPanel
                  code={draft.code}
                  helperCode={draftOf(state, 1).code}
                  onCodeChange={(code) => dispatch({ type: "set-code", code })}
                  onToners={(toners) => dispatch({ type: "set-toners", toners })}
                  stage={stage}
                />
              ) : null}

              {!stage.guided && stage.mode === "free" ? (
                <FreeMapPanel
                  code={draft.code}
                  helperCode={draftOf(state, 1).code}
                  onCodeChange={(code) => dispatch({ type: "set-code", code })}
                  onTable={(table) => dispatch({ type: "set-table", table })}
                  stage={stage}
                  table={draft.table}
                />
              ) : null}

              <div className="quant-submit-row">
                <button
                  className="button button-primary"
                  disabled={submitting || !canSubmit}
                  onClick={() => void onSubmit()}
                  type="button"
                >
                  {submitting ? "判定中…" : "提交判定"}
                </button>
                <span className="quant-submit-note">
                  {stage.mode === "pick"
                    ? draft.toners.length
                      ? `将以 ${draft.toners.length} 种粉（编号 ${draft.toners.join(", ")}）把整组图谱印给接收端判定。`
                      : "先选要装哪几种粉。"
                    : draft.table
                      ? "将以你的映射表把整组图谱印给接收端判定。"
                      : "先在下方运行 map_color 生成映射表。"}
                </span>
              </div>

              {state.judgeOutcome ? (
                <QuantResultPanel outcome={state.judgeOutcome} stage={stage} />
              ) : null}
            </>
          ) : null}
        </main>
      </LabPageShell>
    </AppPageLayout>
  );
}
