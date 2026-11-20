import { useCallback, useEffect, useReducer, useRef, useState } from "react";
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

export function useDecodingLabController({
  classId,
  ready,
  userId,
  stageLink,
  staff = false,
}: {
  classId: string;
  ready: boolean;
  userId: string;
  stageLink?: unknown;
  staff?: boolean;
}): DecodingWorkspaceProps {
  const [state, dispatch] = useReducer(transitionDecodingLesson, undefined, () =>
    createDecodingLessonState(1, staff),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sampleFills, setSampleFills] = useState<Record<string, string>>(
    () => stageOf(state)?.example?.blankDefaults ?? {},
  );
  const [sampleRevision, setSampleRevision] = useState(0);
  const [sampleHover, setSampleHover] = useState<PixelHover | null>(null);
  const [wrongPick, setWrongPick] = useState<{ promptId: string; option: number } | null>(null);

  const stage = stageOf(state);
  const draft = draftOf(state);
  const payload = state.payloads[state.stageIndex];
  const inputRevision = state.inputRevisions[state.stageIndex] ?? 0;

  const stageIndexRef = useRef(state.stageIndex);
  stageIndexRef.current = state.stageIndex;
  const inputRevisionRef = useRef(inputRevision);
  inputRevisionRef.current = inputRevision;

  useEffect(() => warmPyodide(), []);

  const decodeExecRef = useRef<(() => void) | null>(null);

  const {
    projectLoaded,
    loadError,
    fetchProject,
    postJudge,
    invalidateJudge,
    submittingJudge,
    projectGeneration,
    resetting,
    saveGeneration,
    resetControls,
    flushPreservedDrafts,
  } = useLabProject<DecodingDraft, { payloads: Record<number, LabPayload> }, DecodingLessonAction>({
    classId,
    labId: "decoding",
    ready,
    stageIndex: state.stageIndex,
    onResetSuccess: () => decodeExecRef.current?.(),
    toAction: (project, meta) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      draftRevisions: project.draftRevisions,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
      payloads: project.payloads ?? {},
      freeNavigation: project.staffFreeNavigation ?? staff,
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

  useAutosaveDraft<DecodingDraft>({
    flushPreservedDrafts,
    saveStatuses: projectLoaded ? state.saveStatusByStage : undefined,
    classId,
    labId: "decoding",
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

  const decodeExec = useDecodeExecution<DecodingRunResult>({
    stageIndex: state.stageIndex,
    inputRevision,
    describeError: (error) =>
      friendlyRunError(error instanceof Error ? error.message : String(error)),
  });
  const previewExec = useDecodeExecution<PixelMatrix>({
    stageIndex: state.stageIndex,
    inputRevision: 0,
  });
  const sampleExec = useDecodeExecution<SampleOutcome>({
    stageIndex: state.stageIndex,
    inputRevision: sampleRevision,
  });
  const running = decodeExec.running || previewExec.running || sampleExec.running;

  const clearTransientRuns = (stageIndex: number) => {
    decodeExec.clear();
    previewExec.clear();
    sampleExec.clear();
    invalidateJudge();
    setSubmitError(null);
    setSampleHover(null);
    setWrongPick(null);
    setSampleRevision(0);
    setSampleFills(getDecodingStage(stageIndex)?.example?.blankDefaults ?? {});
  };
  decodeExecRef.current = () => clearTransientRuns(state.stageIndex);

  useEffect(() => {
    clearTransientRuns(state.stageIndex);
  }, [state.stageIndex]);

  const stageLinkApplied = useRef(false);
  useEffect(() => {
    if (stageLinkApplied.current || !projectLoaded) return;
    stageLinkApplied.current = true;
    const wanted = Number(stageLink);
    if (Number.isInteger(wanted) && isStageUnlocked(state, wanted)) {
      dispatch({ type: "select-stage", stageIndex: wanted });
    }
  }, [projectLoaded]);

  const model = createDecodingViewModel({
    state,
    userId,
    running,
    lastRun: decodeExec.result,
    runError: decodeExec.error ?? previewExec.error,
    preview: previewExec.result,
    sampleFills,
    samplePrintout: sampleExec.result?.stdout ?? null,
    samplePixels: sampleExec.result?.pixels ?? null,
    samplePrintError:
      sampleExec.error ??
      (sampleExec.result &&
      (stage?.kind === "bmp" || stage?.kind === "bmp-script") &&
      !sampleExec.result.pixels
        ? "样例 data 没有解出合法的像素矩阵。"
        : null),
    sampleHover,
    wrongPick,
    submitting: submittingJudge || resetting,
    loadError: loadError ?? null,
    submitError,
  });

  const run = useCallback(() => {
    if (!stage || !payload || payload.kind === "files" || !model.editor) return;
    if (model.editor.cloze && !model.editor.complete) {
      decodeExec.fail("还有空没填上——每个空都要填。");
      return;
    }
    const { source } = model.editor;
    const kind = stage.kind;
    const data = runData(payload);
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
  }, [stage, payload, model.editor, decodeExec]);

  const runPreview = useCallback(() => {
    if (!payload || payload.kind !== "bmp" || stage?.kind !== "bmp-script") return;
    void previewExec.execute(async () => {
      const result = await runDecode("", runData(payload), {
        preamble: BMP_HELPER,
        call: "decode_bmp(data)",
      });
      const clean = sanitizePixels(result);
      if (!clean) throw new Error("预览解码没有得到合法的像素列表。");
      return clean;
    });
  }, [payload, stage, previewExec]);

  const printExample = useCallback(() => {
    if (!stage?.example?.run) return;
    const expectImage = stage.kind === "bmp" || stage.kind === "bmp-script";
    const input = stage.example.input;
    setSampleHover(null);
    void sampleExec.execute(async () => {
      const source = hasCloze(input) ? assembleCloze(input, sampleFills) : input;
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
  }, [stage, sampleFills, sampleExec]);

  const onSubmit = useCallback(async () => {
    if (!classId || !stage || !payload) return;
    const blocker = model.submission.blocker;
    if (blocker) {
      dispatch({ type: "message", text: blocker });
      return;
    }
    const submittedStage = stage.index;
    const submittedRevision = inputRevision;
    setSubmitError(null);
    const lastRun = decodeExec.result;
    const artifact =
      stage.kind === "files"
        ? { verdicts: draft.verdicts }
        : stage.kind === "bmp"
          ? { pixels: lastRun && "pixels" in lastRun ? lastRun.pixels : [] }
          : { text: lastRun && "text" in lastRun ? lastRun.text : "" };
    const submission: DecodingSubmission = {
      stageIndex: stage.index,
      artifact,
      code: model.editor?.cloze ? model.editor.source : draft.code || undefined,
      conceptAnswers: stage.prompts && stage.prompts.length > 0 ? draft.conceptAnswers : undefined,
    };
    const response = await postJudge<DecodingJudgeResult>(submission, {
      isStillCurrent: () =>
        stageIndexRef.current === submittedStage && inputRevisionRef.current === submittedRevision,
    });
    if (response.status === "applied") {
      const outcome = response.outcome;
      dispatch({ type: "judge-result", outcome });
      if (!outcome.passed) {
        dispatch({ type: "message", text: "判定未通过——看看右侧每一项的检查结果。" });
      }
    } else if (response.status === "error") {
      setSubmitError(response.error);
    }
  }, [classId, stage, payload, model, draft, inputRevision, decodeExec.result, postJudge]);

  const actions: DecodingLabActions = {
    selectStage: (stageIndex) => dispatch({ type: "select-stage", stageIndex }),
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
      const prompt = stage?.prompts?.find((p) => p.id === promptId);
      if (prompt && !prompt.options[option]?.correct) {
        setWrongPick({ promptId, option });
      }
    },
    setVerdict: (fileIndex, verdict, expectDecoder) =>
      dispatch({
        type: "set-verdict",
        fileIndex,
        stageIndex: state.stageIndex,
        verdict,
        expectDecoder,
      }),
    submit: onSubmit,
    restoreConflictLocal: () =>
      dispatch({ type: "restore-conflict-draft", stageIndex: state.stageIndex }),
    discardConflictLocal: () =>
      dispatch({ type: "discard-conflict-draft", stageIndex: state.stageIndex }),
    retrySyncConflict: () => reconcileConflict(state.stageIndex),
  };
  return { model, actions, resetControls };
}
