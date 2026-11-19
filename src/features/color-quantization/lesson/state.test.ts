import { describe, expect, it } from "vitest";
import { createQuantLessonState, draftOf, sanitizeDraft, transitionQuantLesson } from "./state.ts";
import type { QuantJudgeResult } from "../domain/protocol.ts";
import { statusForStage } from "../../../shared/lab/saveStatus.ts";

const fakeOutcome = (over: Partial<QuantJudgeResult>): QuantJudgeResult => ({
  mode: "pick",
  table: [],
  tonersUsed: [],
  slotsUsed: 0,
  slotsBudget: 4,
  overrides: null,
  overrideBudget: null,
  identified: 0,
  total: 0,
  accuracy: 0,
  requiredAccuracy: 1,
  withinBudget: true,
  passed: false,
  counterexample: null,
  confusionPairs: [],
  submissionId: "s",
  currentStage: 1,
  passedStages: [],
  ...over,
});

describe("color-quantization lesson state", () => {
  it("locks stage navigation to sequential progress", () => {
    let s = createQuantLessonState();
    s = transitionQuantLesson(s, { type: "select-stage", stageIndex: 3 });
    expect(s.stageIndex).toBe(1); // stage 3 is locked
    s = transitionQuantLesson(s, {
      type: "judge-result",
      outcome: fakeOutcome({ passed: true, passedStages: [1] }),
    });
    s = transitionQuantLesson(s, { type: "select-stage", stageIndex: 2 });
    expect(s.stageIndex).toBe(2);
  });

  it("records toner picks per stage and marks drafts dirty", () => {
    let s = createQuantLessonState();
    s = transitionQuantLesson(s, { type: "set-toners", toners: [2, 0, 5, 1] });
    expect(draftOf(s).toners).toEqual([0, 1, 2, 5]); // sorted + deduped
    expect(statusForStage(s.saveStatusByStage, s.stageIndex)).toBe("dirty");
  });

  it("keeps drafts separate per stage", () => {
    let s = createQuantLessonState();
    s = transitionQuantLesson(s, { type: "set-toners", toners: [0, 1, 2, 3] });
    s = transitionQuantLesson(s, {
      type: "judge-result",
      outcome: fakeOutcome({ passed: true, passedStages: [1] }),
    });
    s = transitionQuantLesson(s, { type: "select-stage", stageIndex: 2 });
    s = transitionQuantLesson(s, { type: "set-toners", toners: [4, 5, 6, 7] });
    expect(draftOf(s, 1).toners).toEqual([0, 1, 2, 3]);
    expect(draftOf(s, 2).toners).toEqual([4, 5, 6, 7]);
  });

  it("a new pick invalidates the previous verdict", () => {
    let s = createQuantLessonState();
    s = transitionQuantLesson(s, {
      type: "judge-result",
      outcome: fakeOutcome({ passed: true, passedStages: [1] }),
    });
    expect(s.judgeOutcome).not.toBeNull();
    s = transitionQuantLesson(s, { type: "set-toners", toners: [1, 2, 3] });
    expect(s.judgeOutcome).toBeNull();
  });

  it("sanitizeDraft bounds junk at the domain edge", () => {
    expect(sanitizeDraft(null)).toEqual({ toners: [], table: null, code: "" });
    // A malformed subset rejects wholesale rather than silently dropping cells.
    expect(sanitizeDraft({ toners: [0, 99, "x", 2], table: [1, 2], code: 42 })).toEqual({
      toners: [],
      table: null,
      code: "",
    });
    expect(sanitizeDraft({ toners: [2, 0, 2], code: "ok" })).toEqual({
      toners: [0, 2],
      table: null,
      code: "ok",
    });
  });

  it("unlocks all stages with freeNavigation and restores stage 1 on isReset", () => {
    let s = transitionQuantLesson(createQuantLessonState(), {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      drafts: { 2: { toners: [0, 1], table: null, code: "x" } },
      freeNavigation: true,
    });
    s = transitionQuantLesson(s, { type: "select-stage", stageIndex: 3 });
    expect(s.stageIndex).toBe(3);

    const reset = transitionQuantLesson(s, {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      drafts: {},
      freeNavigation: true,
      isReset: true,
    });
    expect(reset.stageIndex).toBe(1);
    expect(reset.freeNavigation).toBe(true);
    expect(draftOf(reset, 2)).toEqual({ toners: [], table: null, code: "" });
    expect(reset.judgeOutcome).toBeNull();
  });
});
