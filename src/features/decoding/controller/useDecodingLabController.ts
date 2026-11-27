import { createEffect, createMemo, createSignal, onSettled, untrack } from "solid-js";
import { createReducer } from "../../../shared/lab/createReducer";
import { statusForStage } from "../../../shared/lab/saveStatus.ts";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject";
import type { PixelHover, PixelMatrix } from "../domain/bmp.ts";
import { assembleCloze, hasCloze } from "../domain/cloze.ts";
import { runData } from "../domain/payload.ts";
import type {
  DecodingDraft,
  DecodingJudgeResult,
  DecodingSubmission,
  LabPayload,
} from "../domain/protocol.ts";
import { friendlyRunError } from "../domain/runErrors.ts";
import { getDecodingStage } from "../domain/stages.ts";
import { sanitizePixels, sanitizeText } from "../domain/verify.ts";
import {
  createDecodingLessonState,
  draftOf,
  isStageUnlocked,
  stageOf,
  transitionDecodingLesson,
  type DecodingLessonAction,
} from "../lesson/state.ts";
import { BMP_HELPER, runDecode, warmPyodide } from "../runtime/pyodideRunner.ts";
import { createDecodingViewModel } from "./createViewModel.ts";
import { useDecodeExecution } from "./useDecodeExecution.ts";
import type {
  DecodingLabActions,
  DecodingRunResult,
  DecodingWorkspaceProps,
  SampleOutcome,
} from "./viewModel.ts";

export type DecodingControllerOptions = {
  scopeId: string;
  ready: boolean;
  userId: string;
  stageLink?: unknown;
  staff?: boolean;
};

export function useDecodingLabController(
  options: DecodingControllerOptions | (() => DecodingControllerOptions),
): DecodingWorkspaceProps {
  const getOpts = typeof options === "function" ? options : () => options;

  const [state, dispatch] = createReducer(
    transitionDecodingLesson,
    createDecodingLessonState(
      1,
      untrack(() => getOpts().staff ?? false),
    ),
  );
  const [submitError, setSubmitError] = createSignal<string | null>(null);
  const [sampleFills, setSampleFills] = createSignal<Record<string, string>>(
    untrack(() => stageOf(state())?.example?.blankDefaults ?? {}),
  );
  const [sampleRevision, setSampleRevision] = createSignal(0);
  const [sampleHover, setSampleHover] = createSignal<PixelHover | null>(null);
  const [wrongPick, setWrongPick] = createSignal<{ promptId: string; option: number } | null>(null);

  const stage = createMemo(() => stageOf(state()));
  const draft = createMemo(() => draftOf(state()));
  const payload = createMemo(() => state().payloads[state().stageIndex]);
  const inputRevision = createMemo(() => state().inputRevisions[state().stageIndex] ?? 0);

  onSettled(() => {
    warmPyodide();
  });

  let clearTransientRef: (() => void) | null = null;

  const project = useLabProject<
    DecodingDraft,
    { payloads: Record<number, LabPayload> },
    DecodingLessonAction
  >(() => {
    const opts = getOpts();
    return {
      scopeId: opts.scopeId,
      labId: "decoding",
      ready: opts.ready,
      stageIndex: state().stageIndex,
      onResetSuccess: () => clearTransientRef?.(),
      toAction: (proj, meta) => ({
        type: "load-project",
        currentStage: proj.currentStage,
        passedStages: proj.passedStages,
        draftRevisions: proj.draftRevisions,
        drafts: Object.fromEntries(
          Object.entries(proj.drafts ?? {}).map(([key, value]) => [Number(key), value]),
        ),
        payloads: proj.payloads ?? {},
        freeNavigation: proj.staffFreeNavigation ?? untrack(getOpts).staff ?? false,
        isReset: meta?.isReset,
      }),
      dispatch,
    };
  });

  const reconcileConflict = (s: number) =>
    reconcileConflictedStage({
      fetchProject: project.fetchProject,
      stageIndex: s,
      onResolved: (stageIndex, proj) =>
        dispatch({
          type: "resolve-save-conflict",
          stageIndex,
          draft: proj.drafts?.[stageIndex],
          revision: proj.draftRevisions?.[stageIndex],
        }),
      onSyncError: (stageIndex) => dispatch({ type: "mark-save-sync-error", stageIndex }),
    });

  useAutosaveDraft<DecodingDraft>(() => {
    const currentState = state();
    return {
      flushPreservedDrafts: project.flushPreservedDrafts,
      saveStatuses: project.projectLoaded ? currentState.saveStatusByStage : undefined,
      scopeId: getOpts().scopeId,
      labId: "decoding",
      saveStatus:
        project.projectLoaded && !project.resetting
          ? statusForStage(currentState.saveStatusByStage, currentState.stageIndex)
          : "idle",
      stageIndex: currentState.stageIndex,
      draftOf: (index) => draftOf(state(), index),
      deps: [currentState.drafts],
      expectedGeneration: project.projectGeneration,
      resetVersion: project.saveGeneration,
      expectedRevisionOf: (s) => state().draftRevisions[s] ?? 0,
      onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
      onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
      onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
      onConflict: (s) => reconcileConflict(s),
    };
  });

  const decodeExec = useDecodeExecution<DecodingRunResult>(() => ({
    stageIndex: state().stageIndex,
    inputRevision: inputRevision(),
    describeError: (error) =>
      friendlyRunError(error instanceof Error ? error.message : String(error)),
  }));
  const previewExec = useDecodeExecution<PixelMatrix>(() => ({
    stageIndex: state().stageIndex,
    inputRevision: 0,
  }));
  const sampleExec = useDecodeExecution<SampleOutcome>(() => ({
    stageIndex: state().stageIndex,
    inputRevision: sampleRevision(),
  }));

  const clearTransientRuns = (stageIndex: number) => {
    decodeExec.clear();
    previewExec.clear();
    sampleExec.clear();
    project.invalidateJudge();
    setSubmitError(null);
    setSampleHover(null);
    setWrongPick(null);
    setSampleRevision(0);
    setSampleFills(getDecodingStage(stageIndex)?.example?.blankDefaults ?? {});
  };
  clearTransientRef = () => clearTransientRuns(untrack(() => state().stageIndex));

  let lastStageIndex = untrack(() => state().stageIndex);
  createEffect(
    () => state().stageIndex,
    (stageIndex) => {
      if (stageIndex === lastStageIndex) return;
      lastStageIndex = stageIndex;
      clearTransientRuns(stageIndex);
    },
  );

  let stageLinkApplied = false;
  createEffect(
    () => project.projectLoaded,
    (loaded) => {
      if (stageLinkApplied || !loaded) return;
      stageLinkApplied = true;
      const wanted = Number(untrack(() => getOpts().stageLink));
      if (Number.isInteger(wanted) && isStageUnlocked(untrack(state), wanted)) {
        dispatch({ type: "select-stage", stageIndex: wanted });
      }
    },
  );

  const model = createMemo(() => {
    const currentStage = stage();
    const running = decodeExec.running || previewExec.running || sampleExec.running;
    return createDecodingViewModel({
      state: state(),
      userId: getOpts().userId,
      running,
      lastRun: decodeExec.result,
      runError: decodeExec.error ?? previewExec.error,
      preview: previewExec.result,
      sampleFills: sampleFills(),
      samplePrintout: sampleExec.result?.stdout ?? null,
      samplePixels: sampleExec.result?.pixels ?? null,
      samplePrintError:
        sampleExec.error ??
        (sampleExec.result &&
        (currentStage?.kind === "bmp" || currentStage?.kind === "bmp-script") &&
        !sampleExec.result.pixels
          ? "样例 data 没有解出合法的像素矩阵。"
          : null),
      sampleHover: sampleHover(),
      wrongPick: wrongPick(),
      submitting: project.submittingJudge || project.resetting,
      loadError: project.loadError ?? null,
      submitError: submitError(),
    });
  });

  const run = () => {
    const currentStage = untrack(stage);
    const currentPayload = untrack(payload);
    const currentEditor = untrack(model).editor;
    if (!currentStage || !currentPayload || currentPayload.kind === "files" || !currentEditor) {
      return;
    }
    if (currentEditor.cloze && !currentEditor.complete) {
      decodeExec.fail("还有空没填上，每个空都要填。");
      return;
    }
    const { source } = currentEditor;
    const kind = currentStage.kind;
    const data = runData(currentPayload);
    void decodeExec.execute(async () => {
      const preamble = kind === "bmp-script" ? BMP_HELPER : undefined;
      const result = await runDecode(source, data, { preamble });
      if (kind === "bmp") {
        const pixels = sanitizePixels(result);
        if (!pixels) {
          throw new Error("decode 要返回像素二维列表：pixels[y][x] = [R, G, B]，每个分量 0～255。");
        }
        return { pixels } as DecodingRunResult;
      }
      const text = sanitizeText(result);
      if (!text) throw new Error("decode 要返回一个字符串（1～200 个字符）。");
      return { text } as DecodingRunResult;
    });
  };

  const runPreview = () => {
    const currentStage = untrack(stage);
    const currentPayload = untrack(payload);
    if (!currentPayload || currentPayload.kind !== "bmp" || currentStage?.kind !== "bmp-script") {
      return;
    }
    void previewExec.execute(async () => {
      const result = await runDecode("", runData(currentPayload), {
        preamble: BMP_HELPER,
        call: "decode_bmp(data)",
      });
      const clean = sanitizePixels(result);
      if (!clean) throw new Error("预览解码没有得到合法的像素列表。");
      return clean;
    });
  };

  const printExample = () => {
    const currentStage = untrack(stage);
    if (!currentStage?.example?.run) return;
    const expectImage = currentStage.kind === "bmp" || currentStage.kind === "bmp-script";
    const input = currentStage.example.input;
    const currentFills = untrack(sampleFills);
    setSampleHover(null);
    void sampleExec.execute(async () => {
      const source = hasCloze(input) ? assembleCloze(input, currentFills) : input;
      const outcome = await runDecode(source, null, {
        call: expectImage ? "decode_bmp(data)" : "None",
        captureStdout: true,
        preamble: expectImage ? BMP_HELPER : undefined,
        useCodeData: true,
      });
      if (typeof outcome !== "object" || outcome === null || !("stdout" in outcome)) {
        throw new Error("没有捕获到 print 输出。");
      }
      const { stdout, result: value } = outcome as { stdout: unknown; result: unknown };
      const pixels = expectImage ? sanitizePixels(value) : null;
      return { stdout: String(stdout), pixels };
    });
  };

  const onSubmit = async () => {
    const scopeId = untrack(getOpts).scopeId;
    const currentStage = untrack(stage);
    const currentPayload = untrack(payload);
    const currentModel = untrack(model);
    const currentDraft = untrack(draft);
    if (!scopeId || !currentStage || !currentPayload) return;
    const blocker = currentModel.submission.blocker;
    if (blocker) {
      dispatch({ type: "message", text: blocker });
      return;
    }
    const submittedStage = currentStage.index;
    const submittedRevision = untrack(inputRevision);
    setSubmitError(null);
    const lastRun = untrack(() => decodeExec.result);
    const artifact =
      currentStage.kind === "files"
        ? { verdicts: currentDraft.verdicts }
        : currentStage.kind === "bmp"
          ? { pixels: lastRun && "pixels" in lastRun ? lastRun.pixels : [] }
          : { text: lastRun && "text" in lastRun ? lastRun.text : "" };
    const submission: DecodingSubmission = {
      stageIndex: currentStage.index,
      artifact,
      code: currentModel.editor?.cloze
        ? currentModel.editor.source
        : currentDraft.code || undefined,
      conceptAnswers:
        currentStage.prompts && currentStage.prompts.length > 0
          ? currentDraft.conceptAnswers
          : undefined,
    };
    const response = await project.postJudge<DecodingJudgeResult>(submission, {
      isStillCurrent: () =>
        untrack(() => state().stageIndex) === submittedStage &&
        untrack(inputRevision) === submittedRevision,
    });
    if (response.status === "applied") {
      const outcome = response.outcome;
      dispatch({ type: "judge-result", outcome });
      if (!outcome.passed) {
        dispatch({ type: "message", text: "判定未通过。看看右侧每一项的检查结果。" });
      }
    } else if (response.status === "error") {
      setSubmitError(response.error);
    }
  };

  const actions: DecodingLabActions = {
    selectStage: (stageIndex) => {
      const currentState = untrack(state);
      const nextState = transitionDecodingLesson(currentState, {
        type: "select-stage",
        stageIndex,
      });
      dispatch({ type: "select-stage", stageIndex });
      if (nextState.stageIndex !== currentState.stageIndex) {
        lastStageIndex = nextState.stageIndex;
        clearTransientRuns(nextState.stageIndex);
      }
    },
    dismissMessage: () => dispatch({ type: "dismiss-message" }),
    setFill: (blankId, value) => dispatch({ type: "set-fill", blankId, value }),
    setSampleFill: (blankId, value) => {
      setSampleFills((prev) => ({ ...prev, [blankId]: value }));
      setSampleRevision((rev) => rev + 1);
    },
    setSampleHover,
    run,
    runPreview,
    printExample,
    answerPrompt: (promptId, option) => {
      setWrongPick(null);
      dispatch({ type: "answer-prompt", promptId, option });
      const prompt = untrack(stage)?.prompts?.find((p) => p.id === promptId);
      if (prompt && !prompt.options[option]?.correct) {
        setWrongPick({ promptId, option });
      }
    },
    setVerdict: (fileIndex, verdict, expectDecoder) =>
      dispatch({
        type: "set-verdict",
        fileIndex,
        stageIndex: untrack(() => state().stageIndex),
        verdict,
        expectDecoder,
      }),
    submit: onSubmit,
    restoreConflictLocal: () =>
      dispatch({ type: "restore-conflict-draft", stageIndex: untrack(() => state().stageIndex) }),
    discardConflictLocal: () =>
      dispatch({ type: "discard-conflict-draft", stageIndex: untrack(() => state().stageIndex) }),
    retrySyncConflict: () => reconcileConflict(untrack(() => state().stageIndex)),
  };

  return {
    get model() {
      return model();
    },
    actions,
    resetControls: project.resetControls,
  };
}
