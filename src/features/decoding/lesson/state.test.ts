import { describe, expect, it } from "vitest";
import {
  DECODING_CORE_STAGES,
  DECODING_STAGES,
  decodingStageUnlocked,
  getDecodingStage,
  nextDecodingStage,
} from "../domain/stages.ts";
import {
  allPromptsAnswered,
  createDecodingLessonState,
  draftOf,
  sanitizeDraft,
  transitionDecodingLesson,
  type DecodingLessonState,
} from "./state.ts";

function loaded(passedStages: number[] = []): DecodingLessonState {
  return transitionDecodingLesson(createDecodingLessonState(1), {
    type: "load-project",
    currentStage: Math.max(...passedStages, 0) + 1,
    passedStages,
    drafts: {},
    payloads: {},
  });
}

describe("decoding lesson state", () => {
  it("records a concept answer only when the option is correct", () => {
    const state = loaded();
    const stage = getDecodingStage(1)!;
    const prompt = stage.prompts![0];
    const correctIndex = prompt.options.findIndex((o) => o.correct);
    const wrongIndex = prompt.options.findIndex((o) => !o.correct);

    const afterWrong = transitionDecodingLesson(state, {
      type: "answer-prompt",
      promptId: prompt.id,
      option: wrongIndex,
    });
    expect(draftOf(afterWrong).conceptAnswers[prompt.id]).toBeUndefined();

    const afterRight = transitionDecodingLesson(state, {
      type: "answer-prompt",
      promptId: prompt.id,
      option: correctIndex,
    });
    expect(draftOf(afterRight).conceptAnswers[prompt.id]).toBe(correctIndex);
  });

  it("requires every concept prompt answered before submit", () => {
    let state = loaded();
    expect(allPromptsAnswered(state)).toBe(false);
    for (const prompt of getDecodingStage(1)!.prompts!) {
      const correctIndex = prompt.options.findIndex((o) => o.correct);
      state = transitionDecodingLesson(state, {
        type: "answer-prompt",
        promptId: prompt.id,
        option: correctIndex,
      });
    }
    expect(allPromptsAnswered(state)).toBe(true);
  });

  it("gates stage selection by the unlock rules", () => {
    const locked = loaded();
    // Stage 4 unlocks after 3; stage 2 unlocks linearly after 1.
    expect(
      transitionDecodingLesson(locked, { type: "select-stage", stageIndex: 4 }).stageIndex,
    ).toBe(1);
    const after3 = loaded([1, 2, 3]);
    expect(
      transitionDecodingLesson(after3, { type: "select-stage", stageIndex: 4 }).stageIndex,
    ).toBe(4);
    // Side stages also key on stage 3.
    expect(
      transitionDecodingLesson(after3, { type: "select-stage", stageIndex: 5 }).stageIndex,
    ).toBe(5);
    expect(
      transitionDecodingLesson(after3, { type: "select-stage", stageIndex: 6 }).stageIndex,
    ).toBe(6);
    // …but not before it.
    expect(
      transitionDecodingLesson(locked, { type: "select-stage", stageIndex: 5 }).stageIndex,
    ).toBe(1);
  });

  it("stores cloze fills in the draft", () => {
    let state = loaded();
    state = transitionDecodingLesson(state, {
      type: "set-fill",
      blankId: "1",
      value: "chr(code)",
    });
    expect(draftOf(state).fills).toEqual({ "1": "chr(code)" });
  });

  it("stores per-file verdicts in the draft", () => {
    let state = loaded([1, 2, 3]);
    state = transitionDecodingLesson(state, { type: "select-stage", stageIndex: 4 });
    state = transitionDecodingLesson(state, {
      type: "set-verdict",
      fileIndex: 0,
      stageIndex: 4,
      verdict: { decoder: "text", text: "OK" },
    });
    expect(draftOf(state).verdicts[0]).toEqual({ decoder: "text", text: "OK" });
    // A run finishing after the stage switch must not write into it.
    const after = transitionDecodingLesson(state, {
      type: "set-verdict",
      fileIndex: 0,
      stageIndex: 5,
      verdict: { decoder: "image" },
    });
    expect(after).toBe(state);
    // Sync writes land only while the pin still matches the ran decoder.
    const repinned = transitionDecodingLesson(state, {
      type: "set-verdict",
      fileIndex: 0,
      stageIndex: 4,
      verdict: { decoder: "text", text: "STALE" },
      expectDecoder: "image",
    });
    expect(repinned).toBe(state);
  });

  it("advances currentStage on a passed judge result", () => {
    let state = loaded();
    state = transitionDecodingLesson(state, {
      type: "judge-result",
      outcome: {
        passed: true,
        parts: [],
        submissionId: "s1",
        currentStage: 2,
        passedStages: [1],
      },
    });
    expect(state.passedStages).toEqual([1]);
    expect(state.currentStage).toBe(2);
  });

  it("sanitizes a restored draft at the boundary", () => {
    expect(sanitizeDraft(null)).toEqual({
      code: "",
      fills: {},
      conceptAnswers: {},
      verdicts: [],
    });
    const draft = sanitizeDraft({
      code: "x".repeat(20000),
      signature: "BM",
      conceptAnswers: { a: 0, b: "nope", c: -1, d: 2 },
      verdicts: [{ decoder: "text", text: "hi" }, { decoder: "nope" }, null, "junk"],
    });
    expect(draft.code.length).toBe(12000);
    expect(draft.conceptAnswers).toEqual({ a: 0, d: 2 });
    expect(draft.verdicts[0]).toEqual({ decoder: "text", text: "hi" });
    expect(draft.verdicts.slice(1)).toEqual([null, null, null]);
  });

  it("sanitizes cloze fills at the boundary", () => {
    const draft = sanitizeDraft({
      fills: { "1": "  ok  ", "this-id-is-way-too-long": "x", bad: 7 },
    });
    expect(draft.fills).toEqual({ "1": "  ok  ", "this-id-is-way-t": "x" });
  });
});

describe("stage table", () => {
  it("keeps core stages 1-3 and side stages 4-6 all anchored after stage 3", () => {
    expect(DECODING_STAGES.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(DECODING_CORE_STAGES.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(getDecodingStage(4)!.railAfter).toBe(3);
    expect(getDecodingStage(5)!.railAfter).toBe(3);
    expect(getDecodingStage(6)!.railAfter).toBe(3);
    expect(decodingStageUnlocked([1, 2], 4)).toBe(false);
    expect(decodingStageUnlocked([1, 2, 3], 4)).toBe(true);
  });

  it("walks the mainline pointer through core first, then into side stages", () => {
    expect(nextDecodingStage([])).toBe(1);
    expect(nextDecodingStage([1, 2])).toBe(3);
    // Mainline done at 3 — the pointer flows into the first unpassed challenge.
    expect(nextDecodingStage([1, 2, 3])).toBe(4);
    expect(nextDecodingStage([1, 2, 3, 5])).toBe(4);
    expect(nextDecodingStage([1, 2, 3, 4, 5, 6])).toBe(7);
  });

  it("unlocks all stages under freeNavigation and clears drafts + transient state on isReset", () => {
    const staffLoaded = transitionDecodingLesson(createDecodingLessonState(1), {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      drafts: { 1: { code: "", fills: { "1": "ord(c)" }, conceptAnswers: {}, verdicts: [] } },
      payloads: {},
      freeNavigation: true,
    });
    const jumped = transitionDecodingLesson(staffLoaded, { type: "select-stage", stageIndex: 6 });
    expect(jumped.stageIndex).toBe(6);

    const afterReset = transitionDecodingLesson(jumped, {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      drafts: {},
      payloads: {},
      freeNavigation: true,
      isReset: true,
    });
    expect(afterReset.stageIndex).toBe(1);
    expect(afterReset.freeNavigation).toBe(true);
    expect(draftOf(afterReset, 1).fills).toEqual({});
    expect(afterReset.judgeOutcome).toBeNull();
  });
});
