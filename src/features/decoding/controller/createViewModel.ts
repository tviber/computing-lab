/**
 * Pure derivation of the decoding lab view model — shared by the live
 * controller and the deterministic preview fixtures. Everything the page
 * renders is computed here from lesson state + execution channel outputs.
 */

import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
import { decodeBmp, pixelDiffCount, type PixelHover, type PixelMatrix } from "../domain/bmp.ts";
import { assembleCloze, clozeComplete, hasCloze } from "../domain/cloze.ts";
import type { DecodingDraft, LabPayload } from "../domain/protocol.ts";
import { seedFor } from "../domain/rng.ts";
import {
  DECODING_CORE_STAGES,
  DECODING_STAGES,
  decodingStageUnlocked,
  getDecodingStage,
  nextDecodingStage,
  starterCodeFor,
  type DecodingStageDef,
} from "../domain/stages.ts";
import {
  allPromptsAnswered,
  answeredPromptIds,
  draftOf,
  stageOf,
  type DecodingLessonState,
} from "../lesson/state.ts";
import type { DecodingLabViewModel, DecodingRunResult, DecodingStageItem } from "./viewModel.ts";

export function createDecodingViewModel(input: {
  state: DecodingLessonState;
  userId: string;
  running: boolean;
  lastRun: DecodingRunResult | null;
  runError: string | null;
  preview: PixelMatrix | null;
  sampleFills: Record<string, string>;
  samplePrintout: string | null;
  samplePixels: PixelMatrix | null;
  samplePrintError: string | null;
  sampleHover: PixelHover | null;
  wrongPick: { promptId: string; option: number } | null;
  submitting: boolean;
  loadError: string | null;
  submitError: string | null;
}): DecodingLabViewModel {
  const { state } = input;
  const stage = stageOf(state);
  const draft = draftOf(state);
  const payload = state.payloads[state.stageIndex];

  // Same seed stream as the payload, namespaced: neighbours see different
  // cloze templates, so a copied fill doesn't fit the next desk's blanks.
  const template =
    stage && input.userId
      ? starterCodeFor(stage, seedFor(input.userId, "decoding-cloze", stage.index))
      : (stage?.starterCode ?? "");
  const cloze = hasCloze(template);
  const complete = !cloze || clozeComplete(template, draft.fills);
  const source = template
    ? cloze
      ? assembleCloze(template, draft.fills)
      : draft.code.trim() || template
    : "";

  const targetPixels = payload?.kind === "bmp" ? decodeBmp(payload.bytes) : null;
  const lastRun = input.lastRun;
  const pixelDiff =
    lastRun && "pixels" in lastRun && targetPixels
      ? pixelDiffCount(lastRun.pixels, targetPixels)
      : null;

  const stageItem = (s: (typeof DECODING_STAGES)[number]): DecodingStageItem => ({
    id: s.id,
    index: s.index,
    title: s.title,
    englishTitle: s.englishTitle,
    active: s.index === state.stageIndex,
    passed: state.passedStages.includes(s.index),
    unlocked: state.freeNavigation || decodingStageUnlocked(state.passedStages, s.index),
  });

  const blocker = submitBlocker(state, stage, payload, cloze, complete, draft, lastRun);
  const next = nextDecodingStage(state.passedStages);

  return {
    stage: stage ?? null,
    stagePassed: stage ? state.passedStages.includes(stage.index) : false,
    rail: {
      corePassed: DECODING_CORE_STAGES.filter((s) => state.passedStages.includes(s.index)).length,
      coreTotal: DECODING_CORE_STAGES.length,
      core: DECODING_CORE_STAGES.map((s) => ({
        stage: stageItem(s),
        challenges: DECODING_STAGES.filter(
          (c) => c.track === "challenge" && c.railAfter === s.index,
        ).map(stageItem),
      })),
      challenges: DECODING_STAGES.filter(
        (s) => s.track === "challenge" && s.railAfter === undefined,
      ).map(stageItem),
    },
    feedback: {
      saveStatus: statusForStage(state.saveStatusByStage, state.stageIndex),
      unresolvedSyncConflict: syncConflictForStage(state.unresolvedSyncConflicts, state.stageIndex),
      conflictLocalAvailable: state.conflictedLocalDrafts[state.stageIndex] !== undefined,
      message: state.message,
      error: input.loadError ?? input.submitError,
    },
    payload: payload ?? null,
    verdicts: draft.verdicts,
    editor:
      stage && payload && payload.kind !== "files"
        ? {
            template,
            source,
            fills: draft.fills,
            cloze,
            complete,
            running: input.running,
            sampleFills: input.sampleFills,
          }
        : null,
    output:
      stage && payload && payload.kind !== "files"
        ? {
            runError: input.runError,
            preview: input.preview,
            lastRun,
            targetPixels,
            pixelDiff,
            sample: {
              printout: input.samplePrintout,
              pixels: input.samplePixels,
              error: input.samplePrintError,
              hover: input.sampleHover,
            },
          }
        : null,
    concepts: { answered: answeredPromptIds(state), wrongPick: input.wrongPick },
    submission: { submitting: input.submitting, blocker },
    judge: state.judgeOutcome
      ? {
          outcome: state.judgeOutcome,
          nextStageIndex: getDecodingStage(next) ? next : null,
        }
      : null,
  };
}

/** What blocks the 提交判定 button, as a student-readable reason. */
function submitBlocker(
  state: DecodingLessonState,
  stage: DecodingStageDef | undefined,
  payload: LabPayload | undefined,
  cloze: boolean,
  complete: boolean,
  draft: DecodingDraft,
  lastRun: DecodingRunResult | null,
): string | null {
  if (!stage || !payload) return "数据还没载入，稍等。";
  if (!allPromptsAnswered(state)) return "概念题还没答完。";
  if (cloze && !complete) return "还有空没填上——每个空都要填。";
  switch (stage.kind) {
    case "files":
      return payload.kind === "files" &&
        draft.verdicts.filter(Boolean).length === payload.files.length
        ? null
        : "每个文件都要先给出判定。";
    case "bmp":
      return lastRun && "pixels" in lastRun ? null : "先运行你的 decode，得到像素结果。";
    default:
      return lastRun && "text" in lastRun ? null : "先运行你的 decode，得到解码结果。";
  }
}
