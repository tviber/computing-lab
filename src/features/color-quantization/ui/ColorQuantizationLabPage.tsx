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
import { Icon } from "../../../shared/ui/Icon";
import type { QuantJudgeResult, QuantSubmission } from "../domain/protocol.ts";
import { COLOR_QUANT_STAGES } from "../domain/stages.ts";
import {
  encodeQuantScenario,
  parseQuantScenario,
  quantScenarioActions,
} from "../lesson/scenario.ts";
import {
  createQuantLessonState,
  draftOf,
  isStageUnlocked,
  stageOf,
  transitionQuantLesson,
  type QuantLessonAction,
  type QuantLessonState,
  type StageDraft,
} from "../lesson/state.ts";
import { ChooseTonersPanel } from "./ChooseTonersPanel.tsx";
import { FreeMapPanel } from "./FreeMapPanel.tsx";
import { GuidedTonerTask } from "./GuidedTonerTask.tsx";
import { warmPyodide } from "./pyodideRunner.ts";
import { QuantExplorer } from "./QuantExplorer.tsx";
import { QuantResultPanel } from "./QuantResultPanel.tsx";
import "./colorQuantization.css";

export function ColorQuantizationLabPage() {
  const [searchParams] = useSearchParams();
  const runtime = useLabRuntime();
  const isStaff = () => runtime.freeNavigation;
  const [state, dispatch] = createReducer(
    transitionQuantLesson,
    createQuantLessonState(
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
    QuantLessonAction,
    QuantLessonState
  >(() => ({
    scopeId: () => runtime.scopeId,
    ready: () => runtime.ready,
    labId: "color-quantization",
    state,
    dispatch,
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
      const scenario = parseQuantScenario(untrack(() => ({ ...searchParams })));
      const actions = quantScenarioActions(untrack(state), scenario);
      actions.forEach((action) => dispatch(action));
    },
  );

  const canSubmit = () => {
    const currentStage = stage();
    const currentDraft = draft();
    return currentStage?.mode === "pick"
      ? currentDraft.toners.length > 0
      : currentDraft.table !== null && currentDraft.table.length > 0;
  };

  const onSubmit = async () => {
    const scopeId = runtime.scopeId;
    const currentStage = stage();
    const currentDraft = draft();
    if (!scopeId || !currentStage) return;
    if (currentStage.mode === "pick" && currentDraft.toners.length === 0) {
      dispatch({ type: "message", text: "先选要装哪几种粉再提交。" });
      return;
    }
    if (currentStage.mode === "free" && !currentDraft.table) {
      dispatch({ type: "message", text: "先生成一张映射表再提交。" });
      return;
    }
    setSubmitError(null);
    const submission: QuantSubmission = {
      stageIndex: currentStage.index,
      ...(currentStage.mode === "pick"
        ? { toners: currentDraft.toners }
        : { table: currentDraft.table ?? undefined }),
      code: currentDraft.code || undefined,
    };
    const response = await project.postJudge<QuantJudgeResult>(submission);
    if (response.status === "applied") {
      dispatch({ type: "judge-result", outcome: response.outcome });
    } else if (response.status === "error") {
      setSubmitError(response.error);
    }
  };

  const submitting = () => project.submittingJudge || project.resetting;

  const shareSearch = createMemo(() => {
    const currentStage = stage();
    const currentDraft = draft();
    if (!currentStage || !isStaff()) return undefined;
    return currentStage.mode === "pick"
      ? encodeQuantScenario({ stageIndex: currentStage.index, toners: currentDraft.toners })
      : encodeQuantScenario({ stageIndex: currentStage.index, table: currentDraft.table });
  });

  return (
    <AppPageLayout
      class="quant-lab"
      topbar={<LabSaveIndicator controls={session.saveIndicator} />}
      topbarProps={{
        subtitle: stage()?.englishTitle,
        title: labStageTitle("color-quantization", stage()?.title),
      }}
    >
      <LabPageShell
        collapsedLabel={stage() ? `第 ${stage()!.index} 关` : undefined}
        labId="color-quantization"
        rail={
          <StageRail
            label={labMetadata["color-quantization"].title}
            onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
            passedStages={state().passedStages}
            stageIndex={state().stageIndex}
            stages={COLOR_QUANT_STAGES}
            unlocked={(item) => isStageUnlocked(state(), item.index)}
          />
        }
        resetControls={project.resetControls}
      >
        <Show keyed when={String(project.saveGeneration)}>
          {(_) => (
            <main aria-label="颜色量化实验区" class="quant-workspace">
              <Show when={stage()}>
                {(current) => (
                  <StageBrief
                    description={current().description}
                    hints={[current().hint]}
                    judgeNote={`判题图谱里每台机器人都按你的选择印一遍发出去，接收端凭印出的图认人，至少 ${Math.round(current().requiredAccuracy * 100)}% 能被认出才算通过${
                      current().mode === "pick"
                        ? `，且最多装 ${current().tonerSlots} 种粉（纸白不计）`
                        : `，粉盒固定，映射最多改 ${current().overrideBudget} 条默认值`
                    }。`}
                    passed={state().passedStages.includes(current().index)}
                    takeaway={current().takeaway}
                    task={current().mission}
                  >
                    <p class="quant-hidden-note">
                      请用同一套规则处理整组机器人，观察哪些颜色差异能帮助接收端区分成员。
                    </p>
                  </StageBrief>
                )}
              </Show>

              <Show when={state().message}>
                {(msg) => (
                  <p class="quant-error" role="alert">
                    {msg()}
                    <Button
                      aria-label="关闭"
                      onClick={() => dispatch({ type: "dismiss-message" })}
                      type="button"
                    >
                      <Icon name="x" size={12} />
                    </Button>
                  </p>
                )}
              </Show>
              <Show when={project.loadError ?? submitError()}>
                {(err) => (
                  <p class="quant-error" role="alert">
                    {err()}
                  </p>
                )}
              </Show>

              <Show when={stage()}>
                {(current) => (
                  <>
                    <QuantExplorer
                      draft={draft()}
                      onTable={(table) => dispatch({ type: "set-table", table })}
                      onToners={(toners) => dispatch({ type: "set-toners", toners })}
                      ruleCode={draftOf(state(), 1).code}
                      shareSearch={shareSearch()}
                      stage={current()}
                    />

                    <Show when={current().guided}>
                      <GuidedTonerTask
                        code={draft().code}
                        onCodeChange={(code) => dispatch({ type: "set-code", code })}
                      />
                    </Show>

                    <Show when={!current().guided && current().mode === "pick"}>
                      <ChooseTonersPanel
                        code={draft().code}
                        helperCode={draftOf(state(), 1).code}
                        onCodeChange={(code) => dispatch({ type: "set-code", code })}
                        onToners={(toners) => dispatch({ type: "set-toners", toners })}
                        stage={current()}
                      />
                    </Show>

                    <Show when={!current().guided && current().mode === "free"}>
                      <FreeMapPanel
                        code={draft().code}
                        helperCode={draftOf(state(), 1).code}
                        onCodeChange={(code) => dispatch({ type: "set-code", code })}
                        onTable={(table) => dispatch({ type: "set-table", table })}
                        stage={current()}
                        table={draft().table}
                      />
                    </Show>

                    <div class="quant-submit-row">
                      <Button
                        class="button button-primary"
                        disabled={submitting() || !canSubmit()}
                        onClick={() => void onSubmit()}
                        type="button"
                      >
                        {submitting() ? "判定中…" : "提交判定"}
                      </Button>
                      <span class="quant-submit-note">
                        {current().mode === "pick"
                          ? draft().toners.length
                            ? `将以 ${draft().toners.length} 种粉（编号 ${draft().toners.join(", ")}）把整组图谱印给接收端判定。`
                            : "先选要装哪几种粉。"
                          : draft().table
                            ? "将以你的映射表把整组图谱印给接收端判定。"
                            : "先在下方运行 map_color 生成映射表。"}
                      </span>
                    </div>

                    <Show when={state().judgeOutcome}>
                      {(outcome) => <QuantResultPanel outcome={outcome()} stage={current()} />}
                    </Show>
                  </>
                )}
              </Show>
            </main>
          )}
        </Show>
      </LabPageShell>
    </AppPageLayout>
  );
}
