/**
 * Decoding lab controller: owns persistence (project load + autosave),
 * lesson transitions, the Pyodide execution channels and judging — the
 * workspace only sees the view model and user-intent actions.
 */

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
  /** Raw `?stage=` search value — applied once, after the project loads. */
  stageLink?: unknown;
  /** Staff accounts (teacher / admin) unlock free stage navigation + self-reset. */
  staff?: boolean;
}): DecodingWorkspaceProps {
  const [state, dispatch] = useReducer(transitionDecodingLesson, undefined, () =>
    createDecodingLessonState(1, staff),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sampleFills, setSampleFills] = useState<Record<string, string>>(
    () => stageOf(state)?.example?.blankDefaults ?? {},
  );
  // The sample generator's own input version — an edit to its blanks makes
  // any in-flight or stored printout stale, same rule as the decoder draft.
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
    staffControls,
  } = useLabProject<DecodingDraft, { payloads: Record<number, LabPayload> }, DecodingLessonAction>({
    classId,
    labId: "decoding",
    ready,
    staff,
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

  useAutosaveDraft<DecodingDraft>({
    classId,
    labId: "decoding",
    // While the (new class's) project is loading the flags on screen still
    // belong to the previous context — nothing may schedule writes for it.
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
    // The server dropped this write because a newer one already exists
    // elsewhere: refetch so local state reconciles to the winning draft,
    // then flag the conflict briefly on the stage.
    onConflict: (s) => reconcileConflict(s),
  });

  // Execution channels: the student decode run is versioned by the draft
  // input; the bmp preview by its (per-stage fixed) payload; the sample
  // generator by its own fills. Each drops results that went stale.
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
  decodeExecRef.current = () => clearTransientRuns(1);

  // Switching stage drops the working results — each stage's artifact is
  // its own; channel stamps make an in-flight completion unable to land here.
  useEffect(() => {
    clearTransientRuns(state.stageIndex);
  }, [state.stageIndex]);

  // A shared ?stage=N link opens that stage once, after the project loads
  // (locked or out-of-range targets fall through to the saved position).
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
    // Decode and preview errors share one slot, as before the split.
    runError: decodeExec.error ?? previewExec.error,
    preview: previewExec.result,
    sampleFills,
    samplePrintout: sampleExec.result?.stdout ?? null,
    samplePixels: sampleExec.result?.pixels ?? null,
    // The generator's printout is kept even when its pixels fail the check —
    // same pairing the old page produced by setting printout before throwing.
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

  // The sample generator's printout is the stage's sample input; on BMP
  // stages decoding that same `data` in the same run yields the sample
  // output image.
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
      // The response lands only while the submit still describes the stage
      // and draft on screen — an edit mid-flight retires it like a stale run.
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
      // answer-prompt only records correct picks — a miss is the wrong pick.
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
  return { model, actions, staffControls };
}
